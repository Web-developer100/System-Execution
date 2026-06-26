// ---------------------------------------------------------------------------
// Expanded Notification Channels ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
// Additional notification/dispatch channels for the alerting engine.
// Supports: Telegram, SMS, Push, PagerDuty, Opsgenie, ServiceNow,
// Jira, GitHub Issues, GitLab Issues, Azure DevOps.

import { logger } from "../../lib/logger";

// ── Types ──────────────────────────────────────────────────────────────────

export interface AlertDispatchPayload {
  id: string;
  ruleName: string;
  severity: string;
  message: string;
  value: number;
  threshold: number;
  source: string;
  firedAt: string;
  labels: Record<string, string>;
  description: string;
}

export interface DispatchResult {
  success: boolean;
  channel: string;
  message: string;
  error?: string;
}

// ── Email (SMTP) ───────────────────────────────────────────────────────────

export async function dispatchEmail(
  sendgridApiKey: string,
  fromAddress: string,
  toAddress: string,
  payload: AlertDispatchPayload,
): Promise<DispatchResult> {
  try {
    const body = {
      personalizations: [{ to: [{ email: toAddress }] }],
      from: { email: fromAddress },
      subject: `[V8 ${payload.severity.toUpperCase()}] ${payload.ruleName}`,
      content: [
        {
          type: "text/html",
          value: [
            `<h2 style="color:${payload.severity === "critical" ? "#ef4444" : payload.severity === "high" ? "#f97316" : "#eab308"}">${payload.severity.toUpperCase()} Alert: ${payload.ruleName}</h2>`,
            `<p>${payload.message}</p>`,
            `<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;font-family:monospace;">`,
            `<tr><td style="font-weight:bold">Severity</td><td>${payload.severity}</td></tr>`,
            `<tr><td style="font-weight:bold">Value</td><td>${payload.value}</td></tr>`,
            `<tr><td style="font-weight:bold">Threshold</td><td>${payload.threshold}</td></tr>`,
            `<tr><td style="font-weight:bold">Source</td><td>${payload.source}</td></tr>`,
            `<tr><td style="font-weight:bold">Time</td><td>${payload.firedAt}</td></tr>`,
            `</table>`,
            `<hr><p style="color:#888;font-size:11px;">V8 Platform · Automated Alert</p>`,
          ].join("\n"),
        },
      ],
    };

    const response = await fetch(`https://api.sendgrid.com/v3/mail/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${sendgridApiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok && response.status !== 202) {
      return { success: false, channel: "email", message: `Email API error ${response.status}`, error: await response.text() };
    }
    return { success: true, channel: "email", message: "Alert email sent" };
  } catch (err: any) {
    return { success: false, channel: "email", message: "Email dispatch failed", error: err.message };
  }
}

// ── Slack ───────────────────────────────────────────────────────────────────

export async function dispatchSlack(
  webhookUrl: string,
  payload: AlertDispatchPayload,
): Promise<DispatchResult> {
  try {
    const emoji = payload.severity === "critical" ? ":rotating_light:"
      : payload.severity === "high" ? ":red_circle:"
      : payload.severity === "medium" ? ":warning:"
      : ":information_source:";

    const color = payload.severity === "critical" ? "#ef4444"
      : payload.severity === "high" ? "#f97316"
      : payload.severity === "medium" ? "#eab308"
      : "#3b82f6";

    const body = {
      text: `${emoji} *V8 Alert: ${payload.severity.toUpperCase()} — ${payload.ruleName}*`,
      attachments: [
        {
          color,
          blocks: [
            {
              type: "section",
              text: { type: "mrkdwn", text: payload.message },
            },
            {
              type: "fields",
              fields: [
                { type: "mrkdwn", text: `*Severity:*\n${payload.severity}` },
                { type: "mrkdwn", text: `*Value:*\n${payload.value}` },
                { type: "mrkdwn", text: `*Threshold:*\n${payload.threshold}` },
                { type: "mrkdwn", text: `*Source:*\n${payload.source}` },
                { type: "mrkdwn", text: `*Time:*\n${payload.firedAt}` },
              ],
            },
          ],
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
      return { success: false, channel: "slack", message: `Slack API error ${response.status}`, error: await response.text() };
    }
    return { success: true, channel: "slack", message: "Alert sent to Slack" };
  } catch (err: any) {
    return { success: false, channel: "slack", message: "Slack dispatch failed", error: err.message };
  }
}

// ── Microsoft Teams ─────────────────────────────────────────────────────────

export async function dispatchTeams(
  webhookUrl: string,
  payload: AlertDispatchPayload,
): Promise<DispatchResult> {
  try {
    const color = payload.severity === "critical" ? "ef4444"
      : payload.severity === "high" ? "f97316"
      : payload.severity === "medium" ? "eab308"
      : "3b82f6";

    const body = {
      "@type": "MessageCard",
      "@context": "https://schema.org/extensions",
      themeColor: color,
      summary: `V8 Alert: ${payload.severity.toUpperCase()} — ${payload.ruleName}`,
      title: `🚨 ${payload.severity.toUpperCase()}: ${payload.ruleName}`,
      sections: [
        {
          text: payload.message,
          facts: [
            { name: "Severity", value: payload.severity },
            { name: "Value", value: String(payload.value) },
            { name: "Threshold", value: String(payload.threshold) },
            { name: "Source", value: payload.source },
            { name: "Time", value: payload.firedAt },
          ],
        },
      ],
      potentialAction: [
        {
          "@type": "OpenUri",
          name: "View in V8 Platform",
          targets: [{ os: "default", uri: "/observability/alerts" }],
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
      return { success: false, channel: "teams", message: `Teams API error ${response.status}`, error: await response.text() };
    }
    return { success: true, channel: "teams", message: "Alert sent to Microsoft Teams" };
  } catch (err: any) {
    return { success: false, channel: "teams", message: "Teams dispatch failed", error: err.message };
  }
}

// ── Discord ─────────────────────────────────────────────────────────────────

export async function dispatchDiscord(
  webhookUrl: string,
  payload: AlertDispatchPayload,
): Promise<DispatchResult> {
  try {
    const color = payload.severity === "critical" ? 0xef4444
      : payload.severity === "high" ? 0xf97316
      : payload.severity === "medium" ? 0xeab308
      : 0x3b82f6;

    const body = {
      username: "V8 Platform",
      avatar_url: "https://v8platform.io/logo.png",
      embeds: [
        {
          title: `${payload.severity.toUpperCase()}: ${payload.ruleName}`,
          description: payload.message,
          color,
          fields: [
            { name: "Severity", value: payload.severity, inline: true },
            { name: "Value", value: String(payload.value), inline: true },
            { name: "Threshold", value: String(payload.threshold), inline: true },
            { name: "Source", value: payload.source, inline: true },
          ],
          footer: { text: "V8 Platform · Automated Alert" },
          timestamp: payload.firedAt,
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
      return { success: false, channel: "discord", message: `Discord API error ${response.status}`, error: await response.text() };
    }
    return { success: true, channel: "discord", message: "Alert sent to Discord" };
  } catch (err: any) {
    return { success: false, channel: "discord", message: "Discord dispatch failed", error: err.message };
  }
}

// ── Generic Webhook ─────────────────────────────────────────────────────────

export async function dispatchWebhook(
  webhookUrl: string,
  payload: AlertDispatchPayload,
  customHeaders?: Record<string, string>,
): Promise<DispatchResult> {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(customHeaders ?? {}),
      },
      body: JSON.stringify({
        event: "alert",
        source: "v8-platform",
        severity: payload.severity,
        ruleName: payload.ruleName,
        message: payload.message,
        value: payload.value,
        threshold: payload.threshold,
        firedAt: payload.firedAt,
        labels: payload.labels,
        description: payload.description,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return { success: false, channel: "webhook", message: `Webhook API error ${response.status}`, error: await response.text() };
    }
    return { success: true, channel: "webhook", message: "Alert sent via webhook" };
  } catch (err: any) {
    return { success: false, channel: "webhook", message: "Webhook dispatch failed", error: err.message };
  }
}

// ── Telegram ───────────────────────────────────────────────────────────────

export async function dispatchTelegram(
  botToken: string,
  chatId: string,
  payload: AlertDispatchPayload,
): Promise<DispatchResult> {
  try {
    const emoji = payload.severity === "critical" ? "🚨"
      : payload.severity === "high" ? "🔴"
      : payload.severity === "medium" ? "🟡"
      : "🔵";

    const text = [
      `${emoji} *${payload.severity.toUpperCase()}*: ${payload.ruleName}`,
      ``,
      `_${payload.message}_`,
      ``,
      `Value: \`${payload.value}\` | Threshold: \`${payload.threshold}\``,
      `Source: \`${payload.source}\``,
      `Time: ${payload.firedAt}`,
    ].join("\n");

    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return { success: false, channel: "telegram", message: `Telegram API error ${response.status}`, error: await response.text() };
    }
    return { success: true, channel: "telegram", message: "Alert sent to Telegram" };
  } catch (err: any) {
    return { success: false, channel: "telegram", message: "Telegram dispatch failed", error: err.message };
  }
}

