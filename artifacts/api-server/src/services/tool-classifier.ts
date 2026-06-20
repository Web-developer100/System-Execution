// ---------------------------------------------------------------------------
// Automatic Tool Classification & Capability Detection Service
// ---------------------------------------------------------------------------
//
// Analyzes GitHub repositories to automatically determine:
//   - Tool category (web, network, cloud, etc.)
//   - Capabilities (what the tool can do)
//   - Risk coverage (CWE, MITRE ATT&CK mappings)
//   - Input/output types
//   - Verification methods
//
// Instead of asking the administrator, the platform analyzes:
//   - README content
//   - CLI help output
//   - GitHub Topics
//   - GitHub Language API
//   - Project structure
//   - Argument parsing
//   - Source code patterns

import { execSync } from "node:child_process";
import { logger } from "../lib/logger";
import type { PluginCategory } from "../plugin/types";

// ── Classification Result ───────────────────────────────────────────────────

export interface ClassificationResult {
  category: PluginCategory;
  capabilities: string[];
  confidence: number; // 0-1
  inputTypes: string[];
  outputTypes: string[];
  riskCoverage: RiskCoverage;
  verificationMethods: string[];
  cweIds: string[];
  mitreIds: string[];
  estimatedAccuracy: number;
  falsePositiveRate: number;
}

export interface RiskCoverage {
  owaspTop10: string[];
  owaspApiTop10: string[];
  cwe: string[];
  mitreAttack: string[];
}

// ── Classification Engine ───────────────────────────────────────────────────

export class ToolClassifier {
  /**
   * Classify a tool from its name, description, tags, and README content.
   * This is the main entry point for automatic classification.
   */
  async classify(params: {
    name: string;
    description?: string | null;
    tags?: string[];
    readmeContent?: string;
    repoPath?: string;
    githubTopics?: string[];
    language?: string;
  }): Promise<ClassificationResult> {
    const { name, description, tags, readmeContent, repoPath, githubTopics, language } = params;

    const haystack = [
      name,
      description ?? "",
      (tags ?? []).join(" "),
      readmeContent ?? "",
      (githubTopics ?? []).join(" "),
    ].join(" ").toLowerCase();

    // 1. Determine category
    const { category, confidence } = this.detectCategory(name, haystack, language);

    // 2. Detect capabilities
    const capabilities = this.detectCapabilities(haystack);

    // 3. Detect input/output types
    const inputTypes = this.detectInputTypes(haystack);
    const outputTypes = this.detectOutputTypes(haystack);

    // 4. Determine risk coverage
    const riskCoverage = this.detectRiskCoverage(haystack);
    const cweIds = riskCoverage.cwe;
    const mitreIds = riskCoverage.mitreAttack;

    // 5. Detect verification methods
    const verificationMethods = this.detectVerificationMethods(haystack);

    // 6. Estimate accuracy from patterns
    const estimatedAccuracy = this.estimateAccuracy(confidence, capabilities.length);
    const falsePositiveRate = this.estimateFalsePositiveRate(category, capabilities);

    // If we have a repo path, try to run CLI help for deeper analysis
    if (repoPath) {
      try {
        const cliInsights = await this.analyzeCliHelp(repoPath, name);
        if (cliInsights) {
          capabilities.push(...cliInsights.capabilities.filter((c) => !capabilities.includes(c)));
          inputTypes.push(...cliInsights.inputTypes.filter((t) => !inputTypes.includes(t)));
          outputTypes.push(...cliInsights.outputTypes.filter((t) => !outputTypes.includes(t)));
        }
      } catch {
        // CLI analysis is best-effort
      }
    }

    return {
      category,
      capabilities: [...new Set(capabilities)],
      confidence,
      inputTypes: [...new Set(inputTypes)],
      outputTypes: [...new Set(outputTypes)],
      riskCoverage,
      verificationMethods,
      cweIds,
      mitreIds,
      estimatedAccuracy,
      falsePositiveRate,
    };
  }

