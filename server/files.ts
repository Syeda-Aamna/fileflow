import { count, desc, sum } from "drizzle-orm";
import { getDb } from "./db";
import { publicFiles, type InsertPublicFile } from "../drizzle/schema";

const PAGE_SIZE = 100;

export async function addPublicFile(file: InsertPublicFile): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(publicFiles).values(file);
}

export async function listPublicFiles() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const [files, [stats]] = await Promise.all([
    db
      .select({
        id: publicFiles.id,
        fileName: publicFiles.fileName,
        fileType: publicFiles.fileType,
        fileSize: publicFiles.fileSize,
        publicUrl: publicFiles.publicUrl,
        uploadedAt: publicFiles.uploadedAt,
      })
      .from(publicFiles)
      .orderBy(desc(publicFiles.uploadedAt))
      .limit(PAGE_SIZE),
    db
      .select({
        totalFiles: count(),
        totalBytes: sum(publicFiles.fileSize),
      })
      .from(publicFiles),
  ]);

  return {
    files,
    totalFiles: Number(stats?.totalFiles ?? 0),
    totalBytes: Number(stats?.totalBytes ?? 0),
  };
}
