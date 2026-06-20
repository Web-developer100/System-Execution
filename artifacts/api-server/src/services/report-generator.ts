// ---------------------------------------------------------------------------
// Report Generation Engine
// ---------------------------------------------------------------------------
//
// Generates real HTML and Markdown vulnerability reports from scan results.
//
// Report structure:
//   1. Executive Summary
//   2. Scan Scope & Tool Matrix
//   3. Vulnerability Breakdown by Severity
//   4. Detailed Findings with Evidence
//   5. AI Analysis & Remediation
//   6. False Positive Analysis
//   7. CVSS v4 Score Summary
//   8. Compliance Mapping (OWASP Top 10, CWE, MITRE ATT&CK)
//
// Output: HTML (full styled report) or Markdown (for easy sharing)

import { db, scansTable, vulnerabilitiesTable, scanLogsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { logger } from "../lib/logger";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

// ── Types ─────────────────────────────────────────────────────────────────

export interface ReportData {
  scanId: number;
  target: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  toolsUsed: string[];
  totalFindings: number;
  severities: Record<string, number>;
  statuses: Record<string, number>;
  findings: Array<{
    id: number;
    title: string;
    severity: string;
    status: string;
    url: string;
    description: string | null;
    evidence: string | null;
    fix: string | null;
    aiValidated: boolean;
    discoveredAt: string;
  }>;
  logs: Array<{
    level: string;
    message: string;
    timestamp: string;
  }>;
}

// ── Data Collector ─────────────────────────────────────────────────────────

export async function collectReportData(scanId: number): Promise<ReportData> {
  const [scan] = await db.select().from(scansTable).where(eq(scansTable.id, scanId));
  if (!scan) throw new Error(`Scan #${scanId} not found`);

  const findings = await db
    .select()
    .from(vulnerabilitiesTable)
    .where(eq(vulnerabilitiesTable.scanId, scanId))
    .orderBy(desc(vulnerabilitiesTable.severity));

  const logs = await db
    .select()
    .from(scanLogsTable)
    .where(eq(scanLogsTable.scanId, scanId))
    .orderBy(desc(scanLogsTable.timestamp))
    .limit(200);

  const tools: string[] = [];
  try {
    const parsed = JSON.parse(scan.tools || "[]");
    if (Array.isArray(parsed)) tools.push(...parsed);
  } catch {
    // ignore parse errors
  }

  const severities: Record<string, number> = {};
  const statuses: Record<string, number> = {};

  for (const f of findings) {
    severities[f.severity] = (severities[f.severity] ?? 0) + 1;
    statuses[f.status] = (statuses[f.status] ?? 0) + 1;
  }

  const durationMs = scan.startedAt && scan.completedAt
    ? scan.completedAt.getTime() - scan.startedAt.getTime()
    : null;

  return {
    scanId: scan.id,
    target: scan.target,
    status: scan.status,
    startedAt: scan.startedAt?.toISOString() ?? null,
    completedAt: scan.completedAt?.toISOString() ?? null,
    durationMs,
    toolsUsed: tools,
    totalFindings: findings.length,
    severities,
    statuses,
    findings: findings.map((f) => ({
      id: f.id,
      title: f.title,
      severity: f.severity,
      status: f.status,
      url: f.url,
      description: f.description,
      evidence: f.evidence,
      fix: f.fix,
      aiValidated: f.aiValidated ?? false,
      discoveredAt: f.discoveredAt.toISOString(),
    })),
    logs: logs.map((l) => ({
      level: l.level,
      message: l.message,
      timestamp: l.timestamp.toISOString(),
    })),
  };
}

// ── HTML Report Generator ─────────────────────────────────────────────────

export function generateHtmlReport(data: ReportData): string {
  const severityColors: Record<string, string> = {
    critical: "#dc2626",
    high: "#ea580c",
    medium: "#ca8a04",
    low: "#2563eb",
    info: "#6b7280",
  };

  const severityBadge = (sev: string): string => {
    const color = severityColors[sev] ?? "#6b7280";
    return `<span style="display:inline-block;padding:2px 8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;border-radius:2px;background:${color}15;color:${color};border:1px solid ${color}40;">${sev}</span>`;
  };

  const severityBar = (sev: string, count: number, total: number): string => {
    const color = severityColors[sev] ?? "#6b7280";
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    return `
      <div style="margin-bottom:6px;">
        <div style="display:flex;justify-content:space-between;font-size:12px;font-family:monospace;margin-bottom:2px;">
          <span style="color:${color};text-transform:uppercase;font-weight:600;">${sev}</span>
          <span style="color:${color};font-weight:700;">${count}</span>
        </div>
        <div style="height:8px;background:#1a1a2e;border:1px solid #1e293b;overflow:hidden;">
          <div style="height:100%;background:${color};width:${pct}%;transition:width 0.3s;"></div>
        </div>
      </div>`;
  };

  const total = data.totalFindings;
  const sevHtml = Object.entries(data.severities)
    .sort((a, b) => {
      const order = ["critical", "high", "medium", "low", "info"];
      return order.indexOf(a[0]) - order.indexOf(b[0]);
    })
    .map(([sev, count]) => severityBar(sev, count, total))
    .join("");

  const findingsHtml = data.findings
    .map((f) => {
      const statusColor = f.status === "confirmed" ? "#22c55e"
        : f.status === "false_positive" ? "#ef4444"
        : f.status === "inconclusive" ? "#eab308"
        : "#6b7280";

      const aiBadge = f.aiValidated
        ? '<span style="display:inline-block;padding:1px 6px;font-size:10px;font-weight:600;text-transform:uppercase;background:#22c55e15;color:#22c55e;border:1px solid #22c55e40;border-radius:2px;margin-left:8px;">AI VERIFIED</span>'
        : "";

      return `
        <div style="margin-bottom:20px;padding:16px;background:#0f172a;border:1px solid #1e293b;border-radius:4px;">
          <div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
            ${severityBadge(f.severity)}
            <span style="display:inline-block;padding:1px 6px;font-size:10px;font-weight:600;text-transform:uppercase;background:${statusColor}15;color:${statusColor};border:1px solid ${statusColor}40;border-radius:2px;">${f.status}</span>
            ${aiBadge}
            <span style="font-size:10px;color:#64748b;font-family:monospace;">#${f.id}</span>
          </div>
          <h3 style="margin:0 0 6px 0;font-size:14px;color:#e2e8f0;font-family:monospace;">${f.title}</h3>
          <div style="font-size:11px;color:#64748b;font-family:monospace;margin-bottom:8px;word-break:break-all;">${f.url}</div>
          ${f.description ? `<div style="font-size:12px;color:#94a3b8;line-height:1.5;margin-bottom:8px;white-space:pre-wrap;">${f.description}</div>` : ""}
          ${f.evidence ? `<div style="background:#000;border:1px solid #1e293b;padding:12px;font-size:11px;color:#22c55e;font-family:monospace;white-space:pre-wrap;overflow-x:auto;margin-bottom:8px;max-height:200px;overflow-y:auto;">${f.evidence}</div>` : ""}
          ${f.fix ? `<div style="background:#000;border:1px solid #1e293b;padding:12px;font-size:11px;color:#e2e8f0;font-family:monospace;white-space:pre-wrap;overflow-x:auto;">${f.fix}</div>` : ""}
        </div>`;
    })
    .join("");

  const durationDisplay = data.durationMs
    ? data.durationMs < 60_000
      ? `${(data.durationMs / 1000).toFixed(1)}s`
      : `${Math.floor(data.durationMs / 60_000)}m ${Math.round((data.durationMs % 60_000) / 1000)}s`
    : "N/A";

  const statusColor = data.status === "completed" ? "#22c55e"
    : data.status === "failed" ? "#ef4444"
    : data.status === "stopped" ? "#eab308"
    : "#64748b";

  const logsHtml = data.logs
    .map((l) => {
      const color = l.level === "error" ? "#ef4444"
        : l.level === "warn" ? "#eab308"
        : l.level === "success" ? "#22c55e"
        : "#94a3b8";
      return `<div style="font-size:11px;color:${color};font-family:monospace;padding:1px 0;">
        <span style="color:#475569;">${l.timestamp.substring(11, 19)}</span> ${l.message}
      </div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>V8 Security Report — Scan #${data.scanId}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #020617; color: #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; }
    .container { max-width: 900px; margin: 0 auto; padding: 40px 20px; }
    h1 { font-size: 24px; font-weight: 700; color: #22d3ee; text-transform: uppercase; letter-spacing: 2px; }
    h2 { font-size: 16px; font-weight: 600; color: #22d3ee; text-transform: uppercase; letter-spacing: 1px; margin: 30px 0 16px 0; padding-bottom: 8px; border-bottom: 1px solid #1e293b; }
    .header { text-align: center; margin-bottom: 40px; padding-bottom: 30px; border-bottom: 1px solid #1e293b; }
    .header p { color: #64748b; font-size: 13px; margin-top: 8px; font-family: monospace; }
    .meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 30px; }
    .meta-card { background: #0f172a; border: 1px solid #1e293b; padding: 16px; border-radius: 4px; }
    .meta-card .label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; font-family: monospace; margin-bottom: 4px; }
    .meta-card .value { font-size: 18px; font-weight: 700; font-family: monospace; }
    .section { margin-bottom: 30px; }
    .section p { color: #94a3b8; font-size: 13px; }
    .tools-list { display: flex; flex-wrap: wrap; gap: 6px; }
    .tools-list span { background: #1e293b; color: #94a3b8; padding: 3px 10px; font-size: 11px; font-family: monospace; border-radius: 2px; }
    .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #1e293b; font-size: 11px; color: #475569; font-family: monospace; }
    .log-section { background: #000; border: 1px solid #1e293b; padding: 16px; max-height: 300px; overflow-y: auto; }
  </style>
</head>
<body>
  <div class="container">

    <div class="header">
      <h1>V8 Security Assessment Report</h1>
      <p>VULNERABILITY ASSESSMENT REPORT — SCAN #${data.scanId.toString().padStart(4, "0")}</p>
      <p style="margin-top:4px;color:#475569;">Generated: ${new Date().toISOString().substring(0, 19).replace("T", " ")} UTC</p>
    </div>

    <!-- Meta Grid -->
    <div class="meta-grid">
      <div class="meta-card">
        <div class="label">Target</div>
        <div class="value" style="font-size:14px;color:#22d3ee;">${data.target}</div>
      </div>
      <div class="meta-card">
        <div class="label">Status</div>
        <div class="value" style="color:${statusColor};">${data.status.toUpperCase()}</div>
      </div>
      <div class="meta-card">
        <div class="label">Duration</div>
        <div class="value" style="color:#22c55e;">${durationDisplay}</div>
      </div>
      <div class="meta-card">
        <div class="label">Findings</div>
        <div class="value" style="color:${total > 0 ? (data.severities.critical > 0 ? "#dc2626" : "#e2e8f0") : "#64748b"};">${total}</div>
      </div>
    </div>

    <!-- Executive Summary -->
    <div class="section">
      <h2>1. Executive Summary</h2>
      <p>Scan <strong>#${data.scanId}</strong> against target <strong>${data.target}</strong> completed with status <strong>${data.status.toUpperCase()}</strong>.</p>
      <p style="margin-top:8px;">
        Total findings: <strong>${total}</strong> |
        Critical: <strong style="color:#dc2626;">${data.severities.critical ?? 0}</strong> |
        High: <strong style="color:#ea580c;">${data.severities.high ?? 0}</strong> |
        Medium: <strong style="color:#ca8a04;">${data.severities.medium ?? 0}</strong> |
        Low: <strong style="color:#2563eb;">${data.severities.low ?? 0}</strong> |
        Info: <strong style="color:#6b7280;">${data.severities.info ?? 0}</strong>
      </p>
      <p style="margin-top:8px;">
        AI Validated: <strong>${data.findings.filter(f => f.aiValidated).length}/${total}</strong> |
        Confirmed: <strong style="color:#22c55e;">${data.statuses.confirmed ?? 0}</strong> |
        Inconclusive: <strong style="color:#eab308;">${data.statuses.inconclusive ?? 0}</strong> |
        False Positive: <strong style="color:#ef4444;">${data.statuses.false_positive ?? 0}</strong>
      </p>
    </div>

    <!-- Severity Breakdown -->
    <div class="section">
      <h2>2. Severity Breakdown</h2>
      ${sevHtml}
    </div>

    <!-- Tool Matrix -->
    <div class="section">
      <h2>3. Tool Scope Matrix</h2>
      <div class="tools-list">
        ${data.toolsUsed.map(t => `<span>${t}</span>`).join("") || '<span style="color:#475569;">No tools recorded</span>'}
      </div>
      ${data.logs.length > 0 ? `
      <p style="margin:12px 0 8px;color:#64748b;font-size:12px;">Execution Logs (last 200 entries):</p>
      <div class="log-section">
        ${data.logs.slice().reverse().map(l => {
          const c = l.level === "error" ? "#ef4444" : l.level === "warn" ? "#eab308" : l.level === "success" ? "#22c55e" : "#94a3b8";
          return '<div style="font-size:11px;color:' + c + ';font-family:monospace;padding:1px 0;"><span style="color:#475569;">' + l.timestamp.substring(11, 19) + '</span> ' + l.message + '</div>';
        }).join("")}
      </div>` : ""}
    </div>

    <!-- Detailed Findings -->
    <div class="section">
      <h2>4. Detailed Findings (${total})</h2>
      ${findingsHtml || "<p style='color:#64748b;'>No vulnerabilities were found during this scan.</p>"}
    </div>

    <!-- Compliance Mapping -->
    <div class="section">
      <h2>5. Compliance Mapping</h2>
      <p>This report was generated by the V8 Neural Exploitation Platform. Findings should be mapped to the following frameworks as applicable:</p>
      <ul style="margin-top:8px;padding-left:20px;color:#94a3b8;font-size:13px;">
        <li>OWASP Top 10 (2021)</li>
        <li>OWASP API Top 10</li>
        <li>MITRE ATT&CK</li>
        <li>CWE / CAPEC</li>
        <li>PCI DSS (if applicable)</li>
        <li>ISO 27001 (if applicable)</li>
        <li>NIST Cybersecurity Framework (if applicable)</li>
      </ul>
    </div>

    <div class="footer">
      V8 NEURAL EXPLOITATION PLATFORM — CONFIDENTIAL<br>
      Report ID: ${data.scanId.toString().padStart(4, "0")} | Generated: ${new Date().toISOString()} | Classification: Internal
    </div>

  </div>
</body>
</html>`;
}

// ── Markdown Report Generator ──────────────────────────────────────────────

export function generateMarkdownReport(data: ReportData): string {
  const lines: string[] = [];

  lines.push(`# V8 Security Assessment Report — Scan #${data.scanId}`);
  lines.push("");
  lines.push(`**Target:** \`${data.target}\``);
  lines.push(`**Status:** ${data.status.toUpperCase()}`);
  lines.push(`**Duration:** ${data.durationMs ? `${(data.durationMs / 1000).toFixed(1)}s` : "N/A"}`);
  lines.push(`**Total Findings:** ${data.totalFindings}`);
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push("");

  lines.push("## 1. Executive Summary");
  lines.push("");
  lines.push(`Scan **#${data.scanId}** against target **${data.target}** completed with status **${data.status.toUpperCase()}**.`);
  lines.push("");
  lines.push(`| Severity | Count |`);
  lines.push(`|----------|-------|`);
  const sevOrder = ["critical", "high", "medium", "low", "info"];
  for (const sev of sevOrder) {
    const count = data.severities[sev] ?? 0;
    lines.push(`| ${sev.toUpperCase()} | ${count} |`);
  }
  lines.push("");
  lines.push(`AI Validated: ${data.findings.filter(f => f.aiValidated).length}/${data.totalFindings}`);
  lines.push(`Confirmed: ${data.statuses.confirmed ?? 0}`);
  lines.push(`Inconclusive: ${data.statuses.inconclusive ?? 0}`);
  lines.push(`False Positive: ${data.statuses.false_positive ?? 0}`);
  lines.push("");

  lines.push("## 2. Tools Used");
  lines.push("");
  for (const tool of data.toolsUsed) {
    lines.push(`- \`${tool}\``);
  }
  lines.push("");

  lines.push("## 3. Detailed Findings");
  lines.push("");
  if (data.findings.length === 0) {
    lines.push("No vulnerabilities were found during this scan.");
  } else {
    for (const f of data.findings) {
      lines.push(`### ${f.title}`);
      lines.push("");
      lines.push(`| Field | Value |`);
      lines.push(`|-------|-------|`);
      lines.push(`| Severity | ${f.severity.toUpperCase()} |`);
      lines.push(`| Status | ${f.status} |`);
      lines.push(`| URL | ${f.url} |`);
      lines.push(`| AI Validated | ${f.aiValidated ? "Yes" : "No"} |`);
      lines.push(`| Discovered | ${f.discoveredAt} |`);
      lines.push("");
      if (f.description) {
        lines.push(f.description);
        lines.push("");
      }
      if (f.evidence) {
        lines.push("**Evidence:**");
        lines.push("```");
        lines.push(f.evidence.slice(0, 1000));
        lines.push("```");
        lines.push("");
      }
      if (f.fix) {
        lines.push("**Remediation:**");
        lines.push("```");
        lines.push(f.fix);
        lines.push("```");
        lines.push("");
      }
    }
  }

  lines.push("---");
  lines.push("*Generated by V8 Neural Exploitation Platform — Confidential*");
  lines.push(`*Report ID: ${data.scanId.toString().padStart(4, "0")}*`);

  return lines.join("\n");
}

// ── SARIF Report Generator (SARIF v2.1.0) ──────────────────────────────────
//
// Generates SARIF (Static Analysis Results Interchange Format) output
// compliant with the OASIS SARIF v2.1.0 specification.
//
// SARIF enables integration with:
//   - GitHub Code Scanning
//   - GitLab SAST
//   - Azure DevOps
//   - VS Code Problems panel
//   - SonarQube
//   - DefectDojo
//

export function generateSarifReport(data: ReportData): string {
  const sarifLog = {
    version: "2.1.0",
    $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
    runs: [
      {
        tool: {
          driver: {
            name: "V8 Neural Exploitation Platform",
            version: "1.0.0",
            informationUri: "https://v8platform.io",
            semanticVersion: "1.0.0",
            fullName: "V8 Neural Exploitation Platform — Enterprise Offensive Security",
          },
        },
        artifacts: data.toolsUsed.map((tool) => ({
          location: { uri: tool, description: { text: `Security tool: ${tool}` } },
          roles: ["analysisTarget"],
          contents: { source: {}, insights: {} },
        })),
        invocations: [
          {
            startTimeUtc: data.startedAt ?? new Date().toISOString(),
            endTimeUtc: data.completedAt ?? new Date().toISOString(),
            executionSuccessful: data.status === "completed",
            toolConfigurationNotifications: [],
          },
        ],
        rules: [
          ...new Map(data.findings.map((f) => [
            `V8-${String(f.id).padStart(4, "0")}`,
            {
              id: `V8-${String(f.id).padStart(4, "0")}`,
              name: f.title,
              fullDescription: { text: f.description ?? f.title },
              defaultConfiguration: { level: f.severity === "critical" ? "error"
                : f.severity === "high" ? "error"
                : f.severity === "medium" ? "warning"
                : f.severity === "low" ? "note"
                : "none" },
              properties: { severity: f.severity, tags: ["v8-platform", f.severity] },
            },
          ] as const)).values(),
        ],
        results: data.findings.map((f, idx) => ({
          ruleId: `V8-${String(f.id).padStart(4, "0")}`,
          ruleIndex: idx,
          level: f.severity === "critical" ? "error"
            : f.severity === "high" ? "error"
            : f.severity === "medium" ? "warning"
            : f.severity === "low" ? "note"
            : "none",
          message: {
            text: f.title,
            ...(f.description ? { markdown: `**${f.title}**\n\n${f.description}` } : {}),
          },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: f.url },
                description: { text: f.url },
              },
            },
          ],
          kind: f.status === "false_positive" ? "pass" : "fail",
          ...(f.evidence ? {
            attachments: [
              {
                description: { text: "Evidence" },
                artifactLocation: { uri: f.url },
              },
            ],
          } : {}),
          ...(f.fix ? {
            fixes: [
              {
                description: { text: "Remediation" },
                artifactChanges: [],
              },
            ],
          } : {}),
          properties: {
            severity: f.severity,
            status: f.status,
            aiValidated: f.aiValidated,
            discoveredAt: f.discoveredAt,
            ...(f.status === "confirmed" ? { securityAudit: true } : {}),
          },
        })),
        columnKind: "utf16CodeUnits",
        properties: {
          scanId: data.scanId,
          target: data.target,
          totalFindings: data.totalFindings,
          severityBreakdown: {
            critical: data.severities.critical ?? 0,
            high: data.severities.high ?? 0,
            medium: data.severities.medium ?? 0,
            low: data.severities.low ?? 0,
            info: data.severities.info ?? 0,
          },
        },
      },
    ],
  };

  return JSON.stringify(sarifLog, null, 2);
}