  // ── Category Detection ────────────────────────────────────────────────────

  private detectCategory(name: string, haystack: string, language?: string): { category: PluginCategory; confidence: number } {
    const rules: Array<{ pattern: RegExp; category: PluginCategory; weight: number }> = [
      { pattern: /subdomain|dns[ -]enum|asset[ -]discover|recon/i, category: "recon", weight: 4 },
      { pattern: /port[ -]scan|tcp[ -]scan|network[ -]scan|nmap|naabu/i, category: "network", weight: 4 },
      { pattern: /vulnerab[^\s]*[ -]scan|vulnerab[^\s]*[ -]detect|cve[ -]scan|nuclei/i, category: "scanner", weight: 4 },
      { pattern: /fuzz|directory[ -]bust|content[ -]discovery|ffuf|gobuster/i, category: "fuzzer", weight: 4 },
      { pattern: /web[ -]app[ -]scan|web[ -]vulnerab|web[ -]security/i, category: "web", weight: 3 },
      { pattern: /api[ -]security|api[ -]test|graphql[ -]test|rest[ -]api/i, category: "api", weight: 3 },
      { pattern: /cloud[ -]security|aws[ -]test|azure[ -]test|gcp[ -]test/i, category: "cloud", weight: 4 },
      { pattern: /kubernetes|k8s[ -]security|helm[ -]test|cluster[ -]scan/i, category: "kubernetes", weight: 4 },
      { pattern: /exploit|rce[ -]detect|remote[ -]code[ -]exec/i, category: "exploit", weight: 4 },
      { pattern: /password|crack|hash[ -]dump|brute[ -]force|hydra|john/i, category: "password", weight: 4 },
      { pattern: /secret[ -]scan|credential[ -]scan|token[ -]detect|trufflehog|gitleaks/i, category: "secrets", weight: 4 },
      { pattern: /container[ -]scan|docker[ -]scan|image[ -]scan|trivy|grype/i, category: "container", weight: 4 },
      { pattern: /ci[ -]cd|pipeline[ -]sec|github[ -]action[ -]sec/i, category: "cicd", weight: 3 },
      { pattern: /sast|static[ -]analysi|code[ -]scan|semgrep|sonar/i, category: "source_code", weight: 4 },
      { pattern: /mobile|android|ios|apk[ -]scan|ipa[ -]scan/i, category: "mobile", weight: 4 },
      { pattern: /xss|sql[ -]inject|sqli|ssrf|csrf|rce[ -]detect/i, category: "web", weight: 3 },
      { pattern: /osint|shodan|censys|whois|email[ -]recon/i, category: "osint", weight: 4 },
      { pattern: /wireless|wifi|bluetooth|rf[ -]scan|aircrack/i, category: "wireless", weight: 4 },
      { pattern: /iot|firmware|embedded[ -]sec|modbus/i, category: "iot", weight: 4 },
      { pattern: /active[ -]director|ldap[ -]enum|kerberos|ad[ -]sec/i, category: "active_directory", weight: 4 },
      { pattern: /malware|ransomware|trojan[ -]detect/i, category: "malware_analysis", weight: 4 },
      { pattern: /reverse[ -]engineer|disassem|binary[ -]analysi/i, category: "reverse_engineering", weight: 4 },
      { pattern: /crawl|spider|web[ -]crawl|scrape/i, category: "crawler", weight: 2 },
      { pattern: /supply[ -]chain|sbom|dependency[ -]check/i, category: "supply_chain", weight: 4 },
      { pattern: /ai[ -]sec|llm[ -]sec|machine[ -]learn[ -]sec/i, category: "ai", weight: 3 },
    ];

    let bestCategory: PluginCategory = "tool";
    let bestScore = 0;

    for (const rule of rules) {
      const matches = (haystack.match(rule.pattern) || []).length;
      const score = matches * rule.weight;
      if (score > bestScore) {
        bestScore = score;
        bestCategory = rule.category;
      }
    }

    // Boost confidence if we got strong matches
    const confidence = Math.min(0.95, 0.3 + bestScore * 0.12);

    return { category: bestCategory, confidence };
  }

