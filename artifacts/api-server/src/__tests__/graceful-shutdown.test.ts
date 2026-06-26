// ── Graceful Shutdown Unit Tests ⭐⭐⭐⭐⭐ ────────────────────────────────────
//
// Tests the graceful shutdown handler including:
//   - Signal handler registration
//   - Service shutdown calling
//   - Duplicate shutdown prevention
//   - shuttingDown flag

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import { setupGracefulShutdown, isShuttingDownFlag, getShutdownStatus, resetShutdownFlag } from "../lib/graceful-shutdown";

// ── Mock Server ───────────────────────────────────────────────────────────
// We use a mock server that resolves close() synchronously so we don't
// depend on event-loop timing in tests.

class MockServer extends EventEmitter {
  close = vi.fn((cb?: (err?: Error) => void) => {
    this.emit("close");
    cb?.();
  });
  closeAllConnections = vi.fn();
  listen = vi.fn();
}

describe("Graceful Shutdown", () => {
  let server: MockServer;

  beforeEach(() => {
    server = new MockServer();
    vi.useRealTimers();
    resetShutdownFlag();
  });

  afterEach(() => {
    process.removeAllListeners("SIGTERM");
    process.removeAllListeners("SIGINT");
    process.removeAllListeners("uncaughtException");
    process.removeAllListeners("unhandledRejection");
    // Don't use vi.restoreAllMocks() — that destroys the mock close() implementation
    // that the shutdown handler depends on to resolve its Promise.
  });

  it("should register SIGTERM signal handler", () => {
    const listenersBefore = process.listenerCount("SIGTERM");
    setupGracefulShutdown(server as any, { timeout: 10_000, services: [], exitOnComplete: false });
    const listenersAfter = process.listenerCount("SIGTERM");
    expect(listenersAfter).toBe(listenersBefore + 1);
  });

  it("should register SIGINT signal handler", () => {
    const listenersBefore = process.listenerCount("SIGINT");
    setupGracefulShutdown(server as any, { timeout: 10_000, services: [], exitOnComplete: false });
    const listenersAfter = process.listenerCount("SIGINT");
    expect(listenersAfter).toBe(listenersBefore + 1);
  });

  it("should register uncaughtException handler", () => {
    const listenersBefore = process.listenerCount("uncaughtException");
    setupGracefulShutdown(server as any, { timeout: 10_000, services: [], exitOnComplete: false });
    const listenersAfter = process.listenerCount("uncaughtException");
    expect(listenersAfter).toBe(listenersBefore + 1);
  });

  it("should register unhandledRejection handler", () => {
    const listenersBefore = process.listenerCount("unhandledRejection");
    setupGracefulShutdown(server as any, { timeout: 10_000, services: [], exitOnComplete: false });
    const listenersAfter = process.listenerCount("unhandledRejection");
    expect(listenersAfter).toBe(listenersBefore + 1);
  });

  it("should start with shuttingDown flag as false", () => {
    expect(isShuttingDownFlag()).toBe(false);
    expect(getShutdownStatus()).toEqual({ shuttingDown: false });
  });

  it("should call server.close on SIGTERM", async () => {
    setupGracefulShutdown(server as any, { timeout: 500, services: [], exitOnComplete: false });

    process.emit("SIGTERM", "SIGTERM");
    await new Promise((r) => setTimeout(r, 200));

    expect(server.close).toHaveBeenCalled();
  });

  it("should call closeAllConnections on SIGTERM", async () => {
    setupGracefulShutdown(server as any, { timeout: 500, services: [], exitOnComplete: false });

    process.emit("SIGTERM", "SIGTERM");
    await new Promise((r) => setTimeout(r, 200));

    expect(server.closeAllConnections).toHaveBeenCalled();
  });

  it("should call shutdown on registered services", async () => {
    const service = { shutdown: vi.fn().mockResolvedValue(undefined) };

    setupGracefulShutdown(server as any, { timeout: 500, services: [service], exitOnComplete: false });

    process.emit("SIGTERM", "SIGTERM");
    await new Promise((r) => setTimeout(r, 200));

    expect(service.shutdown).toHaveBeenCalled();
  });

  it("should call close on services with close() but no shutdown()", async () => {
    const service = { close: vi.fn().mockResolvedValue(undefined) };

    setupGracefulShutdown(server as any, { timeout: 500, services: [service], exitOnComplete: false });

    process.emit("SIGTERM", "SIGTERM");
    await new Promise((r) => setTimeout(r, 200));

    expect(service.close).toHaveBeenCalled();
  });

  it("should prevent duplicate shutdowns on second SIGTERM", async () => {
    const service = { shutdown: vi.fn().mockResolvedValue(undefined) };

    setupGracefulShutdown(server as any, { timeout: 500, services: [service], exitOnComplete: false });

    process.emit("SIGTERM", "SIGTERM");
    await new Promise((r) => setTimeout(r, 200));

    process.emit("SIGTERM", "SIGTERM"); // second should be ignored
    await new Promise((r) => setTimeout(r, 50));

    expect(service.shutdown).toHaveBeenCalledTimes(1);
  });

  it("should set shuttingDown flag after SIGTERM", async () => {
    setupGracefulShutdown(server as any, { timeout: 500, services: [], exitOnComplete: false });

    process.emit("SIGTERM", "SIGTERM");
    await new Promise((r) => setTimeout(r, 200));

    expect(isShuttingDownFlag()).toBe(true);
    expect(getShutdownStatus()).toEqual({ shuttingDown: true });
  });
});
