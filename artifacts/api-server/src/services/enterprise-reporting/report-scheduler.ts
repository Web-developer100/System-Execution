// ---------------------------------------------------------------------------
// Enterprise Report Scheduler ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
//
// Automatically generates and delivers reports on a schedule:
//   - Daily, Weekly, Monthly, Quarterly, Yearly
//   - After every scan / after verification / after AI analysis
//   - Custom cron expressions
//
// Integrates with ReportDelivery to push reports to configured channels.

import crypto from "node:crypto";
import type { ReportRequest, ReportSchedule, CronFrequency, ReportFormat, ReportCategory, DeliveryMethod } from "./types";
import { logger } from "../../lib/logger";

// ── Cron Parser (simplified) ───────────────────────────────────────────────

function parseCronField(field: string, min: number, max: number): number[] {
  const values: number[] = [];

  for (const part of field.split(",")) {
    if (part === "*") {
      for (let i = min; i <= max; i++) values.push(i);
    } else if (part.includes("/")) {
      const [, stepStr] = part.split("/");
      const step = parseInt(stepStr, 10);
      if (isNaN(step)) continue;
      for (let i = min; i <= max; i += step) values.push(i);
    } else if (part.includes("-")) {
      const [from, to] = part.split("-").map(Number);
      if (isNaN(from) || isNaN(to)) continue;
      for (let i = from; i <= to; i++) values.push(i);
    } else {
      const v = parseInt(part, 10);
      if (!isNaN(v) && v >= min && v <= max) values.push(v);
    }
  }

  return [...new Set(values)].sort((a, b) => a - b);
}

function cronMatches(cronExpression: string, date: Date): boolean {
  const parts = cronExpression.split(/\s+/);
  if (parts.length !== 5) return false;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  const minutes = parseCronField(minute, 0, 59);
  const hours = parseCronField(hour, 0, 23);
  const days = parseCronField(dayOfMonth, 1, 31);
  const months = parseCronField(month, 1, 12);
  const weekdays = parseCronField(dayOfWeek, 0, 6);

  return (
    minutes.includes(date.getMinutes()) &&
    hours.includes(date.getHours()) &&
    days.includes(date.getDate()) &&
    months.includes(date.getMonth() + 1) &&
    weekdays.includes(date.getDay())
  );
}

// ── Schedule Implementation ────────────────────────────────────────────────