  // ── Capability Detection ──────────────────────────────────────────────────

  private detectCapabilities(haystack: string): string[] {
    const caps: string[] = [];

    const checks: Array<{ pattern: RegExp; capability: string }> = [
      { pattern: /subdomain[ -]enum|find[ -]subdomain|dns[ -]enum/i, capability: "subdomain_enumeration" },
      { pattern: /port[ -]scan|open[ -]port|port[ -]detect/i, capability: "port_scanning" },
      { pattern: /vulnerab[^\s]*[ -]scan|vulnerab[^\s]*[ -]detect/i, capability: "vulnerability_detection" },
      { pattern: /tech[ -]detect|fingerprint|whatweb|wappalyzer/i, capability: "technology_detection" },
      { pattern: /content[ -]discovery|directory[ -]bust|path[ -]enum/i, capability: "content_discovery" },
      { pattern: /xss|cross[ -]site[ -]script/i, capability: "xss_detection" },
      { pattern: /sql[ -]inject|sqli/i, capability: "sql_injection_detection" },
      { pattern: /ssrf[ -]detect|server[ -]side[ -]request[ -]forg/i, capability: "ssrf_detection" },
      { pattern: /rce[ -]detect|remote[ -]code[ -]exec/i, capability: "rce_detection" },
      { pattern: /file[ -]inclusion|lfi|rfi/i, capability: "file_inclusion_detection" },
      { pattern: /open[ -]redirect|url[ -]redirect/i, capability: "open_redirect_detection" },
      { pattern: /crawl|spider|web[ -]crawl/i, capability: "web_crawling" },
      { pattern: /secret[ -]scan|credential[ -]detect|key[ -]find/i, capability: "secret_detection" },
      { pattern: /cors[ -]scan|cors[ -]test/i, capability: "cors_testing" },
      { pattern: /ssl[ -]tls|cert[ -]check|cipher[ -]scan/i, capability: "ssl_tls_testing" },
      { pattern: /cloud[ -]enum|aws[ -]enum|azure[ -]enum|gcp[ -]enum/i, capability: "cloud_enumeration" },
      { pattern: /kubernetes|k8s[ -]audit|cluster[ -]scan/i, capability: "kubernetes_audit" },
      { pattern: /container[ -]scan|docker[ -]scan|image[ -]scan/i, capability: "container_scanning" },
      { pattern: /sast|static[ -]analysi|code[ -]audit/i, capability: "static_analysis" },
      { pattern: /api[ -]test|api[ -]fuzz|graphql[ -]test/i, capability: "api_testing" },
      { pattern: /rate[ -]limit|brute[ -]force|auth[ -]bypass/i, capability: "auth_testing" },
      { pattern: /osint|whois|dns[ -]lookup|email[ -]find/i, capability: "osint" },
      { pattern: /password|crack|hash|brute[ -]force/i, capability: "password_cracking" },
      { pattern: /exploit|rce|shell[ -]upload/i, capability: "exploitation" },
    ];

    for (const check of checks) {
      if (check.pattern.test(haystack) && !caps.includes(check.capability)) {
        caps.push(check.capability);
      }
    }

    return caps;
  }

  // ── Input/Output Type Detection ───────────────────────────────────────────

