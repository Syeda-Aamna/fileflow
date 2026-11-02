import { del } from "@vercel/blob";
import {
  handleUpload,
  type HandleUploadBody,
} from "@vercel/blob/client";
import type { Express, Request, Response } from "express";
import { addPublicFile } from "../files";
import {
  getExpectedContentType,
  getExtension,
  MAX_FILE_SIZE,
  sanitizeDisplayName,
  UploadValidationError,
  validateUploadContent,
} from "./uploadValidation";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type UploadIntent = {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
};

function parseClientIntent(payload: string | null | undefined): UploadIntent {
  let value: unknown;
  try {
    value = JSON.parse(payload ?? "");
  } catch {
    throw new UploadValidationError("Upload details are missing or invalid.", 400);
  }
  if (!value || typeof value !== "object") {
    throw new UploadValidationError("Upload details are missing or invalid.", 400);
  }

  const candidate = value as Partial<UploadIntent>;
  const declaredTooLarge =
    typeof candidate.fileSize === "number" && candidate.fileSize > MAX_FILE_SIZE;
  if (
    typeof candidate.id !== "string" ||
    !UUID_PATTERN.test(candidate.id) ||
    typeof candidate.fileName !== "string" ||
    typeof candidate.fileSize !== "number" ||
    !Number.isInteger(candidate.fileSize) ||
    candidate.fileSize < 1 ||
    candidate.fileSize > MAX_FILE_SIZE
  ) {
    throw new UploadValidationError(
      "Choose a file up to 50 MB before uploading.",
      declaredTooLarge ? 413 : 400,
    );
  }

  const fileType = getExpectedContentType(candidate.fileName);
  if (candidate.fileType !== fileType) {
    throw new UploadValidationError(
      "The selected file type could not be verified.",
      415,
    );
  }

  return {
    id: candidate.id.toLowerCase(),
    fileName: sanitizeDisplayName(candidate.fileName),
    fileSize: candidate.fileSize,
    fileType,
  };
}

function parseTokenPayload(
  tokenPayload: string | null | undefined,
): UploadIntent {
  const parsed = parseClientIntent(tokenPayload);
  return parsed;
}

async function readBlobBytes(url: string): Promise<Buffer> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("Uploaded Blob could not be read for validation.");
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_FILE_SIZE) {
    throw new UploadValidationError("This file is larger than the 50 MB limit.", 413);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1 || bytes.length > MAX_FILE_SIZE) {
    throw new UploadValidationError("This file is empty or larger than 50 MB.", 413);
  }
  return bytes;
}

async function removeRejectedBlob(url: string): Promise<void> {
  try {
    await del(url);
  } catch {
    console.error("[files] Could not remove an unverified Blob upload.");
  }
}

export function registerVercelBlobRoutes(app: Express): void {
  app.post(
    "/api/files/blob-upload",
    async (request: Request, response: Response) => {
      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        response.status(503).json({ error: "Public upload storage is not configured." });
        return;
      }

      try {
        const body = request.body as HandleUploadBody;
        const result = await handleUpload({
          body,
          request,
          onBeforeGenerateToken: async (pathname, clientPayload) => {
            const intent = parseClientIntent(clientPayload);
            const expectedPath = `fileflow/${intent.id}${getExtension(intent.fileName)}`;
            if (pathname !== expectedPath) {
              throw new UploadValidationError("The requested upload path is invalid.", 400);
            }

            return {
              allowedContentTypes: [intent.fileType],
              maximumSizeInBytes: MAX_FILE_SIZE,
              addRandomSuffix: true,
              allowOverwrite: false,
              tokenPayload: JSON.stringify(intent),
            };
          },
          onUploadCompleted: async ({ blob, tokenPayload }) => {
            const intent = parseTokenPayload(tokenPayload);
            if (
              !blob.pathname.startsWith(`fileflow/${intent.id}`) ||
              blob.contentType !== intent.fileType
            ) {
              await removeRejectedBlob(blob.url);
              return;
            }

            let bytes: Buffer;
            try {
              bytes = await readBlobBytes(blob.url);
              if (bytes.length !== intent.fileSize) {
                throw new UploadValidationError(
                  "The uploaded content size did not match the selected file.",
                  415,
                );
              }
              const verifiedType = await validateUploadContent(
                intent.fileName,
                bytes,
              );
              if (verifiedType !== intent.fileType) {
                throw new UploadValidationError(
                  "The file content does not match its filename type.",
                  415,
                );
              }
            } catch (error) {
              if (error instanceof UploadValidationError) {
                await removeRejectedBlob(blob.url);
                return;
              }
              throw error;
            }

            const record = {
              id: intent.id,
              fileName: intent.fileName,
              fileType: intent.fileType,
              fileSize: bytes.length,
              storageKey: blob.pathname,
              publicUrl: blob.url,
            };

            try {
              await addPublicFile(record);
            } catch {
              // The Blob URL is already public; allow the client to show it as a
              // partial success instead of hiding the file behind a failed callback.
              console.error(
                "[files] Public Blob upload completed but library indexing failed.",
              );
            }
          },
        });
        response.status(200).json(result);
      } catch (error) {
        if (error instanceof UploadValidationError) {
          response.status(error.statusCode).json({ error: error.message });
          return;
        }
        console.error("[files] Vercel Blob upload handler failed.");
        response.status(400).json({ error: "The public upload could not be authorized." });
      }
    },
  );
}
