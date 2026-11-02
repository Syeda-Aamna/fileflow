# FileFlow — delivery outcomes

## 1. Public workspace and disclosure
- [x] Create a polished, responsive file-sharing website that clearly identifies the workspace as public.
- [x] State prominently next to the upload flow that every uploaded file is publicly accessible. Do not call uploaded files private or imply confidential storage.
- [x] Keep the public interface accessible with keyboard navigation, visible focus states, semantic labels, and mobile-friendly layouts.

## 2. Express + Multer upload flow
- [x] Add an Express upload API using Multer for `multipart/form-data`; apply Multer only to the upload route, not globally.
- [x] Accept a single file with a maximum size of 50 MB, enforce the limit on the server, and return clear validation and upload errors.
- [x] Sanitize display names, create collision-resistant storage keys, and restrict accepted file types using an explicit allow-list and content validation.
- [x] Store file bytes in durable project object storage, not on the container filesystem, and provide the browser a stable public file URL.
- [x] Show upload progress and success feedback in the browser; if storage succeeds but the library metadata write fails, return and show the direct public link with a clear partial-success warning.

## 3. Persistent public file library
- [x] Persist file metadata in the managed database, including a stable identifier, display filename, validated content type, byte size, public object URL/key, and upload timestamp.
- [x] Provide a public file listing with filename, type, size, and upload time, along with direct view/download links.
- [x] Show a useful empty state, handle missing files and service failures without a broken page, and present actionable error messages for rejected uploads.

## 4. Vercel-compatible application and storage
- [ ] Deploy the existing React/Express app on the Vercel `fileflow` project using a serverless-compatible Express entrypoint and Vercel CDN static assets.
- [ ] Keep the 50 MB single-file upload limit by uploading directly from the browser to a public Vercel Blob store, with server-issued upload tokens, progress feedback, and a server-side completion callback.
- [ ] Preserve existing Manus-stored file records and URLs; route their public paths through the app to fresh signed download links rather than migrating or deleting them.
- [ ] Keep the existing accepted file-type allow-list, display-name sanitization, persistent database index, and clear error/partial-success feedback across both storage providers.

## 5. Public Vercel production configuration
- [x] Keep the attached public Blob store's `BLOB_READ_WRITE_TOKEN` linked server-side to Production, Preview, and Development; do not expose its value in browser output or repository files.
- [ ] Configure `DATABASE_URL`, `MANUS_API_URL`, and `MANUS_API_KEY` as sensitive server-side Vercel variables for Production and Preview; never include credential values in browser output or repository files.
- [ ] Remove Vercel SSO protection from the production site only after the code, database, and storage configuration are ready, so the public site can be visited without Vercel login.
- [ ] Confirm the production domain serves the site publicly and the public file-list API responds successfully; do not create a test upload in the public library without approval.
