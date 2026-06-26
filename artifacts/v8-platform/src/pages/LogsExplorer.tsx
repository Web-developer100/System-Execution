import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { authFetch } from "@/lib/auth-fetch";
import {
  FileText, Search, Filter, RefreshCw, ChevronDown, ChevronRight,
  Terminal, AlertTriangle, Info, Bug, XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// ── Types ─────────────────────────────────────────────────────────────────

interface LogEntry {
  timestamp: string;
  correlationId: string | null;
  traceId: string | null;
  requestId: string | null;
  userId: string | null;
  organizationId: string | null;
  workerId: string | null;
  pluginId: string | null;
  serviceName: string;
  hostname: string;
  severity: "debug" | "info" | "warn" | "error" | "fatal";
  category: string;
  operation: string;
  message: string;
  executionTimeMs: number | null;
  status: string | null;
  exception: string | null;
  stackTrace: string | null;
  metadata: Record<string, unknown> | null;
}

// ── Constants ─────────────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<string, string> = {
  debug: "bg-muted/20 text-muted-foreground border-muted/20",
  info: "bg-primary/10 text-primary border-primary/20",
  warn: "bg-warning/10 text-warning border-warning/20",
  error: "bg-destructive/10 text-destructive border-destructive/20",
  fatal: "bg-destructive/20 text-destructive border-destructive/30",
};

const SEVERITY_DOT: Record<string, string> = {
  debug: "bg-muted-foreground",
  info: "bg-primary",
  warn: "bg-warning",
  error: "bg-destructive",
  fatal: "bg-destructive",
};

const CATEGORY_COLORS: Record<string, string> = {
  system: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  application: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  security: "bg-red-500/15 text-red-400 border-red-500/30",
  audit: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  authentication: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  worker: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  plugin: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  ai: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  verification: "bg-teal-500/15 text-teal-400 border-teal-500/30",
  api: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  database: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  queue: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  infrastructure: "bg-pink-500/15 text-pink-400 border-pink-500/30",
  notification: "bg-lime-500/15 text-lime-400 border-lime-500/30",
};

// ── Helpers ───────────────────────────────────────────────────────────────

