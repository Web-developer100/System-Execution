import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { I18nProvider } from "@/lib/i18n";
import { Layout } from "@/components/Layout";
import BootLoader from "@/pages/BootLoader";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Scans from "@/pages/Scans";
import Tools from "@/pages/Tools";
import Proxies from "@/pages/Proxies";
import Vulnerabilities from "@/pages/Vulnerabilities";
import Reports from "@/pages/Reports";
import { useAuth } from "@/hooks/use-auth";

const queryClient = new QueryClient();

function ProtectedRoute({ component: Component }: { component: any }) {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  if (!isAuthenticated) {
    setLocation("/login");
    return null;
  }

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
            <Route path="/dashboard">
              <ProtectedRoute component={Dashboard} />
            </Route>
            <Route path="/scans">
              <ProtectedRoute component={Scans} />
            </Route>
            <Route path="/tools">
              <ProtectedRoute component={Tools} />
            </Route>
            <Route path="/proxies">
              <ProtectedRoute component={Proxies} />
            </Route>
            <Route path="/vulnerabilities">
              <ProtectedRoute component={Vulnerabilities} />
            </Route>
            <Route path="/reports">
              <ProtectedRoute component={Reports} />
            </Route>
            <Route component={NotFound} />
          </Switch>
        </Layout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
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
  );
}

export default App;
