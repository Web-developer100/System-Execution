// ---------------------------------------------------------------------------
// Compliance Framework Mappings ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
// Comprehensive mapping of vulnerabilities to 16 compliance frameworks:
// OWASP Top 10, OWASP API Top 10, PCI DSS, ISO 27001, SOC 2, HIPAA, GDPR,
// NIST CSF, NIST 800-53, CIS Benchmarks, MITRE ATT&CK, MITRE D3FEND,
// DISA STIG, FedRAMP, Cyber Essentials, and Custom frameworks.

import type { ComplianceFramework, ComplianceMapping } from "./types";
import type { ReportData } from "../report-generator";

// ── Framework Display Names ────────────────────────────────────────────────

export const FRAMEWORK_DISPLAY_NAMES: Record<ComplianceFramework, string> = {
  owasp_top10: "OWASP Top 10 (2021)",
  owasp_api_top10: "OWASP API Top 10 (2023)",
  pci_dss: "PCI DSS v4.0",
  iso_27001: "ISO/IEC 27001:2022",
  soc2: "SOC 2 (Trust Services Criteria)",
  hipaa: "HIPAA Security Rule",
  gdpr: "GDPR (General Data Protection Regulation)",
  nist_csf: "NIST Cybersecurity Framework 2.0",
  nist_800_53: "NIST SP 800-53 Rev. 5",
  cis_benchmarks: "CIS Benchmarks v8",
  mitre_attack: "MITRE ATT&CK v14",
  mitre_d3fend: "MITRE D3FEND v3",
  disa_stig: "DISA STIG v5",
  fedramp: "FedRAMP Tailored Baseline",
  cyber_essentials: "Cyber Essentials Plus",
  custom: "Custom Framework",
};

// ── Framework Mappings ─────────────────────────────────────────────────────

interface ControlMapping {
  id: string;
  name: string;
  description: string;
  severity: string[];
}

