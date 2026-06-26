import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { authFetch } from "@/lib/auth-fetch";
import {
  Bell, Plus, Trash2, Eye, VolumeX, Check, AlertTriangle,
  Search, Filter, RefreshCw, Settings, Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";

// ── Types ─────────────────────────────────────────────────────────────────

interface AlertRule {
  id: string;
  name: string;
  description: string;
  type: "threshold" | "rate" | "anomaly" | "heartbeat" | "security";
  severity: "critical" | "high" | "medium" | "low" | "info";
  source: string;
  condition: string;
  threshold: number;
  duration: number;
  enabled: boolean;
  notifyChannels: string[];
  escalateAfter: number | null;
  escalateTo: string[] | null;
  createdAt: string;
  updatedAt: string;
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
  silencedUntil: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────

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

const RULE_TYPE_COLORS: Record<string, string> = {
  threshold: "bg-primary/10 text-primary border-primary/30",
  rate: "bg-purple-500/10 text-purple-500 border-purple-500/30",
  anomaly: "bg-cyan-500/10 text-cyan-500 border-cyan-500/30",
  heartbeat: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
  security: "bg-destructive/10 text-destructive border-destructive/30",
};

function SeverityBadge({ severity }: { severity: string }) {
  return (
    <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider font-mono ${SEVERITY_COLORS[severity] ?? "bg-muted/15 text-muted-foreground"}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${SEVERITY_DOT[severity] ?? "bg-muted"}`} />
      {severity}
    </div>
  );
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

// ── Firings Tab ────────────────────────────────────────────────────────────

function FiringsTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: firings, isLoading } = useQuery<AlertFiring[]>({
    queryKey: ["observability", "alerts", "firings"],
    queryFn: async () => {
      const res = await authFetch("/api/observability/alerts/firings");
      if (!res.ok) throw new Error("Failed to fetch alerts");
      return res.json();
    },
    refetchInterval: 10_000,
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
      toast({ title: "Alert acknowledged" });
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
      toast({ title: "Alert silenced for 1 hour" });
    },
  });

  const resolveMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(`/api/observability/alerts/firings/${id}/resolve`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to resolve");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["observability", "alerts", "firings"] });
      toast({ title: "Alert resolved" });
    },
  });

  if (isLoading) {
    return <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>;
  }

  const all = firings ?? [];
  const active = all.filter(f => f.status === "firing");
  const acknowledged = all.filter(f => f.status === "acknowledged");
  const silenced = all.filter(f => f.status === "silenced");
  const resolved = all.filter(f => f.status === "resolved");

  if (all.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Bell className="w-12 h-12 mb-3 opacity-20" />
        <p className="text-sm font-medium">No alerts</p>
        <p className="text-xs mt-1">All systems nominal.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-3 flex-wrap">
        <Badge className="bg-destructive/15 text-destructive border-destructive/30 text-xs font-mono">{active.length} FIRING</Badge>
        <Badge className="bg-warning/10 text-warning border-warning/20 text-xs font-mono">{acknowledged.length} ACKNOWLEDGED</Badge>
        <Badge className="bg-muted/10 text-muted-foreground border-muted/30 text-xs font-mono">{silenced.length} SILENCED</Badge>
        <Badge className="bg-success/10 text-success border-success/20 text-xs font-mono">{resolved.length} RESOLVED</Badge>
      </div>

      {/* Firing List */}
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
                  <span className="text-sm font-semibold">{alert.ruleName}</span>
                  <Badge variant="outline" className="text-[9px] font-mono uppercase tracking-wider">{alert.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{alert.message}</p>
                <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground font-mono">
                  <span>Value: {alert.value.toFixed(1)}</span>
                  <span>Threshold: {alert.threshold}</span>
                  <span>Source: {alert.source}</span>
                  <span>{relativeTime(alert.firedAt)}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {alert.status === "firing" && (
                  <>
                    <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => acknowledgeMut.mutate(alert.id)}><Eye className="w-3 h-3" /></Button></TooltipTrigger><TooltipContent>Acknowledge</TooltipContent></Tooltip>
                    <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => silenceMut.mutate(alert.id)}><VolumeX className="w-3 h-3" /></Button></TooltipTrigger><TooltipContent>Silence 1h</TooltipContent></Tooltip>
                    <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7 text-success" onClick={() => resolveMut.mutate(alert.id)}><Check className="w-3 h-3" /></Button></TooltipTrigger><TooltipContent>Resolve</TooltipContent></Tooltip>
                  </>
                )}
                {alert.status === "acknowledged" && (
                  <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7 text-success" onClick={() => resolveMut.mutate(alert.id)}><Check className="w-3 h-3" /></Button></TooltipTrigger><TooltipContent>Resolve</TooltipContent></Tooltip>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Rules Tab ──────────────────────────────────────────────────────────────

function RulesTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: rules, isLoading } = useQuery<AlertRule[]>({
    queryKey: ["observability", "alerts", "rules"],
    queryFn: async () => {
      const res = await authFetch("/api/observability/alerts/rules");
      if (!res.ok) throw new Error("Failed to fetch rules");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newRule, setNewRule] = useState({
    name: "", description: "", type: "threshold" as const,
    severity: "medium" as const, source: "", condition: "", threshold: 0,
    duration: 60, enabled: true, notifyChannels: ["slack"] as string[],
    escalateAfter: null as number | null, escalateTo: null as string[] | null,
  });

  const createMut = useMutation({
    mutationFn: async (rule: typeof newRule) => {
      const res = await authFetch("/api/observability/alerts/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...rule, notifyChannels: rule.notifyChannels }),
      });
      if (!res.ok) throw new Error("Failed to create rule");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Rule created", description: "Alert rule has been added." });
      setShowCreateForm(false);
      setNewRule({
        name: "", description: "", type: "threshold", severity: "medium",
        source: "", condition: "", threshold: 0, duration: 60, enabled: true,
        notifyChannels: ["slack"], escalateAfter: null, escalateTo: null,
      });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(`/api/observability/alerts/rules/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete rule");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["observability", "alerts", "rules"] });
      toast({ title: "Rule deleted" });
    },
  });

  const toggleMut = useMutation({
    mutationFn: async (rule: AlertRule) => {
      const res = await authFetch(`/api/observability/alerts/rules/${rule.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !rule.enabled }),
      });
      if (!res.ok) throw new Error("Failed to toggle rule");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["observability", "alerts", "rules"] });
    },
  });


  if (isLoading) {
    return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>;
  }

  const allRules = rules ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge className="bg-primary/10 text-primary border-primary/30 text-xs font-mono">{allRules.length} RULES</Badge>
          <Badge className="bg-success/10 text-success border-success/20 text-xs font-mono">{allRules.filter(r => r.enabled).length} ACTIVE</Badge>
        </div>
        <Button size="sm" onClick={() => setShowCreateForm(!showCreateForm)} className="gap-1.5">
          <Plus className="w-4 h-4" />
          Add Rule
        </Button>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <Card className="glass-card border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">New Alert Rule</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Name</label>
                <Input value={newRule.name} onChange={e => setNewRule({ ...newRule, name: e.target.value })} placeholder="e.g., High CPU Usage" className="h-9 text-xs" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Source</label>
                <Input value={newRule.source} onChange={e => setNewRule({ ...newRule, source: e.target.value })} placeholder="e.g., cpu_usage_percent" className="h-9 text-xs" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Type</label>
                <select value={newRule.type} onChange={e => setNewRule({ ...newRule, type: e.target.value as any })}
                  className="h-9 px-3 text-xs bg-muted/30 border border-border/50 rounded-md w-full text-foreground">
                  <option value="threshold">Threshold</option>
                  <option value="rate">Rate</option>
                  <option value="anomaly">Anomaly</option>
                  <option value="heartbeat">Heartbeat</option>
                  <option value="security">Security</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Severity</label>
                <select value={newRule.severity} onChange={e => setNewRule({ ...newRule, severity: e.target.value as any })}
                  className="h-9 px-3 text-xs bg-muted/30 border border-border/50 rounded-md w-full text-foreground">
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                  <option value="info">Info</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Threshold</label>
                <Input type="number" value={newRule.threshold} onChange={e => setNewRule({ ...newRule, threshold: parseFloat(e.target.value) || 0 })} className="h-9 text-xs" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Duration (seconds)</label>
                <Input type="number" value={newRule.duration} onChange={e => setNewRule({ ...newRule, duration: parseInt(e.target.value) || 0 })} className="h-9 text-xs" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Description</label>
                <Input value={newRule.description} onChange={e => setNewRule({ ...newRule, description: e.target.value })} placeholder="e.g., CPU usage exceeds 90% threshold" className="h-9 text-xs" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button size="sm" onClick={() => createMut.mutate(newRule)} disabled={!newRule.name || !newRule.source}>
                Create Rule
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowCreateForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rules List */}
      <div className="space-y-2">
        {allRules.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Settings className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm">No alert rules configured</p>
          </div>
        ) : (
          allRules.map(rule => (
            <div key={rule.id} className="p-3 rounded-lg border bg-card hover:bg-muted/10 transition-colors">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`w-2 h-2 rounded-full ${rule.enabled ? "bg-success" : "bg-muted-foreground"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{rule.name}</span>
                      <SeverityBadge severity={rule.severity} />
                      <Badge variant="outline" className={`text-[9px] font-mono ${RULE_TYPE_COLORS[rule.type] ?? ""}`}>
                        {rule.type}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{rule.description}</p>
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground font-mono">
                      <span>Condition: {rule.condition}</span>
                      <span>Threshold: {rule.threshold}</span>
                      <span>Source: {rule.source}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toggleMut.mutate(rule)}>
                        {rule.enabled ? <Eye className="w-3 h-3" /> : <Eye className="w-3 h-3 opacity-30" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{rule.enabled ? "Disable" : "Enable"}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteMut.mutate(rule.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Delete</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────

export default function AlertsManagement() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
            <Bell className="w-6 h-6 text-primary" />
            Alerts Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Alert rules, firing management, and notification routing
          </p>
        </div>
      </div>

      <Tabs defaultValue="firings" className="space-y-4">
        <TabsList className="glass-card">
          <TabsTrigger value="firings" className="text-xs">
            <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />
            Active Firings
          </TabsTrigger>
          <TabsTrigger value="rules" className="text-xs">
            <Settings className="w-3.5 h-3.5 mr-1.5" />
            Alert Rules
          </TabsTrigger>
        </TabsList>

        <TabsContent value="firings" className="mt-0">
          <Card className="glass-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Bell className="w-4 h-4 text-destructive" />
                Active Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <FiringsTab />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rules" className="mt-0">
          <Card className="glass-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Settings className="w-4 h-4 text-primary" />
                Alert Rules Configuration
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RulesTab />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
