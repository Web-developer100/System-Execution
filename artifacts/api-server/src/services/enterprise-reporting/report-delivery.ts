// ---------------------------------------------------------------------------
// Report Delivery Methods ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
// Delivers generated reports to all configured channels:
// Email, Slack, Discord, Microsoft Teams, Webhook, SFTP, AWS S3,
// Azure Blob Storage, Google Cloud Storage, FTP, Shared Folder, REST API

import crypto from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { logger } from "../../lib/logger";
import type { DeliveryMethod } from "./types";

// ── Types ──────────────────────────────────────────────────────────────────

export type DeliveryType = DeliveryMethod;

export interface DeliveryConfig {
  type: DeliveryType;
  enabled: boolean;
  config: Record<string, string>;
}

export interface DeliveryPayload {
  reportId: string;
  scanId: number;
  target: string;
  category: string;
  formats: string[];
  downloadUrls: string[];
  summary: string;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  totalFindings: number;
  riskScore: number;
  securityScore: number;
  generatedAt: string;
  classification: string;
}

export interface DeliveryResult {
  success: boolean;
  channel: string;
  message: string;
  error?: string;
}

// ── Report Delivery Service ────────────────────────────────────────────────

export class ReportDelivery {
  private configs: DeliveryConfig[] = [];

  constructor() {
    this.loadConfigs();
  }

