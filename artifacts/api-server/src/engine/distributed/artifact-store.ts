// ---------------------------------------------------------------------------
// Artifact Store ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
//
// Stores and manages execution artifacts with automatic TTL expiration.
// Artifacts include:
//   - Execution logs
//   - JSON/XML results from tools
//   - HTTP requests and responses
//   - Payloads
//   - Screenshots
//   - Reports
//   - Evidence files (PCAP, temp files)

import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, rm, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { logger } from "../../lib/logger";
import type { ArtifactRecord, ArtifactType } from "./types";

// ── Default Configuration ────────────────────────────────────────────────

interface ArtifactStoreConfig {
  /** Root directory for artifact storage */
  basePath: string;
  /** Default TTL for artifacts in ms (default: 7 days) */
  defaultTtlMs: number;
  /** Maximum total storage in bytes (default: 10GB) */
  maxStorageBytes: number;
  /** Cleanup interval in ms (default: 1 hour) */
  cleanupIntervalMs: number;
}

const DEFAULT_CONFIG: ArtifactStoreConfig = {
  basePath: path.resolve(process.env["ARTIFACTS_DIR"] ?? path.join(process.cwd(), "artifacts", "execution")),
  defaultTtlMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  maxStorageBytes: 10 * 1024 * 1024 * 1024, // 10 GB
  cleanupIntervalMs: 3600_000, // 1 hour
};

// ── Artifact Store ────────────────────────────────────────────────────────

export class ArtifactStore {
  private config: ArtifactStoreConfig;
  private artifacts = new Map<string, ArtifactRecord>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private totalSizeBytes = 0;

  constructor(config?: Partial<ArtifactStoreConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initialize().catch((err) => {
      logger.error({ err }, "[ARTIFACTS] Initialization failed");
    });
    this.startCleanupTimer();
    logger.info({ basePath: this.config.basePath }, "[ARTIFACTS] Artifact Store initialized");
  }

