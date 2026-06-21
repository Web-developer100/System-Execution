import { useGetTools, useInstallTool, useDeleteTool, useUpdateTool, getGetToolsQueryKey } from "@workspace/api-client-react";
import { useI18n } from "@/lib/i18n";
import { Wrench, Github, RefreshCw, Trash2, CheckCircle2, XCircle, AlertCircle, Plus, Loader2, GitBranch, Package, TestTube, Cpu, Info, ExternalLink, Globe, Code, Hash, CalendarDays } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

const STATUS_CONFIG = {
  active:     { icon: CheckCircle2, color: "text-primary border-primary bg-primary/10", label: "ACTIVE" },
  inactive:   { icon: XCircle,      color: "text-primary/40 border-primary/20 bg-primary/5", label: "INACTIVE" },
  updating:   { icon: RefreshCw,    color: "text-yellow-400 border-yellow-500/50 bg-yellow-500/10", label: "UPDATING" },
  installing: { icon: Loader2,      color: "text-cyan-400 border-cyan-400/50 bg-cyan-400/10", label: "INSTALLING" },
  error:      { icon: XCircle,      color: "text-destructive border-destructive/50 bg-destructive/10", label: "ERROR" },
};

const INSTALL_STEPS = [
  { keyword: "INIT",    icon: Github,    label: "Connecting to GitHub..." },
  { keyword: "CLONE",   icon: GitBranch, label: "Cloning repository..." },
  { keyword: "DEPS",    icon: Package,   label: "Analyzing dependencies..." },
  { keyword: "BUILD",   icon: Cpu,       label: "Compiling binary..." },
  { keyword: "SANDBOX", icon: TestTube,  label: "Running stability test..." },
  { keyword: "INJECT",  icon: Wrench,    label: "Injecting into pipeline..." },
];

function getInstallStep(description: string | null): number {
  if (!description) return 0;
  for (let i = INSTALL_STEPS.length - 1; i >= 0; i--) {
    if (description.includes(INSTALL_STEPS[i].keyword)) return i;
  }
  return 0;
}

function InstallProgress({ description }: { description: string | null }) {
  const currentStep = getInstallStep(description);
  return (
    <div className="mt-3 space-y-2">
      <div className="text-[10px] uppercase tracking-widest text-primary/30 font-mono mb-2">INSTALL PIPELINE</div>
      <div className="space-y-1.5">
        {INSTALL_STEPS.map((step, idx) => {
          const Icon = step.icon;
          const done = idx < currentStep;
          const active = idx === currentStep;
          return (
            <div key={idx} className={`flex items-center gap-2 text-[10px] font-mono transition-all ${
              done ? "text-primary/60" : active ? "text-cyan-400" : "text-primary/20"
            }`}>
              {done ? (
                <CheckCircle2 className="w-3 h-3 shrink-0 text-primary/40" />
              ) : active ? (
                <Icon className="w-3 h-3 shrink-0 animate-spin" />
              ) : (
                <div className="w-3 h-3 shrink-0 border border-primary/10 rounded-full" />
              )}
              <span className={active ? "animate-pulse" : ""}>{step.label}</span>
            </div>
          );
        })}
      </div>
      {description && (
        <div className="mt-2 px-2 py-1.5 bg-black border border-cyan-400/20 text-[10px] font-mono text-cyan-400/70 leading-relaxed">
          {description}
        </div>
      )}
    </div>
  );
}

