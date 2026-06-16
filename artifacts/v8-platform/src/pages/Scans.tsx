import { useGetScans, useStopScan, useDeleteScan, getGetScansQueryKey, useCreateScan, useGetScanLogs, getGetScanLogsQueryKey } from "@workspace/api-client-react";
import { useI18n } from "@/lib/i18n";
import { Shield, Square, Trash2, Plus, ChevronDown, Terminal } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";

const AVAILABLE_TOOLS = [
  "subfinder", "naabu", "nuclei", "ffuf", "semgrep", "trivy", "subzy",
];

const STATUS_COLORS: Record<string, string> = {
  running:   "bg-primary/15 text-primary border-primary glow-box",
  queued:    "bg-yellow-500/15 text-yellow-400 border-yellow-500/50",
  completed: "bg-blue-500/15 text-blue-400 border-blue-500/50",
  failed:    "bg-destructive/15 text-destructive border-destructive/50",
  stopped:   "bg-destructive/15 text-destructive/70 border-destructive/30",
};

function ScanLogs({ scanId }: { scanId: number }) {
  const { data: logs } = useGetScanLogs(scanId, {
    query: {
      queryKey: getGetScanLogsQueryKey(scanId),
      refetchInterval: 3000,
    }
  });

  const logColors: Record<string, string> = {
    info: "text-primary",
    success: "text-green-400",
    warn: "text-yellow-400",
    error: "text-destructive",
  };

  return (
    <div className="bg-black border border-primary/20 p-3 mt-3 h-36 overflow-y-auto font-mono text-[11px] space-y-0.5">
      {!logs?.length ? (
        <div className="text-primary/40">AWAITING LOG OUTPUT...</div>
      ) : (
        logs.map(log => (
          <div key={log.id} className={logColors[log.level] || "text-primary"}>
            <span className="text-primary/30 mr-2">{new Date(log.timestamp).toISOString().substring(11, 19)}</span>
            {log.message}
          </div>
        ))
      )}
      <div className="w-2 h-3 bg-primary cursor-blink inline-block" />
    </div>
  );
}

