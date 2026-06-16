import {
  useGetProxies, useAddProxy, useDeleteProxy,
  useCheckCurrentIp, useToggleProxyMode,
  getGetProxiesQueryKey, getCheckCurrentIpQueryKey,
} from "@workspace/api-client-react";
import { useI18n } from "@/lib/i18n";
import { Globe, Plus, Trash2, MapPin, Activity, ShieldCheck, ShieldAlert, Wifi } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

type Protocol = "http" | "https" | "socks5";

const STATUS_COLORS: Record<string, string> = {
  active:   "border-primary text-primary bg-primary/10",
  inactive: "border-destructive/50 text-destructive/70 bg-destructive/5",
  testing:  "border-yellow-500/50 text-yellow-400 bg-yellow-500/5",
};

export default function Proxies() {
  const { data: proxies, isLoading } = useGetProxies({
    query: { queryKey: getGetProxiesQueryKey(), refetchInterval: 30_000 }
  });
  const { data: ipInfo, refetch: checkIp, isFetching: checkingIp } = useCheckCurrentIp({
    query: { queryKey: getCheckCurrentIpQueryKey(), enabled: false }
  });
  const addMut = useAddProxy();
  const deleteMut = useDeleteProxy();
  const toggleMut = useToggleProxyMode();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const { toast } = useToast();

  const [ip, setIp] = useState("");
  const [port, setPort] = useState("");
  const [protocol, setProtocol] = useState<Protocol>("http");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [proxyEnabled, setProxyEnabled] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetProxiesQueryKey() });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ip.trim() || !port) return;
    addMut.mutate(
      { data: { ip: ip.trim(), port: parseInt(port), protocol, username: username || undefined, password: password || undefined } },
      {
        onSuccess: () => {
          invalidate();
          setIsDialogOpen(false);
          setIp(""); setPort(""); setUsername(""); setPassword("");
          toast({ title: "NODE INJECTED", description: `${ip}:${port} added to mesh.` });
        },
        onError: () => {
          toast({ title: "INJECTION FAILED", variant: "destructive" });
        }
      }
    );
  };

  const handleToggle = (checked: boolean) => {
    setProxyEnabled(checked);
    toggleMut.mutate(
      { data: { enabled: checked } },
      {
        onSuccess: () => {
          checkIp();
          toast({ title: "PROXY NETWORK", description: checked ? "ROUTING ENGAGED" : "ROUTING DISABLED" });
        }
      }
    );
  };

  const activeCount = proxies?.filter(p => p.status === "active").length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-4 border-b border-primary/20 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-primary tracking-widest glow-text uppercase flex items-center gap-3">
            <Globe className="w-6 h-6" />
            {t('proxies.title')}
          </h1>
          <p className="text-primary/40 text-xs font-mono mt-1">
            {activeCount} ACTIVE NODES ● {proxies?.length ?? 0} TOTAL
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Proxy Toggle */}
          <div className="flex items-center gap-2 border border-primary/30 px-3 py-2 bg-black">
            <span className="text-xs uppercase tracking-widest text-primary/60 font-mono">{t('proxies.toggle')}</span>
            <Switch
              checked={proxyEnabled}
              onCheckedChange={handleToggle}
              className="data-[state=checked]:bg-primary"
              data-testid="switch-proxy-toggle"
            />
            <span className={`text-xs font-mono uppercase ${proxyEnabled ? "text-primary glow-text" : "text-primary/30"}`}>
              {proxyEnabled ? "ON" : "OFF"}
            </span>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary text-black hover:bg-primary/90 glow-box rounded-none uppercase tracking-wider text-xs font-bold h-10">
                <Plus className="w-4 h-4 mr-2" />
                {t('action.add_proxy')}
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-black border-primary/40 text-primary max-w-sm rounded-none">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold tracking-widest glow-text uppercase">
                  {t('proxies.add_title')}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAdd} className="space-y-4 mt-2">
                <div className="space-y-1.5">
                  <label className="text-[11px] uppercase tracking-wider text-primary/50 font-mono">{t('proxies.ip_label')}</label>
                  <Input value={ip} onChange={e => setIp(e.target.value)} placeholder="192.168.1.100"
                    className="bg-black border-primary/30 text-primary h-11 rounded-none font-mono" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[11px] uppercase tracking-wider text-primary/50 font-mono">{t('proxies.port_label')}</label>
                    <Input value={port} onChange={e => setPort(e.target.value)} placeholder="8080" type="number"
                      className="bg-black border-primary/30 text-primary h-11 rounded-none font-mono" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] uppercase tracking-wider text-primary/50 font-mono">{t('proxies.proto_label')}</label>
                    <Select value={protocol} onValueChange={v => setProtocol(v as Protocol)}>
                      <SelectTrigger className="bg-black border-primary/30 text-primary h-11 rounded-none font-mono">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-black border-primary/30 text-primary rounded-none">
                        <SelectItem value="http">HTTP</SelectItem>
                        <SelectItem value="https">HTTPS</SelectItem>
                        <SelectItem value="socks5">SOCKS5</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[11px] uppercase tracking-wider text-primary/50 font-mono">USER (optional)</label>
                    <Input value={username} onChange={e => setUsername(e.target.value)} placeholder="username"
                      className="bg-black border-primary/30 text-primary h-11 rounded-none font-mono" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] uppercase tracking-wider text-primary/50 font-mono">PASS (optional)</label>
                    <Input value={password} onChange={e => setPassword(e.target.value)} placeholder="password" type="password"
                      className="bg-black border-primary/30 text-primary h-11 rounded-none font-mono" />
                  </div>
                </div>
                <Button type="submit" disabled={addMut.isPending || !ip.trim() || !port}
                  className="w-full bg-primary text-black rounded-none glow-box uppercase tracking-widest font-bold h-11">
                  {addMut.isPending ? t('proxies.adding') : t('proxies.add_btn')}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* IP Trace Panel */}
      <div className="bg-black border border-primary/30 glow-box p-5 flex flex-wrap items-center gap-6">
        <Button
          onClick={() => checkIp()}
          disabled={checkingIp}
          variant="outline"
          className="border-primary/50 text-primary hover:bg-primary/10 h-16 w-36 flex-col gap-1 glow-box rounded-none"
          data-testid="button-trace-ip"
        >
          <Wifi className={`w-5 h-5 ${checkingIp ? "animate-pulse" : ""}`} />
          <span className="text-[10px] tracking-widest uppercase">{t('proxies.trace')}</span>
        </Button>

        {ipInfo ? (
          <div className="flex-1 space-y-2">
            <div className="text-xs text-primary/40 uppercase tracking-widest font-mono">{t('proxies.outbound')}</div>
            <div className="text-2xl font-bold text-primary glow-text font-mono flex items-center gap-3 flex-wrap">
              {ipInfo.ip}
              {ipInfo.proxyEnabled ? (
                <Badge className="bg-primary/15 text-primary border border-primary glow-box rounded-none text-xs uppercase">
                  <ShieldCheck className="w-3 h-3 mr-1" />
                  {t('proxies.hidden')}
                </Badge>
              ) : (
                <Badge variant="outline" className="border-destructive/50 text-destructive bg-destructive/10 rounded-none text-xs uppercase glow-box-red">
                  <ShieldAlert className="w-3 h-3 mr-1" />
                  {t('proxies.exposed')}
                </Badge>
              )}
            </div>
            <div className="text-xs text-primary/50 flex items-center gap-2 uppercase tracking-wider font-mono flex-wrap">
              <MapPin className="w-3 h-3" />
              <span>{ipInfo.country}</span>
              {ipInfo.city && <span>/ {ipInfo.city}</span>}
              <span className="text-primary/30">●</span>
              <span>{ipInfo.isp}</span>
              {ipInfo.lat && ipInfo.lon && (
                <span className="text-primary/30">({ipInfo.lat.toFixed(2)}, {ipInfo.lon.toFixed(2)})</span>
              )}
            </div>
          </div>
        ) : (
          <div className="text-primary/30 font-mono text-sm animate-pulse">
            AWAITING TRACE VECTOR...
          </div>
        )}
      </div>

      {/* Proxy Table */}
      <div className="border border-primary/20 glow-box bg-card">
        <Table>
          <TableHeader className="bg-primary/5 border-b border-primary/20">
            <TableRow className="hover:bg-transparent border-none">
              <TableHead className="text-primary/60 text-xs uppercase tracking-widest font-mono">{t('proxies.node')}</TableHead>
              <TableHead className="text-primary/60 text-xs uppercase tracking-widest font-mono">{t('proxies.protocol')}</TableHead>
              <TableHead className="text-primary/60 text-xs uppercase tracking-widest font-mono">{t('proxies.geo')}</TableHead>
              <TableHead className="text-primary/60 text-xs uppercase tracking-widest font-mono">{t('proxies.latency')}</TableHead>
              <TableHead className="text-primary/60 text-xs uppercase tracking-widest font-mono">HEALTH</TableHead>
              <TableHead className="text-primary/60 text-xs uppercase tracking-widest font-mono">{t('proxies.status')}</TableHead>
              <TableHead className="text-primary/60 text-xs uppercase tracking-widest font-mono text-right">{t('proxies.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-primary/40 py-12 font-mono animate-pulse">
                  SCANNING MESH...
                </TableCell>
              </TableRow>
            ) : !proxies?.length ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-primary/30 py-12 font-mono">
                  {t('proxies.empty')}
                </TableCell>
              </TableRow>
            ) : proxies.map(proxy => (
              <TableRow
                key={proxy.id}
                className="border-b border-primary/10 hover:bg-primary/5"
                data-testid={`row-proxy-${proxy.id}`}
              >
                <TableCell className="font-mono font-medium text-primary glow-text text-sm">
                  {proxy.ip}<span className="text-primary/40">:{proxy.port}</span>
                </TableCell>
                <TableCell className="uppercase text-primary/60 font-mono text-xs">
                  {proxy.protocol}
                </TableCell>
                <TableCell className="text-primary/60 font-mono text-xs">
                  {proxy.country || "UNKNOWN"}
                  {proxy.isp && <div className="text-primary/30 text-[10px]">{proxy.isp}</div>}
                </TableCell>
                <TableCell className="font-mono text-sm">
                  <span className={proxy.latency && proxy.latency < 100 ? "text-primary" : "text-yellow-400"}>
                    {proxy.latency ? `${proxy.latency}ms` : "—"}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <div className="h-1 w-16 bg-black border border-primary/20">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${proxy.healthScore ?? 0}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono text-primary/50">{proxy.healthScore ?? 0}%</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={`uppercase text-[10px] font-mono rounded-none border ${STATUS_COLORS[proxy.status] || "border-primary/20 text-primary/40"}`}
                  >
                    {proxy.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-primary/30 hover:text-destructive hover:bg-destructive/10 rounded-none"
                    onClick={() => deleteMut.mutate({ id: proxy.id }, { onSuccess: invalidate })}
                    data-testid={`button-delete-proxy-${proxy.id}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
