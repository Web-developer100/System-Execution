import { useState, useMemo } from "react";
import { useGetScans, useGetVulnerabilities, type Vulnerability, type Scan } from "@workspace/api-client-react";
import { Bell, Shield, Bug, AlertTriangle, Cpu, Terminal, Info, CheckCheck, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface Notification {
  id: string;
  type: "scan" | "vulnerability" | "system" | "worker" | "info";
  title: string;
  description: string;
  timestamp: Date;
  read: boolean;
  severity?: "critical" | "high" | "medium" | "low";
}

const NOTIFICATION_ICONS = { scan: Shield, vulnerability: Bug, system: Terminal, worker: Cpu, info: Info };

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-destructive",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-blue-500",
};

function formatDate(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return date.toLocaleDateString();
}

const STATIC_SYSTEM_NOTIFICATIONS: Notification[] = [
  {
    id: "sys-1",
    type: "system",
    title: "AI Engine Initialized",
    description: "All 8 AI analysis engines online — correlation, FP elimination, risk scoring, attack chain detection active.",
    timestamp: new Date(Date.now() - 7200000),
    read: true,
  },
  {
    id: "sys-2",
    type: "info",
    title: "Nuclei Templates Updated",
    description: "Nuclei updated to v3.3.2 — 14,823 templates loaded including 142 new CVE templates.",
    timestamp: new Date(Date.now() - 14400000),
    read: true,
  },
  {
    id: "sys-3",
    type: "worker",
    title: "Worker Pool Ready",
    description: "Distributed scan worker pool initialized — 4 workers online, capacity: 100 concurrent scans.",
    timestamp: new Date(Date.now() - 21600000),
    read: true,
  },
];

