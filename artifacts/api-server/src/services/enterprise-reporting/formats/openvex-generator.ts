// ---------------------------------------------------------------------------
// OpenVEX Report Generator ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
// Generates OpenVEX (Open Vulnerability Exchange) format output.
// Compliant with the OpenVEX specification for sharing vulnerability
// exploitability information between tools.

import type { ReportData } from "../../report-generator";

// ── OpenVEX Generator ──────────────────────────────────────────────────────

export function generateOpenVexReport(data: ReportData): string {
  const openvex: Record<string, unknown> = {
    "@context": "https://openvex.dev/ns",
    "@id": `https://v8platform.io/reports/openvex/${data.scanId}`,
    "author": "V8 Neural Exploitation Platform",
    "role": "Security Scanner",
    "timestamp": new Date().toISOString(),
    "version": 1,
    "tooling": "V8 Neural Exploitation Platform v2.1.0",
    "statements": data.findings.map(f => {
      const status = f.status === "confirmed" ? "affected"
        : f.status === "false_positive" ? "not_affected"
        : "under_investigation";

      return {
        "@id": `v8-${data.scanId}-${f.id}`,
        "vulnerability": {
          name: f.title,
          description: f.description ?? f.title,
          aliases: [],
        },
        "timestamp": f.discoveredAt ?? new Date().toISOString(),
        "products": [{
          "@id": f.url,
          "subcomponents": [],
        }],
        "status": status,
        "status_notes": `Severity: ${f.severity.toUpperCase()}. Detected by V8 Platform.`,
        "justification": status === "not_affected"
          ? "vulnerable_code_cannot_be_controlled_by_adversary"
          : undefined,
        "impact_statement": status === "affected"
          ? `${f.severity.toUpperCase()} severity vulnerability potentially exploitable`
          : undefined,
        "action_statement": f.fix ? `Apply remediation: ${f.fix.slice(0, 200)}` : "Manual review required",
        "action_statement_timestamp": new Date().toISOString(),
        "external_references": [{
          "url": f.url,
          "description": "Affected endpoint",
        }],
      };
    }),
  };

  return JSON.stringify(openvex, null, 2);
}
