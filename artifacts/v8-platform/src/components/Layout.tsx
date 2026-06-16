import { useAuth } from "@/hooks/use-auth";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Shield, Wrench, Globe, Bug, FileText,
  LogOut, Languages, Terminal, ChevronRight
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useLogout } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";

const APP_VERSION = "2.0.4";

const NAV_ITEMS = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { href: "/scans", labelKey: "nav.scans", icon: Shield },
  { href: "/tools", labelKey: "nav.tools", icon: Wrench },
  { href: "/proxies", labelKey: "nav.proxies", icon: Globe },
  { href: "/vulnerabilities", labelKey: "nav.vulnerabilities", icon: Bug },
  { href: "/reports", labelKey: "nav.reports", icon: FileText },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, setToken } = useAuth();
  const [location, setLocation] = useLocation();
  const { t, toggleLang, lang } = useI18n();
  const logoutMut = useLogout();

  if (!isAuthenticated) {
    return <>{children}</>;
  }

  const handleLogout = () => {
    logoutMut.mutate(undefined, {
      onSettled: () => {
        setToken(null);
        setLocation("/login");
      }
    });
  };

  return (
    <div className="min-h-[100dvh] w-full flex crt relative overflow-hidden bg-background text-foreground">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r border-primary/20 bg-black flex flex-col glow-box z-10">
        {/* Logo */}
        <div className="p-5 border-b border-primary/20">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 border border-primary glow-box flex items-center justify-center">
              <Terminal className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="font-bold text-lg tracking-widest text-primary glow-text leading-none">
                V8_CORE<span className="cursor-blink text-primary">_</span>
              </div>
              <div className="text-[10px] text-primary/40 tracking-widest mt-0.5">
                NEURAL EXPLOITATION
              </div>
            </div>
          </div>
        </div>

        {/* Version badge */}
        <div className="px-5 py-2 border-b border-primary/10">
          <div className="flex items-center justify-between text-[10px] font-mono text-primary/30 uppercase tracking-widest">
            <span>{t('app.version')}</span>
            <span className="text-primary/50">v{APP_VERSION}</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(({ href, labelKey, icon: Icon }) => {
            const isActive = location === href;
            return (
              <Link
                key={href}
                href={href}
                className={`
                  flex items-center gap-3 px-3 py-2.5 text-sm font-mono uppercase tracking-wider
                  transition-all duration-150 group relative
                  ${isActive
                    ? "bg-primary/15 text-primary border border-primary/40 glow-box"
                    : "text-primary/50 border border-transparent hover:text-primary hover:border-primary/30 hover:bg-primary/5"
                  }
                `}
              >
                {isActive && (
                  <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary glow-box" />
                )}
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-primary" : "text-primary/50 group-hover:text-primary"}`} />
                <span className="flex-1 truncate">{t(labelKey)}</span>
                {isActive && <ChevronRight className="w-3 h-3 text-primary/60" />}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-primary/20 space-y-2">
          <Button
            variant="outline"
            className="w-full justify-start rounded-none border-primary/30 text-primary/60 hover:bg-primary/10 hover:text-primary hover:border-primary/60 text-xs uppercase tracking-wider h-9"
            onClick={toggleLang}
          >
            <Languages className="w-4 h-4 mr-2 rtl:ml-2 rtl:mr-0 shrink-0" />
            {lang === 'ar' ? 'Switch to English' : 'التحويل للعربية'}
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start rounded-none border-destructive/40 text-destructive/70 hover:bg-destructive/10 hover:text-destructive hover:border-destructive text-xs uppercase tracking-wider h-9"
            onClick={handleLogout}
          >
            <LogOut className="w-4 h-4 mr-2 rtl:ml-2 rtl:mr-0 shrink-0" />
            {t("nav.logout")}
          </Button>

          <div className="text-center text-primary/20 text-[10px] font-mono tracking-widest pt-1">
            ENCRYPTION: AES-256-BIT
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-[100dvh] overflow-hidden z-10 min-w-0">
        {/* Top bar */}
        <header className="shrink-0 h-10 border-b border-primary/20 bg-black/80 flex items-center justify-between px-6">
          <div className="flex items-center gap-2 text-[11px] font-mono text-primary/40 uppercase tracking-widest">
            <span className="w-2 h-2 rounded-full bg-primary glow-box animate-pulse" />
            SYSTEM_KERNEL_V{APP_VERSION}
            <span className="text-primary/20 mx-2">|</span>
            PROCESS_LIVE
          </div>
          <div className="text-[11px] font-mono text-primary/30 uppercase tracking-widest">
            {new Date().toISOString().substring(0, 10)}
          </div>
        </header>

        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
