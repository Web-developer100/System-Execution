// ---------------------------------------------------------------------------
// Structured Logger ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
//
// Enhanced structured JSON logging with:
//   - Correlation IDs and trace IDs for distributed tracing
//   - Log categories (system, security, audit, worker, plugin, AI, etc.)
//   - Severity levels (debug, info, warn, error, fatal)
//   - Automatic metadata enrichment (hostname, service name)
//   - Secrets redaction
//   - In-memory buffer for recent log queries

import os from "node:os";
import type { LogCategory, LogSeverity, StructuredLogEntry } from "./types";
import { LOG_CATEGORIES } from "./types";
import { logger as pinoLogger } from "../../lib/logger";

// ── Configuration ──────────────────────────────────────────────────────────

interface StructuredLoggerConfig {
  serviceName: string;
  maxBufferEntries: number;
  redactKeys: string[];
}

const DEFAULT_CONFIG: StructuredLoggerConfig = {
  serviceName: "v8-platform",
  maxBufferEntries: 10_000,
  redactKeys: ["password", "secret", "token", "authorization", "cookie", "api_key", "apikey", "passwd", "credential"],
};

// ── Structured Logger ──────────────────────────────────────────────────────

export class StructuredLogger {
  private config: StructuredLoggerConfig;
  private buffer: StructuredLogEntry[] = [];
  private hostname: string;

  constructor(config?: Partial<StructuredLoggerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.hostname = os.hostname();
  }

  // ── Public API ───────────────────────────────────────────────────────────

  log(entry: Omit<StructuredLogEntry, "timestamp" | "hostname" | "serviceName">): void {
    const fullEntry: StructuredLogEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
      hostname: this.hostname,
      serviceName: this.config.serviceName,
    };

    // Redact sensitive data
    fullEntry.metadata = this.redactSensitive(fullEntry.metadata);
    if (fullEntry.exception) {
      // Don't redact exceptions
    }

    // Write to pino
    const pinoLevel = this.mapSeverity(entry.severity);
    pinoLogger[pinoLevel]({
      correlationId: entry.correlationId,
      traceId: entry.traceId,
      requestId: entry.requestId,
      userId: entry.userId,
      organizationId: entry.organizationId,
      workerId: entry.workerId,
      pluginId: entry.pluginId,
      category: entry.category,
      operation: entry.operation,
      executionTimeMs: entry.executionTimeMs,
      status: entry.status,
      metadata: entry.metadata,
    }, entry.message);

    // Buffer for recent log queries
    this.buffer.push(fullEntry);
    if (this.buffer.length > this.config.maxBufferEntries) {
      this.buffer.shift();
    }
  }

  debug(category: LogCategory, operation: string, message: string, meta?: Record<string, unknown>): void {
    this.log({ severity: "debug", category, operation, message, metadata: meta ?? null, correlationId: null, traceId: null, requestId: null, userId: null, organizationId: null, workerId: null, pluginId: null, executionTimeMs: null, status: null, exception: null, stackTrace: null });
  }

  info(category: LogCategory, operation: string, message: string, meta?: Record<string, unknown>): void {
    this.log({ severity: "info", category, operation, message, metadata: meta ?? null, correlationId: null, traceId: null, requestId: null, userId: null, organizationId: null, workerId: null, pluginId: null, executionTimeMs: null, status: null, exception: null, stackTrace: null });
  }

  warn(category: LogCategory, operation: string, message: string, meta?: Record<string, unknown>): void {
    this.log({ severity: "warn", category, operation, message, metadata: meta ?? null, correlationId: null, traceId: null, requestId: null, userId: null, organizationId: null, workerId: null, pluginId: null, executionTimeMs: null, status: null, exception: null, stackTrace: null });
  }

  error(category: LogCategory, operation: string, message: string, err?: Error, meta?: Record<string, unknown>): void {
    this.log({
      severity: "error", category, operation, message,
      metadata: meta ?? null, exception: err?.message ?? null, stackTrace: err?.stack ?? null,
      correlationId: null, traceId: null, requestId: null, userId: null, organizationId: null,
      workerId: null, pluginId: null, executionTimeMs: null, status: null,
    });
  }

  fatal(category: LogCategory, operation: string, message: string, err?: Error, meta?: Record<string, unknown>): void {
    this.log({
      severity: "fatal", category, operation, message,
      metadata: meta ?? null, exception: err?.message ?? null, stackTrace: err?.stack ?? null,
      correlationId: null, traceId: null, requestId: null, userId: null, organizationId: null,
      workerId: null, pluginId: null, executionTimeMs: null, status: null,
    });
  }

  // ── Query ────────────────────────────────────────────────────────────────

  query(options: {
    category?: LogCategory;
    severity?: LogSeverity;
    correlationId?: string;
    userId?: string;
    limit?: number;
    offset?: number;
  }): StructuredLogEntry[] {
    let results = [...this.buffer];

    if (options.category) {
      results = results.filter(e => e.category === options.category);
    }
    if (options.severity) {
      results = results.filter(e => e.severity === options.severity);
    }
    if (options.correlationId) {
      results = results.filter(e => e.correlationId === options.correlationId);
    }
    if (options.userId) {
      results = results.filter(e => e.userId === options.userId);
    }

    const offset = options.offset ?? 0;
    const limit = options.limit ?? 100;
    return results.slice(offset, offset + limit);
  }

  getBufferSize(): number {
    return this.buffer.length;
  }

  clearBuffer(): void {
    this.buffer = [];
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private mapSeverity(severity: LogSeverity): "debug" | "info" | "warn" | "error" | "fatal" {
    return severity;
  }

  private redactSensitive(meta: Record<string, unknown> | null): Record<string, unknown> | null {
    if (!meta) return null;

    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(meta)) {
      if (this.config.redactKeys.some(k => key.toLowerCase().includes(k.toLowerCase()))) {
        redacted[key] = "[REDACTED]";
      } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        redacted[key] = this.redactSensitive(value as Record<string, unknown>);
      } else {
        redacted[key] = value;
      }
    }
    return redacted;
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────

export const structuredLogger = new StructuredLogger();

// ── Convenience re-exports ─────────────────────────────────────────────────

export const log = structuredLogger;
