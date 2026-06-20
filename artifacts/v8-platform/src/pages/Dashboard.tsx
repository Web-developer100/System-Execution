import { useQuery } from "@tanstack/react-query";
import { useGetDashboardStats, useGetVulnerabilityStats, getGetDashboardStatsQueryKey } from "@workspace/api-client-react";
import { useI18n } from "@/lib/i18n";
import { useScanWs } from "@/hooks/use-scan-ws";
import { useEffect, useRef, useState } from "react";
import {
  Activity, Shield, AlertTriangle, Terminal, Globe, Cpu, Zap,
  Eye, Clock, MemoryStick, CheckCircle, XCircle, Wifi, WifiOff,
  TrendingUp, TrendingDown, Users, FileText, Bug, ArrowUpRight,
  Sparkles, Scan, Siren, type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface SystemMetrics {
  uptime: string;
  uptimeSeconds: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
  cpuUsage: number;
  nodeVersion: string;
  requestCount: number;
  workerCount: number;
  activeWorkers: number;
  queueSize: number;
}

interface ScanActivity {
  id: number;
  target: string;
  status: string;
  progress: number;
  vulnCount: number;
  timestamp: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "text-destructive",
  high: "text-orange-500",
  medium: "text-yellow-500",
  low: "text-blue-400",
  info: "text-muted-foreground",
};

const SEVERITY_BG: Record<string, string> = {
  critical: "bg-destructive",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-blue-400",
  info: "bg-muted",
};

function StatCard({ label, value, icon: Icon, href, color, trend, trendLabel, subtitle }: {
  label: string; value: number | string; icon: LucideIcon; href: string;
  color?: string; trend?: "up" | "down"; trendLabel?: string; subtitle?: string;
}) {
  return (
    <Link href={href}>
      <Card className="glass-card hover:border-primary/30 transition-all duration-200 cursor-pointer group relative overflow-hidden">
        <div className="absolute top-0 right-0 p-3 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity pointer-events-none">
          <Icon className="w-16 h-16" />
        </div>
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">{label}</p>
              <p className={`text-2xl font-bold ${color ?? "text-foreground"}`}>
                {typeof value === "number" ? value.toLocaleString() : value}
              </p>
              {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
            </div>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-primary/5 border border-border/50`}>
              <Icon className={`w-5 h-5 ${color ?? "text-primary"}`} />
            </div>
          </div>
          {trend && (
            <div className={`flex items-center gap-1 mt-2 text-xs ${trend === "up" ? "text-destructive" : "text-success"}`}>
              {trend === "up" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              <span>{trendLabel ?? ""}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

function SecurityScore({ score }: { score: number }) {
  const color = score >= 80 ? "text-success" : score >= 60 ? "text-warning" : "text-destructive";
  const ringColor = score >= 80 ? "stroke-success" : score >= 60 ? "stroke-warning" : "stroke-destructive";
  const circumference = 2 * Math.PI * 36;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-24">
        <svg className="w-24 h-24 -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="36" fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
          <circle cx="40" cy="40" r="36" fill="none" className={ringColor} strokeWidth="6"
            strokeDasharray={circumference} strokeDashoffset={offset}
            strokeLinecap="round" style={{ transition: "stroke-dashoffset 1s ease" }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-2xl font-bold ${color}`}>{score}</span>
        </div>
      </div>
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Security Score</div>
    </div>
  );
}

function VulnerabilityBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium uppercase tracking-wider">{label}</span>
        <span className="font-mono font-bold">{value}</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-1000 ${color}`}
          style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ActivityFeed() {
  const { connectionState, addListener } = useScanWs();
  const [activities, setActivities] = useState<ScanActivity[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = addListener("scan:log", (event) => {
      const data = event.data ?? {};
      setActivities(prev => {
        const entry: ScanActivity = {
          id: Date.now(),
          target: (data.target as string) ?? "unknown",
          status: (data.level as string) ?? "info",
          progress: (data.progress as number) ?? 0,
          vulnCount: (data.vulnCount as number) ?? 0,
          timestamp: new Date().toISOString(),
        };
        return [entry, ...prev].slice(0, 20);
      });
    });
    return () => unsub();
  }, [addListener]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [activities]);

  const isConnected = connectionState === "connected";

  return (
    <Card className="glass-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            Activity Feed
          </CardTitle>
          <div className="flex items-center gap-1.5">
            {isConnected ? (
              <Badge className="bg-success/10 text-success border-success/20 text-[10px] font-mono rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-success mr-1 animate-pulse" />
                LIVE
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground text-[10px] font-mono rounded-full">
                {connectionState === "connecting" ? "CONNECTING" : "OFFLINE"}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div ref={scrollRef} className="h-64 overflow-y-auto">
          {activities.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              {isConnected ? "Awaiting scan events..." : "Connecting to orchestrator..."}
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {activities.map(a => (
                <div key={a.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors">
                  <div className={`w-2 h-2 rounded-full ${a.status === "error" ? "bg-destructive" : a.status === "warn" ? "bg-warning" : "bg-primary"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs truncate">
                      {a.status === "error" ? "🚨" : a.status === "warn" ? "⚠️" : "ℹ️"} {a.target}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {a.status.toUpperCase()} · {a.progress}% · {a.vulnCount} vulns
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                    {formatTime(a.timestamp)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch { return "--:--:--"; }
}

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats({
    query: {
      queryKey: getGetDashboardStatsQueryKey(),
      refetchInterval: 15_000,
    },
  });
  const { data: vulnStats, isLoading: vulnLoading } = useGetVulnerabilityStats();
  const { t } = useI18n();

  const { data: sysMetrics } = useQuery<SystemMetrics>({
    queryKey: ["systemMetrics"],
    queryFn: async () => {
      const res = await fetch("/api/system/metrics");
      if (!res.ok) throw new Error("metrics fetch failed");
      return res.json();
    },
    refetchInterval: 10_000,
    staleTime: 5_000,
  });

  const totalVulns = vulnStats?.total ?? 0;
  const securityScore = Math.max(0, 100 - (
    (vulnStats?.critical ?? 0) * 8 +
    (vulnStats?.high ?? 0) * 4 +
    (vulnStats?.medium ?? 0) * 2
  ) / Math.max(totalVulns, 1) * 10);

  const memPct = sysMetrics ? Math.round((sysMetrics.memoryUsedMb / (sysMetrics.memoryTotalMb || 1)) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Command Center
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            V8 Neural Exploitation Platform · Security Operations Dashboard
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/scans">
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Zap className="w-4 h-4 mr-2" />
              New Scan
            </Button>
          </Link>
          <Link href="/reports">
            <Button variant="outline">
              <FileText className="w-4 h-4 mr-2" />
              Reports
            </Button>
          </Link>
        </div>
      </div>

      {/* Security Score + System Health */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <Card className="glass-card lg:col-span-1">
          <CardContent className="p-6 flex justify-center">
            <SecurityScore score={Math.round(securityScore)} />
          </CardContent>
        </Card>

        <div className="lg:col-span-3 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="glass-card p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/5 border border-border/50 flex items-center justify-center">
              <Clock className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Uptime</p>
              <p className="text-lg font-bold font-mono">{sysMetrics?.uptime ?? "00:00:00"}</p>
            </div>
          </div>
          <div className="glass-card p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-success/5 border border-success/20 flex items-center justify-center">
              <MemoryStick className="w-5 h-5 text-success" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Memory</p>
              <p className="text-lg font-bold font-mono">{sysMetrics?.memoryUsedMb ?? 0}MB</p>
              <div className="h-1 bg-muted rounded-full mt-1 overflow-hidden">
                <div className="h-full bg-success rounded-full transition-all" style={{ width: `${memPct}%` }} />
              </div>
            </div>
          </div>
          <div className="glass-card p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-warning/5 border border-warning/20 flex items-center justify-center">
              <Cpu className="w-5 h-5 text-warning" />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Workers</p>
              <p className="text-lg font-bold font-mono">{sysMetrics?.activeWorkers ?? 0}/{sysMetrics?.workerCount ?? 0}</p>
            </div>
          </div>
          <div className="glass-card p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-destructive/5 border border-destructive/20 flex items-center justify-center">
              <Siren className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Queue</p>
              <p className="text-lg font-bold font-mono">{sysMetrics?.queueSize ?? 0}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard label="Total Scans" value={stats?.totalScans ?? 0} icon={Shield} href="/scans" color="text-primary" />
        <StatCard label="Active" value={stats?.activeScans ?? 0} icon={Scan} href="/scans" color="text-success" />
        <StatCard label="Vulnerabilities" value={totalVulns} icon={Bug} href="/vulnerabilities" color="text-destructive" />
        <StatCard label="Critical" value={vulnStats?.critical ?? 0} icon={AlertTriangle} href="/vulnerabilities" color="text-destructive" />
        <StatCard label="High" value={vulnStats?.high ?? 0} icon={AlertTriangle} href="/vulnerabilities" color="text-orange-500" />
        <StatCard label="Medium" value={vulnStats?.medium ?? 0} icon={Bug} href="/vulnerabilities" color="text-yellow-500" />
      </div>

      {/* Vulnerability Breakdown + Activity + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Vuln Breakdown */}
        <Card className="glass-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              Vulnerability Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 px-4 pb-4">
            <VulnerabilityBar label="Critical" value={vulnStats?.critical ?? 0} total={totalVulns} color="bg-destructive" />
            <VulnerabilityBar label="High" value={vulnStats?.high ?? 0} total={totalVulns} color="bg-orange-500" />
            <VulnerabilityBar label="Medium" value={vulnStats?.medium ?? 0} total={totalVulns} color="bg-yellow-500" />
            <VulnerabilityBar label="Low" value={vulnStats?.low ?? 0} total={totalVulns} color="bg-blue-400" />
            <VulnerabilityBar label="Info" value={vulnStats?.info ?? 0} total={totalVulns} color="bg-muted" />
          </CardContent>
        </Card>

        {/* Activity Feed */}
        <ActivityFeed />

        {/* Quick Actions */}
        <Card className="glass-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Zap className="w-4 h-4 text-warning" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 space-y-1.5">
            {[
              { label: "New Scan", href: "/scans", icon: Shield, desc: "Launch a security scan" },
              { label: "Browse Vulnerabilities", href: "/vulnerabilities", icon: Bug, desc: "View and manage findings" },
              { label: "Generate Report", href: "/reports", icon: FileText, desc: "Export intelligence report" },
              { label: "Install Plugin", href: "/marketplace", icon: Zap, desc: "Extend capabilities" },
              { label: "View Settings", href: "/settings", icon: Activity, desc: "System configuration" },
            ].map(action => {
              const Icon = action.icon;
              return (
                <Link key={action.href} href={action.href}>
                  <div className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group">
                    <div className="w-8 h-8 rounded-lg bg-primary/5 border border-border/50 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium">{action.label}</div>
                      <div className="text-xs text-muted-foreground">{action.desc}</div>
                    </div>
                    <ArrowUpRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