  private async initialize(): Promise<void> {
    await mkdir(this.config.basePath, { recursive: true });

    // Scan for existing artifacts
    try {
      const entries = await readdir(this.config.basePath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) continue;
        const filePath = path.join(this.config.basePath, entry.name);
        const fileStat = await stat(filePath);
        this.totalSizeBytes += fileStat.size;
      }
      logger.info({ files: entries.length, totalSize: this.formatBytes(this.totalSizeBytes) }, "[ARTIFACTS] Scanned existing artifacts");
    } catch {
      // Directory might be empty
    }
  }

  // ── Store ──────────────────────────────────────────────────────────────

  async store(params: {
    scanId: number;
    jobId: string;
    toolName: string;
    type: ArtifactType;
    filename: string;
    data: Buffer | string;
    mimeType?: string;
    ttlMs?: number;
    metadata?: Record<string, string>;
  }): Promise<ArtifactRecord> {
    const id = `art-${randomUUID().slice(0, 12)}`;
    const now = new Date();
    const ttl = params.ttlMs ?? this.config.defaultTtlMs;

    // Build storage path: basePath/scanId/toolName/type/
    const relativeDir = path.join(String(params.scanId), params.toolName, params.type);
    const dir = path.join(this.config.basePath, relativeDir);
    await mkdir(dir, { recursive: true });

    // Deduplicate filename
    const safeFilename = `${id}-${params.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const filePath = path.join(dir, safeFilename);

    // Write to disk
    const buffer = typeof params.data === "string" ? Buffer.from(params.data, "utf-8") : params.data;
    await writeFile(filePath, buffer);

    this.totalSizeBytes += buffer.length;

    const record: ArtifactRecord = {
      id,
      scanId: params.scanId,
      jobId: params.jobId,
      toolName: params.toolName,
      type: params.type,
      filename: safeFilename,
      mimeType: params.mimeType ?? this.inferMimeType(params.type, safeFilename),
      sizeBytes: buffer.length,
      storagePath: filePath,
      createdAt: now,
      expiresAt: new Date(now.getTime() + ttl),
      metadata: params.metadata ?? {},
    };

    this.artifacts.set(id, record);

    logger.debug(
      { scanId: params.scanId, type: params.type, size: buffer.length },
      "[ARTIFACTS] Stored",
    );

    return record;
  }

  // ── Retrieve ───────────────────────────────────────────────────────────

  async get(id: string): Promise<{ record: ArtifactRecord; data: Buffer } | null> {
    const record = this.artifacts.get(id);
    if (!record) return null;
    if (record.expiresAt && record.expiresAt < new Date()) {
      this.artifacts.delete(id);
      return null;
    }
    try {
      const data = await readFile(record.storagePath);
      return { record, data };
    } catch {
      this.artifacts.delete(id);
      return null;
    }
  }

  async getText(id: string): Promise<string | null> {
    const result = await this.get(id);
    if (!result) return null;
    return result.data.toString("utf-8");
  }

  getRecord(id: string): ArtifactRecord | null {
    return this.artifacts.get(id) ?? null;
  }

  // ── Queries ────────────────────────────────────────────────────────────

  getByScan(scanId: number): ArtifactRecord[] {
    return Array.from(this.artifacts.values()).filter((a) => a.scanId === scanId);
  }

  getByJob(jobId: string): ArtifactRecord[] {
    return Array.from(this.artifacts.values()).filter((a) => a.jobId === jobId);
  }

  getByType(type: ArtifactType): ArtifactRecord[] {
    return Array.from(this.artifacts.values()).filter((a) => a.type === type);
  }

  getByTool(toolName: string): ArtifactRecord[] {
    return Array.from(this.artifacts.values()).filter((a) => a.toolName === toolName);
  }

  // ── Deletion ───────────────────────────────────────────────────────────

  async delete(id: string): Promise<boolean> {
    const record = this.artifacts.get(id);
    if (!record) return false;

    try {
      await rm(record.storagePath, { force: true });
      this.totalSizeBytes -= record.sizeBytes;
      this.artifacts.delete(id);
      return true;
    } catch {
      this.artifacts.delete(id);
      return true;
    }
  }

  async deleteByScan(scanId: number): Promise<number> {
    const records = this.getByScan(scanId);
    let deleted = 0;
    for (const record of records) {
      if (await this.delete(record.id)) deleted++;
    }
    return deleted;
  }

  // ── TTL / Cleanup ──────────────────────────────────────────────────────

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(async () => {
      try {
        const now = Date.now();
        let removed = 0;
        let freedBytes = 0;

        // Remove expired artifacts from memory
        for (const [id, record] of this.artifacts) {
          if (record.expiresAt && record.expiresAt.getTime() < now) {
            try {
              await rm(record.storagePath, { force: true });
            } catch {
              // File might already be deleted
            }
            this.totalSizeBytes -= record.sizeBytes;
            freedBytes += record.sizeBytes;
            this.artifacts.delete(id);
            removed++;
          }
        }

        // Check total storage
        if (this.totalSizeBytes > this.config.maxStorageBytes) {
          // Remove oldest artifacts until under limit
          const sorted = Array.from(this.artifacts.values())
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

          while (this.totalSizeBytes > this.config.maxStorageBytes && sorted.length > 0) {
            const oldest = sorted.shift()!;
            try {
              await rm(oldest.storagePath, { force: true });
            } catch {}
            this.totalSizeBytes -= oldest.sizeBytes;
            freedBytes += oldest.sizeBytes;
            this.artifacts.delete(oldest.id);
            removed++;
          }
        }

        if (removed > 0) {
          logger.info(
            { removed, freedBytes: this.formatBytes(freedBytes), totalSize: this.formatBytes(this.totalSizeBytes) },
            "[ARTIFACTS] Cleanup complete",
          );
        }
      } catch (err) {
        logger.error({ err }, "[ARTIFACTS] Cleanup error");
      }
    }, this.config.cleanupIntervalMs);

    if (this.cleanupTimer && typeof this.cleanupTimer === "object") {
      this.cleanupTimer.unref?.();
    }
  }

  // ── Utilities ──────────────────────────────────────────────────────────

  private inferMimeType(type: ArtifactType, filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const mimeMap: Record<string, string> = {
      ".json": "application/json",
      ".xml": "application/xml",
      ".html": "text/html",
      ".txt": "text/plain",
      ".md": "text/markdown",
      ".csv": "text/csv",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".pcap": "application/vnd.tcpdump.pcap",
      ".pcapng": "application/vnd.tcpdump.pcap",
    };
    return mimeMap[ext] ?? "application/octet-stream";
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  }

  getStats(): {
    totalArtifacts: number;
    totalSizeBytes: number;
    totalSizeFormatted: string;
    byType: Record<string, number>;
    byScan: Record<string, number>;
  } {
    const byType: Record<string, number> = {};
    const byScan: Record<string, number> = {};

    for (const record of this.artifacts.values()) {
      byType[record.type] = (byType[record.type] ?? 0) + 1;
      byScan[String(record.scanId)] = (byScan[String(record.scanId)] ?? 0) + 1;
    }

    return {
      totalArtifacts: this.artifacts.size,
      totalSizeBytes: this.totalSizeBytes,
      totalSizeFormatted: this.formatBytes(this.totalSizeBytes),
      byType,
      byScan,
    };
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.artifacts.clear();
    logger.info("[ARTIFACTS] Artifact Store shut down");
  }
}

export const artifactStore = new ArtifactStore();