// ── SMS (Twilio) ───────────────────────────────────────────────────────────

export async function dispatchSms(
  accountSid: string,
  authToken: string,
  fromNumber: string,
  toNumber: string,
  payload: AlertDispatchPayload,
): Promise<DispatchResult> {
  try {
    const body = `[V8 ${payload.severity.toUpperCase()}] ${payload.ruleName}: ${payload.message.slice(0, 120)}`;
    const encoded = new URLSearchParams({ From: fromNumber, To: toNumber, Body: body });

    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      },
      body: encoded.toString(),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return { success: false, channel: "sms", message: `SMS API error ${response.status}`, error: await response.text() };
    }
    return { success: true, channel: "sms", message: "Alert sent via SMS" };
  } catch (err: any) {
    return { success: false, channel: "sms", message: "SMS dispatch failed", error: err.message };
  }
}

// ── Push Notification (OneSignal) ──────────────────────────────────────────

export async function dispatchPushNotification(
  appId: string,
  apiKey: string,
  userIds: string[],
  payload: AlertDispatchPayload,
): Promise<DispatchResult> {
  try {
    const response = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${apiKey}`,
      },
      body: JSON.stringify({
        app_id: appId,
        include_player_ids: userIds,
        headings: { en: `[${payload.severity.toUpperCase()}] ${payload.ruleName}` },
        contents: { en: payload.message.slice(0, 200) },
        priority: payload.severity === "critical" ? 10 : 5,
        android_channel_id: payload.severity === "critical" ? "critical-alerts" : "alerts",
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return { success: false, channel: "push", message: `Push API error ${response.status}`, error: await response.text() };
    }
    return { success: true, channel: "push", message: "Push notification sent" };
  } catch (err: any) {
    return { success: false, channel: "push", message: "Push dispatch failed", error: err.message };
  }
}

// ── PagerDuty ──────────────────────────────────────────────────────────────

export async function dispatchPagerDuty(
  routingKey: string,
  payload: AlertDispatchPayload,
): Promise<DispatchResult> {
  try {
    const severityMap: Record<string, string> = {
      critical: "critical", high: "error", medium: "warning", low: "info", info: "info",
    };

    const body = {
      routing_key: routingKey,
      event_action: "trigger",
      dedup_key: `v8-alert-${payload.id}`,
      payload: {
        summary: `[V8] ${payload.severity.toUpperCase()}: ${payload.ruleName}`,
        severity: severityMap[payload.severity] ?? "info",
        source: payload.source,
        component: "V8 Platform",
        group: "Security",
        class: "alert",
        custom_details: {
          id: payload.id,
          value: payload.value,
          threshold: payload.threshold,
          message: payload.message,
          description: payload.description,
        },
        timestamp: payload.firedAt,
      },
    };

    const response = await fetch("https://events.pagerduty.com/v2/enqueue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return { success: false, channel: "pagerduty", message: `PagerDuty API error ${response.status}`, error: await response.text() };
    }
    return { success: true, channel: "pagerduty", message: "PagerDuty incident created" };
  } catch (err: any) {
    return { success: false, channel: "pagerduty", message: "PagerDuty dispatch failed", error: err.message };
  }
}

// ── Opsgenie ───────────────────────────────────────────────────────────────

export async function dispatchOpsgenie(
  apiKey: string,
  payload: AlertDispatchPayload,
): Promise<DispatchResult> {
  try {
    const priorityMap: Record<string, string> = {
      critical: "P1", high: "P2", medium: "P3", low: "P4", info: "P5",
    };

    const body = {
      message: `[V8] ${payload.severity.toUpperCase()}: ${payload.ruleName}`,
      description: payload.message,
      priority: priorityMap[payload.severity] ?? "P5",
      source: payload.source,
      tags: [payload.severity, "v8-platform", "automated"],
      details: {
        id: payload.id,
        value: String(payload.value),
        threshold: String(payload.threshold),
        firedAt: payload.firedAt,
      },
    };

    const response = await fetch("https://api.opsgenie.com/v2/alerts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `GenieKey ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return { success: false, channel: "opsgenie", message: `Opsgenie API error ${response.status}`, error: await response.text() };
    }
    return { success: true, channel: "opsgenie", message: "Opsgenie alert created" };
  } catch (err: any) {
    return { success: false, channel: "opsgenie", message: "Opsgenie dispatch failed", error: err.message };
  }
}

