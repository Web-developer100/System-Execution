// ---------------------------------------------------------------------------
// Capacity Planner ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
//
// Generates forecasts for:
//   - Storage growth
//   - Worker capacity
//   - Queue capacity
//   - Database growth
//   - CPU trends
//   - Memory trends
//   - Network usage
//   - Expected scan volume
//   - Plugin usage
//   - AI resource consumption
//
// Uses linear regression on historical data to project growth.

import type { CapacityForecast } from "./types";
import { logger } from "../../lib/logger";

// ── Historical Data Store ──────────────────────────────────────────────────

interface HistoricalSample {
  timestamp: number;
  value: number;
}

const historicalData = new Map<string, HistoricalSample[]>();

// ── Capacity Planner ───────────────────────────────────────────────────────

export class CapacityPlanner {
  private maxSamples = 500_000; // ~7 days of data at 1s intervals

  // ── Ingestion ────────────────────────────────────────────────────────────

  recordMetric(name: string, value: number): void {
    if (!historicalData.has(name)) {
      historicalData.set(name, []);
    }

    const samples = historicalData.get(name)!;
    samples.push({ timestamp: Date.now(), value });

    if (samples.length > this.maxSamples) {
      samples.splice(0, samples.length - this.maxSamples);
    }
  }

  // ── Forecasting ──────────────────────────────────────────────────────────

  forecast(name: string, capacityLimit: number): CapacityForecast | null {
    const samples = historicalData.get(name);
    if (!samples || samples.length < 10) return null;

    // Use last 1000 samples for projection
    const recent = samples.slice(-1000);
    const now = Date.now();

    // Linear regression: y = mx + b
    const n = recent.length;
    const sumX = recent.reduce((s, p, i) => s + i, 0);
    const sumY = recent.reduce((s, p) => s + p.value, 0);
    const sumXY = recent.reduce((s, p, i) => s + i * p.value, 0);
    const sumX2 = recent.reduce((s, _, i) => s + i * i, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX) || 0;
    const intercept = (sumY - slope * sumX) / n;

    const currentValue = recent[recent.length - 1]?.value ?? 0;
    const growthRate = (slope / (currentValue || 1)) * 100 * (30 * 24 * 60); // % per month based on per-minute slope

    const projectForward = (minutes: number): number => {
      const indexOffset = minutes; // assume 1 sample per minute
      return Math.max(0, slope * (n + indexOffset) + intercept);
    };

    const projected30d = projectForward(30 * 24 * 60);
    const projected90d = projectForward(90 * 24 * 60);

    // Estimate exhaustion date
    let exhaustionDate: string | null = null;
    if (slope > 0 && capacityLimit > 0) {
      const minutesUntilExhaustion = (capacityLimit - intercept) / slope;
      if (minutesUntilExhaustion > 0 && minutesUntilExhaustion < 365 * 24 * 60) {
        exhaustionDate = new Date(now + minutesUntilExhaustion * 60_000).toISOString();
      }
    }

    // Generate recommendation
    const usagePercent = capacityLimit > 0 ? (currentValue / capacityLimit) * 100 : 0;
    let recommendation: string;
    if (usagePercent > 80) {
      recommendation = `CRITICAL: ${name} usage at ${Math.round(usagePercent)}% capacity. Immediate scaling required. Consider increasing capacity by ${Math.round(usagePercent + 20)}% to maintain headroom.`;
    } else if (usagePercent > 60) {
      recommendation = `WARNING: ${name} usage at ${Math.round(usagePercent)}% capacity. Plan for scaling within 30 days. Projected ${Math.round(projected30d)} at current growth rate.`;
    } else if (usagePercent > 40) {
      recommendation = `MONITOR: ${name} usage at ${Math.round(usagePercent)}% capacity. Monitor growth trends. Projected ${Math.round(projected90d)} in 90 days.`;
    } else {
      recommendation = `HEALTHY: ${name} usage at ${Math.round(usagePercent)}% capacity. No immediate action required.`;
    }

    return {
      metric: name,
      currentUsage: Math.round(currentValue * 100) / 100,
      growthRate: Math.round(growthRate * 100) / 100,
      projectedUsage30d: Math.round(projected30d * 100) / 100,
      projectedUsage90d: Math.round(projected90d * 100) / 100,
      capacityLimit: Math.round(capacityLimit * 100) / 100,
      estimatedExhaustionDate: exhaustionDate,
      recommendation,
    };
  }

  // ── All Forecasts ────────────────────────────────────────────────────────

  getAllForecasts(): CapacityForecast[] {
    const forecasts: CapacityForecast[] = [];
    const defaultCapacities: Record<string, number> = {
      memory_usage_bytes: 8 * 1024 * 1024 * 1024, // 8 GB
      disk_usage_bytes: 100 * 1024 * 1024 * 1024, // 100 GB
      queue_depth: 10_000,
      workers_total: 100,
      plugins_total: 500,
      open_connections: 1000,
      db_connections_active: 100,
    };

    for (const [name] of historicalData) {
      const limit = defaultCapacities[name] ?? 1000;
      const forecast = this.forecast(name, limit);
      if (forecast) forecasts.push(forecast);
    }

    return forecasts;
  }

  // ── Status ───────────────────────────────────────────────────────────────

  getStatus(): { trackedMetrics: number; totalSamples: number } {
    const totalSamples = [...historicalData.values()].reduce((sum, s) => sum + s.length, 0);
    return { trackedMetrics: historicalData.size, totalSamples };
  }

  clearData(): void {
    historicalData.clear();
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────

export const capacityPlanner = new CapacityPlanner();