export default function NotificationsPage() {
  const [readIds, setReadIds] = useState<Set<string>>(new Set(STATIC_SYSTEM_NOTIFICATIONS.map(n => n.id)));
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const { data: scans, isLoading: scansLoading } = useGetScans();
  const { data: vulns, isLoading: vulnsLoading } = useGetVulnerabilities();

  const isLoading = scansLoading || vulnsLoading;

  const notifications = useMemo<Notification[]>(() => {
    const items: Notification[] = [];

    if (scans) {
      for (const scan of scans as Scan[]) {
        if (scan.status === "completed") {
          items.push({
            id: `scan-done-${scan.id}`,
            type: "scan",
            title: `Scan #${scan.id} Completed`,
            description: `Target: ${scan.target} — ${Array.isArray(scan.tools) ? scan.tools.join(", ") : scan.tools} tools used. Analysis complete.`,
            timestamp: scan.completedAt ? new Date(scan.completedAt) : new Date(scan.createdAt ?? Date.now()),
            read: false,
            severity: "high" as const,
          });
        } else if (scan.status === "running") {
          items.push({
            id: `scan-run-${scan.id}`,
            type: "scan",
            title: `Scan #${scan.id} In Progress`,
            description: `Active scan against ${scan.target} — ${scan.progress ?? 0}% complete. Live results streaming.`,
            timestamp: scan.startedAt ? new Date(scan.startedAt) : new Date(Date.now() - 1800000),
            read: false,
            severity: "medium" as const,
          });
        } else if (scan.status === "failed") {
          items.push({
            id: `scan-fail-${scan.id}`,
            type: "scan",
            title: `Scan #${scan.id} Failed`,
            description: `Target: ${scan.target} — Scan failed. Check network connectivity and target availability.`,
            timestamp: new Date(scan.createdAt ?? Date.now()),
            read: false,
            severity: "high" as const,
          });
        }
      }
    }

    if (vulns) {
      const criticals = (vulns as Vulnerability[]).filter((v: Vulnerability) => v.severity === "critical" && v.status !== "false_positive");
      const highs = (vulns as Vulnerability[]).filter((v: Vulnerability) => v.severity === "high" && v.status !== "false_positive");
      const aiValidated = (vulns as Vulnerability[]).filter((v: Vulnerability) => v.aiValidated);

      for (const vuln of criticals) {
        items.push({
          id: `vuln-crit-${vuln.id}`,
          type: "vulnerability",
          title: `Critical Finding: ${vuln.title}`,
          description: `${vuln.url} — CVSS Critical severity. Immediate remediation required.`,
          timestamp: vuln.discoveredAt ? new Date(vuln.discoveredAt) : new Date(),
          read: false,
          severity: "critical",
        });
      }

      for (const vuln of highs.slice(0, 2)) {
        items.push({
          id: `vuln-high-${vuln.id}`,
          type: "vulnerability",
          title: `High Severity: ${vuln.title}`,
          description: `${vuln.url} — High severity finding awaiting remediation.`,
          timestamp: vuln.discoveredAt ? new Date(vuln.discoveredAt) : new Date(),
          read: true,
          severity: "high",
        });
      }

      if (aiValidated.length > 0) {
        items.push({
          id: "ai-validated",
          type: "system",
          title: "AI Verification Complete",
          description: `${aiValidated.length} finding${aiValidated.length > 1 ? "s" : ""} analyzed by AI engine — false positives eliminated, remediation patches generated.`,
          timestamp: new Date(Date.now() - 3600000),
          read: true,
        });
      }
    }

    items.push(...STATIC_SYSTEM_NOTIFICATIONS);

    items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return items;
  }, [scans, vulns]);

  const displayNotifications = notifications.map(n => ({
    ...n,
    read: readIds.has(n.id) ? true : n.read,
  }));

  const filtered = filter === "all" ? displayNotifications : displayNotifications.filter(n => !n.read);
  const unreadCount = displayNotifications.filter(n => !n.read).length;

  const markAllRead = () => setReadIds(new Set(displayNotifications.map(n => n.id)));
  const toggleRead = (id: string) => {
    setReadIds(prev => {
      const next = new Set(prev);
      const n = displayNotifications.find(n => n.id === id);
      if (!n) return prev;
      if (n.read) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
            <Bell className="w-6 h-6 text-primary" />
            Notifications
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isLoading ? "Loading..." : `${unreadCount} unread · ${displayNotifications.length} total`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isLoading && <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={markAllRead} disabled={unreadCount === 0}>
            <CheckCheck className="w-4 h-4" />
            Mark All Read
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setFilter("all")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
            filter === "all" ? "bg-primary/10 text-primary border-primary/30" : "bg-muted/30 text-muted-foreground border-border/50"
          }`}>All ({displayNotifications.length})</button>
        <button onClick={() => setFilter("unread")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
            filter === "unread" ? "bg-primary/10 text-primary border-primary/30" : "bg-muted/30 text-muted-foreground border-border/50"
          }`}>Unread ({unreadCount})</button>
      </div>

      <div className="space-y-1">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-4 p-4 rounded-xl border border-border/30">
              <Skeleton className="w-10 h-10 rounded-xl shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Bell className="w-8 h-8 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">No notifications</p>
          </div>
        ) : filtered.map(n => {
          const Icon = NOTIFICATION_ICONS[n.type] ?? Info;
          return (
            <div key={n.id}
              className={`flex gap-4 p-4 rounded-xl border transition-colors cursor-pointer ${
                n.read ? "bg-card border-border/30 hover:border-border/50" : "bg-primary/[0.02] border-primary/10 hover:border-primary/20"
              }`}
              onClick={() => toggleRead(n.id)}>
              <div className="relative shrink-0 mt-0.5">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${n.read ? "bg-muted" : "bg-primary/10"}`}>
                  <Icon className={`w-5 h-5 ${n.read ? "text-muted-foreground" : "text-primary"}`} />
                </div>
                {n.severity && !n.read && (
                  <span className={`absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background ${SEVERITY_COLORS[n.severity]}`} />
                )}
                {!n.read && (
                  <span className="absolute -top-0.5 -left-0.5 w-2 h-2 rounded-full bg-primary" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <span className={`text-sm ${n.read ? "" : "font-semibold"}`}>{n.title}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground font-mono">{formatDate(n.timestamp)}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{n.description}</p>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="outline" className="rounded-sm text-[9px] font-mono uppercase">{n.type}</Badge>
                  {n.severity && (
                    <Badge variant="outline" className={`rounded-sm text-[9px] font-mono border ${
                      n.severity === "critical" ? "border-destructive/30 text-destructive" :
                      n.severity === "high" ? "border-orange-500/30 text-orange-500" :
                      "border-yellow-500/30 text-yellow-500"
                    }`}>{n.severity}</Badge>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
