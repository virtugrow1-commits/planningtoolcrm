import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Receipt, ExternalLink, Globe, Trash2, MoreHorizontal, Send, Eye, CheckCircle2, Inbox } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { cn } from '@/lib/utils';

const sourceIcons: Record<string, typeof FileText> = {
  quote: FileText,
  invoice: Receipt,
  ghl: Globe,
};

const sourceColors: Record<string, string> = {
  quote: 'text-primary bg-primary/10',
  invoice: 'text-success bg-success/10',
  ghl: 'text-info bg-info/10',
};

interface Props {
  documents: UnifiedDocument[];
  loading: boolean;
  emptyMessage?: string;
  onDeleteQuote?: (id: string) => Promise<boolean>;
  onDeleteInvoice?: (id: string) => Promise<boolean>;
}

const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || '·';

const fmtShort = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' }) : null;

const fmtFull = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('nl-NL', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';

function TimelineCell({ doc }: { doc: UnifiedDocument }) {
  const steps = [
    { label: 'Verzonden', date: doc.sentAt, icon: Send, color: 'text-info' },
    { label: 'Bekeken', date: doc.viewedAt, icon: Eye, color: 'text-accent-foreground' },
    { label: doc.source === 'invoice' ? 'Betaald' : 'Getekend', date: doc.signedAt || doc.paidAt, icon: CheckCircle2, color: 'text-success' },
  ];
  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex items-center gap-1.5">
        {steps.map((s, i) => (
          <Tooltip key={i}>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  'h-6 w-6 rounded-full flex items-center justify-center border transition-colors',
                  s.date
                    ? `${s.color} bg-background border-current/40`
                    : 'text-muted-foreground/30 border-dashed border-border bg-muted/30',
                )}
              >
                <s.icon size={11} />
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {s.label}: {s.date ? fmtFull(s.date) : 'nog niet'}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
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
  const showCheckboxes = !!(onDeleteQuote || onDeleteInvoice);

  const toggleSelect = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === documents.length) setSelected(new Set());
    else setSelected(new Set(documents.map((d) => `${d.source}-${d.id}`)));
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

  const openDoc = (doc: UnifiedDocument) => {
    if (doc.source === 'quote') navigate(`/quotes/${doc.id}`);
    else if (doc.source === 'invoice') navigate(`/invoices/${doc.id}`);
    else if (doc.externalUrl) window.open(doc.externalUrl, '_blank');
  };

  const plural = deletableSelected.length !== 1 ? 'en' : '';

  return (
    <>
      {canDelete && (
        <div className="flex items-center gap-3 mb-3 px-4 py-2.5 bg-secondary/50 rounded-xl border border-border">
          <span className="text-sm text-foreground font-medium">
            {deletableSelected.length} document{plural} {t('documents.selected')}
          </span>
          <Button variant="destructive" size="sm" className="gap-1.5" onClick={() => setConfirmOpen(true)}>
            <Trash2 size={14} /> {t('documents.delete')}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            {t('documents.deselect')}
          </Button>
        </div>
      )}

      <Card className="overflow-hidden card-shadow border-border/70">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/40 hover:bg-secondary/40 border-border/60">
              {showCheckboxes && (
                <TableHead className="w-10 pl-4">
                  <Checkbox
                    checked={documents.length > 0 && selected.size === documents.length}
                    onCheckedChange={toggleAll}
                  />
                </TableHead>
              )}
              <TableHead className="w-32 text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                {t('documents.number')}
              </TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                {t('documents.document')}
              </TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                {t('documents.client')}
              </TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                {t('documents.amount')}
              </TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                {t('documents.status')}
              </TableHead>
              <TableHead className="hidden md:table-cell text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                Voortgang
              </TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              [...Array(4)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={showCheckboxes ? 8 : 7} className="py-3">
                    <div className="h-10 bg-muted/40 animate-pulse rounded-lg" />
                  </TableCell>
                </TableRow>
              ))
            ) : documents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={showCheckboxes ? 8 : 7}>
                  <div className="flex flex-col items-center justify-center py-14 text-center">
                    <div className="h-14 w-14 rounded-full bg-secondary flex items-center justify-center mb-3">
                      <Inbox size={22} className="text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium text-foreground">
                      {emptyMessage || t('documents.noDocuments')}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Maak een nieuwe offerte of factuur om te beginnen.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              documents.map((doc) => {
                const Icon = sourceIcons[doc.source] || FileText;
                const iconClass = sourceColors[doc.source] || 'text-muted-foreground bg-muted';
                const key = `${doc.source}-${doc.id}`;
                return (
                  <TableRow
                    key={key}
                    className="cursor-pointer group hover:bg-secondary/30 border-border/50"
                    onClick={() => openDoc(doc)}
                  >
                    {showCheckboxes && (
                      <TableCell onClick={(e) => e.stopPropagation()} className="pl-4">
                        <Checkbox
                          checked={selected.has(key)}
                          onCheckedChange={() => toggleSelect(key)}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-mono text-xs text-primary font-semibold">
                      {doc.displayNumber || <span className="text-muted-foreground/50">—</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center shrink-0', iconClass)}>
                          <Icon size={14} />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate max-w-[260px]">{doc.title}</p>
                          <p className="text-xs text-muted-foreground">{doc.documentType}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-secondary flex items-center justify-center text-[10px] font-semibold text-secondary-foreground shrink-0">
                          {initials(doc.companyName || doc.contactName)}
                        </div>
                        <div className="min-w-0">
                          {doc.contactId ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); navigate(`/crm/${doc.contactId}`); }}
                              className="text-sm font-medium text-foreground hover:text-primary truncate block max-w-[180px]"
                            >
                              {doc.contactName}
                            </button>
                          ) : (
                            <span className="text-sm text-foreground">{doc.contactName}</span>
                          )}
                          {doc.companyName && (
                            <p className="text-xs text-muted-foreground truncate max-w-[180px]">{doc.companyName}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-semibold tabular-nums text-foreground">
                        {doc.amount != null ? (
                          <>
                            <span className="text-muted-foreground/60 mr-0.5">€</span>
                            {doc.amount.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}
                          </>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <QuoteStatusBadge status={doc.status} />
                        {doc.sentAt && (
                          <p className="text-[10px] text-muted-foreground">
                            {fmtShort(doc.sentAt)}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <TimelineCell doc={doc} />
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()} className="pr-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 opacity-60 group-hover:opacity-100 transition-opacity"
                          >
                            <MoreHorizontal size={16} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => openDoc(doc)}>
                            <FileText size={14} className="mr-2" /> Openen
                          </DropdownMenuItem>
                          {doc.externalUrl && (
                            <DropdownMenuItem onClick={() => window.open(doc.externalUrl!, '_blank')}>
                              <ExternalLink size={14} className="mr-2" /> Externe link
                            </DropdownMenuItem>
                          )}
                          {(doc.source === 'quote' || doc.source === 'invoice') && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={async () => {
                                  if (doc.source === 'quote' && onDeleteQuote) await onDeleteQuote(doc.id);
                                  if (doc.source === 'invoice' && onDeleteInvoice) await onDeleteInvoice(doc.id);
                                }}
                              >
                                <Trash2 size={14} className="mr-2" /> Verwijderen
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
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