// ── ServiceNow ─────────────────────────────────────────────────────────────

export async function dispatchServiceNow(
  instanceUrl: string,
  username: string,
  password: string,
  payload: AlertDispatchPayload,
): Promise<DispatchResult> {
  try {
    const severityMap: Record<string, number> = {
      critical: 1, high: 2, medium: 3, low: 4, info: 5,
    };

    const body = {
      short_description: `[V8] ${payload.severity.toUpperCase()}: ${payload.ruleName}`,
      description: `${payload.message}\n\nValue: ${payload.value}\nThreshold: ${payload.threshold}\nSource: ${payload.source}`,
      urgency: payload.severity === "critical" ? 1 : payload.severity === "high" ? 2 : 3,
      impact: severityMap[payload.severity] ?? 3,
      category: "security",
      assignment_group: "Security Operations",
      caller_id: "V8 Platform",
    };

    const response = await fetch(`${instanceUrl}/api/now/table/incident`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      return { success: false, channel: "servicenow", message: `ServiceNow API error ${response.status}`, error: await response.text() };
    }
    return { success: true, channel: "servicenow", message: "ServiceNow incident created" };
  } catch (err: any) {
    return { success: false, channel: "servicenow", message: "ServiceNow dispatch failed", error: err.message };
  }
}

