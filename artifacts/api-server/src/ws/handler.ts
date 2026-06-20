import { WebSocketServer, type WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import type { Server } from "node:http";
import type { JobEvent, JobEventCallback } from "../engine/types";
import { orchestrator } from "../orchestrator-instance";
import { logger } from "../lib/logger";

// ── WebSocket Message Protocol ─────────────────────────────────────────────
//
// Server → Client messages:
//   { type: "scan:queued",    scanId, data: { target, tools } }
//   { type: "scan:started",   scanId, data: { target } }
//   { type: "scan:progress",  scanId, data: { progress } }
//   { type: "scan:log",       scanId, data: { level, message, timestamp } }
//   { type: "scan:completed", scanId, data: { status } }
//   { type: "scan:failed",    scanId, data: { status, error? } }
//   { type: "scan:stopped",   scanId, data: { status } }
//   { type: "scan:vuln",      scanId, data: { finding: { title, severity, ... } } }
//
// Client → Server messages:
//   { type: "subscribe",   scanIds: number[] }
//   { type: "unsubscribe", scanIds: number[] }
//   { type: "ping" }

// ── Connection state ───────────────────────────────────────────────────────

interface ClientState {
  ws: WebSocket;
  subscribedScans: Set<number>;
  authenticated: boolean;
}

const clients = new Set<ClientState>();
let wss: WebSocketServer | null = null;
let unsubscribeFromOrchestrator: (() => void) | null = null;

// ── WebSocket Server Setup ─────────────────────────────────────────────────

export function setupWebSocketServer(server: Server): WebSocketServer {
  wss = new WebSocketServer({
    server,
    path: "/ws",
    maxPayload: 256 * 1024, // 256KB max message
  });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const client: ClientState = {
      ws,
      subscribedScans: new Set(),
      authenticated: true, // WebSocket auth is optional; add token check if needed
    };

    clients.add(client);
    logger.debug({ ip: req.socket.remoteAddress }, "[WS] Client connected");

    // ── Handle incoming messages ──────────────────────────────────────────

    ws.on("message", (raw: Buffer | string) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          type: string;
          scanIds?: number[];
        };

        switch (msg.type) {
          case "subscribe": {
            if (Array.isArray(msg.scanIds)) {
              for (const id of msg.scanIds) {
                client.subscribedScans.add(id);
              }
              logger.debug({ scanIds: msg.scanIds }, "[WS] Client subscribed");
              // Send snapshot of current active scans
              sendSnapshot(client);
            }
            break;
          }

          case "unsubscribe": {
            if (Array.isArray(msg.scanIds)) {
              for (const id of msg.scanIds) {
                client.subscribedScans.delete(id);
              }
            }
            break;
          }

          case "ping": {
            ws.send(JSON.stringify({ type: "pong" }));
            break;
          }

          default:
            logger.warn({ type: msg.type }, "[WS] Unknown message type");
        }
      } catch (err) {
        logger.warn({ err }, "[WS] Failed to parse message");
      }
    });

    // ── Handle disconnection ──────────────────────────────────────────────

    ws.on("close", () => {
      clients.delete(client);
      logger.debug({}, "[WS] Client disconnected");
    });

    ws.on("error", (err: Error) => {
      logger.error({ err }, "[WS] Client error");
      clients.delete(client);
    });

    // Send an initial welcome message
    ws.send(JSON.stringify({
      type: "welcome",
      data: { version: "1.0", serverTime: new Date().toISOString() },
    }));
  });

  // ── Bridge orchestrator events to WebSocket clients ────────────────────

  const eventHandler: JobEventCallback = (event: JobEvent) => {
    broadcastToSubscribed(event);
  };

  unsubscribeFromOrchestrator = orchestrator.queue.on(eventHandler);

  logger.info("[WS] WebSocket server initialized");

  return wss;
}

// ── Broadcast helpers ──────────────────────────────────────────────────────

function broadcastToSubscribed(event: JobEvent): void {
  const wsMessage = jsonForEvent(event);
  if (!wsMessage) return;

  const payload = JSON.stringify(wsMessage);

  for (const client of clients) {
    if (!client.authenticated || client.ws.readyState !== 1) continue; // WebSocket.OPEN = 1

    // Only send if the client is subscribed to this scanId, or send all
    // status events (queued, completed, failed, stopped) to all clients
    // so the dashboard gets updates for all scans.
    if (
      client.subscribedScans.size === 0 ||
      client.subscribedScans.has(event.scanId) ||
      event.type === "queued" ||
      event.type === "completed" ||
      event.type === "failed" ||
      event.type === "stopped"
    ) {
      try {
        client.ws.send(payload);
      } catch {
        // Write buffer full or socket closing — skip
      }
    }
  }
}

function sendSnapshot(client: ClientState): void {
  const snap = orchestrator.queue.snapshot();
  const active = [...snap.active, ...snap.queued];

  const snapshotMsg = {
    type: "scan:snapshot",
    data: {
      active: active.map((j) => ({
        id: j.id,
        target: j.target,
        status: j.status,
        progress: j.progress,
        tools: j.tools,
      })),
    },
  };

  try {
    client.ws.send(JSON.stringify(snapshotMsg));
  } catch {
    // skip
  }
}

function jsonForEvent(event: JobEvent): Record<string, unknown> | null {
  const base = { scanId: event.scanId, timestamp: event.timestamp.toISOString() };

  switch (event.type) {
    case "queued":
      return { ...base, type: "scan:queued", data: event.data };
    case "started":
      return { ...base, type: "scan:started", data: event.data };
    case "progress":
      return { ...base, type: "scan:progress", data: event.data };
    case "log":
      return { ...base, type: "scan:log", data: event.data };
    case "completed":
      return { ...base, type: "scan:completed", data: event.data };
    case "failed":
      return { ...base, type: "scan:failed", data: event.data };
    case "stopped":
      return { ...base, type: "scan:stopped", data: event.data };
    default:
      return null;
  }
}

// ── Cleanup ─────────────────────────────────────────────────────────────────

export function shutdownWebSocket(): void {
  if (unsubscribeFromOrchestrator) {
    unsubscribeFromOrchestrator();
    unsubscribeFromOrchestrator = null;
  }

  if (wss) {
    wss.close(() => {
      logger.info("[WS] WebSocket server closed");
    });
    wss = null;
  }

  clients.clear();
}
