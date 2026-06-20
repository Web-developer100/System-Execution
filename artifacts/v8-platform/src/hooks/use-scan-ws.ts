import { useEffect, useRef, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetScansQueryKey, getGetScanLogsQueryKey, getGetDashboardStatsQueryKey } from "@workspace/api-client-react";

// ── WebSocket event types ─────────────────────────────────────────────────

export interface ScanWsEvent {
  type: string;
  scanId: number;
  timestamp: string;
  data?: Record<string, unknown>;
}

export type ScanWsCallback = (event: ScanWsEvent) => void;

// ── Connection state ───────────────────────────────────────────────────────

type ConnectionState = "connecting" | "connected" | "disconnected" | "error";

// ── React Hook ─────────────────────────────────────────────────────────────

export function useScanWs() {
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listenersRef = useRef<Map<string, Set<ScanWsCallback>>>(new Map());
  const subscribedRef = useRef<Set<number>>(new Set());
  const mountedRef = useRef(true);
  const queryClient = useQueryClient();

  // ── Connect ──────────────────────────────────────────────────────────────

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setConnectionState("connecting");

    // Determine WebSocket URL from current page location
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const url = `${protocol}//${host}/ws`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setConnectionState("connected");

      // Subscribe to any scans that were requested before connection
      if (subscribedRef.current.size > 0) {
        ws.send(JSON.stringify({
          type: "subscribe",
          scanIds: Array.from(subscribedRef.current),
        }));
      }
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;

      try {
        const msg = JSON.parse(event.data) as ScanWsEvent;

        // Invalidate relevant TanStack Query caches on status changes
        switch (msg.type) {
          case "scan:queued":
          case "scan:started":
          case "scan:completed":
          case "scan:failed":
          case "scan:stopped":
            // Invalidate the scans list and dashboard stats
            queryClient.invalidateQueries({ queryKey: getGetScansQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
            break;

          case "scan:progress":
            // Also invalidate scans list to update progress bars
            queryClient.invalidateQueries({ queryKey: getGetScansQueryKey() });
            break;

          case "scan:log":
            // Invalidate scan logs for the specific scan
            if (msg.scanId) {
              queryClient.invalidateQueries({ queryKey: getGetScanLogsQueryKey(msg.scanId) });
            }
            break;

          case "scan:snapshot":
            // Full state refresh
            queryClient.invalidateQueries({ queryKey: getGetScansQueryKey() });
            break;
        }

        // Notify registered listeners
        const typeListeners = listenersRef.current.get(msg.type);
        if (typeListeners) {
          for (const cb of typeListeners) {
            try {
              cb(msg);
            } catch {
              // Listener error — don't break the chain
            }
          }
        }
      } catch {
        // Parse error — skip malformed messages
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setConnectionState("disconnected");
      wsRef.current = null;

      // Auto-reconnect after 3 seconds
      reconnectTimerRef.current = setTimeout(() => {
        if (mountedRef.current) connect();
      }, 3000);
    };

    ws.onerror = () => {
      if (!mountedRef.current) return;
      setConnectionState("error");
      // The onclose handler will fire next and trigger reconnect
    };
  }, [queryClient]);

  // ── Disconnect ───────────────────────────────────────────────────────────

  const disconnect = useCallback(() => {
    mountedRef.current = false;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnectionState("disconnected");
  }, []);

  // ── Subscription management ──────────────────────────────────────────────

  const subscribe = useCallback((scanIds: number[]) => {
    if (scanIds.length === 0) return;

    // Track locally
    for (const id of scanIds) {
      subscribedRef.current.add(id);
    }

    // Send to server if connected
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "subscribe",
        scanIds,
      }));
    }
  }, []);

  const unsubscribe = useCallback((scanIds: number[]) => {
    for (const id of scanIds) {
      subscribedRef.current.delete(id);
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "unsubscribe",
        scanIds,
      }));
    }
  }, []);

  // ── Event listener management ────────────────────────────────────────────

  const addListener = useCallback((eventType: string, callback: ScanWsCallback) => {
    if (!listenersRef.current.has(eventType)) {
      listenersRef.current.set(eventType, new Set());
    }
    listenersRef.current.get(eventType)!.add(callback);

    return () => {
      listenersRef.current.get(eventType)?.delete(callback);
    };
  }, []);

  // ── Lifecycle ────────────────────────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    connectionState,
    subscribe,
    unsubscribe,
    addListener,
    reconnect: connect,
  };
}
