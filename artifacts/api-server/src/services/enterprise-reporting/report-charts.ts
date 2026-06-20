// ---------------------------------------------------------------------------
// Report Chart Generator ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
//
// Generates inline SVG charts for embedding in HTML/Markdown/PDF reports.
// Supports:
//   - Severity Distribution (bar chart)
//   - Risk Heatmap (grid)
//   - CVSS Score Distribution
//   - Vulnerability Trend
//   - Compliance Coverage (radial/progress)
//   - Timeline

import type { ChartData } from "./types";

// ── Color Palette ─────────────────────────────────────────────────────────

const CHART_COLORS = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#3b82f6",
  info: "#6b7280",
  success: "#22c55e",
  background: "#0f172a",
  grid: "#1e293b",
  text: "#94a3b8",
  accent: "#22d3ee",
};

// ── Severity Distribution Bar Chart ───────────────────────────────────────

export function generateSeverityChart(data: Record<string, number>): string {
  const order = ["critical", "high", "medium", "low", "info"];
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  if (total === 0) return "";

  const barW = 80;
  const chartH = 250;
  const chartW = order.length * (barW + 20) + 60;
  const maxVal = Math.max(...order.map((s) => data[s] ?? 0), 1);
  const scaleH = chartH - 60;

  const bars = order
    .map((sev, i) => {
      const count = data[sev] ?? 0;
      const h = (count / maxVal) * scaleH;
      const x = 40 + i * (barW + 20);
      const y = chartH - 30 - h;
      const color = CHART_COLORS[sev as keyof typeof CHART_COLORS] ?? "#6b7280";
      return `
    <g>
      <rect x="${x}" y="${y}" width="${barW}" height="${h}" fill="${color}" opacity="0.85" rx="3">
        <animate attributeName="height" from="0" to="${h}" dur="0.6s" fill="freeze"/>
        <animate attributeName="y" from="${chartH - 30}" to="${y}" dur="0.6s" fill="freeze"/>
      </rect>
      <text x="${x + barW / 2}" y="${chartH - 12}" text-anchor="middle" fill="${color}" font-size="10" font-family="monospace" font-weight="600">${sev.toUpperCase()}</text>
      ${count > 0 ? `<text x="${x + barW / 2}" y="${y - 8}" text-anchor="middle" fill="${color}" font-size="16" font-family="monospace" font-weight="700">${count}</text>` : ""}
    </g>`;
    })
    .join("");

  return `<svg width="${chartW}" height="${chartH}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${chartW}" height="${chartH}" fill="${CHART_COLORS.background}" rx="6"/>
    <line x1="40" y1="${chartH - 30}" x2="${chartW - 20}" y2="${chartH - 30}" stroke="${CHART_COLORS.grid}" stroke-width="1"/>
    <text x="${chartW / 2}" y="20" text-anchor="middle" fill="${CHART_COLORS.accent}" font-size="11" font-family="monospace" font-weight="600" letter-spacing="1">SEVERITY DISTRIBUTION</text>
    ${bars}
  </svg>`;
}

// ── Risk Heatmap ─────────────────────────────────────────────────────────

export function generateRiskHeatmap(
  matrix: Array<{ label: string; likelihood: number; impact: number; count: number }>,
): string {
  const cellSize = 40;
  const gap = 4;
  const cols = 5;
  const rows = Math.ceil(matrix.length / cols) || 1;
  const w = cols * (cellSize + gap) + 60;
  const h = rows * (cellSize + gap) + 60;

  const cells = matrix
    .map((item, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = 50 + col * (cellSize + gap);
      const y = 40 + row * (cellSize + gap);

      // Color based on risk
      const risk = item.likelihood * item.impact;
      const r = Math.min(255, Math.round(risk * 255));
      const g = Math.min(255, Math.round((1 - risk) * 200));
      const color = `rgb(${r}, ${g}, 50)`;

      return `
    <g>
      <rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${color}" rx="3" opacity="0.8">
        <title>${item.label}: ${item.count} findings (likelihood: ${(item.likelihood * 10).toFixed(1)}, impact: ${(item.impact * 10).toFixed(1)})</title>
      </rect>
      <text x="${x + cellSize / 2}" y="${y + cellSize / 2 + 1}" text-anchor="middle" dominant-baseline="middle" fill="#fff" font-size="8" font-family="monospace">${item.count}</text>
    </g>`;
    })
    .join("");

  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${w}" height="${h}" fill="${CHART_COLORS.background}" rx="6"/>
    <text x="${w / 2}" y="20" text-anchor="middle" fill="${CHART_COLORS.accent}" font-size="11" font-family="monospace" font-weight="600" letter-spacing="1">RISK HEATMAP</text>
    ${cells}
  </svg>`;
}

// ── Compliance Coverage Radial ───────────────────────────────────────────

export function generateComplianceChart(coverage: number, framework: string): string {
  const size = 160;
  const cx = size / 2;
  const cy = size / 2;
  const r = 60;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - coverage / 100);
  const color = coverage >= 80 ? CHART_COLORS.success : coverage >= 50 ? CHART_COLORS.high : CHART_COLORS.critical;

  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" fill="${CHART_COLORS.background}" rx="6"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${CHART_COLORS.grid}" stroke-width="8"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="8"
      stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
      stroke-linecap="round" transform="rotate(-90 ${cx} ${cy})">
      <animate attributeName="stroke-dashoffset" from="${circumference}" to="${offset}" dur="1s" fill="freeze"/>
    </circle>
    <text x="${cx}" y="${cy - 6}" text-anchor="middle" fill="${CHART_COLORS.text}" font-size="24" font-family="monospace" font-weight="700">${Math.round(coverage)}%</text>
    <text x="${cx}" y="${cy + 14}" text-anchor="middle" fill="${CHART_COLORS.text}" font-size="8" font-family="monospace">COMPLIANCE</text>
    <text x="${cx}" y="${size - 10}" text-anchor="middle" fill="${color}" font-size="8" font-family="monospace">${framework.toUpperCase()}</text>
  </svg>`;
}

