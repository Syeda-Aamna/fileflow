import { randomUUID } from "node:crypto";
import type { Express, NextFunction, Request, Response } from "express";
import multer, { type FileFilterCallback } from "multer";
import { addPublicFile, listPublicFiles } from "../files";
import { storagePut } from "../storage";
import {
  ALLOWED_EXTENSIONS,
  getExpectedContentType,
  getExtension,
  MAX_FILE_SIZE,
  sanitizeDisplayName,
  UploadValidationError,
  validateUploadContent,
} from "./uploadValidation";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
    fields: 0,
    parts: 1,
  },
  fileFilter: (
    _request: Request,
    file: Express.Multer.File,
    callback: FileFilterCallback,
  ) => {
    const extension = getExtension(file.originalname);
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      callback(
        new UploadValidationError(
          "This file type is not supported. Try a PDF, image, text/CSV/Markdown file, or ZIP archive.",
        ),
      );
      return;
    }
    callback(null, true);
  },
});

type UploadResponse = {
  error?: string;
  message?: string;
  indexed?: boolean;
  file?: {
    id: string;
    fileName: string;
    fileType: string;
    fileSize: number;
    publicUrl: string;
    uploadedAt: string;
  };
};

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

async function handleManusUpload(
  request: Request,
  response: Response,
  next: NextFunction,
  error: unknown,
): Promise<void> {
  if (error && sendMulterError(error, response)) return;
  if (error) {
    next(error);
    return;
  }

  try {
    const file = request.file;
    if (!file) {
      response.status(400).json({ error: "Choose a file before uploading." });
      return;
    }

    const fileType = await validateUploadContent(file.originalname, file.buffer);
    const fileName = sanitizeDisplayName(file.originalname);
    const storageExtension = getExtension(file.originalname);
    const storage = await storagePut(
      `fileflow/${randomUUID()}${storageExtension}`,
      file.buffer,
      fileType,
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
    } catch {
      console.error(
        "[files] Manus object uploaded but its public index entry could not be saved.",
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
      file: { ...record, uploadedAt: new Date().toISOString() },
      indexed: true,
      message: "Uploaded successfully. This file is now public.",
    });
  } catch (uploadError) {
    if (sendMulterError(uploadError, response)) return;
    if (uploadError instanceof UploadValidationError) {
      response.status(uploadError.statusCode).json({ error: uploadError.message });
      return;
    }
    console.error("[files] Manus upload failed.");
    response
      .status(503)
      .json({ error: "Upload could not be completed. Please try again." });
  }
}

export function registerFileRoutes(app: Express): void {
  app.get("/api/files/upload-mode", (_request: Request, response: Response) => {
    const onVercel = process.env.VERCEL === "1";
    const provider = onVercel
      ? process.env.BLOB_READ_WRITE_TOKEN
        ? "vercel-blob"
        : "unavailable"
      : "manus";
    response.setHeader("Cache-Control", "no-store");
    response.json({ provider });
  });

  app.get("/api/files", async (_request: Request, response: Response) => {
    try {
      const library = await listPublicFiles();
      response.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
      response.json(library);
    } catch {
      console.error("[files] Could not load public file library.");
      response
        .status(503)
        .json({ error: "The public library is temporarily unavailable." });
    }
  });

  // Vercel Functions cap request bodies at 4.5 MB; Vercel uses the direct Blob
  // upload route instead. Keep Multer for the existing Manus-hosted backend.
  if (process.env.VERCEL !== "1") {
    app.post(
      "/api/files",
      (request: Request, response: Response, next: NextFunction) => {
        upload.single("file")(request, response, error => {
          void handleManusUpload(request, response, next, error);
        });
      },
    );
  }
}

export type { UploadResponse };
export { getExpectedContentType };
