import { useGetReports, useGetScans, useGenerateReport, getGetReportsQueryKey } from "@workspace/api-client-react";
import { useI18n } from "@/lib/i18n";
import { FileText, Download, FilePlus2, RefreshCw, ExternalLink, Shield, Bug } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

const FORMATS = [
  { value: "html", label: "HTML", desc: "Interactive web report" },
  { value: "pdf", label: "PDF", desc: "Downloadable document" },
  { value: "sarif", label: "SARIF", desc: "Static analysis format" },
  { value: "json", label: "JSON", desc: "Machine-readable data" },
  { value: "csv", label: "CSV", desc: "Spreadsheet export" },
];

const STATUS_CONFIG = {
  ready:      { color: "text-primary border-primary bg-primary/10", pulse: false },
  generating: { color: "text-yellow-400 border-yellow-500/50 bg-yellow-500/5", pulse: true },
  failed:     { color: "text-destructive border-destructive/50 bg-destructive/5", pulse: false },
};

export default function Reports() {
  const { data: reports, isLoading } = useGetReports({
    query: { queryKey: getGetReportsQueryKey(), refetchInterval: 5000 }
  });
  const { data: scans } = useGetScans();
  const generateMut = useGenerateReport();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const { toast } = useToast();

  const [selectedScanId, setSelectedScanId] = useState<string>("");
  const [selectedFormats, setSelectedFormats] = useState<string[]>(["html"]);
  const [formatExpanded, setFormatExpanded] = useState(false);

  const toggleFormat = (fmt: string) => {
    setSelectedFormats(prev =>
      prev.includes(fmt) ? prev.filter(f => f !== fmt) : [...prev, fmt]
    );
  };

  const handleGenerate = () => {
    if (!selectedScanId || selectedScanId === "__none") return;
    generateMut.mutate(
      { data: { scanId: parseInt(selectedScanId), formats: selectedFormats } } as any,
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetReportsQueryKey() });
          setSelectedScanId("");
          setSelectedFormats(["html"]);
          toast({ title: "REPORT INITIATED", description: `Generating ${selectedFormats.join(", ").toUpperCase()} format(s)...` });
        },
        onError: () => {
          toast({ title: "GENERATION FAILED", variant: "destructive" });
        }
      }
    );
  };

  const completedScans = scans?.filter(s => s.status === "completed") ?? [];
  const readyCount = reports?.filter(r => r.status === "ready").length ?? 0;

  return (
    <div className="space-y-6">
      <div className="border-b border-primary/20 pb-4">
        <h1 className="text-2xl font-bold text-primary tracking-widest glow-text uppercase flex items-center gap-3">
          <FileText className="w-6 h-6" />
          {t('reports.title')}
        </h1>
        <p className="text-primary/40 text-xs font-mono mt-1">
          {reports?.length ?? 0} REPORTS IN ARCHIVE ● {readyCount} READY FOR DOWNLOAD
        </p>
      </div>

      {/* Generator */}
      <div className="border border-primary/30 glow-box bg-card p-5">
        <div className="flex items-center gap-2 text-primary glow-text text-sm uppercase tracking-widest mb-1">
          <FilePlus2 className="w-4 h-4" />
          {t('reports.generate_title')}
        </div>          <p className="text-[11px] text-primary/30 font-mono mb-4">
            Executive Summary → Severity Chart → Tool Scope Matrix → Vulnerability Details + AI Patches
          </p>

          {/* Format Selector */}
          <div className="mb-4">
            <div
              className="flex items-center gap-2 text-[11px] font-mono text-primary/50 cursor-pointer hover:text-primary/70 transition-colors"
              onClick={() => setFormatExpanded(!formatExpanded)}
            >
              <span className="uppercase tracking-wider">Output Formats</span>
              <span className="text-[10px] text-primary/30">({selectedFormats.length} selected)</span>
            </div>
            {formatExpanded && (
              <div className="flex flex-wrap gap-2 mt-2">
                {FORMATS.map((fmt) => {
                  const isSelected = selectedFormats.includes(fmt.value);
                  return (
                    <button
                      key={fmt.value}
                      onClick={() => toggleFormat(fmt.value)}
                      className={`px-3 py-2 text-[10px] font-mono uppercase tracking-wider border transition-all ${
                        isSelected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-primary/20 text-primary/40 hover:border-primary/40"
                      }`}
                      title={fmt.desc}
                    >
                      {fmt.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px] space-y-1.5">
            <label className="text-[11px] uppercase tracking-wider text-primary/50 font-mono">{t('reports.select_scan')}</label>
            <Select value={selectedScanId} onValueChange={setSelectedScanId}>
              <SelectTrigger className="bg-black border-primary/30 text-primary h-11 rounded-none font-mono" data-testid="select-scan">
                <SelectValue placeholder={t('reports.choose')} />
              </SelectTrigger>
              <SelectContent className="bg-black border-primary/30 text-primary rounded-none font-mono">
                {completedScans.length === 0 ? (
                  <SelectItem value="__none" disabled>{t('reports.no_completed')}</SelectItem>
                ) : completedScans.map(scan => (
                  <SelectItem key={scan.id} value={scan.id.toString()}>
                    #{scan.id} — {scan.target}
                    {scan.vulnCount !== null && scan.vulnCount !== undefined && (
                      <span className="text-primary/40 ml-2">({scan.vulnCount} vulns)</span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleGenerate}
            disabled={!selectedScanId || selectedScanId === "__none" || generateMut.isPending}
            className="bg-primary text-black h-11 px-8 glow-box rounded-none uppercase tracking-widest text-xs font-bold"
            data-testid="button-generate-report"
          >
            {generateMut.isPending ? (
              <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> PROCESSING...</>
            ) : (
              <><FilePlus2 className="w-4 h-4 mr-2" /> {t('action.generate_report')}</>
            )}
          </Button>
        </div>
      </div>

      {/* Reports Grid */}
      {isLoading ? (
        <div className="text-center text-primary/40 py-16 font-mono animate-pulse">RETRIEVING ARCHIVES...</div>
      ) : !reports?.length ? (
        <div className="text-center text-primary/30 py-16 border border-primary/10 bg-card font-mono">
          {t('reports.empty')}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reports.map(report => {
            const cfg = STATUS_CONFIG[report.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.failed;
            const scanData = scans?.find(s => s.id === report.scanId);
            return (
              <Card
                key={report.id}
                className="bg-black border-primary/20 hover:border-primary/40 transition-colors group rounded-none"
                data-testid={`card-report-${report.id}`}
              >
                <CardContent className="p-5">
                  <div className="flex justify-between items-start mb-5">
                    <div className="w-12 h-12 border border-primary/30 bg-primary/5 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                      <FileText className="w-6 h-6 text-primary glow-text" />
                    </div>
                    <Badge
                      variant="outline"
                      className={`uppercase text-[10px] font-mono rounded-none border ${cfg.color} ${cfg.pulse ? "animate-pulse" : ""}`}
                    >
                      {report.status}
                    </Badge>
                  </div>

                  <div className="space-y-1 mb-4 font-mono">
                    <div className="flex items-center gap-2 text-[10px] text-primary/30 uppercase tracking-widest">
                      <span>{t('reports.report_id')}: {report.id.toString().padStart(4, "0")}</span>
                      {(report as any).type && (
                        <span className="px-1.5 py-0.5 border border-primary/20 text-primary/50 rounded-sm">
                          {(report as any).type}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-primary font-bold">
                      {(report as any).title ?? scanData?.target ?? `${t('reports.scan_target')} #${report.scanId}`}
                    </div>
                    <div className="text-[11px] text-primary/30">
                      {scanData ? `→ ${scanData.target}` : `Scan #${report.scanId}`} · {new Date(report.createdAt).toLocaleString()}
                    </div>
                  </div>

                  {/* Scan info pills */}
                  {scanData && (
                    <div className="flex gap-2 mb-4">
                      <div className="flex items-center gap-1.5 text-[10px] font-mono text-primary/40 border border-primary/10 px-2 py-1">
                        <Shield className="w-2.5 h-2.5" />
                        {scanData.tools?.length ?? 0} TOOLS
                      </div>
                      {(scanData.vulnCount ?? 0) > 0 && (
                        <div className="flex items-center gap-1.5 text-[10px] font-mono text-destructive/60 border border-destructive/20 px-2 py-1">
                          <Bug className="w-2.5 h-2.5" />
                          {scanData.vulnCount} FINDINGS
                        </div>
                      )}
                    </div>
                  )}

                  {report.status === "ready" ? (
                    <a
                      href={report.downloadUrl ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex w-full items-center justify-center gap-2 border border-primary/30 bg-primary/5 hover:bg-primary hover:text-black text-primary transition-all py-2.5 text-xs uppercase tracking-widest font-mono font-bold glow-box"
                      data-testid={`link-download-${report.id}`}
                    >
                      <Download className="w-4 h-4" />
                      {t('reports.download')}
                      <ExternalLink className="w-3 h-3 opacity-50" />
                    </a>
                  ) : report.status === "generating" ? (
                    <div className="flex w-full items-center justify-center gap-2 border border-yellow-500/20 bg-yellow-500/5 text-yellow-400/60 py-2.5 text-xs uppercase tracking-widest font-mono">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      GENERATING...
                    </div>
                  ) : (
                    <div className="flex w-full items-center justify-center border border-primary/10 text-primary/20 py-2.5 text-xs uppercase tracking-widest font-mono">
                      {t('reports.unavailable')}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
