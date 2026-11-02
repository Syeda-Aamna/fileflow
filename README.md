# FileFlow — Public File Workspace

React / Express / tRPC / Drizzle starter, adapted from the Sandbox web-db-user template.

- `pnpm dev`: development server; honors `PORT` (default 3000).
- `pnpm build` / `pnpm start`: build and serve `dist/index.js` and `dist/public/`.
- `pnpm db:migrate`: apply checked-in migrations. `pnpm db:push`: generate and apply new schema changes.
- `pnpm check` / `pnpm test`: types and application tests.

## Public upload flow

FileFlow is an open file-sharing space. Visitors do not need to sign in. Every accepted upload appears in the public library and its stable `/manus-storage/...` link is public. The interface warns users not to upload confidential files.

The browser sends one `multipart/form-data` request to `POST /api/files`, using the field name `file`. Express invokes Multer only on that route. Multer holds the upload in memory with a 50 MB maximum, a single-file limit, and an extension allow-list. The server then checks binary file signatures with `file-type`; text files must be non-empty UTF-8 without NUL bytes. Supported formats are PDF, PNG/JPEG/GIF/WebP, TXT/CSV/Markdown, and ZIP. Invalid types, spoofed extensions, and oversized files are rejected before storage.

After validation, the server sanitizes the display filename, creates a UUID-based object key, and writes bytes to durable project object storage through `server/storage.ts`. It records the display filename, validated MIME type, byte size, storage key, public URL, and upload time in the managed MySQL database. `GET /api/files` returns the 100 latest records plus library totals. File bytes are not stored on the application container.

If the object is stored successfully but writing its database record fails, the API returns HTTP 202 with the direct public URL. The interface keeps that link visible and explains that the file may not appear in the library until the metadata service is available again.

The runtime storage API does not provide an application delete operation, so the public demo does not offer a delete button or claim that uploaded objects can be removed through this app.

## Project layout

- `client/src/pages/Home.tsx` implements the upload controls, progress, public file list, and copy-link actions.
- `client/src/pages/home.css` contains the responsive visual system.
- `server/_core/fileRoutes.ts` registers the Express file endpoints and route-scoped Multer middleware.
- `server/files.ts` reads and writes file metadata through Drizzle.
- `server/storage.ts` transfers file bytes to durable object storage and supplies stable public paths.
- `drizzle/schema.ts` and `drizzle/0001_supreme_aaron_stack.sql` define the public file index.

Run `pnpm dev` in the managed preview. The server needs the supplied `DATABASE_URL`, `MANUS_API_URL`, and server-only `MANUS_API_KEY`; never expose the storage key in browser code.

`server/_core/publicConfig.ts` exposes only named public runtime values. Private keys stay server-side. The platform serves managed `/manus-storage/` assets; the application does not register a second proxy.

Platform configuration is readable and editable through `webdev.config`. Default settings are initial values, not enforced constraints. The agent may modify the files, commands and configuration or follow the flexible guide for another stack.
