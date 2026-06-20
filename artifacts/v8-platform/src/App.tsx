import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { I18nProvider } from "@/lib/i18n";
import { ThemeProvider } from "next-themes";
import { Layout } from "@/components/Layout";
import BootLoader from "@/pages/BootLoader";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Scans from "@/pages/Scans";
import Tools from "@/pages/Tools";
import Proxies from "@/pages/Proxies";
import Vulnerabilities from "@/pages/Vulnerabilities";
import Reports from "@/pages/Reports";
import SettingsPage from "@/pages/Settings";
import Marketplace from "@/pages/Marketplace";
import NotificationsPage from "@/pages/Notifications";
import ObservabilityDashboard from "@/pages/ObservabilityDashboard";
import AuditLogs from "@/pages/AuditLogs";
import Scheduling from "@/pages/Scheduling";
import { useAuth } from "@/hooks/use-auth";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 10_000,
    },
  },
});

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation("/login");
    }
  }, [isAuthenticated, setLocation]);

  if (!isAuthenticated) return null;

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={BootLoader} />
      <Route path="/login" component={Login} />
      <Route>
        <Layout>
          <Switch>
            <Route path="/dashboard"><ProtectedRoute component={Dashboard} /></Route>
            <Route path="/scans"><ProtectedRoute component={Scans} /></Route>
            <Route path="/tools"><ProtectedRoute component={Tools} /></Route>
            <Route path="/proxies"><ProtectedRoute component={Proxies} /></Route>
            <Route path="/vulnerabilities"><ProtectedRoute component={Vulnerabilities} /></Route>
            <Route path="/reports"><ProtectedRoute component={Reports} /></Route>
            <Route path="/settings(.*)"><ProtectedRoute component={SettingsPage} /></Route>
            <Route path="/marketplace"><ProtectedRoute component={Marketplace} /></Route>
            <Route path="/notifications"><ProtectedRoute component={NotificationsPage} /></Route>
            <Route path="/observability"><ProtectedRoute component={ObservabilityDashboard} /></Route>
            <Route path="/audit"><ProtectedRoute component={AuditLogs} /></Route>
            <Route path="/scheduling"><ProtectedRoute component={Scheduling} /></Route>
            <Route component={NotFound} />
          </Switch>
        </Layout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </I18nProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
