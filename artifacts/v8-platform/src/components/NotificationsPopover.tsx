import { useState } from "react";
import {
  Bell, Shield, Bug, AlertTriangle, CheckCircle, XCircle,
  RefreshCw, Cpu, Terminal, Info, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Notification {
  id: string;
  type: "scan" | "vulnerability" | "system" | "worker" | "info";
  title: string;
  description: string;
  timestamp: Date;
  read: boolean;
  severity?: "critical" | "high" | "medium" | "low";
}

const NOTIFICATION_ICONS: Record<string, LucideIcon> = {
  scan: Shield,
  vulnerability: Bug,
  system: Terminal,
  worker: Cpu,
  info: Info,
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-destructive",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-blue-500",
};

const DEFAULT_NOTIFICATIONS: Notification[] = [
  { id: "1", type: "scan", title: "Scan #142 Completed", description: "Target: example.com — 12 vulnerabilities found", timestamp: new Date(Date.now() - 120000), read: false, severity: "high" },
  { id: "2", type: "vulnerability", title: "Critical XSS Detected", description: "Stored XSS in /profile endpoint — CVSS 9.1", timestamp: new Date(Date.now() - 300000), read: false, severity: "critical" },
  { id: "3", type: "worker", title: "Worker Node Offline", description: "Worker-03 disconnected — auto-recovery initiated", timestamp: new Date(Date.now() - 600000), read: false, severity: "high" },
  { id: "4", type: "system", title: "AI Verification Complete", description: "48 findings analyzed — 42 confirmed, 6 false positives removed", timestamp: new Date(Date.now() - 900000), read: true },
  { id: "5", type: "info", title: "Plugin Updated", description: "Nuclei v3.3.2 installed — 142 new templates added", timestamp: new Date(Date.now() - 1800000), read: true },
];

export function NotificationsPopover() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState(DEFAULT_NOTIFICATIONS);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        className="h-9 w-9 relative text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(!open)}
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-destructive text-destructive-foreground text-[9px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 z-50 animate-scale-in">
            <div className="glass rounded-xl border border-border/50 shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold">Notifications</span>
                  {unreadCount > 0 && (
                    <Badge className="bg-primary/10 text-primary text-[10px] font-mono rounded-full h-5 px-1.5">
                      {unreadCount} new
                    </Badge>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className="text-xs text-primary hover:text-primary/80 transition-colors"
                  >
                    Mark all read
                  </button>
                )}
              </div>

              {/* List */}
              <ScrollArea className="max-h-[400px]">
                {notifications.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground text-sm">
                    No notifications
                  </div>
                ) : (
                  <div className="divide-y divide-border/30">
                    {notifications.map(n => {
                      const Icon = NOTIFICATION_ICONS[n.type] ?? Info;
                      return (
                        <div
                          key={n.id}
                          className={`flex gap-3 px-4 py-3 transition-colors hover:bg-muted/30 cursor-pointer ${
                            !n.read ? "bg-primary/[0.02]" : ""
                          }`}
                        >
                          <div className="relative shrink-0 mt-0.5">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                              !n.read ? "bg-primary/10" : "bg-muted"
                            }`}>
                              <Icon className={`w-4 h-4 ${!n.read ? "text-primary" : "text-muted-foreground"}`} />
                            </div>
                            {n.severity && !n.read && (
                              <span className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-background ${SEVERITY_COLORS[n.severity]}`} />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <span className={`text-sm truncate ${!n.read ? "font-semibold" : ""}`}>
                                {n.title}
                              </span>
                              <span className="shrink-0 text-[11px] text-muted-foreground font-mono">
                                {formatTimeAgo(n.timestamp)}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                              {n.description}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>

              {/* Footer */}
              <div className="px-4 py-2.5 border-t border-border/50 text-center">
                <button
                  onClick={() => {
                    setOpen(false);
                    window.location.href = "/notifications";
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  View all notifications
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
