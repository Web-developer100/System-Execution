// ---------------------------------------------------------------------------
// Digital Signature Service ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
// Provides digital signatures, hash verification, report integrity,
// tamper detection, and version tracking for the reporting engine.

import crypto from "node:crypto";
import { logger } from "../../lib/logger";
import type { DigitalSignature } from "./types";

// ── Digital Signature Service ──────────────────────────────────────────────

export class DigitalSignatureService {
  private algorithm = "sha256";
  private signingKey: string | null = null;
  private signingKeyId: string | null = null;

  constructor() {
    // Load signing key from environment or generate a temporary one
    this.signingKey = process.env["REPORT_SIGNING_KEY"] ?? null;
    this.signingKeyId = process.env["REPORT_SIGNING_KEY_ID"] ?? "v8-platform-default";

    if (!this.signingKey) {
      logger.warn("[DIGITAL-SIGNATURE] No REPORT_SIGNING_KEY set. Signatures will use a generated key that changes on restart.");
      this.signingKey = crypto.randomBytes(64).toString("hex");
    }
  }

  // ── Sign Report ─────────────────────────────────────────────────────────

  signReport(reportContent: string, signedBy = "v8-platform-engine"): DigitalSignature {
    const reportHash = crypto
      .createHash(this.algorithm)
      .update(reportContent)
      .digest("hex");

    const signature = crypto
      .createHmac("sha512", this.signingKey!)
      .update(reportHash)
      .digest("hex");

    return {
      algorithm: "HMAC-SHA512",
      signature,
      signedBy,
      signedAt: new Date().toISOString(),
      certificateThumbprint: this.signingKeyId,
      hashAlgorithm: `SHA-256`,
      reportHash,
      verified: true,
    };
  }

  // ── Verify Report ───────────────────────────────────────────────────────

  verifyReport(reportContent: string, signature: DigitalSignature): boolean {
    const reportHash = crypto
      .createHash(this.algorithm)
      .update(reportContent)
      .digest("hex");

    const expectedSignature = crypto
      .createHmac("sha512", this.signingKey!)
      .update(reportHash)
      .digest("hex");

    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature.signature),
      Buffer.from(expectedSignature),
    );

    if (!isValid) {
      logger.warn({ reportHash }, "[DIGITAL-SIGNATURE] Report verification FAILED — possible tampering detected");
    }

    return isValid;
  }

  // ── Generate Report Checksum ────────────────────────────────────────────

  generateChecksum(content: string | Buffer): string {
    return crypto
      .createHash("sha256")
      .update(content)
      .digest("hex");
  }

  // ── Tamper Detection ────────────────────────────────────────────────────

  detectTampering(
    originalContent: string,
    currentContent: string,
    originalSignature: DigitalSignature,
  ): { tampered: boolean; details: string[] } {
    const details: string[] = [];

    // Check content hash
    const originalHash = originalSignature.reportHash;
    const currentHash = crypto
      .createHash(this.algorithm)
      .update(currentContent)
      .digest("hex");

    if (originalHash !== currentHash) {
      details.push("Content hash mismatch — report content has been modified");
    }

    // Check signature
    const signatureValid = this.verifyReport(currentContent, {
      ...originalSignature,
      reportHash: currentHash,
    });

    if (!signatureValid) {
      details.push("Digital signature verification failed");
    }

    return {
      tampered: details.length > 0,
      details,
    };
  }

  // ── Generate Version Hash ───────────────────────────────────────────────

  generateVersionHash(data: Record<string, unknown>): string {
    const stable = JSON.stringify(data, Object.keys(data).sort());
    return crypto.createHash("sha256").update(stable).digest("hex").slice(0, 12);
  }

  // ── Set Signing Key ─────────────────────────────────────────────────────

  setSigningKey(key: string, keyId?: string): void {
    this.signingKey = key;
    if (keyId) this.signingKeyId = keyId;
    logger.info("[DIGITAL-SIGNATURE] Signing key updated");
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────
export const digitalSignatureService = new DigitalSignatureService();
