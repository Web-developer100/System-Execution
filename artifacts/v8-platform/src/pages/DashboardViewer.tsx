import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { authFetch } from "@/lib/auth-fetch";
import {
  LayoutDashboard, RefreshCw, ChevronRight,
  BarChart3, LineChart, PieChart, Activity, Table,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface DashboardPanel {
  id: string;
  title: string;
  type: string;
  metrics: string[];
  width: number;
  height: number;
  color?: string;
  thresholds?: { warning: number; critical: number };
  unit?: string;
}

interface DashboardSection {
  title: string;
  description: string;
  panels: DashboardPanel[];
}

interface DashboardDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  refreshIntervalMs: number;
  sections: DashboardSection[];
}

function DashboardPanelCard({ panel }: { panel: DashboardPanel }) {
  const typeIcons: Record<string, React.ReactNode> = {
    stat: <Activity className="w-3 h-3" />,
    timeseries: <LineChart className="w-3 h-3" />,
    bar: <BarChart3 className="w-3 h-3" />,
    pie: <PieChart className="w-3 h-3" />,
    gauge: <Activity className="w-3 h-3" />,
    table: <Table className="w-3 h-3" />,
    heatmap: <Activity className="w-3 h-3" />,
    log: <Activity className="w-3 h-3" />,
    alert_list: <Activity className="w-3 h-3" />,
  };

  const widthClass = panel.width >= 8 ? "md:col-span-2" : panel.width >= 4 ? "" : "";
  const heightClass = panel.height >= 2 ? "row-span-2" : "";

  return (
    <div className={`p-4 rounded-lg border bg-card/50 hover:bg-card/80 transition-colors ${widthClass} ${heightClass}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">{typeIcons[panel.type] ?? <Activity className="w-3 h-3" />}</span>
          <span className="text-xs font-medium">{panel.title}</span>
        </div>
        <Badge variant="outline" className="text-[8px] font-mono uppercase">{panel.type}</Badge>
      </div>
      {panel.metrics.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {panel.metrics.map(m => (
            <Badge key={m} variant="outline" className="text-[8px] font-mono bg-muted/30">
              {m.length > 30 ? m.slice(0, 30) + "..." : m}
            </Badge>
          ))}
        </div>
      )}
      {panel.unit && (
        <p className="text-[10px] text-muted-foreground mt-2 font-mono">
          Unit: {panel.unit}
          {panel.thresholds && ` · Warning: ${panel.thresholds.warning} · Critical: ${panel.thresholds.critical}`}
        </p>
      )}
      {/* Mini visualization area */}
      <div className={`mt-2 rounded bg-muted/20 border border-border/20 flex items-center justify-center ${
        panel.height >= 2 ? "h-20" : "h-10"
      }`}>
        <span className="text-[9px] text-muted-foreground font-mono">
          {panel.type === "gauge" ? "↕ Gauge" :
           panel.type === "timeseries" ? "↗ Timeseries" :
           panel.type === "bar" ? "▂▄▆ Bar" :
           panel.type === "pie" ? "○ Pie" :
           panel.type === "heatmap" ? "◼ Heatmap" :
           panel.type === "stat" ? panel.metrics[0] ?? "—" :
           panel.type === "log" ? "≡ Log Stream" :
           panel.type === "alert_list" ? "! Alerts" :
           "—"}
        </span>
      </div>
    </div>
  );
}

export default function DashboardViewer() {
  const [activeDashboard, setActiveDashboard] = useState("executive");

  const { data: dashboards, isLoading: listLoading } = useQuery<{ count: number; dashboards: Array<{ id: string; name: string; description: string; icon: string; category: string; panelCount: number }> }>({
    queryKey: ["observability", "dashboards"],
    queryFn: async () => {
      const res = await authFetch("/api/observability/dashboards");
      if (!res.ok) throw new Error("Failed to fetch dashboards");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const { data: dashboard, isLoading: detailLoading } = useQuery<DashboardDefinition>({
    queryKey: ["observability", "dashboards", activeDashboard],
    queryFn: async () => {
      const res = await authFetch(`/api/observability/dashboards/${activeDashboard}`);
      if (!res.ok) throw new Error("Failed to fetch dashboard");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const allDashboards = dashboards?.dashboards ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
            <LayoutDashboard className="w-6 h-6 text-primary" />
            Dashboards
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {allDashboards.length} predefined dashboards · {dashboard?.sections?.length ?? 0} sections · {dashboard?.sections?.reduce((s, sec) => s + sec.panels.length, 0) ?? 0} panels
          </p>
        </div>
      </div>

      {/* Dashboard Selector */}
      <div className="flex flex-wrap gap-2">
        {listLoading ? (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-28 rounded-lg" />)
        ) : (
          allDashboards.map(d => (
            <button
              key={d.id}
              onClick={() => setActiveDashboard(d.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                activeDashboard === d.id
                  ? "bg-primary/10 text-primary border-primary/30"
                  : "bg-muted/30 text-muted-foreground border-border/50 hover:bg-muted/50"
              }`}
            >
              <span className="mr-1.5">{d.icon}</span>
              {d.name}
            </button>
          ))
        )}
      </div>

      {/* Active Dashboard */}
      {detailLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-8 w-64 rounded-lg" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
          </div>
        </div>
      ) : dashboard ? (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <span>{dashboard.icon}</span>
              {dashboard.name}
            </h2>
            <p className="text-sm text-muted-foreground">{dashboard.description}</p>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="outline" className="text-[10px] font-mono">{dashboard.category}</Badge>
              <Badge variant="outline" className="text-[10px] font-mono">Refresh: {dashboard.refreshIntervalMs / 1000}s</Badge>
            </div>
          </div>

          {dashboard.sections.map(section => (
            <Card key={section.title} className="glass-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">{section.title}</CardTitle>
                <p className="text-[10px] text-muted-foreground">{section.description}</p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 auto-rows-min">
                  {section.panels.map(panel => (
                    <DashboardPanelCard key={panel.id} panel={panel} />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <LayoutDashboard className="w-12 h-12 mb-3 opacity-20" />
          <p className="text-sm">Select a dashboard to view</p>
        </div>
      )}
    </div>
  );
}