function getSeverityIcon(severity: string) {
  switch (severity) {
    case "error": return <XCircle className="w-3 h-3" />;
    case "fatal": return <XCircle className="w-3 h-3" />;
    case "warn": return <AlertTriangle className="w-3 h-3" />;
    case "debug": return <Bug className="w-3 h-3" />;
    default: return <Info className="w-3 h-3" />;
  }
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const LOG_CATEGORIES = [
  "system", "application", "security", "audit", "authentication",
  "worker", "plugin", "ai", "verification", "api",
  "database", "queue", "infrastructure", "notification", "integration",
  "reporting", "scheduler", "metrics",
];

// ── Log Row ───────────────────────────────────────────────────────────────

function LogRow({ entry, isStream }: { entry: LogEntry; isStream?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const sevColor = SEVERITY_COLORS[entry.severity] ?? "bg-muted/10 text-muted-foreground";
  const catColor = CATEGORY_COLORS[entry.category] ?? "bg-muted/10 text-muted-foreground";

  return (
    <div
      className={`border-b border-border/10 hover:bg-muted/10 transition-colors ${
        entry.severity === "error" || entry.severity === "fatal" ? "bg-destructive/[0.02]" : ""
      } ${isStream ? "animate-fade-in" : ""}`}
    >
      <div
        className="flex items-start gap-3 px-4 py-2 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className={`shrink-0 mt-0.5 w-2 h-2 rounded-full ${SEVERITY_DOT[entry.severity] ?? "bg-muted-foreground"}`} />
        <div className="w-14 shrink-0 font-mono text-[10px] text-muted-foreground">
          {new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </div>
        <div className="shrink-0">
          <Badge variant="outline" className={`text-[9px] font-mono px-1.5 py-0 h-4 ${sevColor}`}>
            {getSeverityIcon(entry.severity)}
            <span className="ml-1">{entry.severity.toUpperCase()}</span>
          </Badge>
        </div>
        <div className="shrink-0">
          <Badge variant="outline" className={`text-[9px] font-mono px-1.5 py-0 h-4 ${catColor}`}>
            {entry.category}
          </Badge>
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-xs font-medium">{entry.operation}</span>
          <span className="text-xs text-muted-foreground ml-2">{entry.message}</span>
        </div>
        <div className="shrink-0 text-[10px] text-muted-foreground font-mono">
          {relativeTime(entry.timestamp)}
        </div>
        <div className="shrink-0">
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </div>
      </div>

      {expanded && (
        <div className="ml-12 mr-4 mb-2 p-3 bg-black/30 border border-border/20 rounded-lg space-y-2 text-xs">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Details</p>
              <div className="space-y-1 font-mono">
                <div><span className="text-muted-foreground">Service:</span> {entry.serviceName}</div>
                <div><span className="text-muted-foreground">Host:</span> {entry.hostname}</div>
                <div><span className="text-muted-foreground">Correlation ID:</span> <span className="text-[9px]">{entry.correlationId ?? "—"}</span></div>
                <div><span className="text-muted-foreground">Trace ID:</span> <span className="text-[9px]">{entry.traceId ?? "—"}</span></div>
                {entry.executionTimeMs !== null && <div><span className="text-muted-foreground">Duration:</span> {entry.executionTimeMs}ms</div>}
                <div><span className="text-muted-foreground">Status:</span> {entry.status ?? "—"}</div>
              </div>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Identity</p>
              <div className="space-y-1 font-mono">
                <div><span className="text-muted-foreground">User ID:</span> {entry.userId ?? "—"}</div>
                <div><span className="text-muted-foreground">Org ID:</span> {entry.organizationId ?? "—"}</div>
                <div><span className="text-muted-foreground">Worker ID:</span> {entry.workerId ?? "—"}</div>
                <div><span className="text-muted-foreground">Plugin ID:</span> {entry.pluginId ?? "—"}</div>
              </div>
            </div>
          </div>
          {entry.exception && (
            <div className="bg-destructive/10 border border-destructive/20 rounded p-2">
              <p className="text-destructive font-semibold text-[10px] uppercase tracking-wider">Exception</p>
              <p className="font-mono text-xs mt-1">{entry.exception}</p>
              {entry.stackTrace && (
                <pre className="text-[9px] text-muted-foreground font-mono mt-1 overflow-x-auto whitespace-pre-wrap">
                  {entry.stackTrace}
                </pre>
              )}
            </div>
          )}
          {entry.metadata && Object.keys(entry.metadata).length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Metadata</p>
              <pre className="bg-black border border-border/20 p-2 text-[9px] font-mono text-primary/70 overflow-x-auto max-h-40 overflow-y-auto">
                {JSON.stringify(entry.metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────

export default function LogsExplorer() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");
  const [streamMode, setStreamMode] = useState(false);
  const [streamLogs, setStreamLogs] = useState<LogEntry[]>([]);
  const streamRef = useRef<EventSource | null>(null);
  const [page, setPage] = useState(1);
  const limit = 100;

  // Build query params for fetching
  const params = new URLSearchParams();
  if (search) params.set("correlationId", search);
  if (categoryFilter !== "ALL") params.set("category", categoryFilter);
  if (severityFilter !== "ALL") params.set("severity", severityFilter);
  params.set("limit", String(limit));
  params.set("offset", String((page - 1) * limit));

  const { data, isLoading, refetch } = useQuery<{ total: number; entries: LogEntry[] }>({
    queryKey: ["observability", "logs", page, search, categoryFilter, severityFilter],
    queryFn: async () => {
      const res = await authFetch(`/api/observability/logs?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch logs");
      return res.json();
    },
    refetchInterval: streamMode ? false : 10_000,
  });

  const { data: stats } = useQuery<{ bufferSize: number }>({
    queryKey: ["observability", "logs", "stats"],
    queryFn: async () => {
      const res = await authFetch("/api/observability/logs/stats");
      if (!res.ok) throw new Error("Failed to fetch log stats");
      return res.json();
    },
    refetchInterval: 10_000,
  });

  // SSE streaming mode
  useEffect(() => {
    if (!streamMode) {
      if (streamRef.current) {
        streamRef.current.close();
        streamRef.current = null;
      }
      return;
    }

    const categoryParam = categoryFilter !== "ALL" ? `&category=${categoryFilter}` : "";
    const severityParam = severityFilter !== "ALL" ? `&severity=${severityFilter}` : "";
    const es = new EventSource(`/api/observability/logs/stream${categoryParam}${severityParam}`);
    streamRef.current = es;

    es.onmessage = (event) => {
      try {
        const entry = JSON.parse(event.data);
        if (entry.type === "connected") return;
        setStreamLogs(prev => [entry, ...prev].slice(0, 500));
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      // Connection lost, will auto-reconnect
    };

    return () => {
      es.close();
    };
  }, [streamMode, categoryFilter, severityFilter]);

  const entries = data?.entries ?? [];
  const displayLogs = streamMode ? streamLogs : entries;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
            <FileText className="w-6 h-6 text-primary" />
            Logs Explorer
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {stats ? `${stats.bufferSize.toLocaleString()} buffered entries` : "Structured log viewer"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={streamMode ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setStreamMode(!streamMode);
              if (!streamMode) setStreamLogs([]);
            }}
            className="gap-1.5"
          >
            <Terminal className="w-4 h-4" />
            {streamMode ? "Streaming" : "Stream"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="glass-card">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              <Input
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search by correlation ID..."
                className="h-9 text-xs bg-muted/30 border-border/50 flex-1"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <select
                value={categoryFilter}
                onChange={e => { setCategoryFilter(e.target.value); setPage(1); }}
                className="h-9 px-3 text-xs bg-muted/30 border border-border/50 rounded-md text-foreground"
              >
                <option value="ALL">All Categories</option>
                {LOG_CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <select
              value={severityFilter}
              onChange={e => { setSeverityFilter(e.target.value); setPage(1); }}
              className="h-9 px-3 text-xs bg-muted/30 border border-border/50 rounded-md text-foreground"
            >
              <option value="ALL">All Severities</option>
              <option value="debug">Debug</option>
              <option value="info">Info</option>
              <option value="warn">Warning</option>
              <option value="error">Error</option>
              <option value="fatal">Fatal</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Log List */}
      <Card className="glass-card overflow-hidden">
        <div className="bg-muted/20 border-b border-border/30 px-4 py-2 flex items-center gap-3 text-[10px] text-muted-foreground font-mono">
          <span className="w-14">Time</span>
          <span className="w-16">Severity</span>
          <span className="w-20">Category</span>
          <span className="flex-1">Message</span>
          <span>Age</span>
        </div>
        {isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 rounded" />
            ))}
          </div>
        ) : displayLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <FileText className="w-12 h-12 mb-3 opacity-20" />
            <p className="text-sm font-medium">No log entries found</p>
            <p className="text-xs mt-1">Logs will appear as system components generate structured events.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/10">
            {displayLogs.map((entry, i) => (
              <LogRow key={`${entry.timestamp}-${i}`} entry={entry} isStream={streamMode} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {data && !streamMode && data.total > limit && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border/30">
            <span className="text-xs text-muted-foreground">
              Page {page} of {Math.ceil(data.total / limit)}
            </span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="h-7 text-xs">
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={page >= Math.ceil(data.total / limit)} onClick={() => setPage(p => p + 1)} className="h-7 text-xs">
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
