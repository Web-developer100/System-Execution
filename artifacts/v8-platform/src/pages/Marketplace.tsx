import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import {
  Zap, Search, Star, Download, ExternalLink, Check,
  ChevronRight, Shield, Globe, Wrench,
  AlertTriangle, Code, RefreshCw, type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

interface ApiPlugin {
  id: string;
  name: string;
  description: string;
  shortDescription?: string;
  category: string;
  version: string;
  author: string;
  rating: number;
  downloads: number;
  installed: boolean;
  healthScore: number;
  tags: string[];
  docs: string;
}

const ICON_MAP: Record<string, LucideIcon> = {
  Scanner: Shield,
  Recon: Globe,
  Utility: Wrench,
  Fuzzer: Zap,
  Exploit: AlertTriangle,
  Crawler: Code,
};

const CATEGORIES = ["All", "Scanner", "Recon", "Crawler", "Fuzzer", "Exploit", "Utility"];

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={`w-3 h-3 ${i < Math.floor(rating) ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground/30"}`} />
      ))}
      <span className="text-xs text-muted-foreground ml-1">{rating}</span>
    </div>
  );
}

function PluginDetail({ plugin, onClose, onInstall, installing }: {
  plugin: ApiPlugin;
  onClose: () => void;
  onInstall: (id: string) => void;
  installing: boolean;
}) {
  const Icon = ICON_MAP[plugin.category] ?? Shield;
  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="bg-background border-border/50 max-w-2xl max-h-[80vh] overflow-y-auto rounded-xl">
        <DialogHeader>
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <Icon className="w-7 h-7 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-xl font-bold">{plugin.name}</DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">{plugin.description}</p>
              <div className="flex flex-wrap items-center gap-3 mt-2">
                <StarRating rating={plugin.rating} />
                <span className="text-xs text-muted-foreground">{plugin.downloads.toLocaleString()} downloads</span>
                <Badge variant="outline" className="rounded-md text-[10px]">{plugin.version}</Badge>
                <Badge variant="outline" className="rounded-md text-[10px]">{plugin.category}</Badge>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div className="flex flex-wrap gap-1.5">
            {plugin.tags.map(tag => (
              <Badge key={tag} variant="secondary" className="rounded-md text-[10px] font-mono">{tag}</Badge>
            ))}
          </div>

          <div className="flex gap-2">
            <Button
              className={`flex-1 ${plugin.installed ? "bg-success/10 text-success border border-success/30 hover:bg-success/20" : "bg-primary text-primary-foreground"}`}
              onClick={() => onInstall(plugin.id)}
              disabled={installing}
            >
              {installing ? (
                <><RefreshCw className="w-4 h-4 mr-1.5 animate-spin" /> Processing...</>
              ) : plugin.installed ? (
                <><Check className="w-4 h-4 mr-1.5" /> Installed</>
              ) : (
                <><Download className="w-4 h-4 mr-1.5" /> Install</>
              )}
            </Button>
            <Button variant="outline" className="gap-2" asChild>
              <a href={plugin.docs} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4" /> Docs
              </a>
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg border border-border/50 bg-muted/20">
              <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Author</div>
              <div className="text-sm font-medium mt-0.5">{plugin.author}</div>
            </div>
            <div className="p-3 rounded-lg border border-border/50 bg-muted/20">
              <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Health Score</div>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full" style={{ width: `${plugin.healthScore}%` }} />
                </div>
                <span className="text-sm font-mono text-green-500">{plugin.healthScore}%</span>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Marketplace() {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [selectedPlugin, setSelectedPlugin] = useState<ApiPlugin | null>(null);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: pluginData, isLoading } = useQuery<{ plugins: ApiPlugin[] }>({
    queryKey: ["marketplace"],
    queryFn: async () => {
      const res = await authFetch("/api/marketplace");
      if (!res.ok) throw new Error("Failed to load marketplace");
      return res.json();
    },
    staleTime: 30_000,
  });

  const installMut = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "install" | "uninstall" }) => {
      const url = action === "install"
        ? `/api/marketplace/${id}/install`
        : `/api/plugins/${encodeURIComponent(id)}`;
      const res = await authFetch(url, { method: action === "install" ? "POST" : "DELETE" });
      if (!res.ok) throw new Error(`Failed to ${action} plugin`);
      return res.json();
    },
    onSuccess: (_data, { id, action }) => {
      queryClient.invalidateQueries({ queryKey: ["marketplace"] });
      toast({
        title: action === "install" ? "Plugin Installed" : "Plugin Removed",
        description: `Successfully ${action}ed plugin ${id}`,
      });
    },
    onError: (_err, { id }) => {
      toast({ title: "Action Failed", description: `Could not update plugin ${id}`, variant: "destructive" });
    },
    onSettled: () => setInstallingId(null),
  });

  const plugins = pluginData?.plugins ?? [];

  const filtered = plugins.filter(p => {
    if (categoryFilter !== "All" && p.category !== categoryFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.tags.some(t => t.includes(q));
    }
    return true;
  });

  const handleInstall = (pluginId: string) => {
    const plugin = plugins.find(p => p.id === pluginId);
    if (!plugin) return;
    setInstallingId(pluginId);
    installMut.mutate({ id: pluginId, action: plugin.installed ? "uninstall" : "install" });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
          <Zap className="w-6 h-6 text-primary" />
          Plugin Marketplace
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isLoading ? "Loading plugins..." : `${plugins.length} plugins available — ${plugins.filter(p => p.installed).length} installed`}
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search plugins..." className="pl-9 bg-muted/30 border-border/50 h-11" />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map(cat => (
          <button key={cat} onClick={() => setCategoryFilter(cat)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              categoryFilter === cat ? "bg-primary/10 text-primary border-primary/30" : "bg-muted/30 text-muted-foreground border-border/50 hover:border-border"
            }`}>
            {cat}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="glass-card">
              <CardContent className="p-4 space-y-3">
                <Skeleton className="h-10 w-10 rounded-xl" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-8 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(plugin => {
            const Icon = ICON_MAP[plugin.category] ?? Shield;
            const isInstalled = plugin.installed;
            const isInstalling = installingId === plugin.id;
            return (
              <Card key={plugin.id}
                className="glass-card hover:border-primary/30 transition-all cursor-pointer group"
                onClick={() => setSelectedPlugin(plugin)}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/5 border border-border/50 flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold truncate">{plugin.name}</h3>
                        <Badge variant="outline" className="rounded-sm text-[9px] font-mono shrink-0">{plugin.version}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {plugin.shortDescription ?? plugin.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <StarRating rating={plugin.rating} />
                    <Badge variant="outline" className="rounded-md text-[10px]">{plugin.category}</Badge>
                  </div>

                  <div className="flex items-center gap-2 mt-3">
                    <Button size="sm"
                      className={`flex-1 h-8 text-xs ${
                        isInstalled ? "bg-green-500/10 text-green-500 border border-green-500/30 hover:bg-green-500/20" : "bg-primary text-primary-foreground hover:bg-primary/90"
                      }`}
                      disabled={isInstalling}
                      onClick={e => { e.stopPropagation(); handleInstall(plugin.id); }}>
                      {isInstalling ? (
                        <><RefreshCw className="w-3 h-3 mr-1 animate-spin" /> Installing...</>
                      ) : isInstalled ? (
                        <><Check className="w-3 h-3 mr-1" /> Installed</>
                      ) : (
                        <><Download className="w-3 h-3 mr-1" /> Install</>
                      )}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground"
                      onClick={e => { e.stopPropagation(); setSelectedPlugin(plugin); }}>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {filtered.length === 0 && !isLoading && (
            <div className="col-span-3 text-center py-16 text-muted-foreground">
              No plugins found matching your search.
            </div>
          )}
        </div>
      )}

      {selectedPlugin && (
        <PluginDetail
          plugin={selectedPlugin}
          onClose={() => setSelectedPlugin(null)}
          onInstall={handleInstall}
          installing={installingId === selectedPlugin.id}
        />
      )}
    </div>
  );
}
