import { useState } from "react";
import { useGetVulnerabilities, useGetVulnerabilityStats, getGetVulnerabilitiesQueryKey } from "@workspace/api-client-react";
import type { Vulnerability } from "@workspace/api-client-react";
import { useI18n } from "@/lib/i18n";
import {
  Bug, Cpu, ChevronRight, X, Loader2, Sparkles, Search,
  Shield, AlertTriangle, ExternalLink, Copy, FileText,
  Layers, GitBranch, Terminal, Globe, Eye,
  Filter, ArrowUpDown, type LucideIcon,
} from "lucide-react";
import { AttackChainGraph } from "@/components/AttackChainGraph";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

type Severity = "critical" | "high" | "medium" | "low" | "info";

const SEVERITY_CONFIG: Record<Severity, { color: string; bg: string; border: string; icon: LucideIcon }> = {
  critical: { color: "text-destructive", bg: "bg-destructive/10", border: "border-destructive/50", icon: AlertTriangle },
  high: { color: "text-orange-500", bg: "bg-orange-500/10", border: "border-orange-500/40", icon: AlertTriangle },
  medium: { color: "text-yellow-500", bg: "bg-yellow-500/10", border: "border-yellow-500/30", icon: Shield },
  low: { color: "text-blue-400", bg: "bg-blue-400/8", border: "border-blue-400/30", icon: Shield },
  info: { color: "text-muted-foreground", bg: "bg-muted/10", border: "border-border/30", icon: FileText },
};

const SEVERITIES: Severity[] = ["critical", "high", "medium", "low", "info"];

function SeverityBadge({ severity }: { severity: string }) {
  const cfg = SEVERITY_CONFIG[severity as Severity] ?? SEVERITY_CONFIG.info;
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={`uppercase text-[10px] font-semibold rounded-md border ${cfg.color} ${cfg.bg} ${cfg.border} gap-1`}>
      <Icon className="w-3 h-3" />
      {severity}
    </Badge>
  );
}