const FRAMEWORK_CONTROLS: Record<ComplianceFramework, ControlMapping[]> = {
  owasp_top10: [
    { id: "A01:2021", name: "Broken Access Control", description: "Access control enforcement", severity: ["critical", "high"] },
    { id: "A02:2021", name: "Cryptographic Failures", description: "Data protection at rest/transit", severity: ["critical", "high", "medium"] },
    { id: "A03:2021", name: "Injection", description: "SQL/NoSQL/OS injection prevention", severity: ["critical", "high"] },
    { id: "A04:2021", name: "Insecure Design", description: "Secure architecture review", severity: ["high", "medium"] },
    { id: "A05:2021", name: "Security Misconfiguration", description: "Secure configuration standards", severity: ["medium", "low"] },
    { id: "A06:2021", name: "Vulnerable Components", description: "Dependency management", severity: ["critical", "high", "medium"] },
    { id: "A07:2021", name: "Auth Failures", description: "Authentication mechanisms", severity: ["critical", "high"] },
    { id: "A08:2021", name: "Integrity Failures", description: "Software integrity verification", severity: ["high", "medium"] },
    { id: "A09:2021", name: "Logging Failures", description: "Monitoring and logging", severity: ["medium", "low"] },
    { id: "A10:2021", name: "SSRF", description: "Server-side request forgery", severity: ["high", "medium"] },
  ],
  owasp_api_top10: [
    { id: "API1:2023", name: "Broken Object Level Auth", description: "Object-level authorization", severity: ["critical", "high"] },
    { id: "API2:2023", name: "Broken Authentication", description: "Authentication bypass", severity: ["critical", "high"] },
    { id: "API3:2023", name: "Broken Object Property Level", description: "Mass assignment prevention", severity: ["high", "medium"] },
    { id: "API4:2023", name: "Unrestricted Resource Consumption", description: "Rate limiting", severity: ["medium", "low"] },
    { id: "API5:2023", name: "Broken Function Level Auth", description: "Function-level authorization", severity: ["high", "medium"] },
    { id: "API6:2023", name: "Unrestricted Access to Sensitive Flows", description: "Sensitive flow protection", severity: ["critical", "high"] },
    { id: "API7:2023", name: "Server Side Request Forgery", description: "SSRF prevention", severity: ["high", "medium"] },
    { id: "API8:2023", name: "Security Misconfiguration", description: "API security hardening", severity: ["medium", "low"] },
    { id: "API9:2023", name: "Improper Inventory Management", description: "API asset management", severity: ["low", "info"] },
    { id: "API10:2023", name: "Unsafe Consumption of APIs", description: "Third-party API security", severity: ["medium", "low"] },
  ],
  pci_dss: [
    { id: "Req 1", name: "Network Security Controls", description: "Firewall configuration", severity: ["critical", "high"] },
    { id: "Req 2", name: "Secure Configuration", description: "System hardening standards", severity: ["high", "medium"] },
    { id: "Req 3", name: "Stored Account Data Protection", description: "Data encryption at rest", severity: ["critical", "high"] },
    { id: "Req 4", name: "Transmission Encryption", description: "Data in transit protection", severity: ["critical", "high"] },
    { id: "Req 5", name: "Malware Protection", description: "Anti-malware controls", severity: ["high", "medium"] },
    { id: "Req 6", name: "Secure Systems", description: "Vulnerability management", severity: ["critical", "high", "medium"] },
    { id: "Req 7", name: "Access Controls", description: "Need-to-know access", severity: ["high", "medium"] },
    { id: "Req 8", name: "Authentication", description: "MFA and identity verification", severity: ["critical", "high"] },
    { id: "Req 9", name: "Physical Security", description: "Facility access controls", severity: ["medium", "low"] },
    { id: "Req 10", name: "Logging & Monitoring", description: "Audit trail management", severity: ["medium", "low"] },
    { id: "Req 11", name: "Security Testing", description: "Regular scanning and testing", severity: ["high", "medium"] },
    { id: "Req 12", name: "Information Security Policy", description: "Policy management", severity: ["medium", "low"] },
  ],
  iso_27001: [
    { id: "A.5.1", name: "Information Security Policies", description: "Policy framework", severity: ["medium", "low"] },
    { id: "A.6.1", name: "Organization of Security", description: "Internal organization", severity: ["medium"] },
    { id: "A.7.1", name: "Human Resources Security", description: "Pre-employment screening", severity: ["low"] },
    { id: "A.8.1", name: "Asset Management", description: "Asset inventory and classification", severity: ["medium", "low"] },
    { id: "A.8.2", name: "Information Classification", description: "Labeling and handling", severity: ["low"] },
    { id: "A.9.1", name: "Access Control", description: "Business requirements", severity: ["high", "medium"] },
    { id: "A.9.2", name: "User Access Management", description: "User provisioning", severity: ["high", "medium"] },
    { id: "A.10.1", name: "Cryptography", description: "Cryptographic controls", severity: ["critical", "high"] },
    { id: "A.11.1", name: "Physical Security", description: "Secure areas", severity: ["medium", "low"] },
    { id: "A.12.1", name: "Operational Security", description: "Operational procedures", severity: ["medium"] },
    { id: "A.12.6", name: "Technical Vulnerability Mgmt", description: "Vulnerability management", severity: ["critical", "high", "medium"] },
    { id: "A.13.1", name: "Network Security", description: "Network controls", severity: ["high", "medium"] },
    { id: "A.14.2", name: "Secure Development", description: "Secure coding practices", severity: ["critical", "high"] },
    { id: "A.16.1", name: "Incident Management", description: "Incident response", severity: ["high", "medium"] },
    { id: "A.17.1", name: "Business Continuity", description: "BCM and DRP", severity: ["medium"] },
    { id: "A.18.1", name: "Compliance", description: "Legal and regulatory", severity: ["high", "medium"] },
  ],
  soc2: [
    { id: "CC1.1", name: "Control Environment", description: "Security culture and governance", severity: ["medium", "low"] },
    { id: "CC2.1", name: "Communication", description: "Security awareness and training", severity: ["low"] },
    { id: "CC3.1", name: "Risk Assessment", description: "Risk identification and analysis", severity: ["high", "medium"] },
    { id: "CC4.1", name: "Monitoring Activities", description: "Continuous monitoring", severity: ["medium"] },
    { id: "CC5.1", name: "Control Activities", description: "Security control implementation", severity: ["high", "medium"] },
    { id: "CC6.1", name: "Logical & Physical Access", description: "Access control management", severity: ["critical", "high"] },
    { id: "CC6.2", name: "User Access", description: "User account management", severity: ["high", "medium"] },
    { id: "CC6.3", name: "Data Access", description: "Data classification and protection", severity: ["critical", "high"] },
    { id: "CC6.4", name: "System Changes", description: "Change management", severity: ["medium"] },
    { id: "CC6.5", name: "System Boundaries", description: "Network segmentation", severity: ["high", "medium"] },
    { id: "CC6.6", name: "Evasive Actions", description: "Malware and unauthorized access", severity: ["high", "medium"] },
    { id: "CC7.1", name: "Detection", description: "Security monitoring and detection", severity: ["high", "medium"] },
    { id: "CC7.2", name: "Response", description: "Incident response procedures", severity: ["high", "medium"] },
    { id: "CC7.3", name: "Remediation", description: "Vulnerability remediation", severity: ["critical", "high"] },
    { id: "CC8.1", name: "System Development", description: "Secure SDLC", severity: ["high", "medium"] },
    { id: "CC9.1", name: "Third Parties", description: "Vendor risk management", severity: ["medium", "low"] },
  ],
  hipaa: [
    { id: "§164.308(a)(1)", name: "Security Management Process", description: "Risk analysis and management", severity: ["critical", "high"] },
    { id: "§164.308(a)(2)", name: "Assigned Security Responsibility", description: "Security officer designation", severity: ["medium"] },
    { id: "§164.308(a)(3)", name: "Workforce Security", description: "Access authorization", severity: ["high", "medium"] },
    { id: "§164.308(a)(4)", name: "Information Access Mgmt", description: "Access control policies", severity: ["high", "medium"] },
    { id: "§164.308(a)(5)", name: "Security Awareness Training", description: "Training and education", severity: ["low"] },
    { id: "§164.308(a)(6)", name: "Security Incident Procedures", description: "Incident response", severity: ["high"] },
    { id: "§164.308(a)(7)", name: "Contingency Plan", description: "Business continuity", severity: ["medium"] },
    { id: "§164.308(a)(8)", name: "Evaluation", description: "Periodic assessment", severity: ["medium"] },
    { id: "§164.312(a)(1)", name: "Access Control", description: "Unique user identification", severity: ["critical", "high"] },
    { id: "§164.312(a)(2)", name: "Audit Controls", description: "Audit trails", severity: ["high", "medium"] },
    { id: "§164.312(b)", name: "Integrity Controls", description: "Data integrity protection", severity: ["high", "medium"] },
    { id: "§164.312(c)(1)", name: "Person/Entity Authentication", description: "Authentication mechanisms", severity: ["critical", "high"] },
    { id: "§164.312(d)", name: "Transmission Security", description: "Encryption in transit", severity: ["critical", "high"] },
    { id: "§164.312(e)(1)", name: "Device and Media Controls", description: "Disposal and re-use", severity: ["medium"] },
  ],
  gdpr: [
    { id: "Art 5", name: "Data Protection Principles", description: "Lawful processing principles", severity: ["high", "medium"] },
    { id: "Art 6", name: "Lawfulness of Processing", description: "Legal basis for processing", severity: ["medium"] },
    { id: "Art 15", name: "Right of Access", description: "Data subject access rights", severity: ["medium"] },
    { id: "Art 16", name: "Right to Rectification", description: "Data accuracy", severity: ["low"] },
    { id: "Art 17", name: "Right to Erasure", description: "Right to be forgotten", severity: ["medium"] },
    { id: "Art 25", name: "Data Protection by Design", description: "Privacy by design", severity: ["high", "medium"] },
    { id: "Art 32", name: "Security of Processing", description: "Technical and organizational measures", severity: ["critical", "high", "medium"] },
    { id: "Art 33", name: "Breach Notification", description: "72-hour notification requirement", severity: ["high"] },
    { id: "Art 35", name: "DPIA", description: "Data protection impact assessment", severity: ["medium"] },
  ],
  nist_csf: [
    { id: "ID.AM", name: "Asset Management", description: "Identify and manage assets", severity: ["medium", "low"] },
    { id: "ID.BE", name: "Business Environment", description: "Mission and stakeholder identification", severity: ["low"] },
    { id: "ID.GV", name: "Governance", description: "Security policy and oversight", severity: ["medium"] },
    { id: "ID.RA", name: "Risk Assessment", description: "Risk identification and analysis", severity: ["high", "medium"] },
    { id: "ID.RM", name: "Risk Management Strategy", description: "Risk tolerance and prioritization", severity: ["medium"] },
    { id: "PR.AC", name: "Access Control", description: "Identity and access management", severity: ["critical", "high"] },
    { id: "PR.AT", name: "Awareness & Training", description: "Security awareness programs", severity: ["low"] },
    { id: "PR.DS", name: "Data Security", description: "Data at rest and in transit", severity: ["critical", "high"] },
    { id: "PR.IP", name: "Info Protection Processes", description: "Security policies and procedures", severity: ["high", "medium"] },
    { id: "PR.MA", name: "Maintenance", description: "System maintenance and patching", severity: ["medium"] },
    { id: "PR.PT", name: "Protective Technology", description: "Security technology deployment", severity: ["high", "medium"] },
    { id: "DE.AE", name: "Anomalies & Events", description: "Security event detection", severity: ["high", "medium"] },
    { id: "DE.CM", name: "Continuous Monitoring", description: "Security monitoring", severity: ["high", "medium"] },
    { id: "DE.DP", name: "Detection Processes", description: "Detection effectiveness", severity: ["medium"] },
    { id: "RS.CO", name: "Communications", description: "Incident communication", severity: ["high", "medium"] },
    { id: "RS.MI", name: "Mitigation", description: "Incident containment", severity: ["critical", "high"] },
    { id: "RS.IM", name: "Improvements", description: "Lessons learned", severity: ["medium"] },
    { id: "RC.RP", name: "Recovery Planning", description: "Recovery procedures", severity: ["medium"] },
    { id: "RC.IM", name: "Improvements", description: "Recovery improvements", severity: ["low"] },
  ],
  nist_800_53: [
    { id: "AC-1", name: "Access Control Policy", description: "Access control policies and procedures", severity: ["medium"] },
    { id: "AC-2", name: "Account Management", description: "User account lifecycle", severity: ["high", "medium"] },
    { id: "AC-3", name: "Access Enforcement", description: "Enforce approved authorizations", severity: ["critical", "high"] },
    { id: "AC-4", name: "Information Flow Enforcement", description: "Data flow controls", severity: ["high"] },
    { id: "AC-5", name: "Separation of Duties", description: "Duty separation", severity: ["medium"] },
    { id: "AC-6", name: "Least Privilege", description: "Minimum necessary access", severity: ["high", "medium"] },
    { id: "AT-1", name: "Security Awareness Training", description: "Security training policy", severity: ["low"] },
    { id: "AU-1", name: "Audit and Accountability", description: "Audit logging policy", severity: ["medium"] },
    { id: "AU-2", name: "Audit Events", description: "Event logging requirements", severity: ["medium"] },
    { id: "AU-3", name: "Content of Audit Records", description: "Audit record content", severity: ["medium"] },
    { id: "CA-1", name: "Security Assessments", description: "Assessment and authorization", severity: ["medium"] },
    { id: "CA-2", name: "Security Assessments", description: "Control assessments", severity: ["high", "medium"] },
    { id: "CM-2", name: "Baseline Configuration", description: "Configuration management", severity: ["high", "medium"] },
    { id: "CM-3", name: "Configuration Change Control", description: "Change management", severity: ["medium"] },
    { id: "CM-8", name: "System Component Inventory", description: "Asset inventory", severity: ["medium", "low"] },
    { id: "CP-1", name: "Contingency Planning", description: "Contingency plan policy", severity: ["medium"] },
    { id: "IA-1", name: "Identification and Authentication", description: "I&A policy and procedures", severity: ["high"] },
    { id: "IA-2", name: "Identification and Authentication", description: "User identification", severity: ["critical", "high"] },
    { id: "IA-5", name: "Authenticator Management", description: "Password and credential management", severity: ["critical", "high"] },
    { id: "IR-1", name: "Incident Response", description: "Incident response policy", severity: ["high"] },
    { id: "IR-4", name: "Incident Handling", description: "Incident handling procedures", severity: ["high"] },
    { id: "RA-3", name: "Risk Assessment", description: "Risk assessment methodology", severity: ["high"] },
    { id: "RA-5", name: "Vulnerability Scanning", description: "Vulnerability scanning program", severity: ["high", "medium"] },
    { id: "SA-1", name: "System and Services Acquisition", description: "System acquisition policy", severity: ["medium"] },
    { id: "SA-3", name: "System Development Lifecycle", description: "Secure SDLC", severity: ["high", "medium"] },
    { id: "SC-1", name: "System and Communications Protection", description: "Protection policy", severity: ["medium"] },
    { id: "SC-7", name: "Boundary Protection", description: "Network segmentation", severity: ["high", "medium"] },
    { id: "SC-8", name: "Transmission Confidentiality", description: "Encryption in transit", severity: ["critical", "high"] },
    { id: "SC-12", name: "Cryptographic Key Management", description: "Key management", severity: ["critical", "high"] },
    { id: "SC-28", name: "Protection of Information at Rest", description: "Data at rest encryption", severity: ["critical", "high"] },
    { id: "SI-2", name: "Flaw Remediation", description: "Vulnerability remediation", severity: ["critical", "high", "medium"] },
    { id: "SI-3", name: "Malicious Code Protection", description: "Anti-malware defenses", severity: ["high", "medium"] },
    { id: "SI-4", name: "System Monitoring", description: "Continuous monitoring", severity: ["high", "medium"] },
    { id: "SI-7", name: "Software Integrity", description: "Integrity verification", severity: ["high", "medium"] },
    { id: "SI-10", name: "Information Input Validation", description: "Input validation", severity: ["critical", "high"] },
  ],
  cis_benchmarks: [
    { id: "CIS 1", name: "Inventory and Control of Assets", description: "Asset inventory management", severity: ["medium", "low"] },
    { id: "CIS 2", name: "Inventory and Control of Software", description: "Software inventory", severity: ["medium", "low"] },
    { id: "CIS 3", name: "Data Protection", description: "Data security controls", severity: ["critical", "high"] },
    { id: "CIS 4", name: "Secure Configuration", description: "Configuration hardening", severity: ["high", "medium"] },
    { id: "CIS 5", name: "Account Management", description: "User and group management", severity: ["high", "medium"] },
    { id: "CIS 6", name: "Access Control Management", description: "Access control", severity: ["high", "medium"] },
    { id: "CIS 7", name: "Continuous Vulnerability Mgmt", description: "Scanning and remediation", severity: ["critical", "high", "medium"] },
    { id: "CIS 8", name: "Audit Log Management", description: "Logging and monitoring", severity: ["medium"] },
    { id: "CIS 9", name: "Email and Web Browser Protections", description: "Email and web security", severity: ["high", "medium"] },
    { id: "CIS 10", name: "Malware Defenses", description: "Anti-malware controls", severity: ["high", "medium"] },
    { id: "CIS 11", name: "Data Recovery", description: "Backup and recovery", severity: ["medium"] },
    { id: "CIS 12", name: "Network Infrastructure Mgmt", description: "Network device security", severity: ["high", "medium"] },
    { id: "CIS 13", name: "Network Monitoring and Defense", description: "Network security monitoring", severity: ["high", "medium"] },
    { id: "CIS 14", name: "Security Awareness Training", description: "Staff training", severity: ["low"] },
    { id: "CIS 15", name: "Service Provider Management", description: "Vendor security", severity: ["medium"] },
    { id: "CIS 16", name: "Application Software Security", description: "Secure application development", severity: ["critical", "high"] },
    { id: "CIS 17", name: "Incident Response Management", description: "Incident response program", severity: ["high", "medium"] },
    { id: "CIS 18", name: "Penetration Testing", description: "Regular penetration testing", severity: ["high", "medium"] },
  ],
  mitre_attack: [
    { id: "TA0001", name: "Initial Access", description: "Gaining initial foothold", severity: ["critical", "high"] },
    { id: "TA0002", name: "Execution", description: "Running malicious code", severity: ["high"] },
    { id: "TA0003", name: "Persistence", description: "Maintaining access", severity: ["high", "medium"] },
    { id: "TA0004", name: "Privilege Escalation", description: "Gaining higher privileges", severity: ["critical", "high"] },
    { id: "TA0005", name: "Defense Evasion", description: "Bypassing security controls", severity: ["high", "medium"] },
    { id: "TA0006", name: "Credential Access", description: "Stealing credentials", severity: ["critical", "high"] },
    { id: "TA0007", name: "Discovery", description: "Environment reconnaissance", severity: ["medium"] },
    { id: "TA0008", name: "Lateral Movement", description: "Moving through the network", severity: ["high"] },
    { id: "TA0009", name: "Collection", description: "Gathering target data", severity: ["high", "medium"] },
    { id: "TA0010", name: "Exfiltration", description: "Stealing data", severity: ["critical", "high"] },
    { id: "TA0011", name: "Command and Control", description: "C2 communications", severity: ["high"] },
    { id: "TA0040", name: "Impact", description: "Disrupting systems", severity: ["critical", "high"] },
  ],
  mitre_d3fend: [
    { id: "D3-IA", name: "Identity & Access Management", description: "Authentication hardening", severity: ["critical", "high"] },
    { id: "D3-NV", name: "Network Vigilance", description: "Network traffic monitoring", severity: ["high", "medium"] },
    { id: "D3-PL", name: "Platform Protection", description: "OS and platform hardening", severity: ["high", "medium"] },
    { id: "D3-AM", name: "Application Hardening", description: "Application security controls", severity: ["critical", "high"] },
    { id: "D3-DA", name: "Data Security", description: "Data protection measures", severity: ["critical", "high"] },
    { id: "D3-FW", name: "Firewall", description: "Network segmentation", severity: ["high", "medium"] },
    { id: "D3-HD", name: "Honeypot", description: "Deception technology", severity: ["medium", "low"] },
    { id: "D3-LG", name: "Log Analysis", description: "Log review and analysis", severity: ["medium"] },
    { id: "D3-MF", name: "Message Filtering", description: "Content filtering", severity: ["medium"] },
    { id: "D3-BR", name: "Boundary Routing", description: "Network perimeter controls", severity: ["high", "medium"] },
    { id: "D3-SD", name: "Software Diversity", description: "Heterogeneous deployment", severity: ["low"] },
    { id: "D3-MD", name: "Memory Defense", description: "Memory corruption protection", severity: ["high", "medium"] },
    { id: "D3-PM", name: "Privilege Management", description: "Least privilege enforcement", severity: ["high", "medium"] },
    { id: "D3-PD", name: "Process Detection", description: "Process anomaly detection", severity: ["high", "medium"] },
    { id: "D3-FC", name: "File Check", description: "File integrity monitoring", severity: ["medium"] },
  ],
  disa_stig: [
    { id: "SRG-APP-000001", name: "Application Security", description: "Application baseline requirements", severity: ["critical", "high"] },
    { id: "SRG-OS-000001", name: "OS Security", description: "OS baseline hardening", severity: ["high", "medium"] },
    { id: "SRG-NET-000001", name: "Network Security", description: "Network device hardening", severity: ["high", "medium"] },
    { id: "SRG-DB-000001", name: "Database Security", description: "Database hardening", severity: ["high", "medium"] },
    { id: "SRG-APP-000002", name: "Access Control", description: "Application access controls", severity: ["critical", "high"] },
    { id: "SRG-OS-000002", name: "Account Management", description: "Account and group management", severity: ["high", "medium"] },
    { id: "SRG-NET-000002", name: "Network Access Control", description: "Network access restrictions", severity: ["high", "medium"] },
    { id: "SRG-APP-000003", name: "Audit and Accountability", description: "Application auditing", severity: ["medium"] },
    { id: "SRG-OS-000003", name: "Audit Policy", description: "OS audit configuration", severity: ["medium"] },
    { id: "SRG-APP-000004", name: "Identification & Auth", description: "Application authentication", severity: ["critical", "high"] },
    { id: "SRG-OS-000004", name: "Authentication", description: "OS authentication mechanisms", severity: ["critical", "high"] },
    { id: "SRG-APP-000005", name: "System Communications", description: "Encrypted communications", severity: ["critical", "high"] },
    { id: "SRG-OS-000005", name: "Cryptography", description: "OS cryptographic controls", severity: ["high", "medium"] },
    { id: "SRG-APP-000006", name: "System Integrity", description: "Application integrity controls", severity: ["high", "medium"] },
    { id: "SRG-OS-000006", name: "System Integrity", description: "OS integrity monitoring", severity: ["high", "medium"] },
  ],
  fedramp: [
    { id: "FR-AC-1", name: "Access Control", description: "Access control for FedRAMP systems", severity: ["critical", "high"] },
    { id: "FR-AT-1", name: "Awareness & Training", description: "FedRAMP-specific training", severity: ["low"] },
    { id: "FR-AU-1", name: "Audit & Accountability", description: "FedRAMP audit requirements", severity: ["medium"] },
    { id: "FR-CA-1", name: "Security Assessment", description: "FedRAMP assessment and authorization", severity: ["high", "medium"] },
    { id: "FR-CM-1", name: "Configuration Management", description: "FedRAMP baseline configurations", severity: ["high", "medium"] },
    { id: "FR-CP-1", name: "Contingency Planning", description: "FedRAMP continuity of operations", severity: ["medium"] },
    { id: "FR-IA-1", name: "Identification & Auth", description: "FedRAMP identity requirements", severity: ["critical", "high"] },
    { id: "FR-IR-1", name: "Incident Response", description: "FedRAMP incident handling", severity: ["high", "medium"] },
    { id: "FR-RA-1", name: "Risk Assessment", description: "FedRAMP risk management", severity: ["high", "medium"] },
    { id: "FR-SC-1", name: "System & Communications Protection", description: "FedRAMP boundary protection", severity: ["high", "medium"] },
    { id: "FR-SI-1", name: "System & Information Integrity", description: "FedRAMP flaw remediation", severity: ["critical", "high", "medium"] },
    { id: "FR-SA-1", name: "System & Services Acquisition", description: "FedRAMP supply chain", severity: ["medium"] },
  ],
  cyber_essentials: [
    { id: "CE-1", name: "Firewalls", description: "Internet gateway firewall", severity: ["high", "medium"] },
    { id: "CE-2", name: "Secure Configuration", description: "System hardening", severity: ["high", "medium"] },
    { id: "CE-3", name: "User Access Control", description: "User account management", severity: ["high", "medium"] },
    { id: "CE-4", name: "Malware Protection", description: "Anti-malware and patching", severity: ["high", "medium"] },
    { id: "CE-5", name: "Patch Management", description: "Security update management", severity: ["critical", "high", "medium"] },
  ],
  custom: [
    { id: "CUSTOM-1", name: "Security Policy Compliance", description: "Custom security policy", severity: ["critical", "high", "medium", "low"] },
    { id: "CUSTOM-2", name: "Technical Security Controls", description: "Custom technical requirements", severity: ["critical", "high", "medium"] },
    { id: "CUSTOM-3", name: "Operational Security", description: "Custom operational controls", severity: ["high", "medium", "low"] },
  ],
};

