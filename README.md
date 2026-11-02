# FileFlow — Public File Workspace

FileFlow is an anonymous, public file-sharing workspace built with React, Express, Multer, Vercel Blob, Drizzle, and MySQL. It is not private storage: every accepted upload can be opened by anyone who can reach its public link. The interface warns visitors not to upload confidential files.

## Run and check

- `pnpm dev` starts the development server and honors `PORT` (default 3000).
- `pnpm check` type-checks the project; `pnpm test` runs the automated suite.
- `pnpm build` builds the existing Manus container application; `pnpm start` serves `dist/index.js` and `dist/public/`.
- `pnpm build:vercel` builds Vite assets and prepares root `public/` for Vercel's static CDN while retaining the Express app as the serverless handler.
- `pnpm db:migrate` applies checked-in migrations. `pnpm db:push` generates and applies schema changes; use with care because the managed database is shared by development and production.

## Upload architecture

### Manus development/container runtime

The browser sends one `multipart/form-data` request to `POST /api/files`, using the field name `file`. Express invokes Multer only on that route. Multer holds the file in memory with a 50 MB maximum and a single-file limit. An extension allow-list and binary-signature validation reject unsupported or spoofed files before storage. Text files must be non-empty UTF-8 without NUL bytes. Supported formats are PDF, PNG/JPEG/GIF/WebP, TXT/CSV/Markdown, and ZIP.

The server sanitizes the display name, creates a UUID-based storage key, and transfers bytes to durable Manus object storage. It then persists the ID, display filename, validated MIME type, size, public URL/key, and timestamp in the `public_files` table. `GET /api/files` returns the 100 latest records and library totals. File bytes are never stored on the application container.

### Vercel runtime

Vercel limits request bodies sent to Functions, so new 50 MB files are uploaded directly from the browser to the project's public Vercel Blob store with `@vercel/blob/client` and multipart progress. Express issues a narrowly scoped upload token for a 50 MB single-file upload and an allow-listed content type. The Blob completion callback verifies the stored content signature, then adds the public URL to the same database-backed index. Invalid files are not listed. Blob storage is configured by Vercel's `BLOB_READ_WRITE_TOKEN` integration.

Existing records backed by Manus storage are not migrated or deleted. Their stable `/manus-storage/<key>` paths are routed through the Express app on Vercel and redirected to fresh signed downloads. The database retains stable links rather than one-hour temporary signed URLs.

In either runtime, if an object has already been stored but its metadata write fails, the API returns a direct public link and the UI shows a partial-success warning. The runtime Manus storage API does not provide an application deletion operation, so this app has no delete button and does not promise physical deletion.

## Vercel project setup

The connected Vercel project uses the root `index.ts` default Express export, Vercel's CDN for files in root `public/`, Node.js 22.x, and the `pnpm build:vercel` build command. Do not configure a separate output directory: `public/**` is the Express framework's static-file convention.

Set these variables for Production and Preview in Vercel project settings, marked sensitive and kept server-side:

- `DATABASE_URL`
- `MANUS_API_URL`
- `MANUS_API_KEY`

The attached public Blob store already provisions `BLOB_READ_WRITE_TOKEN` for Production, Preview, and Development. Do not duplicate or expose that value.

Never commit these values or expose them through browser configuration. Vercel's public Blob store and the file index are anonymous by design; do not use them for confidential content.

## Project layout

- `client/src/pages/Home.tsx` implements the public upload UI, runtime provider selection, progress, library, and share links.
- `client/src/pages/home.css` contains the responsive visual system; `client/public/manus-routes.json` declares the browser route.
- `server/app.ts` creates the shared Express application; root `index.ts` exports it for Vercel, while `server/_core/index.ts` starts the Manus development/container listener.
- `server/_core/fileRoutes.ts` registers the route-scoped Multer API and runtime upload-provider endpoint.
- `server/_core/vercelBlobRoutes.ts` issues Vercel Blob upload tokens and validates completion callbacks.
- `server/_core/manusStorageRoutes.ts` redirects legacy Manus paths to signed downloads on Vercel.
- `server/_core/uploadValidation.ts` owns the shared filename, size, MIME, and content-signature rules.
- `server/files.ts` reads and writes indexed file metadata through Drizzle.
- `server/storage.ts` transfers Manus-hosted file bytes and generates signed downloads.
- `drizzle/schema.ts` and its checked-in SQL migration define the public file index.