function CodeBlock({ content, label }: { content: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-lg border border-border/50 bg-black/50 overflow-hidden">
      {label && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30 border-b border-border/50">
          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{label}</span>
          <button onClick={() => { navigator.clipboard.writeText(content); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
            <Copy className="w-3 h-3" />
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      )}
      <ScrollArea className="max-h-48">
        <pre className="p-3 text-xs font-mono leading-relaxed whitespace-pre-wrap">{content}</pre>
      </ScrollArea>
    </div>
  );
}

function VulnerabilityDetail({ vuln, onClose, onValidate }: { vuln: Vulnerability; onClose: () => void; onValidate: (id: number) => void }) {
  const cfg = SEVERITY_CONFIG[vuln.severity as Severity] ?? SEVERITY_CONFIG.info;
  const [desc, aiAnalysis] = (vuln.description ?? "").split(/\n\nAI ANALYSIS:/);
  const [activeTab, setActiveTab] = useState("details");

  return (
    <Dialog open={true} onOpenChange={open => !open && onClose()}>
      <DialogContent className="bg-background border-border/50 max-w-5xl max-h-[90vh] p-0 overflow-hidden rounded-xl">
        {/* Three-panel layout */}
        <div className="flex flex-col h-[90vh]">
          {/* Header */}
          <div className="shrink-0 px-6 py-4 border-b border-border/50">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2 min-w-0">
                <div className="flex items-center gap-2">
                  <SeverityBadge severity={vuln.severity} />
                  {vuln.aiValidated && (
                    <Badge variant="outline" className="border-primary/30 text-primary bg-primary/5 gap-1 rounded-md text-[10px] font-mono">
                      <Cpu className="w-3 h-3" /> AI Verified
                    </Badge>
                  )}
                  <Badge variant="outline" className={`rounded-md text-[10px] font-mono uppercase ${
                    vuln.status === "confirmed" ? "border-success/30 text-success" :
                    vuln.status === "false_positive" ? "border-destructive/30 text-destructive" :
                    "border-warning/30 text-warning"
                  }`}>
                    {vuln.status}
                  </Badge>
                </div>
                <DialogTitle className="text-xl font-bold leading-tight">{vuln.title}</DialogTitle>
                <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono">
                  <span className="flex items-center gap-1"><Globe className="w-3 h-3" /> {vuln.url}</span>
                  <span>SCAN #{vuln.scanId}</span>
                  <span>{vuln.discoveredAt ? new Date(vuln.discoveredAt).toLocaleString() : ""}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!vuln.aiValidated && (
                  <Button variant="outline" className="border-primary/30 text-primary hover:bg-primary/10 gap-1.5" onClick={() => onValidate(vuln.id)}>
                    <Sparkles className="w-4 h-4" />
                    Validate with AI
                  </Button>
                )}
                <Button variant="ghost" size="icon" onClick={onClose}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
              <div className="shrink-0 px-6 pt-2">
                <TabsList className="bg-muted/50 border border-border/50">
                  <TabsTrigger value="details" className="text-xs gap-1.5"><FileText className="w-3.5 h-3.5" /> Details</TabsTrigger>
                  <TabsTrigger value="evidence" className="text-xs gap-1.5"><Terminal className="w-3.5 h-3.5" /> Evidence</TabsTrigger>
                  <TabsTrigger value="attack-chain" className="text-xs gap-1.5"><GitBranch className="w-3.5 h-3.5" /> Attack Chain</TabsTrigger>
                  <TabsTrigger value="remediation" className="text-xs gap-1.5"><Shield className="w-3.5 h-3.5" /> Remediation</TabsTrigger>
                </TabsList>
              </div>

              <div className="flex-1 overflow-auto px-6 py-4">
                <TabsContent value="details" className="mt-0 space-y-6">
                  {/* Description */}
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Description</h3>
                    <p className="text-sm leading-relaxed">{desc || vuln.description}</p>
                  </div>

                  {/* AI Analysis */}
                  {aiAnalysis && (
                    <div className="rounded-lg border border-primary/20 bg-primary/[0.02] p-4">
                      <h3 className="text-xs font-semibold uppercase tracking-widest text-primary mb-3 flex items-center gap-2">
                        <Cpu className="w-3.5 h-3.5" /> AI Analysis
                      </h3>
                      <p className="text-sm leading-relaxed text-foreground/90">{aiAnalysis.trim()}</p>
                    </div>
                  )}

                  {/* Meta Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                      <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">CVSS</div>
                      <div className="text-lg font-bold font-mono mt-0.5">—</div>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                      <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">CWE</div>
                      <div className="text-sm font-mono mt-0.5 text-muted-foreground">—</div>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                      <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">CVE</div>
                      <div className="text-sm font-mono mt-0.5 text-muted-foreground">—</div>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                      <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Confidence</div>
                      <div className="text-sm font-mono mt-0.5">{vuln.aiValidated ? "High" : "Pending"}</div>
                    </div>
                  </div>

                  {/* Attack Chain */}
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Attack Path</h3>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                      <span className="px-2 py-1 rounded bg-destructive/10 text-destructive border border-destructive/20">Entry</span>
                      <ChevronRight className="w-3 h-3" />
                      <span className="px-2 py-1 rounded bg-warning/10 text-warning border border-warning/20">Exploit</span>
                      <ChevronRight className="w-3 h-3" />
                      <span className="px-2 py-1 rounded bg-muted text-muted-foreground border border-border/50">Impact</span>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="evidence" className="mt-0 space-y-4">
                  {vuln.evidence ? (
                    <CodeBlock content={vuln.evidence} label="Raw Evidence / HTTP Response" />
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">No evidence captured for this finding.</div>
                  )}
                </TabsContent>

                <TabsContent value="attack-chain" className="mt-0">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold uppercase tracking-widest text-primary flex items-center gap-2">
                        <GitBranch className="w-3.5 h-3.5" /> Attack Chain Visualization
                      </h3>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        AI-detected vulnerability paths
                      </span>
                    </div>
                    <AttackChainGraph
                      chains={[
                        {
                          id: `chain-vuln-${vuln.id}`,
                          name: `Attack Path: ${vuln.title}`,
                          description: "This attack chain illustrates how the vulnerability could be exploited in a real-world scenario, chaining with other weaknesses to achieve maximum impact.",
                          totalRiskScore: vuln.severity === "critical" ? 8.5 : vuln.severity === "high" ? 6.2 : vuln.severity === "medium" ? 4.0 : 2.0,
                          nodes: [
                            { id: "target", label: vuln.url?.length > 30 ? vuln.url?.slice(0, 28) + ".." : (vuln.url || "Target"), type: "target" },
                            { id: "entry", label: "Entry Point", type: "entry", description: "Initial access vector discovered during scanning" },
                            { id: "exploit", label: vuln.title?.length > 22 ? vuln.title?.slice(0, 20) + ".." : (vuln.title || "Exploit"), type: "exploit", severity: vuln.severity as any, findingId: vuln.id, description: vuln.description?.slice(0, 60) || "Vulnerability exploitation path" },
                            { id: "impact", label: "System Impact", type: "impact", severity: vuln.severity as any, cveIds: [], cweIds: [] },
                          ],
                          edges: [
                            { source: "target", target: "entry", label: "Discovery" },
                            { source: "entry", target: "exploit", label: "Exploitation", technique: "T1190" },
                            { source: "exploit", target: "impact", label: "Lateral Movement", technique: "T1021" },
                          ],
                        },
                      ]}
                      width={600}
                      height={280}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="remediation" className="mt-0 space-y-4">
                  {vuln.fix ? (
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-widest text-success mb-3 flex items-center gap-2">
                        <Shield className="w-3.5 h-3.5" /> Remediation Patch
                      </h3>
                      <CodeBlock content={vuln.fix} label={vuln.aiValidated ? "AI-Generated Patch" : "Suggested Fix"} />
                    </div>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      No remediation available. Run AI validation to generate a patch.
                    </div>
                  )}
                </TabsContent>
              </div>
            </Tabs>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Vulnerabilities() {
  const { data: stats, isLoading: statsLoading } = useGetVulnerabilityStats();
  const { data: vulns, isLoading } = useGetVulnerabilities({
    query: { queryKey: getGetVulnerabilitiesQueryKey(), refetchInterval: 20_000 }
  });
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [filter, setFilter] = useState<Severity | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selected, setSelected] = useState<Vulnerability | null>(null);
  const [validating, setValidating] = useState<Set<number>>(new Set());

  const filtered = (vulns ?? []).filter(v => {
    if (filter !== "all" && v.severity !== filter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return v.title.toLowerCase().includes(q) || v.url?.toLowerCase().includes(q) || (v.description ?? "").toLowerCase().includes(q);
    }
    return true;
  });

  const getCount = (sev: Severity): number => stats?.[sev] ?? 0;

  const handleValidate = async (vulnId: number) => {
    setValidating(prev => new Set(prev).add(vulnId));
    try {
      const token = localStorage.getItem("v8_token");
      const res = await fetch(`/api/vulnerabilities/${vulnId}/validate`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
      });
      if (res.ok) {
        const updated = await res.json() as Vulnerability;
        await queryClient.invalidateQueries({ queryKey: getGetVulnerabilitiesQueryKey() });
        setSelected(prev => (prev?.id === vulnId ? updated : prev));
        toast({ title: "AI Validation Complete", description: "Finding analyzed — remediation patch generated." });
      } else throw new Error("Validation failed");
    } catch {
      toast({ title: "Validation Failed", description: "Could not reach AI analysis layer.", variant: "destructive" });
    } finally {
      setValidating(prev => { const s = new Set(prev); s.delete(vulnId); return s; });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
            <Bug className="w-6 h-6 text-primary" />
            Vulnerability Center
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {stats?.total ?? 0} findings · {vulns?.filter(v => v.aiValidated).length ?? 0} AI verified
          </p>
        </div>
      </div>

      {/* Severity Filters */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setFilter("all")}
          className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors border ${
            filter === "all" ? "bg-primary/10 text-primary border-primary/30" : "bg-muted/30 text-muted-foreground border-border/50 hover:border-border"
          }`}>
          All ({stats?.total ?? 0})
        </button>
        {SEVERITIES.map(sev => {
          const cfg = SEVERITY_CONFIG[sev];
          const count = getCount(sev);
          return (
            <button key={sev} onClick={() => setFilter(filter === sev ? "all" : sev)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors border flex items-center gap-1.5 ${
                filter === sev ? `${cfg.border} ${cfg.bg} ${cfg.color}` : "bg-muted/30 text-muted-foreground border-border/50 hover:border-border"
              }`}>
              <cfg.icon className="w-3 h-3" />
              {sev.charAt(0).toUpperCase() + sev.slice(1)} ({count})
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search by title, URL, or description..."
          className="pl-9 bg-muted/30 border-border/50 h-11 rounded-lg"
        />
      </div>

      {/* Findings List */}
      <div className="space-y-2">
        {isLoading ? (
          <div className="text-center py-16 text-muted-foreground animate-pulse">Loading vulnerabilities...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-border/50 rounded-xl">
            <Bug className="w-8 h-8 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">No findings match your filters</p>
          </div>
        ) : filtered.map(vuln => {
          const cfg = SEVERITY_CONFIG[vuln.severity as Severity] ?? SEVERITY_CONFIG.info;
          const isValidating = validating.has(vuln.id);
          return (
            <div key={vuln.id}
              className="glass-card p-4 hover:border-primary/30 transition-all cursor-pointer group"
              onClick={() => setSelected(vuln)}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityBadge severity={vuln.severity} />
                    <h3 className="font-semibold group-hover:text-primary transition-colors">{vuln.title}</h3>
                  </div>
                  <div className="text-xs text-muted-foreground font-mono truncate">{vuln.url}</div>
                  {vuln.description && (
                    <p className="text-xs text-muted-foreground/80 leading-relaxed line-clamp-2">
                      {vuln.description.split(/\n\nAI ANALYSIS:/)[0]}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  {!vuln.aiValidated ? (
                    <Button size="sm" variant="outline"
                      className="h-7 px-2.5 border-primary/30 text-primary/70 hover:bg-primary/10 hover:text-primary rounded-md text-[10px] font-medium gap-1"
                      onClick={e => { e.stopPropagation(); handleValidate(vuln.id); }}
                      disabled={isValidating}>
                      {isValidating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                      {isValidating ? "Analyzing..." : "AI Validate"}
                    </Button>
                  ) : (
                    <Badge variant="outline" className="border-primary/30 text-primary bg-primary/5 gap-1 rounded-md text-[10px]">
                      <Cpu className="w-3 h-3" /> AI Verified
                    </Badge>
                  )}
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="font-mono">#{vuln.scanId}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      vuln.status === "confirmed" ? "bg-success/10 text-success" :
                      vuln.status === "false_positive" ? "bg-destructive/10 text-destructive" :
                      "bg-warning/10 text-warning"
                    }`}>{vuln.status}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail Panel */}
      {selected && (
        <VulnerabilityDetail vuln={selected} onClose={() => setSelected(null)} onValidate={handleValidate} />
      )}
    </div>
  );
}
