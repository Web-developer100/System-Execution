import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import { useLogout } from "@workspace/api-client-react";
import { CommandPalette } from "@/components/CommandPalette";
import { NotificationsPopover } from "@/components/NotificationsPopover";
import {
  LayoutDashboard, Shield, Bug, FileText, Wrench, Globe, Calendar,
  LogOut, ChevronRight, Search, Bell, Settings, Users,
  Menu, X, ChevronLeft, Sparkles, Zap, Sliders, BookOpen, Activity,
  HardDrive, Trash2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/scans", label: "Scans", icon: Shield, badge: 0 },
  { href: "/vulnerabilities", label: "Vulnerabilities", icon: Bug, badge: 0 },
  { href: "/tools", label: "Tools", icon: Wrench },
  { href: "/proxies", label: "Proxies", icon: Globe },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/scheduling", label: "Scheduling", icon: Calendar },
  { href: "/observability", label: "Observability", icon: Activity },
  { href: "/observability/logs", label: "Logs", icon: FileText },
  { href: "/observability/tracing", label: "Tracing", icon: Activity },
  { href: "/observability/alerts", label: "Alerts", icon: Shield },
  { href: "/observability/dashboards", label: "Dashboards", icon: LayoutDashboard },
  { href: "/observability/backups", label: "Backups", icon: HardDrive },
  { href: "/observability/retention", label: "Retention", icon: Trash2 },
];

const SETTINGS_ITEMS: NavItem[] = [
  { href: "/settings", label: "Settings", icon: Sliders },
  { href: "/settings/users", label: "Users", icon: Users },
  { href: "/settings/audit", label: "Audit Logs", icon: BookOpen },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, setToken, token } = useAuth();
  const [location, setLocation] = useLocation();
  const { t } = useI18n();
  const logoutMut = useLogout();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  if (!isAuthenticated) return <>{children}</>;

  const handleLogout = () => {
    logoutMut.mutate(undefined, {
      onSettled: () => {
        setToken(null);
        setLocation("/login");
      },
    });
  };

  const userInitial = token ? token[0]?.toUpperCase() ?? "?" : "?";

  // Breadcrumbs from path
  const pathParts = location.split("/").filter(Boolean);
  const breadcrumbs = pathParts.map((part, idx) => ({
    label: part.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
    href: "/" + pathParts.slice(0, idx + 1).join("/"),
    isLast: idx === pathParts.length - 1,
  }));

  const renderNavLink = (item: NavItem) => {
    const isActive = location === item.href || location.startsWith(item.href + "/");
    const Icon = item.icon;
    return (
      <Link key={item.href} href={item.href}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 cursor-pointer group relative ${
                isActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-full" />
              )}
              <Icon className="w-4 h-4 shrink-0" />
              {!sidebarCollapsed && (
                <>
                  <span className="flex-1 text-sm truncate">{item.label}</span>
                  {(item.badge ?? 0) > 0 && (
                    <Badge className="h-5 min-w-5 px-1 bg-primary/20 text-primary text-[10px] font-mono rounded-full">
                      {item.badge}
                    </Badge>
                  )}
                </>
              )}
            </div>
          </TooltipTrigger>
          {sidebarCollapsed && (
            <TooltipContent side="right" className="glass z-50">
              {item.label}
            </TooltipContent>
          )}
        </Tooltip>
      </Link>
    );
  };

  return (
    <div className="h-screen w-full flex overflow-hidden bg-background">
      {/* Sidebar */}
      <aside
        className={`shrink-0 flex flex-col border-r border-border/50 bg-sidebar transition-all duration-200 ${
          sidebarCollapsed ? "w-16" : "w-60"
        }`}
      >
        {/* Logo Area */}
        <div className={`flex items-center h-14 px-4 border-b border-border/50 ${sidebarCollapsed ? "justify-center" : ""}`}>
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Shield className="w-4 h-4 text-primary" />
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground leading-tight">V8 Platform</div>
                <div className="text-[10px] text-muted-foreground font-mono">SECURITY OS</div>
              </div>
            </div>
          )}
          {sidebarCollapsed && (
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Shield className="w-4 h-4 text-primary" />
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5 mt-2">
          {NAV_ITEMS.map(renderNavLink)}
          <div className={`my-3 border-t border-border/30 ${sidebarCollapsed ? "mx-3" : ""}`} />
          <div className={`px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground ${sidebarCollapsed ? "text-center" : ""}`}>
            {sidebarCollapsed ? "..." : "System"}
          </div>
          {SETTINGS_ITEMS.map(renderNavLink)}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-2 border-t border-border/50 space-y-1">
          {/* Collapse toggle */}
          <button
            onClick={() => setSidebarCollapsed(prev => !prev)}
            className="w-full flex items-center justify-center h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>

          <Button
            variant="ghost"
            className={`w-full h-9 text-destructive/70 hover:text-destructive hover:bg-destructive/10 ${sidebarCollapsed ? "px-0 justify-center" : ""}`}
            onClick={handleLogout}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!sidebarCollapsed && <span className="ml-2 text-xs">Sign Out</span>}
          </Button>
        </div>
      </aside>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-14 shrink-0 flex items-center justify-between px-4 border-b border-border/50 bg-sidebar/50 backdrop-blur-sm">
          {/* Left: Breadcrumbs */}
          <div className="flex items-center gap-2 min-w-0">
            {breadcrumbs.length > 0 ? (
              <nav className="flex items-center gap-1.5 text-sm">
                {breadcrumbs.map((crumb, idx) => (
                  <span key={crumb.href} className="flex items-center gap-1.5">
                    {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />}
                    {crumb.isLast ? (
                      <span className="text-foreground font-medium truncate max-w-[200px]">{crumb.label}</span>
                    ) : (
                      <Link href={crumb.href} className="text-muted-foreground hover:text-foreground transition-colors truncate max-w-[150px]">
                        {crumb.label}
                      </Link>
                    )}
                  </span>
                ))}
              </nav>
            ) : null}
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            {/* Command palette trigger */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 gap-2 text-muted-foreground"
                  onClick={() => {
                    const event = new KeyboardEvent("keydown", { metaKey: true, key: "k", bubbles: true });
                    window.dispatchEvent(event);
                  }}
                >
                  <Search className="w-4 h-4" />
                  <span className="hidden sm:inline text-xs text-muted-foreground">Search</span>
                  <kbd className="hidden lg:inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono text-muted-foreground">
                    ⌘K
                  </kbd>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Search commands (⌘K)</TooltipContent>
            </Tooltip>

            {/* Notifications */}
            <NotificationsPopover />

            {/* User Avatar */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-muted/50 transition-colors">
                  <Avatar className="w-7 h-7">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                      {userInitial}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden md:inline text-sm font-medium text-foreground max-w-[100px] truncate">
                    {token?.slice(0, 8) ?? "User"}...
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent>Account settings</TooltipContent>
            </Tooltip>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          <div className="p-6 max-w-[1600px] mx-auto animate-fade-in">
            {children}
          </div>
        </main>
      </div>

      {/* Command Palette (global overlay) */}
      <CommandPalette />
    </div>
  );
}
