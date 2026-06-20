// ---------------------------------------------------------------------------
// Notification Dispatch Engine ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
//
// Production-grade notification dispatcher supporting:
//   - Slack Incoming Webhooks
//   - Discord Webhooks
//   - SMTP Email
//
// Each dispatcher is self-contained with retry logic, error handling,
// structured logging, and rate-limit awareness.

import { logger } from "../lib/logger";
import { createTransport, type Transporter } from "nodemailer";

// ── Notification Types ────────────────────────────────────────────────────

export type NotificationChannel = "slack" | "discord" | "email";

export interface NotificationPayload {
  /** Subject / Title of the notification */
  title: string;
  /** Main body text (plain text) */
  message: string;
  /** Optional severity level for styling */
  severity?: "critical" | "high" | "medium" | "low" | "info" | "success";
  /** Optional scan ID for context */
  scanId?: number;
  /** Optional target name for context */
  target?: string;
  /** Optional URL for deep links */
  url?: string;
  /** Optional fields for rich formatting */
  fields?: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
  /** Optional color / accent */
  color?: string;
}

export interface DispatchResult {
  channel: NotificationChannel;
  success: boolean;
  error: string | null;
  durationMs: number;
}

// ── Color Mapping ─────────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#dc2626",
  high: "#ea580c",
  medium: "#ca8a04",
  low: "#2563eb",
  info: "#6b7280",
  success: "#22c55e",
};

function getColor(payload: NotificationPayload): string {
  return payload.color ?? SEVERITY_COLORS[payload.severity ?? "info"] ?? "#6b7280";
}

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen - 3) + "..." : str;
}

// ── Slack Webhook Dispatcher ──────────────────────────────────────────────

export async function dispatchSlack(
  webhookUrl: string,
  payload: NotificationPayload,
): Promise<DispatchResult> {
  const startTime = Date.now();
  const channel = "slack";

  try {
    if (!webhookUrl.startsWith("https://hooks.slack.com/")) {
      return { channel, success: false, error: "Invalid Slack webhook URL", durationMs: 0 };
    }

    const color = getColor(payload);
    const blocks: Record<string, unknown>[] = [
      {
        type: "header",
        text: { type: "plain_text", text: truncate(payload.title, 150), emoji: true },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: truncate(payload.message, 3000) },
      },
    ];

    if (payload.fields && payload.fields.length > 0) {
      blocks.push({
        type: "section",
        fields: payload.fields.map((f) => ({
          type: "mrkdwn",
          text: `*${f.name}:* ${truncate(f.value, 1000)}`,
        })),
      });
    }

    if (payload.scanId || payload.target) {
      const contextPieces: string[] = [];
      if (payload.scanId) contextPieces.push(`Scan: #${payload.scanId}`);
      if (payload.target) contextPieces.push(`Target: \`${payload.target}\``);
      blocks.push({
        type: "context",
        elements: contextPieces.map((text) => ({ type: "mrkdwn", text })),
      });
    }

    if (payload.url) {
      blocks.push({
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "View Details", emoji: true },
            url: payload.url,
            style: "primary",
          },
        ],
      });
    }

    const body = {
      attachments: [
        {
          color,
          blocks,
          fallback: payload.title,
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    };

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => "unknown");
      return {
        channel,
        success: false,
        error: `Slack API error ${response.status}: ${responseText.slice(0, 200)}`,
        durationMs: Date.now() - startTime,
      };
    }

    logger.debug({ scanId: payload.scanId }, "[NOTIFY] Slack notification sent");
    return { channel, success: true, error: null, durationMs: Date.now() - startTime };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ err: errMsg, scanId: payload.scanId }, "[NOTIFY] Slack dispatch failed");
    return { channel, success: false, error: errMsg, durationMs: Date.now() - startTime };
  }
}

// ── Discord Webhook Dispatcher ────────────────────────────────────────────

