// ---------------------------------------------------------------------------
// XLSX Report Generator ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
// Generates professional Excel (XLSX) reports with multiple sheets,
// charts, styling, and conditional formatting using exceljs.

import type { ReportData } from "../../report-generator";
import type { ReportBranding, ComplianceMapping } from "../types";
import { DEFAULT_BRANDING } from "../types";
import { logger } from "../../../lib/logger";

// ── XLSX Generator ────────────────────────────────────────────────────────

export async function generateXlsxReport(
  data: ReportData,
  complianceMappings: ComplianceMapping[] = [],
  branding = DEFAULT_BRANDING,
): Promise<Buffer> {
  const ExcelJS = await import("exceljs");

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "V8 Neural Exploitation Platform";
  workbook.created = new Date();

  // Colors
  const colors = {
    critical: "FFEF4444",
    high: "FFF97316",
    medium: "FFEAB308",
    low: "FF3B82F6",
    info: "FF6B7280",
    header: "FF22D3EE",
    darkBg: "FF0F172A",
    lightText: "FFE2E8F0",
    mutedText: "FF94A3B8",
    success: "FF22C55E",
    warning: "FFEAB308",
    error: "FFEF4444",
  };

  // ── Sheet 1: Executive Summary ──────────────────────────────────────────
  const summarySheet = workbook.addWorksheet("Executive Summary", {
    properties: { tabColor: { argb: colors.header } },
  });

  // Title
  summarySheet.mergeCells("A1:F1");
  const titleCell = summarySheet.getCell("A1");
  titleCell.value = `V8 Security Report — Scan #${data.scanId}`;
  titleCell.font = { bold: true, size: 16, color: { argb: colors.header } };
  titleCell.alignment = { horizontal: "center" };

  summarySheet.mergeCells("A2:F2");
  const targetCell = summarySheet.getCell("A2");
  targetCell.value = `Target: ${data.target}`;
  targetCell.font = { size: 12, color: { argb: colors.mutedText } };
  targetCell.alignment = { horizontal: "center" };

  // Summary metrics
  summarySheet.getCell("A4").value = "Metric";
  summarySheet.getCell("B4").value = "Value";
  summarySheet.getCell("C4").value = "Metric";
  summarySheet.getCell("D4").value = "Value";
  summarySheet.getCell("E4").value = "Metric";
  summarySheet.getCell("F4").value = "Value";
  ["A4", "B4", "C4", "D4", "E4", "F4"].forEach(c => {
    const cell = summarySheet.getCell(c);
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.header } } as any;
  });

  const metrics = [
    ["Status", data.status.toUpperCase(), "Total Findings", String(data.totalFindings), "Risk Score", `${calculateRiskScore(data)}/100`],
    ["Critical", String(data.severities.critical ?? 0), "High", String(data.severities.high ?? 0), "Medium", String(data.severities.medium ?? 0)],
    ["Low", String(data.severities.low ?? 0), "Info", String(data.severities.info ?? 0), "AI Validated", `${data.findings.filter(f => f.aiValidated).length}/${data.totalFindings}`],
    ["Confirmed", String(data.statuses.confirmed ?? 0), "Inconclusive", String(data.statuses.inconclusive ?? 0), "False Positives", String(data.statuses.false_positive ?? 0)],
  ];

  metrics.forEach((row, idx) => {
    const rowNum = 5 + idx;
    row.forEach((val, colIdx) => {
      const cell = summarySheet.getCell(rowNum, colIdx + 1);
      cell.value = val;
      cell.font = { color: { argb: colors.lightText } };
      if (val === "CRITICAL" || val === "HIGH") cell.font = { bold: true, color: { argb: colors.critical } };
    });
  });

  // Severity breakdown
  summarySheet.getCell("A10").value = "Severity Distribution";
  summarySheet.getCell("A10").font = { bold: true, size: 12, color: { argb: colors.header } };

  summarySheet.getCell("A11").value = "Severity";
  summarySheet.getCell("B11").value = "Count";
  summarySheet.getCell("C11").value = "Percentage";
  ["A11", "B11", "C11"].forEach(c => {
    const cell = summarySheet.getCell(c);
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } } as any;
  });

  const total = data.totalFindings || 1;
  const sevOrder = ["critical", "high", "medium", "low", "info"];
  sevOrder.forEach((sev, idx) => {
    const count = data.severities[sev] ?? 0;
    const rowNum = 12 + idx;
    summarySheet.getCell(rowNum, 1).value = sev.toUpperCase();
    summarySheet.getCell(rowNum, 1).font = { bold: true, color: { argb: colors[sev as keyof typeof colors] || colors.info } };
    summarySheet.getCell(rowNum, 2).value = count;
    summarySheet.getCell(rowNum, 3).value = `${((count / total) * 100).toFixed(1)}%`;
  });

  // ── Sheet 2: Findings Detail ────────────────────────────────────────────
  const findingsSheet = workbook.addWorksheet("Findings", {
    properties: { tabColor: { argb: colors.critical } },
  });

  // Headers
  const findingHeaders = ["ID", "Title", "Severity", "Status", "URL", "Description", "Evidence", "Remediation", "AI Validated", "Discovered At"];
  findingHeaders.forEach((h, i) => {
    const cell = findingsSheet.getCell(1, i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.header } } as any;
  });

  // Data
  data.findings.forEach((f, idx) => {
    const rowNum = idx + 2;
    findingsSheet.getCell(rowNum, 1).value = f.id;
    findingsSheet.getCell(rowNum, 2).value = f.title;
    findingsSheet.getCell(rowNum, 3).value = f.severity.toUpperCase();
    findingsSheet.getCell(rowNum, 3).font = { bold: true, color: { argb: colors[f.severity as keyof typeof colors] || colors.info } };
    findingsSheet.getCell(rowNum, 4).value = f.status;
    findingsSheet.getCell(rowNum, 5).value = f.url;
    findingsSheet.getCell(rowNum, 6).value = f.description;
    findingsSheet.getCell(rowNum, 7).value = f.evidence;
    findingsSheet.getCell(rowNum, 8).value = f.fix;
    findingsSheet.getCell(rowNum, 9).value = f.aiValidated ? "Yes" : "No";
    findingsSheet.getCell(rowNum, 10).value = f.discoveredAt;
  });

  // Column widths
  findingsSheet.getColumn(1).width = 8;
  findingsSheet.getColumn(2).width = 40;
  findingsSheet.getColumn(3).width = 12;
  findingsSheet.getColumn(4).width = 14;
  findingsSheet.getColumn(5).width = 50;
  findingsSheet.getColumn(6).width = 60;
  findingsSheet.getColumn(7).width = 40;
  findingsSheet.getColumn(8).width = 40;
  findingsSheet.getColumn(9).width = 14;
  findingsSheet.getColumn(10).width = 22;

  // ── Sheet 3: Compliance ─────────────────────────────────────────────────
  if (complianceMappings.length > 0) {
    const complianceSheet = workbook.addWorksheet("Compliance", {
      properties: { tabColor: { argb: "FF8B5CF6" } },
    });

    const compHeaders = ["Framework", "Control", "Finding", "Status", "Passed", "Failed", "Coverage %"];
    compHeaders.forEach((h, i) => {
      const cell = complianceSheet.getCell(1, i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF8B5CF6" } } as any;
    });

    let rowIdx = 2;
    complianceMappings.forEach(m => {
      complianceSheet.getCell(rowIdx, 1).value = m.framework.toUpperCase();
      complianceSheet.getCell(rowIdx, 1).font = { bold: true };
      complianceSheet.getCell(rowIdx, 5).value = m.passedControls;
      complianceSheet.getCell(rowIdx, 6).value = m.failedControls;
      complianceSheet.getCell(rowIdx, 7).value = `${Math.round(m.coverage)}%`;
      rowIdx++;

      m.findings.forEach(fx => {
        complianceSheet.getCell(rowIdx, 2).value = fx.control;
        complianceSheet.getCell(rowIdx, 3).value = fx.title;
        complianceSheet.getCell(rowIdx, 4).value = fx.status.replace("_", " ");
        const statusColor = fx.status === "compliant" ? colors.success : fx.status === "non_compliant" ? colors.error : colors.warning;
        complianceSheet.getCell(rowIdx, 4).font = { color: { argb: statusColor } };
        rowIdx++;
      });
    });
  }

  // ── Sheet 4: Scan Logs ──────────────────────────────────────────────────
  if (data.logs.length > 0) {
    const logsSheet = workbook.addWorksheet("Scan Logs", {
      properties: { tabColor: { argb: "FF6B7280" } },
    });

    const logHeaders = ["Timestamp", "Level", "Message"];
    logHeaders.forEach((h, i) => {
      const cell = logsSheet.getCell(1, i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } } as any;
    });

    data.logs.forEach((l, idx) => {
      const rowNum = idx + 2;
      logsSheet.getCell(rowNum, 1).value = l.timestamp;
      logsSheet.getCell(rowNum, 2).value = l.level;
      const levelColor = l.level === "error" ? colors.error : l.level === "warn" ? colors.warning : l.level === "success" ? colors.success : colors.mutedText;
      logsSheet.getCell(rowNum, 2).font = { color: { argb: levelColor } };
      logsSheet.getCell(rowNum, 3).value = l.message;
    });

    logsSheet.getColumn(1).width = 22;
    logsSheet.getColumn(2).width = 10;
    logsSheet.getColumn(3).width = 80;
  }

  // ── Write to Buffer ────────────────────────────────────────────────────
  const buffer = await workbook.xlsx.writeBuffer();
  logger.info({ scanId: data.scanId, sheets: workbook.worksheets.length }, "[XLSX-GEN] Report generated");
  return Buffer.from(buffer);
}

// ── Helpers ────────────────────────────────────────────────────────────────

function calculateRiskScore(data: ReportData): number {
  const cr = data.severities.critical ?? 0;
  const hi = data.severities.high ?? 0;
  const me = data.severities.medium ?? 0;
  const lo = data.severities.low ?? 0;
  const total = data.totalFindings;
  if (total === 0) return 100;
  return Math.max(0, Math.min(100, 100 - (cr * 15 + hi * 8 + me * 4 + lo * 1)));
}
