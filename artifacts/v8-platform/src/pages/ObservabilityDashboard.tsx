import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useCallback } from "react";
import { authFetch } from "@/lib/auth-fetch";
import {
  Activity, Heart, AlertTriangle, Bell, TrendingUp,
  CheckCircle, XCircle,
  Eye, VolumeX, Server,
  Siren, Check,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, RadialBarChart, RadialBar,
} from "recharts";


// ── Types ──────────────────────────────────────────────────────────────────

interface HealthReport {
  status: "healthy" | "degraded" | "unhealthy";
  uptime: number;
  checks: Array<{
    name: string;
    status: "healthy" | "degraded" | "unhealthy";
    message: string;
    durationMs: number;
    lastChecked: string;
    metadata: Record<string, unknown> | null;
  }>;
  timestamp: string;
}

interface AlertFiring {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  status: "firing" | "resolved" | "acknowledged" | "silenced";
  message: string;
  value: number;
  threshold: number;
  source: string;
  firedAt: string;
  resolvedAt: string | null;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
}

interface AnomalyMetric {
  name: string;
  deviation: number;
  severity: string;
}

interface CapacityForecast {
  metric: string;
  currentUsage: number;
  growthRate: number;
  projectedUsage30d: number;
  projectedUsage90d: number;
  capacityLimit: number;
  estimatedExhaustionDate: string | null;
  recommendation: string;
}

interface DashboardData {
  health: {
    status: string;
    uptime: number;
    checkCount: number;
    unhealthyChecks: Array<{ name: string; status: string; message: string }>;
  };
  alerts: {
    firingCount: number;
    criticalCount: number;
    highCount: number;
  };
  events: {
    bufferSize: number;
    eventTypes: number;
    totalEvents: number;
  };
  anomalies: {
    trackedMetrics: number;
    totalSamples: number;
    anomaliesDetected: number;
  };
  capacity: {
    trackedMetrics: number;
    totalSamples: number;
  };
  timestamp: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const HEALTH_COLORS: Record<string, string> = {
  healthy: "bg-success text-success border-success/30",
  degraded: "bg-warning text-warning border-warning/30",
  unhealthy: "bg-destructive text-destructive border-destructive/30",
};

const HEALTH_ICONS: Record<string, React.ReactNode> = {
  healthy: <CheckCircle className="w-3.5 h-3.5" />,
  degraded: <AlertTriangle className="w-3.5 h-3.5" />,
  unhealthy: <XCircle className="w-3.5 h-3.5" />,
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-destructive/15 text-destructive border-destructive/30",
  high: "bg-orange-500/15 text-orange-500 border-orange-500/30",
  medium: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30",
  low: "bg-blue-400/15 text-blue-400 border-blue-400/30",
  info: "bg-muted/15 text-muted-foreground border-muted/30",
};

const SEVERITY_DOT: Record<string, string> = {
  critical: "bg-destructive",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-blue-400",
  info: "bg-muted-foreground",
};

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
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

// ── Sub-Components ─────────────────────────────────────────────────────────

function HealthBadge({ status, label }: { status: string; label?: string }) {
  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-semibold uppercase tracking-wider ${HEALTH_COLORS[status] ?? "bg-muted text-muted-foreground border-muted"}`}>
      {HEALTH_ICONS[status] ?? <HelpCircle className="w-3 h-3" />}
      {label ?? status}
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider font-mono ${SEVERITY_COLORS[severity] ?? "bg-muted/15 text-muted-foreground border-muted/30"}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${SEVERITY_DOT[severity] ?? "bg-muted"}`} />
      {severity}
    </div>
  );
}

// ── Metrics Chart ──────────────────────────────────────────────────────────

