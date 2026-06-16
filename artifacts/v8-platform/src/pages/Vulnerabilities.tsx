import { useState } from "react";
import {
  useGetVulnerabilities, useGetVulnerabilityStats,
  getGetVulnerabilitiesQueryKey,
} from "@workspace/api-client-react";
import type { Vulnerability, VulnerabilityStats } from "@workspace/api-client-react";
import { useI18n } from "@/lib/i18n";
import { Bug, Cpu, ChevronRight, X } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Severity = "critical" | "high" | "medium" | "low" | "info";

const SEVERITY_CONFIG: Record<Severity, { color: string; bg: string; glow: string; border: string }> = {
  critical: {
    color: "text-red-500",
    bg: "bg-red-500/10",
    glow: "shadow-[0_0_16px_rgba(239,68,68,0.4)]",
    border: "border-red-500/50",
  },
  high: {
    color: "text-orange-500",
    bg: "bg-orange-500/10",
    glow: "shadow-[0_0_8px_rgba(249,115,22,0.3)]",
    border: "border-orange-500/50",
  },
  medium: {
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    glow: "",
    border: "border-yellow-500/40",
  },
  low: {
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    glow: "",
    border: "border-blue-500/40",
  },
  info: {
    color: "text-gray-400",
    bg: "bg-gray-500/10",
    glow: "",
    border: "border-gray-500/30",
  },
};

const SEVERITIES: Severity[] = ["critical", "high", "medium", "low", "info"];

function SeverityBadge({ severity }: { severity: string }) {
  const cfg = SEVERITY_CONFIG[severity as Severity] || SEVERITY_CONFIG.info;
  return (
    <Badge
      variant="outline"
      className={`uppercase text-xs font-mono rounded-none border ${cfg.color} ${cfg.bg} ${cfg.border} ${cfg.glow}`}
    >
      {severity}
    </Badge>
  );
}

