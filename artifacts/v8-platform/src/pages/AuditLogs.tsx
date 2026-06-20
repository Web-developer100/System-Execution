import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { authFetch } from "@/lib/auth-fetch";import { BookOpen, Shield, Search, Filter, ChevronDown, ChevronUp,
  RefreshCw, AlertTriangle, CheckCircle, XCircle, Clock,
  User, ArrowUpDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// ── Types ─────────────────────────────────────────────────────────────────

interface AuditLogEntry {
  id: number;
  userId: number | null;
  username: string | null;
  method: string;
  path: string;
  statusCode: number;
  action: string;
  ip: string | null;
  userAgent: string | null;
  durationMs: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface AuditLogResponse {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  logs: AuditLogEntry[];
}

interface AuditStats {
  totalLogs: number;
  recentCount: number;
  errorCount: number;
  errorRate: number;
  topActions: Array<{ action: string; count: number }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function getMethodColor(method: string): string {
  switch (method.toUpperCase()) {
    case "GET":    return "text-success border-success/30 bg-success/5";
    case "POST":   return "text-primary border-primary/30 bg-primary/5";
    case "PUT":    return "text-warning border-warning/30 bg-warning/5";
    case "DELETE": return "text-destructive border-destructive/30 bg-destructive/5";
    default:       return "text-muted-foreground border-border/30 bg-muted/5";
  }
}

function getStatusColor(code: number): string {
  if (code >= 200 && code < 300) return "text-success";
  if (code >= 300 && code < 400) return "text-primary";
  if (code >= 400 && code < 500) return "text-warning";
  if (code >= 500) return "text-destructive";
  return "text-muted-foreground";
}

function getActionIcon(action: string) {
  const lower = action.toLowerCase();
  if (lower.includes("create") || lower.includes("add") || lower.includes("install")) return CheckCircle;
  if (lower.includes("delete") || lower.includes("remove") || lower.includes("stop")) return XCircle;
  if (lower.includes("update") || lower.includes("change") || lower.includes("edit")) return RefreshCw;
  if (lower.includes("login") || lower.includes("auth")) return Shield;
  if (lower.includes("error") || lower.includes("fail")) return AlertTriangle;
  return Clock;
}

function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

// ── Page Component ────────────────────────────────────────────────────────

export default function AuditLogs() {
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Build query params
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  if (search) params.set("action", search);
  if (methodFilter !== "ALL") params.set("method", methodFilter);
  if (statusFilter !== "ALL") params.set("statusCode", statusFilter);

  // Fetch audit logs
  const { data: auditData, isLoading, refetch } = useQuery<AuditLogResponse>({
    queryKey: ["auditLogs", page, limit, search, methodFilter, statusFilter],
    queryFn: async () => {
      const res = await authFetch(`/api/audit?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch audit logs");
      return res.json();
    },
    refetchInterval: 15_000,
  });

  // Fetch audit stats
  const { data: stats } = useQuery<AuditStats>({
    queryKey: ["auditStats"],
    queryFn: async () => {
      const res = await authFetch("/api/audit/stats");
      if (!res.ok) throw new Error("Failed to fetch audit stats");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  // Sort logs by date
  const logs = auditData?.logs ?? [];
  const sortedLogs = [...logs].sort((a, b) => {
    const dir = sortOrder === "desc" ? -1 : 1;
    return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-primary/20 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
            <BookOpen className="w-6 h-6 text-primary" />
            Audit Log
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Immutable action trail — SOC2 / ISO 27001 compliance ready
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Refresh
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="glass-card">
          <CardContent className="p-3 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Total Events</p>
              <p className="text-lg font-bold font-mono">{stats?.totalLogs?.toLocaleString() ?? "—"}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-success" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Last 24h</p>
              <p className="text-lg font-bold font-mono">{stats?.recentCount?.toLocaleString() ?? "—"}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Errors</p>
              <p className="text-lg font-bold font-mono">{stats?.errorCount?.toLocaleString() ?? "—"}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-3 flex items-center gap-2">
            <Shield className="w-4 h-4 text-warning" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Error Rate</p>
              <p className="text-lg font-bold font-mono">{stats?.errorRate ?? 0}%</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-3 flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-primary" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Top Action</p>
              <p className="text-sm font-bold font-mono truncate">{stats?.topActions?.[0]?.action ?? "—"}</p>
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
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="Filter by action type..."
                className="h-9 text-xs bg-muted/30 border-border/50 flex-1"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <select
                value={methodFilter}
                onChange={e => { setMethodFilter(e.target.value); setPage(1); }}
                className="h-9 px-3 text-xs bg-muted/30 border border-border/50 rounded-md text-foreground"
              >
                <option value="ALL">All Methods</option>
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="DELETE">DELETE</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                className="h-9 px-3 text-xs bg-muted/30 border border-border/50 rounded-md text-foreground"
              >
                <option value="ALL">All Status</option>
                <option value="200">2xx Success</option>
                <option value="400">4xx Client Error</option>
                <option value="500">5xx Server Error</option>
              </select>
            </div>

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

      {/* Audit Log Table */}
      <Card className="glass-card overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/30 border-b border-border/50">
            <TableRow className="hover:bg-transparent border-none">
              <TableHead className="text-[10px] uppercase tracking-wider w-16">Time</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider w-40">Action</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider w-16">Method</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider w-16">Status</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">Path</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider w-24">User</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider w-20">Duration</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider w-20">IP</TableHead>
              <TableHead className="w-8"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-12 animate-pulse">
                  Loading audit trail...
                </TableCell>
              </TableRow>
            ) : sortedLogs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-12">
                  No audit log entries found
                </TableCell>
              </TableRow>
            ) : (
              sortedLogs.map((log) => {
                const ActionIcon = getActionIcon(log.action);
                const isExpanded = expandedId === log.id;
                return (
                  <>
                    <TableRow
                      key={log.id}
                      className="border-b border-border/10 hover:bg-muted/20 cursor-pointer text-xs"
                      onClick={() => setExpandedId(isExpanded ? null : log.id)}
                    >
                      <TableCell className="font-mono text-muted-foreground">
                        {new Date(log.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <ActionIcon className={`w-3 h-3 shrink-0 ${log.statusCode >= 400 ? "text-destructive" : "text-primary"}`} />
                          <span className="truncate max-w-[140px]">{log.action}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`rounded-sm text-[9px] font-mono ${getMethodColor(log.method)}`}>
                          {log.method}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className={`font-mono font-bold ${getStatusColor(log.statusCode)}`}>
                          {log.statusCode}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-muted-foreground max-w-[200px] truncate">
                        {log.path}
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3 text-muted-foreground" />
                          {log.username ?? "system"}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-muted-foreground">
                        {formatDuration(log.durationMs)}
                      </TableCell>
                      <TableCell className="font-mono text-muted-foreground text-[10px]">
                        {log.ip ?? "—"}
                      </TableCell>
                      <TableCell>
                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow key={`${log.id}-detail`} className="hover:bg-transparent border-b border-border/10">
                        <TableCell colSpan={9} className="p-4 bg-black/30">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                            <div>
                              <p className="text-muted-foreground uppercase tracking-wider text-[10px] mb-1">Request Details</p>
                              <div className="space-y-1 font-mono">
                                <div><span className="text-muted-foreground">Method:</span> {log.method}</div>
                                <div><span className="text-muted-foreground">Path:</span> {log.path}</div>
                                <div><span className="text-muted-foreground">Status:</span> {log.statusCode}</div>
                                <div><span className="text-muted-foreground">Duration:</span> {formatDuration(log.durationMs)}</div>
                              </div>
                            </div>
                            <div>
                              <p className="text-muted-foreground uppercase tracking-wider text-[10px] mb-1">Client Info</p>
                              <div className="space-y-1 font-mono">
                                <div><span className="text-muted-foreground">Username:</span> {log.username ?? "—"}</div>
                                <div><span className="text-muted-foreground">IP:</span> {log.ip ?? "—"}</div>
                                <div><span className="text-muted-foreground">User Agent:</span> <span className="text-[9px] break-all">{log.userAgent ?? "—"}</span></div>
                              </div>
                            </div>
                          </div>
                          {log.metadata && (
                            <div className="mt-3">
                              <p className="text-muted-foreground uppercase tracking-wider text-[10px] mb-1">Metadata</p>
                              <pre className="bg-black border border-border/30 p-2 text-[10px] font-mono text-primary/70 overflow-x-auto">
                                {JSON.stringify(log.metadata, null, 2)}
                              </pre>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        {auditData && auditData.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border/30">
            <span className="text-xs text-muted-foreground">
              Showing {(page - 1) * limit + 1}–{Math.min(page * limit, auditData.total)} of {auditData.total}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="h-7 text-xs"
              >
                Previous
              </Button>
              {Array.from({ length: Math.min(5, auditData.totalPages) }, (_, i) => {
                const start = Math.max(1, page - 2);
                const p = start + i;
                if (p > auditData.totalPages) return null;
                return (
                  <Button
                    key={p}
                    variant={p === page ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPage(p)}
                    className="h-7 w-7 p-0 text-xs"
                  >
                    {p}
                  </Button>
                );
              })}
              <Button
                variant="outline"
                size="sm"
                disabled={page >= auditData.totalPages}
                onClick={() => setPage(p => p + 1)}
                className="h-7 text-xs"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