  private detectInputTypes(haystack: string): string[] {
    const types: string[] = [];

    if (/url|https?:|website|domain/i.test(haystack)) types.push("url");
    if (/ip[ -]address|cidr|range|network/i.test(haystack)) types.push("ip_range");
    if (/domain|subdomain|fqdn/i.test(haystack)) types.push("domain");
    if (/file[ -]path|directory|repo/i.test(haystack)) types.push("file_path");
    if (/api[ -]endpoint|graphql|rest/i.test(haystack)) types.push("api_endpoint");
    if (/docker[ -]image|container[ -]name/i.test(haystack)) types.push("container_image");
    if (/cloud[ -]account|aws[ -]arn|azure[ -]sub/i.test(haystack)) types.push("cloud_account");
    if (/kubernetes|k8s[ -]config|cluster/i.test(haystack)) types.push("kubernetes_cluster");
    if (/mobile|apk|ipa|android/i.test(haystack)) types.push("mobile_app");

    return types.length > 0 ? types : ["url"];
  }

  private detectOutputTypes(haystack: string): string[] {
    const types: string[] = [];

    if (/json|jsonl/i.test(haystack)) types.push("json");
    if (/xml/i.test(haystack)) types.push("xml");
    if (/csv|table/i.test(haystack)) types.push("csv");
    if (/text|plain[ -]text/i.test(haystack)) types.push("text");
    if (/html|report/i.test(haystack)) types.push("html");
    if (/markdown|md[ -]report/i.test(haystack)) types.push("markdown");

    return types.length > 0 ? [...new Set(types)] : ["json", "text"];
  }

  // ── Risk Coverage Detection ────────────────────────────────────────────────

  private detectRiskCoverage(haystack: string): RiskCoverage {
    const owaspTop10: string[] = [];
    const owaspApiTop10: string[] = [];
    const cwe: string[] = [];
    const mitreAttack: string[] = [];

    // OWASP Top 10
    if (/xss|cross[ -]site/i.test(haystack)) owaspTop10.push("A03:2021-Injection");
    if (/injection|sql[ -]inject|sqli|nosql/i.test(haystack)) owaspTop10.push("A03:2021-Injection");
    if (/broken[ -]auth|auth[ -]bypass|session/i.test(haystack)) owaspTop10.push("A07:2021-Identification-and-Authentication-Failures");
    if (/sensitive[ -]data|exposure|leak|secret/i.test(haystack)) owaspTop10.push("A04:2021-Sensitive-Data-Exposure");
    if (/xxe|xml[ -]external/i.test(haystack)) owaspTop10.push("A05:2021-Security-Misconfiguration");
    if (/broken[ -]access|access[ -]control|privilege/i.test(haystack)) owaspTop10.push("A01:2021-Broken-Access-Control");
    if (/security[ -]misconfig|default[ -]cred|header/i.test(haystack)) owaspTop10.push("A05:2021-Security-Misconfiguration");
    if (/ssrf/i.test(haystack)) owaspTop10.push("A10:2021-Server-Side-Request-Forgery");

    // CWE mappings
    if (/xss|cross[ -]site[ -]script/i.test(haystack)) cwe.push("CWE-79");
    if (/sql[ -]inject/i.test(haystack)) cwe.push("CWE-89");
    if (/ssrf/i.test(haystack)) cwe.push("CWE-918");
    if (/rce|command[ -]inject/i.test(haystack)) cwe.push("CWE-78");
    if (/path[ -]traversal|lfi|rfi/i.test(haystack)) cwe.push("CWE-22");
    if (/open[ -]redirect/i.test(haystack)) cwe.push("CWE-601");

    // MITRE ATT&CK
    if (/recon|discover|enum/i.test(haystack)) mitreAttack.push("TA0043-Reconnaissance");
    if (/exploit|rce|vulnerab/i.test(haystack)) mitreAttack.push("TA0001-Initial-Access");
    if (/persist|backdoor|cron/i.test(haystack)) mitreAttack.push("TA0003-Persistence");
    if (/cred|password|hash|token/i.test(haystack)) mitreAttack.push("TA0006-Credential-Access");
    if (/collect|exfil|data[ -]leak/i.test(haystack)) mitreAttack.push("TA0009-Collection");

    return { owaspTop10, owaspApiTop10, cwe, mitreAttack };
  }

