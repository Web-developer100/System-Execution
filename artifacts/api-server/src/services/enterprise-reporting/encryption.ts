// ---------------------------------------------------------------------------
// Encryption / Password Protection Service ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
// Provides report encryption, password protection, and access control
// for sensitive security reports using AES-256-GCM.

import crypto from "node:crypto";
import { logger } from "../../lib/logger";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

// ── Encryption Service ─────────────────────────────────────────────────────

export class ReportEncryptionService {
  // ── Encrypt with Password ───────────────────────────────────────────────

  encrypt(content: string | Buffer, password: string): Buffer {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const key = this.deriveKey(password, salt);
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    const input = typeof content === "string" ? Buffer.from(content, "utf-8") : content;
    const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);
    const tag = cipher.getAuthTag();

    // Format: salt || iv || tag || encrypted
    return Buffer.concat([salt, iv, tag, encrypted]);
  }

  // ── Decrypt with Password ───────────────────────────────────────────────

  decrypt(encryptedData: Buffer, password: string): Buffer {
    const salt = encryptedData.subarray(0, SALT_LENGTH);
    const iv = encryptedData.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const tag = encryptedData.subarray(
      SALT_LENGTH + IV_LENGTH,
      SALT_LENGTH + IV_LENGTH + TAG_LENGTH,
    );
    const data = encryptedData.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

    const key = this.deriveKey(password, salt);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    try {
      return Buffer.concat([decipher.update(data), decipher.final()]);
    } catch (err) {
      throw new Error("Decryption failed — incorrect password or corrupted data");
    }
  }

  // ── Encrypt File with Metadata ──────────────────────────────────────────

  encryptWithMetadata(
    content: string | Buffer,
    password: string,
    metadata?: Record<string, string>,
  ): Buffer {
    const metaStr = metadata
      ? JSON.stringify(metadata)
      : "{}";
    const version = Buffer.alloc(1);
    version.writeUInt8(1); // Format version 1
    const metaBuf = Buffer.from(metaStr, "utf-8");
    const metaLen = Buffer.alloc(4);
    metaLen.writeUInt32BE(metaBuf.length);

    const encrypted = this.encrypt(content, password);

    return Buffer.concat([version, metaLen, metaBuf, encrypted]);
  }

  // ── Decrypt File with Metadata ──────────────────────────────────────────

  decryptWithMetadata(
    encryptedData: Buffer,
    password: string,
  ): { content: Buffer; metadata: Record<string, string> } {
    const version = encryptedData.readUInt8(0);
    if (version !== 1) {
      throw new Error(`Unsupported encryption format version: ${version}`);
    }

    const metaLen = encryptedData.readUInt32BE(1);
    const metaStr = encryptedData.subarray(5, 5 + metaLen).toString("utf-8");
    const metadata = JSON.parse(metaStr) as Record<string, string>;
    const encrypted = encryptedData.subarray(5 + metaLen);

    const content = this.decrypt(encrypted, password);
    return { content, metadata };
  }

  // ── Generate Secure Password ────────────────────────────────────────────

  generatePassword(length = 32): string {
    return crypto
      .randomBytes(length)
      .toString("base64url")
      .slice(0, length);
  }

  // ── Key Derivation ──────────────────────────────────────────────────────

  private deriveKey(password: string, salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(
      password,
      salt,
      ITERATIONS,
      KEY_LENGTH,
      "sha512",
    );
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────
export const reportEncryption = new ReportEncryptionService();
