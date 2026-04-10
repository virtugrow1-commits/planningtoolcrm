import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Receipt, ExternalLink, Globe, Trash2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import QuoteStatusBadge from '@/components/quotation/QuoteStatusBadge';
import { useLanguage } from '@/contexts/LanguageContext';
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
  onDeleteQuote?: (id: string) => Promise<boolean>;
  onDeleteInvoice?: (id: string) => Promise<boolean>;
}

export default function UnifiedDocumentTable({
  documents,
  loading,
  emptyMessage,
  onDeleteQuote,
  onDeleteInvoice,
}: Props) {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const deletableSelected = documents.filter(
    (d) => selected.has(`${d.source}-${d.id}`) && (d.source === 'quote' || d.source === 'invoice')
  );

  const canDelete = (onDeleteQuote || onDeleteInvoice) && deletableSelected.length > 0;

  const toggleSelect = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === documents.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(documents.map((d) => `${d.source}-${d.id}`)));
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    for (const doc of deletableSelected) {
      if (doc.source === 'quote' && onDeleteQuote) await onDeleteQuote(doc.id);
      if (doc.source === 'invoice' && onDeleteInvoice) await onDeleteInvoice(doc.id);
    }
    setSelected(new Set());
    setDeleting(false);
    setConfirmOpen(false);
  };

  const handleClick = (doc: UnifiedDocument) => {
    if (doc.source === 'quote') navigate(`/quotes/${doc.id}`);
    else if (doc.source === 'invoice') navigate(`/invoices/${doc.id}`);
    else if (doc.externalUrl) window.open(doc.externalUrl, '_blank');
  };

  const showCheckboxes = !!(onDeleteQuote || onDeleteInvoice);
  const plural = deletableSelected.length !== 1 ? 'en' : '';

  return (
    <>
      {canDelete && (
        <div className="flex items-center gap-3 mb-3 p-3 bg-muted/50 rounded-lg border">
          <span className="text-sm text-muted-foreground">
            {deletableSelected.length} document{plural} {t('documents.selected')}
          </span>
          <Button
            variant="destructive"
            size="sm"
            className="gap-1.5"
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 size={14} /> {t('documents.delete')}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            {t('documents.deselect')}
          </Button>
        </div>
      )}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              {showCheckboxes && (
                <TableHead className="w-10">
                  <Checkbox
                    checked={documents.length > 0 && selected.size === documents.length}
                    onCheckedChange={toggleAll}
                  />
                </TableHead>
              )}
              <TableHead className="w-28">{t('documents.number')}</TableHead>
              <TableHead>{t('documents.document')}</TableHead>
              <TableHead className="hidden md:table-cell">{t('documents.type')}</TableHead>
              <TableHead>{t('documents.client')}</TableHead>
              <TableHead className="text-right">{t('documents.amount')}</TableHead>
              <TableHead>{t('documents.status')}</TableHead>
              <TableHead className="hidden lg:table-cell">{t('documents.sent')}</TableHead>
              <TableHead className="hidden lg:table-cell">{t('documents.viewed')}</TableHead>
              <TableHead className="hidden lg:table-cell">{t('documents.signed')}</TableHead>
              <TableHead className="w-10 text-center">{t('documents.link')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={showCheckboxes ? 12 : 11} className="text-center py-8 text-muted-foreground">
                  {t('documents.loading')}
                </TableCell>
              </TableRow>
            ) : documents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={showCheckboxes ? 12 : 11} className="text-center py-8 text-muted-foreground">
                  {emptyMessage || t('documents.noDocuments')}
                </TableCell>
              </TableRow>
            ) : (
              documents.map((doc) => {
                const Icon = sourceIcons[doc.source] || FileText;
                const key = `${doc.source}-${doc.id}`;
                return (
                  <TableRow
                    key={key}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleClick(doc)}
                  >
                    {showCheckboxes && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selected.has(key)}
                          onCheckedChange={() => toggleSelect(key)}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {doc.displayNumber || '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Icon size={14} className="text-muted-foreground shrink-0" />
                        <span className="font-medium text-foreground truncate max-w-[200px]">
                          {doc.title}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="text-xs text-muted-foreground">{doc.documentType}</span>
                    </TableCell>
                    <TableCell>
                      {doc.contactId ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/crm/${doc.contactId}`);
                          }}
                          className="text-primary hover:underline text-xs"
                        >
                          {doc.contactName}
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">{doc.contactName}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {doc.amount
                        ? `€${doc.amount.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}`
                        : '—'}
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
                      {doc.signedAt || doc.paidAt
                        ? new Date((doc.signedAt || doc.paidAt)!).toLocaleDateString('nl-NL')
                        : '—'}
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

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('documents.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('documents.deleteConfirmDesc')
                .replace('{count}', String(deletableSelected.length))
                .replace('{plural}', plural)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t('documents.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? t('documents.deleting') : t('documents.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
