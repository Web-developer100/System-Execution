import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  Settings as SettingsIcon, Users, Key, Shield, BookOpen,
  Palette, Bell, Cpu, Database,
  ChevronRight, Check, Copy, Plus, Trash2, Sparkles,
  RefreshCw, Globe, Eye, EyeOff, User, Crown, Lock,
  type LucideIcon,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

// ── Types ──────────────────────────────────────────────────────────────────

interface SystemUser {
  id: number;
  username: string;
  email: string;
  role: string;
  tier: string;
  status: "active" | "inactive";
  mfa: boolean;
  createdAt: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function SettingRow({ label, description, children }: {
  label: string; description?: string; children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 p-4 rounded-lg border border-border/50 bg-card/50">
      <div className="space-y-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const cfg: Record<string, string> = {
    super_admin: "border-destructive/50 text-destructive bg-destructive/10",
    admin: "border-orange-500/50 text-orange-400 bg-orange-500/10",
    operator: "border-primary/50 text-primary bg-primary/10",
    viewer: "border-border/50 text-muted-foreground bg-muted/20",
  };
  return (
    <Badge variant="outline" className={`rounded-md text-[10px] uppercase ${cfg[role] ?? cfg.viewer}`}>
      {role.replace("_", " ")}
    </Badge>
  );
}

// ── Users Tab ─────────────────────────────────────────────────────────────

function UsersTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("operator");
  const [showPw, setShowPw] = useState(false);

  const { data: users = [], isLoading } = useQuery<SystemUser[]>({
    queryKey: ["users"],
    queryFn: async () => {
      const r = await authFetch("/api/users");
      if (!r.ok) throw new Error("Failed to fetch users");
      return r.json();
    },
    refetchInterval: 30_000,
  });