  private loadConfigs(): void {
    this.configs = [];

    // Email
    if (process.env["SMTP_HOST"] && process.env["SMTP_USER"]) {
      this.configs.push({
        type: "email",
        enabled: process.env["REPORT_EMAIL_ENABLED"] !== "false",
        config: {
          host: process.env["SMTP_HOST"]!,
          port: process.env["SMTP_PORT"] ?? "587",
          user: process.env["SMTP_USER"]!,
          pass: process.env["SMTP_PASS"] ?? "",
          from: process.env["SMTP_FROM"] ?? "reports@v8platform.io",
          to: process.env["REPORT_EMAIL_TO"] ?? "",
        },
      });
    }

    // Slack
    if (process.env["SLACK_WEBHOOK_URL"]) {
      this.configs.push({
        type: "slack",
        enabled: process.env["REPORT_SLACK_ENABLED"] !== "false",
        config: {
          webhookUrl: process.env["SLACK_WEBHOOK_URL"]!,
          channel: process.env["SLACK_REPORT_CHANNEL"] ?? "#security-reports",
        },
      });
    }

    // Discord
    if (process.env["DISCORD_WEBHOOK_URL"]) {
      this.configs.push({
        type: "discord",
        enabled: process.env["REPORT_DISCORD_ENABLED"] !== "false",
        config: {
          webhookUrl: process.env["DISCORD_WEBHOOK_URL"]!,
        },
      });
    }

    // Microsoft Teams
    if (process.env["TEAMS_WEBHOOK_URL"]) {
      this.configs.push({
        type: "microsoft_teams",
        enabled: process.env["REPORT_TEAMS_ENABLED"] !== "false",
        config: {
          webhookUrl: process.env["TEAMS_WEBHOOK_URL"]!,
          channel: process.env["TEAMS_REPORT_CHANNEL"] ?? "Security",
          summary: process.env["TEAMS_REPORT_SUMMARY"] ?? "V8 Security Report",
        },
      });
    }

    // Generic Webhook
    if (process.env["REPORT_WEBHOOK_URL"]) {
      this.configs.push({
        type: "webhook",
        enabled: process.env["REPORT_WEBHOOK_ENABLED"] !== "false",
        config: {
          url: process.env["REPORT_WEBHOOK_URL"]!,
          secret: process.env["REPORT_WEBHOOK_SECRET"] ?? "",
        },
      });
    }

    // AWS S3
    if (process.env["AWS_S3_BUCKET"] && process.env["AWS_ACCESS_KEY_ID"]) {
      this.configs.push({
        type: "s3",
        enabled: process.env["REPORT_S3_ENABLED"] !== "false",
        config: {
          bucket: process.env["AWS_S3_BUCKET"]!,
          region: process.env["AWS_S3_REGION"] ?? "us-east-1",
          accessKeyId: process.env["AWS_ACCESS_KEY_ID"]!,
          secretAccessKey: process.env["AWS_SECRET_ACCESS_KEY"] ?? "",
          prefix: process.env["REPORT_S3_PREFIX"] ?? "reports/",
        },
      });
    }

    // Azure Blob Storage
    if (process.env["AZURE_STORAGE_CONNECTION_STRING"]) {
      this.configs.push({
        type: "azure_blob",
        enabled: process.env["REPORT_AZURE_ENABLED"] !== "false",
        config: {
          connectionString: process.env["AZURE_STORAGE_CONNECTION_STRING"]!,
          containerName: process.env["AZURE_REPORT_CONTAINER"] ?? "security-reports",
          prefix: process.env["AZURE_REPORT_PREFIX"] ?? "reports/",
        },
      });
    }

    // Google Cloud Storage
    if (process.env["GCS_BUCKET"]) {
      this.configs.push({
        type: "gcs",
        enabled: process.env["REPORT_GCS_ENABLED"] !== "false",
        config: {
          bucket: process.env["GCS_BUCKET"]!,
          projectId: process.env["GCS_PROJECT_ID"] ?? "",
          prefix: process.env["GCS_REPORT_PREFIX"] ?? "reports/",
          credentials: process.env["GCS_CREDENTIALS"] ?? "",
        },
      });
    }

    // SFTP
    if (process.env["SFTP_HOST"] && process.env["SFTP_USER"]) {
      this.configs.push({
        type: "sftp",
        enabled: process.env["REPORT_SFTP_ENABLED"] !== "false",
        config: {
          host: process.env["SFTP_HOST"]!,
          port: process.env["SFTP_PORT"] ?? "22",
          user: process.env["SFTP_USER"]!,
          pass: process.env["SFTP_PASS"] ?? "",
          path: process.env["SFTP_REPORT_PATH"] ?? "/reports/",
        },
      });
    }

    // FTP
    if (process.env["FTP_HOST"] && process.env["FTP_USER"]) {
      this.configs.push({
        type: "ftp",
        enabled: process.env["REPORT_FTP_ENABLED"] !== "false",
        config: {
          host: process.env["FTP_HOST"]!,
          port: process.env["FTP_PORT"] ?? "21",
          user: process.env["FTP_USER"]!,
          pass: process.env["FTP_PASS"] ?? "",
          path: process.env["FTP_REPORT_PATH"] ?? "/reports/",
        },
      });
    }

    // Shared Folder
    if (process.env["REPORT_SHARED_FOLDER_PATH"]) {
      this.configs.push({
        type: "shared_folder",
        enabled: process.env["REPORT_SHARED_ENABLED"] !== "false",
        config: {
          path: process.env["REPORT_SHARED_FOLDER_PATH"]!,
        },
      });
    }

    // REST API
    if (process.env["REPORT_API_URL"]) {
      this.configs.push({
        type: "rest_api",
        enabled: process.env["REPORT_API_ENABLED"] !== "false",
        config: {
          url: process.env["REPORT_API_URL"]!,
          apiKey: process.env["REPORT_API_KEY"] ?? "",
          method: process.env["REPORT_API_METHOD"] ?? "POST",
        },
      });
    }

    logger.info({ configCount: this.configs.filter(c => c.enabled).length }, "[REPORT-DELIVERY] Delivery configs loaded");
  }

  // ── Deliver ──────────────────────────────────────────────────────────────

  async deliver(payload: DeliveryPayload): Promise<DeliveryResult[]> {
    const results: DeliveryResult[] = [];

    for (const cfg of this.configs) {
      if (!cfg.enabled) continue;
      try {
        const result = await this.deliverToChannel(cfg, payload);
        results.push(result);
      } catch (err) {
        logger.error({ err, channel: cfg.type }, "[REPORT-DELIVERY] Delivery failed");
        results.push({
          success: false,
          channel: cfg.type,
          message: `Delivery failed: ${(err as Error).message}`,
          error: (err as Error).message,
        });
      }
    }
    return results;
  }

