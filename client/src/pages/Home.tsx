import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  Clipboard,
  CloudUpload,
  FileArchive,
  FileImage,
  FileText,
  Files,
  Globe2,
  LoaderCircle,
  RefreshCw,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { upload as uploadToVercelBlob } from "@vercel/blob/client";
import "./home.css";

type PublicFile = {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  publicUrl: string;
  uploadedAt: string;
};

type LibraryResponse = {
  files: PublicFile[];
  totalFiles: number;
  totalBytes: number;
};

type Notice = {
  tone: "success" | "error" | "warning";
  message: string;
  link?: string;
} | null;

type UploadApiPayload = {
  error?: string;
  message?: string;
  indexed?: boolean;
  file?: PublicFile;
};

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const ACCEPTED_FILES = ".pdf,.png,.jpg,.jpeg,.gif,.webp,.txt,.csv,.md,.zip";
const MIME_BY_EXTENSION: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".md": "text/markdown",
  ".zip": "application/zip",
};

function getUploadDetails(fileName: string) {
  const extension = fileName.toLowerCase().match(/\.[^./\\]+$/)?.[0];
  const fileType = extension ? MIME_BY_EXTENSION[extension] : undefined;
  return extension && fileType ? { extension, fileType } : null;
}

function uploadWithMulter(
  file: File,
  onProgress: (percentage: number) => void,
): Promise<UploadApiPayload> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);
    const request = new XMLHttpRequest();
    request.open("POST", "/api/files");
    request.setRequestHeader("Accept", "application/json");
    request.upload.onprogress = event => {
      if (event.lengthComputable)
        onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () =>
      reject(
        new Error(
          "The upload could not reach the server. Check your connection and try again.",
        ),
      );
    request.onload = () => {
      let payload: UploadApiPayload = {};
      try {
        payload = JSON.parse(request.responseText) as UploadApiPayload;
      } catch {
        payload = {};
      }
      if (request.status >= 200 && request.status < 300) {
        resolve(payload);
      } else {
        reject(new Error(payload.error || "Upload failed. Please try again."));
      }
    };
    request.send(formData);
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year:
      date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  }).format(date);
}

function getFileKind(fileType: string): "image" | "archive" | "text" {
  if (fileType.startsWith("image/")) return "image";
  if (fileType.includes("zip")) return "archive";
  return "text";
}

function getFileLabel(fileType: string): string {
  const labels: Record<string, string> = {
    "application/pdf": "PDF document",
    "image/png": "PNG image",
    "image/jpeg": "JPEG image",
    "image/gif": "GIF image",
    "image/webp": "WebP image",
    "text/plain": "Text file",
    "text/csv": "CSV spreadsheet",
    "text/markdown": "Markdown file",
    "application/zip": "ZIP archive",
  };
  return labels[fileType] ?? "Shared file";
}

function fileIcon(fileType: string) {
  const kind = getFileKind(fileType);
  if (kind === "image") return <FileImage aria-hidden="true" />;
  if (kind === "archive") return <FileArchive aria-hidden="true" />;
  return <FileText aria-hidden="true" />;
}

