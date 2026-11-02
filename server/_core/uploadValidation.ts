import { isUtf8 } from "node:buffer";
import { fileTypeFromBuffer } from "file-type";

export const MAX_FILE_SIZE = 50 * 1024 * 1024;
export const MAX_DISPLAY_NAME = 180;

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

export const ALLOWED_EXTENSIONS = new Set([
  ...Object.keys(TEXT_MIME_BY_EXTENSION),
  ...Object.keys(MIME_BY_EXTENSION),
]);

export class UploadValidationError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 415,
  ) {
    super(message);
    this.name = "UploadValidationError";
  }
}

export function getExtension(name: string): string {
  const leaf = name.replace(/\\/g, "/").split("/").pop() ?? "";
  const dot = leaf.lastIndexOf(".");
  return dot < 0 ? "" : leaf.slice(dot).toLowerCase();
}

export function getExpectedContentType(name: string): string {
  const extension = getExtension(name);
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new UploadValidationError(
      "This file type is not supported. Try a PDF, image, text/CSV/Markdown file, or ZIP archive.",
    );
  }
  return TEXT_MIME_BY_EXTENSION[extension] ?? MIME_BY_EXTENSION[extension];
}

export function sanitizeDisplayName(name: string): string {
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

export async function validateUploadContent(
  fileName: string,
  buffer: Buffer,
): Promise<string> {
  const extension = getExtension(fileName);
  const expectedMime = getExpectedContentType(fileName);

  if (TEXT_MIME_BY_EXTENSION[extension]) {
    if (buffer.length === 0 || !isUtf8(buffer) || buffer.includes(0)) {
      throw new UploadValidationError(
        "That text file is empty or is not valid UTF-8 text.",
      );
    }
    return expectedMime;
  }

  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || detected.mime !== expectedMime) {
    throw new UploadValidationError(
      "The file content does not match its filename type.",
    );
  }
  return detected.mime;
}