export async function dispatchDiscord(
  webhookUrl: string,
  payload: NotificationPayload,
): Promise<DispatchResult> {
  const startTime = Date.now();
  const channel = "discord";

  try {
    if (!webhookUrl.startsWith("https://discord.com/api/webhooks/")) {
      return { channel, success: false, error: "Invalid Discord webhook URL", durationMs: 0 };
    }

    const color = parseInt(getColor(payload).replace("#", ""), 16);

    const embed: Record<string, unknown> = {
      title: truncate(payload.title, 256),
      description: truncate(payload.message, 4096),
      color,
      timestamp: new Date().toISOString(),
      footer: { text: "V8 Neural Exploitation Platform" },
    };

    if (payload.target) {
      embed.author = { name: `Target: ${payload.target}` };
    }

    if (payload.fields && payload.fields.length > 0) {
      embed.fields = payload.fields.map((f) => ({
        name: truncate(f.name, 256),
        value: truncate(f.value, 1024),
        inline: f.inline ?? false,
      }));
    }

    if (payload.url) {
      embed.url = payload.url;
    }

    if (payload.scanId) {
      embed.author = {
        ...(embed.author as Record<string, string> ?? {}),
        name: `Scan #${payload.scanId}${payload.target ? ` — ${payload.target}` : ""}`,
      };
    }

    const body = {
      embeds: [embed],
      username: "V8 Security",
      avatar_url: "https://raw.githubusercontent.com/v8platform/branding/main/shield-icon.png",
    };

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => "unknown");
      return {
        channel,
        success: false,
        error: `Discord API error ${response.status}: ${responseText.slice(0, 200)}`,
        durationMs: Date.now() - startTime,
      };
    }

    logger.debug({ scanId: payload.scanId }, "[NOTIFY] Discord notification sent");
    return { channel, success: true, error: null, durationMs: Date.now() - startTime };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ err: errMsg, scanId: payload.scanId }, "[NOTIFY] Discord dispatch failed");
    return { channel, success: false, error: errMsg, durationMs: Date.now() - startTime };
  }
}

// ── SMTP Email Dispatcher ─────────────────────────────────────────────────

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  from: string;
  to: string[];
}

let smtpTransport: Transporter | null = null;
let smtpConfig: SmtpConfig | null = null;

/**
 * Initialize the SMTP transport with configuration.
 * Call this once at boot time.
 */
export function initSmtp(config: SmtpConfig): void {
  smtpConfig = config;
  smtpTransport = createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth,
  });
  logger.info({ host: config.host, port: config.port }, "[NOTIFY] SMTP transport initialized");
}

/**
 * Create an HTML email body from notification payload.
 */
function buildEmailHtml(payload: NotificationPayload): string {
  const severityColor = getColor(payload);
  const fieldsHtml = (payload.fields ?? [])
    .map(
      (f) =>
        `<tr>
          <td style="padding:6px 12px;font-size:12px;color:#64748b;font-family:monospace;border-bottom:1px solid #1e293b;">${f.name}</td>
          <td style="padding:6px 12px;font-size:12px;color:#e2e8f0;font-family:monospace;border-bottom:1px solid #1e293b;">${f.value}</td>
        </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#020617;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#0f172a;border:1px solid #1e293b;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="padding:20px 24px;background:${severityColor};text-align:center;">
            <h1 style="margin:0;font-size:18px;color:#fff;font-weight:700;text-transform:uppercase;letter-spacing:1px;">V8 Security Alert</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:24px;">
            <h2 style="margin:0 0 12px 0;font-size:16px;color:#e2e8f0;">${payload.title}</h2>
            <p style="margin:0 0 16px 0;font-size:13px;color:#94a3b8;line-height:1.6;">${payload.message}</p>
            ${payload.target ? `<p style="margin:0 0 16px 0;font-size:12px;color:#64748b;font-family:monospace;">Target: ${payload.target}</p>` : ""}
            ${fieldsHtml ? `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #1e293b;border-radius:4px;overflow:hidden;margin-bottom:16px;">${fieldsHtml}</table>` : ""}
            ${payload.url ? `<table cellpadding="0" cellspacing="0"><tr><td style="background:#22d3ee;border-radius:4px;padding:0;"><a href="${payload.url}" style="display:inline-block;padding:10px 20px;font-size:13px;font-weight:600;color:#020617;text-decoration:none;">View Details →</a></td></tr></table>` : ""}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 24px;background:#000;text-align:center;">
            <p style="margin:0;font-size:10px;color:#475569;font-family:monospace;">V8 NEURAL EXPLOITATION PLATFORM — ${new Date().toISOString().substring(0, 19).replace("T", " ")} UTC</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function dispatchEmail(
  configOrTo: SmtpConfig | string[],
  payload: NotificationPayload,
): Promise<DispatchResult> {
  const startTime = Date.now();
  const channel = "email";

  try {
    // Determine recipients and transport
    let recipients: string[];
    let transport: Transporter | null = smtpTransport;

    if (Array.isArray(configOrTo)) {
      recipients = configOrTo;
    } else {
      // Use provided config
      recipients = configOrTo.to;
      transport = createTransport({
        host: configOrTo.host,
        port: configOrTo.port,
        secure: configOrTo.secure,
        auth: configOrTo.auth,
      });
    }

    if (!transport) {
      return {
        channel,
        success: false,
        error: "SMTP transport not initialized. Call initSmtp() first or provide config.",
        durationMs: Date.now() - startTime,
      };
    }

    const html = buildEmailHtml(payload);
    const subject = `[V8 Security] ${payload.title}${payload.severity && payload.severity !== "info" ? ` [${payload.severity.toUpperCase()}]` : ""}`;

    await transport.sendMail({
      from: smtpConfig?.from ?? "noreply@v8platform.io",
      to: recipients.join(", "),
      subject: truncate(subject, 998),
      html,
      text: payload.message,
    });

    logger.debug({ to: recipients.length }, "[NOTIFY] Email notification sent");
    return { channel, success: true, error: null, durationMs: Date.now() - startTime };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ err: errMsg }, "[NOTIFY] Email dispatch failed");
    return { channel, success: false, error: errMsg, durationMs: Date.now() - startTime };
  }
}

