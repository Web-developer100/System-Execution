import { useAuth } from "@/hooks/use-auth";
import { Link, useLocation } from "wouter";
import { Shield, Activity, Terminal, Globe, AlertTriangle, FileText, LogOut, Globe2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useLogout } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";

export function Layout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, setToken } = useAuth();
  const [, setLocation] = useLocation();
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

  const navItems = [
    { href: "/dashboard", label: "nav.dashboard", icon: Activity },
    { href: "/scans", label: "nav.scans", icon: Shield },
    { href: "/tools", label: "nav.tools", icon: Terminal },
    { href: "/proxies", label: "nav.proxies", icon: Globe },
    { href: "/vulnerabilities", label: "nav.vulnerabilities", icon: AlertTriangle },
    { href: "/reports", label: "nav.reports", icon: FileText },
  ];

  return (
    <div className="min-h-[100dvh] w-full flex crt relative overflow-hidden bg-background text-foreground">
      <div className="w-64 border-l border-r border-border bg-card/80 p-4 flex flex-col glow-box z-10">
        <div className="flex items-center gap-3 mb-8 px-2 glow-text">
          <Terminal className="w-8 h-8 text-primary" />
          <div className="font-bold text-xl tracking-tighter">
            V8_CORE<span className="cursor-blink">_</span>
          </div>
        </div>

        <nav className="flex-1 flex flex-col gap-2">
          {navItems.map(item => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className="flex items-center gap-3 px-3 py-2 border border-transparent hover:border-primary/50 hover:bg-primary/10 transition-colors rounded-none group cursor-pointer">
                <Icon className="w-5 h-5 group-hover:text-primary transition-colors" />
                <span className="text-sm">{t(item.label)}</span>
              </Link>
            )
          })}
        </nav>

        <div className="mt-auto pt-4 border-t border-border flex flex-col gap-2">
          <Button variant="outline" className="w-full justify-start rounded-none border-border hover:bg-primary/20 hover:text-primary glow-text" onClick={toggleLang}>
            <Globe2 className="w-4 h-4 mr-2 rtl:ml-2 rtl:mr-0" />
            {lang === 'ar' ? 'English' : 'عربي'}
          </Button>
          <Button variant="outline" className="w-full justify-start rounded-none border-destructive text-destructive hover:bg-destructive/20 hover:text-destructive glow-text" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2 rtl:ml-2 rtl:mr-0" />
            {t("nav.logout")}
          </Button>
        </div>
      </div>

      <main className="flex-1 flex flex-col h-[100dvh] overflow-hidden z-10">
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
