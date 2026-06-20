import { useState } from "react";
import { Bell, Shield, Bug, AlertTriangle, CheckCircle, XCircle, RefreshCw, Cpu, Terminal, Info, Filter, CheckCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Notification {
  id: string;
  type: "scan" | "vulnerability" | "system" | "worker" | "info";
  title: string;
  description: string;
  timestamp: Date;
  read: boolean;
  severity?: "critical" | "high" | "medium" | "low";
}

const ALL_NOTIFICATIONS: Notification[] = [
  { id: "1", type: "scan", title: "Scan #142 Completed", description: "Target: example.com — 12 vulnerabilities found (2 critical, 5 high, 3 medium, 2 low)", timestamp: new Date(Date.now() - 120000), read: false, severity: "high" },
  { id: "2", type: "vulnerability", title: "Critical XSS Detected", description: "Stored XSS vulnerability in /profile endpoint — CVSS 9.1. AI verification confirmed.", timestamp: new Date(Date.now() - 300000), read: false, severity: "critical" },
  { id: "3", type: "worker", title: "Worker Node Offline", description: "Worker-03 disconnected. Auto-recovery initiated — reconnected after 12s.", timestamp: new Date(Date.now() - 600000), read: false, severity: "high" },
  { id: "4", type: "system", title: "AI Verification Complete", description: "48 findings analyzed across scan #140. 42 confirmed, 6 false positives removed from reports.", timestamp: new Date(Date.now() - 900000), read: true },
  { id: "5", type: "info", title: "Plugin Updated", description: "Nuclei updated to v3.3.2 — 142 new vulnerability templates added to the engine.", timestamp: new Date(Date.now() - 1800000), read: true },
  { id: "6", type: "scan", title: "Scan #139 Failed", description: "Target: internal-staging.company.com — Connection timeout after 300s.", timestamp: new Date(Date.now() - 3600000), read: true, severity: "medium" },
  { id: "7", type: "system", title: "Database Backup Complete", description: "Automatic backup of vulnerability database completed. 2.4GB exported.", timestamp: new Date(Date.now() - 7200000), read: true },
  { id: "8", type: "vulnerability", title: "SQL Injection Confirmed", description: "Blind SQL injection in /api/search — SQLMap confirmation received. CVSS 8.3", timestamp: new Date(Date.now() - 10800000), read: true, severity: "high" },
];

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

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState(ALL_NOTIFICATIONS);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const filtered = filter === "all" ? notifications : notifications.filter(n => !n.read);
  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllRead = () => setNotifications(prev => prev.map(n => ({ ...n, read: true })));

  const toggleRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: !n.read } : n));
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
            {unreadCount} unread · {notifications.length} total
          </p>
        </div>
        <div className="flex items-center gap-2">
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
          }`}>All ({notifications.length})</button>
        <button onClick={() => setFilter("unread")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
            filter === "unread" ? "bg-primary/10 text-primary border-primary/30" : "bg-muted/30 text-muted-foreground border-border/50"
          }`}>Unread ({unreadCount})</button>
      </div>

      <div className="space-y-1">
        {filtered.length === 0 ? (
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