export default function Scans() {
  const { data: scans, isLoading } = useGetScans({
    query: {
      queryKey: getGetScansQueryKey(),
      refetchInterval: 5000,
    }
  });
  const stopMut = useStopScan();
  const deleteMut = useDeleteScan();
  const createMut = useCreateScan();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const { toast } = useToast();

  const [target, setTarget] = useState("");
  const [selectedTools, setSelectedTools] = useState<string[]>(["nuclei", "subfinder"]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetScansQueryKey() });

  const handleStop = (id: number) => {
    stopMut.mutate({ id }, {
      onSuccess: () => {
        invalidate();
        toast({ title: "SIGKILL SENT", description: `Scan #${id} terminated.`, variant: "destructive" });
      }
    });
  };

  const handleDelete = (id: number) => {
    deleteMut.mutate({ id }, { onSuccess: invalidate });
  };

  const toggleTool = (tool: string, checked: boolean) => {
    setSelectedTools(prev =>
      checked ? [...prev, tool] : prev.filter(item => item !== tool)
    );
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!target.trim() || !selectedTools.length) return;
    createMut.mutate(
      { data: { target: target.trim(), tools: selectedTools, useProxy: false } },
      {
        onSuccess: () => {
          invalidate();
          setIsDialogOpen(false);
          setTarget("");
          toast({ title: "SCAN INITIATED", description: `Target: ${target}` });
        }
      }
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center border-b border-primary/20 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-primary tracking-widest glow-text uppercase flex items-center gap-3">
            <Shield className="w-6 h-6" />
            {t('scans.title')}
          </h1>
          <p className="text-primary/40 text-xs font-mono mt-1">
            {scans?.length ?? 0} RECORDS IN QUEUE
          </p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary text-black hover:bg-primary/90 glow-box rounded-none uppercase tracking-wider text-xs font-bold h-10">
              <Plus className="w-4 h-4 mr-2" />
              {t('scans.new')}
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-black border-primary/40 text-primary max-w-md rounded-none">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold tracking-widest glow-text uppercase">
                {t('scans.dialog_title')}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-5 mt-2">
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wider text-primary/60">{t('scans.target_label')}</label>
                <Input
                  value={target}
                  onChange={e => setTarget(e.target.value)}
                  placeholder="https://target.example.com"
                  className="bg-black border-primary/30 text-primary h-11 rounded-none focus-visible:ring-primary/50"
                />
              </div>
              <div className="space-y-3">
                <label className="text-xs uppercase tracking-wider text-primary/60">{t('scans.tools_label')}</label>
                <div className="grid grid-cols-2 gap-2">
                  {AVAILABLE_TOOLS.map(tool => (
                    <div key={tool} className="flex items-center gap-2 border border-primary/10 px-3 py-2 hover:border-primary/30 transition-colors">
                      <Checkbox
                        id={`tool-${tool}`}
                        checked={selectedTools.includes(tool)}
                        onCheckedChange={checked => toggleTool(tool, !!checked)}
                        className="border-primary/50 data-[state=checked]:bg-primary data-[state=checked]:border-primary rounded-none"
                      />
                      <label htmlFor={`tool-${tool}`} className="text-xs uppercase tracking-wider cursor-pointer font-mono">
                        {tool}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
              <Button
                type="submit"
                disabled={createMut.isPending || !target.trim() || !selectedTools.length}
                className="w-full bg-primary text-black glow-box rounded-none uppercase tracking-widest font-bold h-11"
              >
                {createMut.isPending ? t('scans.launching') : t('scans.launch')}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="border border-primary/20 glow-box bg-card">
        <Table>
          <TableHeader className="bg-primary/5 border-b border-primary/20">
            <TableRow className="hover:bg-transparent border-none">
              <TableHead className="text-primary/70 text-xs uppercase tracking-widest font-mono">ID</TableHead>
              <TableHead className="text-primary/70 text-xs uppercase tracking-widest font-mono">{t('scans.target')}</TableHead>
              <TableHead className="text-primary/70 text-xs uppercase tracking-widest font-mono">{t('scans.status')}</TableHead>
              <TableHead className="text-primary/70 text-xs uppercase tracking-widest font-mono w-40">{t('scans.progress')}</TableHead>
              <TableHead className="text-primary/70 text-xs uppercase tracking-widest font-mono">VULNS</TableHead>
              <TableHead className="text-primary/70 text-xs uppercase tracking-widest font-mono text-right">{t('scans.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-primary/40 py-12 font-mono animate-pulse">
                  LOADING QUEUE...
                </TableCell>
              </TableRow>
            ) : !scans?.length ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-primary/30 py-12 font-mono">
                  {t('scans.empty')}
                </TableCell>
              </TableRow>
            ) : scans.map(scan => (
              <>
                <TableRow
                  key={scan.id}
                  className="border-b border-primary/10 hover:bg-primary/5 cursor-pointer group"
                  onClick={() => setExpandedId(expandedId === scan.id ? null : scan.id)}
                  data-testid={`row-scan-${scan.id}`}
                >
                  <TableCell className="font-mono text-primary/50 text-xs">#{scan.id}</TableCell>
                  <TableCell className="font-mono text-primary glow-text text-sm max-w-[200px] truncate">
                    {scan.target}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`uppercase tracking-wider text-xs rounded-none font-mono ${STATUS_COLORS[scan.status] || "border-primary/30 text-primary/50"}`}
                    >
                      {t(`status.${scan.status}`) || scan.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-black border border-primary/20 relative overflow-hidden">
                        <div
                          className={`absolute top-0 left-0 h-full transition-all duration-500 ${scan.status === 'failed' ? 'bg-destructive' : 'bg-primary'}`}
                          style={{ width: `${scan.progress ?? 0}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono text-primary/50 w-8">{scan.progress ?? 0}%</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-primary/70 text-sm">
                    {scan.vulnCount ?? 0}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1" onClick={e => e.stopPropagation()}>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-primary/40 hover:text-primary"
                        title="Show logs"
                        onClick={() => setExpandedId(expandedId === scan.id ? null : scan.id)}
                      >
                        <ChevronDown className={`w-4 h-4 transition-transform ${expandedId === scan.id ? "rotate-180" : ""}`} />
                      </Button>
                      {scan.status === "running" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-destructive/50 text-destructive hover:bg-destructive/10 rounded-none text-xs uppercase tracking-wider h-7 px-3"
                          onClick={() => handleStop(scan.id)}
                          disabled={stopMut.isPending}
                          data-testid={`button-stop-${scan.id}`}
                        >
                          <Square className="w-3 h-3 mr-1" />
                          {t('scans.stop')}
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-primary/30 hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDelete(scan.id)}
                        data-testid={`button-delete-${scan.id}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                {expandedId === scan.id && (
                  <TableRow key={`${scan.id}-logs`} className="hover:bg-transparent border-b border-primary/10">
                    <TableCell colSpan={6} className="p-4 bg-black/50">
                      <div className="flex items-center gap-2 text-xs text-primary/50 font-mono uppercase tracking-wider mb-2">
                        <Terminal className="w-3 h-3" />
                        SCAN_LOGS :: #{scan.id} — {scan.target}
                        <span className="ml-2 text-primary/30">TOOLS: {(Array.isArray(scan.tools) ? scan.tools : []).join(', ')}</span>
                      </div>
                      <ScanLogs scanId={scan.id} />
                    </TableCell>
                  </TableRow>
                )}
              </>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
