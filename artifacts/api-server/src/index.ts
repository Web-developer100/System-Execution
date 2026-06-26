import { createServer } from "node:http";
import app from "./app";
import { logger } from "./lib/logger";
import { setupWebSocketServer } from "./ws/handler";
import { setupGracefulShutdown } from "./lib/graceful-shutdown";
import { alertingEngine } from "./services/observability/alerting-engine";
import { anomalyDetector } from "./services/observability/anomaly-detector";
import { retentionManager } from "./services/observability/retention-manager";
import { backupMonitor } from "./services/observability/backup-monitor";

const rawPort = process.env["PORT"] ?? "8080";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Create HTTP server from Express app and attach WebSocket server
const server = createServer(app);
setupWebSocketServer(server);

// Register graceful shutdown handlers
setupGracefulShutdown(server, {
  timeout: 30_000,
  services: [
    alertingEngine,
    anomalyDetector,
    { shutdown: () => retentionManager.stop() },
    backupMonitor,
  ],
  exitOnComplete: true,
});

server.listen(port, () => {
  logger.info({ port }, `Server listening on http://localhost:${port}`);
  logger.info({ port }, "[WS] WebSocket server attached");
});