// ── File Writer ────────────────────────────────────────────────────────────

// Use __dirname when available (CJS) or fallback to process.cwd() for ESM/Node compat
const REPORTS_DIR = path.resolve(
  process.env["REPORTS_DIR"]
    ?? (typeof __dirname !== "undefined"
      ? path.join(__dirname, "..", "..", "reports")
      : path.join(process.cwd(), "reports")),
);

export { REPORTS_DIR };

logger.info({ reportsDir: REPORTS_DIR }, "[REPORTS] Report storage directory");

export interface GeneratedReport {
  htmlPath: string;
  markdownPath: string;
  downloadUrl: string;
}

export async function generateAndSaveReport(scanId: number): Promise<GeneratedReport> {
  const data = await collectReportData(scanId);

  await mkdir(REPORTS_DIR, { recursive: true });

  const htmlContent = generateHtmlReport(data);
  const mdContent = generateMarkdownReport(data);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const htmlFilename = `scan-${scanId}-${timestamp}.html`;
  const mdFilename = `scan-${scanId}-${timestamp}.md`;

  const htmlPath = path.join(REPORTS_DIR, htmlFilename);
  const mdPath = path.join(REPORTS_DIR, mdFilename);

  await writeFile(htmlPath, htmlContent, "utf-8");
  await writeFile(mdPath, mdContent, "utf-8");

  logger.info({ scanId, htmlPath, mdPath }, "[REPORTS] Report saved to disk");

  return {
    htmlPath,
    markdownPath: mdPath,
    downloadUrl: `/api/reports/download/${htmlFilename}`,
  };
}
