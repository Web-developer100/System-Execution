import type { Finding } from "../types";
import type { OutputParser } from "../parser.interface";

// ── Nuclei JSON Output Parser ──────────────────────────────────────────────
//
// Nuclei outputs one JSON object per line when run with -jsonl.
//
// Typical line (pretty-printed):
// {
//   "template-id": "cve-2024-27198",
//   "type": "http",
//   "host": "https://target.example.com",
//   "matched-at": "/api/admin",
//   "severity": "critical",
//   "title": "JetBrains TeamCity Authentication Bypass",
//   "description": "...",
//   "info": { "name": "...", "severity": "critical", ... },
//   "extracted-results": [...],
//   "curl-command": "...",
//   "matcher-name": "..."
// }

interface NucleiJsonLine {
  "template-id"?: string;
  type?: string;
  host?: string;
  "matched-at"?: string;
  severity?: string;
  title?: string;
  description?: string;
  "curl-command"?: string;
  "extracted-results"?: string[];
  "matcher-name"?: string;
  info?: {
    name?: string;
    severity?: string;
    description?: string;
    classification?: {
      cve_id?: string;
      cwe_id?: string;
      cvss_score?: string;
      cvss_metrics?: string;
    };
    remediation?: string;
    tags?: string[];
  };
}

export class NucleiParser implements OutputParser {
  readonly name = "nuclei-json";

  canParse(toolName: string): boolean {
    return toolName.toLowerCase() === "nuclei";
  }

  parse(params: {
    toolName: string;
    scanId: number;
    target: string;
    stdout: string;
    stderr: string;
  }): Finding[] {
    const { scanId } = params;
    const findings: Finding[] = [];

    const lines = params.stdout.split("\n").filter((l) => l.trim().length > 0);

    for (const line of lines) {
      let parsed: NucleiJsonLine;
      try {
        parsed = JSON.parse(line) as NucleiJsonLine;
      } catch {
        // Skip lines that are not valid JSON — nucleii sometimes emits
        // progress/spinner output to stdout even with -silent
        continue;
      }

      const info = parsed.info ?? {};
      const title = parsed.title ?? info.name ?? "Unknown Finding";
      const severity = this.normalizeSeverity(parsed.severity ?? info.severity ?? "info");
      const url = parsed["matched-at"] ?? parsed.host ?? params.target;
      const cveIds = this.extractCveIds(info);
      const cweIds = this.extractCweIds(info);

      findings.push({
        scanId,
        title,
        severity,
        url,
        description: parsed.description ?? info.description ?? null,
        evidence: parsed["curl-command"] ?? null,
        fix: info.remediation ?? null,
        toolName: "nuclei",
        templateId: parsed["template-id"] ?? null,
        cveIds,
        cweIds,
        rawOutput: line,
      });
    }

    return findings;
  }

  private normalizeSeverity(raw: string): Finding["severity"] {
    const sev = raw.toLowerCase();
    if (["critical", "high", "medium", "low", "info"].includes(sev)) {
      return sev as Finding["severity"];
    }
    return "info";
  }

  private extractCveIds(info: NucleiJsonLine["info"]): string[] {
    const classification = info?.classification;
    if (!classification) return [];

    const ids: string[] = [];
    if (classification.cve_id) {
      ids.push(...classification.cve_id.split(",").map((s) => s.trim()));
    }
    return ids;
  }

  private extractCweIds(info: NucleiJsonLine["info"]): string[] {
    const classification = info?.classification;
    if (!classification) return [];

    const ids: string[] = [];
    if (classification.cwe_id) {
      ids.push(...classification.cwe_id.split(",").map((s) => s.trim()));
    }
    return ids;
  }
}