export default function Tools() {
  const { data: tools, isLoading } = useGetTools({
    query: {
      queryKey: getGetToolsQueryKey(),
      refetchInterval: 5000,
    }
  });
  const installMut = useInstallTool();
  const deleteMut = useDeleteTool();
  const updateMut = useUpdateTool();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const { toast } = useToast();

  const [repoUrl, setRepoUrl] = useState("");
  const [toolName, setToolName] = useState("");
  const [selectedToolId, setSelectedToolId] = useState<number | null>(null);

  // Derive selectedTool from the tools list
  const selectedTool = selectedToolId !== null
    ? tools?.find(t => t.id === selectedToolId) ?? null
    : null;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetToolsQueryKey() });

  const handleInstall = (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl.trim() || !toolName.trim()) return;
    installMut.mutate(
      { data: { name: toolName.trim(), githubUrl: repoUrl.trim() } },
      {
        onSuccess: () => {
          invalidate();
          setRepoUrl("");
          setToolName("");
          toast({ title: "INSTALL PIPELINE STARTED", description: `${toolName} — cloning and building from GitHub. Monitor progress below.` });
        },
        onError: () => {
          toast({ title: "INSTALL FAILED", description: "Could not start installation pipeline.", variant: "destructive" });
        }
      }
    );
  };

  const activeCount = tools?.filter(t => t.status === "active").length ?? 0;
  const installingCount = tools?.filter(t => (t.status as string) === "installing").length ?? 0;

  return (
    <div className="space-y-6">
      <div className="border-b border-primary/20 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary tracking-widest glow-text uppercase flex items-center gap-3">
            <Wrench className="w-6 h-6" />
            {t('tools.title')}
          </h1>
          <p className="text-primary/40 text-xs font-mono mt-1">
            {activeCount} ACTIVE ● {installingCount} INSTALLING ● {(tools?.length ?? 0) - activeCount - installingCount} OFFLINE
          </p>
        </div>
      </div>

      {/* GitHub Install Pipeline */}
      <div className="border border-primary/30 glow-box bg-card p-5">
        <div className="flex items-center gap-2 text-primary glow-text text-sm uppercase tracking-widest mb-1">
          <Github className="w-4 h-4" />
          {t('tools.install_title')}
        </div>
        <p className="text-[11px] text-primary/30 font-mono mb-4">
          Clone → Parse Dependencies → Stability Test → Inject into Orchestration Pipeline
        </p>
        <form onSubmit={handleInstall} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wider text-primary/50 font-mono">{t('tools.name_label')}</label>
            <Input
              value={toolName}
              onChange={e => setToolName(e.target.value)}
              placeholder="e.g. nuclei"
              className="bg-black border-primary/30 text-primary h-11 rounded-none focus-visible:ring-primary/50 font-mono"
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-[11px] uppercase tracking-wider text-primary/50 font-mono">{t('tools.url_label')}</label>
            <div className="relative">
              <Github className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/40" />
              <Input
                value={repoUrl}
                onChange={e => setRepoUrl(e.target.value)}
                placeholder="https://github.com/projectdiscovery/nuclei"
                className="bg-black border-primary/30 text-primary pl-10 h-11 rounded-none focus-visible:ring-primary/50 font-mono"
              />
            </div>
          </div>
          <Button
            type="submit"
            disabled={installMut.isPending || !toolName.trim() || !repoUrl.trim()}
            className="bg-primary text-black h-11 rounded-none glow-box uppercase tracking-widest text-xs font-bold"
          >
            {installMut.isPending ? (
              <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> {t('tools.installing')}</>
            ) : (
              <><Plus className="w-3 h-3 mr-1.5" /> {t('action.install_tool')}</>
            )}
          </Button>
        </form>
      </div>

      {/* Tools Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-44 bg-card border border-primary/10 animate-pulse" />
          ))}
        </div>
      ) : !tools?.length ? (
        <div className="text-center text-primary/30 py-16 border border-primary/10 bg-card font-mono">
          {t('tools.empty')}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tools.map(tool => {
            const cfg = STATUS_CONFIG[tool.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.inactive;
            const Icon = cfg.icon;
            const isInstalling = (tool.status as string) === "installing";
            const isUpdating = (tool.status as string) === "updating";
            return (
              <Card
                key={tool.id}
                className={`bg-card border-primary/20 hover:border-primary/50 transition-all group relative overflow-hidden cursor-pointer ${
                  isInstalling ? "border-cyan-400/30" : ""
                }`}
                data-testid={`card-tool-${tool.id}`}
                onClick={() => setSelectedToolId(tool.id)}
              >
                {isInstalling && (
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent animate-pulse" />
                )}
                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 pointer-events-none transition-opacity">
                  <Wrench className="w-20 h-20 text-primary" />
                </div>
                <CardHeader className="pb-3 pt-4 px-4">
                  <div className="flex justify-between items-start">
                    <div className="text-lg font-bold text-primary glow-text uppercase tracking-wider font-mono">
                      {tool.name}
                    </div>
                    <Badge variant="outline" className={`uppercase text-[10px] font-mono rounded-none border ${cfg.color}`}>
                      <Icon className={`w-3 h-3 mr-1 ${(isInstalling || isUpdating) ? 'animate-spin' : ''}`} />
                      {cfg.label}
                    </Badge>
                  </div>
                  {!isInstalling && tool.description && (
                    <p className="text-xs text-primary/40 mt-1 font-mono leading-relaxed line-clamp-2">
                      {tool.description}
                    </p>
                  )}
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  {isInstalling ? (
                    <InstallProgress description={tool.description ?? null} />
                  ) : (
                    <>
                      {tool.githubUrl && (
                        <div className="text-[11px] text-primary/30 font-mono mb-3 truncate flex items-center gap-1.5">
                          <Github className="w-3 h-3 shrink-0" />
                          {tool.githubUrl.replace("https://github.com/", "")}
                        </div>
                      )}
                      {(tool as any).category && (
                        <div className="mb-2">
                          <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 border border-primary/20 text-primary/50 bg-primary/5">
                            {(tool as any).category}
                          </span>
                        </div>
                      )}
                      <div className="grid grid-cols-3 gap-2 text-[10px] font-mono text-primary/40 border-t border-primary/10 pt-3 mb-3">
                        <div>
                          <div className="text-primary/20 uppercase">{t('tools.version')}</div>
                          <div className="text-primary/60">{tool.version ?? "N/A"}</div>
                        </div>
                        <div>
                          <div className="text-primary/20 uppercase">{t('tools.health')}</div>
                          <div className={tool.healthScore && tool.healthScore > 80 ? "text-primary/60" : "text-destructive/70"}>
                            {tool.healthScore ?? 0}%
                          </div>
                        </div>
                        <div>
                          <div className="text-primary/20 uppercase">{t('tools.last_checked')}</div>
                          <div className="text-primary/40">
                            {tool.lastChecked ? new Date(tool.lastChecked).toLocaleDateString() : "—"}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 h-8 border-primary/20 text-primary/60 hover:border-primary/60 hover:text-primary rounded-none text-[11px] uppercase tracking-wider"
                          onClick={(e) => { e.stopPropagation(); updateMut.mutate({ id: tool.id }, { onSuccess: invalidate }); }}
                          disabled={updateMut.isPending || tool.status === 'updating'}
                          data-testid={`button-update-${tool.id}`}
                        >
                          <Github className={`w-3 h-3 mr-1.5 ${updateMut.isPending ? 'animate-spin' : ''}`} />
                          {t('tools.check_update')}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-primary/30 hover:bg-destructive/10 hover:text-destructive rounded-none"
                          onClick={(e) => { e.stopPropagation(); deleteMut.mutate({ id: tool.id }, { onSuccess: invalidate }); }}
                          data-testid={`button-delete-${tool.id}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Tool Detail Modal */}
      <Dialog open={selectedToolId !== null} onOpenChange={(open) => { if (!open) setSelectedToolId(null); }}>
        <DialogContent className="bg-black border-primary/30 text-primary rounded-none max-w-2xl max-h-[80vh] overflow-y-auto">
          {selectedTool && (
            <>
              <DialogHeader>
                <DialogTitle className="text-primary glow-text font-mono uppercase tracking-widest flex items-center gap-2">
                  <Wrench className="w-5 h-5" />
                  {selectedTool.name}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 mt-2">
                {/* GitHub & Description */}
                {selectedTool.description && (
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-primary/30 font-mono mb-1">DESCRIPTION</div>
                    <p className="text-xs text-primary/70 font-mono leading-relaxed">{selectedTool.description}</p>
                  </div>
                )}

                {selectedTool.githubUrl && (
                  <a
                    href={selectedTool.githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs font-mono text-primary/50 hover:text-primary transition-colors"
                  >
                    <Github className="w-3.5 h-3.5" />
                    {selectedTool.githubUrl.replace("https://github.com/", "")}
                    <ExternalLink className="w-3 h-3 opacity-50" />
                  </a>
                )}

                {/* Metadata grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="border border-primary/10 bg-black/50 p-3">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-primary/30 font-mono mb-1">
                      <Code className="w-3 h-3" /> Language
                    </div>
                    <div className="text-sm font-mono text-primary/80">{selectedTool.language ?? "N/A"}</div>
                  </div>
                  <div className="border border-primary/10 bg-black/50 p-3">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-primary/30 font-mono mb-1">
                      <Hash className="w-3 h-3" /> Version
                    </div>
                    <div className="text-sm font-mono text-primary/80">{selectedTool.version ?? "N/A"}</div>
                  </div>
                  <div className="border border-primary/10 bg-black/50 p-3">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-primary/30 font-mono mb-1">
                      <GitBranch className="w-3 h-3" /> Installed Commit
                    </div>
                    <div className="text-sm font-mono text-primary/80">
                      {selectedTool.installedCommit ? selectedTool.installedCommit.slice(0, 12) : "N/A"}
                    </div>
                  </div>
                  <div className="border border-primary/10 bg-black/50 p-3">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-primary/30 font-mono mb-1">
                      <RefreshCw className="w-3 h-3" /> Latest Commit
                    </div>
                    <div className="text-sm font-mono text-primary/80">
                      {selectedTool.latestCommit ? selectedTool.latestCommit.slice(0, 12) : "N/A"}
                    </div>
                  </div>
                  <div className="border border-primary/10 bg-black/50 p-3">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-primary/30 font-mono mb-1">
                      <CalendarDays className="w-3 h-3" /> Repository Created
                    </div>
                    <div className="text-sm font-mono text-primary/80">
                      {selectedTool.repoCreatedAt ? new Date(selectedTool.repoCreatedAt).toLocaleDateString() : "N/A"}
                    </div>
                  </div>
                  <div className="border border-primary/10 bg-black/50 p-3">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-primary/30 font-mono mb-1">
                      <CalendarDays className="w-3 h-3" /> Last Updated
                    </div>
                    <div className="text-sm font-mono text-primary/80">
                      {selectedTool.repoUpdatedAt ? new Date(selectedTool.repoUpdatedAt).toLocaleDateString() : "N/A"}
                    </div>
                  </div>
                </div>

                {/* Local Path */}
                {selectedTool.localPath && (
                  <div className="border border-primary/10 bg-black/50 p-3">
                    <div className="text-[10px] uppercase tracking-widest text-primary/30 font-mono mb-1">LOCAL PATH</div>
                    <div className="text-xs font-mono text-primary/50 break-all">{selectedTool.localPath}</div>
                  </div>
                )}

                {/* Updates available indicator */}
                {selectedTool.latestCommit && selectedTool.installedCommit && selectedTool.latestCommit !== selectedTool.installedCommit && (
                  <div className="border border-yellow-500/30 bg-yellow-500/5 p-3">
                    <div className="flex items-center gap-1.5 text-[11px] font-mono text-yellow-400">
                      <RefreshCw className="w-3.5 h-3.5" />
                      Update available — latest commit differs from installed version
                    </div>
                  </div>
                )}

                {/* Update button */}
                <Button
                  className="w-full bg-primary text-black h-10 rounded-none glow-box uppercase tracking-widest text-xs font-bold"
                  onClick={() => {
                    if (selectedTool.id !== undefined) {
                      updateMut.mutate({ id: selectedTool.id }, { onSuccess: () => { invalidate(); toast({ title: "UPDATE COMPLETE", description: `${selectedTool.name} updated successfully` }); } });
                    }
                  }}
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Check for Updates
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