  const createMut = useMutation({
    mutationFn: async (body: { username: string; password: string; role: string }) => {
      const r = await authFetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error((e as any).error ?? "Failed to create user");
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setAddOpen(false);
      setNewUsername(""); setNewPassword(""); setNewRole("operator");
      toast({ title: "User created", description: "New user added successfully." });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`/api/users/${id}`, { method: "DELETE" });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error((e as any).error ?? "Failed to delete");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast({ title: "User removed" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <Card className="glass-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm">User Management</CardTitle>
              <CardDescription>Manage team members and access levels</CardDescription>
            </div>
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="w-4 h-4 mr-1.5" /> Add User</Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-border/60 max-w-sm">
                <DialogHeader>
                  <DialogTitle className="text-sm">Create New User</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Username</Label>
                    <Input value={newUsername} onChange={e => setNewUsername(e.target.value)}
                      placeholder="username" className="bg-muted/30 border-border/50 h-9 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Password</Label>
                    <div className="relative">
                      <Input type={showPw ? "text" : "password"} value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        placeholder="••••••••" className="bg-muted/30 border-border/50 h-9 text-sm pr-9" />
                      <button onClick={() => setShowPw(p => !p)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Role</Label>
                    <Select value={newRole} onValueChange={setNewRole}>
                      <SelectTrigger className="bg-muted/30 border-border/50 h-9 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="super_admin">Super Admin</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="operator">Operator</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button className="w-full h-9"
                    disabled={!newUsername || !newPassword || createMut.isPending}
                    onClick={() => createMut.mutate({ username: newUsername, password: newPassword, role: newRole })}>
                    {createMut.isPending ? "Creating..." : "Create User"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}
            </div>
          ) : (
            <div className="rounded-lg border border-border/50 divide-y divide-border/30">
              {users.map(user => (
                <div key={user.id} className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                      {user.username[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{user.username}</p>
                        {user.mfa && <Badge className="bg-primary/10 text-primary rounded-md text-[9px] px-1.5 py-0">MFA</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className={`rounded-md text-[10px] ${user.status === "active" ? "border-green-500/30 text-green-400" : "border-border/30 text-muted-foreground"}`}>
                      {user.status}
                    </Badge>
                    <RoleBadge role={user.role} />
                    <span className="text-xs text-muted-foreground font-mono">{user.tier}</span>
                    {user.id !== 1 && (
                      <Button variant="ghost" size="icon" className="w-7 h-7 text-destructive/50 hover:text-destructive"
                        onClick={() => deleteMut.mutate(user.id)} disabled={deleteMut.isPending}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader><CardTitle className="text-sm">Role Definitions</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {[
            { role: "super_admin", icon: Crown, label: "Super Admin", permissions: "Full system access, user management, all features, delete everything" },
            { role: "admin", icon: Shield, label: "Admin", permissions: "Create/delete scans, manage tools, view all reports, manage users" },
            { role: "operator", icon: User, label: "Operator", permissions: "Create/run scans, view results, generate reports, manage proxies" },
            { role: "viewer", icon: Eye, label: "Viewer", permissions: "Read-only access to scans, vulnerabilities, and reports" },
          ].map(r => {
            const Icon = r.icon;
            return (
              <div key={r.role} className="flex items-center justify-between p-3 rounded-lg border border-border/50">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{r.label}</p>
                    <p className="text-xs text-muted-foreground">{r.permissions}</p>
                  </div>
                </div>
                <RoleBadge role={r.role} />
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

// ── API Keys Tab ──────────────────────────────────────────────────────────

function ApiKeysTab() {
  const { toast } = useToast();
  const { token } = useAuth();
  const [showToken, setShowToken] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied to clipboard" });
  };

  return (
    <div className="space-y-6">
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-sm">Current Session Token</CardTitle>
          <CardDescription>Your active JWT bearer token for API access</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg border border-border/50 bg-black/30 p-3 font-mono text-xs text-muted-foreground break-all">
            {showToken ? token ?? "No token" : "••••••••••••••••••••••••••••••••••••••••••••••"}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowToken(p => !p)}>
              {showToken ? <EyeOff className="w-3.5 h-3.5 mr-1.5" /> : <Eye className="w-3.5 h-3.5 mr-1.5" />}
              {showToken ? "Hide" : "Reveal"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => copy(token ?? "")}>
              {copied ? <Check className="w-3.5 h-3.5 mr-1.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-sm">API Documentation</CardTitle>
          <CardDescription>Available REST API endpoints</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border/50 divide-y divide-border/30 text-xs font-mono">
            {[
              { method: "POST", path: "/api/auth/login", desc: "Authenticate and get JWT token" },
              { method: "GET",  path: "/api/scans",      desc: "List all scans" },
              { method: "POST", path: "/api/scans",      desc: "Create new scan" },
              { method: "GET",  path: "/api/vulnerabilities", desc: "List vulnerabilities" },
              { method: "GET",  path: "/api/tools",      desc: "List installed tools" },
              { method: "POST", path: "/api/tools",      desc: "Install tool from GitHub" },
              { method: "GET",  path: "/api/reports",    desc: "List generated reports" },
              { method: "GET",  path: "/api/stats/dashboard", desc: "Dashboard statistics" },
              { method: "GET",  path: "/api/observability/health", desc: "System health check" },
              { method: "GET",  path: "/api/audit",      desc: "Audit logs (paginated)" },
              { method: "GET",  path: "/api/users",      desc: "List users (admin only)" },
              { method: "GET",  path: "/api/schedules",  desc: "List scan schedules" },
              { method: "GET",  path: "/api/proxies",    desc: "List configured proxies" },
              { method: "GET",  path: "/api/marketplace",desc: "Plugin marketplace" },
            ].map((ep, i) => (
              <div key={i} className="flex items-center gap-3 p-2.5 hover:bg-muted/20 transition-colors">
                <span className={`w-10 text-center font-bold text-[10px] ${ep.method === "GET" ? "text-primary" : ep.method === "POST" ? "text-yellow-400" : "text-destructive"}`}>
                  {ep.method}
                </span>
                <span className="flex-1 text-foreground/80">{ep.path}</span>
                <span className="text-muted-foreground hidden sm:block">{ep.desc}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

const SETTINGS_TABS = [
  { id: "general",  label: "General",       icon: SettingsIcon },
  { id: "users",    label: "Users & Roles",  icon: Users },
  { id: "api",      label: "API & Tokens",   icon: Key },
  { id: "auth",     label: "Authentication", icon: Shield },
  { id: "system",   label: "System",         icon: Cpu },
  { id: "branding", label: "Branding",       icon: Palette },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("general");
  const { toast } = useToast();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
          <SettingsIcon className="w-6 h-6 text-primary" />
          Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-1">System configuration and management</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/50 border border-border/50 flex-wrap h-auto p-1">
          {SETTINGS_TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <TabsTrigger key={tab.id} value={tab.id}
                className="text-xs gap-1.5 data-[state=active]:bg-background">
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {/* General */}
        <TabsContent value="general" className="mt-6 space-y-6">
          <Card className="glass-card">
            <CardHeader><CardTitle className="text-sm">Platform Configuration</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium">Platform Name</label>
                  <Input defaultValue="V8 Neural Exploitation Platform" className="bg-muted/30 border-border/50" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium">Support Email</label>
                  <Input defaultValue="security@v8platform.io" className="bg-muted/30 border-border/50" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium">Max Concurrent Scans</label>
                  <Input defaultValue="10" type="number" className="bg-muted/30 border-border/50" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium">Default Scan Timeout (min)</label>
                  <Input defaultValue="30" type="number" className="bg-muted/30 border-border/50" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium">Max Vulnerabilities per Scan</label>
                  <Input defaultValue="5000" type="number" className="bg-muted/30 border-border/50" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium">Session Timeout (hours)</label>
                  <Input defaultValue="24" type="number" className="bg-muted/30 border-border/50" />
                </div>
              </div>
              <div className="flex justify-end">
                <Button size="sm" onClick={() => toast({ title: "Settings saved" })}>
                  <Check className="w-3.5 h-3.5 mr-1.5" /> Save Changes
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader><CardTitle className="text-sm">Notifications</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <SettingRow label="Scan Completion" description="Receive notification when scans finish">
                <Switch defaultChecked />
              </SettingRow>
              <SettingRow label="Critical Vulnerabilities" description="Alert on critical/high severity findings">
                <Switch defaultChecked />
              </SettingRow>
              <SettingRow label="Worker Status" description="Notify when workers go offline">
                <Switch defaultChecked />
              </SettingRow>
              <SettingRow label="Plugin Updates" description="Plugin and platform update notifications">
                <Switch defaultChecked />
              </SettingRow>
              <SettingRow label="AI Decisions" description="Notify on AI verification completions">
                <Switch />
              </SettingRow>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Users */}
        <TabsContent value="users" className="mt-6">
          <UsersTab />
        </TabsContent>

        {/* API */}
        <TabsContent value="api" className="mt-6">
          <ApiKeysTab />
        </TabsContent>

        {/* Auth */}
        <TabsContent value="auth" className="mt-6 space-y-6">
          <Card className="glass-card">
            <CardHeader><CardTitle className="text-sm">Authentication Methods</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <SettingRow label="JWT Authentication" description="Token-based API authentication — currently active">
                <Switch defaultChecked disabled />
              </SettingRow>
              <SettingRow label="Multi-Factor Auth (TOTP)" description="Require 2FA for all admin users">
                <Switch defaultChecked />
              </SettingRow>
              <SettingRow label="SSO / SAML 2.0" description="Single sign-on with enterprise identity providers">
                <Switch />
              </SettingRow>
              <SettingRow label="OAuth 2.0 — GitHub" description="Allow GitHub login">
                <Switch />
              </SettingRow>
              <SettingRow label="OAuth 2.0 — Google" description="Allow Google Workspace login">
                <Switch />
              </SettingRow>
              <SettingRow label="LDAP / Active Directory" description="Directory sync for enterprise auth">
                <Switch />
              </SettingRow>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader><CardTitle className="text-sm">Security Policies</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <SettingRow label="Force Password Rotation (90 days)" description="Require password change every 90 days">
                <Switch defaultChecked />
              </SettingRow>
              <SettingRow label="Brute Force Protection" description="Lock account after 5 failed attempts">
                <Switch defaultChecked />
              </SettingRow>
              <SettingRow label="IP Allowlist" description="Restrict access to specific IP ranges">
                <Switch />
              </SettingRow>
              <SettingRow label="Session Binding" description="Bind sessions to IP address">
                <Switch />
              </SettingRow>
            </CardContent>
          </Card>
        </TabsContent>

        {/* System */}
        <TabsContent value="system" className="mt-6 space-y-6">
          <Card className="glass-card">
            <CardHeader><CardTitle className="text-sm">System Information</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                {[
                  { label: "Platform Version", value: "v2.0.4" },
                  { label: "Node.js", value: "v24.x LTS" },
                  { label: "Database", value: "PostgreSQL 16" },
                  { label: "API Server", value: "Express 5.x" },
                  { label: "Frontend", value: "React 18 + Vite 7" },
                  { label: "ORM", value: "Drizzle ORM" },
                ].map(item => (
                  <div key={item.label} className="p-3 rounded-lg border border-border/50 bg-muted/20">
                    <p className="text-muted-foreground">{item.label}</p>
                    <p className="font-mono font-medium mt-0.5">{item.value}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader><CardTitle className="text-sm">Scan Engine Settings</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <SettingRow label="AI False Positive Filtering" description="Use AI to eliminate false positives automatically">
                <Switch defaultChecked />
              </SettingRow>
              <SettingRow label="Automatic Verification" description="Re-test vulnerabilities before marking as confirmed">
                <Switch defaultChecked />
              </SettingRow>
              <SettingRow label="Docker Sandbox Execution" description="Run tools in isolated Docker containers">
                <Switch defaultChecked />
              </SettingRow>
              <SettingRow label="Distributed Workers" description="Use distributed worker pool for parallel scanning">
                <Switch defaultChecked />
              </SettingRow>
              <SettingRow label="Automatic Updates" description="Keep scanning tools updated automatically">
                <Switch />
              </SettingRow>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader><CardTitle className="text-sm">Storage & Retention</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium">Audit Log Retention (days)</label>
                  <Input defaultValue="365" type="number" className="bg-muted/30 border-border/50" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium">Report Retention (days)</label>
                  <Input defaultValue="180" type="number" className="bg-muted/30 border-border/50" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium">Scan Log Retention (days)</label>
                  <Input defaultValue="90" type="number" className="bg-muted/30 border-border/50" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium">Max Storage per Report (MB)</label>
                  <Input defaultValue="100" type="number" className="bg-muted/30 border-border/50" />
                </div>
              </div>
              <div className="flex justify-end">
                <Button size="sm" onClick={() => toast({ title: "Storage settings saved" })}>
                  <Check className="w-3.5 h-3.5 mr-1.5" /> Save
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Branding */}
        <TabsContent value="branding" className="mt-6 space-y-6">
          <Card className="glass-card">
            <CardHeader><CardTitle className="text-sm">Brand Customization</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium">Company Name</label>
                  <Input defaultValue="V8 Security" className="bg-muted/30 border-border/50" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium">Logo URL</label>
                  <Input placeholder="https://company.com/logo.png" className="bg-muted/30 border-border/50" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium">Primary Color</label>
                  <div className="flex gap-2">
                    <Input defaultValue="#00ff41" className="bg-muted/30 border-border/50 font-mono" />
                    <div className="w-10 h-10 rounded-lg border border-border shrink-0" style={{ backgroundColor: "#00ff41" }} />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium">Report Footer</label>
                  <Input defaultValue="CONFIDENTIAL — V8 Neural Exploitation Platform" className="bg-muted/30 border-border/50" />
                </div>
              </div>
              <Separator />
              <SettingRow label="Report Branding" description="Include company logo and name in generated reports">
                <Switch defaultChecked />
              </SettingRow>
              <SettingRow label="Custom Watermark" description="Add watermark to exported PDF reports">
                <Switch />
              </SettingRow>
              <div className="flex justify-end">
                <Button size="sm" onClick={() => toast({ title: "Branding settings saved" })}>
                  <Check className="w-3.5 h-3.5 mr-1.5" /> Save Branding
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
