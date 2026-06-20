import { createServer } from "node:http";
import app from "./app";
import { logger } from "./lib/logger";
import { setupWebSocketServer } from "./ws/handler";

const rawPort = process.env["PORT"] ?? "8080";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Create HTTP server from Express app and attach WebSocket server
const server = createServer(app);
setupWebSocketServer(server);

server.listen(port, () => {
  logger.info({ port }, `Server listening on http://localhost:${port}`);
  logger.info({ port }, "[WS] WebSocket server attached");
});
