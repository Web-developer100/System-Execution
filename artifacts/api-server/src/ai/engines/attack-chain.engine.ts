// ---------------------------------------------------------------------------
// AI Attack Chain Detection Engine
// ---------------------------------------------------------------------------
//
// Detects chained vulnerabilities such as:
//   - XSS → Session Hijacking → Admin Access
//   - SQL Injection → Data Extraction → RCE
//   - SSRF → Cloud Metadata Access → Privilege Escalation
//
// Visualizes attack paths with graph data.

import { logger } from "../../lib/logger";
import type {
  AttackChainInput,
  AttackChainResult,
  DetectedChain,
  AttackChainNode,
  AttackChainEdge,
  ChainStep,
} from "../types";

// ── Known Attack Chain Patterns ───────────────────────────────────────────

interface ChainTemplate {
  type: string;
  name: string;
  description: string;
  pattern: Array<{
    vulnType: string;
    stepType: string;
    description: string;
  }>;
  riskScore: number;
}

const CHAIN_TEMPLATES: ChainTemplate[] = [
  {
    type: "xss_hijack",
    name: "XSS → Session Hijacking → Admin Access",
    description: "An XSS vulnerability allows an attacker to steal session cookies, which can be used to hijack an admin session and gain privileged access.",
    pattern: [
      { vulnType: "xss", stepType: "initial_access", description: "Inject JavaScript payload via XSS" },
      { vulnType: "auth_bypass", stepType: "privilege_escalation", description: "Steal session cookie and impersonate admin" },
    ],
    riskScore: 85,
  },
  {
    type: "sqli_extract",
    name: "SQL Injection → Data Extraction → RCE",
    description: "A SQL injection vulnerability allows extracting database contents, which reveals admin credentials. These credentials enable remote code execution through admin panels.",
    pattern: [
      { vulnType: "sql_injection", stepType: "initial_access", description: "Extract admin credentials via SQL injection" },
      { vulnType: "rce", stepType: "rce", description: "Login as admin and achieve RCE via file upload or command injection" },
    ],
    riskScore: 95,
  },
  {
    type: "ssrf_cloud",
    name: "SSRF → Cloud Metadata → Privilege Escalation",
    description: "An SSRF vulnerability allows accessing cloud provider metadata endpoints, which expose IAM credentials. These credentials can be used to escalate privileges within the cloud environment.",
    pattern: [
      { vulnType: "ssrf", stepType: "initial_access", description: "Access cloud instance metadata (169.254.169.254)" },
      { vulnType: "sensitive_data_exposure", stepType: "privilege_escalation", description: "Extract IAM credentials from metadata response" },
    ],
    riskScore: 90,
  },
  {
    type: "data_exfiltration",
    name: "Information Disclosure → Reconnaissance → Data Theft",
    description: "Multiple information leaks combine to enable targeted data theft. Directory listing reveals file locations, .git disclosure exposes source code with embedded secrets.",
    pattern: [
      { vulnType: "sensitive_data_exposure", stepType: "initial_access", description: "Discover sensitive files through enumeration" },
    ],
    riskScore: 65,
  },
  {
    type: "open_port_chain",
    name: "Port Discovery → Service Exploitation → Network Pivot",
    description: "Open ports reveal vulnerable services that can be exploited to gain initial access, followed by lateral movement to internal network targets.",
    pattern: [
      { vulnType: "open_port", stepType: "initial_access", description: "Discover and fingerprint open services" },
    ],
    riskScore: 70,
  },
];

export class AttackChainEngine {
  constructor() {
    logger.info("[ATTACK-CHAIN] Attack Chain Detection Engine initialized");
  }

