import { useGetReports, useGetScans, useGenerateReport, getGetReportsQueryKey } from "@workspace/api-client-react";
import { useI18n } from "@/lib/i18n";
import { FileText, Download, FilePlus2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export default function Reports() {
  const { data: reports, isLoading } = useGetReports();
  const { data: scans } = useGetScans();
  const generateMut = useGenerateReport();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const { toast } = useToast();

  const [selectedScanId, setSelectedScanId] = useState<string>("");

  const handleGenerate = () => {
    if (!selectedScanId) return;
    
    generateMut.mutate(
      { data: { scanId: parseInt(selectedScanId) } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetReportsQueryKey() });
          setSelectedScanId("");
          toast({ title: "Report Generation Initiated", description: "Processing scan data..." });
        }
      }
    );
  };

  const completedScans = scans?.filter(s => s.status === 'completed') || [];

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-primary tracking-widest glow-text uppercase border-b border-primary/20 pb-4 flex items-center gap-3">
        <FileText className="w-8 h-8" />
        {t('nav.reports')} // ARCHIVE
      </h1>

      <Card className="bg-card border-primary/30 glow-box max-w-2xl">
        <CardHeader>
          <CardTitle className="text-lg text-primary glow-text uppercase tracking-widest">Generate Intelligence Report</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-end">
            <div className="flex-1 space-y-2">
              <label className="text-xs uppercase tracking-wider text-primary/70">Select Completed Scan</label>
              <Select value={selectedScanId} onValueChange={setSelectedScanId}>
                <SelectTrigger className="bg-black border-primary/30 text-primary h-12 rounded-none">
                  <SelectValue placeholder="CHOOSE TARGET" />
                </SelectTrigger>
                <SelectContent className="bg-card border-primary/30 text-primary rounded-none">
                  {completedScans.length === 0 && <SelectItem value="none" disabled>NO COMPLETED SCANS</SelectItem>}
                  {completedScans.map(scan => (
                    <SelectItem key={scan.id} value={scan.id.toString()}>
                      #{scan.id} - {scan.target}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button 
              onClick={handleGenerate} 
              disabled={!selectedScanId || generateMut.isPending} 
              className="bg-primary text-black h-12 px-8 glow-box font-bold uppercase"
            >
              {generateMut.isPending ? "PROCESSING..." : t('action.generate_report')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
        {isLoading ? (
          <div className="text-primary/50 col-span-full p-8 text-center animate-pulse">RETRIEVING ARCHIVES...</div>
        ) : reports?.length === 0 ? (
          <div className="text-primary/50 col-span-full p-8 text-center border border-primary/20 bg-card">NO REPORTS FOUND</div>
        ) : (
          reports?.map(report => (
            <Card key={report.id} className="bg-black border-primary/30 hover:border-primary/60 transition-colors group">
              <CardContent className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-primary/10 border border-primary/30 group-hover:bg-primary/20 transition-colors">
                    <FileText className="w-6 h-6 text-primary glow-text" />
                  </div>
                  <Badge variant="outline" className={`
                    uppercase rounded-none border
                    ${report.status === 'ready' ? 'text-primary border-primary bg-primary/10' : ''}
                    ${report.status === 'generating' ? 'text-yellow-500 border-yellow-500 animate-pulse' : ''}
                    ${report.status === 'failed' ? 'text-destructive border-destructive' : ''}
                  `}>
                    {report.status}
                  </Badge>
                </div>
                <div className="space-y-1 mb-6">
                  <div className="text-xs text-primary/50 font-mono uppercase tracking-widest">REPORT_ID: {report.id}</div>
                  <div className="text-sm text-primary font-bold">SCAN TARGET #{report.scanId}</div>
                  <div className="text-xs text-primary/40">{new Date(report.createdAt).toLocaleString()}</div>
                </div>
                
                {report.status === 'ready' ? (
                  <Button className="w-full bg-primary/10 text-primary border border-primary/30 hover:bg-primary hover:text-black transition-all glow-box" asChild>
                    <a href={report.downloadUrl || "#"} target="_blank" rel="noopener noreferrer">
                      <Download className="w-4 h-4 mr-2 rtl:ml-2 rtl:mr-0" /> DOWNLOAD PDF
                    </a>
                  </Button>
                ) : (
                  <Button disabled className="w-full bg-black text-primary/30 border border-primary/10 rounded-none">
                    UNAVAILABLE
                  </Button>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