// ── Generate Compliance Mappings ───────────────────────────────────────────

export function generateComplianceMappings(
  data: ReportData,
  frameworks: ComplianceFramework[],
): ComplianceMapping[] {
  const mappings: ComplianceMapping[] = [];

  for (const framework of frameworks) {
    const controls = FRAMEWORK_CONTROLS[framework];
    if (!controls) continue;

    const findingsWithControls = data.findings.flatMap(f => {
      return controls
        .filter(c => c.severity.includes(f.severity))
        .slice(0, 3) // Limit to 3 most relevant controls per finding
        .map(c => ({
          vulnerabilityId: f.id,
          title: f.title,
          control: `${c.id} — ${c.name}`,
          controlDescription: c.description,
          status: f.status === "confirmed" ? "non_compliant" as const
            : f.status === "false_positive" ? "compliant" as const
            : f.status === "inconclusive" ? "requires_review" as const
            : "not_applicable" as const,
        }));
    });

    const total = findingsWithControls.length;
    const failed = findingsWithControls.filter(f => f.status === "non_compliant").length;
    const passed = findingsWithControls.filter(f => f.status === "compliant").length;
    const notApplicable = findingsWithControls.filter(f => f.status === "not_applicable").length;
    const requiresReview = findingsWithControls.filter(f => f.status === "requires_review").length;

    mappings.push({
      framework,
      frameworkDisplayName: FRAMEWORK_DISPLAY_NAMES[framework],
      findings: findingsWithControls,
      totalControls: total,
      passedControls: passed,
      failedControls: failed,
      notApplicableControls: notApplicable,
      requiresReviewControls: requiresReview,
      coverage: total > 0 ? Math.round((passed / total) * 100) : 100,
      score: total > 0 ? Math.round(((passed + notApplicable) / total) * 100) : 100,
    });
  }

  return mappings;
}
