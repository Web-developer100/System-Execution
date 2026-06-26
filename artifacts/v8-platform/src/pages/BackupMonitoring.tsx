import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import {
  Database, RefreshCw, CheckCircle, XCircle, Clock, HardDrive,
  Shield, AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface BackupRecord {
  id: string;
  type: "full" | "incremental" | "differential" | "snapshot";
  status: "running" | "completed" | "failed" | "verified";
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  sizeBytes: number | null;
  integrityHash: string | null;
  integrityVerified: boolean | null;
  error: string | null;
}

interface RestoreRecord {
  id: string;
  backupId: string;
  status: "running" | "completed" | "failed";
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  recoveryTimeMs: number | null;
  error: string | null;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatDuration(ms: number | null): string {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
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

const STATUS_COLORS: Record<string, string> = {
  verified: "bg-success/10 text-success border-success/20",
  completed: "bg-primary/10 text-primary border-primary/20",
  running: "bg-warning/10 text-warning border-warning/20",
  failed: "bg-destructive/10 text-destructive border-destructive/20",
};

export default function BackupMonitoring() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["observability", "backups", "stats"],
    queryFn: async () => {
      const res = await authFetch("/api/observability/backups/stats");
      if (!res.ok) throw new Error("Failed to fetch backup stats");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const { data: backupsData, isLoading: backupsLoading } = useQuery<{ count: number; backups: BackupRecord[] }>({
    queryKey: ["observability", "backups"],
    queryFn: async () => {
      const res = await authFetch("/api/observability/backups?limit=20");
      if (!res.ok) throw new Error("Failed to fetch backups");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const { data: restoresData } = useQuery<{ count: number; restores: RestoreRecord[] }>({
    queryKey: ["observability", "backups", "restores"],
    queryFn: async () => {
      const res = await authFetch("/api/observability/backups/restores");
      if (!res.ok) throw new Error("Failed to fetch restores");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const isLoading = statsLoading || backupsLoading;
  const backups = backupsData?.backups ?? [];
  const restores = restoresData?.restores ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
            <HardDrive className="w-6 h-6 text-primary" />
            Backup Monitoring
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Backup and restore operations across the platform
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="glass-card">
          <CardContent className="p-3 flex items-center gap-2">
            <Database className="w-4 h-4 text-primary" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Total Backups</p>
              <p className="text-lg font-bold font-mono">{stats?.totalBackups?.toLocaleString() ?? "—"}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-3 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-success" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Completed</p>
              <p className="text-lg font-bold font-mono text-success">{stats?.completedBackups?.toLocaleString() ?? "—"}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-3 flex items-center gap-2">
            <XCircle className="w-4 h-4 text-destructive" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Failed</p>
              <p className="text-lg font-bold font-mono text-destructive">{stats?.failedBackups?.toLocaleString() ?? "—"}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-3 flex items-center gap-2">
            <Shield className="w-4 h-4 text-success" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Verified</p>
              <p className="text-lg font-bold font-mono">{stats?.verifiedBackups?.toLocaleString() ?? "—"}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Additional Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="glass-card">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase mb-1">Total Size</p>
            <p className="text-lg font-bold font-mono">{formatBytes(stats?.totalSizeBytes)}</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase mb-1">Last Backup</p>
            <p className="text-lg font-bold font-mono">{stats?.lastBackupAt ? relativeTime(stats.lastBackupAt) : "Never"}</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase mb-1">Avg Recovery Time</p>
            <p className="text-lg font-bold font-mono">{formatDuration(stats?.avgRecoveryTimeMs)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Backups List */}
      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Database className="w-4 h-4 text-primary" />
            Backup History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : backups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <HardDrive className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-sm">No backups recorded</p>
            </div>
          ) : (
            <div className="space-y-2">
              {backups.map(backup => (
                <div key={backup.id} className="p-3 rounded-lg border bg-card hover:bg-muted/10 transition-colors">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`w-2 h-2 rounded-full ${
                        backup.status === "verified" ? "bg-success" :
                        backup.status === "completed" ? "bg-primary" :
                        backup.status === "running" ? "bg-warning" : "bg-destructive"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[9px] font-mono uppercase">{backup.type}</Badge>
                          <Badge variant="outline" className={`text-[9px] font-mono ${STATUS_COLORS[backup.status] ?? ""}`}>
                            {backup.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground font-mono">
                          <span>Size: {formatBytes(backup.sizeBytes)}</span>
                          <span>Duration: {formatDuration(backup.durationMs)}</span>
                          <span>{relativeTime(backup.startedAt)}</span>
                        </div>
                      </div>
                    </div>
                    {backup.integrityVerified !== null && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className={`flex items-center gap-1 text-[10px] font-mono ${
                            backup.integrityVerified ? "text-success" : "text-destructive"
                          }`}>
                            {backup.integrityVerified ? <Shield className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                            {backup.integrityVerified ? "Valid" : "Invalid"}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>Integrity check: {backup.integrityVerified ? "PASSED" : "FAILED"}</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  {backup.error && (
                    <p className="text-[10px] text-destructive font-mono mt-1">{backup.error}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Restores */}
      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-primary" />
            Restore History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {restores.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <p className="text-xs">No restore operations recorded.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {restores.map(restore => (
                <div key={restore.id} className="p-3 rounded-lg border bg-card">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`text-[9px] font-mono ${
                        restore.status === "completed" ? "bg-success/10 text-success border-success/20" :
                        restore.status === "running" ? "bg-warning/10 text-warning border-warning/20" :
                        "bg-destructive/10 text-destructive border-destructive/20"
                      }`}>{restore.status}</Badge>
                      <span className="text-xs text-muted-foreground">Backup: {restore.backupId.slice(0, 8)}...</span>
                    </div>
                    <div className="flex gap-3 text-[10px] text-muted-foreground font-mono">
                      <span>Duration: {formatDuration(restore.durationMs)}</span>
                      <span>Recovery: {formatDuration(restore.recoveryTimeMs)}</span>
                    </div>
                  </div>
                  {restore.error && (
                    <p className="text-[10px] text-destructive font-mono mt-1">{restore.error}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
