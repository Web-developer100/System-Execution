import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { authFetch } from "@/lib/auth-fetch";
import {
  Activity, Search, Filter, RefreshCw, ChevronDown, ChevronRight,
  Clock, CheckCircle, XCircle, AlertCircle, ArrowUpDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// ── Types ─────────────────────────────────────────────────────────────────

interface TraceSpan {
  spanId: string;
  traceId: string;
  parentSpanId: string | null;
  type: string;
  serviceName: string;
  operation: string;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  status: "ok" | "error" | "pending";
  error: string | null;
  tags: Record<string, string>;
  metadata: Record<string, unknown>;
}

interface Trace {
  traceId: string;
  rootSpanId: string;
  spans: TraceSpan[];
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  status: "ok" | "error" | "pending";
  rootService: string;
  rootOperation: string;
  spanCount: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function getStatusColor(status: string): string {
  switch (status) {
    case "ok": return "text-success";
    case "error": return "text-destructive";
    case "pending": return "text-warning";
    default: return "text-muted-foreground";
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case "ok": return <CheckCircle className="w-3.5 h-3.5 text-success" />;
    case "error": return <XCircle className="w-3.5 h-3.5 text-destructive" />;
    case "pending": return <AlertCircle className="w-3.5 h-3.5 text-warning" />;
    default: return <Clock className="w-3.5 h-3.5 text-muted-foreground" />;
  }
}

function getSpanTypeColor(type: string): string {
  if (type.startsWith("api:")) return "border-l-primary bg-primary/5";
  if (type.startsWith("db:")) return "border-l-emerald-500 bg-emerald-500/5";
  if (type.startsWith("queue:")) return "border-l-purple-500 bg-purple-500/5";
  if (type.startsWith("plugin:")) return "border-l-orange-500 bg-orange-500/5";
  if (type.startsWith("ai:")) return "border-l-cyan-500 bg-cyan-500/5";
  if (type.startsWith("worker:")) return "border-l-yellow-500 bg-yellow-500/5";
  if (type.startsWith("auth:")) return "border-l-blue-500 bg-blue-500/5";
  if (type.startsWith("scan:")) return "border-l-rose-500 bg-rose-500/5";
  if (type.startsWith("report:")) return "border-l-indigo-500 bg-indigo-500/5";
  if (type.startsWith("notification:")) return "border-l-pink-500 bg-pink-500/5";
  return "border-l-gray-500 bg-gray-500/5";
}

function getSpanTypeDot(type: string): string {
  if (type.startsWith("api:")) return "bg-primary";
  if (type.startsWith("db:")) return "bg-emerald-500";
  if (type.startsWith("queue:")) return "bg-purple-500";
  if (type.startsWith("plugin:")) return "bg-orange-500";
  if (type.startsWith("ai:")) return "bg-cyan-500";
  if (type.startsWith("worker:")) return "bg-yellow-500";
  if (type.startsWith("auth:")) return "bg-blue-500";
  if (type.startsWith("scan:")) return "bg-rose-500";
  if (type.startsWith("report:")) return "bg-indigo-500";
  if (type.startsWith("notification:")) return "bg-pink-500";
  return "bg-gray-500";
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`;
  if (ms < 1000) return `${ms.toFixed(1)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
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

function getDurationBar(durationMs: number, maxMs: number): string {
  const pct = maxMs > 0 ? (durationMs / maxMs) * 100 : 0;
  return `${Math.min(100, pct)}%`;
}

// ── Span Detail ────────────────────────────────────────────────────────────

function SpanRow({ span, depth, maxDuration }: { span: TraceSpan; depth: number; maxDuration: number }) {
  const [expanded, setExpanded] = useState(false);
  const typeColor = getSpanTypeColor(span.type);
  const dotColor = getSpanTypeDot(span.type);

  return (
    <div>
      <div
        className={`flex items-center gap-2 px-3 py-2 border-l-2 cursor-pointer hover:bg-muted/20 transition-colors text-xs ${typeColor}`}
        style={{ paddingLeft: `${12 + depth * 20}px` }}
        onClick={() => setExpanded(!expanded)}
      >
        <span className="shrink-0">{expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}</span>
        <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
        <span className="font-mono text-[10px] text-muted-foreground w-20 shrink-0">{span.type}</span>
        <span className="flex-1 truncate font-medium">{span.operation}</span>
        <span className="text-muted-foreground">{span.serviceName}</span>
        {/* Duration bar */}
        <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${span.status === "error" ? "bg-destructive" : span.status === "pending" ? "bg-warning" : "bg-primary"}`}
            style={{ width: getDurationBar(span.durationMs ?? 0, maxDuration) }}
          />
        </div>
        <span className="font-mono text-muted-foreground w-16 text-right">{formatDuration(span.durationMs)}</span>
        {getStatusIcon(span.status)}
      </div>
      {expanded && (
        <div className="ml-8 p-3 bg-black/30 border border-border/20 rounded-lg m-2 space-y-2 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Span Details</p>
              <div className="space-y-1 font-mono">
                <div><span className="text-muted-foreground">Span ID:</span> <span className="text-[9px]">{span.spanId}</span></div>
                <div><span className="text-muted-foreground">Trace ID:</span> <span className="text-[9px]">{span.traceId}</span></div>
                <div><span className="text-muted-foreground">Parent:</span> <span className="text-[9px]">{span.parentSpanId ?? "root"}</span></div>
                <div><span className="text-muted-foreground">Started:</span> {new Date(span.startedAt).toLocaleString()}</div>
                <div><span className="text-muted-foreground">Ended:</span> {span.endedAt ? new Date(span.endedAt).toLocaleString() : "—"}</div>
                <div><span className="text-muted-foreground">Duration:</span> {formatDuration(span.durationMs)}</div>
              </div>
            </div>
            {span.tags && Object.keys(span.tags).length > 0 && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Tags</p>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(span.tags).map(([k, v]) => (
                    <Badge key={k} variant="outline" className="text-[9px] font-mono">
                      {k}={v}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
          {span.error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded p-2">
              <p className="text-destructive font-semibold text-[10px] uppercase tracking-wider">Error</p>
              <p className="font-mono text-xs mt-1">{span.error}</p>
            </div>
          )}
          {span.metadata && Object.keys(span.metadata).length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Metadata</p>
              <pre className="bg-black border border-border/20 p-2 text-[9px] font-mono text-primary/70 overflow-x-auto max-h-32 overflow-y-auto">
                {JSON.stringify(span.metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Trace Card ─────────────────────────────────────────────────────────────

function TraceCard({ trace }: { trace: Trace }) {
  const [expanded, setExpanded] = useState(false);
  const maxDuration = Math.max(...trace.spans.map(s => s.durationMs ?? 0), 1);

  return (
    <Card className={`glass-card overflow-hidden transition-all duration-200 ${
      trace.status === "error" ? "border-destructive/30" :
      trace.status === "pending" ? "border-warning/30" : ""
    }`}>
      <CardContent className="p-0">
        <div
          className="p-4 cursor-pointer hover:bg-muted/10 transition-colors"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {getStatusIcon(trace.status)}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold truncate">{trace.rootOperation}</span>
                  <Badge variant="outline" className="text-[9px] font-mono">{trace.rootService}</Badge>
                </div>
                <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground font-mono">
                  <span>{trace.spanCount} spans</span>
                  <span>{formatDuration(trace.durationMs)}</span>
                  <span>{relativeTime(trace.startedAt)}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[9px] font-mono text-muted-foreground">{trace.traceId.slice(0, 8)}...</span>
              {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </div>
          </div>
        </div>

        {expanded && (
          <div className="border-t border-border/30">
            {/* Waterfall visualization */}
            <div className="px-2 py-1 bg-muted/10">
              <div className="flex items-center text-[9px] text-muted-foreground font-mono px-3 py-1">
                <span className="w-[calc(100%-8rem)]">Span</span>
                <span className="w-24 text-right">Duration</span>
              </div>
            </div>
            <div className="divide-y divide-border/10">
              {trace.spans.map(span => (
                <SpanRow key={span.spanId} span={span} depth={span.parentSpanId ? 1 : 0} maxDuration={maxDuration} />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────

export default function TracingExplorer() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [serviceFilter, setServiceFilter] = useState<string>("ALL");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");

  const params = new URLSearchParams();
  if (search) params.set("operation", search);
  if (statusFilter !== "ALL") params.set("status", statusFilter);
  if (serviceFilter !== "ALL") params.set("serviceName", serviceFilter);
  params.set("limit", "50");

  const { data, isLoading, refetch } = useQuery<{ total: number; traces: Trace[] }>({
    queryKey: ["observability", "tracing", search, statusFilter, serviceFilter],
    queryFn: async () => {
      const res = await authFetch(`/api/observability/tracing?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch traces");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const { data: stats } = useQuery({
    queryKey: ["observability", "tracing", "stats"],
    queryFn: async () => {
      const res = await authFetch("/api/observability/tracing/stats");
      if (!res.ok) throw new Error("Failed to fetch tracing stats");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const traces = data?.traces ?? [];
  const sorted = [...traces].sort((a, b) => {
    const dir = sortOrder === "desc" ? -1 : 1;
    return dir * (new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
            <Activity className="w-6 h-6 text-primary" />
            Distributed Tracing
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Full request lifecycle visualization across all services
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="glass-card">
          <CardContent className="p-3 flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Total Traces</p>
              <p className="text-lg font-bold font-mono">{stats?.totalTraces?.toLocaleString() ?? "—"}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-3 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-success" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">OK</p>
              <p className="text-lg font-bold font-mono text-success">{stats?.okTraces?.toLocaleString() ?? "—"}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-3 flex items-center gap-2">
            <XCircle className="w-4 h-4 text-destructive" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Errors</p>
              <p className="text-lg font-bold font-mono text-destructive">{stats?.errorTraces?.toLocaleString() ?? "—"}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-warning" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Avg Duration</p>
              <p className="text-lg font-bold font-mono">{stats?.avgDurationMs ? `${stats.avgDurationMs}ms` : "—"}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-3 flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Services</p>
              <p className="text-lg font-bold font-mono">{stats?.services?.length ?? "—"}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="glass-card">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Filter by operation..."
                className="h-9 text-xs bg-muted/30 border-border/50 flex-1"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="h-9 px-3 text-xs bg-muted/30 border border-border/50 rounded-md text-foreground"
              >
                <option value="ALL">All Status</option>
                <option value="ok">OK</option>
                <option value="error">Error</option>
                <option value="pending">Pending</option>
              </select>
            </div>
            <select
              value={serviceFilter}
              onChange={e => setServiceFilter(e.target.value)}
              className="h-9 px-3 text-xs bg-muted/30 border border-border/50 rounded-md text-foreground"
            >
              <option value="ALL">All Services</option>
              {stats?.services?.map((s: string) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSortOrder(s => s === "desc" ? "asc" : "desc")}
              className="gap-1"
            >
              <ArrowUpDown className="w-3 h-3" />
              {sortOrder === "desc" ? "Newest" : "Oldest"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Trace List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Activity className="w-12 h-12 mb-3 opacity-20" />
          <p className="text-sm font-medium">No traces found</p>
          <p className="text-xs mt-1">Traces appear automatically as API requests are processed.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map(trace => (
            <TraceCard key={trace.traceId} trace={trace} />
          ))}
        </div>
      )}
    </div>
  );
}
