import type { Express, Request, Response } from "express";
import { storageGetSignedUrl } from "../storage";

const STORAGE_KEY_PATTERN = /^fileflow\/[A-Za-z0-9_./-]+$/;

export function registerManusStorageRoutes(app: Express): void {
  app.get(/^\/manus-storage\/(.+)$/, async (request: Request, response: Response) => {
    const key = String(request.params[0] ?? "");
    if (
      !STORAGE_KEY_PATTERN.test(key) ||
      key.split("/").some(segment => segment === ".." || segment === ".")
    ) {
      response.status(404).json({ error: "The shared file is not available." });
      return;
    }

    try {
      const signedUrl = await storageGetSignedUrl(key);
      response.setHeader("Cache-Control", "no-store");
      response.redirect(302, signedUrl);
    } catch {
      console.error("[storage] Could not create a signed URL for an existing Manus file.");
      response.status(404).json({ error: "The shared file is not available." });
    }
  });
}
