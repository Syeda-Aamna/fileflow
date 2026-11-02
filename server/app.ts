import "dotenv/config";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";
import { registerFileRoutes } from "./_core/fileRoutes";
import { registerManusStorageRoutes } from "./_core/manusStorageRoutes";
import { registerOAuthRoutes } from "./_core/oauth";
import { publicPlatformScript } from "./_core/publicConfig";
import { registerVercelBlobRoutes } from "./_core/vercelBlobRoutes";

export function createApp() {
  const app = express();
  // File uploads use route-scoped Multer on Manus and Blob's direct client upload
  // protocol on Vercel; ordinary APIs keep small JSON/form limits.
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "64kb", extended: true }));
  app.get("/api/health", (_request, response) => response.json({ status: "ok" }));
  app.get("/api/platform/config.js", (_request, response) => {
    response
      .set("Cache-Control", "no-store")
      .type("application/javascript")
      .send(publicPlatformScript());
  });

  registerOAuthRoutes(app);
  registerFileRoutes(app);
  registerVercelBlobRoutes(app);
  registerManusStorageRoutes(app);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  app.use(
    (
      error: unknown,
      _request: express.Request,
      response: express.Response,
      next: express.NextFunction,
    ) => {
      if (response.headersSent) {
        next(error);
        return;
      }
      console.error("[server] Unhandled request error.");
      response.status(500).json({ error: "The server could not complete the request." });
    },
  );

  return app;
}
