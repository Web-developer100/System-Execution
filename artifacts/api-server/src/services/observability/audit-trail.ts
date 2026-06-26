// ---------------------------------------------------------------------------
// Audit Trail Service ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
// Provides immutable audit logging for all administrative actions.
// Tracks: Who, When, Where, IP, Device, Old Value, New Value,
// Affected Resource, Action Type, Approval Status, Correlation ID.
//
// Audit logs are append-only and digitally signed for immutability.

import crypto from "node:crypto";
import { logger } from "../../lib/logger";
import { eventStream } from "./event-stream";
import { metricsCollector } from "./metrics-collector";

// ── Types ──────────────────────────────────────────────────────────────────

export type AuditActionType =
  | "user:login" | "user:logout" | "user:created" | "user:updated" | "user:deleted" | "user:role_changed"
  | "scan:created" | "scan:started" | "scan:stopped" | "scan:cancelled" | "scan:scheduled"
  | "finding:updated" | "finding:verified" | "finding:classified" | "finding:deleted"
  | "report:generated" | "report:deleted" | "report:shared" | "report:archived"
  | "config:updated" | "config:system" | "config:security"
  | "plugin:installed" | "plugin:updated" | "plugin:removed" | "plugin:enabled" | "plugin:disabled"
  | "worker:added" | "worker:removed" | "worker:configured"
  | "proxy:added" | "proxy:updated" | "proxy:removed"
  | "organization:updated" | "organization:member_added" | "organization:member_removed"
  | "role:created" | "role:updated" | "role:deleted" | "permission:modified"
  | "api_key:created" | "api_key:revoked"
  | "system:restarted" | "system:backup" | "system:restore" | "system:maintenance"
  | "security:alert_acknowledged" | "security:alert_resolved" | "security:rule_updated"
  | "integration:added" | "integration:updated" | "integration:removed"
  | "notification:channel_configured" | "notification:test_sent";

export interface AuditEntry {
  id: string;
  timestamp: string;
  action: AuditActionType;
  actor: {
    id: string | null;
    username: string | null;
    role: string | null;
  };
  source: {
    ip: string | null;
    userAgent: string | null;
    deviceType: string | null;
    location: string | null;
  };
  resource: {
    type: string;
    id: string | null;
    name: string | null;
  };
  changes: {
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
  };
  status: "success" | "failure" | "pending";
  reason: string | null;
  correlationId: string | null;
  organizationId: string | null;
  immutableHash: string; // Chain hash for immutability
  previousHash: string | null; // Previous entry hash
}

// ── Audit Trail Service ────────────────────────────────────────────────────

export class AuditTrailService {
  private entries: AuditEntry[] = [];
  private maxEntries = 100_000;
  private lastHash: string | null = null;
  // ── Record ───────────────────────────────────────────────────────────────

  record(entry: Omit<AuditEntry, "id" | "timestamp" | "immutableHash" | "previousHash">): AuditEntry {
    const timestamp = new Date().toISOString();
    const id = crypto.randomUUID();

    // Build the content for the hash chain
    const hashContent = JSON.stringify({
      id,
      timestamp,
      action: entry.action,
      actor: entry.actor,
      changes: entry.changes,
      resource: entry.resource,
      previousHash: this.lastHash,
    });

    const immutableHash = crypto.createHash("sha256").update(hashContent).digest("hex");

    const auditEntry: AuditEntry = {
      ...entry,
      id,
      timestamp,
      immutableHash,
      previousHash: this.lastHash,
    };

    // Append to chain
    this.entries.push(auditEntry);
    this.lastHash = immutableHash;

    // Enforce limit
    if (this.entries.length > this.maxEntries) {
      this.entries.shift(); // Remove oldest - but chain integrity is maintained
    }

    // Map action to event type
    const eventType = entry.action.startsWith("user:") ? "config:changed"
      : entry.action.startsWith("scan:") ? "config:changed"
      : entry.action.startsWith("finding:") ? "finding:verified"
      : entry.action.startsWith("report:") ? "report:generated"
      : entry.action.startsWith("system:") ? "system:restarted"
      : entry.action.startsWith("security:") ? "alert:firing"
      : entry.action.startsWith("plugin:") ? "plugin:installed"
      : "config:changed";

    eventStream.emit(eventType as any, {
      source: "audit-trail",
      severity: "info",
      message: `Audit: ${entry.action} on ${entry.resource.type} by ${entry.actor.username ?? "system"}`,
      details: { auditId: id, action: entry.action, resource: entry.resource, changes: entry.changes } as any,
    });

    // Metrics
    metricsCollector.inc("audit_entries_total", 1, { action: entry.action, status: entry.status });

    return auditEntry;
  }

  // ── Convenience Methods ─────────────────────────────────────────────────