// ── Jira ───────────────────────────────────────────────────────────────────

export async function dispatchJira(
  baseUrl: string,
  email: string,
  apiToken: string,
  projectKey: string,
  payload: AlertDispatchPayload,
): Promise<DispatchResult> {
  try {
    const priorityMap: Record<string, string> = {
      critical: "Highest", high: "High", medium: "Medium", low: "Low", info: "Lowest",
    };

    const body = {
      fields: {
        project: { key: projectKey },
        summary: `[V8] ${payload.severity.toUpperCase()}: ${payload.ruleName}`,
        description: {
          type: "doc",
          version: 1,
          content: [
            { type: "paragraph", content: [{ type: "text", text: payload.message }] },
            { type: "paragraph", content: [{ type: "text", text: `\nValue: ${payload.value}\nThreshold: ${payload.threshold}\nSource: ${payload.source}` }] },
          ],
        },
        issuetype: { name: "Bug" },
        priority: { name: priorityMap[payload.severity] ?? "Medium" },
        labels: ["v8-platform", "automated", payload.severity],
      },
    };

    const response = await fetch(`${baseUrl}/rest/api/3/issue`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      return { success: false, channel: "jira", message: `Jira API error ${response.status}`, error: await response.text() };
    }
    const data: any = await response.json();
    return { success: true, channel: "jira", message: `Jira issue created: ${data.key}` };
  } catch (err: any) {
    return { success: false, channel: "jira", message: "Jira dispatch failed", error: err.message };
  }
}

