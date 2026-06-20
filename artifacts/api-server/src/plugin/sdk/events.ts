// ---------------------------------------------------------------------------
// Plugin SDK — Event System
// ---------------------------------------------------------------------------
//
// Plugins can subscribe to platform events and publish their own events.
// Events are the primary communication mechanism between plugins.
//
// Built-in platform events:
//   ScanStarted, ScanFinished, AssetCreated, FindingCreated,
//   FindingVerified, ReportGenerated, UserLogin, WorkerOnline,
//   WorkerOffline, PluginInstalled, PluginUpdated, NotificationSent,
//   SystemStartup, SystemShutdown
//
// Plugins may define custom events by publishing them (declared in manifest).

import { EventEmitter } from "node:events";
import { logger } from "../../lib/logger";

// ── Event Types ────────────────────────────────────────────────────────────

export type PluginEventType =
  // Scan lifecycle
  | "ScanStarted"
  | "ScanFinished"
  | "ScanProgress"
  | "ScanError"
  | "ScanStopped"

  // Asset lifecycle
  | "AssetCreated"
  | "AssetUpdated"
  | "AssetDeleted"

  // Finding lifecycle
  | "FindingCreated"
  | "FindingUpdated"
  | "FindingVerified"
  | "FindingFalsePositive"

  // Report lifecycle
  | "ReportGenerated"
  | "ReportDownloaded"

  // User lifecycle
  | "UserLogin"
  | "UserLogout"
  | "UserCreated"
  | "UserDeleted"

  // Worker lifecycle
  | "WorkerOnline"
  | "WorkerOffline"
  | "WorkerError"

  // Plugin lifecycle
  | "PluginInstalled"
  | "PluginUpdated"
  | "PluginUninstalled"
  | "PluginEnabled"
  | "PluginDisabled"
  | "PluginHealthChanged"
  | "PluginError"

  // Notification lifecycle
  | "NotificationSent"
  | "NotificationFailed"

  // System lifecycle
  | "SystemStartup"
  | "SystemShutdown"
  | "SystemError"
  | "SystemConfigChanged"

  // Custom events
  | string;

// ── Event Payload ──────────────────────────────────────────────────────────

export interface PluginEvent {
  id: string;
  type: PluginEventType;
  source: string; // plugin ID or "system"
  timestamp: Date;
  data: Record<string, unknown>;
  metadata?: {
    scanId?: number;
    pluginId?: string;
    userId?: number;
    organizationId?: number;
  };
}

// ── Event Bus ──────────────────────────────────────────────────────────────

export class PluginEventBus {
  private emitter = new EventEmitter();
  private subscribers = new Map<string, Set<{ pluginId: string; handler: (event: PluginEvent) => void }>>();
  private eventHistory: PluginEvent[] = [];
  private maxHistory = 1000;
  private nextId = 1;

  // ── Emitting Events ──────────────────────────────────────────────────────

  /**
   * Emit an event to all subscribers.
   */
  emit(type: PluginEventType, source: string, data: Record<string, unknown>, metadata?: PluginEvent["metadata"]): PluginEvent {
    const event: PluginEvent = {
      id: `evt-${this.nextId++}-${Date.now()}`,
      type,
      source,
      timestamp: new Date(),
      data,
      metadata,
    };

    // Store in history (ring buffer)
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistory) {
      this.eventHistory.shift();
    }

    // Emit to subscribers
    const subscribers = this.subscribers.get(type);
    if (subscribers) {
      for (const sub of subscribers) {
        try {
          sub.handler(event);
        } catch (err) {
          logger.error({ err, pluginId: sub.pluginId, eventType: type },
            `[EVENTS] Handler error for plugin "${sub.pluginId}" on event "${type}"`);
        }
      }
    }

    // Also emit to wildcard subscribers
    const wildcardSubs = this.subscribers.get("*");
    if (wildcardSubs) {
      for (const sub of wildcardSubs) {
        try {
          sub.handler(event);
        } catch (err) {
          logger.error({ err, pluginId: sub.pluginId, eventType: type },
            `[EVENTS] Wildcard handler error for plugin "${sub.pluginId}"`);
        }
      }
    }

    logger.debug({ eventType: type, source, dataKeys: Object.keys(data) },
      `[EVENTS] Event "${type}" emitted by "${source}"`);

    return event;
  }

  // ── Subscribing ──────────────────────────────────────────────────────────

  /**
   * Subscribe a plugin to an event type.
   * Returns an unsubscribe function.
   */
  subscribe(pluginId: string, type: PluginEventType, handler: (event: PluginEvent) => void): () => void {
    if (!this.subscribers.has(type)) {
      this.subscribers.set(type, new Set());
    }

    const entry = { pluginId, handler };
    this.subscribers.get(type)!.add(entry);

    logger.debug({ pluginId, eventType: type },
      `[EVENTS] Plugin "${pluginId}" subscribed to "${type}"`);

    return () => {
      this.subscribers.get(type)?.delete(entry);
      if (this.subscribers.get(type)?.size === 0) {
        this.subscribers.delete(type);
      }
    };
  }

  /**
   * Unsubscribe a plugin from all events.
   */
  unsubscribeAll(pluginId: string): void {
    for (const [, subs] of this.subscribers) {
      for (const sub of subs) {
        if (sub.pluginId === pluginId) {
          subs.delete(sub);
        }
      }
    }
    logger.debug({ pluginId }, `[EVENTS] Plugin "${pluginId}" unsubscribed from all events`);
  }

  // ── Querying ──────────────────────────────────────────────────────────────

  /**
   * Get recent events of a specific type.
   */
  getRecentEvents(type?: PluginEventType, limit = 50): PluginEvent[] {
    const events = type
      ? this.eventHistory.filter((e) => e.type === type)
      : this.eventHistory;
    return events.slice(-limit);
  }

  /**
   * Get all event types that have subscribers.
   */
  getSubscribedEventTypes(): PluginEventType[] {
    return Array.from(this.subscribers.keys());
  }

  /**
   * Get subscriber count for an event type.
   */
  getSubscriberCount(type: PluginEventType): number {
    return this.subscribers.get(type)?.size ?? 0;
  }

  // ── Plugin SDK Implementation ────────────────────────────────────────────

  /** Create an EventAPI for a specific plugin */
  createAPI(pluginId: string): {
    emit: (type: string, data: Record<string, unknown>) => Promise<void>;
    on: (type: string, handler: (data: Record<string, unknown>) => void) => () => void;
  } {
    return {
      emit: async (type: string, data: Record<string, unknown>) => {
        this.emit(type, pluginId, data, { pluginId });
      },
      on: (type: string, handler: (data: Record<string, unknown>) => void) => {
        return this.subscribe(pluginId, type, (event: PluginEvent) => {
          handler(event.data);
        });
      },
    };
  }

  /** Get event history */
  getHistory(): PluginEvent[] {
    return [...this.eventHistory];
  }

  /** Clear event history */
  clearHistory(): void {
    this.eventHistory = [];
  }
}

export const pluginEventBus = new PluginEventBus();