  detect(input: AttackChainInput): AttackChainResult {
    const { scanId, findings, allAnalyses } = input;
    const startTime = Date.now();

    // Build type map from findings
    const findingsByType = new Map<string, typeof findings>();
    for (const finding of findings) {
      const type = this.detectVulnType(finding.title, finding.description ?? "");
      if (!findingsByType.has(type)) findingsByType.set(type, []);
      findingsByType.get(type)!.push(finding);
    }

    // Match findings against chain templates
    const chains: DetectedChain[] = [];
    const allNodes: AttackChainNode[] = [];
    const allEdges: AttackChainEdge[] = [];
    let chainIdCounter = 0;

    for (const template of CHAIN_TEMPLATES) {
      const matchedSteps: ChainStep[] = [];
      let allPatternsMatched = true;

      for (const patternStep of template.pattern) {
        const matchingFindings = findingsByType.get(patternStep.vulnType) ?? [];

        if (matchingFindings.length > 0) {
          const finding = matchingFindings[0];
          const analysis = allAnalyses.find((a) => a.findingId === finding._index);

          matchedSteps.push({
            order: patternStep.stepType === "initial_access" ? 0 : 1,
            vulnerabilityId: finding._index ?? 0,
            vulnerabilityTitle: finding.title,
            stepType: patternStep.stepType,
            description: patternStep.description,
            exploitCondition: `Requires network access to ${finding.url}`,
            successProbability: analysis ? analysis.confidence : 50,
          });
        } else if (patternStep.stepType === "initial_access") {
          // First step must match
          allPatternsMatched = false;
        }
      }

      if (allPatternsMatched && matchedSteps.length >= 1) {
        chainIdCounter++;
        const entryFinding = matchedSteps[0];
        const exitFinding = matchedSteps[matchedSteps.length - 1];
        const entryVuln = findings.find((f) => f._index === entryFinding.vulnerabilityId);

        // Build graph nodes
        const chainPrefix = `chain-${chainIdCounter}`;
        for (const step of matchedSteps) {
          const vuln = findings.find((f) => f._index === step.vulnerabilityId);
          allNodes.push({
            id: `${chainPrefix}-step-${step.order}`,
            label: vuln?.title ?? step.stepType,
            type: "vulnerability",
            severity: vuln?.severity ?? "medium",
            vulnerabilityId: step.vulnerabilityId,
          });
        }

        // Build graph edges
        for (let i = 0; i < matchedSteps.length - 1; i++) {
          allEdges.push({
            source: `${chainPrefix}-step-${matchedSteps[i].order}`,
            target: `${chainPrefix}-step-${matchedSteps[i + 1].order}`,
            label: "enables",
            type: "enables",
          });
        }

        chains.push({
          id: chainIdCounter,
          name: template.name,
          description: template.description,
          chainType: template.type as DetectedChain["chainType"],
          riskScore: template.riskScore,
          steps: matchedSteps,
          entryVulnerabilityId: entryFinding.vulnerabilityId,
          exitVulnerabilityId: exitFinding.vulnerabilityId,
          mitigations: this.generateMitigations(template.type),
        });
      }
    }

    const durationMs = Date.now() - startTime;

    logger.info({
      scanId,
      chainsFound: chains.length,
      durationMs,
    }, "[ATTACK-CHAIN] Detection complete");

    return {
      chains,
      graph: {
        nodes: allNodes,
        edges: allEdges,
      },
    };
  }

  private detectVulnType(title: string, description: string): string {
    const text = `${title} ${description}`.toLowerCase();
    if (/xss|cross[-\s]site[-\s]script/i.test(text)) return "xss";
    if (/sql[-\s]inject|sqli/i.test(text)) return "sql_injection";
    if (/ssrf|server[-\s]side[-\s]request/i.test(text)) return "ssrf";
    if (/rce|remote[-\s]code|command[-\s]inject/i.test(text)) return "rce";
    if (/open[-\s]redirect/i.test(text)) return "open_redirect";
    if (/csrf|cross[-\s]site[-\s]request/i.test(text)) return "csrf";
    if (/\.env|expos|leak|secret|credential/i.test(text)) return "sensitive_data_exposure";
    if (/open[-\s]port|port[-\s]\d+/i.test(text)) return "open_port";
    if (/auth[-\s]bypass|authentication[-\s]bypass/i.test(text)) return "auth_bypass";
    if (/privilege[-\s]escalation/i.test(text)) return "privilege_escalation";
    return "general";
  }

  private generateMitigations(chainType: string): string[] {
    const mitigations: Record<string, string[]> = {
      xss_hijack: [
        "Implement Content-Security-Policy headers",
        "Set HttpOnly and Secure flags on session cookies",
        "Implement output encoding for all user-controlled data",
        "Use SameSite=Strict cookie attribute",
        "Regenerate session IDs after authentication",
      ],
      sqli_extract: [
        "Use parameterized queries or prepared statements",
        "Implement proper input validation and sanitization",
        "Apply least-privilege database user permissions",
        "Use WAF rules to block SQL injection patterns",
        "Implement query allowlisting",
      ],
      ssrf_cloud: [
        "Restrict outbound network access from application servers",
        "Use an allowlist of permitted external URLs",
        "Block access to internal IP ranges (169.254.0.0/16, 10.0.0.0/8, etc.)",
        "Implement URL validation against an allowlist",
        "Use a dedicated URL parser that blocks IP-based URLs",
      ],
    };
    return mitigations[chainType] ?? [
      "Apply defense-in-depth security measures",
      "Implement proper access controls",
      "Regular security scanning and monitoring",
    ];
  }
}
