import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import {
  Zap, Search, Star, Download, ExternalLink, Check,
  X, ChevronRight, Cpu, Shield, Globe, Wrench,
  AlertTriangle, FileText, Code, type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface Plugin {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: LucideIcon;
  version: string;
  author: string;
  rating: number;
  downloads: number;
  installed: boolean;
  healthScore: number;
  tags: string[];
  docs: string;
}

const MARKETPLACE_PLUGINS: Plugin[] = [
  { id: "nuclei", name: "Nuclei", description: "Fast vulnerability scanner with YAML-based templates. 14,823+ CVE templates.", category: "Scanner", icon: Shield, version: "3.3.2", author: "ProjectDiscovery", rating: 4.9, downloads: 12450, installed: true, healthScore: 98, tags: ["cve", "templates", "fast"], docs: "https://nuclei.projectdiscovery.io" },
  { id: "subfinder", name: "Subfinder", description: "Passive subdomain enumeration using 40+ sources. DNS, certificates, search engines.", category: "Recon", icon: Globe, version: "2.6.6", author: "ProjectDiscovery", rating: 4.8, downloads: 9800, installed: true, healthScore: 95, tags: ["subdomain", "dns", "passive"], docs: "https://github.com/projectdiscovery/subfinder" },
  { id: "naabu", name: "Naabu", description: "Fast port scanner with SYN and connect scanning. 100k ports/second.", category: "Recon", icon: Globe, version: "2.3.1", author: "ProjectDiscovery", rating: 4.7, downloads: 7600, installed: true, healthScore: 92, tags: ["ports", "scan", "fast"], docs: "https://github.com/projectdiscovery/naabu" },
  { id: "httpx", name: "HTTPX", description: "HTTP probing toolkit with TLS, fingerprinting, and screenshot capture.", category: "Utility", icon: Wrench, version: "1.6.0", author: "ProjectDiscovery", rating: 4.6, downloads: 8200, installed: true, healthScore: 90, tags: ["http", "probe", "fingerprint"], docs: "https://github.com/projectdiscovery/httpx" },
  { id: "ffuf", name: "FFUF", description: "Fast web fuzzer for directory discovery, parameter brute-force, and Vhost discovery.", category: "Fuzzer", icon: Zap, version: "2.1.0", author: "ffuf/ffuf", rating: 4.9, downloads: 15000, installed: false, healthScore: 96, tags: ["fuzz", "directory", "bruteforce"], docs: "https://github.com/ffuf/ffuf" },
  { id: "dalfox", name: "Dalfox", description: "Parameter analysis and XSS scanner with 30+ payload types and WAF detection.", category: "Scanner", icon: AlertTriangle, version: "2.9.3", author: "hahwul", rating: 4.5, downloads: 5400, installed: false, healthScore: 88, tags: ["xss", "parameter", "waf"], docs: "https://github.com/hahwul/dalfox" },
  { id: "gospider", name: "Gospider", description: "Fast web spider with JS parsing, form extraction, and link discovery.", category: "Crawler", icon: Code, version: "1.2.0", author: "jaeles-project", rating: 4.3, downloads: 4100, installed: false, healthScore: 85, tags: ["spider", "crawl", "js"], docs: "https://github.com/jaeles-project/gospider" },
  { id: "katana", name: "Katana", description: "Next-gen crawling and spidering framework with headless browser support.", category: "Crawler", icon: Code, version: "1.1.0", author: "ProjectDiscovery", rating: 4.7, downloads: 6300, installed: false, healthScore: 91, tags: ["crawl", "headless", "spider"], docs: "https://github.com/projectdiscovery/katana" },
  { id: "sqlmap", name: "SQLMap", description: "Automatic SQL injection detection and exploitation tool. Supports all major DBMS.", category: "Exploit", icon: AlertTriangle, version: "1.8.2", author: "sqlmapproject", rating: 4.9, downloads: 22000, installed: false, healthScore: 97, tags: ["sqli", "database", "exploit"], docs: "https://sqlmap.org" },
  { id: "trivy", name: "Trivy", description: "Comprehensive vulnerability scanner for containers, Kubernetes, and dependencies.", category: "Scanner", icon: Shield, version: "0.52.0", author: "Aqua Security", rating: 4.8, downloads: 18500, installed: false, healthScore: 94, tags: ["container", "sca", "dependency"], docs: "https://trivy.dev" },
];

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

function PluginDetail({ plugin, onClose }: { plugin: Plugin; onClose: () => void }) {
  const Icon = plugin.icon;
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
          {/* Tags */}
          <div className="flex flex-wrap gap-1.5">
            {plugin.tags.map(tag => (
              <Badge key={tag} variant="secondary" className="rounded-md text-[10px] font-mono">{tag}</Badge>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button className="flex-1 bg-primary text-primary-foreground">
              {plugin.installed ? <><Check className="w-4 h-4 mr-1.5" /> Installed</> : <><Download className="w-4 h-4 mr-1.5" /> Install</>}
            </Button>
            <Button variant="outline" className="gap-2">
              <ExternalLink className="w-4 h-4" /> Docs
            </Button>
          </div>

          {/* Info Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg border border-border/50 bg-muted/20">
              <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Author</div>
              <div className="text-sm font-medium mt-0.5">{plugin.author}</div>
            </div>
            <div className="p-3 rounded-lg border border-border/50 bg-muted/20">
              <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Health</div>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-success rounded-full" style={{ width: `${plugin.healthScore}%` }} />
                </div>
                <span className="text-sm font-mono text-success">{plugin.healthScore}%</span>
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
  const [selectedPlugin, setSelectedPlugin] = useState<Plugin | null>(null);
  const [installed, setInstalled] = useState<Set<string>>(new Set(MARKETPLACE_PLUGINS.filter(p => p.installed).map(p => p.id)));

  const filtered = MARKETPLACE_PLUGINS.filter(p => {
    if (categoryFilter !== "All" && p.category !== categoryFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.tags.some(t => t.includes(q));
    }
    return true;
  });

  const handleInstall = (pluginId: string) => {
    setInstalled(prev => {
      const next = new Set(prev);
      if (next.has(pluginId)) next.delete(pluginId);
      else next.add(pluginId);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
          <Zap className="w-6 h-6 text-primary" />
          Plugin Marketplace
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Discover, install, and manage security tools</p>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search plugins..." className="pl-9 bg-muted/30 border-border/50 h-11" />
        </div>
      </div>

      {/* Category Pills */}
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

      {/* Plugin Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(plugin => {
          const Icon = plugin.icon;
          const isInstalled = installed.has(plugin.id);
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
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{plugin.description}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <StarRating rating={plugin.rating} />
                  <Badge variant="outline" className="rounded-md text-[10px]">{plugin.category}</Badge>
                </div>

                <div className="flex items-center gap-2 mt-3">
                  <Button size="sm"
                    className={`flex-1 h-8 text-xs ${
                      isInstalled ? "bg-success/10 text-success border border-success/30 hover:bg-success/20" : "bg-primary text-primary-foreground hover:bg-primary/90"
                    }`}
                    onClick={e => { e.stopPropagation(); handleInstall(plugin.id); }}>
                    {isInstalled ? <><Check className="w-3 h-3 mr-1" /> Installed</> : <><Download className="w-3 h-3 mr-1" /> Install</>}
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
      </div>

      {/* Detail Dialog */}
      {selectedPlugin && <PluginDetail plugin={selectedPlugin} onClose={() => setSelectedPlugin(null)} />}
    </div>
  );
}
