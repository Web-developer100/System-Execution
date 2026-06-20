import { useState, useEffect, useCallback } from "react";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useGetTools } from "@workspace/api-client-react";
import {
  Calendar, Clock, Plus, Trash2, ToggleLeft, ToggleRight,
  Play, History, RefreshCw, ChevronRight, AlertCircle,
  CheckCircle2, PauseCircle, Loader2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

// ── Types ────────────────────────────────────────────────────────────────

interface Schedule {
  id: string;
  name: string;
  target: string;
  tools: string[];
  cron: string;
  enabled: boolean;
  useProxy: boolean;
  lastRun: string | null;
  nextRun: string | null;
  createdAt: string;
  totalRuns: number;
}

interface ScheduleListResponse {
  total: number;
  active: number;
  schedules: Schedule[];
}

interface ScheduleHistoryEntry {
  id: number;
  target: string;
  status: string;
  progress: number | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────

const CRON_PRESETS = [
  { label: "Every 5 min", value: "*/5 * * * *" },
  { label: "Every 15 min", value: "*/15 * * * *" },
  { label: "Every 30 min", value: "*/30 * * * *" },
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every 6 hours", value: "0 */6 * * *" },
  { label: "Every 12 hours", value: "0 */12 * * *" },
  { label: "Daily (midnight)", value: "0 0 * * *" },
  { label: "Weekly (Mon 00:00)", value: "0 0 * * 1" },
];

function describeCron(cron: string): string {
  const preset = CRON_PRESETS.find((p) => p.value === cron);
  if (preset) return preset.label;
  return cron;
}

function nextRunTime(nextRun: string | null): string {
  if (!nextRun) return "—";
  const d = new Date(nextRun);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  if (diff < 0) return "Pending…";
  if (diff < 60_000) return "~now";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h`;
  return d.toLocaleDateString();
}

// ── Component ─────────────────────────────────────────────────────────────

// ── Component ─────────────────────────────────────────────────────────────

export default function Scheduling() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { token } = useAuth();
  const { data: toolsData } = useGetTools();

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [historyMap, setHistoryMap] = useState<Record<string, ScheduleHistoryEntry[]>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ── Form state ────────────────────────────────────────────────────────
  const [formName, setFormName] = useState("");
  const [formTarget, setFormTarget] = useState("");
  const [formTools, setFormTools] = useState<string[]>([]);
  const [formCron, setFormCron] = useState("*/30 * * * *");
  const [formUseProxy, setFormUseProxy] = useState(false);

  // ── Fetch schedules ───────────────────────────────────────────────────
  // Helper: authenticated fetch using the JWT token
  const authFetch = useCallback(async (url: string, options?: RequestInit): Promise<Response> => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options?.headers as Record<string, string> ?? {}),
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return fetch(url, { ...options, headers });
  }, [token]);

  const fetchSchedules = useCallback(async () => {
    try {
      setLoading(true);
      const res = await authFetch("/api/schedules");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = (await res.json()) as ScheduleListResponse;
      setSchedules(data.schedules);
    } catch {
      toast({ title: "FETCH ERROR", description: "Could not load schedules.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchSchedules(); }, [fetchSchedules]);

  // ── Poll schedules every 15s ──────────────────────────────────────────
  useEffect(() => {
    const iv = setInterval(fetchSchedules, 15_000);
    return () => clearInterval(iv);
  }, [fetchSchedules]);

  // ── Create schedule ───────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!formName.trim() || !formTarget.trim() || formTools.length === 0) return;
    try {
      const res = await authFetch("/api/schedules", {
        method: "POST",
        body: JSON.stringify({
          name: formName.trim(),
          target: formTarget.trim(),
          tools: formTools,
          cron: formCron,
          useProxy: formUseProxy,
        }),
      });
      if (!res.ok) throw new Error("Create failed");
      const newSchedule = (await res.json()) as Schedule;
      setSchedules((prev) => [newSchedule, ...prev]);
      setCreateOpen(false);
      setFormName("");
      setFormTarget("");
      setFormTools([]);
      setFormCron("*/30 * * * *");
      setFormUseProxy(false);
      toast({ title: "SCHEDULE CREATED", description: `${newSchedule.name} — next run ${nextRunTime(newSchedule.nextRun)}` });
    } catch {
      toast({ title: "CREATE FAILED", variant: "destructive" });
    }
  };

  // ── Delete schedule ───────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    try {
      const res = await authFetch(`/api/schedules/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setSchedules((prev) => prev.filter((s) => s.id !== id));
      toast({ title: "SCHEDULE DELETED" });
    } catch {
      toast({ title: "DELETE FAILED", variant: "destructive" });
    }
  };

  // ── Toggle schedule ───────────────────────────────────────────────────
  const handleToggle = async (id: string) => {
    try {
      const res = await authFetch(`/api/schedules/${id}/toggle`, { method: "POST" });
      if (!res.ok) throw new Error("Toggle failed");
      const update = (await res.json()) as { id: string; enabled: boolean; nextRun: string | null };
      setSchedules((prev) =>
        prev.map((s) => (s.id === id ? { ...s, enabled: update.enabled, nextRun: update.nextRun } : s)),
      );
    } catch {
      toast({ title: "TOGGLE FAILED", variant: "destructive" });
    }
  };

  // ── Fetch history ─────────────────────────────────────────────────────
  const handleFetchHistory = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    try {
      const res = await authFetch(`/api/schedules/${id}/history`);
      if (!res.ok) throw new Error("History fetch failed");
      const data = (await res.json()) as { history: ScheduleHistoryEntry[] };
      setHistoryMap((prev) => ({ ...prev, [id]: data.history }));
    } catch {
      toast({ title: "HISTORY FETCH FAILED", variant: "destructive" });
    }
  };

  const tools = toolsData ?? [];
  const activeCount = schedules.filter((s) => s.enabled).length;

  return (
    <div className="space-y-6">
      <div className="border-b border-primary/20 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary tracking-widest glow-text uppercase flex items-center gap-3">
            <Calendar className="w-6 h-6" />
            Scheduling
          </h1>
          <p className="text-primary/40 text-xs font-mono mt-1">
            {schedules.length} SCHEDULES ● {activeCount} ACTIVE
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary text-black h-10 px-6 glow-box rounded-none uppercase tracking-widest text-xs font-bold">
              <Plus className="w-4 h-4 mr-2" /> New Schedule
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-black border-primary/30 text-primary rounded-none max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-primary glow-text font-mono uppercase tracking-widest">
                <Calendar className="w-4 h-4 inline mr-2" />Create Schedule
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-1.5">
                <label className="text-[11px] uppercase tracking-wider text-primary/50 font-mono">Name</label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Daily DAST Scan"
                  className="bg-black border-primary/30 text-primary h-11 rounded-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] uppercase tracking-wider text-primary/50 font-mono">Target URL</label>
                <Input
                  value={formTarget}
                  onChange={(e) => setFormTarget(e.target.value)}
                  placeholder="https://example.com"
                  className="bg-black border-primary/30 text-primary h-11 rounded-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] uppercase tracking-wider text-primary/50 font-mono">Tools</label>
                <Select
                  value={formTools.length > 0 ? formTools[0] : ""}
                  onValueChange={(v) => setFormTools(v ? [v] : [])}
                >
                  <SelectTrigger className="bg-black border-primary/30 text-primary h-11 rounded-none font-mono">
                    <SelectValue placeholder={formTools.length > 0 ? `${formTools[0]}${formTools.length > 1 ? ` +${formTools.length - 1}` : ""}` : "Select tools..."} />
                  </SelectTrigger>
                  <SelectContent className="bg-black border-primary/30 text-primary rounded-none font-mono max-h-48">
                    {tools.length === 0 ? (
                      <div className="px-3 py-2 text-primary/30 text-xs">No tools installed</div>
                    ) : (
                      tools.map((tool) => (
                        <SelectItem
                          key={tool.id}
                          value={tool.name}
                          className="hover:bg-primary/10"
                        >
                          {tool.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] uppercase tracking-wider text-primary/50 font-mono">
                  Cron Expression <span className="text-primary/30 normal-case">({describeCron(formCron)})</span>
                </label>
                <Select value={formCron} onValueChange={setFormCron}>
                  <SelectTrigger className="bg-black border-primary/30 text-primary h-11 rounded-none font-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-black border-primary/30 text-primary rounded-none font-mono">
                    {CRON_PRESETS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3 py-1">
                <Switch
                  checked={formUseProxy}
                  onCheckedChange={setFormUseProxy}
                  className="data-[state=checked]:bg-primary"
                />
                <span className="text-xs font-mono text-primary/60">Use proxy pool</span>
              </div>
              <Button
                onClick={handleCreate}
                disabled={!formName.trim() || !formTarget.trim() || formTools.length === 0}
                className="w-full bg-primary text-black h-11 rounded-none glow-box uppercase tracking-widest text-xs font-bold"
              >
                <Plus className="w-4 h-4 mr-2" /> Create Schedule
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Schedules List */}
      {loading ? (
        <div className="text-center text-primary/40 py-16 font-mono animate-pulse">LOADING SCHEDULES...</div>
      ) : schedules.length === 0 ? (
        <div className="text-center text-primary/30 py-16 border border-primary/10 bg-card font-mono">
          No schedules configured. Create one to automate recurring scans.
        </div>
      ) : (
        <div className="space-y-3">
          {schedules.map((schedule) => (
            <Card key={schedule.id} className="bg-card border-primary/20 hover:border-primary/40 transition-colors rounded-none">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  {/* Left: info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-bold text-primary glow-text uppercase tracking-wider font-mono">
                        {schedule.name}
                      </h3>
                      <Badge
                        variant="outline"
                        className={`uppercase text-[10px] font-mono rounded-none ${
                          schedule.enabled
                            ? "text-primary border-primary/40 bg-primary/5"
                            : "text-primary/30 border-primary/10"
                        }`}
                      >
                        {schedule.enabled ? "ACTIVE" : "PAUSED"}
                      </Badge>
                    </div>
                    <p className="text-xs text-primary/60 font-mono truncate">{schedule.target}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[10px] font-mono text-primary/40">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {describeCron(schedule.cron)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Play className="w-3 h-3" />
                        {schedule.totalRuns} run{schedule.totalRuns !== 1 ? "s" : ""}
                      </span>
                      <span className="flex items-center gap-1">
                        <RefreshCw className="w-3 h-3" />
                        Next: {nextRunTime(schedule.nextRun)}
                      </span>
                      <span>
                        Tools: {schedule.tools.join(", ")}
                      </span>
                    </div>
                  </div>

                  {/* Right: actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 text-primary/40 hover:text-primary"
                      onClick={() => handleToggle(schedule.id)}
                      title={schedule.enabled ? "Pause" : "Activate"}
                    >
                      {schedule.enabled ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 text-primary/40 hover:text-primary"
                      onClick={() => handleFetchHistory(schedule.id)}
                      title="View history"
                    >
                      <History className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 text-destructive/50 hover:text-destructive"
                      onClick={() => handleDelete(schedule.id)}
                      title="Delete schedule"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Expanded history */}
                {expandedId === schedule.id && (
                  <div className="mt-3 border-t border-primary/10 pt-3">
                    <div className="flex items-center gap-2 text-[10px] font-mono text-primary/40 mb-2">
                      <History className="w-3 h-3" />
                      EXECUTION HISTORY (last 20)
                    </div>
                    {!historyMap[schedule.id] ? (
                      <div className="text-[10px] text-primary/20 font-mono animate-pulse">Loading...</div>
                    ) : historyMap[schedule.id].length === 0 ? (
                      <div className="text-[10px] text-primary/20 font-mono">No executions yet.</div>
                    ) : (
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {historyMap[schedule.id].map((entry) => (
                          <div key={entry.id} className="flex items-center gap-3 text-[11px] font-mono">
                            <Badge
                              variant="outline"
                              className={`text-[9px] font-mono rounded-none px-1.5 py-0 ${
                                entry.status === "completed"
                                  ? "text-primary border-primary/30"
                                  : entry.status === "running" || entry.status === "queued"
                                  ? "text-yellow-400 border-yellow-500/30"
                                  : "text-destructive border-destructive/30"
                              }`}
                            >
                              {entry.status.toUpperCase()}
                            </Badge>
                            <span className="text-primary/60 flex-1 truncate">#{entry.id}</span>
                            <span className="text-primary/30">
                              {entry.completedAt
                                ? new Date(entry.completedAt).toLocaleDateString()
                                : entry.createdAt
                                ? new Date(entry.createdAt).toLocaleDateString()
                                : "—"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