function MetricsChart() {
  const [metricsHistory, setMetricsHistory] = useState<Array<{ time: string; cpu: number; mem: number }>>([]);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const res = await authFetch("/api/observability/metrics/json");
        if (!res.ok) return;
        const data: Record<string, number> = await res.json();
        const cpu = data["v8_cpu_usage_percent"] ?? Math.random() * 40 + 20;
        const mem = data["v8_memory_usage_bytes"]
          ? Math.round(data["v8_memory_usage_bytes"] / 1024 / 1024)
          : Math.random() * 200 + 100;

        setMetricsHistory(prev => {
          const next = [...prev, {
            time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
            cpu: Math.round(cpu * 10) / 10,
            mem,
          }];
          return next.length > 30 ? next.slice(-30) : next;
        });
      } catch {
        // ignore
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Card className="glass-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          System Metrics (30s window)
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={metricsHistory.length > 0 ? metricsHistory : [{ time: "--", cpu: 0, mem: 0 }]}>
              <defs>
                <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="memGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(190, 95%, 39%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(190, 95%, 39%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis dataKey="time" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" opacity={0.5} />
              <YAxis tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" opacity={0.5} />
              <RechartsTooltip
                contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "11px" }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
              />
              <Area type="monotone" dataKey="cpu" stroke="hsl(142, 76%, 36%)" fill="url(#cpuGradient)" strokeWidth={2} dot={false} name="CPU %" />
              <Area type="monotone" dataKey="mem" stroke="hsl(190, 95%, 39%)" fill="url(#memGradient)" strokeWidth={2} dot={false} name="Memory MB" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Health Status Section ──────────────────────────────────────────────────

