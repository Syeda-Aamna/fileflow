import { randomUUID } from "node:crypto";
import { isUtf8 } from "node:buffer";
import type { Express, NextFunction, Request, Response } from "express";
import multer, { type FileFilterCallback } from "multer";
import { fileTypeFromBuffer } from "file-type";
import { addPublicFile, listPublicFiles } from "../files";
import { storagePut } from "../storage";

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_DISPLAY_NAME = 180;

const ALLOWED_EXTENSIONS = new Set([
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".txt",
  ".csv",
  ".md",
  ".zip",
]);
const TEXT_MIME_BY_EXTENSION: Record<string, string> = {
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".md": "text/markdown",
};
const MIME_BY_EXTENSION: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".zip": "application/zip",
};

class UploadValidationError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = "UploadValidationError";
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
    fields: 0,
    parts: 1,
  },
  fileFilter: (
    _req: Request,
    file: Express.Multer.File,
    callback: FileFilterCallback
  ) => {
    const extension = getExtension(file.originalname);
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      callback(
        new UploadValidationError(
          "This file type is not supported. Try a PDF, image, text/CSV/Markdown file, or ZIP archive.",
          415
        )
      );
      return;
    }
    callback(null, true);
  },
});

function getExtension(name: string): string {
  const leaf = name.replace(/\\/g, "/").split("/").pop() ?? "";
  const dot = leaf.lastIndexOf(".");
  return dot < 0 ? "" : leaf.slice(dot).toLowerCase();
}

function sanitizeDisplayName(name: string): string {
  const leaf = name.replace(/\\/g, "/").split("/").pop() ?? "";
  const cleaned = leaf
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^\p{L}\p{N}._ -]/gu, "_")
    .replace(/\s+/g, " ")
    .replace(/^[. ]+|[. ]+$/g, "")
    .slice(0, MAX_DISPLAY_NAME);
  return cleaned || "shared-file";
}

async function validateFile(file: Express.Multer.File): Promise<string> {
  const extension = getExtension(file.originalname);
  const textMime = TEXT_MIME_BY_EXTENSION[extension];

  if (textMime) {
    if (
      file.buffer.length === 0 ||
      !isUtf8(file.buffer) ||
      file.buffer.includes(0)
    ) {
      throw new UploadValidationError(
        "That text file is empty or is not valid UTF-8 text.",
        415
      );
    }
    return textMime;
  }

  const detected = await fileTypeFromBuffer(file.buffer);
  const expectedMime = MIME_BY_EXTENSION[extension];
  if (!detected || !expectedMime || detected.mime !== expectedMime) {
    throw new UploadValidationError(
      "The file content does not match its filename type.",
      415
    );
  }
  return detected.mime;
}

function sendMulterError(error: unknown, response: Response): boolean {
  if (error instanceof UploadValidationError) {
    response.status(error.statusCode).json({ error: error.message });
    return true;
  }
  if (error instanceof multer.MulterError) {
    const tooLarge = error.code === "LIMIT_FILE_SIZE";
    const message = tooLarge
      ? "This file is larger than the 50 MB upload limit."
      : "Please upload one file at a time using the file picker.";
    response.status(tooLarge ? 413 : 400).json({ error: message });
    return true;
  }
  return false;
}

export function registerFileRoutes(app: Express): void {
  app.get("/api/files", async (_request: Request, response: Response) => {
    try {
      const library = await listPublicFiles();
      response.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
      response.json(library);
    } catch (error) {
      console.error("[files] Could not load public file library:", error);
      response
        .status(503)
        .json({ error: "The public library is temporarily unavailable." });
    }
  });

  app.post(
    "/api/files",
    (request: Request, response: Response, next: NextFunction) => {
      upload.single("file")(request, response, async (error: unknown) => {
        if (error && sendMulterError(error, response)) return;
        if (error) return next(error);

        try {
          const file = request.file;
          if (!file) {
            response
              .status(400)
              .json({ error: "Choose a file before uploading." });
            return;
          }

          const fileType = await validateFile(file);
          const fileName = sanitizeDisplayName(file.originalname);
          const storageExtension = getExtension(file.originalname);
          const storage = await storagePut(
            `fileflow/${randomUUID()}${storageExtension}`,
            file.buffer,
            fileType
          );
          const record = {
            id: randomUUID(),
            fileName,
            fileType,
            fileSize: file.size,
            storageKey: storage.key,
            publicUrl: storage.url,
          };

          try {
            await addPublicFile(record);
          } catch (indexError) {
            console.error(
              "[files] Object uploaded, but its public index entry could not be saved:",
              indexError
            );
            response.status(202).json({
              file: { ...record, uploadedAt: new Date().toISOString() },
              indexed: false,
              message:
                "Your file is public, but the library could not be updated. Use the direct link below.",
            });
            return;
          }

          response.status(201).json({
            file: {
              ...record,
              uploadedAt: new Date().toISOString(),
            },
            indexed: true,
            message: "Uploaded successfully. This file is now public.",
          });
        } catch (uploadError) {
          if (sendMulterError(uploadError, response)) return;
          if (uploadError instanceof UploadValidationError) {
            response
              .status(uploadError.statusCode)
              .json({ error: uploadError.message });
            return;
          }
          console.error("[files] Upload failed:", uploadError);
          response
            .status(503)
            .json({
              error: "Upload could not be completed. Please try again.",
            });
        }
      });
    }
  );
}
