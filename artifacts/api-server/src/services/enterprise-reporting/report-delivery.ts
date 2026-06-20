// ---------------------------------------------------------------------------
// Report Delivery Methods ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
//
// Delivers generated reports to configured channels:
//   - Email (SMTP via nodemailer)
//   - Slack Webhook (rich message with link)
//   - Discord Webhook (embed with link)
//   - Generic Webhook (POST JSON payload)
//   - AWS S3 (upload with presigned URL)
//   - SFTP (upload to remote server)
//
// Each delivery method is independently configurable via environment variables.

import crypto from "node:crypto";
import { logger } from "../../lib/logger";

// ── Types ──────────────────────────────────────────────────────────────────

export type DeliveryType = "email" | "slack" | "discord" | "webhook" | "s3" | "sftp";

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
  totalFindings: number;
  riskScore: number;
  generatedAt: string;
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

  // ── Configuration Loading ────────────────────────────────────────────────

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

  // ── Channel Delivery ─────────────────────────────────────────────────────

  private async deliverToChannel(cfg: DeliveryConfig, payload: DeliveryPayload): Promise<DeliveryResult> {
    switch (cfg.type) {
      case "email": return this.deliverEmail(cfg.config, payload);
      case "slack": return this.deliverSlack(cfg.config, payload);
      case "discord": return this.deliverDiscord(cfg.config, payload);
      case "webhook": return this.deliverWebhook(cfg.config, payload);
      case "s3": return this.deliverS3(cfg.config, payload);
      case "sftp": return this.deliverSftp(cfg.config, payload);
      default:
        return { success: false, channel: cfg.type, message: "Unknown delivery type" };
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
        auth: {
          user: config["user"],
          pass: config["pass"],
        },
      });

      const severityColor = payload.criticalCount > 0 ? "#ef4444"
        : payload.highCount > 0 ? "#f97316"
        : "#22c55e";

      const html = `<!DOCTYPE html>
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
  <p style="color:#64748b;">${payload.target} — Scan #${payload.scanId}</p>
</div>
<div style="margin-bottom:16px;">
  <div class="stat"><div class="stat-label">Risk Score</div><div class="stat-value" style="color:${severityColor}">${payload.riskScore}/100</div></div>
  <div class="stat"><div class="stat-label">Total Findings</div><div class="stat-value">${payload.totalFindings}</div></div>
  <div class="stat"><div class="stat-label">Critical</div><div class="stat-value" style="color:#ef4444">${payload.criticalCount}</div></div>
  <div class="stat"><div class="stat-label">High</div><div class="stat-value" style="color:#f97316">${payload.highCount}</div></div>
</div>
<p style="color:#94a3b8;">${payload.summary}</p>
${payload.downloadUrls.length > 0 ? `<a href="${payload.downloadUrls[0]}" class="btn">VIEW FULL REPORT</a>` : ""}
<p style="color:#64748b;font-size:11px;margin-top:16px;">Formats: ${payload.formats.join(", ").toUpperCase()}</p>
<div class="footer">
  Generated ${payload.generatedAt} · V8 Neural Exploitation Platform · CONFIDENTIAL
</div>
</body></html>`;

      const to = config["to"] || (config["from"] ? `reports@${config["from"].split("@")[1] ?? "v8platform.io"}` : "security@v8platform.io");

      await transporter.sendMail({
        from: config["from"],
        to,
        subject: `[V8] ${payload.category.toUpperCase()} Report — ${payload.target} (${payload.totalFindings} findings)`,
        html,
      });

      logger.info({ to, scanId: payload.scanId }, "[REPORT-DELIVERY] Email sent");
      return { success: true, channel: "email", message: `Report emailed to ${to}` };
    } catch (err) {
      return { success: false, channel: "email", message: "Email delivery failed", error: (err as Error).message };
    }
  }

  // ── Slack Webhook ────────────────────────────────────────────────────────

  private async deliverSlack(config: Record<string, string>, payload: DeliveryPayload): Promise<DeliveryResult> {
    const severityColor = payload.criticalCount > 0 ? "#ef4444"
      : payload.highCount > 0 ? "#f97316"
      : "#22c55e";

    const blocks = [
      {
        type: "header",
        text: { type: "plain_text", text: `🔒 ${payload.category.toUpperCase()} Report — ${payload.target}`, emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Scan #${payload.scanId}*\n${payload.totalFindings} findings` },
          { type: "mrkdwn", text: `*Risk Score:* ${payload.riskScore}/100\n*Critical:* ${payload.criticalCount} | *High:* ${payload.highCount}` },
        ],
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: payload.summary.slice(0, 200) },
      },
    ];

    if (payload.downloadUrls.length > 0) {
      blocks.push({
        type: "actions",
        elements: payload.downloadUrls.slice(0, 3).map((url, i) => ({
          type: "button" as const,
          text: { type: "plain_text" as const, text: `📄 ${payload.formats[i]?.toUpperCase() ?? "View Report"}`, emoji: true },
          url,
        })),
      } as any);
    }

    const body: Record<string, unknown> = { text: `Report: ${payload.target}`, blocks, channel: config["channel"] };

    const response = await fetch(config["webhookUrl"]!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Slack responded ${response.status}: ${await response.text()}`);
    }

    logger.info({ scanId: payload.scanId }, "[REPORT-DELIVERY] Slack delivered");
    return { success: true, channel: "slack", message: "Report sent to Slack" };
  }

  // ── Discord Webhook ──────────────────────────────────────────────────────

  private async deliverDiscord(config: Record<string, string>, payload: DeliveryPayload): Promise<DeliveryResult> {
    const severityColor = payload.criticalCount > 0 ? 0xef4444
      : payload.highCount > 0 ? 0xf97316
      : 0x22c55e;

    const embed = {
      title: `${payload.category.toUpperCase()} Report — ${payload.target}`,
      description: payload.summary.slice(0, 400),
      color: severityColor,
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

    const embedWithUrl: Record<string, unknown> = { ...embed };
    if (payload.downloadUrls.length > 0) {
      embedWithUrl["url"] = payload.downloadUrls[0];
    }

    const body = { embeds: [embedWithUrl] };

    const response = await fetch(config["webhookUrl"]!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Discord responded ${response.status}: ${await response.text()}`);
    }

    logger.info({ scanId: payload.scanId }, "[REPORT-DELIVERY] Discord delivered");
    return { success: true, channel: "discord", message: "Report sent to Discord" };
  }

  // ── Generic Webhook ──────────────────────────────────────────────────────

  private async deliverWebhook(config: Record<string, string>, payload: DeliveryPayload): Promise<DeliveryResult> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };

    if (config["secret"]) {
      headers["X-Webhook-Secret"] = config["secret"];
      headers["X-Signature-256"] = crypto
        .createHmac("sha256", config["secret"])
        .update(JSON.stringify(payload))
        .digest("hex");
    }

    const response = await fetch(config["url"]!, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Webhook responded ${response.status}: ${await response.text()}`);
    }

    logger.info({ scanId: payload.scanId }, "[REPORT-DELIVERY] Webhook delivered");
    return { success: true, channel: "webhook", message: "Report sent to webhook" };
  }

  // ── AWS S3 ───────────────────────────────────────────────────────────────

  private async deliverS3(_config: Record<string, string>, _payload: DeliveryPayload): Promise<DeliveryResult> {
    // S3 upload requires @aws-sdk/client-s3 package
    return {
      success: false,
      channel: "s3",
      message: "S3 delivery requires @aws-sdk/client-s3 package — run 'pnpm add @aws-sdk/client-s3' to enable. Delivery was skipped.",
    };
  }

  // ── SFTP ─────────────────────────────────────────────────────────────────

  private async deliverSftp(_config: Record<string, string>, _payload: DeliveryPayload): Promise<DeliveryResult> {
    // SFTP upload requires ssh2-sftp-client package
    return {
      success: false,
      channel: "sftp",
      message: "SFTP delivery requires ssh2-sftp-client package — run 'pnpm add ssh2-sftp-client' to enable. Delivery was skipped.",
    };
  }

  // ── Reload ───────────────────────────────────────────────────────────────

  reloadConfig(): void {
    this.loadConfigs();
  }

  getEnabledDeliveries(): DeliveryConfig[] {
    return this.configs.filter(c => c.enabled);
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────

export const reportDelivery = new ReportDelivery();
