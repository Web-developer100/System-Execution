import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Search, Shield, Bug, FileText, Wrench, Globe, Settings,
  Users, Plus, Download, LogOut, Terminal, LayoutDashboard,
  Sliders, Key, BookOpen, Bell, Zap, Loader2, type LucideIcon,
} from "lucide-react";
import { getGetScansQueryKey, getGetVulnerabilitiesQueryKey, getGetToolsQueryKey } from "@workspace/api-client-react";
import { useUIStore } from "@/store/use-ui-store";

interface Command {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  action: () => void;
  keywords: string[];
  category: string;
}

// ── Global Search Types ───────────────────────────────────────────────────

interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  type: "scan" | "vulnerability" | "tool" | "page";
  url: string;
  icon: LucideIcon;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [tab, setTab] = useState<"commands" | "search">("commands");
  const [, setLocation] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // ── Navigation Commands ────────────────────────────────────────────────

  const commands: Command[] = [
    { id: "go-dashboard", label: "Dashboard", description: "View command center and metrics", icon: LayoutDashboard, action: () => setLocation("/dashboard"), keywords: ["home", "metrics", "stats"], category: "Navigation" },
    { id: "go-scans", label: "Scans", description: "View and manage scan queue", icon: Shield, action: () => setLocation("/scans"), keywords: ["scan", "queue", "running"], category: "Navigation" },
    { id: "go-vulnerabilities", label: "Vulnerabilities", description: "Browse vulnerability database", icon: Bug, action: () => setLocation("/vulnerabilities"), keywords: ["vuln", "findings", "cve"], category: "Navigation" },
    { id: "go-tools", label: "Tools", description: "Tool arsenal and install pipeline", icon: Wrench, action: () => setLocation("/tools"), keywords: ["arsenal", "install"], category: "Navigation" },
    { id: "go-proxies", label: "Proxies", description: "Proxy mesh network", icon: Globe, action: () => setLocation("/proxies"), keywords: ["proxy", "mesh", "network"], category: "Navigation" },
    { id: "go-reports", label: "Reports", description: "Intelligence report archive", icon: FileText, action: () => setLocation("/reports"), keywords: ["archive", "pdf", "export"], category: "Navigation" },
    { id: "go-settings", label: "Settings", description: "System configuration", icon: Settings, action: () => setLocation("/settings"), keywords: ["config", "preferences"], category: "Navigation" },
    { id: "go-users", label: "User Management", description: "Manage users, roles, and permissions", icon: Users, action: () => setLocation("/settings/users"), keywords: ["team", "roles", "permissions", "auth"], category: "Navigation" },
    { id: "go-api", label: "API Explorer", description: "Interactive API documentation", icon: Key, action: () => setLocation("/settings/api"), keywords: ["swagger", "endpoints", "sdk"], category: "Navigation" },
    { id: "go-marketplace", label: "Plugin Marketplace", description: "Discover and install plugins", icon: Zap, action: () => setLocation("/marketplace"), keywords: ["plugins", "extensions", "addons"], category: "Navigation" },
    { id: "go-logs", label: "Audit Logs", description: "System audit trail", icon: BookOpen, action: () => setLocation("/settings/audit"), keywords: ["audit", "history", "activity"], category: "Navigation" },
    { id: "action-new-scan", label: "New Scan", description: "Create and launch a new scan", icon: Plus, action: () => { setLocation("/scans"); setTimeout(() => document.querySelector<HTMLButtonElement>("[data-new-scan]")?.click(), 100); }, keywords: ["create", "launch", "start"], category: "Actions" },
    { id: "action-export", label: "Export Report", description: "Generate and export a report", icon: Download, action: () => setLocation("/reports"), keywords: ["pdf", "export", "generate"], category: "Actions" },
    { id: "action-install-tool", label: "Install Tool", description: "Install a new security tool via GitHub", icon: Terminal, action: () => setLocation("/tools"), keywords: ["github", "install", "pipeline"], category: "Actions" },
    { id: "action-notifications", label: "Notifications", description: "View notification center", icon: Bell, action: () => setLocation("/notifications"), keywords: ["alerts", "bell"], category: "Actions" },
  ];

  // ── Global Search (fetches from API when query > 2 chars) ──────────────

  const searchEnabled = query.trim().length >= 2;

  const { data: scansData = [], isLoading: scansLoading } = useQuery({
    queryKey: [...getGetScansQueryKey(), "search", query],
    queryFn: async () => {
      const token = localStorage.getItem("v8_token");
      const res = await fetch(`/api/scans?q=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (!res.ok) return [];
      return res.json() as Promise<Array<{ id: number; target: string; status: string }>>;
    },
    enabled: searchEnabled,
    staleTime: 10_000,
  });

  const { data: vulnsData = [], isLoading: vulnsLoading } = useQuery({
    queryKey: [...getGetVulnerabilitiesQueryKey(), "search", query],
    queryFn: async () => {
      const token = localStorage.getItem("v8_token");
      const res = await fetch(`/api/vulnerabilities?q=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (!res.ok) return [];
      return res.json() as Promise<Array<{ id: number; title: string; severity: string; url: string }>>;
    },
    enabled: searchEnabled,
    staleTime: 10_000,
  });

  const { data: toolsData = [], isLoading: toolsLoading } = useQuery({
    queryKey: [...getGetToolsQueryKey(), "search", query],
    queryFn: async () => {
      const token = localStorage.getItem("v8_token");
      const res = await fetch(`/api/tools?q=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (!res.ok) return [];
      return res.json() as Promise<Array<{ id: number; name: string; category: string; version: string }>>;
    },
    enabled: searchEnabled,
    staleTime: 10_000,
  });

  // ── Build search results ───────────────────────────────────────────────

  const searchResults: SearchResult[] = [];

  if (searchEnabled) {
    // Add scan results
    if (Array.isArray(scansData)) {
      for (const scan of scansData) {
        searchResults.push({
          id: `scan-${scan.id}`,
          title: `Scan #${scan.id}: ${scan.target || "Untitled"}`,
          subtitle: `Status: ${scan.status}`,
          type: "scan",
          url: `/scans`,
          icon: Shield,
        });
      }
    }

    // Add vulnerability results
    if (Array.isArray(vulnsData)) {
      for (const vuln of vulnsData) {
        searchResults.push({
          id: `vuln-${vuln.id}`,
          title: vuln.title || "Unknown vulnerability",
          subtitle: `${vuln.severity?.toUpperCase() || "UNKNOWN"} — ${vuln.url || "No URL"}`,
          type: "vulnerability",
          url: `/vulnerabilities`,
          icon: Bug,
        });
      }
    }

    // Add tool results
    if (Array.isArray(toolsData)) {
      for (const tool of toolsData) {
        searchResults.push({
          id: `tool-${tool.id}`,
          title: tool.name || "Unknown tool",
          subtitle: `${tool.category || "Uncategorized"} v${tool.version || "?"}`,
          type: "tool",
          url: `/tools`,
          icon: Wrench,
        });
      }
    }
  }

  // ── Combined display ──────────────────────────────────────────────────

  const isSearching = searchEnabled && (scansLoading || vulnsLoading || toolsLoading);

  const filtered = query.trim()
    ? commands.filter(cmd => {
        const q = query.toLowerCase();
        return cmd.label.toLowerCase().includes(q) ||
               cmd.description.toLowerCase().includes(q) ||
               cmd.keywords.some(k => k.includes(q));
      })
    : commands;

  const hasSearchResults = searchResults.length > 0;
  const showResults = hasSearchResults || isSearching || searchEnabled;

  // ── Keyboard ──────────────────────────────────────────────────────────

  const totalItems = showResults ? searchResults.length + filtered.length : filtered.length;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(prev => !prev);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTab("commands");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const execute = useCallback((item: Command | SearchResult) => {
    setOpen(false);
    if ("action" in item) {
      item.action();
    } else {
      useUIStore.getState().setGlobalSearchQuery(item.title);
      setLocation(item.url);
    }
  }, [setLocation]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, totalItems - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (showResults && selectedIndex < searchResults.length) {
          execute(searchResults[selectedIndex]);
        } else if (filtered[selectedIndex - (showResults ? searchResults.length : 0)]) {
          execute(filtered[selectedIndex - (showResults ? searchResults.length : 0)]);
        }
        break;
    }
  };

  if (!open) return null;

  const categories = [...new Set(filtered.map(c => c.category))];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-fade-in"
        onClick={() => setOpen(false)}
      />

      {/* Modal */}
      <div className="fixed top-[10%] left-1/2 -translate-x-1/2 w-full max-w-2xl z-50 animate-scale-in">
        <div className="glass rounded-xl overflow-hidden shadow-2xl border border-border/50">
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 border-b border-border/50">
            <Search className="w-5 h-5 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
              onKeyDown={handleKeyDown}
              placeholder="Search scans, vulnerabilities, tools, pages, and actions..."
              className="flex-1 h-14 bg-transparent text-foreground placeholder:text-muted-foreground/50 outline-none text-base"
              autoComplete="off"
              autoFocus
            />
            {/* Loading indicator for search */}
            {isSearching && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />}
            <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-1 bg-muted rounded text-[10px] font-mono text-muted-foreground">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-96 overflow-y-auto p-2">
            {/* Search Results Section */}
            {showResults && (
              <div>
                <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-primary">
                  Search Results {isSearching ? "(loading...)" : `(${searchResults.length})`}
                </div>
                {isSearching ? (
                  <div className="py-4 text-center text-muted-foreground text-sm flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Searching across scans, vulnerabilities, tools...
                  </div>
                ) : searchResults.length > 0 ? (
                  searchResults.map((result, idx) => {
                    const Icon = result.icon;
                    return (
                      <button
                        key={result.id}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                          idx === selectedIndex
                            ? "bg-primary/10 text-primary"
                            : "text-foreground hover:bg-muted"
                        }`}
                        onClick={() => execute(result)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">{result.title}</div>
                          <div className="text-xs text-muted-foreground truncate">{result.subtitle}</div>
                        </div>
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                          result.type === "scan" ? "bg-shield/10 text-shield" :
                          result.type === "vulnerability" ? "bg-destructive/10 text-destructive" :
                          "bg-muted text-muted-foreground"
                        }`}>
                          {result.type}
                        </span>
                      </button>
                    );
                  })
                ) : (
                  query.trim().length >= 2 && (
                    <div className="py-4 text-center text-muted-foreground text-sm">
                      No results found for "{query}"
                    </div>
                  )
                )}
              </div>
            )}

            {/* Divider */}
            {showResults && searchResults.length > 0 && filtered.length > 0 && (
              <div className="my-2 border-t border-border/30" />
            )}

            {/* Command Results */}
            {filtered.length === 0 && !showResults ? (
              <div className="py-8 text-center text-muted-foreground text-sm">
                No results for "{query}"
              </div>
            ) : filtered.length > 0 ? (
              categories.map(cat => (
                <div key={cat}>
                  <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {cat}
                  </div>
                  {filtered.filter(c => c.category === cat).map((cmd) => {
                    const globalIdx = (showResults ? searchResults.length : 0) + filtered.indexOf(cmd);
                    const Icon = cmd.icon;
                    return (
                      <button
                        key={cmd.id}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                          globalIdx === selectedIndex
                            ? "bg-primary/10 text-primary"
                            : "text-foreground hover:bg-muted"
                        }`}
                        onClick={() => execute(cmd)}
                        onMouseEnter={() => setSelectedIndex(globalIdx)}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">{cmd.label}</div>
                          <div className="text-xs text-muted-foreground truncate">{cmd.description}</div>
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {cmd.keywords.slice(0, 2).join(", ")}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))
            ) : null}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-4 px-4 py-2.5 border-t border-border/50 bg-muted/30">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">↑↓</kbd>
              <span>Navigate</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">↵</kbd>
              <span>Open</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">⎋</kbd>
              <span>Close</span>
            </div>
            <div className="flex-1 text-right text-[10px] text-muted-foreground/50 font-mono">
              {query.trim() ? `Searching: scans(${Array.isArray(scansData) ? scansData.length : "..."}) · vulns(${Array.isArray(vulnsData) ? vulnsData.length : "..."}) · tools(${Array.isArray(toolsData) ? toolsData.length : "..."})` : "Type to search globally"}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
