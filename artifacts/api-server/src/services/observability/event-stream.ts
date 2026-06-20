// ---------------------------------------------------------------------------
// Event Stream ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
//
// System-wide event bus that collects and broadcasts events across the platform.
// Supports:
//   - 40+ event types across user, scan, plugin, worker, finding, AI, report,
//     notification, config, system, backup, and alert domains
//   - In-memory event buffer for recent event queries
//   - WebSocket broadcast to subscribed clients
//   - Event filtering, correlation tracking
//   - Prometheus metrics for event counts

import crypto from "node:crypto";
import { type SystemEvent, type SystemEventType, type LogSeverity } from "./types";
import { metricsCollector } from "./metrics-collector";
import { logger } from "../../lib/logger";

// ── Event Bus ──────────────────────────────────────────────────────────────

type EventListener = (event: SystemEvent) => void;

export class EventStream {
  private buffer: SystemEvent[] = [];
  private listeners: Set<EventListener> = new Set();
  private maxBufferSize = 10_000;
  private wsBroadcastFn: ((event: SystemEvent) => void) | null = null;

  // ── Configuration ────────────────────────────────────────────────────────

  setWsBroadcast(fn: (event: SystemEvent) => void): void {
    this.wsBroadcastFn = fn;
  }

  setMaxBufferSize(size: number): void {
    this.maxBufferSize = size;
    if (this.buffer.length > size) {
      this.buffer = this.buffer.slice(-size);
    }
  }

  // ── Emit ─────────────────────────────────────────────────────────────────

  emit(type: SystemEventType, data: {
    source: string;
    severity?: LogSeverity;
    message: string;
    details?: Record<string, unknown> | null;
    userId?: string | null;
    organizationId?: string | null;
    correlationId?: string | null;
  }): SystemEvent {
    const event: SystemEvent = {
      id: crypto.randomUUID(),
      type,
      source: data.source,
      severity: data.severity ?? "info",
      message: data.message,
      details: data.details ?? null,
      userId: data.userId ?? null,
      organizationId: data.organizationId ?? null,
      correlationId: data.correlationId ?? null,
      timestamp: new Date().toISOString(),
    };

    // Buffer
    this.buffer.push(event);
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift();
    }

    // Local listeners
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        logger.error({ err, eventType: event.type }, "[EVENTS] Listener error");
      }
    }

    // WebSocket broadcast
    if (this.wsBroadcastFn) {
      try {
        this.wsBroadcastFn(event);
      } catch {
        // WS unavailable
      }
    }

    // Metrics
    metricsCollector.inc("events_total", 1, { type: event.type, severity: event.severity });

    return event;
  }

  // ── Subscribe ────────────────────────────────────────────────────────────

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ── Query ────────────────────────────────────────────────────────────────

  query(options: {
    type?: SystemEventType;
    types?: SystemEventType[];
    source?: string;
    severity?: LogSeverity;
    userId?: string;
    limit?: number;
    offset?: number;
    since?: string;
  }): SystemEvent[] {
    let results = [...this.buffer];

    if (options.type) {
      results = results.filter(e => e.type === options.type);
    }
    if (options.types) {
      results = results.filter(e => options.types!.includes(e.type));
    }
    if (options.source) {
      results = results.filter(e => e.source === options.source);
    }
    if (options.severity) {
      results = results.filter(e => e.severity === options.severity);
    }
    if (options.userId) {
      results = results.filter(e => e.userId === options.userId);
    }
    if (options.since) {
      const since = new Date(options.since).getTime();
      results = results.filter(e => new Date(e.timestamp).getTime() >= since);
    }

    const offset = options.offset ?? 0;
    const limit = options.limit ?? 100;
    return results.reverse().slice(offset, offset + limit);
  }

  // ── Stats ────────────────────────────────────────────────────────────────

  getStats(): { bufferSize: number; listenerCount: number; eventCounts: Record<string, number> } {
    const counts: Record<string, number> = {};
    for (const event of this.buffer) {
      counts[event.type] = (counts[event.type] ?? 0) + 1;
    }
    return {
      bufferSize: this.buffer.length,
      listenerCount: this.listeners.size,
      eventCounts: counts,
    };
  }

  clearBuffer(): void {
    this.buffer = [];
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────

export const eventStream = new EventStream();

// ── Convenience Emitters ───────────────────────────────────────────────────

export const emitEvent = eventStream.emit.bind(eventStream);
