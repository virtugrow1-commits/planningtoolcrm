import { useDocuments, Document } from '@/hooks/useDocuments';
import { useNavigate } from 'react-router-dom';
import { FileText, Eye, CheckCircle2, XCircle, Send, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

const statusConfig: Record<string, { label: string; class: string; icon: any }> = {
  sent: { label: 'Verzonden', class: 'bg-info/15 text-info border-info/30', icon: Send },
  viewed: { label: 'Bekeken', class: 'bg-warning/15 text-warning border-warning/30', icon: Eye },
  signed: { label: 'Ondertekend', class: 'bg-success/15 text-success border-success/30', icon: CheckCircle2 },
  paid: { label: 'Betaald', class: 'bg-success/15 text-success border-success/30', icon: CheckCircle2 },
  declined: { label: 'Afgewezen', class: 'bg-destructive/15 text-destructive border-destructive/30', icon: XCircle },
};

const typeLabels: Record<string, string> = {
  proposal: 'Voorstel',
  invoice: 'Factuur',
  estimate: 'Offerte',
  contract: 'Contract',
  document: 'Document',
};

export default function DocumentsPage() {
  const { documents, loading } = useDocuments();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="p-6 lg:p-8 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Documenten</h1>
        <p className="text-sm text-muted-foreground">
          {documents.length} documenten · Voorstellen, contracten en facturen vanuit VirtuGrow
        </p>
      </div>

      {documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl border bg-card card-shadow">
          <FileText size={40} className="text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground font-medium">Nog geen documenten</p>
          <p className="text-xs text-muted-foreground mt-1">Documenten die vanuit VirtuGrow worden verstuurd verschijnen hier automatisch.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card card-shadow">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Document</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Type</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Klant</th>
                <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Bedrag</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Verzonden</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Bekeken</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Ondertekend</th>
                <th className="px-4 py-3 text-center font-semibold text-muted-foreground">Link</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => {
                const sc = statusConfig[doc.status] || statusConfig.sent;
                const StatusIcon = sc.icon;
                return (
                  <tr key={doc.id} className="border-b last:border-0 transition-colors hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <FileText size={14} className="text-muted-foreground shrink-0" />
                        <span className="font-medium text-foreground">{doc.title}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-muted-foreground">{typeLabels[doc.documentType] || doc.documentType}</span>
                    </td>
                    <td className="px-4 py-3">
                      {doc.contactId ? (
                        <button onClick={() => navigate(`/crm/${doc.contactId}`)} className="text-primary hover:underline text-xs">
                          {doc.contactName}
                        </button>
                      ) : (
                        <span className="text-muted-foreground text-xs">{doc.contactName}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-foreground">
                      {doc.amount ? `€${doc.amount.toLocaleString('nl-NL')}` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${sc.class}`}>
                        <StatusIcon size={10} />
                        {sc.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{doc.sentAt || '—'}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{doc.viewedAt || '—'}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{doc.signedAt || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      {doc.externalUrl ? (
                        <a href={doc.externalUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80">
                          <ExternalLink size={14} />
                        </a>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
