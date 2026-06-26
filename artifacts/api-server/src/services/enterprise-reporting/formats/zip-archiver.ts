// ---------------------------------------------------------------------------
// ZIP Archive Generator ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
// Creates ZIP archives containing multiple report format files,
// metadata, and manifest for distribution.

import path from "node:path";
import { logger } from "../../../lib/logger";
import { createWriteStream } from "node:fs";

// ── ZIP Archive Generator ──────────────────────────────────────────────────

export async function createZipArchive(
  files: Array<{ filename: string; path: string }>,
  outputDir: string,
  archiveName: string,
): Promise<{ path: string; sizeBytes: number }> {
  const archiverModule = await import("archiver");

  const outputPath = path.join(outputDir, `${archiveName}.zip`);
  const output = createWriteStream(outputPath);
  const ArchiveClass = (archiverModule as any);
  const archive = typeof ArchiveClass === "function" ? ArchiveClass("zip", { zlib: { level: 9 } }) : new ArchiveClass("zip", { zlib: { level: 9 } });

  return new Promise((resolve, reject) => {
    output.on("close", async () => {
      const stats = await import("node:fs").then(fs => fs.promises.stat(outputPath));
      logger.info({ path: outputPath, size: stats.size }, "[ZIP] Archive created");
      resolve({ path: outputPath, sizeBytes: stats.size });
    });

    archive.on("error", (err: Error) => {
      logger.error({ err }, "[ZIP] Archive creation failed");
      reject(err);
    });

    archive.pipe(output);

    for (const file of files) {
      archive.file(file.path, { name: file.filename });
    }

    // Add manifest.json
    archive.append(JSON.stringify({
      createdAt: new Date().toISOString(),
      generator: "V8 Neural Exploitation Platform",
      archiveVersion: "1.0",
      files: files.map(f => ({ filename: f.filename })),
    }, null, 2), { name: "manifest.json" });

    archive.finalize();
  });
}