function UploadRow({ file }: { file: PublicFile }) {
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    const link = new URL(file.publicUrl, window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <article className="file-row">
      <div className={`file-icon file-icon--${getFileKind(file.fileType)}`}>
        {fileIcon(file.fileType)}
      </div>
      <div className="file-main">
        <a
          className="file-name"
          href={file.publicUrl}
          target="_blank"
          rel="noreferrer"
        >
          {file.fileName}
          <ArrowUpRight className="file-open-icon" aria-hidden="true" />
        </a>
        <div className="file-meta">
          <span>{getFileLabel(file.fileType)}</span>
          <span className="meta-dot" aria-hidden="true" />
          <span>{formatBytes(file.fileSize)}</span>
          <span className="meta-dot" aria-hidden="true" />
          <span>{formatDate(file.uploadedAt)}</span>
        </div>
      </div>
      <div className="file-row-actions">
        <button
          className="icon-button"
          onClick={copyLink}
          aria-label={`Copy public link for ${file.fileName}`}
          title="Copy public link"
        >
          {copied ? (
            <Check aria-hidden="true" />
          ) : (
            <Clipboard aria-hidden="true" />
          )}
          <span className="sr-only">
            {copied ? "Copied" : "Copy public link"}
          </span>
        </button>
        <a
          className="download-button"
          href={file.publicUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open or download ${file.fileName}`}
        >
          <ArrowDownToLine aria-hidden="true" />
          <span>Open</span>
        </a>
      </div>
    </article>
  );
}

export default function Home() {
  const [library, setLibrary] = useState<LibraryResponse>({
    files: [],
    totalFiles: 0,
    totalBytes: 0,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [notice, setNotice] = useState<Notice>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadLibrary = useCallback(async (): Promise<LibraryResponse | null> => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/files", {
        headers: { Accept: "application/json" },
      });
      const data = (await response.json()) as LibraryResponse & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(data.error || "Could not load the public library.");
      setLibrary(data);
      return data;
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "Could not load the public library.",
      );
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  const uploadFile = async (file?: File) => {
    if (!file || uploading) return;
    setNotice(null);
    if (file.size > MAX_FILE_SIZE) {
      setNotice({
        tone: "error",
        message: "That file is larger than the 50 MB limit.",
      });
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    const details = getUploadDetails(file.name);
    if (!details) {
      setNotice({
        tone: "error",
        message: "This file type is not supported. Choose a PDF, image, text/CSV/Markdown file, or ZIP archive.",
      });
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setUploading(true);
    setProgress(0);
    try {
      const modeResponse = await fetch("/api/files/upload-mode", {
        headers: { Accept: "application/json" },
      });
      const mode = (await modeResponse.json()) as {
        provider?: string;
        error?: string;
      };
      if (!modeResponse.ok)
        throw new Error(mode.error || "The upload service is unavailable.");

      if (mode.provider === "manus") {
        const payload = await uploadWithMulter(file, setProgress);
        const partialFile = payload.indexed === false ? payload.file : undefined;
        setNotice({
          tone: partialFile ? "warning" : "success",
          message: payload.message || "Uploaded. Your file is now public.",
          link: partialFile
            ? new URL(partialFile.publicUrl, window.location.origin).toString()
            : undefined,
        });
        setProgress(100);
        await loadLibrary();
        return;
      }

      if (mode.provider !== "vercel-blob") {
        throw new Error("Public upload storage is not configured for this deployment.");
      }

      const id = crypto.randomUUID();
      const blob = await uploadToVercelBlob(
        `fileflow/${id}${details.extension}`,
        file,
        {
          access: "public",
          handleUploadUrl: "/api/files/blob-upload",
          clientPayload: JSON.stringify({
            id,
            fileName: file.name,
            fileSize: file.size,
            fileType: details.fileType,
          }),
          contentType: details.fileType,
          multipart: file.size > 5 * 1024 * 1024,
          onUploadProgress: event => setProgress(Math.round(event.percentage)),
        },
      );
      setProgress(100);
      const refreshedLibrary = await loadLibrary();
      const indexed =
        refreshedLibrary?.files.some(item => item.publicUrl === blob.url) ??
        false;

      if (indexed) {
        setNotice({
          tone: "success",
          message: "Uploaded successfully. This file is now public.",
        });
      } else {
        const reachable = await fetch(blob.url, { method: "HEAD" })
          .then(response => response.ok)
          .catch(() => true);
        setNotice({
          tone: reachable ? "warning" : "error",
          message: reachable
            ? "Your file is public, but the library could not be updated. Use the direct link below."
            : "The file could not be verified and was not added to the public library.",
          link: reachable ? blob.url : undefined,
        });
      }
    } catch (error) {
      setNotice({
        tone: "error",
        message:
          error instanceof Error ? error.message : "Upload failed. Please try again.",
      });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const openPicker = () => inputRef.current?.click();
  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    uploadFile(event.dataTransfer.files[0]);
  };
  const totalStorage = formatBytes(library.totalBytes);

  return (
    <div className="site-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="FileFlow home">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>
            fileflow<span className="brand-period">.</span>
          </span>
        </a>
        <div className="header-right">
          <span className="public-pill">
            <span className="live-dot" /> PUBLIC SPACE
          </span>
          <a className="header-link" href="#library">
            Browse files <ChevronRight aria-hidden="true" />
          </a>
        </div>
      </header>

      <main>
        <section className="hero-section" aria-labelledby="hero-title">
          <div className="hero-copy">
            <div className="eyebrow">
              <Sparkles aria-hidden="true" /> SHARE WITHOUT THE FRICTION
            </div>
            <h1 id="hero-title">
              Files move
              <br />
              <em>better together.</em>
            </h1>
            <p className="hero-description">
              Drop a file. Get a link. Pass it along. A simple public space for
              the things you want to share.
            </p>
            <a className="text-link" href="#library">
              See what’s been shared <ArrowRight aria-hidden="true" />
            </a>
            <div className="hero-proof">
              <div className="proof-icon">
                <Globe2 aria-hidden="true" />
              </div>
              <p>
                <strong>Open by design.</strong>
                <br />
                No sign-in needed to browse or share.
              </p>
            </div>
          </div>

          <div className="upload-panel">
            <div className="upload-panel-top">
              <div>
                <span className="panel-kicker">ADD TO THE LIBRARY</span>
                <h2>Share a file</h2>
              </div>
              <div className="upload-cloud-icon">
                <CloudUpload aria-hidden="true" />
              </div>
            </div>
            <div
              className={`drop-zone${dragging ? " is-dragging" : ""}${uploading ? " is-uploading" : ""}`}
              onDragEnter={event => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragOver={event => event.preventDefault()}
              onDragLeave={event => {
                if (
                  !event.currentTarget.contains(
                    event.relatedTarget as Node | null
                  )
                )
                  setDragging(false);
              }}
              onDrop={onDrop}
              onClick={openPicker}
              role="button"
              tabIndex={0}
              aria-label="Choose a file to share or drop a file here"
              onKeyDown={event => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openPicker();
                }
              }}
            >
              <input
                ref={inputRef}
                className="visually-hidden"
                type="file"
                accept={ACCEPTED_FILES}
                onChange={event => uploadFile(event.target.files?.[0])}
                aria-label="Choose a file to share"
              />
              <div className="drop-icon">
                <CloudUpload aria-hidden="true" />
              </div>
              {uploading ? (
                <div className="uploading-copy">
                  <strong>Uploading your file…</strong>
                  <span>Hang tight while we make your public link.</span>
                </div>
              ) : (
                <div className="drop-copy">
                  <strong>Drop your file here</strong>
                  <span>
                    or{" "}
                    <button
                      type="button"
                      className="browse-button"
                      onClick={event => {
                        event.stopPropagation();
                        openPicker();
                      }}
                    >
                      browse your device
                    </button>
                  </span>
                </div>
              )}
              <span className="file-limit">
                MAX 50 MB <span>·</span> PDF, images, text & ZIP
              </span>
              {uploading && (
                <div
                  className="progress-wrap"
                  aria-label={`Upload progress ${progress}%`}
                >
                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span>{progress}%</span>
                </div>
              )}
            </div>
            <div className="public-notice" role="note">
              <Globe2 aria-hidden="true" />
              <p>
                <strong>Public means public.</strong> Every upload can be viewed
                by anyone with its link and will appear in this open library.
                Don’t upload anything private.
              </p>
            </div>
            {notice && (
              <div
                className={`upload-notice upload-notice--${notice.tone}`}
                role="status"
                aria-live="polite"
              >
                {notice.tone === "success" ? (
                  <Check aria-hidden="true" />
                ) : notice.tone === "warning" ? (
                  <Globe2 aria-hidden="true" />
                ) : (
                  <TriangleAlert aria-hidden="true" />
                )}
                <span>{notice.message}</span>
                {notice.link && (
                  <a href={notice.link} target="_blank" rel="noreferrer">
                    Open public file <ArrowUpRight aria-hidden="true" />
                  </a>
                )}
              </div>
            )}
          </div>
        </section>

        <section
          className="library-section"
          id="library"
          aria-labelledby="library-title"
        >
          <div className="library-heading">
            <div>
              <div className="eyebrow library-eyebrow">
                <span className="live-dot" /> THE OPEN LIBRARY
              </div>
              <h2 id="library-title">Recently shared</h2>
              <p>Everything here is ready to open and pass along.</p>
            </div>
            <div
              className="library-stats"
              aria-label="Public library statistics"
            >
              <div className="stat-item">
                <span className="stat-number">
                  {loading ? "—" : library.totalFiles.toLocaleString()}
                </span>
                <span>files shared</span>
              </div>
              <div className="stat-rule" />
              <div className="stat-item">
                <span className="stat-number">
                  {loading ? "—" : totalStorage}
                </span>
                <span>space shared</span>
              </div>
            </div>
          </div>

          <div className="file-list" aria-live="polite">
            {loading && (
              <div className="library-message">
                <LoaderCircle className="spin" aria-hidden="true" />
                <span>Loading the open library…</span>
              </div>
            )}
            {!loading && loadError && (
              <div className="library-message library-message--error">
                <TriangleAlert aria-hidden="true" />
                <span>{loadError}</span>
                <button
                  className="retry-button"
                  onClick={() => void loadLibrary()}
                >
                  <RefreshCw aria-hidden="true" /> Try again
                </button>
              </div>
            )}
            {!loading && !loadError && library.files.length === 0 && (
              <div className="empty-state">
                <div className="empty-icon">
                  <Files aria-hidden="true" />
                </div>
                <div>
                  <strong>A little room for the first share.</strong>
                  <p>
                    Upload a file above and it’ll show up here with a public
                    link.
                  </p>
                </div>
                <button className="empty-action" onClick={openPicker}>
                  Share the first file <ArrowRight aria-hidden="true" />
                </button>
              </div>
            )}
            {!loading &&
              !loadError &&
              library.files.map(file => (
                <UploadRow key={file.id} file={file} />
              ))}
          </div>
          <div className="library-footer">
            <span>
              <Globe2 aria-hidden="true" /> Public library · newest files first
            </span>
            <button
              className="refresh-link"
              onClick={() => void loadLibrary()}
              disabled={loading}
            >
              <RefreshCw aria-hidden="true" className={loading ? "spin" : ""} />{" "}
              Refresh library
            </button>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <a className="brand brand--footer" href="/">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>
            fileflow<span className="brand-period">.</span>
          </span>
        </a>
        <span>Pass it on.</span>
        <span className="footer-status">
          <span className="live-dot" /> Open to everyone
        </span>
      </footer>
      <a className="skip-link" href="#library">
        Skip to shared files
      </a>
    </div>
  );
}
