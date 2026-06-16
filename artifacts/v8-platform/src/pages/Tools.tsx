import { useGetTools, useInstallTool, useDeleteTool, useUpdateTool, getGetToolsQueryKey } from "@workspace/api-client-react";
import { useI18n } from "@/lib/i18n";
import { Wrench, Github, RefreshCw, Trash2, CheckCircle2, XCircle, AlertCircle, Plus } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

const STATUS_CONFIG = {
  active:   { icon: CheckCircle2, color: "text-primary border-primary bg-primary/10", label: "ACTIVE" },
  inactive: { icon: XCircle,      color: "text-primary/40 border-primary/20 bg-primary/5", label: "INACTIVE" },
  updating: { icon: RefreshCw,    color: "text-yellow-400 border-yellow-500/50 bg-yellow-500/10", label: "UPDATING" },
  error:    { icon: XCircle,      color: "text-destructive border-destructive/50 bg-destructive/10", label: "ERROR" },
};

export default function Tools() {
  const { data: tools, isLoading } = useGetTools({
    query: { queryKey: getGetToolsQueryKey(), refetchInterval: 30_000 }
  });
  const installMut = useInstallTool();
  const deleteMut = useDeleteTool();
  const updateMut = useUpdateTool();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const { toast } = useToast();

  const [repoUrl, setRepoUrl] = useState("");
  const [toolName, setToolName] = useState("");
  const [toolDesc, setToolDesc] = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetToolsQueryKey() });

  const handleInstall = (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl.trim() || !toolName.trim()) return;
    installMut.mutate(
      { data: { name: toolName.trim(), githubUrl: repoUrl.trim(), description: toolDesc.trim() } },
      {
        onSuccess: () => {
          invalidate();
          setRepoUrl("");
          setToolName("");
          setToolDesc("");
          toast({ title: "TOOL INSTALLED", description: `${toolName} injected into arsenal.` });
        },
        onError: () => {
          toast({ title: "INSTALL FAILED", description: "Could not install tool.", variant: "destructive" });
        }
      }
    );
  };

  const activeCount = tools?.filter(t => t.status === "active").length ?? 0;

  return (
    <div className="space-y-6">
      <div className="border-b border-primary/20 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary tracking-widest glow-text uppercase flex items-center gap-3">
            <Wrench className="w-6 h-6" />
            {t('tools.title')}
          </h1>
          <p className="text-primary/40 text-xs font-mono mt-1">
            {activeCount} ACTIVE ● {(tools?.length ?? 0) - activeCount} OFFLINE
          </p>
        </div>
      </div>

      {/* Install Form */}
      <div className="border border-primary/30 glow-box bg-card p-5">
        <div className="flex items-center gap-2 text-primary glow-text text-sm uppercase tracking-widest mb-4">
          <Plus className="w-4 h-4" />
          {t('tools.install_title')}
        </div>
        <form onSubmit={handleInstall} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wider text-primary/50 font-mono">{t('tools.name_label')}</label>
            <Input
              value={toolName}
              onChange={e => setToolName(e.target.value)}
              placeholder="e.g. subfinder"
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
            {installMut.isPending ? "INSTALLING..." : t('action.install_tool')}
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
            return (
              <Card
                key={tool.id}
                className="bg-card border-primary/20 hover:border-primary/50 transition-all group relative overflow-hidden"
                data-testid={`card-tool-${tool.id}`}
              >
                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 pointer-events-none transition-opacity">
                  <Wrench className="w-20 h-20 text-primary" />
                </div>
                <CardHeader className="pb-3 pt-4 px-4">
                  <div className="flex justify-between items-start">
                    <div className="text-lg font-bold text-primary glow-text uppercase tracking-wider font-mono">
                      {tool.name}
                    </div>
                    <Badge variant="outline" className={`uppercase text-[10px] font-mono rounded-none border ${cfg.color}`}>
                      <Icon className={`w-3 h-3 mr-1 ${tool.status === 'updating' ? 'animate-spin' : ''}`} />
                      {cfg.label}
                    </Badge>
                  </div>
                  {tool.description && (
                    <p className="text-xs text-primary/40 mt-1 font-mono leading-relaxed line-clamp-2">
                      {tool.description}
                    </p>
                  )}
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  {tool.githubUrl && (
                    <div className="text-[11px] text-primary/30 font-mono mb-3 truncate flex items-center gap-1.5">
                      <Github className="w-3 h-3 shrink-0" />
                      {tool.githubUrl.replace("https://github.com/", "")}
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
                      onClick={() => updateMut.mutate({ id: tool.id }, { onSuccess: invalidate })}
                      disabled={updateMut.isPending || tool.status === 'updating'}
                      data-testid={`button-update-${tool.id}`}
                    >
                      <RefreshCw className={`w-3 h-3 mr-1.5 ${updateMut.isPending ? 'animate-spin' : ''}`} />
                      {t('common.update')}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-primary/30 hover:bg-destructive/10 hover:text-destructive rounded-none"
                      onClick={() => deleteMut.mutate({ id: tool.id }, { onSuccess: invalidate })}
                      data-testid={`button-delete-${tool.id}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
