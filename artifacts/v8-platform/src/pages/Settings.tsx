import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import {
  Settings as SettingsIcon, Users, Key, Shield, BookOpen,
  Palette, Bell, Cpu, Database, RefreshCw, Globe,
  ChevronRight, Check, Copy, Plus, Trash2, Sparkles,
  type LucideIcon,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

const SETTINGS_TABS = [
  { id: "general", label: "General", icon: SettingsIcon },
  { id: "users", label: "Users & Roles", icon: Users },
  { id: "api", label: "API Keys", icon: Key },
  { id: "auth", label: "Authentication", icon: Shield },
  { id: "audit", label: "Audit Logs", icon: BookOpen },
  { id: "branding", label: "Branding", icon: Palette },
];

function SettingsSection({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={`space-y-6 ${className ?? ""}`}>{children}</div>;
}

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
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

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("general");

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
              <TabsTrigger key={tab.id} value={tab.id} className="text-xs gap-1.5 data-[state=active]:bg-background">
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {/* General */}
        <TabsContent value="general" className="mt-6">
          <SettingsSection>
            <Card className="glass-card">
              <CardHeader><CardTitle className="text-sm">System Configuration</CardTitle></CardHeader>
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
                    <Input defaultValue="5" type="number" className="bg-muted/30 border-border/50" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium">Default Scan Timeout (min)</label>
                    <Input defaultValue="30" type="number" className="bg-muted/30 border-border/50" />
                  </div>
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
                <SettingRow label="System Updates" description="Plugin and platform update notifications">
                  <Switch defaultChecked />
                </SettingRow>
              </CardContent>
            </Card>
          </SettingsSection>
        </TabsContent>

        {/* Users & Roles */}
        <TabsContent value="users" className="mt-6">
          <SettingsSection>
            <Card className="glass-card">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">User Management</CardTitle>
                    <CardDescription>Manage team members and permissions</CardDescription>
                  </div>
                  <Button size="sm"><Plus className="w-4 h-4 mr-1.5" /> Invite User</Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border border-border/50 divide-y divide-border/30">
                  {[
                    { name: "admin", role: "Administrator", email: "admin@v8platform.io", status: "active", mfa: true },
                    { name: "operator", role: "Operator", email: "ops@v8platform.io", status: "active", mfa: false },
                    { name: "viewer", role: "Viewer", email: "view@v8platform.io", status: "inactive", mfa: false },
                  ].map(user => (
                    <div key={user.name} className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                          {user.name[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{user.name}</p>
                          <p className="text-xs text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className={`rounded-md text-[10px] ${user.status === "active" ? "border-success/30 text-success" : "border-border/30 text-muted-foreground"}`}>{user.status}</Badge>
                        <span className="text-xs text-muted-foreground">{user.role}</span>
                        {user.mfa && <Badge className="bg-primary/10 text-primary rounded-md text-[10px]">MFA</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardHeader><CardTitle className="text-sm">Role Definitions</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {[
                  { role: "Administrator", permissions: "Full system access, user management, all features" },
                  { role: "Operator", permissions: "Create/run scans, view results, generate reports" },
                  { role: "Viewer", permissions: "Read-only access to scans, vulnerabilities, and reports" },
                ].map(r => (
                  <div key={r.role} className="flex items-center justify-between p-3 rounded-lg border border-border/50">
                    <div>
                      <p className="text-sm font-medium">{r.role}</p>
                      <p className="text-xs text-muted-foreground">{r.permissions}</p>
                    </div>
                    <Button variant="ghost" size="sm">Edit</Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </SettingsSection>
        </TabsContent>

        {/* API Keys */}
        <TabsContent value="api" className="mt-6">
          <SettingsSection>
            <Card className="glass-card">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">API Keys</CardTitle>
                    <CardDescription>Manage API access tokens</CardDescription>
                  </div>
                  <Button size="sm"><Plus className="w-4 h-4 mr-1.5" /> Generate Key</Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border border-border/50 divide-y divide-border/30">
                  {[
                    { name: "Production", key: "v8_prod_xxxxxxxxxxxx", created: "2025-01-15", lastUsed: "2 hours ago" },
                    { name: "Development", key: "v8_dev_yyyyyyyyyyyy", created: "2025-02-20", lastUsed: "1 day ago" },
                    { name: "CI/CD Pipeline", key: "v8_ci_zzzzzzzzzzzz", created: "2025-03-01", lastUsed: "3 days ago" },
                  ].map(k => (
                    <div key={k.name} className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
                      <div className="space-y-1">
                        <p className="text-sm font-medium">{k.name}</p>
                        <p className="text-xs font-mono text-muted-foreground flex items-center gap-2">
                          {k.key}
                          <button className="hover:text-foreground transition-colors"><Copy className="w-3 h-3" /></button>
                        </p>
                        <p className="text-[10px] text-muted-foreground">Created {k.created} · Last used {k.lastUsed}</p>
                      </div>
                      <Button variant="ghost" size="icon" className="text-destructive/70 hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </SettingsSection>
        </TabsContent>

        {/* Auth */}
        <TabsContent value="auth" className="mt-6">
          <SettingsSection>
            <Card className="glass-card">
              <CardHeader><CardTitle className="text-sm">Authentication Methods</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <SettingRow label="JWT Authentication" description="Token-based API authentication">
                  <Switch defaultChecked />
                </SettingRow>
                <SettingRow label="Multi-Factor Auth" description="Require MFA for all users">
                  <Switch defaultChecked />
                </SettingRow>
                <SettingRow label="SSO / SAML" description="Single sign-on with identity providers">
                  <Switch />
                </SettingRow>
                <SettingRow label="OAuth 2.0" description="GitHub, GitLab, Google authentication">
                  <Switch />
                </SettingRow>
                <SettingRow label="LDAP Integration" description="Active Directory / LDAP directory sync">
                  <Switch />
                </SettingRow>
              </CardContent>
            </Card>
          </SettingsSection>
        </TabsContent>

        {/* Audit Logs */}
        <TabsContent value="audit" className="mt-6">
          <SettingsSection>
            <Card className="glass-card">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Audit Trail</CardTitle>
                  <div className="flex items-center gap-2">
                    <Input placeholder="Filter events..." className="w-48 h-8 text-xs bg-muted/30 border-border/50" />
                    <Button variant="outline" size="sm"><RefreshCw className="w-3 h-3 mr-1" /> Refresh</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border border-border/50 divide-y divide-border/30 text-xs font-mono">
                  {[
                    { time: "14:32:01", user: "admin", action: "Scan #142 completed", target: "example.com" },
                    { time: "14:28:15", user: "admin", action: "AI validation triggered", target: "Vuln #89" },
                    { time: "14:22:44", user: "operator", action: "New scan initiated", target: "testsite.io" },
                    { time: "14:15:00", user: "system", action: "Plugin updated", target: "nuclei v3.3.2" },
                    { time: "14:10:22", user: "admin", action: "User invited", target: "dev@company.com" },
                    { time: "14:05:17", user: "system", action: "Worker reconnected", target: "worker-03" },
                  ].map((log, i) => (
                    <div key={i} className="flex items-center gap-4 p-3 hover:bg-muted/30 transition-colors">
                      <span className="text-muted-foreground w-16 shrink-0">{log.time}</span>
                      <Badge variant="outline" className="rounded-sm text-[9px] font-mono w-14 justify-center shrink-0">{log.user}</Badge>
                      <span className="flex-1">{log.action}</span>
                      <span className="text-muted-foreground">{log.target}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </SettingsSection>
        </TabsContent>

        {/* Branding */}
        <TabsContent value="branding" className="mt-6">
          <SettingsSection>
            <Card className="glass-card">
              <CardHeader><CardTitle className="text-sm">Brand Customization</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium">Company Name</label>
                    <Input defaultValue="ACME Security" className="bg-muted/30 border-border/50" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium">Logo URL</label>
                    <Input placeholder="https://company.com/logo.png" className="bg-muted/30 border-border/50" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium">Primary Color</label>
                    <div className="flex gap-2">
                      <Input defaultValue="#3B82F6" className="bg-muted/30 border-border/50 font-mono" />
                      <div className="w-10 h-10 rounded-lg bg-blue-500 border border-border shrink-0" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium">Report Footer</label>
                    <Input defaultValue="Confidential — ACME Security" className="bg-muted/30 border-border/50" />
                  </div>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Report Branding</p>
                    <p className="text-xs text-muted-foreground">Include company logo and name in generated reports</p>
                  </div>
                  <Switch defaultChecked />
                </div>
              </CardContent>
            </Card>
          </SettingsSection>
        </TabsContent>
      </Tabs>
    </div>
  );
}
