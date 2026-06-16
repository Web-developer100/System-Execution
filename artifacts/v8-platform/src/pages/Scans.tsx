import { useGetScans, useStopScan, useDeleteScan, getGetScansQueryKey, useCreateScan } from "@workspace/api-client-react";
import { useI18n } from "@/lib/i18n";
import { Shield, Play, SquareSquare, Trash2, Plus } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";

export default function Scans() {
  const { data: scans, isLoading } = useGetScans();
  const stopMut = useStopScan();
  const deleteMut = useDeleteScan();
  const createMut = useCreateScan();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const { toast } = useToast();

  const [newScanTarget, setNewScanTarget] = useState("");
  const [selectedTools, setSelectedTools] = useState<string[]>(["nmap", "nuclei"]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const availableTools = ["nmap", "nuclei", "subfinder", "ffuf", "trivy"];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetScansQueryKey() });

  const handleStop = (id: number) => {
    stopMut.mutate({ id }, { onSuccess: invalidate });
  };

  const handleDelete = (id: number) => {
    deleteMut.mutate({ id }, { onSuccess: invalidate });
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newScanTarget) return;
    
    createMut.mutate(
      { data: { target: newScanTarget, tools: selectedTools, useProxy: true } },
      {
        onSuccess: () => {
          invalidate();
          setIsDialogOpen(false);
          setNewScanTarget("");
          toast({ title: "Scan Initiated", description: `Target: ${newScanTarget}` });
        }
      }
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center border-b border-primary/20 pb-4">
        <h1 className="text-3xl font-bold text-primary tracking-widest glow-text uppercase">
          {t('nav.scans')} // QUEUE
        </h1>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary text-black hover:bg-primary/90 glow-box">
              <Plus className="w-4 h-4 mr-2 rtl:ml-2 rtl:mr-0" />
              {t('action.new_scan')}
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-primary/30 text-primary crt max-w-md">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold tracking-widest glow-text">INITIALIZE NEW SCAN</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 mt-4">
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wider text-primary/70">Target URL / IP</label>
                <Input 
                  value={newScanTarget}
                  onChange={(e) => setNewScanTarget(e.target.value)}
                  placeholder="https://example.com"
                  className="bg-black border-primary/30 text-primary focus-visible:ring-primary h-12"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wider text-primary/70">Select Tools</label>
                <div className="grid grid-cols-2 gap-2">
                  {availableTools.map(tool => (
                    <div key={tool} className="flex items-center space-x-2 rtl:space-x-reverse">
                      <Checkbox 
                        id={tool} 
                        checked={selectedTools.includes(tool)}
                        onCheckedChange={(c) => {
                          if (c) setSelectedTools([...selectedTools, tool]);
                          else setSelectedTools(selectedTools.filter(t => t !== tool));
                        }}
                        className="border-primary/50 data-[state=checked]:bg-primary data-[state=checked]:text-black"
                      />
                      <label htmlFor={tool} className="text-sm font-medium leading-none cursor-pointer">
                        {tool.toUpperCase()}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
              <Button type="submit" disabled={createMut.isPending} className="w-full bg-primary text-black mt-4 glow-box">
                {createMut.isPending ? "INITIALIZING..." : "LAUNCH SCAN"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="border border-primary/20 glow-box bg-card">
        <Table>
          <TableHeader className="bg-primary/5 border-b border-primary/20">
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-primary">ID</TableHead>
              <TableHead className="text-primary">TARGET</TableHead>
              <TableHead className="text-primary">STATUS</TableHead>
              <TableHead className="text-primary">PROGRESS</TableHead>
              <TableHead className="text-primary text-right">ACTIONS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center text-primary/50 py-8">Loading queue...</TableCell></TableRow>
            ) : scans?.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-primary/50 py-8">NO ACTIVE SCANS</TableCell></TableRow>
            ) : (
              scans?.map(scan => (
                <TableRow key={scan.id} className="border-b border-primary/10 hover:bg-primary/5">
                  <TableCell className="font-mono text-primary/70">#{scan.id}</TableCell>
                  <TableCell className="font-medium text-primary glow-text">{scan.target}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`
                      ${scan.status === 'running' ? 'bg-primary/20 text-primary border-primary glow-box' : ''}
                      ${scan.status === 'completed' ? 'bg-blue-500/20 text-blue-500 border-blue-500' : ''}
                      ${scan.status === 'failed' || scan.status === 'stopped' ? 'bg-destructive/20 text-destructive border-destructive' : ''}
                      uppercase tracking-wider
                    `}>
                      {scan.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="w-full bg-black h-2 border border-primary/30 relative overflow-hidden">
                      <div className="absolute top-0 left-0 h-full bg-primary" style={{ width: `${scan.progress || 0}%` }}></div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right space-x-2 rtl:space-x-reverse">
                    {scan.status === 'running' && (
                      <Button size="sm" variant="outline" className="border-destructive text-destructive hover:bg-destructive/20 glow-box-red" onClick={() => handleStop(scan.id)}>
                        <SquareSquare className="w-4 h-4 mr-2" /> SIGKILL
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="text-primary hover:text-destructive hover:bg-destructive/20" onClick={() => handleDelete(scan.id)}>
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
  );
}
