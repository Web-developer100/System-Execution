import { useGetVulnerabilities, useGetVulnerabilityStats } from "@workspace/api-client-react";
import { useI18n } from "@/lib/i18n";
import { AlertTriangle, Bug, ShieldAlert, Cpu } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState } from "react";
import { Vulnerability } from "@workspace/api-client-react";

const severityColors = {
  critical: "text-red-500 border-red-500 bg-red-500/10 shadow-[0_0_10px_rgba(239,68,68,0.3)]",
  high: "text-orange-500 border-orange-500 bg-orange-500/10 shadow-[0_0_10px_rgba(249,115,22,0.3)]",
  medium: "text-yellow-500 border-yellow-500 bg-yellow-500/10",
  low: "text-blue-500 border-blue-500 bg-blue-500/10",
  info: "text-gray-400 border-gray-400 bg-gray-400/10",
};

export default function Vulnerabilities() {
  const { data: stats } = useGetVulnerabilityStats();
  const { data: vulns, isLoading } = useGetVulnerabilities();
  const { t } = useI18n();

  const [selectedVuln, setSelectedVuln] = useState<Vulnerability | null>(null);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-primary tracking-widest glow-text uppercase border-b border-primary/20 pb-4 flex items-center gap-3">
        <Bug className="w-8 h-8" />
        {t('nav.vulnerabilities')} // DATABASE
      </h1>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {['critical', 'high', 'medium', 'low', 'info'].map(sev => (
          <Card key={sev} className="bg-card border-primary/20 glow-box">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-xs uppercase tracking-widest text-primary/70">{sev}</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className={`text-3xl font-bold ${sev === 'critical' ? 'text-red-500 glow-box-red p-2 inline-block rounded-none border border-red-500/50' : sev === 'high' ? 'text-orange-500' : 'text-primary'}`}>
                {stats ? (stats as any)[sev] : 0}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4">
        {isLoading ? (
          <div className="text-center text-primary p-8 glow-text animate-pulse">QUERYING DATABASE...</div>
        ) : vulns?.length === 0 ? (
          <div className="text-center text-primary/50 p-8 border border-primary/20 bg-card">NO VULNERABILITIES DETECTED</div>
        ) : (
          vulns?.map(vuln => (
            <div key={vuln.id} className="bg-card border border-primary/20 p-4 hover:border-primary/50 transition-colors cursor-pointer group" onClick={() => setSelectedVuln(vuln)}>
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <Badge className={`uppercase rounded-none border ${severityColors[vuln.severity]}`}>
                      {vuln.severity}
                    </Badge>
                    <h3 className="text-lg font-bold text-primary group-hover:glow-text transition-all">{vuln.title}</h3>
                  </div>
                  <div className="text-sm font-mono text-primary/60 truncate max-w-2xl">{vuln.url}</div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {vuln.aiValidated && (
                    <Badge variant="outline" className="border-primary text-primary bg-primary/10 gap-1 rounded-none">
                      <Cpu className="w-3 h-3" /> AI VERIFIED
                    </Badge>
                  )}
                  <span className="text-xs text-primary/40 font-mono">SCAN_ID: #{vuln.scanId}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <Dialog open={!!selectedVuln} onOpenChange={(open) => !open && setSelectedVuln(null)}>
        <DialogContent className="bg-card border-primary/50 text-primary crt max-w-3xl max-h-[80vh] overflow-y-auto">
          {selectedVuln && (
            <>
              <DialogHeader className="border-b border-primary/20 pb-4 mb-4">
                <div className="flex items-center gap-3">
                  <Badge className={`uppercase rounded-none border ${severityColors[selectedVuln.severity]}`}>
                    {selectedVuln.severity}
                  </Badge>
                  <DialogTitle className="text-xl font-bold tracking-widest glow-text">{selectedVuln.title}</DialogTitle>
                </div>
                <div className="text-sm font-mono text-primary/70 mt-2">{selectedVuln.url}</div>
              </DialogHeader>
              
              <div className="space-y-6">
                <div>
                  <h4 className="text-xs uppercase tracking-widest text-primary/50 mb-2">Description</h4>
                  <p className="text-sm text-primary/90 leading-relaxed">{selectedVuln.description}</p>
                </div>
                
                {selectedVuln.evidence && (
                  <div>
                    <h4 className="text-xs uppercase tracking-widest text-primary/50 mb-2">Evidence Payload</h4>
                    <div className="bg-black p-4 border border-primary/30 font-mono text-xs text-green-400 overflow-x-auto whitespace-pre-wrap">
                      {selectedVuln.evidence}
                    </div>
                  </div>
                )}
                
                {selectedVuln.fix && (
                  <div>
                    <h4 className="text-xs uppercase tracking-widest text-primary/50 mb-2">Remediation</h4>
                    <p className="text-sm text-primary/90 leading-relaxed">{selectedVuln.fix}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
