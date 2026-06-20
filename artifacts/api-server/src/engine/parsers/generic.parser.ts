import type { Finding } from "../types";
import type { OutputParser } from "../parser.interface";

// ── Generic Output Parser ──────────────────────────────────────────────────
//
// Fallback parser that applies heuristic patterns to any tool output.
// Used when no dedicated parser is registered for a tool.

export class GenericParser implements OutputParser {
  readonly name = "generic";

  /** Accept any tool — this is the fallback */
  canParse(_toolName: string): boolean {
    return true;
  }

  parse(params: {
    toolName: string;
    scanId: number;
    target: string;
    stdout: string;
    stderr: string;
  }): Finding[] {
    const { toolName, scanId, target } = params;
    const findings: Finding[] = [];

    // ── Scan for CVE references in output ──────────────────────────────────

    const cveRegex = /CVE-\d{4}-\d{4,7}/gi;
    const cveMatches = params.stdout.matchAll(cveRegex);
    const cveIds = [...new Set(Array.from(cveMatches, (m) => m[0].toUpperCase()))];

    if (cveIds.length > 0) {
      findings.push({
        scanId,
        title: `CVE References Found: ${cveIds.slice(0, 5).join(", ")}${cveIds.length > 5 ? ` +${cveIds.length - 5} more` : ""}`,
        severity: "medium",
        url: target,
        description: `Tool "${toolName}" output contains references to ${cveIds.length} CVE identifiers.`
          + " These may indicate known vulnerabilities relevant to the target.",
        evidence: cveIds.join("\n"),
        fix: "Review each CVE and assess applicability to the target. Apply vendor patches where available.",
        toolName,
        templateId: null,
        cveIds,
        cweIds: [],
        rawOutput: null,
      });
    }

    // ── Scan error output for warnings/errors ──────────────────────────────

    const errorLines = params.stderr
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /error|fail|warn|critical|fatal/i.test(l));

    if (errorLines.length > 0) {
      findings.push({
        scanId,
        title: `Tool Execution Warnings: ${toolName}`,
        severity: "info",
        url: target,
        description: `Tool "${toolName}" produced ${errorLines.length} warning/error line(s) on stderr.`
          + " These may indicate configuration issues or unexpected behavior.",
        evidence: errorLines.slice(0, 20).join("\n"),
        fix: null,
        toolName,
        templateId: null,
        cveIds: [],
        cweIds: [],
        rawOutput: null,
      });
    }

    // ── Simple finding with stdout length as informational ─────────────────

    const outputLen = (params.stdout + params.stderr).length;
    if (outputLen > 0) {
      findings.push({
        scanId,
        title: `Raw Output Captured: ${toolName}`,
        severity: "info",
        url: target,
        description: `Tool "${toolName}" produced ${outputLen} characters of output.`
          + " Raw output is available for manual review."
          + ` Exit code: ${params.stdout.length > 0 ? "completed" : "no-stdout-only"}`,
        evidence: params.stdout.slice(0, 2000),
        fix: null,
        toolName,
        templateId: null,
        cveIds: [],
        cweIds: [],
        rawOutput: null,
      });
    }

    return findings;
  }
}