export class ReportScheduler {
  private engine: { generateReport: (req: ReportRequest) => Promise<unknown> };
  private schedules: ReportSchedule[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastCheck = new Date();
  private checkIntervalMs = 60_000; // check every 60 seconds

  constructor(engine: { generateReport: (req: ReportRequest) => Promise<unknown> }) {
    this.engine = engine;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  start(): void {
    if (this.timer) return;

    this.timer = setInterval(() => this.tick(), this.checkIntervalMs);
    this.timer.unref?.();

    logger.info({ scheduleCount: this.schedules.length }, "[REPORT-SCHEDULER] Started");
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    logger.info("[REPORT-SCHEDULER] Stopped");
  }

  // ── Schedule Management ──────────────────────────────────────────────────

  addSchedule(schedule: ReportSchedule): void {
    this.schedules.push(schedule);
    logger.info({ scheduleId: schedule.id, frequency: schedule.frequency }, "[REPORT-SCHEDULER] Added schedule");
  }

  removeSchedule(scheduleId: string): void {
    this.schedules = this.schedules.filter(s => s.id !== scheduleId);
    logger.info({ scheduleId }, "[REPORT-SCHEDULER] Removed schedule");
  }

  getSchedules(): ReportSchedule[] {
    return [...this.schedules];
  }

  // ── Tick ─────────────────────────────────────────────────────────────────

  private async tick(): Promise<void> {
    const now = new Date();

    for (const schedule of this.schedules) {
      if (!schedule.enabled) continue;

      try {
        const shouldRun = this.shouldRunNow(schedule, now);
        if (!shouldRun) continue;

        logger.info({ scheduleId: schedule.id, scanId: schedule.scanId }, "[REPORT-SCHEDULER] Triggering scheduled report");

        const req: ReportRequest = {
          scanId: schedule.scanId,
          category: schedule.category,
          formats: schedule.formats,
          includeCharts: true,
          includeEvidence: true,
          includeRemediation: true,
          includeAiAnalysis: true,
        };

        await this.engine.generateReport(req);

        // Update last generated time
        schedule.lastGenerated = now;

        // Calculate next generation
        schedule.nextGeneration = this.calculateNextRun(schedule, now);

        logger.info({ scheduleId: schedule.id }, "[REPORT-SCHEDULER] Scheduled report generated");
      } catch (err) {
        logger.error({ err, scheduleId: schedule.id }, "[REPORT-SCHEDULER] Failed to generate scheduled report");
      }
    }

    this.lastCheck = now;
  }

  // ── Schedule Logic ───────────────────────────────────────────────────────

  private shouldRunNow(schedule: ReportSchedule, now: Date): boolean {
    // Prevent running more than once per check interval
    if (schedule.lastGenerated && (now.getTime() - schedule.lastGenerated.getTime()) < this.checkIntervalMs) {
      return false;
    }

    switch (schedule.frequency) {
      case "daily":
        return this.isDifferentDay(schedule.lastGenerated, now);

      case "weekly":
        return now.getDay() === 1 && this.isDifferentDay(schedule.lastGenerated, now); // Monday

      case "monthly":
        return now.getDate() === 1 && this.isDifferentDay(schedule.lastGenerated, now);

      case "quarterly":
        return (now.getMonth() % 3 === 0) && now.getDate() === 1 && this.isDifferentDay(schedule.lastGenerated, now);

      case "yearly":
        return now.getMonth() === 0 && now.getDate() === 1 && this.isDifferentDay(schedule.lastGenerated, now);

      case "after_scan":
        // These are triggered by the orchestrator, not by the scheduler tick
        return false;

      case "custom":
        if (!schedule.cronExpression) return false;
        return cronMatches(schedule.cronExpression, now);

      default:
        return false;
    }
  }

  private calculateNextRun(schedule: ReportSchedule, now: Date): Date {
    const next = new Date(now);

    switch (schedule.frequency) {
      case "daily":
        next.setDate(next.getDate() + 1);
        break;
      case "weekly":
        next.setDate(next.getDate() + (8 - next.getDay()) % 7);
        break;
      case "monthly":
        next.setMonth(next.getMonth() + 1);
        next.setDate(1);
        break;
      case "quarterly":
        next.setMonth(next.getMonth() + 3);
        next.setDate(1);
        break;
      case "yearly":
        next.setFullYear(next.getFullYear() + 1);
        next.setMonth(0);
        next.setDate(1);
        break;
      default:
        next.setDate(next.getDate() + 1);
    }

    next.setHours(6, 0, 0, 0); // Default to 06:00 UTC
    return next;
  }

  private isDifferentDay(last: Date | null, now: Date): boolean {
    if (!last) return true;
    return (
      last.getFullYear() !== now.getFullYear() ||
      last.getMonth() !== now.getMonth() ||
      last.getDate() !== now.getDate()
    );
  }

  // ── Factory ──────────────────────────────────────────────────────────────

  createSchedule(params: {
    scanId: number;
    category: ReportCategory;
    formats: ReportFormat[];
    frequency: CronFrequency;
    cronExpression?: string;
    deliveryMethods?: DeliveryMethod[];
    deliveryConfig?: Record<string, string>;
    enabled?: boolean;
  }): ReportSchedule {
    const now = new Date();
    const schedule: ReportSchedule = {
      id: crypto.randomUUID(),
      scanId: params.scanId,
      category: params.category,
      formats: params.formats,
      frequency: params.frequency,
      cronExpression: params.cronExpression ?? null,
      deliveryMethods: params.deliveryMethods ?? [],
      deliveryConfig: params.deliveryConfig ?? {},
      enabled: params.enabled ?? true,
      lastGenerated: null,
      nextGeneration: null,
      createdAt: now,
    };

    schedule.nextGeneration = this.calculateNextRun(schedule, now);
    return schedule;
  }
}
