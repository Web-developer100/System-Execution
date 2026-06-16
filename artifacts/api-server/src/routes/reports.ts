import { Router, type IRouter } from "express";
import { db, reportsTable, scansTable, vulnerabilitiesTable, toolsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function formatReport(r: typeof reportsTable.$inferSelect) {
  return {
    id: r.id,
    scanId: r.scanId,
    status: r.status,
    downloadUrl: r.downloadUrl ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

function severityColor(sev: string): string {
  const colors: Record<string, string> = {
    critical: "#ef4444",
    high: "#f97316",
    medium: "#eab308",
    low: "#3b82f6",
    info: "#6b7280",
  };
  return colors[sev] ?? "#6b7280";
}

function severityBar(count: number, total: number, color: string): string {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return `<div style="display:flex;align-items:center;gap:12px;margin:8px 0;">
    <div style="width:80px;font-size:11px;text-transform:uppercase;color:${color};font-family:monospace;letter-spacing:2px;">${count}</div>
    <div style="flex:1;height:6px;background:#111;border:1px solid #1a2a1a;">
      <div style="width:${pct}%;height:100%;background:${color};box-shadow:0 0 8px ${color}66;transition:width 0.5s;"></div>
    </div>
    <div style="width:40px;font-size:10px;color:#555;font-family:monospace;text-align:right;">${pct}%</div>
  </div>`;
}

async function generateReportHtml(reportId: number, scanId: number): Promise<string> {
  const [scan] = await db.select().from(scansTable).where(eq(scansTable.id, scanId));
  const vulns = await db.select().from(vulnerabilitiesTable).where(eq(vulnerabilitiesTable.scanId, scanId));
  const tools = await db.select().from(toolsTable);

  const scanTools = JSON.parse(scan?.tools || "[]") as string[];
  const target = scan?.target ?? "Unknown Target";
  const generatedAt = new Date().toLocaleString("en-GB", { timeZone: "UTC", hour12: false });

  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const v of vulns) {
    const s = v.severity as keyof typeof counts;
    if (s in counts) counts[s]++;
  }
  const total = vulns.length;
  const aiValidated = vulns.filter(v => v.aiValidated).length;

  const riskLevel = counts.critical > 0 ? "CRITICAL" : counts.high > 2 ? "HIGH" : counts.medium > 3 ? "MEDIUM" : "LOW";
  const riskColor = riskLevel === "CRITICAL" ? "#ef4444" : riskLevel === "HIGH" ? "#f97316" : riskLevel === "MEDIUM" ? "#eab308" : "#22c55e";

  const vulnsHtml = vulns.map((v, idx) => `
    <div style="margin:16px 0;padding:20px;border:1px solid ${severityColor(v.severity)}44;background:#050f05;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
        <span style="padding:3px 10px;background:${severityColor(v.severity)}22;border:1px solid ${severityColor(v.severity)};color:${severityColor(v.severity)};font-family:monospace;font-size:11px;text-transform:uppercase;letter-spacing:2px;">${v.severity}</span>
        ${v.aiValidated ? `<span style="padding:3px 10px;background:#10b98122;border:1px solid #10b981;color:#10b981;font-family:monospace;font-size:10px;text-transform:uppercase;letter-spacing:1px;">◆ AI VERIFIED</span>` : ""}
        <span style="color:#555;font-family:monospace;font-size:10px;margin-left:auto;">FINDING #${String(idx + 1).padStart(3, "0")}</span>
      </div>
      <h3 style="color:#10b981;font-family:monospace;font-size:14px;margin:0 0 8px;text-shadow:0 0 8px #10b98166;">${v.title}</h3>
      <div style="color:#10b98166;font-family:monospace;font-size:11px;margin-bottom:12px;word-break:break-all;">${v.url}</div>
      ${v.description ? `<div style="margin:12px 0;"><div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#555;font-family:monospace;margin-bottom:6px;">DESCRIPTION</div><p style="color:#aaa;font-size:12px;line-height:1.7;font-family:monospace;">${v.description.replace(/\n/g, "<br>")}</p></div>` : ""}
      ${v.evidence ? `<div style="margin:12px 0;"><div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#555;font-family:monospace;margin-bottom:6px;">EVIDENCE PAYLOAD</div><pre style="background:#000;border:1px solid #1a2a1a;padding:14px;font-family:monospace;font-size:11px;color:#22c55e;overflow-x:auto;white-space:pre-wrap;line-height:1.6;">${v.evidence.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre></div>` : ""}
      ${v.fix ? `<div style="margin:12px 0;"><div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#555;font-family:monospace;margin-bottom:6px;">◆ AI-GENERATED REMEDIATION PATCH</div><pre style="background:#000517;border:1px solid #10b98133;padding:14px;font-family:monospace;font-size:11px;color:#10b981;overflow-x:auto;white-space:pre-wrap;line-height:1.6;">${v.fix.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre></div>` : ""}
    </div>
  `).join("");

  const toolRows = tools.map(tool => `
    <tr>
      <td style="padding:10px 14px;font-family:monospace;font-size:12px;color:#10b981;">${tool.name}</td>
      <td style="padding:10px 14px;font-family:monospace;font-size:11px;color:#555;">${tool.version ?? "N/A"}</td>
      <td style="padding:10px 14px;">
        <span style="padding:2px 8px;background:${tool.status === "active" ? "#10b98122" : "#ef444422"};border:1px solid ${tool.status === "active" ? "#10b981" : "#ef4444"};color:${tool.status === "active" ? "#10b981" : "#ef4444"};font-family:monospace;font-size:10px;text-transform:uppercase;">${tool.status}</span>
      </td>
      <td style="padding:10px 14px;font-family:monospace;font-size:11px;color:${scanTools.includes(tool.name.toLowerCase()) ? "#10b981" : "#333"};">${scanTools.map(s => s.toLowerCase()).includes(tool.name.toLowerCase()) ? "DEPLOYED" : "EXCLUDED"}</td>
    </tr>
  `).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>V8 Security Assessment Report #${reportId}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #020b02; color: #10b981; font-family: 'Share Tech Mono', 'Courier New', monospace; min-height: 100vh; }
    body::before { content: ''; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.05) 2px, rgba(0,0,0,0.05) 4px); pointer-events: none; z-index: 1000; }
    .container { max-width: 1100px; margin: 0 auto; padding: 40px 24px; }
    .glow { text-shadow: 0 0 10px #10b981, 0 0 20px #10b98166; }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div style="border-bottom:2px solid #10b981;padding-bottom:28px;margin-bottom:32px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <div style="font-size:11px;letter-spacing:4px;color:#555;text-transform:uppercase;margin-bottom:8px;">V8 NEURAL EXPLOITATION PLATFORM</div>
          <h1 class="glow" style="font-size:28px;letter-spacing:3px;text-transform:uppercase;">SECURITY ASSESSMENT REPORT</h1>
          <div style="color:#555;font-size:12px;margin-top:8px;letter-spacing:2px;">REPORT_ID: ${String(reportId).padStart(6, "0")} ● SCAN_ID: ${String(scanId).padStart(4, "0")}</div>
        </div>
        <div style="text-align:right;">
          <div style="padding:12px 20px;border:2px solid ${riskColor};background:${riskColor}11;">
            <div style="font-size:10px;letter-spacing:3px;color:#555;margin-bottom:4px;">RISK LEVEL</div>
            <div style="font-size:20px;font-weight:bold;color:${riskColor};text-shadow:0 0 12px ${riskColor}88;">${riskLevel}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Metadata -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:36px;">
      ${[
        ["TARGET", target],
        ["GENERATED", generatedAt + " UTC"],
        ["OPERATOR", "V8-KERNEL / AUTOMATED"],
      ].map(([label, value]) => `
        <div style="padding:16px;border:1px solid #1a2a1a;background:#050f05;">
          <div style="font-size:10px;letter-spacing:2px;color:#555;margin-bottom:6px;">${label}</div>
          <div style="font-size:12px;color:#10b981;word-break:break-all;">${value}</div>
        </div>
      `).join("")}
    </div>

    <!-- Executive Summary -->
    <div style="margin-bottom:36px;">
      <h2 style="font-size:14px;letter-spacing:3px;text-transform:uppercase;color:#10b981;border-bottom:1px solid #1a2a1a;padding-bottom:10px;margin-bottom:20px;">
        ◆ EXECUTIVE SUMMARY
      </h2>
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:24px;">
        ${["critical","high","medium","low","info"].map(sev => `
          <div style="padding:16px;border:1px solid ${severityColor(sev)}44;background:${severityColor(sev)}08;text-align:center;">
            <div style="font-size:28px;font-weight:bold;color:${severityColor(sev)};text-shadow:0 0 12px ${severityColor(sev)}66;">${counts[sev as keyof typeof counts]}</div>
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:${severityColor(sev)};margin-top:4px;">${sev}</div>
          </div>
        `).join("")}
      </div>

      <!-- Severity bars -->
      <div style="padding:20px;border:1px solid #1a2a1a;background:#050f05;">
        <div style="display:grid;grid-template-columns:120px 1fr;gap:8px;align-items:center;margin-bottom:8px;">
          <div style="font-size:11px;text-transform:uppercase;color:#ef4444;letter-spacing:1px;">CRITICAL</div>
          <div>${severityBar(counts.critical, total, "#ef4444")}</div>
        </div>
        <div style="display:grid;grid-template-columns:120px 1fr;gap:8px;align-items:center;margin-bottom:8px;">
          <div style="font-size:11px;text-transform:uppercase;color:#f97316;letter-spacing:1px;">HIGH</div>
          <div>${severityBar(counts.high, total, "#f97316")}</div>
        </div>
        <div style="display:grid;grid-template-columns:120px 1fr;gap:8px;align-items:center;margin-bottom:8px;">
          <div style="font-size:11px;text-transform:uppercase;color:#eab308;letter-spacing:1px;">MEDIUM</div>
          <div>${severityBar(counts.medium, total, "#eab308")}</div>
        </div>
        <div style="display:grid;grid-template-columns:120px 1fr;gap:8px;align-items:center;margin-bottom:8px;">
          <div style="font-size:11px;text-transform:uppercase;color:#3b82f6;letter-spacing:1px;">LOW</div>
          <div>${severityBar(counts.low, total, "#3b82f6")}</div>
        </div>
        <div style="display:grid;grid-template-columns:120px 1fr;gap:8px;align-items:center;">
          <div style="font-size:11px;text-transform:uppercase;color:#6b7280;letter-spacing:1px;">INFO</div>
          <div>${severityBar(counts.info, total, "#6b7280")}</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px;">
        <div style="padding:16px;border:1px solid #1a2a1a;background:#050f05;">
          <span style="font-size:10px;color:#555;letter-spacing:2px;">TOTAL FINDINGS</span>
          <div style="font-size:22px;color:#10b981;margin-top:4px;">${total}</div>
        </div>
        <div style="padding:16px;border:1px solid #10b98133;background:#10b98108;">
          <span style="font-size:10px;color:#555;letter-spacing:2px;">AI VALIDATED</span>
          <div style="font-size:22px;color:#10b981;margin-top:4px;">${aiValidated} / ${total}</div>
        </div>
      </div>
    </div>

    <!-- Tool Scope Matrix -->
    <div style="margin-bottom:36px;">
      <h2 style="font-size:14px;letter-spacing:3px;text-transform:uppercase;color:#10b981;border-bottom:1px solid #1a2a1a;padding-bottom:10px;margin-bottom:20px;">
        ◆ SCOPE MATRIX — TOOL DEPLOYMENT STATUS
      </h2>
      <table style="width:100%;border-collapse:collapse;background:#050f05;border:1px solid #1a2a1a;">
        <thead>
          <tr style="border-bottom:1px solid #1a2a1a;background:#000;">
            <th style="padding:12px 14px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#555;">TOOL</th>
            <th style="padding:12px 14px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#555;">VERSION</th>
            <th style="padding:12px 14px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#555;">STATUS</th>
            <th style="padding:12px 14px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#555;">DEPLOYMENT</th>
          </tr>
        </thead>
        <tbody>${toolRows || `<tr><td colspan="4" style="padding:16px;text-align:center;color:#555;font-size:12px;">No tools registered</td></tr>`}</tbody>
      </table>
    </div>

    <!-- Vulnerability Details -->
    <div style="margin-bottom:36px;">
      <h2 style="font-size:14px;letter-spacing:3px;text-transform:uppercase;color:#10b981;border-bottom:1px solid #1a2a1a;padding-bottom:10px;margin-bottom:20px;">
        ◆ VULNERABILITY FINDINGS — DETAILED ANALYSIS
      </h2>
      ${vulnsHtml || `<div style="padding:32px;text-align:center;border:1px solid #1a2a1a;color:#555;font-size:12px;">NO VULNERABILITIES RECORDED FOR THIS SCAN</div>`}
    </div>

    <!-- Footer -->
    <div style="border-top:1px solid #1a2a1a;padding-top:24px;display:flex;justify-content:space-between;align-items:center;">
      <div style="font-size:10px;color:#333;letter-spacing:2px;">V8 NEURAL EXPLOITATION PLATFORM — CONFIDENTIAL</div>
      <div style="font-size:10px;color:#333;letter-spacing:2px;">GENERATED: ${generatedAt} UTC</div>
    </div>
  </div>
</body>
</html>`;
}

// GET /api/reports
router.get("/reports", async (_req, res) => {
  try {
    const reports = await db.select().from(reportsTable).orderBy(desc(reportsTable.createdAt));
    return res.json(reports.map(formatReport));
  } catch (err) {
    logger.error({ err }, "Get reports error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/reports
router.post("/reports", async (req, res) => {
  const { scanId } = req.body as { scanId: number };
  if (!scanId) return res.status(400).json({ error: "scanId required" });
  try {
    const [report] = await db.insert(reportsTable).values({
      scanId,
      status: "generating",
    }).returning();

    setTimeout(async () => {
      try {
        await db.update(reportsTable)
          .set({ status: "ready", downloadUrl: `/api/reports/${report.id}/download` })
          .where(eq(reportsTable.id, report.id));
      } catch {}
    }, 2500);

    return res.status(201).json(formatReport(report));
  } catch (err) {
    logger.error({ err }, "Generate report error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/reports/:id/download — Generate and serve full HTML report
router.get("/reports/:id/download", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  try {
    const [report] = await db.select().from(reportsTable).where(eq(reportsTable.id, id));
    if (!report) return res.status(404).json({ error: "Report not found" });
    if (report.status !== "ready") return res.status(425).json({ error: "Report not ready yet" });

    const html = await generateReportHtml(id, report.scanId);

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `inline; filename="v8-security-report-${id}.html"`);
    return res.send(html);
  } catch (err) {
    logger.error({ err }, "Download report error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
