import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import { useToast } from "@/hooks/use-toast";
import {
  Trash2, Clock, Archive, Database, RefreshCw,
  FileText, Activity, AlertTriangle, BookOpen,
  HardDrive, Save,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface RetentionPolicy {
  dataType: string;
  maxEntries: number;
  ttlMs: number;
  enabled: boolean;
  archiveEnabled: boolean;
  label: string;
  lastSweptAt: string | null;
}

interface DataSizeInfo {
  dataType: string;
  currentEntries: number;
  maxEntries: number;
  utilizationPercent: number;
  oldestEntryTimestamp: string | null;
  policyEnabled: boolean;
}

const DATA_TYPE_ICONS: Record<string, React.ReactNode> = {
  logs: <FileText className="w-4 h-4" />,
  events: <Activity className="w-4 h-4" />,
  metrics: <Activity className="w-4 h-4" />,
  audit: <BookOpen className="w-4 h-4" />,
  reports: <FileText className="w-4 h-4" />,
  backups: <HardDrive className="w-4 h-4" />,
};

const DATA_TYPE_COLORS: Record<string, string> = {
  logs: "border-l-blue-500",
  events: "border-l-purple-500",
  metrics: "border-l-emerald-500",
  audit: "border-l-rose-500",
  reports: "border-l-amber-500",
  backups: "border-l-cyan-500",
};

function formatTTL(ms: number): string {
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days >= 365) return `${Math.floor(days / 365)} year${days >= 730 ? "s" : ""}`;
  if (days >= 30) return `${Math.floor(days / 30)} month${days >= 60 ? "s" : ""}`;
  if (days >= 7) return `${Math.floor(days / 7)} week${days >= 14 ? "s" : ""}`;
  return `${days} day${days !== 1 ? "s" : ""}`;
}

export default function RetentionPolicies() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: retentionData, isLoading } = useQuery<{ policies: RetentionPolicy[]; status: any }>({
    queryKey: ["observability", "retention"],
    queryFn: async () => {
      const res = await authFetch("/api/observability/retention");
      if (!res.ok) throw new Error("Failed to fetch retention policies");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const { data: sizesData } = useQuery<{ sizes: DataSizeInfo[] }>({
    queryKey: ["observability", "retention", "sizes"],
    queryFn: async () => {
      const res = await authFetch("/api/observability/retention/sizes");
      if (!res.ok) throw new Error("Failed to fetch sizes");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const { data: sweepHistory } = useQuery({
    queryKey: ["observability", "retention", "sweep", "history"],
    queryFn: async () => {
      const res = await authFetch("/api/observability/retention/sweep/history");
      if (!res.ok) throw new Error("Failed to fetch sweep history");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const updateMut = useMutation({
    mutationFn: async (policies: Partial<RetentionPolicy>[]) => {
      const res = await authFetch("/api/observability/retention", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policies }),
      });
      if (!res.ok) throw new Error("Failed to update policies");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["observability", "retention"] });
      toast({ title: "Policies updated" });
    },
  });

  const sweepMut = useMutation({
    mutationFn: async () => {
      const res = await authFetch("/api/observability/retention/sweep", {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to sweep");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["observability", "retention"] });
      toast({ title: "Sweep triggered", description: "Retention sweep completed." });
    },
  });

  const policies = retentionData?.policies ?? [];
  const sizes = sizesData?.sizes ?? [];
  const status = retentionData?.status;
  const sweeps = (sweepHistory as any)?.history ?? [];
  const sweepStats = (sweepHistory as any)?.stats;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
            <Trash2 className="w-6 h-6 text-primary" />
            Retention Policies
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure data retention TTL and archiving for all observability data types
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => sweepMut.mutate()} disabled={sweepMut.isPending} className="gap-1.5">
            <RefreshCw className={`w-4 h-4 ${sweepMut.isPending ? "animate-spin" : ""}`} />
            Sweep Now
          </Button>
        </div>
      </div>

      {/* Status Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="glass-card">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase">Policy Count</p>
            <p className="text-lg font-bold font-mono">{policies.length}</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase">Sweep Interval</p>
            <p className="text-lg font-bold font-mono">{status?.sweepIntervalMs ? `${status.sweepIntervalMs / 60000}m` : "—"}</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase">Total Sweeps</p>
            <p className="text-lg font-bold font-mono">{sweepStats?.totalSweeps ?? 0}</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase">Total Removed</p>
            <p className="text-lg font-bold font-mono">{sweepStats?.totalEntriesRemoved?.toLocaleString() ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Policies */}
      <div className="space-y-3">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)
        ) : (
          policies.map(policy => {
            const sizeInfo = sizes.find(s => s.dataType === policy.dataType);
            const icon = DATA_TYPE_ICONS[policy.dataType] ?? <Database className="w-4 h-4" />;
            const color = DATA_TYPE_COLORS[policy.dataType] ?? "border-l-gray-500";

            return (
              <Card key={policy.dataType} className={`glass-card border-l-4 ${color}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center">
                        {icon}
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{policy.label}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">{policy.dataType}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={policy.enabled}
                        onCheckedChange={(checked) => updateMut.mutate([{ dataType: policy.dataType as any, enabled: checked }])}
                      />
                      <span className="text-[10px] text-muted-foreground">{policy.enabled ? "Enabled" : "Disabled"}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase mb-1">Max Entries</p>
                      <p className="font-mono font-medium">{policy.maxEntries.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase mb-1">TTL</p>
                      <p className="font-mono font-medium">{formatTTL(policy.ttlMs)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase mb-1">Archive</p>
                      <div className="flex items-center gap-1">
                        <Archive className="w-3 h-3 text-muted-foreground" />
                        <span className="font-mono">{policy.archiveEnabled ? "Yes" : "No"}</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase mb-1">Last Swept</p>
                      <p className="font-mono">{policy.lastSweptAt ? new Date(policy.lastSweptAt).toLocaleDateString() : "Never"}</p>
                    </div>
                  </div>

                  {sizeInfo && (
                    <div className="mt-3">
                      <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                        <span>Utilization: {sizeInfo.currentEntries.toLocaleString()} / {sizeInfo.maxEntries.toLocaleString()}</span>
                        <span>{sizeInfo.utilizationPercent}%</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            sizeInfo.utilizationPercent > 80 ? "bg-destructive" :
                            sizeInfo.utilizationPercent > 60 ? "bg-warning" : "bg-primary"
                          }`}
                          style={{ width: `${Math.min(100, sizeInfo.utilizationPercent)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Sweep History */}
      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            Recent Sweeps
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sweeps.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No sweep history yet.</p>
          ) : (
            <div className="space-y-1">
              {sweeps.slice(0, 10).map((sweep: any) => (
                <div key={sweep.id} className="flex items-center justify-between p-2 rounded hover:bg-muted/20 text-xs">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[9px] font-mono">{sweep.dataType}</Badge>
                    <span className="text-muted-foreground">
                      Removed {sweep.entriesRemoved} entries · {sweep.entriesRemaining} remaining
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
                    {sweep.archived && <Archive className="w-3 h-3" />}
                    <span>{new Date(sweep.timestamp).toLocaleTimeString()}</span>
                    {sweep.durationMs > 0 && <span>{sweep.durationMs}ms</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
