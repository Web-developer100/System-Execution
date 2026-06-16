import { useEffect, useState } from "react";
import { useGetDashboardStats } from "@workspace/api-client-react";
import { useI18n } from "@/lib/i18n";
import { Activity, Shield, AlertTriangle, Terminal, Globe, Cpu } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function LiveTerminal() {
  const { t } = useI18n();
  const [logs, setLogs] = useState<string[]>([]);
  
  useEffect(() => {
    const templates = [
      "[INFO] UPLINK_SYNC... STABLE_V",
      "[OK] TARGET_ENTROPY_LOG connected",
      "[WARN] SIGNAL_TPS: 15.2k",
      "[INFO] EXTRACTION_UNIT scanning...",
      "[OK] PROXY_NODE_A routing enabled",
      "[WARN] PACKET_LOSS detected at node 0x7",
      "[INFO] NEURAL_NET recalibrating..."
    ];
    
    const interval = setInterval(() => {
      setLogs(prev => {
        const newLog = templates[Math.floor(Math.random() * templates.length)];
        const ts = new Date().toISOString().substring(11, 19);
        const updated = [...prev, `${ts} ${newLog}`];
        if (updated.length > 20) return updated.slice(updated.length - 20);
        return updated;
      });
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  return (
    <Card className="col-span-1 md:col-span-2 lg:col-span-3 bg-card border-primary/20 glow-box">
      <CardHeader className="border-b border-primary/20 pb-4">
        <CardTitle className="text-primary flex items-center gap-2 glow-text">
          <Terminal className="w-5 h-5" />
          {t('dashboard.live_feed')}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="h-64 bg-black p-4 overflow-y-auto font-mono text-sm">
          {logs.map((log, i) => (
            <div key={i} className={`${log.includes('[WARN]') ? 'text-yellow-500' : 'text-primary'} mb-1`}>
              {log}
            </div>
          ))}
          <div className="w-2 h-4 bg-primary cursor-blink inline-block mt-1"></div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data: stats, isLoading } = useGetDashboardStats();
  const { t } = useI18n();

  const statCards = [
    { label: t('dashboard.total_scans'), value: stats?.totalScans, icon: Activity, color: "text-primary" },
    { label: t('dashboard.active_scans'), value: stats?.activeScans, icon: Shield, color: "text-primary" },
    { label: t('dashboard.total_vulns'), value: stats?.totalVulns, icon: AlertTriangle, color: "text-destructive" },
    { label: t('dashboard.proxy_pool'), value: stats?.proxyPoolSize, icon: Globe, color: "text-primary" },
    { label: t('dashboard.tools_active'), value: stats?.toolsActive, icon: Terminal, color: "text-primary" },
    { label: t('dashboard.threads'), value: stats?.threadsRunning, icon: Cpu, color: "text-primary" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-primary tracking-widest glow-text uppercase border-b border-primary/20 pb-4">
        {t('nav.dashboard')} // COMMAND CENTER
      </h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {statCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <Card key={idx} className="bg-card border-primary/20 glow-box relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <Icon className={`w-16 h-16 ${card.color}`} />
              </div>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-primary/70 font-normal uppercase tracking-wider">
                  {card.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-4xl font-bold glow-text ${card.color}`}>
                  {isLoading ? <Skeleton className="h-10 w-20 bg-primary/20" /> : card.value}
                </div>
              </CardContent>
            </Card>
          );
        })}
        <LiveTerminal />
      </div>
    </div>
  );
}
