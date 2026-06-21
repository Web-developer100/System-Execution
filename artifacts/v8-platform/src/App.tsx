import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
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
import { AuthProvider, useAuth } from "@/hooks/use-auth";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 10_000,
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * Guards a route — if no token in localStorage, redirect to /login immediately.
 * Uses localStorage directly (not context) to avoid React state race conditions.
 */
function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const token = localStorage.getItem("v8_token");
  if (!token) return <Redirect to="/login" />;
  return <Component />;
}

function AppRoutes() {
  const { isAuthenticated } = useAuth();

  return (
    <Switch>
      {/* Boot sequence → redirects to /dashboard if authenticated, else /login */}
      <Route path="/" component={BootLoader} />

      {/* Login: if already authenticated, skip to dashboard */}
      <Route path="/login">
        {isAuthenticated ? <Redirect to="/dashboard" /> : <Login />}
      </Route>

      {/* All protected routes wrapped in Layout */}
      <Route>
        <Layout>
          <Switch>
            <Route path="/dashboard"><ProtectedRoute component={Dashboard} /></Route>
            <Route path="/scans"><ProtectedRoute component={Scans} /></Route>
            <Route path="/tools"><ProtectedRoute component={Tools} /></Route>
            <Route path="/proxies"><ProtectedRoute component={Proxies} /></Route>
            <Route path="/vulnerabilities"><ProtectedRoute component={Vulnerabilities} /></Route>
            <Route path="/reports"><ProtectedRoute component={Reports} /></Route>
            <Route path="/settings"><ProtectedRoute component={SettingsPage} /></Route>
            <Route path="/settings/:tab"><ProtectedRoute component={SettingsPage} /></Route>
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
        <AuthProvider>
          <I18nProvider>
            <TooltipProvider>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                <AppRoutes />
              </WouterRouter>
              <Toaster />
            </TooltipProvider>
          </I18nProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