// ── GitHub Issues ──────────────────────────────────────────────────────────

export async function dispatchGitHubIssue(
  token: string,
  owner: string,
  repo: string,
  payload: AlertDispatchPayload,
): Promise<DispatchResult> {
  try {
    const severityLabels = ["v8-platform", "automated", `severity:${payload.severity}`];

    const body = {
      title: `[V8] ${payload.severity.toUpperCase()}: ${payload.ruleName}`,
      body: [
        `## ${payload.severity.toUpperCase()} Alert: ${payload.ruleName}`,
        ``,
        payload.message,
        ``,
        `| Field | Value |`,
        `|-------|-------|`,
        `| Severity | ${payload.severity} |`,
        `| Value | ${payload.value} |`,
        `| Threshold | ${payload.threshold} |`,
        `| Source | ${payload.source} |`,
        `| Time | ${payload.firedAt} |`,
      ].join("\n"),
      labels: severityLabels,
    };

    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github.v3+json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return { success: false, channel: "github", message: `GitHub API error ${response.status}`, error: await response.text() };
    }
    const data: any = await response.json();
    return { success: true, channel: "github", message: `GitHub issue created: ${data.html_url}` };
  } catch (err: any) {
    return { success: false, channel: "github", message: "GitHub dispatch failed", error: err.message };
  }
}

// ── GitLab Issues ──────────────────────────────────────────────────────────

export async function dispatchGitLabIssue(
  token: string,
  projectId: string,
  payload: AlertDispatchPayload,
): Promise<DispatchResult> {
  try {
    const body = {
      title: `[V8] ${payload.severity.toUpperCase()}: ${payload.ruleName}`,
      description: [
        `## ${payload.severity.toUpperCase()} Alert: ${payload.ruleName}`,
        ``,
        payload.message,
        ``,
        `**Severity:** ${payload.severity}`,
        `**Value:** ${payload.value}`,
        `**Threshold:** ${payload.threshold}`,
        `**Source:** ${payload.source}`,
        `**Time:** ${payload.firedAt}`,
      ].join("\n"),
      labels: "v8-platform,automated",
      severity: payload.severity,
    };

    const response = await fetch(`https://gitlab.com/api/v4/projects/${encodeURIComponent(projectId)}/issues`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return { success: false, channel: "gitlab", message: `GitLab API error ${response.status}`, error: await response.text() };
    }
    const data: any = await response.json();
    return { success: true, channel: "gitlab", message: `GitLab issue created: #${data.iid}` };
  } catch (err: any) {
    return { success: false, channel: "gitlab", message: "GitLab dispatch failed", error: err.message };
  }
}

// ── Azure DevOps ───────────────────────────────────────────────────────────