  private async deliverToChannel(cfg: DeliveryConfig, payload: DeliveryPayload): Promise<DeliveryResult> {
    switch (cfg.type) {
      case "email": return this.deliverEmail(cfg.config, payload);
      case "slack": return this.deliverSlack(cfg.config, payload);
      case "discord": return this.deliverDiscord(cfg.config, payload);
      case "microsoft_teams": return this.deliverTeams(cfg.config, payload);
      case "webhook": return this.deliverWebhook(cfg.config, payload);
      case "s3": return this.deliverS3(cfg.config, payload);
      case "azure_blob": return this.deliverAzureBlob(cfg.config, payload);
      case "gcs": return this.deliverGcs(cfg.config, payload);
      case "sftp": return this.deliverSftp(cfg.config, payload);
      case "ftp": return this.deliverFtp(cfg.config, payload);
      case "shared_folder": return this.deliverSharedFolder(cfg.config, payload);
      case "rest_api": return this.deliverRestApi(cfg.config, payload);
      default: return { success: false, channel: cfg.type, message: "Unknown delivery type" };
    }
  }

  // ── Email (SMTP via nodemailer) ──────────────────────────────────────────

  private async deliverEmail(config: Record<string, string>, payload: DeliveryPayload): Promise<DeliveryResult> {
    try {
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.default.createTransport({
        host: config["host"],
        port: parseInt(config["port"] ?? "587"),
        secure: parseInt(config["port"] ?? "587") === 465,
        auth: { user: config["user"], pass: config["pass"] },
      });

      const severityColor = payload.criticalCount > 0 ? "#ef4444" : payload.highCount > 0 ? "#f97316" : "#22c55e";
      const html = buildEmailHtml(payload, severityColor);
      const to = config["to"] || "security@v8platform.io";

      await transporter.sendMail({
        from: config["from"],
        to,
        subject: `[V8] ${payload.category.toUpperCase()} Report — ${payload.target} (${payload.totalFindings} findings)`,
        html,
      });
      return { success: true, channel: "email", message: `Report emailed to ${to}` };
    } catch (err) {
      return { success: false, channel: "email", message: "Email delivery failed", error: (err as Error).message };
    }
  }

  // ── Slack Webhook ────────────────────────────────────────────────────────

