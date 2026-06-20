import type { Finding } from "../types";
import type { OutputParser } from "../parser.interface";

// ── Subfinder Output Parser ────────────────────────────────────────────────

const SUBDOMAIN_REGEX = /^(?:https?:\/\/)?([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,})$/;

export class SubfinderParser implements OutputParser {
  readonly name = "subfinder-json";

  canParse(toolName: string): boolean {
    return toolName.toLowerCase() === "subfinder";
  }

  parse(params: {
    toolName: string;
    scanId: number;
    target: string;
    stdout: string;
    stderr: string;
  }): Finding[] {
    const { scanId, target } = params;
    const findings: Finding[] = [];

    const { subdomains, isJsonLines } = this.extractSubdomains(params.stdout);

    if (subdomains.length === 0) return [];

    // Group subdomains by TLD for a cleaner report
    const byTld = new Map<string, string[]>();
    for (const sub of subdomains) {
      const parts = sub.split(".");
      const tld = parts.slice(-2).join(".") || "unknown";
      if (!byTld.has(tld)) byTld.set(tld, []);
      byTld.get(tld)!.push(sub);
    }

    // If only a handful of subdomains, report each one individually
    if (subdomains.length <= 10) {
      for (const sub of subdomains) {
        findings.push({
          scanId,
          title: `Discovered Subdomain: ${sub}`,
          severity: "info",
          url: `https://${sub}`,
          description: `Subdomain ${sub} was discovered under ${target}.`
            + " This expands the attack surface and should be included in vulnerability assessment scope.",
          evidence: sub,
          fix: null,
          toolName: "subfinder",
          templateId: null,
          cveIds: [],
          cweIds: [],
          rawOutput: isJsonLines ? null : sub,
        });
      }
    } else {
      // Bulk discovery — one finding per TLD group
      for (const [tld, subs] of byTld) {
        findings.push({
          scanId,
          title: `Subdomain Enumeration: ${subdomains.length} Hosts Found (${tld})`,
          severity: "info",
          url: `https://${tld}`,
          description: `Discovered ${subs.length} subdomains under ${tld}.`
            + ` Total across all TLDs: ${subdomains.length}.`
            + " These subdomains represent expanded attack surface and should be scanned.",
          evidence: subs.slice(0, 50).join("\n"),
          fix: null,
          toolName: "subfinder",
          templateId: null,
          cveIds: [],
          cweIds: [],
          rawOutput: null,
        });
      }

      // Summary finding
      findings.push({
        scanId,
        title: `Reconnaissance: ${subdomains.length} Subdomains Discovered`,
        severity: "low",
        url: target,
        description: `Subfinder discovered ${subdomains.length} unique subdomains for ${target}.`
          + ` Top TLDs: ${Array.from(byTld.entries()).sort((a, b) => b[1].length - a[1].length).slice(0, 5).map(([tld, subs]) => `${tld} (${subs.length})`).join(", ")}.`
          + " This information is valuable for attack surface mapping.",
        evidence: subdomains.join("\n"),
        fix: "Review each subdomain to determine if it is necessary and properly secured. "
          + "Remove unused subdomains and ensure all are behind proper security controls.",
        toolName: "subfinder",
        templateId: null,
        cveIds: [],
        cweIds: [],
        rawOutput: null,
      });
    }

    return findings;
  }

  private extractSubdomains(stdout: string): { subdomains: string[]; isJsonLines: boolean } {
    const lines = stdout.split("\n").filter((l) => l.trim().length > 0);
    const subdomains: string[] = [];
    let isJsonLines = false;

    for (const line of lines) {
      // Try JSON first
      if (line.trimStart().startsWith("{")) {
        isJsonLines = true;
        try {
          const parsed = JSON.parse(line) as Record<string, unknown>;
          const host = typeof parsed.host === 'string' ? parsed.host : (typeof parsed["host"] === 'string' ? parsed["host"] : undefined);
          if (host && SUBDOMAIN_REGEX.test(host)) {
            subdomains.push(host);
          }
        } catch {
          // Fall through to plaintext
        }
      } else {
        // Plaintext — one subdomain per line
        const trimmed = line.trim();
        if (SUBDOMAIN_REGEX.test(trimmed)) {
          subdomains.push(trimmed);
        }
      }
    }

    return { subdomains: [...new Set(subdomains)], isJsonLines };
  }
}
