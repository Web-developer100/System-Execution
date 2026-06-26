// ---------------------------------------------------------------------------
// CycloneDX Report Generator ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
// Generates CycloneDX 1.5 format output for SBOM and vulnerability
// intelligence exchange. Compliant with OWASP CycloneDX standard.

import type { ReportData } from "../../report-generator";

// ── CycloneDX Generator ────────────────────────────────────────────────────

export function generateCyclonedxReport(data: ReportData): string {
  const now = new Date().toISOString();

  const cyclonedx: Record<string, unknown> = {
    $schema: "http://cyclonedx.org/schema/bom-1.5.schema.json",
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    version: 1,
    metadata: {
      timestamp: now,
      tools: {
        components: [{
          type: "application",
          name: "V8 Neural Exploitation Platform",
          version: "2.1.0",
          description: "Enterprise Offensive Security Platform",
        }],
      },
      properties: [
        { name: "v8:scanId", value: String(data.scanId) },
        { name: "v8:target", value: data.target },
        { name: "v8:status", value: data.status },
      ],
    },
    vulnerabilities: data.findings.map(f => {
      const severityMap: Record<string, string> = {
        critical: "critical",
        high: "high",
        medium: "medium",
        low: "low",
        info: "none",
      };

      return {
        bomRef: `v8-${data.scanId}-${f.id}`,
        id: `V8-${data.scanId}-${f.id}`,
        source: {
          name: "V8 Neural Exploitation Platform",
          url: "https://v8platform.io",
        },
        reference: f.url,
        ratings: [{
          source: {
            name: "V8 Platform",
            url: "https://v8platform.io",
          },
          score: f.severity === "critical" ? 10
            : f.severity === "high" ? 7.5
            : f.severity === "medium" ? 5
            : f.severity === "low" ? 2.5
            : 0,
          severity: severityMap[f.severity] ?? "none",
          method: "other",
          vector: "V8:1.0",
        }],
        description: f.description ?? f.title,
        recommendation: f.fix ?? "Manual review required",
        cwes: [],
        properties: [
          { name: "v8:findingId", value: String(f.id) },
          { name: "v8:status", value: f.status },
          { name: "v8:aiValidated", value: String(f.aiValidated) },
          { name: "v8:discoveredAt", value: f.discoveredAt },
        ],
      };
    }),
    components: data.toolsUsed.map((tool, i) => ({
      type: "application" as const,
      name: tool,
      version: "1.0",
      "bom-ref": `tool-${i}`,
    })),
  };

  return JSON.stringify(cyclonedx, null, 2);
}
