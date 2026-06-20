import type { Finding } from "../types";
import type { OutputParser } from "../parser.interface";

// ── Nmap XML Output Parser ────────────────────────────────────────────────
//
// Parses nmap XML output to discover open ports / services.
// We use a lightweight regex-based approach for the most common patterns
// rather than pulling in a full XML parser.

interface ParsedPort {
  port: number;
  protocol: string;
  state: string;
  service: string;
  product: string;
  version: string;
  cpe: string;
}

export class NmapParser implements OutputParser {
  readonly name = "nmap-xml";

  canParse(toolName: string): boolean {
    return toolName.toLowerCase() === "nmap" || toolName.toLowerCase() === "naabu";
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

    let ports: ParsedPort[];

    if (params.toolName.toLowerCase() === "naabu") {
      // Naabu outputs plaintext: "port:protocol:state"
      ports = this.parseNaabuOutput(params.stdout);
    } else {
      ports = this.parseNmapXmlOutput(params.stdout);
    }

    // Mark critical open ports
    const criticalPorts = new Set([21, 22, 23, 25, 53, 110, 143, 445, 993, 995,
      3306, 3389, 5432, 6379, 8080, 8443, 9200, 9300, 27017]);

    for (const port of ports) {
      if (port.state !== "open") continue;

      const isCritical = criticalPorts.has(port.port);
      const serviceLabel = port.service || String(port.port);

      let title: string;
      let severity: Finding["severity"];
      let description: string;

      if (isCritical && port.port <= 1024) {
        title = `OPEN PORT (${port.port}/${port.protocol}) — Privileged Port Exposed: ${serviceLabel}`;
        severity = "high";
        description = `Port ${port.port} (${port.protocol}) is open and accessible.`
          + `Service: ${port.service || "Unknown"}`
          + `${port.product ? ` — ${port.product} ${port.version}` : ""}`
          + `. Privileged ports (< 1024) should not be exposed unless absolutely necessary.`;
      } else if (isCritical) {
        title = `OPEN PORT (${port.port}/${port.protocol}) — ${serviceLabel}`;
        severity = "medium";
        description = `Port ${port.port} (${port.protocol}) is open.`
          + `Service: ${port.service || "Unknown"}`
          + `${port.product ? ` — ${port.product} ${port.version}` : ""}`
          + `. This port is commonly targeted by attackers and should be reviewed.`;
      } else {
        title = `OPEN PORT (${port.port}/${port.protocol}) — ${serviceLabel}`;
        severity = "low";
        description = `Port ${port.port} (${port.protocol}) is open.`
          + `Service: ${port.service || "Unknown"}`
          + `${port.product ? ` — ${port.product} ${port.version}` : ""}`;
      }

      findings.push({
        scanId,
        title,
        severity,
        url: `${port.protocol}://${target.replace(/^https?:\/\//, "").split("/")[0]}:${port.port}`,
        description,
        evidence: `State: ${port.state} | Service: ${port.service} | Product: ${port.product} ${port.version}`.trim(),
        fix: isCritical
          ? `Review ${serviceLabel} service on port ${port.port}:\n`
            + "1. Change to a non-default port if possible\n"
            + "2. Restrict access via firewall (allow-list specific IPs)\n"
            + `3. Ensure ${port.service || "the service"} is updated to the latest version\n`
            + "4. Enable authentication and encryption\n"
            + "5. Monitor access logs regularly"
          : null,
        toolName: params.toolName,
        templateId: null,
        cveIds: [],
        cweIds: [],
        rawOutput: null,
      });
    }

    // Information: total open ports summary
    if (ports.length > 0) {
      findings.push({
        scanId,
        title: `Network Reconnaissance: ${ports.length} Open Ports Discovered`,
        severity: "info",
        url: target,
        description: `Discovered ${ports.length} open ports on ${target}.`
          + ` Open ports: ${ports.filter((p) => p.state === "open").map((p) => `${p.port}/${p.protocol}`).join(", ") || "none"}.`,
        evidence: null,
        fix: null,
        toolName: params.toolName,
        templateId: null,
        cveIds: [],
        cweIds: [],
        rawOutput: null,
      });
    }

    return findings;
  }

  // ── Nmap XML parsing ──────────────────────────────────────────────────────

  private parseNmapXmlOutput(xml: string): ParsedPort[] {
    const ports: ParsedPort[] = [];

    // Extract <port> blocks
    const portRegex = /<port\s+protocol="([^"]*)"\s+portid="(\d+)">\s*<state\s+state="([^"]*)"[^>]*\/>\s*<service\s+name="([^"]*)"(?:[^>]*product="([^"]*)")?(?:[^>]*version="([^"]*)")?(?:[^>]*cpe="([^"]*)")?/gs;

    let match: RegExpExecArray | null;
    while ((match = portRegex.exec(xml)) !== null) {
      ports.push({
        protocol: match[1],
        port: parseInt(match[2], 10),
        state: match[3],
        service: match[4] ?? "unknown",
        product: match[5] ?? "",
        version: match[6] ?? "",
        cpe: match[7] ?? "",
      });
    }

    return ports;
  }

  // ── Naabu plaintext parsing ──────────────────────────────────────────────

  private parseNaabuOutput(text: string): ParsedPort[] {
    const ports: ParsedPort[] = [];

    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Naabu:  "port:protocol:state"
      const parts = trimmed.split(":");
      if (parts.length >= 2) {
        const port = parseInt(parts[0], 10);
        if (!Number.isNaN(port)) {
          ports.push({
            port,
            protocol: parts[1] ?? "tcp",
            state: parts[2] ?? "open",
            service: "unknown",
            product: "",
            version: "",
            cpe: "",
          });
        }
      }
    }

    return ports;
  }
}
