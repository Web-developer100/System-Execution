// ---------------------------------------------------------------------------
// DOCX Report Generator ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
// Generates professional Word (DOCX) reports with proper styling,
// tables, headers/footers, and formatting using the docx library.

import type { ReportData } from "../../report-generator";
import type { ReportBranding } from "../types";
import { DEFAULT_BRANDING } from "../types";
import { logger } from "../../../lib/logger";

// ── DOCX Generator ────────────────────────────────────────────────────────

export async function generateDocxReport(
  data: ReportData,
  branding = DEFAULT_BRANDING,
): Promise<Buffer> {
  const docx = await import("docx");

  const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
    Header, Footer, PageNumber, TableOfContents, ExternalHyperlink,
    PageBreak, convertInchesToTwip,
  } = docx;

  const severityColors: Record<string, string> = {
    critical: "dc2626", high: "ea580c", medium: "ca8a04",
    low: "2563eb", info: "6b7280",
  };

  // ── Build document ─────────────────────────────────────────────────────
  const doc = new Document({
    title: `V8 Security Report — Scan #${data.scanId}`,
    description: `Security assessment report for ${data.target}`,
    creator: "V8 Neural Exploitation Platform",
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: 22, color: "333333" },
          paragraph: { spacing: { after: 120 } },
        },
      },
    },
    sections: [
      // ── Cover Page ────────────────────────────────────────────────────
      {
        properties: {
          page: {
            margin: { top: convertInchesToTwip(2), bottom: convertInchesToTwip(1), left: convertInchesToTwip(1), right: convertInchesToTwip(1) },
          },
        },
        children: [
          new Paragraph({ spacing: { before: 3000 }, alignment: AlignmentType.CENTER, children: [
            new TextRun({ text: "V8 SECURITY", bold: true, size: 52, color: "22d3ee", font: "Calibri" }),
          ]}),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [
            new TextRun({ text: "ASSESSMENT REPORT", bold: true, size: 36, color: "e2e8f0" }),
          ]}),
          new Paragraph({ spacing: { before: 600 }, alignment: AlignmentType.CENTER, children: [
            new TextRun({ text: `Scan #${String(data.scanId).padStart(4, "0")}`, size: 24, color: "64748b" }),
          ]}),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [
            new TextRun({ text: `Target: ${data.target}`, size: 24, color: "64748b" }),
          ]}),
          new Paragraph({ spacing: { before: 1200 }, alignment: AlignmentType.CENTER, children: [
            new TextRun({ text: `Generated: ${new Date().toISOString().slice(0, 19).replace("T", " ")} UTC`, size: 18, color: "475569" }),
          ]}),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [
            new TextRun({ text: "CONFIDENTIAL", bold: true, size: 18, color: "ef4444" }),
          ]}),
        ],
      },
      // ── Main Report ───────────────────────────────────────────────────
      {
        properties: {
          page: {
            margin: { top: convertInchesToTwip(1), bottom: convertInchesToTwip(1), left: convertInchesToTwip(1), right: convertInchesToTwip(1) },
          },
        },
        headers: {
          default: new Header({
            children: [new Paragraph({
              alignment: AlignmentType.RIGHT, children: [
                new TextRun({ text: `V8 Platform — ${branding.companyName}`, size: 16, color: "94a3b8", font: "Calibri" }),
              ],
            })],
          }),
        },
        footers: {
          default: new Footer({
            children: [new Paragraph({
              alignment: AlignmentType.CENTER, children: [
                new TextRun({ text: `CONFIDENTIAL — Page `, size: 16, color: "94a3b8" }),
                new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "94a3b8" }),
              ],
            })],
          }),
        },
        children: [
          // ── Table of Contents ───────────────────────────────────────
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [
            new TextRun({ text: "Table of Contents", bold: true, color: "22d3ee", size: 28 }),
          ]}),
          new TableOfContents("Table of Contents", {
            hyperlink: true, headingStyleRange: "1-3",
          }),
          new Paragraph({ children: [new TextRun({ text: "" })] }),

          // ── 1. Executive Summary ─────────────────────────────────────
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [
            new TextRun({ text: "1. Executive Summary", bold: true, color: "22d3ee", size: 28 }),
          ]}),
          new Paragraph({ spacing: { after: 200 }, children: [
            new TextRun({ text: `Scan #${data.scanId} against ${data.target} completed with status "${data.status.toUpperCase()}".`, size: 22 }),
          ]}),

          // Summary table
          new Table({
            rows: [
              new TableRow({ children: [
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Metric", bold: true, color: "FFFFFF" })] })], shading: { type: ShadingType.SOLID, color: "22d3ee", fill: "22d3ee" } }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Value", bold: true, color: "FFFFFF" })] })], shading: { type: ShadingType.SOLID, color: "22d3ee", fill: "22d3ee" } }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Metric", bold: true, color: "FFFFFF" })] })], shading: { type: ShadingType.SOLID, color: "22d3ee", fill: "22d3ee" } }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Value", bold: true, color: "FFFFFF" })] })], shading: { type: ShadingType.SOLID, color: "22d3ee", fill: "22d3ee" } }),
              ]}),
              new TableRow({ children: [
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Total Findings" })] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(data.totalFindings), bold: true })] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Status" })] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: data.status.toUpperCase(), bold: true, color: data.status === "completed" ? "22c55e" : "ef4444" })] })] }),
              ]}),
              new TableRow({ children: [
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Critical", bold: true, color: "dc2626" })] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(data.severities.critical ?? 0), bold: true, color: "dc2626" })] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "High", bold: true, color: "ea580c" })] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(data.severities.high ?? 0), bold: true, color: "ea580c" })] })] }),
              ]}),
              new TableRow({ children: [
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Medium" })] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(data.severities.medium ?? 0) })] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Low" })] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(data.severities.low ?? 0) })] })] }),
              ]}),
              new TableRow({ children: [
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Info" })] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(data.severities.info ?? 0) })] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "AI Validated" })] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `${data.findings.filter(f => f.aiValidated).length}/${data.totalFindings}` })] })] }),
              ]}),
            ],
          }),
          new Paragraph({ children: [new TextRun({ text: "" })] }),

          // ── 2. Severity Breakdown ─────────────────────────────────────
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [
            new TextRun({ text: "2. Severity Breakdown", bold: true, color: "22d3ee", size: 28 }),
          ]}),

          new Table({
            rows: [
              new TableRow({ children: [
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Severity", bold: true, color: "FFFFFF" })] })], shading: { type: ShadingType.SOLID, color: "1E293B", fill: "1E293B" } }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Count", bold: true, color: "FFFFFF" })] })], shading: { type: ShadingType.SOLID, color: "1E293B", fill: "1E293B" } }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Percentage", bold: true, color: "FFFFFF" })] })], shading: { type: ShadingType.SOLID, color: "1E293B", fill: "1E293B" } }),
              ]}),
              ...["critical", "high", "medium", "low", "info"].map(sev => {
                const count = data.severities[sev] ?? 0;
                const pct = data.totalFindings > 0 ? ((count / data.totalFindings) * 100).toFixed(1) : "0";
                return new TableRow({ children: [
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: sev.toUpperCase(), bold: true, color: severityColors[sev] || "6b7280" })] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(count), bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `${pct}%` })] })] }),
                ]});
              }),
            ],
          }),
          new Paragraph({ children: [new TextRun({ text: "" })] }),

          // ── 3. Findings ────────────────────────────────────────────────
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [
            new TextRun({ text: `3. Findings (${data.totalFindings})`, bold: true, color: "22d3ee", size: 28 }),
          ]}),

          ...data.findings.slice(0, 100).flatMap(f => [
            new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 400 }, children: [
              new TextRun({ text: `${f.severity.toUpperCase()} — `, bold: true, color: severityColors[f.severity] || "6b7280" }),
              new TextRun({ text: f.title, bold: true }),
            ]}),
            new Paragraph({ spacing: { after: 60 }, children: [
              new TextRun({ text: `Status: `, bold: true, size: 20 }),
              new TextRun({ text: f.status.toUpperCase(), size: 20, color: f.status === "confirmed" ? "22c55e" : f.status === "false_positive" ? "ef4444" : "eab308" }),
              f.aiValidated ? new TextRun({ text: "  [AI VERIFIED]", bold: true, size: 20, color: "22d3ee" }) : new TextRun({ text: "" }),
            ]}),
            new Paragraph({ spacing: { after: 60 }, children: [
              new TextRun({ text: `URL: `, bold: true, size: 20 }),
              new TextRun({ text: f.url, size: 20, color: "64748b" }),
            ]}),
            ...(f.description ? [new Paragraph({ spacing: { after: 120 }, children: [
              new TextRun({ text: f.description, size: 20 }),
            ]})] : []),
            ...(f.evidence ? [new Paragraph({ spacing: { before: 200 }, children: [
              new TextRun({ text: "Evidence:", bold: true, size: 20, color: "22c55e" }),
            ]}), new Paragraph({ spacing: { after: 120 }, indent: { left: 400 }, children: [
              new TextRun({ text: f.evidence.slice(0, 2000), size: 18, font: "Courier New", color: "22c55e" }),
            ]})] : []),
            ...(f.fix ? [new Paragraph({ spacing: { before: 200 }, children: [
              new TextRun({ text: "Remediation:", bold: true, size: 20, color: "10b981" }),
            ]}), new Paragraph({ spacing: { after: 120 }, indent: { left: 400 }, children: [
              new TextRun({ text: f.fix.slice(0, 2000), size: 18, font: "Courier New", color: "e2e8f0" }),
            ]})] : []),
          ]),

          // ── 4. Tools Used ─────────────────────────────────────────────
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [
            new TextRun({ text: "4. Tools Used", bold: true, color: "22d3ee", size: 28 }),
          ]}),
          ...(data.toolsUsed.length > 0 ? data.toolsUsed.map(t => new Paragraph({ children: [
            new TextRun({ text: `• ${t}`, size: 22 }),
          ]})) : [new Paragraph({ children: [new TextRun({ text: "No tools recorded.", color: "64748b" })] })]),

          // ── 5. Compliance ──────────────────────────────────────────────
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [
            new TextRun({ text: "5. Compliance Mapping", bold: true, color: "22d3ee", size: 28 }),
          ]}),
          new Paragraph({ children: [
            new TextRun({ text: "This report was generated by the V8 Neural Exploitation Platform. Findings should be mapped to the following frameworks as applicable:", size: 22 }),
          ]}),
          ...[
            "OWASP Top 10 (2021)", "OWASP API Top 10", "MITRE ATT&CK",
            "CWE / CAPEC", "PCI DSS (if applicable)", "ISO 27001 (if applicable)",
            "NIST Cybersecurity Framework (if applicable)",
          ].map(fw => new Paragraph({ children: [new TextRun({ text: `• ${fw}`, size: 20, color: "64748b" })] })),

          // ── Footer ────────────────────────────────────────────────────
          new Paragraph({ spacing: { before: 600 }, alignment: AlignmentType.CENTER, children: [
            new TextRun({ text: "V8 NEURAL EXPLOITATION PLATFORM — CONFIDENTIAL", size: 16, color: "475569", italics: true }),
          ]}),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [
            new TextRun({ text: `Generated: ${new Date().toISOString()}`, size: 16, color: "475569" }),
          ]}),
        ],
      },
    ],
  });

  // Generate buffer
  const buffer = await Packer.toBuffer(doc);
  logger.info({ scanId: data.scanId }, "[DOCX-GEN] Report generated");
  return Buffer.from(buffer);
}
