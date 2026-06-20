// ── Notification Dispatcher Unit Tests ───────────────────────────────────────
//
// Tests the notification dispatch engine including:
//   - Slack webhook formatting and validation
//   - Discord webhook formatting and validation
//   - SMTP email dispatch
//   - Unified dispatcher (dispatchAll / dispatchSingle)
//   - Scan notification builder

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock nodemailer at module level (before any imports that use it)
const sendMailMock = vi.fn().mockResolvedValue({});
vi.mock("nodemailer", () => ({
  default: { createTransport: () => ({ sendMail: sendMailMock }) },
  createTransport: () => ({ sendMail: sendMailMock }),
}));

import {
  dispatchSlack,
  dispatchDiscord,
  dispatchEmail,
  NotificationDispatcher,
} from "../services/notification-dispatcher";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("Notification Dispatchers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Slack ─────────────────────────────────────────────────────────────────

  describe("dispatchSlack", () => {
    it("should reject invalid Slack URLs", async () => {
      const result = await dispatchSlack("https://invalid.url/webhook", {
        title: "Test",
        message: "Test message",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid Slack webhook URL");
    });

    it("should successfully send a Slack notification", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, text: () => Promise.resolve("ok") });

      const result = await dispatchSlack("https://hooks.slack.com/services/T00/B00/xxx", {
        title: "Critical Alert",
        message: "Something bad happened",
        severity: "critical",
        scanId: 42,
        target: "example.com",
        url: "https://v8platform.io/scans/42",
        fields: [
          { name: "Status", value: "COMPLETED", inline: true },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
      expect(result.channel).toBe("slack");
      expect(mockFetch).toHaveBeenCalledOnce();

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.attachments).toHaveLength(1);
      expect(callBody.attachments[0].color).toBe("#dc2626");
      expect(callBody.attachments[0].blocks).toBeDefined();
    });

    it("should handle API errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: () => Promise.resolve("rate limited"),
      });

      const result = await dispatchSlack("https://hooks.slack.com/services/T00/B00/xxx", {
        title: "Test",
        message: "Test message",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("429");
    });

    it("should handle network failures", async () => {
      mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

      const result = await dispatchSlack("https://hooks.slack.com/services/T00/B00/xxx", {
        title: "Test",
        message: "Test message",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("ECONNREFUSED");
    });
  });

  // ── Discord ───────────────────────────────────────────────────────────────

  describe("dispatchDiscord", () => {
    it("should reject invalid Discord URLs", async () => {
      const result = await dispatchDiscord("https://invalid.url/webhook", {
        title: "Test",
        message: "Test message",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid Discord webhook URL");
    });

    it("should successfully send a Discord notification", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, text: () => Promise.resolve("ok") });

      const result = await dispatchDiscord("https://discord.com/api/webhooks/123/abc", {
        title: "Scan Complete",
        message: "Scan finished successfully",
        severity: "success",
        target: "example.com",
        scanId: 1,
        fields: [
          { name: "Findings", value: "12", inline: true },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.channel).toBe("discord");

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.embeds).toHaveLength(1);
      expect(callBody.embeds[0].title).toBe("Scan Complete");
      expect(callBody.username).toBe("V8 Security");
    });
  });

  // ── Email ─────────────────────────────────────────────────────────────────

  describe("dispatchEmail", () => {
    it("should return error when SMTP is not initialized", async () => {
      const result = await dispatchEmail(["admin@example.com"], {
        title: "Test",
        message: "Test message",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("SMTP transport not initialized");
    });

    it("should successfully send email with provided config", async () => {
      const result = await dispatchEmail(
        {
          host: "smtp.example.com",
          port: 587,
          secure: false,
          auth: { user: "user@example.com", pass: "pass" },
          from: "noreply@v8platform.io",
          to: ["admin@example.com"],
        },
        { title: "Test", message: "Test message" },
      );

      expect(result.success).toBe(true);
      // Verify nodemailer's sendMail was called exactly once
      expect(sendMailMock).toHaveBeenCalledOnce();
      const mailOptions = sendMailMock.mock.calls[0][0];
      expect(mailOptions).toHaveProperty("subject");
      expect(mailOptions.subject).toContain("Test");
    });
  });

  // ── Unified Dispatcher ────────────────────────────────────────────────────

  describe("NotificationDispatcher", () => {
    let dispatcher: NotificationDispatcher;

    beforeEach(() => {
      dispatcher = new NotificationDispatcher();
      mockFetch.mockReset();
    });

    it("should not dispatch when no channels configured", async () => {
      const results = await dispatcher.dispatchAll({
        title: "Test",
        message: "Test message",
      });
      expect(results).toHaveLength(0);
    });

    it("should dispatch to all configured channels", async () => {
      dispatcher.configure({
        slack: { webhookUrl: "https://hooks.slack.com/services/T00/B00/xxx" },
        discord: { webhookUrl: "https://discord.com/api/webhooks/123/abc" },
      });

      mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve("ok") });

      const results = await dispatcher.dispatchAll({
        title: "Test",
        message: "Test message",
      });

      expect(results).toHaveLength(2);
      expect(results.filter((r) => r.success).length).toBe(2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should return isConfigured correctly", () => {
      expect(dispatcher.isConfigured).toBe(false);
      dispatcher.configure({
        slack: { webhookUrl: "https://hooks.slack.com/services/T00/B00/xxx" },
      });
      expect(dispatcher.isConfigured).toBe(true);
    });

    it("should build scan notification payload correctly", () => {
      const payload = dispatcher.buildScanNotification({
        scanId: 1,
        target: "example.com",
        status: "completed",
        findingCount: 5,
        criticalCount: 1,
        highCount: 2,
        durationMs: 30000,
        dashboardUrl: "https://v8platform.io/scans/1",
      });

      expect(payload.title).toContain("COMPLETED");
      expect(payload.severity).toBe("critical");
      expect(payload.fields).toBeDefined();
      expect(payload.fields!.some((f) => f.name === "Critical")).toBe(true);
    });

    it("should handle dispatchSingle for specific channel", async () => {
      dispatcher.configure({
        slack: { webhookUrl: "https://hooks.slack.com/services/T00/B00/xxx" },
      });

      mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve("ok") });

      const result = await dispatcher.dispatchSingle("slack", {
        title: "Test",
        message: "Test message",
      });

      expect(result.success).toBe(true);
      expect(result.channel).toBe("slack");
    });

    it("should report unconfigured channel on dispatchSingle", async () => {
      const result = await dispatcher.dispatchSingle("discord", {
        title: "Test",
        message: "Test message",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Discord not configured");
    });

    it("should handle partial channel failures gracefully", async () => {
      dispatcher.configure({
        slack: { webhookUrl: "https://hooks.slack.com/services/T00/B00/xxx" },
        discord: { webhookUrl: "https://discord.com/api/webhooks/123/abc" },
      });

      mockFetch
        .mockRejectedValueOnce(new Error("timeout"))
        .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve("ok") });

      const results = await dispatcher.dispatchAll({
        title: "Test",
        message: "Test message",
      });

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(false);
      expect(results[1].success).toBe(true);
    });
  });
});