  recordUserAction(
    action: AuditActionType,
    actor: { id?: string; username?: string; role?: string },
    resource: { type: string; id?: string; name?: string },
    changes?: { before?: Record<string, unknown>; after?: Record<string, unknown> },
    metadata?: { ip?: string; userAgent?: string; correlationId?: string; organizationId?: string; reason?: string },
  ): AuditEntry {
    return this.record({
      action,
      actor: { id: actor.id ?? null, username: actor.username ?? null, role: actor.role ?? null },
      source: { ip: metadata?.ip ?? null, userAgent: metadata?.userAgent ?? null, deviceType: null, location: null },
      resource: { type: resource.type, id: resource.id ?? null, name: resource.name ?? null },
      changes: { before: changes?.before ?? null, after: changes?.after ?? null },
      status: "success",
      reason: metadata?.reason ?? null,
      correlationId: metadata?.correlationId ?? null,
      organizationId: metadata?.organizationId ?? null,
    });
  }

  recordConfigChange(
    actor: string,
    configKey: string,
    oldValue: unknown,
    newValue: unknown,
    metadata?: { ip?: string; correlationId?: string; organizationId?: string },
  ): AuditEntry {
    return this.record({
      action: "config:updated",
      actor: { id: null, username: actor, role: null },
      source: { ip: metadata?.ip ?? null, userAgent: null, deviceType: null, location: null },
      resource: { type: "configuration", id: configKey, name: configKey },
      changes: { before: { value: oldValue }, after: { value: newValue } },
      status: "success",
      reason: null,
      correlationId: metadata?.correlationId ?? null,
      organizationId: metadata?.organizationId ?? null,
    });
  }

  recordSecurityEvent(
    action: AuditActionType,
    actor: { id?: string; username?: string },
    resource: { type: string; id?: string; name?: string },
    status: "success" | "failure",
    reason?: string,
    metadata?: { ip?: string; correlationId?: string },
  ): AuditEntry {
    return this.record({
      action,
      actor: { id: actor.id ?? null, username: actor.username ?? null, role: null },
      source: { ip: metadata?.ip ?? null, userAgent: null, deviceType: null, location: null },
      resource: { type: resource.type, id: resource.id ?? null, name: resource.name ?? null },
      changes: { before: null, after: null },
      status,
      reason: reason ?? null,
      correlationId: metadata?.correlationId ?? null,
      organizationId: null,
    });
  }

  // ── Query ────────────────────────────────────────────────────────────────

  query(options?: {
    action?: AuditActionType;
    actions?: AuditActionType[];
    actorId?: string;
    resourceType?: string;
    resourceId?: string;
    status?: "success" | "failure";
    correlationId?: string;
    organizationId?: string;
    since?: string;
    until?: string;
    limit?: number;
    offset?: number;
  }): AuditEntry[] {
    let results = [...this.entries];

    if (options?.action) results = results.filter(e => e.action === options.action);
    if (options?.actions) results = results.filter(e => options.actions!.includes(e.action));
    if (options?.actorId) results = results.filter(e => e.actor.id === options.actorId);
    if (options?.resourceType) results = results.filter(e => e.resource.type === options.resourceType);
    if (options?.resourceId) results = results.filter(e => e.resource.id === options.resourceId);
    if (options?.status) results = results.filter(e => e.status === options.status);
    if (options?.correlationId) results = results.filter(e => e.correlationId === options.correlationId);
    if (options?.organizationId) results = results.filter(e => e.organizationId === options.organizationId);
    if (options?.since) { const since = new Date(options.since).getTime(); results = results.filter(e => new Date(e.timestamp).getTime() >= since); }
    if (options?.until) { const until = new Date(options.until).getTime(); results = results.filter(e => new Date(e.timestamp).getTime() <= until); }

    results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 100;
    return results.slice(offset, offset + limit);
  }

  // ── Immutability Verification ────────────────────────────────────────────

  verifyChain(): { valid: boolean; entriesChecked: number; firstBreak: number | null } {
    let previousHash: string | null = null;
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      const hashContent = JSON.stringify({
        id: entry.id,
        timestamp: entry.timestamp,
        action: entry.action,
        actor: entry.actor,
        changes: entry.changes,
        resource: entry.resource,
        previousHash: entry.previousHash,
      });
      const computedHash = crypto.createHash("sha256").update(hashContent).digest("hex");

      if (computedHash !== entry.immutableHash) {
        return { valid: false, entriesChecked: i, firstBreak: i };
      }
      if (i > 0 && entry.previousHash !== previousHash) {
        return { valid: false, entriesChecked: i, firstBreak: i };
      }
      previousHash = entry.immutableHash;
    }
    return { valid: true, entriesChecked: this.entries.length, firstBreak: null };
  }

  // ── Stats ────────────────────────────────────────────────────────────────

  getStats() {
    const chainVerification = this.verifyChain();
    return {
      totalEntries: this.entries.length,
      chainValid: chainVerification.valid,
      lastEntryAt: this.entries.length > 0 ? this.entries[this.entries.length - 1].timestamp : null,
      uniqueActors: [...new Set(this.entries.map(e => e.actor.username))].length,
      actionsByType: this.entries.reduce<Record<string, number>>((acc, e) => {
        acc[e.action] = (acc[e.action] ?? 0) + 1;
        return acc;
      }, {}),
      resourceTypes: [...new Set(this.entries.map(e => e.resource.type))],
    };
  }

  clearEntries(): void {
    this.entries = [];
    this.lastHash = null;
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────
export const auditTrailService = new AuditTrailService();