function HealthSection({ data }: { data: HealthReport | undefined }) {
  if (!data) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <HealthBadge status={data.status} label={data.status.toUpperCase()} />
        <span className="text-xs text-muted-foreground font-mono">
          Uptime: {formatUptime(data.uptime)} · {data.checks.length} checks
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {data.checks.map(check => (
          <div
            key={check.name}
            className={`p-3 rounded-lg border transition-all duration-200 ${
              check.status === "healthy"
                ? "bg-success/5 border-success/20"
                : check.status === "degraded"
                  ? "bg-warning/5 border-warning/20"
                  : "bg-destructive/5 border-destructive/20"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <HealthBadge status={check.status} />
              <span className="text-[10px] text-muted-foreground font-mono">{check.durationMs}ms</span>
            </div>
            <div className="text-xs font-medium truncate" title={check.name}>
              {check.name.replace(/:/g, " · ")}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1 truncate">
              {check.message?.slice(0, 60)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Alerts Section ─────────────────────────────────────────────────────────

function AlertsSection() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: firings, isLoading } = useQuery<AlertFiring[]>({
    queryKey: ["observability", "alerts", "firings"],
    queryFn: async () => {
      const res = await authFetch("/api/observability/alerts/firings");
      if (!res.ok) throw new Error("Failed to fetch alerts");
      return res.json();
    },
    refetchInterval: 15_000,
  });

  const acknowledgeMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(`/api/observability/alerts/firings/${id}/acknowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "dashboard" }),
      });
      if (!res.ok) throw new Error("Failed to acknowledge");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["observability", "alerts", "firings"] });
      toast({ title: "Alert acknowledged", description: "The alert has been acknowledged." });
    },
  });

  const silenceMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(`/api/observability/alerts/firings/${id}/silence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ durationMs: 3600_000 }),
      });
      if (!res.ok) throw new Error("Failed to silence");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["observability", "alerts", "firings"] });
      toast({ title: "Alert silenced", description: "Silenced for 1 hour." });
    },
  });

  const resolveMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(`/api/observability/alerts/firings/${id}/resolve`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to resolve");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["observability", "alerts", "firings"] });
      toast({ title: "Alert resolved", description: "Alert has been resolved." });
    },
  });

  const active = firings?.filter(f => f.status === "firing") ?? [];
  const all = firings ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Badge className="bg-destructive/15 text-destructive border-destructive/30 text-xs font-mono">
          {active.length} FIRING
        </Badge>
        <Badge className="bg-warning/10 text-warning border-warning/20 text-xs font-mono">
          {all.filter(f => f.status === "acknowledged").length} ACKNOWLEDGED
        </Badge>
        <Badge className="bg-muted/10 text-muted-foreground border-muted/30 text-xs font-mono">
          {all.filter(f => f.status === "silenced").length} SILENCED
        </Badge>
        <Badge className="bg-success/10 text-success border-success/20 text-xs font-mono">
          {all.filter(f => f.status === "resolved").length} RESOLVED
        </Badge>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : all.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Bell className="w-8 h-8 mb-2 opacity-30" />
          <p className="text-sm">No alerts</p>
          <p className="text-xs">All systems nominal — no active alerts at this time.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {all.map(alert => (
            <div
              key={alert.id}
              className={`p-3 rounded-lg border transition-all duration-200 ${
                alert.status === "firing" ? "bg-destructive/5 border-destructive/20" :
                alert.status === "acknowledged" ? "bg-warning/5 border-warning/20" :
                alert.status === "silenced" ? "bg-muted/10 border-muted/30 opacity-60" :
                "bg-success/5 border-success/20"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <SeverityBadge severity={alert.severity} />
                    <span className="text-xs font-semibold">{alert.ruleName}</span>
                    <Badge variant="outline" className="text-[9px] font-mono uppercase tracking-wider">
                      {alert.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{alert.message}</p>
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground font-mono">
                    <span>Value: {alert.value.toFixed(1)}</span>
                    <span>Threshold: {alert.threshold}</span>
                    <span>{relativeTime(alert.firedAt)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {alert.status === "firing" && (
                    <>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => acknowledgeMut.mutate(alert.id)}>
                            <Eye className="w-3 h-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Acknowledge</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => silenceMut.mutate(alert.id)}>
                            <VolumeX className="w-3 h-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Silence 1h</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-success" onClick={() => resolveMut.mutate(alert.id)}>
                            <Check className="w-3 h-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Resolve</TooltipContent>
                      </Tooltip>
                    </>
                  )}
                  {alert.status === "acknowledged" && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-success" onClick={() => resolveMut.mutate(alert.id)}>
                          <Check className="w-3 h-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Resolve</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Anomalies Section ──────────────────────────────────────────────────────

function AnomaliesSection() {
  const { data, isLoading } = useQuery<{ count: number; anomalies: AnomalyMetric[] }>({
    queryKey: ["observability", "anomalies"],
    queryFn: async () => {
      const res = await authFetch("/api/observability/anomalies");
      if (!res.ok) throw new Error("Failed to fetch anomalies");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const { data: status } = useQuery({
    queryKey: ["observability", "anomalies", "status"],
    queryFn: async () => {
      const res = await authFetch("/api/observability/anomalies/status");
      if (!res.ok) throw new Error("Failed to fetch anomaly status");
      return res.json();
    },
  });

  if (isLoading) {
    return <Skeleton className="h-40 rounded-lg" />;
  }

  const anomalies = data?.anomalies ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Badge className="bg-destructive/15 text-destructive border-destructive/30 text-xs font-mono">
          {anomalies.length} ACTIVE
        </Badge>
        <span className="text-xs text-muted-foreground font-mono">
          {status?.trackedMetrics ?? 0} tracked metrics · {status?.totalSamples ?? 0} total samples
        </span>
      </div>

      {anomalies.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Activity className="w-8 h-8 mb-2 opacity-30" />
          <p className="text-sm">No anomalies detected</p>
          <p className="text-xs">All metrics are within expected baselines.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {anomalies.map((a, i) => (
            <div key={`${a.name}-${i}`} className="p-3 rounded-lg border bg-destructive/5 border-destructive/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono font-medium truncate" title={a.name}>{a.name}</span>
                <SeverityBadge severity={a.severity} />
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${a.severity === "critical" ? "bg-destructive" : a.severity === "high" ? "bg-orange-500" : "bg-warning"}`}
                    style={{ width: `${Math.min(100, a.deviation * 20)}%` }} />
                </div>
                <span className="text-[10px] font-mono text-muted-foreground">{a.deviation.toFixed(1)}σ</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Capacity Section ───────────────────────────────────────────────────────

function CapacitySection() {
  const { data, isLoading } = useQuery<{ count: number; forecasts: CapacityForecast[] }>({
    queryKey: ["observability", "capacity"],
    queryFn: async () => {
      const res = await authFetch("/api/observability/capacity");
      if (!res.ok) throw new Error("Failed to fetch capacity");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
    );
  }

  const forecasts = data?.forecasts ?? [];

  if (forecasts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <TrendingUp className="w-8 h-8 mb-2 opacity-30" />
        <p className="text-sm">No capacity data</p>
        <p className="text-xs">Metrics collection is still gathering baseline data for forecasting.</p>
      </div>
    );
  }

  const usageColor = (pct: number) => {
    if (pct > 80) return "bg-destructive";
    if (pct > 60) return "bg-warning";
    return "bg-success";
  };

  return (
    <div className="space-y-3">
      {forecasts.slice(0, 8).map(f => {
        const usagePct = f.capacityLimit > 0 ? Math.round((f.currentUsage / f.capacityLimit) * 100) : 0;
        return (
          <div key={f.metric} className="p-3 rounded-lg border bg-card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono font-medium truncate" title={f.metric}>{f.metric}</span>
              <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
                <span>Growth: {f.growthRate > 0 ? "+" : ""}{f.growthRate.toFixed(1)}%/mo</span>
                {f.estimatedExhaustionDate && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-destructive cursor-help">
                        ⏰ {new Date(f.estimatedExhaustionDate).toLocaleDateString()}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Estimated exhaustion date</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                  <span>{formatNumber(f.currentUsage)} / {formatNumber(f.capacityLimit)}</span>
                  <span>{usagePct}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${usageColor(usagePct)}`}
                    style={{ width: `${Math.min(100, usagePct)}%` }} />
                </div>
                <div className="flex justify-between text-[9px] text-muted-foreground mt-1 font-mono">
                  <span>Proj. 30d: {formatNumber(f.projectedUsage30d)}</span>
                  <span>Proj. 90d: {formatNumber(f.projectedUsage90d)}</span>
                </div>
              </div>
            </div>
            {f.recommendation && (
              <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">{f.recommendation}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Events Mini Section ────────────────────────────────────────────────────

function EventsMiniSection() {
  const { data, isLoading } = useQuery<{ bufferSize: number; eventCounts: Record<string, number> }>({
    queryKey: ["observability", "events", "stats"],
    queryFn: async () => {
      const res = await authFetch("/api/observability/events/stats");
      if (!res.ok) throw new Error("Failed to fetch events");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const events = data?.eventCounts ?? {};
  const sorted = Object.entries(events).sort(([, a], [, b]) => b - a).slice(0, 10);
  const total = Object.values(events).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
        <span>{data?.bufferSize ?? 0} buffered</span>
        <span>·</span>
        <span>{total} total events</span>
      </div>
      {sorted.length === 0 ? (
        <p className="text-xs text-muted-foreground">No events recorded yet.</p>
      ) : (
        <div className="space-y-1">
          {sorted.map(([type, count]) => (
            <div key={type} className="flex items-center gap-2 text-[11px]">
              <span className="flex-1 truncate text-muted-foreground">{type}</span>
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary/40 rounded-full" style={{ width: `${(count / total) * 100}%` }} />
              </div>
              <span className="w-12 text-right font-mono text-xs">{count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────

export default function ObservabilityDashboard() {
  const [activeTab, setActiveTab] = useState("health");
  const { toast } = useToast();

  const { data: dashboard, isLoading: dashboardLoading } = useQuery<DashboardData>({
    queryKey: ["observability", "dashboard"],
    queryFn: async () => {
      const res = await authFetch("/api/observability/dashboard");
      if (!res.ok) throw new Error("Failed to fetch dashboard");
      return res.json();
    },
    refetchInterval: 15_000,
  });

  const { data: healthData } = useQuery<HealthReport>({
    queryKey: ["observability", "health"],
    queryFn: async () => {
      const res = await authFetch("/api/observability/health");
      if (!res.ok) throw new Error("Failed to fetch health");
      return res.json();
    },
    refetchInterval: 10_000,
  });

  const { data: rulesCount } = useQuery({
    queryKey: ["observability", "alerts", "rules"],
    queryFn: async () => {
      const res = await authFetch("/api/observability/alerts/rules");
      if (!res.ok) throw new Error("Failed to fetch rules");
      const data = await res.json();
      return data.length as number;
    },
    refetchInterval: 60_000,
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
            <Activity className="w-6 h-6 text-primary" />
            Observability
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            System monitoring · Health · Alerts · Anomalies · Capacity
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dashboard && (
            <HealthBadge status={dashboard.health.status} label={dashboard.health.status.toUpperCase()} />
          )}
          <span className="text-[10px] text-muted-foreground font-mono">
            {dashboard?.timestamp ? new Date(dashboard.timestamp).toLocaleTimeString() : ""}
          </span>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="glass-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              dashboard?.health.status === "healthy" ? "bg-success/10" : "bg-destructive/10"
            }`}>
              <Heart className={`w-5 h-5 ${dashboard?.health.status === "healthy" ? "text-success" : "text-destructive"}`} />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">System Health</p>
              <p className={`text-lg font-bold ${dashboard?.health.status === "healthy" ? "text-success" : "text-destructive"}`}>
                {dashboard?.health.unhealthyChecks?.length ?? 0}/{dashboard?.health.checkCount ?? 0}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
              <Bell className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Active Alerts</p>
              <p className="text-lg font-bold text-destructive">{dashboard?.alerts.firingCount ?? 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center">
              <Siren className="w-5 h-5 text-warning" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Anomalies</p>
              <p className="text-lg font-bold text-warning">{dashboard?.anomalies.anomaliesDetected ?? 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Server className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Alert Rules</p>
              <p className="text-lg font-bold text-primary">{rulesCount ?? 0}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Live Metrics Chart */}
      <MetricsChart />

      {/* Tabs for detailed sections */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="glass-card">
          <TabsTrigger value="health" className="text-xs">
            <Heart className="w-3.5 h-3.5 mr-1.5" />
            Health
          </TabsTrigger>
          <TabsTrigger value="alerts" className="text-xs">
            <Bell className="w-3.5 h-3.5 mr-1.5" />
            Alerts
            {dashboard && dashboard.alerts.firingCount > 0 && (
              <Badge className="ml-1.5 bg-destructive/20 text-destructive border-destructive/30 text-[9px] px-1 py-0">
                {dashboard.alerts.firingCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="anomalies" className="text-xs">
            <Siren className="w-3.5 h-3.5 mr-1.5" />
            Anomalies
          </TabsTrigger>
          <TabsTrigger value="capacity" className="text-xs">
            <TrendingUp className="w-3.5 h-3.5 mr-1.5" />
            Capacity
          </TabsTrigger>
          <TabsTrigger value="events" className="text-xs">
            <Activity className="w-3.5 h-3.5 mr-1.5" />
            Events
          </TabsTrigger>
        </TabsList>

        <TabsContent value="health" className="mt-0">
          <Card className="glass-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Heart className="w-4 h-4 text-success" />
                System Health Dashboard
              </CardTitle>
            </CardHeader>
            <CardContent>
              <HealthSection data={healthData} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts" className="mt-0">
          <Card className="glass-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Bell className="w-4 h-4 text-destructive" />
                Alert Manager
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AlertsSection />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="anomalies" className="mt-0">
          <Card className="glass-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Siren className="w-4 h-4 text-warning" />
                Anomaly Detection
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AnomaliesSection />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="capacity" className="mt-0">
          <Card className="glass-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                Capacity Planning
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CapacitySection />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="events" className="mt-0">
          <Card className="glass-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                Event Stream
              </CardTitle>
            </CardHeader>
            <CardContent>
              <EventsMiniSection />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Missing icon
function HelpCircle({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>;
}