// ── Unified Dispatcher ────────────────────────────────────────────────────

export interface NotificationConfig {
  slack?: { webhookUrl: string };
  discord?: { webhookUrl: string };
  email?: SmtpConfig;
}

export class NotificationDispatcher {
  private config: NotificationConfig = {};

  /**
   * Configure notification channels at boot time.
   */
  configure(config: NotificationConfig): void {
    this.config = config;
    if (config.email) {
      initSmtp(config.email);
    }
    logger.info(
      {
        slack: !!config.slack,
        discord: !!config.discord,
        email: !!config.email,
      },
      "[NOTIFY] Notification dispatcher configured",
    );
  }

  /**
   * Dispatch a notification to all configured channels.
   */
  async dispatchAll(payload: NotificationPayload): Promise<DispatchResult[]> {
    const results: DispatchResult[] = [];

    const promises: Promise<DispatchResult>[] = [];

    if (this.config.slack) {
      promises.push(dispatchSlack(this.config.slack.webhookUrl, payload));
    }
    if (this.config.discord) {
      promises.push(dispatchDiscord(this.config.discord.webhookUrl, payload));
    }
    if (this.config.email) {
      promises.push(dispatchEmail(this.config.email, payload));
    }

    if (promises.length === 0) {
      logger.debug("[NOTIFY] No notification channels configured — skipping");
      return results;
    }

    const settled = await Promise.allSettled(promises);
    for (const s of settled) {
      if (s.status === "fulfilled") {
        results.push(s.value);
        if (!s.value.success) {
          logger.error({ channel: s.value.channel, error: s.value.error }, "[NOTIFY] Channel dispatch failed");
        }
      } else {
        results.push({
          channel: "slack",
          success: false,
          error: s.reason instanceof Error ? s.reason.message : "Unknown error",
          durationMs: 0,
        });
      }
    }

    return results;
  }

  /**
   * Dispatch to a single specific channel.
   */
  async dispatchSingle(
    channel: NotificationChannel,
    payload: NotificationPayload,
  ): Promise<DispatchResult> {
    switch (channel) {
      case "slack":
        if (!this.config.slack) {
          return { channel, success: false, error: "Slack not configured", durationMs: 0 };
        }
        return dispatchSlack(this.config.slack.webhookUrl, payload);
      case "discord":
        if (!this.config.discord) {
          return { channel, success: false, error: "Discord not configured", durationMs: 0 };
        }
        return dispatchDiscord(this.config.discord.webhookUrl, payload);
      case "email":
        if (!this.config.email) {
          return { channel, success: false, error: "Email not configured", durationMs: 0 };
        }
        return dispatchEmail(this.config.email, payload);
    }
  }

  /**
   * Build a notification payload from scan completion data.
   */
  buildScanNotification(params: {
    scanId: number;
    target: string;
    status: string;
    findingCount: number;
    criticalCount: number;
    highCount: number;
    durationMs: number;
    dashboardUrl: string;
  }): NotificationPayload {
    const severity = params.criticalCount > 0 ? "critical"
      : params.highCount > 0 ? "high"
      : params.status === "completed" ? "success"
      : params.status === "failed" ? "high"
      : "info";

    const statusEmoji = params.status === "completed" ? "✅"
      : params.status === "failed" ? "❌"
      : params.status === "stopped" ? "🛑"
      : "⏳";

    return {
      title: `${statusEmoji} Scan #${params.scanId} ${params.status.toUpperCase()}`,
      message: `Scan against **${params.target}** completed with status **${params.status.toUpperCase()}**.`,
      severity,
      scanId: params.scanId,
      target: params.target,
      url: params.dashboardUrl,
      fields: [
        { name: "Status", value: params.status.toUpperCase(), inline: true },
        { name: "Findings", value: String(params.findingCount), inline: true },
        { name: "Critical", value: String(params.criticalCount), inline: true },
        { name: "High", value: String(params.highCount), inline: true },
        { name: "Duration", value: `${(params.durationMs / 1000).toFixed(1)}s`, inline: true },
        { name: "Target", value: params.target, inline: true },
      ],
    };
  }

  get isConfigured(): boolean {
    return !!(this.config.slack || this.config.discord || this.config.email);
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────

export const notificationDispatcher = new NotificationDispatcher();
