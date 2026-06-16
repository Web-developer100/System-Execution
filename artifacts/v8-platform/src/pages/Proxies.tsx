import { useGetProxies, useAddProxy, useDeleteProxy, useCheckCurrentIp, useToggleProxyMode, getGetProxiesQueryKey } from "@workspace/api-client-react";
import { useI18n } from "@/lib/i18n";
import { Globe, Plus, Trash2, MapPin, Activity, ShieldCheck, ShieldAlert } from "lucide-react";
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
import { ProxyInputProtocol } from "@workspace/api-client-react";

export default function Proxies() {
  const { data: proxies, isLoading } = useGetProxies();
  const { data: ipInfo, refetch: checkIp, isFetching: checkingIp } = useCheckCurrentIp();
  const addMut = useAddProxy();
  const deleteMut = useDeleteProxy();
  const toggleMut = useToggleProxyMode();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const { toast } = useToast();

  const [ip, setIp] = useState("");
  const [port, setPort] = useState("");
  const [protocol, setProtocol] = useState<ProxyInputProtocol>("http");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetProxiesQueryKey() });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ip || !port) return;
    
    addMut.mutate(
      { data: { ip, port: parseInt(port), protocol } },
      {
        onSuccess: () => {
          invalidate();
          setIsDialogOpen(false);
          setIp("");
          setPort("");
          toast({ title: "Proxy Added", description: `Added ${ip}:${port}` });
        }
      }
    );
  };

  const handleToggle = (checked: boolean) => {
    toggleMut.mutate({ data: { enabled: checked } }, {
      onSuccess: () => {
        checkIp();
        toast({ title: "Proxy Network", description: checked ? "ENGAGED" : "DISABLED" });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center border-b border-primary/20 pb-4">
        <h1 className="text-3xl font-bold text-primary tracking-widest glow-text uppercase flex items-center gap-3">
          <Globe className="w-8 h-8" />
          {t('nav.proxies')} // MESH
        </h1>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 border border-primary/30 p-2 rounded-none bg-black">
            <span className="text-xs uppercase tracking-widest text-primary/70">PROXY NETWORK</span>
            <Switch 
              checked={ipInfo?.proxyEnabled || false} 
              onCheckedChange={handleToggle}
              className="data-[state=checked]:bg-primary"
            />
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary text-black hover:bg-primary/90 glow-box">
                <Plus className="w-4 h-4 mr-2 rtl:ml-2 rtl:mr-0" />
                {t('action.add_proxy')}
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-primary/30 text-primary crt max-w-sm">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold tracking-widest glow-text">ADD PROXY NODE</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAdd} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-wider text-primary/70">IP Address</label>
                  <Input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="192.168.1.1" className="bg-black border-primary/30 text-primary h-12" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs uppercase tracking-wider text-primary/70">Port</label>
                    <Input value={port} onChange={(e) => setPort(e.target.value)} placeholder="8080" type="number" className="bg-black border-primary/30 text-primary h-12" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs uppercase tracking-wider text-primary/70">Protocol</label>
                    <Select value={protocol} onValueChange={(v) => setProtocol(v as ProxyInputProtocol)}>
                      <SelectTrigger className="bg-black border-primary/30 text-primary h-12 rounded-none">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-primary/30 text-primary rounded-none">
                        <SelectItem value="http">HTTP</SelectItem>
                        <SelectItem value="https">HTTPS</SelectItem>
                        <SelectItem value="socks5">SOCKS5</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button type="submit" disabled={addMut.isPending} className="w-full bg-primary text-black mt-4 glow-box font-bold tracking-widest">
                  {addMut.isPending ? "INJECTING..." : "ADD NODE"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="col-span-1 md:col-span-3 bg-black border border-primary/30 p-6 glow-box flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Button onClick={() => checkIp()} disabled={checkingIp} variant="outline" className="border-primary text-primary hover:bg-primary/20 h-16 w-32 flex-col gap-1 glow-box">
              <Activity className={`w-5 h-5 ${checkingIp ? 'animate-spin' : ''}`} />
              <span className="text-[10px] tracking-widest">TRACE IP</span>
            </Button>
            
            {ipInfo ? (
              <div className="space-y-1">
                <div className="text-sm text-primary/50 uppercase tracking-widest">Current Outbound Vector</div>
                <div className="text-2xl font-bold text-primary glow-text flex items-center gap-3">
                  {ipInfo.ip}
                  {ipInfo.proxyEnabled ? (
                    <Badge className="bg-primary text-black text-xs px-2 py-0 h-5">HIDDEN</Badge>
                  ) : (
                    <Badge variant="destructive" className="text-xs px-2 py-0 h-5 glow-box-red">EXPOSED</Badge>
                  )}
                </div>
                <div className="text-xs text-primary/70 flex items-center gap-2 uppercase tracking-wider">
                  <MapPin className="w-3 h-3" />
                  {ipInfo.country} - {ipInfo.isp}
                </div>
              </div>
            ) : (
              <div className="text-primary/50 animate-pulse">Awaiting trace...</div>
            )}
          </div>
        </div>

        <div className="col-span-1 md:col-span-3 border border-primary/20 bg-card glow-box">
          <Table>
            <TableHeader className="bg-primary/5 border-b border-primary/20">
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-primary">NODE</TableHead>
                <TableHead className="text-primary">PROTOCOL</TableHead>
                <TableHead className="text-primary">GEO</TableHead>
                <TableHead className="text-primary">LATENCY</TableHead>
                <TableHead className="text-primary">STATUS</TableHead>
                <TableHead className="text-primary text-right">ACTIONS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center text-primary/50 py-8">Scanning mesh...</TableCell></TableRow>
              ) : proxies?.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-primary/50 py-8">NO NODES AVAILABLE</TableCell></TableRow>
              ) : (
                proxies?.map(proxy => (
                  <TableRow key={proxy.id} className="border-b border-primary/10 hover:bg-primary/5">
                    <TableCell className="font-mono font-medium text-primary glow-text">{proxy.ip}:{proxy.port}</TableCell>
                    <TableCell className="uppercase text-primary/70">{proxy.protocol}</TableCell>
                    <TableCell className="text-primary/70">{proxy.country || "UNKNOWN"}</TableCell>
                    <TableCell className="font-mono text-primary/70">{proxy.latency ? `${proxy.latency}ms` : "-"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`
                        ${proxy.status === 'active' ? 'border-primary text-primary glow-box' : ''}
                        ${proxy.status === 'inactive' ? 'border-destructive text-destructive' : ''}
                        ${proxy.status === 'testing' ? 'border-yellow-500 text-yellow-500' : ''}
                        uppercase
                      `}>
                        {proxy.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" className="text-primary hover:text-destructive hover:bg-destructive/20" onClick={() => deleteMut.mutate({ id: proxy.id }, { onSuccess: invalidate })}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
