import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useGetDashboardStats, useGetVulnerabilityStats, getGetDashboardStatsQueryKey } from "@workspace/api-client-react";
import { useI18n } from "@/lib/i18n";
import { Activity, Shield, AlertTriangle, Terminal, Globe, Cpu, Zap, Eye, Clock, MemoryStick, CheckCircle, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

const LOG_TEMPLATES = [
  { msg: "[V8-KERNEL] UPLINK_SYNC ........ STABLE_V2", color: "text-primary" },
  { msg: "[OK] TARGET_ENTROPY_LOG connected — session active", color: "text-green-400" },
  { msg: "[WARN] SIGNAL_TPS: 15.2k — threshold approaching 80%", color: "text-yellow-400" },
  { msg: "[INFO] SUBFINDER: Enumerating subdomains via passive DNS", color: "text-primary" },
  { msg: "[OK] PROXY_NODE_A routing enabled — 47ms latency", color: "text-green-400" },
  { msg: "[WARN] PACKET_LOSS detected at node 0x7A — rerouting", color: "text-yellow-400" },
  { msg: "[INFO] NEURAL_NET recalibrating weights — epoch 3/5", color: "text-primary" },
  { msg: "[OK] AES-256 handshake confirmed — channel encrypted", color: "text-green-400" },
  { msg: "[INFO] THREAD_POOL: 3 workers spawned, 1 idle", color: "text-primary" },
  { msg: "[OK] FFUF: 4712 paths queued for directory brute-force", color: "text-green-400" },
  { msg: "[ERROR] ENCRYPTED_NODE 0x9F — access denied, rotating proxy", color: "text-destructive" },
  { msg: "[INFO] AI_LAYER validating findings — filtering false positives", color: "text-primary" },
  { msg: "[OK] CVE-2024-27198 template matched — JetBrains confirmed", color: "text-green-400" },
  { msg: "[INFO] DNS_ENUM: 87 subdomains discovered for target domain", color: "text-primary" },
  { msg: "[WARN] NAABU: Port 3306 (MySQL) exposed on 0.0.0.0", color: "text-yellow-400" },
  { msg: "[OK] NUCLEI: 14,823 CVE templates loaded and ready", color: "text-green-400" },
  { msg: "[INFO] TRIVY: Scanning node_modules for CVE dependencies", color: "text-primary" },
  { msg: "[WARN] /.env → HTTP 200 [4.3KB] — credentials exposed!", color: "text-destructive" },
  { msg: "[INFO] SEMGREP: Analyzing JavaScript patterns for SAST", color: "text-primary" },
  { msg: "[OK] SUBZY: No subdomain takeover vectors detected", color: "text-green-400" },
  { msg: "[INFO] REPORT_GEN: Compiling executive summary PDF", color: "text-primary" },
  { msg: "[OK] SCAN_COMPLETE: 6 findings confirmed, 2 filtered", color: "text-green-400" },
];

interface SystemMetrics {
  uptime: string;
  uptimeSeconds: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
  nodeVersion: string;
  requestCount: number;
}

function LiveTerminal() {
  const { t } = useI18n();
  const [logs, setLogs] = useState<Array<{ ts: string; msg: string; color: string }>>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      const tpl = LOG_TEMPLATES[Math.floor(Math.random() * LOG_TEMPLATES.length)];
      const ts = new Date().toISOString().substring(11, 19);
      setLogs(prev => {
        const updated = [...prev, { ts, ...tpl }];
        return updated.length > 28 ? updated.slice(-28) : updated;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <Card className="col-span-1 md:col-span-2 lg:col-span-3 bg-black border-primary/20 glow-box">
      <CardHeader className="border-b border-primary/20 pb-3 pt-4 px-5">
        <CardTitle className="text-primary flex items-center gap-2 glow-text text-sm uppercase tracking-widest">
          <Terminal className="w-4 h-4" />
          {t('dashboard.live_feed')}
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse ml-auto" />
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div ref={scrollRef} className="h-52 bg-black p-4 overflow-y-auto font-mono text-xs space-y-0.5 scrollbar-thin">
          {logs.map((log, i) => (
            <div key={i} className={`${log.color} leading-5`}>
              <span className="text-primary/30 mr-2">{log.ts}</span>
              {log.msg}
            </div>
          ))}
          <div className="w-2 h-3 bg-primary cursor-blink inline-block" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data: stats, isLoading } = useGetDashboardStats({
    query: {
      queryKey: getGetDashboardStatsQueryKey(),
      refetchInterval: 15_000,
    }
  });
  const { data: vulnStats } = useGetVulnerabilityStats();
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

  const statCards = [
    { label: t('dashboard.total_scans'), value: stats?.totalScans ?? 0, icon: Activity, color: "text-primary", href: "/scans" },
    { label: t('dashboard.active_scans'), value: stats?.activeScans ?? 0, icon: Shield, color: "text-primary", href: "/scans" },
    { label: t('dashboard.total_vulns'), value: stats?.totalVulns ?? 0, icon: AlertTriangle, color: "text-destructive", href: "/vulnerabilities" },
    { label: t('dashboard.proxy_pool'), value: stats?.proxyPoolSize ?? 0, icon: Globe, color: "text-primary", href: "/proxies" },
    { label: t('dashboard.tools_active'), value: stats?.toolsActive ?? 0, icon: Terminal, color: "text-primary", href: "/tools" },
    { label: t('dashboard.threads'), value: stats?.threadsRunning ?? 0, icon: Cpu, color: "text-primary", href: "/scans" },
  ];

  const severityData = [
    { label: "CRITICAL", value: vulnStats?.critical ?? 0, color: "bg-red-500", text: "text-red-500", glow: "shadow-[0_0_12px_rgba(239,68,68,0.5)]" },
    { label: "HIGH", value: vulnStats?.high ?? 0, color: "bg-orange-500", text: "text-orange-500", glow: "" },
    { label: "MEDIUM", value: vulnStats?.medium ?? 0, color: "bg-yellow-500", text: "text-yellow-500", glow: "" },
    { label: "LOW", value: vulnStats?.low ?? 0, color: "bg-blue-500", text: "text-blue-500", glow: "" },
    { label: "INFO", value: vulnStats?.info ?? 0, color: "bg-gray-500", text: "text-gray-400", glow: "" },
  ];
  const total = vulnStats?.total || 1;

  const memPct = sysMetrics ? Math.round((sysMetrics.memoryUsedMb / (sysMetrics.memoryTotalMb || 1)) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="border-b border-primary/20 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary tracking-widest glow-text uppercase">
            {t('dashboard.title')}
          </h1>
          <p className="text-primary/40 text-xs font-mono uppercase tracking-widest mt-1">
            V8_NEURAL_EXPLOITATION_PLATFORM ● SYSTEM_IDLE
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/scans">
            <Button size="sm" className="bg-primary/10 text-primary border border-primary/30 hover:bg-primary hover:text-black rounded-none text-xs uppercase tracking-wider">
              <Zap className="w-3 h-3 mr-1.5" />
              {t('action.new_scan')}
            </Button>
          </Link>
          <Link href="/vulnerabilities">
            <Button size="sm" variant="outline" className="border-primary/30 text-primary/70 hover:bg-primary/10 rounded-none text-xs uppercase tracking-wider">
              <Eye className="w-3 h-3 mr-1.5" />
              {t('nav.vulnerabilities')}
            </Button>
          </Link>
        </div>
      </div>

      {/* System Metrics Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 border border-primary/10 bg-black p-3">
        <div className="flex items-center gap-3 px-3 py-2 border border-primary/10">
          <Clock className="w-4 h-4 text-primary/50 shrink-0" />
          <div>
            <div className="text-[10px] uppercase tracking-wider text-primary/30 font-mono">{t('dashboard.uptime')}</div>
            <div className="text-sm font-mono text-primary font-bold">
              {sysMetrics?.uptime ?? "00:00:00"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 px-3 py-2 border border-primary/10">
          <MemoryStick className="w-4 h-4 text-primary/50 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-primary/30 font-mono">{t('dashboard.memory')}</div>
            <div className="flex items-center gap-2">
              <div className="text-sm font-mono text-primary font-bold">
                {sysMetrics?.memoryUsedMb ?? 0}MB
              </div>
              <div className="flex-1 h-1 bg-primary/10 border border-primary/10">
                <div className="h-full bg-primary transition-all" style={{ width: `${memPct}%` }} />
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 px-3 py-2 border border-primary/10">
          <CheckCircle className="w-4 h-4 text-primary/50 shrink-0" />
          <div>
            <div className="text-[10px] uppercase tracking-wider text-primary/30 font-mono">{t('dashboard.ai_validated')}</div>
            <div className="text-sm font-mono text-primary font-bold">
              {(stats as { aiValidatedCount?: number } | undefined)?.aiValidatedCount ?? 0}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 px-3 py-2 border border-primary/10">
          <XCircle className="w-4 h-4 text-primary/30 shrink-0" />
          <div>
            <div className="text-[10px] uppercase tracking-wider text-primary/30 font-mono">{t('dashboard.false_positives')}</div>
            <div className="text-sm font-mono text-primary/60 font-bold">
              {(stats as { falsePositives?: number } | undefined)?.falsePositives ?? 0}
            </div>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {statCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <Link key={idx} href={card.href}>
              <Card className="bg-card border-primary/20 glow-box relative overflow-hidden group cursor-pointer hover:border-primary/50 transition-colors">
                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
                  <Icon className={`w-14 h-14 ${card.color}`} />
                </div>
                <CardHeader className="pb-1 pt-4 px-4">
                  <CardTitle className="text-xs text-primary/50 font-mono uppercase tracking-wider">
                    {card.label}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  {isLoading ? (
                    <Skeleton className="h-9 w-16 bg-primary/10" />
                  ) : (
                    <div className={`text-3xl font-bold glow-text ${card.color}`}>
                      {card.value.toString().padStart(2, "0")}
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Vuln Breakdown + Quick Actions + Terminal */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Severity Chart */}
        <Card className="bg-card border-primary/20 glow-box">
          <CardHeader className="border-b border-primary/20 pb-3 pt-4 px-5">
            <CardTitle className="text-sm text-primary uppercase tracking-widest glow-text flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              {t('dashboard.vuln_breakdown')}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-3">
            {severityData.map(s => (
              <div key={s.label} className="space-y-1">
                <div className="flex justify-between text-xs font-mono">
                  <span className={`${s.text} uppercase`}>{s.label}</span>
                  <span className={`${s.text} font-bold`}>{s.value}</span>
                </div>
                <div className="h-1.5 bg-black border border-primary/10 relative overflow-hidden">
                  <div
                    className={`h-full ${s.color} transition-all duration-700 ${s.glow}`}
                    style={{ width: `${Math.round((s.value / total) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="bg-card border-primary/20 glow-box">
          <CardHeader className="border-b border-primary/20 pb-3 pt-4 px-5">
            <CardTitle className="text-sm text-primary uppercase tracking-widest glow-text flex items-center gap-2">
              <Zap className="w-4 h-4" />
              {t('dashboard.quick_actions')}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-2">
            {[
              { label: t('action.new_scan'), href: "/scans", icon: Shield },
              { label: t('action.add_proxy'), href: "/proxies", icon: Globe },
              { label: t('action.install_tool'), href: "/tools", icon: Terminal },
              { label: t('action.generate_report'), href: "/reports", icon: Activity },
            ].map(action => {
              const Icon = action.icon;
              return (
                <Link key={action.href} href={action.href}>
                  <button className="w-full flex items-center gap-3 px-4 py-3 border border-primary/20 text-primary/70 hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-all text-sm font-mono uppercase tracking-wider text-left group">
                    <Icon className="w-4 h-4 shrink-0 group-hover:text-primary" />
                    {action.label}
                  </button>
                </Link>
              );
            })}
          </CardContent>
        </Card>

        <LiveTerminal />
      </div>
    </div>
  );
}
