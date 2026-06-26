// ---------------------------------------------------------------------------
// Report Version Control / History Service ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
// Tracks report versions, history, approvals, and manages the audit trail.

import crypto from "node:crypto";
import { logger } from "../../lib/logger";
import type { ReportHistoryEntry, ReportResult } from "./types";

// ── Version Control Service ────────────────────────────────────────────────

export class ReportVersionControl {
  private versionHistory = new Map<string, ReportHistoryEntry[]>();
  private versionCounter = new Map<string, number>();

  // ── Create Version ──────────────────────────────────────────────────────

  createVersion(reportId: string): number {
    const current = this.versionCounter.get(reportId) ?? 0;
    const nextVer = current + 1;
    this.versionCounter.set(reportId, nextVer);
    return nextVer;
  }

  // ── Add History Entry ───────────────────────────────────────────────────

  addHistoryEntry(
    reportId: string,
    entry: Omit<ReportHistoryEntry, "version" | "createdAt">,
  ): ReportHistoryEntry {
    const version = this.createVersion(reportId);
    const historyEntry: ReportHistoryEntry = {
      version: `${version}.0`,
      createdAt: new Date().toISOString(),
      createdBy: entry.createdBy,
      action: entry.action,
      description: entry.description,
    };

    const entries = this.versionHistory.get(reportId) ?? [];
    entries.push(historyEntry);
    this.versionHistory.set(reportId, entries);

    logger.info({ reportId, version: historyEntry.version, action: historyEntry.action }, "[VERSION-CTRL] History entry added");
    return historyEntry;
  }

  // ── Get History ─────────────────────────────────────────────────────────

  getHistory(reportId: string): ReportHistoryEntry[] {
    return this.versionHistory.get(reportId) ?? [];
  }

  // ── Get Version ─────────────────────────────────────────────────────────

  getVersion(reportId: string, version: string): ReportHistoryEntry | null {
    const entries = this.versionHistory.get(reportId) ?? [];
    return entries.find(e => e.version === version) ?? null;
  }

  // ── Compare Versions ────────────────────────────────────────────────────

  compareVersions(
    reportId: string,
    versionA: string,
    versionB: string,
  ): { added: string[]; removed: string[]; changed: string[] } | null {
    const entryA = this.getVersion(reportId, versionA);
    const entryB = this.getVersion(reportId, versionB);

    if (!entryA || !entryB) return null;

    return {
      added: [],
      removed: [],
      changed: [
        `Version ${versionA} (${entryA.createdAt}) → Version ${versionB} (${entryB.createdAt})`,
        `Action: ${entryA.action} → ${entryB.action}`,
      ],
    };
  }

  // ── Generate Version String ─────────────────────────────────────────────

  getVersionString(reportId: string, majorVersion: number): string {
    const minor = this.createVersion(reportId);
    return `${majorVersion}.${minor}`;
  }

  // ── Get Version Count ───────────────────────────────────────────────────

  getVersionCount(reportId: string): number {
    return this.versionHistory.get(reportId)?.length ?? 0;
  }

  // ── Clear History ───────────────────────────────────────────────────────

  clearHistory(reportId: string): void {
    this.versionHistory.delete(reportId);
    this.versionCounter.delete(reportId);
  }

  // ── Generate Audit Trail ────────────────────────────────────────────────

  generateAuditTrail(reportId: string): string {
    const entries = this.getHistory(reportId);
    const lines: string[] = [
      "═══════════════════════════════════════════════",
      "  REPORT AUDIT TRAIL",
      `  Report ID: ${reportId}`,
      `  Total Entries: ${entries.length}`,
      "═══════════════════════════════════════════════",
      "",
    ];

    for (const entry of entries) {
      lines.push(`  [${entry.createdAt}]`);
      lines.push(`  Version:   ${entry.version}`);
      lines.push(`  Action:    ${entry.action.toUpperCase()}`);
      lines.push(`  By:        ${entry.createdBy ?? "system"}`);
      lines.push(`  Detail:    ${entry.description}`);
      lines.push("  ───────────────────────────────────────");
      lines.push("");
    }

    return lines.join("\n");
  }

  // ── Detect Duplicates ───────────────────────────────────────────────────

  detectDuplicate(reportId: string, otherReportId: string): boolean {
    const historyA = this.getHistory(reportId);
    const historyB = this.getHistory(otherReportId);

    if (historyA.length === 0 || historyB.length === 0) return false;

    // Compare first history entries
    const firstA = historyA[0];
    const firstB = historyB[0];

    return (
      firstA.action === firstB.action &&
      Math.abs(
        new Date(firstA.createdAt).getTime() -
        new Date(firstB.createdAt).getTime(),
      ) < 1000
    );
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────
export const reportVersionControl = new ReportVersionControl();
