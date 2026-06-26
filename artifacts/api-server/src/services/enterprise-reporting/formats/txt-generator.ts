// ---------------------------------------------------------------------------
// Plain Text Report Generator ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
// Generates plain text reports for easy sharing, terminal viewing,
// and maximum compatibility.

import type { ReportData } from "../../report-generator";

// ── Text Generator ─────────────────────────────────────────────────────────

export function generateTextReport(data: ReportData): string {
  const lines: string[] = [];
  const separator = "=".repeat(72);
  const subSeparator = "-".repeat(72);
  const thinSeparator = "·".repeat(72);

  // Header
  lines.push(separator);
  lines.push("V8 SECURITY ASSESSMENT REPORT — PLAIN TEXT");
  lines.push(separator);
  lines.push("");
  lines.push(`  Scan ID:     #${String(data.scanId).padStart(4, "0")}`);
  lines.push(`  Target:      ${data.target}`);
  lines.push(`  Status:      ${data.status.toUpperCase()}`);
  lines.push(`  Duration:    ${data.durationMs ? `${(data.durationMs / 1000).toFixed(1)}s` : "N/A"}`);
  lines.push(`  Generated:   ${new Date().toISOString().slice(0, 19).replace("T", " ")} UTC`);
  lines.push(`  Tools:       ${data.toolsUsed.join(", ") || "None"}`);
  lines.push("");

  // Executive Summary
  lines.push(subSeparator);
  lines.push("1. EXECUTIVE SUMMARY");
  lines.push(subSeparator);
  lines.push("");

  const cr = data.severities.critical ?? 0;
  const hi = data.severities.high ?? 0;
  const me = data.severities.medium ?? 0;
  const lo = data.severities.low ?? 0;
  const info = data.severities.info ?? 0;

  lines.push(`  Total Findings: ${data.totalFindings}`);
  lines.push(`  Critical:       ${cr}`);
  lines.push(`  High:           ${hi}`);
  lines.push(`  Medium:         ${me}`);
  lines.push(`  Low:            ${lo}`);
  lines.push(`  Info:           ${info}`);
  lines.push("");
  lines.push(`  AI Validated:   ${data.findings.filter(f => f.aiValidated).length}/${data.totalFindings}`);
  lines.push(`  Confirmed:      ${data.statuses.confirmed ?? 0}`);
  lines.push(`  False Positive: ${data.statuses.false_positive ?? 0}`);
  lines.push(`  Inconclusive:   ${data.statuses.inconclusive ?? 0}`);
  lines.push("");

  // Severity Distribution
  lines.push(subSeparator);
  lines.push("2. SEVERITY DISTRIBUTION");
  lines.push(subSeparator);
  lines.push("");

  const total = data.totalFindings || 1;
  const sevOrder = ["critical", "high", "medium", "low", "info"];
  for (const sev of sevOrder) {
    const count = data.severities[sev] ?? 0;
    const pct = ((count / total) * 100).toFixed(1);
    const barLen = Math.round((count / Math.max(...sevOrder.map(s => data.severities[s] ?? 0), 1)) * 30);
    const bar = "█".repeat(barLen);
    lines.push(`  ${sev.toUpperCase().padEnd(10)} ${String(count).padStart(4)} (${pct.padStart(5)}%)  ${bar}`);
  }
  lines.push("");

  // Detailed Findings
  lines.push(subSeparator);
  lines.push(`3. DETAILED FINDINGS (${data.totalFindings})`);
  lines.push(subSeparator);
  lines.push("");

  if (data.findings.length === 0) {
    lines.push("  No vulnerabilities were found during this scan.");
    lines.push("");
  } else {
    for (const f of data.findings) {
      lines.push(`  [${f.severity.toUpperCase().padEnd(8)}] ${f.title}`);
      lines.push(`         Status: ${f.status.toUpperCase()}${f.aiValidated ? " [AI VERIFIED]" : ""}`);
      lines.push(`         URL:    ${f.url}`);
      if (f.description) {
        lines.push(`         Desc:   ${f.description.slice(0, 200)}`);
      }
      if (f.evidence) {
        lines.push(`         Evidence:`);
        lines.push(`           ${f.evidence.slice(0, 500).replace(/\n/g, "\n           ")}`);
      }
      if (f.fix) {
        lines.push(`         Fix:`);
        lines.push(`           ${f.fix.slice(0, 500).replace(/\n/g, "\n           ")}`);
      }
      lines.push(thinSeparator);
    }
  }

  // Scan Logs
  if (data.logs.length > 0) {
    lines.push(subSeparator);
    lines.push("4. SCAN LOGS");
    lines.push(subSeparator);
    lines.push("");

    for (const log of data.logs.slice(0, 50)) {
      const time = log.timestamp.slice(11, 19);
      lines.push(`  [${time}] [${log.level.toUpperCase().padEnd(7)}] ${log.message}`);
    }
    lines.push("");
  }

  // Footer
  lines.push(separator);
  lines.push("  V8 NEURAL EXPLOITATION PLATFORM — CONFIDENTIAL");
  lines.push(`  Generated: ${new Date().toISOString()}`);
  lines.push(separator);

  return lines.join("\n");
}