// ── Vulnerability Timeline ───────────────────────────────────────────────

export function generateTimelineChart(
  data: Array<{ date: string; critical: number; high: number; medium: number; low: number }>,
): string {
  if (data.length === 0) return "";

  const chartW = Math.max(400, data.length * 60);
  const chartH = 200;
  const maxVal = Math.max(...data.flatMap((d) => [d.critical, d.high, d.medium, d.low]), 1);
  const scaleH = chartH - 50;

  const points = data
    .map((d, i) => {
      const x = 50 + i * ((chartW - 80) / Math.max(1, data.length - 1));
      const layers = [
        { key: "critical" as const, color: CHART_COLORS.critical },
        { key: "high" as const, color: CHART_COLORS.high },
        { key: "medium" as const, color: CHART_COLORS.medium },
        { key: "low" as const, color: CHART_COLORS.low },
      ];

      let cumulative = 0;
      const bars = layers
        .map((l) => {
          const val = d[l.key];
          const h = (val / maxVal) * scaleH;
          const y = chartH - 30 - cumulative - h;
          cumulative += h;
          return `<rect x="${x - 12}" y="${y}" width="24" height="${h}" fill="${l.color}" opacity="0.8" rx="1">
            <title>${l.key.toUpperCase()}: ${val}</title>
          </rect>`;
        })
        .join("");

      return `
    <g>
      ${bars}
      <text x="${x}" y="${chartH - 12}" text-anchor="middle" fill="${CHART_COLORS.text}" font-size="7" font-family="monospace" transform="rotate(-45 ${x} ${chartH - 12})">${d.date}</text>
    </g>`;
    })
    .join("");

  return `<svg width="${chartW}" height="${chartH}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${chartW}" height="${chartH}" fill="${CHART_COLORS.background}" rx="6"/>
    <text x="${chartW / 2}" y="18" text-anchor="middle" fill="${CHART_COLORS.accent}" font-size="11" font-family="monospace" font-weight="600" letter-spacing="1">VULNERABILITY TIMELINE</text>
    ${points}
  </svg>`;
}

// ── Security Score Gauge ─────────────────────────────────────────────────

export function generateSecurityScoreGauge(score: number): string {
  const size = 200;
  const cx = size / 2;
  const cy = size / 2 + 10;
  const r = 70;
  const color = score >= 80 ? CHART_COLORS.success : score >= 50 ? CHART_COLORS.high : CHART_COLORS.critical;
  const angle = (score / 100) * 180;
  const radians = (angle * Math.PI) / 180;
  const endX = cx + r * Math.sin(radians);
  const endY = cy - r * Math.cos(radians);
  const largeArc = angle > 180 ? 1 : 0;

  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" fill="${CHART_COLORS.background}" rx="6"/>
    <!-- Background arc -->
    <path d="M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy}" fill="none" stroke="${CHART_COLORS.grid}" stroke-width="12" stroke-linecap="round"/>
    <!-- Score arc -->
    <path d="M ${cx - r} ${cy} A ${r} ${r} 0 ${largeArc} 1 ${endX} ${endY}" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round">
      <animate attributeName="stroke-dashoffset" from="500" to="0" dur="1s" fill="freeze"/>
    </path>
    <!-- Score text -->
    <text x="${cx}" y="${cy - 8}" text-anchor="middle" fill="${color}" font-size="36" font-family="monospace" font-weight="700">${Math.round(score)}</text>
    <text x="${cx}" y="${cy + 18}" text-anchor="middle" fill="${CHART_COLORS.text}" font-size="10" font-family="monospace" letter-spacing="2">SECURITY SCORE</text>
  </svg>`;
}

// ── Generate All Charts ──────────────────────────────────────────────────

export function generateAllCharts(data: {
  severities: Record<string, number>;
  riskMatrix: Array<{ label: string; likelihood: number; impact: number; count: number }>;
  complianceCoverage: number;
  complianceFramework: string;
  timeline: Array<{ date: string; critical: number; high: number; medium: number; low: number }>;
  securityScore: number;
}): Record<string, string> {
  return {
    severityDistribution: generateSeverityChart(data.severities),
    riskHeatmap: generateRiskHeatmap(data.riskMatrix),
    complianceGauge: generateComplianceChart(data.complianceCoverage, data.complianceFramework),
    timeline: generateTimelineChart(data.timeline),
    securityScore: generateSecurityScoreGauge(data.securityScore),
  };
}

export function getChartStyle(): string {
  return `
    .chart-container { display: flex; flex-wrap: wrap; gap: 20px; justify-content: center; margin: 20px 0; }
    .chart-container svg { max-width: 100%; height: auto; border-radius: 6px; }
  `;
}
