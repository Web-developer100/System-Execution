// ---------------------------------------------------------------------------
// SPDX Report Generator ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
// Generates SPDX 2.3 format output for Software Bill of Materials.
// Compliant with ISO/IEC 5962:2021 (SPDX 2.3) specification.

import type { ReportData } from "../../report-generator";

// ── SPDX Generator ────────────────────────────────────────────────────────

export function generateSpdxReport(data: ReportData): string {
  const now = new Date().toISOString();
  const spdxId = `SPDXRef-V8SCAN-${data.scanId}`;

  const spdx: Record<string, unknown> = {
    spdxVersion: "SPDX-2.3",
    dataLicense: "CC0-1.0",
    SPDXID: spdxId,
    name: `V8 Security Scan #${data.scanId} — ${data.target}`,
    documentNamespace: `https://v8platform.io/spdx/scan-${data.scanId}-${Date.now()}`,
    creationInfo: {
      created: now,
      creators: [
        "Tool: V8 Neural Exploitation Platform",
        "Organization: V8 Platform",
      ],
      licenseListVersion: "3.21",
    },
    packages: [
      {
        SPDXID: "SPDXRef-V8Platform",
        name: "V8 Neural Exploitation Platform",
        versionInfo: "2.1.0",
        supplier: "Organization: V8 Platform",
        downloadLocation: "https://v8platform.io",
        filesAnalyzed: false,
        checksums: [],
        licenseConcluded: "NOASSERTION",
        licenseDeclared: "NOASSERTION",
        copyrightText: "NOASSERTION",
      },
      ...data.toolsUsed.map((tool, i) => ({
        SPDXID: `SPDXRef-Tool-${i}`,
        name: tool,
        versionInfo: "1.0",
        supplier: "NOASSERTION",
        downloadLocation: "NOASSERTION",
        filesAnalyzed: false,
        checksums: [],
        licenseConcluded: "NOASSERTION",
        licenseDeclared: "NOASSERTION",
        copyrightText: "NOASSERTION",
      })),
    ],
    relationships: data.findings.map((f, i) => ({
      spdxElementId: spdxId,
      relatedSpdxElement: `SPDXRef-Vulnerability-${i}`,
      relationshipType: "HAS_PREREQUISITE",
    })),
    annotations: data.findings.map((f, i) => ({
      annotationDate: now,
      annotationType: "OTHER",
      annotator: "Tool: V8 Neural Exploitation Platform",
      comment: `${f.severity.toUpperCase()}: ${f.title} — ${f.url}`,
    })),
    externalDocumentRefs: [],
  };

  return JSON.stringify(spdx, null, 2);
}