  private async deliverSlack(config: Record<string, string>, payload: DeliveryPayload): Promise<DeliveryResult> {
    const blocks = [
      { type: "header", text: { type: "plain_text", text: `🔒 ${payload.category.toUpperCase()} Report — ${payload.target}`, emoji: true } },
      { type: "section", fields: [
        { type: "mrkdwn", text: `*Scan #${payload.scanId}*\n${payload.totalFindings} findings` },
        { type: "mrkdwn", text: `*Risk Score:* ${payload.riskScore}/100\n*Critical:* ${payload.criticalCount} | *High:* ${payload.highCount}` },
      ]},
      { type: "section", text: { type: "mrkdwn", text: payload.summary.slice(0, 200) } },
    ];

    if (payload.downloadUrls.length > 0) {
      blocks.push({ type: "actions", elements: payload.downloadUrls.slice(0, 3).map((url, i) => ({
        type: "button", text: { type: "plain_text", text: `📄 ${payload.formats[i]?.toUpperCase() ?? "Report"}`, emoji: true }, url,
      })) } as any);
    }

    const response = await fetch(config["webhookUrl"]!, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: `Report: ${payload.target}`, blocks }) });
    if (!response.ok) throw new Error(`Slack responded ${response.status}`);
    return { success: true, channel: "slack", message: "Report sent to Slack" };
  }

  // ── Discord Webhook ──────────────────────────────────────────────────────

  private async deliverDiscord(config: Record<string, string>, payload: DeliveryPayload): Promise<DeliveryResult> {
    const embed: Record<string, unknown> = {
      title: `${payload.category.toUpperCase()} Report — ${payload.target}`,
      description: payload.summary.slice(0, 400),
      color: payload.criticalCount > 0 ? 0xef4444 : payload.highCount > 0 ? 0xf97316 : 0x22c55e,
      fields: [
        { name: "Scan", value: `#${payload.scanId}`, inline: true },
        { name: "Findings", value: String(payload.totalFindings), inline: true },
        { name: "Risk Score", value: `${payload.riskScore}/100`, inline: true },
        { name: "Critical", value: String(payload.criticalCount), inline: true },
        { name: "High", value: String(payload.highCount), inline: true },
        { name: "Formats", value: payload.formats.join(", ").toUpperCase(), inline: true },
      ],
      timestamp: new Date().toISOString(),
      footer: { text: "V8 Neural Exploitation Platform" },
    };
    if (payload.downloadUrls.length > 0) embed["url"] = payload.downloadUrls[0];

    const response = await fetch(config["webhookUrl"]!, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ embeds: [embed] }) });
    if (!response.ok) throw new Error(`Discord responded ${response.status}`);
    return { success: true, channel: "discord", message: "Report sent to Discord" };
  }

  // ── Microsoft Teams ──────────────────────────────────────────────────────

  private async deliverTeams(config: Record<string, string>, payload: DeliveryPayload): Promise<DeliveryResult> {
    const severityColor = payload.criticalCount > 0 ? "FF4444" : payload.highCount > 0 ? "F97316" : "22C55E";

    const adaptiveCard = {
      type: "message",
      attachments: [{
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            { type: "TextBlock", size: "Large", weight: "Bolder", text: `🔒 V8 Security Report — ${payload.target}`, color: payload.criticalCount > 0 ? "Attention" : "Accent" },
            { type: "FactSet", facts: [
              { title: "Scan ID:", value: `#${payload.scanId}` },
              { title: "Risk Score:", value: `${payload.riskScore}/100` },
              { title: "Total Findings:", value: String(payload.totalFindings) },
              { title: "Critical:", value: String(payload.criticalCount) },
              { title: "High:", value: String(payload.highCount) },
            ]},
            { type: "TextBlock", text: payload.summary.slice(0, 300), wrap: true },
          ],
          actions: payload.downloadUrls.slice(0, 3).map((url, i) => ({
            type: "Action.OpenUrl", title: `📄 View ${payload.formats[i]?.toUpperCase() ?? "Report"}`, url,
          })),
        },
      }],
    };

    const response = await fetch(config["webhookUrl"]!, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(adaptiveCard) });
    if (!response.ok) throw new Error(`Teams responded ${response.status}`);
    return { success: true, channel: "microsoft_teams", message: "Report sent to Microsoft Teams" };
  }

  // ── Generic Webhook ──────────────────────────────────────────────────────

  private async deliverWebhook(config: Record<string, string>, payload: DeliveryPayload): Promise<DeliveryResult> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (config["secret"]) {
      headers["X-Webhook-Secret"] = config["secret"];
      headers["X-Signature-256"] = crypto.createHmac("sha256", config["secret"]).update(JSON.stringify(payload)).digest("hex");
    }
    const response = await fetch(config["url"]!, { method: "POST", headers, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error(`Webhook responded ${response.status}`);
    return { success: true, channel: "webhook", message: "Report sent to webhook" };
  }

  // ── AWS S3 ───────────────────────────────────────────────────────────────

  private async deliverS3(config: Record<string, string>, payload: DeliveryPayload): Promise<DeliveryResult> {
    try {
      const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
      const client = new S3Client({
        region: config["region"],
        credentials: { accessKeyId: config["accessKeyId"], secretAccessKey: config["secretAccessKey"] },
      });
      const key = `${config["prefix"]}${payload.reportId}/manifest.json`;
      await client.send(new PutObjectCommand({
        Bucket: config["bucket"],
        Key: key,
        Body: JSON.stringify(payload, null, 2),
        ContentType: "application/json",
      }));
      return { success: true, channel: "s3", message: `Report uploaded to s3://${config["bucket"]}/${key}` };
    } catch (err: any) {
      return { success: false, channel: "s3", message: `S3 upload failed`, error: err.message };
    }
  }

  // ── Azure Blob Storage ───────────────────────────────────────────────────

  private async deliverAzureBlob(config: Record<string, string>, payload: DeliveryPayload): Promise<DeliveryResult> {
    try {
      const { BlobServiceClient } = await import("@azure/storage-blob");
      const blobServiceClient = BlobServiceClient.fromConnectionString(config["connectionString"]!);
      const containerClient = blobServiceClient.getContainerClient(config["containerName"]!);
      await containerClient.createIfNotExists();
      const blobName = `${config["prefix"]}${payload.reportId}/manifest.json`;
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.upload(JSON.stringify(payload, null, 2), Buffer.byteLength(JSON.stringify(payload)));
      return { success: true, channel: "azure_blob", message: `Report uploaded to Azure: ${blobName}` };
    } catch (err: any) {
      return { success: false, channel: "azure_blob", message: "Azure upload failed", error: err.message };
    }
  }

  // ── Google Cloud Storage ─────────────────────────────────────────────────

  private async deliverGcs(config: Record<string, string>, payload: DeliveryPayload): Promise<DeliveryResult> {
    try {
      const { Storage } = await import("@google-cloud/storage");
      const storageOpts: Record<string, unknown> = {};
      if (config["credentials"]) storageOpts["credentials"] = JSON.parse(config["credentials"]);
      const storage = new Storage(storageOpts);
      const bucket = storage.bucket(config["bucket"]!);
      const blobName = `${config["prefix"]}${payload.reportId}/manifest.json`;
      await bucket.file(blobName).save(JSON.stringify(payload, null, 2));
      return { success: true, channel: "gcs", message: `Report uploaded to GCS: ${blobName}` };
    } catch (err: any) {
      return { success: false, channel: "gcs", message: "GCS upload failed", error: err.message };
    }
  }

  // ── SFTP ─────────────────────────────────────────────────────────────────

  private async deliverSftp(config: Record<string, string>, payload: DeliveryPayload): Promise<DeliveryResult> {
    try {
      const SftpClient = (await import("ssh2-sftp-client")).default;
      const client = new SftpClient();
      await client.connect({ host: config["host"], port: parseInt(config["port"] ?? "22"), username: config["user"], password: config["pass"] });
      const remotePath = `${config["path"]}${payload.reportId}/`.replace(/\/\//g, "/");
      await client.mkdir(remotePath, true);
      await client.put(Buffer.from(JSON.stringify(payload, null, 2)), `${remotePath}manifest.json`);
      await client.end();
      return { success: true, channel: "sftp", message: `Report uploaded via SFTP to ${remotePath}` };
    } catch (err: any) {
      return { success: false, channel: "sftp", message: "SFTP upload failed", error: err.message };
    }
  }

  // ── FTP ───────────────────────────────────────────────────────────────────

  private async deliverFtp(config: Record<string, string>, payload: DeliveryPayload): Promise<DeliveryResult> {
    try {
      const ftp = await import("basic-ftp");
      const client = new ftp.Client();
      await client.access({ host: config["host"], port: parseInt(config["port"] ?? "21"), user: config["user"], password: config["pass"], secure: false });
      await client.ensureDir(config["path"]!);
      const content = JSON.stringify(payload, null, 2);
      await client.uploadFrom(content, `${payload.reportId}-manifest.json`);
      client.close();
      return { success: true, channel: "ftp", message: `Report uploaded via FTP to ${config["path"]}` };
    } catch (err: any) {
      return { success: false, channel: "ftp", message: "FTP upload failed", error: err.message };
    }
  }

  // ── Shared Folder ────────────────────────────────────────────────────────

  private async deliverSharedFolder(config: Record<string, string>, payload: DeliveryPayload): Promise<DeliveryResult> {
    try {
      const basePath = config["path"]!;
      const reportDir = path.join(basePath, payload.reportId);
      await mkdir(reportDir, { recursive: true });
      await writeFile(path.join(reportDir, "manifest.json"), JSON.stringify(payload, null, 2), "utf-8");
      return { success: true, channel: "shared_folder", message: `Report saved to ${reportDir}` };
    } catch (err: any) {
      return { success: false, channel: "shared_folder", message: "Shared folder delivery failed", error: err.message };
    }
  }

  // ── REST API ─────────────────────────────────────────────────────────────

  private async deliverRestApi(config: Record<string, string>, payload: DeliveryPayload): Promise<DeliveryResult> {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (config["apiKey"]) headers["Authorization"] = `Bearer ${config["apiKey"]}`;

      const method = (config["method"] ?? "POST").toUpperCase();
      const response = await fetch(config["url"]!, {
        method,
        headers,
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`API responded ${response.status}: ${await response.text()}`);
      return { success: true, channel: "rest_api", message: `Report sent to ${config["url"]}` };
    } catch (err: any) {
      return { success: false, channel: "rest_api", message: "REST API delivery failed", error: err.message };
    }
  }

  reloadConfig(): void { this.loadConfigs(); }
  getEnabledDeliveries(): DeliveryConfig[] { return this.configs.filter(c => c.enabled); }
}

function buildEmailHtml(payload: DeliveryPayload, severityColor: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  body { background:#020617; color:#e2e8f0; font-family:system-ui,sans-serif; padding:24px; }
  .header { border-bottom:2px solid #22d3ee; padding-bottom:16px; margin-bottom:24px; }
  .score { font-size:32px; font-weight:800; color:${severityColor}; }
  .stat { display:inline-block; padding:8px 16px; background:#0f172a; border:1px solid #1e293b; margin:4px; border-radius:4px; }
  .stat-label { font-size:10px; color:#64748b; text-transform:uppercase; }
  .stat-value { font-size:18px; font-weight:700; }
  .btn { display:inline-block; padding:10px 20px; background:#22d3ee; color:#020617; text-decoration:none; font-weight:700; border-radius:4px; margin-top:16px; }
  .footer { border-top:1px solid #1e293b; margin-top:24px; padding-top:16px; font-size:11px; color:#475569; }
</style></head><body>
<div class="header">
  <h1 style="color:#22d3ee;font-size:20px;">V8 Security Report — ${payload.category.toUpperCase()}</h1>
  <p style="color:#64748b;">${payload.target} — Scan #${payload.scanId} | CL: ${payload.classification}</p>
</div>
<div style="margin-bottom:16px;">
  <div class="stat"><div class="stat-label">Risk Score</div><div class="stat-value" style="color:${severityColor}">${payload.riskScore}/100</div></div>
  <div class="stat"><div class="stat-label">Security Score</div><div class="stat-value" style="color:${severityColor}">${payload.securityScore}/100</div></div>
  <div class="stat"><div class="stat-label">Total Findings</div><div class="stat-value">${payload.totalFindings}</div></div>
  <div class="stat"><div class="stat-label">Critical</div><div class="stat-value" style="color:#ef4444">${payload.criticalCount}</div></div>
  <div class="stat"><div class="stat-label">High</div><div class="stat-value" style="color:#f97316">${payload.highCount}</div></div>
  <div class="stat"><div class="stat-label">Medium</div><div class="stat-value" style="color:#eab308">${payload.mediumCount}</div></div>
</div>
<p style="color:#94a3b8;">${payload.summary}</p>
${payload.downloadUrls.length > 0 ? `<a href="${payload.downloadUrls[0]}" class="btn">VIEW FULL REPORT</a>` : ""}
<p style="color:#64748b;font-size:11px;margin-top:16px;">Formats: ${payload.formats.join(", ").toUpperCase()}</p>
<div class="footer">Generated ${payload.generatedAt} · V8 Neural Exploitation Platform · ${payload.classification}</div>
</body></html>`;
}

export const reportDelivery = new ReportDelivery();