export async function dispatchAzureDevOps(
  organization: string,
  project: string,
  pat: string,
  payload: AlertDispatchPayload,
): Promise<DispatchResult> {
  try {
    const severityMap: Record<string, string> = {
      critical: "critical", high: "high", medium: "medium", low: "low", info: "info",
    };

    const body = {
      title: `[V8] ${payload.severity.toUpperCase()}: ${payload.ruleName}`,
      description: `${payload.message}\n\nValue: ${payload.value}\nThreshold: ${payload.threshold}\nSource: ${payload.source}`,
      severity: severityMap[payload.severity] ?? "medium",
      priority: payload.severity === "critical" ? 1 : payload.severity === "high" ? 2 : 3,
      tags: ["v8-platform", "automated", payload.severity],
    };

    const response = await fetch(
      `https://dev.azure.com/${organization}/${encodeURIComponent(project)}/_apis/wit/workitems/$Bug?api-version=7.0`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json-patch+json",
          "Authorization": `Basic ${Buffer.from(`:${pat}`).toString("base64")}`,
        },
        body: JSON.stringify([
          { op: "add", path: "/fields/System.Title", value: body.title },
          { op: "add", path: "/fields/System.Description", value: body.description },
          { op: "add", path: "/fields/Microsoft.VSTS.Common.Severity", value: body.severity },
          { op: "add", path: "/fields/Microsoft.VSTS.Common.Priority", value: body.priority },
          { op: "add", path: "/fields/System.Tags", value: body.tags.join("; ") },
        ]),
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (!response.ok) {
      return { success: false, channel: "azuredevops", message: `Azure DevOps API error ${response.status}`, error: await response.text() };
    }
    const data: any = await response.json();
    return { success: true, channel: "azuredevops", message: `Azure DevOps work item created: #${data.id}` };
  } catch (err: any) {
    return { success: false, channel: "azuredevops", message: "Azure DevOps dispatch failed", error: err.message };
  }
}

// ── Unified Dispatcher ─────────────────────────────────────────────────────

export async function dispatchAlertToChannels(
  channels: string[],
  channelConfigs: Record<string, Record<string, string>>,
  payload: AlertDispatchPayload,
): Promise<DispatchResult[]> {
  const results: DispatchResult[] = [];

  for (const channel of channels) {
    const config = channelConfigs[channel];
    if (!config) continue;

    try {
      let result: DispatchResult;
      switch (channel) {
        case "email":
          result = await dispatchEmail(config["apiKey"]!, config["fromAddress"]!, config["toAddress"]!, payload);
          break;
        case "slack":
          result = await dispatchSlack(config["webhookUrl"]!, payload);
          break;
        case "teams":
          result = await dispatchTeams(config["webhookUrl"]!, payload);
          break;
        case "discord":
          result = await dispatchDiscord(config["webhookUrl"]!, payload);
          break;
        case "webhook":
          result = await dispatchWebhook(config["webhookUrl"]!, payload, config["customHeaders"] ? JSON.parse(config["customHeaders"]) : undefined);
          break;
        case "telegram":
          result = await dispatchTelegram(config["botToken"]!, config["chatId"]!, payload);
          break;
        case "sms":
          result = await dispatchSms(config["accountSid"]!, config["authToken"]!, config["fromNumber"]!, config["toNumber"]!, payload);
          break;
        case "push":
          result = await dispatchPushNotification(config["appId"]!, config["apiKey"]!, (config["userIds"] ?? "").split(","), payload);
          break;
        case "pagerduty":
          result = await dispatchPagerDuty(config["routingKey"]!, payload);
          break;
        case "opsgenie":
          result = await dispatchOpsgenie(config["apiKey"]!, payload);
          break;
        case "servicenow":
          result = await dispatchServiceNow(config["instanceUrl"]!, config["username"]!, config["password"]!, payload);
          break;
        case "jira":
          result = await dispatchJira(config["baseUrl"]!, config["email"]!, config["apiToken"]!, config["projectKey"]!, payload);
          break;
        case "github":
          result = await dispatchGitHubIssue(config["token"]!, config["owner"]!, config["repo"]!, payload);
          break;
        case "gitlab":
          result = await dispatchGitLabIssue(config["token"]!, config["projectId"]!, payload);
          break;
        case "azuredevops":
          result = await dispatchAzureDevOps(config["organization"]!, config["project"]!, config["pat"]!, payload);
          break;
        default:
          result = { success: false, channel, message: `Unknown channel: ${channel}` };
      }
      results.push(result);
    } catch (err: any) {
      results.push({ success: false, channel, message: `Dispatch error: ${err.message}`, error: err.message });
    }
  }

  return results;
}
