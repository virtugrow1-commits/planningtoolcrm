import { useNavigate } from 'react-router-dom';
import { FileText, Receipt, ExternalLink, Globe } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card } from '@/components/ui/card';
import QuoteStatusBadge from '@/components/quotation/QuoteStatusBadge';
import type { UnifiedDocument } from '@/hooks/useUnifiedDocuments';

const sourceIcons: Record<string, typeof FileText> = {
  quote: FileText,
  invoice: Receipt,
  ghl: Globe,
};

interface Props {
  documents: UnifiedDocument[];
  loading: boolean;
  emptyMessage?: string;
}

export default function UnifiedDocumentTable({ documents, loading, emptyMessage = 'Geen documenten gevonden' }: Props) {
  const navigate = useNavigate();

  const handleClick = (doc: UnifiedDocument) => {
    if (doc.source === 'quote') navigate(`/quotes/${doc.id}`);
    else if (doc.source === 'invoice') navigate(`/invoices/${doc.id}`);
    else if (doc.externalUrl) window.open(doc.externalUrl, '_blank');
  };

  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-28">Nummer</TableHead>
            <TableHead>Document</TableHead>
            <TableHead className="hidden md:table-cell">Type</TableHead>
            <TableHead>Klant</TableHead>
            <TableHead className="text-right">Bedrag</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden lg:table-cell">Verzonden</TableHead>
            <TableHead className="hidden lg:table-cell">Bekeken</TableHead>
            <TableHead className="hidden lg:table-cell">Ondertekend</TableHead>
            <TableHead className="w-10 text-center">Link</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Laden...</TableCell></TableRow>
          ) : documents.length === 0 ? (
            <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">{emptyMessage}</TableCell></TableRow>
          ) : (
            documents.map((doc) => {
              const Icon = sourceIcons[doc.source] || FileText;
              return (
                <TableRow
                  key={`${doc.source}-${doc.id}`}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => handleClick(doc)}
                >
                  <TableCell className="font-mono text-xs text-muted-foreground">{doc.displayNumber || '—'}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Icon size={14} className="text-muted-foreground shrink-0" />
                      <span className="font-medium text-foreground truncate max-w-[200px]">{doc.title}</span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className="text-xs text-muted-foreground">{doc.documentType}</span>
                  </TableCell>
                  <TableCell>
                    {doc.contactId ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/crm/${doc.contactId}`); }}
                        className="text-primary hover:underline text-xs"
                      >
                        {doc.contactName}
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">{doc.contactName}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {doc.amount ? `€${doc.amount.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}` : '—'}
                  </TableCell>
                  <TableCell>
                    <QuoteStatusBadge status={doc.status} />
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                    {doc.sentAt ? new Date(doc.sentAt).toLocaleDateString('nl-NL') : '—'}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                    {doc.viewedAt ? new Date(doc.viewedAt).toLocaleDateString('nl-NL') : '—'}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                    {(doc.signedAt || doc.paidAt) ? new Date((doc.signedAt || doc.paidAt)!).toLocaleDateString('nl-NL') : '—'}
                  </TableCell>
                  <TableCell className="text-center">
                    {doc.externalUrl ? (
                      <a
                        href={doc.externalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:text-primary/80"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink size={14} />
                      </a>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </Card>
  );
}
