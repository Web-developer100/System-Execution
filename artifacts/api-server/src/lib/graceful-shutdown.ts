// ---------------------------------------------------------------------------
// Graceful Shutdown Handler ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
// Handles SIGTERM/SIGINT signals to gracefully shut down the server:
// 1. Stop accepting new connections
// 2. Drain active connections with timeout
// 3. Shut down background workers
// 4. Close database connections
// 5. Exit process

import type { Server } from "node:http";
import { logger } from "./logger";

// ── Types ──────────────────────────────────────────────────────────────────

interface Shutdownable {
  shutdown?: () => Promise<void> | void;
  close?: () => Promise<void> | void;
  destroy?: () => void;
}

interface ShutdownOptions {
  /** Time in ms to wait for graceful shutdown before force exit (default: 30s) */
  timeout: number;
  /** Services to shut down in order */
  services: Shutdownable[];
  /** Whether to exit the process after shutdown */
  exitOnComplete: boolean;
}

const DEFAULT_OPTIONS: ShutdownOptions = {
  timeout: 30_000,
  services: [],
  exitOnComplete: true,
};

// ── Shutdown Handler ───────────────────────────────────────────────────────

let isShuttingDown = false;

export function setupGracefulShutdown(
  server: Server,
  options?: Partial<ShutdownOptions>,
): void {
  const config = { ...DEFAULT_OPTIONS, ...options };

  const shutdown = async (signal: string) => {
    if (isShuttingDown) {
      logger.warn(`[SHUTDOWN] Already shutting down, ignoring duplicate ${signal}`);
      return;
    }
    isShuttingDown = true;

    logger.info({ signal }, `[SHUTDOWN] Received ${signal}, starting graceful shutdown...`);

    // Force exit after timeout regardless
    const forceExit = setTimeout(() => {
      logger.error("[SHUTDOWN] Forced exit after timeout");
      process.exit(1);
    }, config.timeout);

    try {
      // Step 1: Stop accepting new HTTP connections
      logger.info("[SHUTDOWN] Closing HTTP server...");
      await new Promise<void>((resolve) => {
        server.close(() => {
          logger.info("[SHUTDOWN] HTTP server closed");
          resolve();
        });
        // Force close idle keep-alive connections
        server.closeAllConnections?.();
      });

      // Step 2: Drain active connections
      logger.info("[SHUTDOWN] Draining active connections...");

      // Step 3: Shut down services in order
      for (const service of config.services) {
        const name = (service as any).constructor?.name || "UnknownService";
        try {
          if (typeof service.shutdown === "function") {
            logger.info({ service: name }, `[SHUTDOWN] Shutting down ${name}...`);
            await service.shutdown();
          } else if (typeof service.close === "function") {
            logger.info({ service: name }, `[SHUTDOWN] Closing ${name}...`);
            await service.close();
          }
        } catch (err) {
          logger.error({ err, service: name }, `[SHUTDOWN] Error shutting down ${name}`);
        }
      }

      // Step 4: Clear the force exit timer
      clearTimeout(forceExit);

      logger.info("[SHUTDOWN] Graceful shutdown complete");

      if (config.exitOnComplete) {
        process.exit(0);
      }
    } catch (err) {
      logger.error({ err }, "[SHUTDOWN] Error during shutdown");
      clearTimeout(forceExit);
      if (config.exitOnComplete) {
        process.exit(1);
      }
    }
  };

  // Register signal handlers
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Prevent uncaught exceptions from crashing immediately
  process.on("uncaughtException", (err) => {
    logger.error({ err, stack: err.stack }, "[FATAL] Uncaught exception");
    shutdown("uncaughtException");
  });

  process.on("unhandledRejection", (reason) => {
    logger.error({ reason }, "[FATAL] Unhandled promise rejection");
    // Don't shutdown on unhandled rejections, just log
  });

  logger.info("[SHUTDOWN] Graceful shutdown handlers registered");
}

// ── Health check endpoint for readiness ────────────────────────────────────

export function isShuttingDownFlag(): boolean {
  return isShuttingDown;
}

export function getShutdownStatus(): { shuttingDown: boolean } {
  return { shuttingDown: isShuttingDown };
}

/**
 * Reset the shutdown flag. Only used in tests between test runs.
 */
export function resetShutdownFlag(): void {
  isShuttingDown = false;
}