export default function Vulnerabilities() {
  const { data: stats } = useGetVulnerabilityStats();
  const { data: vulns, isLoading } = useGetVulnerabilities({
    query: {
      queryKey: getGetVulnerabilitiesQueryKey(),
      refetchInterval: 20_000,
    }
  });
  const { t } = useI18n();

  const [filter, setFilter] = useState<Severity | "all">("all");
  const [selected, setSelected] = useState<Vulnerability | null>(null);

  const filtered = filter === "all"
    ? (vulns ?? [])
    : (vulns ?? []).filter(v => v.severity === filter);

  const getCount = (sev: Severity): number => {
    if (!stats) return 0;
    return stats[sev] ?? 0;
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-primary/20 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary tracking-widest glow-text uppercase flex items-center gap-3">
            <Bug className="w-6 h-6" />
            {t('vulns.title')}
          </h1>
          <p className="text-primary/40 text-xs font-mono mt-1">
            {stats?.total ?? 0} FINDINGS IN DATABASE
          </p>
        </div>
      </div>

      {/* Severity Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {SEVERITIES.map(sev => {
          const cfg = SEVERITY_CONFIG[sev];
          const count = getCount(sev);
          return (
            <button
              key={sev}
              onClick={() => setFilter(filter === sev ? "all" : sev)}
              data-testid={`button-filter-${sev}`}
              className={`
                p-4 border transition-all text-left relative overflow-hidden group
                ${filter === sev ? `${cfg.border} ${cfg.bg} ${cfg.glow}` : "border-primary/20 bg-card hover:border-primary/40"}
              `}
            >
              <div className="text-[10px] uppercase tracking-widest font-mono text-primary/40 mb-1">{sev}</div>
              <div className={`text-3xl font-bold font-mono ${cfg.color} ${cfg.glow}`}>{count}</div>
              {filter === sev && (
                <div className={`absolute top-0 right-0 bottom-0 w-0.5 ${cfg.color} opacity-60`} />
              )}
            </button>
          );
        })}
      </div>

      {/* Filter indicator */}
      {filter !== "all" && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-primary/40 font-mono uppercase">FILTERING:</span>
          <SeverityBadge severity={filter} />
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-primary/40 hover:text-primary rounded-none"
            onClick={() => setFilter("all")}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      )}

      {/* Findings List */}
      <div className="space-y-2">
        {isLoading ? (
          <div className="text-center text-primary/40 py-16 font-mono animate-pulse">
            QUERYING DATABASE...
          </div>
        ) : !filtered.length ? (
          <div className="text-center text-primary/30 py-16 border border-primary/10 bg-card font-mono">
            {t('vulns.empty')}
          </div>
        ) : filtered.map(vuln => {
          const cfg = SEVERITY_CONFIG[vuln.severity as Severity] || SEVERITY_CONFIG.info;
          return (
            <div
              key={vuln.id}
              className={`
                bg-card border border-primary/20 p-4 hover:border-primary/50 
                transition-all cursor-pointer group relative
                ${cfg.glow ? `hover:${cfg.glow}` : ""}
              `}
              onClick={() => setSelected(vuln)}
              data-testid={`card-vuln-${vuln.id}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityBadge severity={vuln.severity} />
                    <h3 className="font-bold text-primary font-mono group-hover:glow-text transition-all">
                      {vuln.title}
                    </h3>
                  </div>
                  <div className="text-xs text-primary/40 font-mono truncate">{vuln.url}</div>
                  {vuln.description && (
                    <p className="text-xs text-primary/50 leading-relaxed line-clamp-2">{vuln.description}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  {vuln.aiValidated && (
                    <Badge variant="outline" className="border-primary/50 text-primary bg-primary/5 gap-1 rounded-none text-[10px] uppercase font-mono">
                      <Cpu className="w-3 h-3" /> {t('vulns.ai_verified')}
                    </Badge>
                  )}
                  <span className="text-[10px] text-primary/30 font-mono">SCAN#{vuln.scanId}</span>
                  <Badge variant="outline" className={`rounded-none text-[10px] font-mono uppercase border ${
                    vuln.status === "confirmed" ? "border-primary/30 text-primary/60" :
                    vuln.status === "false_positive" ? "border-destructive/30 text-destructive/50" :
                    "border-yellow-500/30 text-yellow-400/60"
                  }`}>
                    {vuln.status}
                  </Badge>
                  <ChevronRight className="w-4 h-4 text-primary/20 group-hover:text-primary transition-colors" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!selected} onOpenChange={open => !open && setSelected(null)}>
        <DialogContent className="bg-black border-primary/40 text-primary max-w-3xl max-h-[85vh] overflow-y-auto rounded-none">
          {selected && (() => {
            const cfg = SEVERITY_CONFIG[selected.severity as Severity] || SEVERITY_CONFIG.info;
            return (
              <>
                <DialogHeader className="border-b border-primary/20 pb-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <SeverityBadge severity={selected.severity} />
                    {selected.aiValidated && (
                      <Badge variant="outline" className="border-primary/40 text-primary bg-primary/10 gap-1 rounded-none text-[10px] uppercase font-mono">
                        <Cpu className="w-3 h-3" /> AI VERIFIED
                      </Badge>
                    )}
                  </div>
                  <DialogTitle className={`text-xl font-bold tracking-wide glow-text font-mono mt-2 ${cfg.color}`}>
                    {selected.title}
                  </DialogTitle>
                  <div className="text-xs font-mono text-primary/50 mt-1 break-all">{selected.url}</div>
                  <div className="flex gap-4 text-[10px] font-mono text-primary/30 mt-2">
                    <span>SCAN #{selected.scanId}</span>
                    <span>STATUS: {selected.status.toUpperCase()}</span>
                    <span>{selected.discoveredAt ? new Date(selected.discoveredAt).toLocaleString() : "—"}</span>
                  </div>
                </DialogHeader>

                <div className="space-y-6 mt-2">
                  {selected.description && (
                    <div>
                      <h4 className="text-[11px] uppercase tracking-widest text-primary/40 font-mono mb-2 flex items-center gap-2">
                        <span className="w-4 h-px bg-primary/30" />
                        {t('vulns.description')}
                      </h4>
                      <p className="text-sm text-primary/80 leading-relaxed font-mono">{selected.description}</p>
                    </div>
                  )}

                  {selected.evidence && (
                    <div>
                      <h4 className="text-[11px] uppercase tracking-widest text-primary/40 font-mono mb-2 flex items-center gap-2">
                        <span className="w-4 h-px bg-primary/30" />
                        {t('vulns.evidence')}
                      </h4>
                      <div className="bg-black border border-primary/20 p-4 font-mono text-xs text-green-400 overflow-x-auto whitespace-pre-wrap leading-5 max-h-48 overflow-y-auto">
                        {selected.evidence}
                      </div>
                    </div>
                  )}

                  {selected.fix && (
                    <div>
                      <h4 className="text-[11px] uppercase tracking-widest text-primary/40 font-mono mb-2 flex items-center gap-2">
                        <span className="w-4 h-px bg-primary/30" />
                        {t('vulns.fix')}
                      </h4>
                      <div className="bg-black border border-primary/20 p-4 font-mono text-xs text-primary/80 whitespace-pre-wrap leading-5">
                        {selected.fix}
                      </div>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