  // ── Verification Method Detection ─────────────────────────────────────────

  private detectVerificationMethods(haystack: string): string[] {
    const methods: string[] = [];

    if (/http[ -]response|status[ -]code|header[ -]check/i.test(haystack)) methods.push("http_response_analysis");
    if (/dns[ -]lookup|dns[ -]resolv|dns[ -]query/i.test(haystack)) methods.push("dns_verification");
    if (/ssl[ -]cert|certificate[ -]check|tls[ -]handshake/i.test(haystack)) methods.push("ssl_tls_verification");
    if (/banner[ -]grab|banner[ -]detect/i.test(haystack)) methods.push("banner_grabbing");
    if (/response[ -]match|pattern[ -]match|regex/i.test(haystack)) methods.push("response_matching");
    if (/exploit|payload|shell/i.test(haystack)) methods.push("active_exploitation");

    return methods.length > 0 ? methods : ["response_matching"];
  }

  // ── Accuracy Estimation ───────────────────────────────────────────────────

  private estimateAccuracy(confidence: number, capabilityCount: number): number {
    // Base accuracy from confidence
    let accuracy = confidence * 85;
    // Boost for mature tools with multiple capabilities
    accuracy += Math.min(capabilityCount * 3, 10);
    return Math.min(95, Math.round(accuracy));
  }

  private estimateFalsePositiveRate(category: PluginCategory, capabilities: string[]): number {
    // Different categories have different FP rates
    const rates: Partial<Record<PluginCategory, number>> = {
      scanner: 15,
      web: 12,
      fuzzer: 20,
      exploit: 8,
      password: 5,
      network: 5,
      source_code: 3,
      secrets: 5,
      recon: 10,
    };
    const baseRate = rates[category] ?? 10;
    // More capabilities typically means more FP possibilities
    return Math.min(30, baseRate + Math.floor(capabilities.length / 3));
  }

  // ── CLI Help Analysis ─────────────────────────────────────────────────────

  private async analyzeCliHelp(repoPath: string, toolName: string): Promise<{ capabilities: string[]; inputTypes: string[]; outputTypes: string[] } | null> {
    const capabilities: string[] = [];
    const inputTypes: string[] = [];
    const outputTypes: string[] = [];

    try {
      const helpText = this.runCommand(toolName, ["--help"], repoPath);

      if (/--target|-t|-u|--url/i.test(helpText)) inputTypes.push("url");
      if (/--list|-l|--file|-f/i.test(helpText)) inputTypes.push("file_path");
      if (/--json|--jsonl|-j/i.test(helpText)) outputTypes.push("json");
      if (/--xml|-x/i.test(helpText)) outputTypes.push("xml");
      if (/--csv/i.test(helpText)) outputTypes.push("csv");
      if (/--output|-o|--report/i.test(helpText)) outputTypes.push("report");
      if (/--silent|-s|--verbose|-v/i.test(helpText)) capabilities.push("output_formatting");

      return { capabilities, inputTypes, outputTypes };
    } catch {
      return null;
    }
  }

  private runCommand(cmd: string, args: string[], cwd: string): string {
    try {
      return execSync(`${cmd} ${args.join(" ")}`, {
        cwd,
        timeout: 10_000,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch {
      // If the binary isn't built yet, try looking for it
      const possiblePaths = [
        `${cwd}/${cmd}`,
        `${cwd}/bin/${cmd}`,
        `${cwd}/target/release/${cmd}`,
      ];
      for (const p of possiblePaths) {
        try {
          return execSync(`${p} ${args.join(" ")}`, {
            timeout: 10_000,
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
          });
        } catch {
          continue;
        }
      }
      throw new Error(`Could not run ${cmd} --help`);
    }
  }
}

export const toolClassifier = new ToolClassifier();
