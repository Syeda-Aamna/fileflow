import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const builtAssets = path.join(projectRoot, "dist", "public");
const vercelPublic = path.join(projectRoot, "public");

await rm(vercelPublic, { recursive: true, force: true });
await mkdir(vercelPublic, { recursive: true });
await cp(builtAssets, vercelPublic, { recursive: true });
// This route is generated into Vite's static build for static/Manus publishing,
// but Vercel serves the runtime-safe config from the Express function instead.
await rm(path.join(vercelPublic, "api", "platform", "config.js"), {
  force: true,
});
console.log("Prepared Vercel static assets in public/.");
