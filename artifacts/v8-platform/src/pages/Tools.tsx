import { useGetTools, useInstallTool, useDeleteTool, useUpdateTool, getGetToolsQueryKey } from "@workspace/api-client-react";
import { useI18n } from "@/lib/i18n";
import { Terminal, Github, RefreshCw, Trash2, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export default function Tools() {
  const { data: tools, isLoading } = useGetTools();
  const installMut = useInstallTool();
  const deleteMut = useDeleteTool();
  const updateMut = useUpdateTool();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const { toast } = useToast();

  const [repoUrl, setRepoUrl] = useState("");
  const [toolName, setToolName] = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetToolsQueryKey() });

  const handleInstall = (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl || !toolName) return;
    
    installMut.mutate(
      { data: { name: toolName, githubUrl: repoUrl } },
      {
        onSuccess: () => {
          invalidate();
          setRepoUrl("");
          setToolName("");
          toast({ title: "Tool Installed", description: `${toolName} added to arsenal.` });
        }
      }
    );
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-primary tracking-widest glow-text uppercase border-b border-primary/20 pb-4">
        {t('nav.tools')} // ARSENAL
      </h1>

      <Card className="bg-card border-primary/30 glow-box">
        <CardHeader>
          <CardTitle className="text-lg text-primary glow-text uppercase tracking-widest">Install New Tool</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleInstall} className="flex gap-4 items-end">
            <div className="flex-1 space-y-2">
              <label className="text-xs uppercase tracking-wider text-primary/70">Tool Name</label>
              <Input 
                value={toolName}
                onChange={(e) => setToolName(e.target.value)}
                placeholder="e.g. subfinder"
                className="bg-black border-primary/30 text-primary h-12"
              />
            </div>
            <div className="flex-[2] space-y-2">
              <label className="text-xs uppercase tracking-wider text-primary/70">GitHub URL</label>
              <div className="relative">
                <Github className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/50" />
                <Input 
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/projectdiscovery/subfinder"
                  className="bg-black border-primary/30 text-primary pl-10 h-12"
                />
              </div>
            </div>
            <Button type="submit" disabled={installMut.isPending} className="bg-primary text-black h-12 px-8 glow-box font-bold">
              {t('action.install_tool')}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          Array(6).fill(0).map((_, i) => <Card key={i} className="h-40 bg-card border-primary/10 animate-pulse" />)
        ) : tools?.map(tool => (
          <Card key={tool.id} className="bg-card border-primary/20 hover:border-primary/50 transition-colors group relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 pointer-events-none">
              <Terminal className="w-24 h-24 text-primary" />
            </div>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <CardTitle className="text-xl font-bold text-primary glow-text uppercase tracking-wider flex items-center gap-2">
                  <Terminal className="w-5 h-5" />
                  {tool.name}
                </CardTitle>
                <Badge variant="outline" className={`
                  ${tool.status === 'active' ? 'border-primary text-primary' : ''}
                  ${tool.status === 'error' ? 'border-destructive text-destructive' : ''}
                  ${tool.status === 'updating' ? 'border-yellow-500 text-yellow-500' : ''}
                  uppercase
                `}>
                  {tool.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-primary/50 mb-4 font-mono truncate">
                {tool.githubUrl || "CORE_MODULE"}
              </div>
              <div className="flex items-center justify-between text-xs mt-4 pt-4 border-t border-primary/10">
                <span className="text-primary/70">v{tool.version || "1.0.0"}</span>
                <div className="flex gap-2">
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-primary hover:bg-primary/20 hover:text-primary" onClick={() => updateMut.mutate({ id: tool.id }, { onSuccess: invalidate })}>
                    <RefreshCw className={`w-4 h-4 ${tool.status === 'updating' ? 'animate-spin' : ''}`} />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:bg-destructive/20 hover:text-destructive" onClick={() => deleteMut.mutate({ id: tool.id }, { onSuccess: invalidate })}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
