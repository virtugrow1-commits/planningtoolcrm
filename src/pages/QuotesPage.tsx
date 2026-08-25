import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Search, FileText, Receipt, LayoutTemplate, TrendingUp, Clock, Euro, Trash2, Globe,
  Star, MoreVertical, Copy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useQuotes } from '@/hooks/useQuotes';
import { useInvoices } from '@/hooks/useInvoices';
import { useQuoteTemplates } from '@/hooks/useQuoteTemplates';
import { useUnifiedDocuments } from '@/hooks/useUnifiedDocuments';
import UnifiedDocumentTable from '@/components/documents/UnifiedDocumentTable';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/components/quotation/DocumentMetadata';
import { cn } from '@/lib/utils';

type QuoteFilter = 'all' | 'draft' | 'sent' | 'viewed' | 'accepted' | 'declined';
type InvoiceFilter = 'all' | 'draft' | 'sent' | 'overdue' | 'paid';

const statusDot: Record<string, string> = {
  all: 'bg-muted-foreground/40',
  draft: 'bg-muted-foreground/60',
  sent: 'bg-info',
  viewed: 'bg-accent',
  accepted: 'bg-success',
  declined: 'bg-destructive',
  overdue: 'bg-destructive',
  paid: 'bg-success',
};

export default function QuotesPage() {
  const navigate = useNavigate();
  const { quotes, loading: qLoading, deleteQuote } = useQuotes();
  const { invoices, loading: iLoading, deleteInvoice } = useInvoices();
  const { templates, loading: tLoading, deleteTemplate } = useQuoteTemplates();
  const { documents: allDocs, loading: allLoading } = useUnifiedDocuments();
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all');
  const [quoteFilter, setQuoteFilter] = useState<QuoteFilter>('all');
  const [invoiceFilter, setInvoiceFilter] = useState<InvoiceFilter>('all');

  const searchFilter = (fields: (string | undefined | null)[]) =>
    fields.filter(Boolean).join(' ').toLowerCase().includes(search.toLowerCase());

  const filteredAll = useMemo(() =>
    allDocs.filter((d) => searchFilter([d.displayNumber, d.contactName, d.companyName, d.title])),
    [allDocs, search]
  );

  const filteredQuotes = useMemo(() =>
    allDocs
      .filter((d) => d.source === 'quote')
      .filter((d) => quoteFilter === 'all' || d.status === quoteFilter)
      .filter((d) => searchFilter([d.displayNumber, d.contactName, d.companyName, d.title])),
    [allDocs, quoteFilter, search]
  );

  const filteredInvoices = useMemo(() =>
    allDocs
      .filter((d) => d.source === 'invoice')
      .filter((d) => invoiceFilter === 'all' || d.status === invoiceFilter)
      .filter((d) => searchFilter([d.displayNumber, d.contactName, d.companyName, d.title])),
    [allDocs, invoiceFilter, search]
  );

  // KPIs
  const totalQuotesSent = quotes.filter((q) => q.status !== 'draft').length;
  const acceptedQuotes = quotes.filter((q) => q.status === 'accepted').length;
  const acceptanceRate = totalQuotesSent > 0 ? Math.round((acceptedQuotes / totalQuotesSent) * 100) : 0;
  const pendingInvoices = invoices.filter((inv) => inv.status === 'sent' || inv.status === 'overdue').length;
  const revenueCollected = invoices.filter((inv) => inv.status === 'paid').reduce((sum, inv) => sum + inv.total, 0);

  // Micro stats
  const last7d = (iso: string) => {
    if (!iso) return false;
    return Date.now() - new Date(iso).getTime() < 7 * 24 * 3600 * 1000;
  };
  const sentLast7 = quotes.filter((q) => q.status !== 'draft' && q.sentAt && last7d(q.sentAt)).length;
  const overdueCount = invoices.filter((i) => i.status === 'overdue').length;

  const quoteStatusCounts = {
    all: quotes.length,
    draft: quotes.filter((q) => q.status === 'draft').length,
    sent: quotes.filter((q) => q.status === 'sent').length,
    viewed: quotes.filter((q) => q.status === 'viewed').length,
    accepted: quotes.filter((q) => q.status === 'accepted').length,
    declined: quotes.filter((q) => q.status === 'declined').length,
  };

  const invoiceStatusCounts = {
    all: invoices.length,
    draft: invoices.filter((i) => i.status === 'draft').length,
    sent: invoices.filter((i) => i.status === 'sent').length,
    overdue: invoices.filter((i) => i.status === 'overdue').length,
    paid: invoices.filter((i) => i.status === 'paid').length,
  };

  const kpis = [
    {
      label: 'Verzonden',
      value: totalQuotesSent,
      icon: FileText,
      tone: 'primary' as const,
      hint: sentLast7 > 0 ? `+${sentLast7} deze week` : 'Nog geen deze week',
    },
    {
      label: 'Acceptatiegraad',
      value: `${acceptanceRate}%`,
      icon: TrendingUp,
      tone: 'success' as const,
      hint: `${acceptedQuotes} van ${totalQuotesSent}`,
    },
    {
      label: 'Openstaand',
      value: pendingInvoices,
      icon: Clock,
      tone: 'accent' as const,
      hint: overdueCount > 0 ? `${overdueCount} verlopen` : 'Op tijd',
    },
    {
      label: 'Omzet geïnd',
      value: `€ ${revenueCollected.toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
      icon: Euro,
      tone: 'success' as const,
      hint: 'Betaalde facturen',
    },
  ];

  const toneClasses: Record<string, string> = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    accent: 'bg-accent/15 text-accent-foreground',
    info: 'bg-info/10 text-info',
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 pb-2 border-b border-accent/30">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">Documenten</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Offertes, facturen en CliqCRM documenten — alles overzichtelijk op één plek
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => navigate('/templates/new')} className="gap-1.5">
            <LayoutTemplate size={16} /> Nieuw sjabloon
          </Button>
          <Button onClick={() => navigate('/quotes/new')} className="gap-1.5 shadow-sm">
            <Plus size={16} /> Nieuwe offerte
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {kpis.map((kpi) => (
          <Card
            key={kpi.label}
            className="card-shadow hover:card-shadow-hover transition-shadow border-border/60 overflow-hidden relative"
          >
            <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary/40 via-accent/50 to-transparent" />
            <CardContent className="p-4 md:p-5">
              <div className="flex items-start justify-between gap-2">
                <div className={cn('p-2.5 rounded-xl', toneClasses[kpi.tone])}>
                  <kpi.icon size={18} />
                </div>
              </div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mt-3">
                {kpi.label}
              </p>
              <p className="text-2xl font-bold text-foreground mt-1 tabular-nums">{kpi.value}</p>
              <p className="text-[11px] text-muted-foreground mt-1.5">{kpi.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Zoek op nummer, klant, bedrijf of titel..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-10 bg-card border-border/70"
        />
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-secondary/50 p-1 h-auto">
          <TabsTrigger value="all" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Globe size={14} /> Alle
            <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1.5 bg-background/60">{allDocs.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="quotes" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <FileText size={14} /> Offertes
            <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1.5 bg-background/60">{quotes.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="invoices" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Receipt size={14} /> Facturen
            <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1.5 bg-background/60">{invoices.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <LayoutTemplate size={14} /> Sjablonen
            <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1.5 bg-background/60">{templates.length}</Badge>
          </TabsTrigger>
        </TabsList>

        {/* All Documents tab */}
        <TabsContent value="all" className="mt-4">
          <UnifiedDocumentTable
            documents={filteredAll}
            loading={allLoading}
            onDeleteQuote={deleteQuote}
            onDeleteInvoice={deleteInvoice}
          />
        </TabsContent>

        {/* Quotes tab */}
        <TabsContent value="quotes" className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            {(['all', 'draft', 'sent', 'viewed', 'accepted', 'declined'] as QuoteFilter[]).map((f) => {
              const labels: Record<QuoteFilter, string> = {
                all: 'Alle', draft: 'Concept', sent: 'Verzonden', viewed: 'Bekeken', accepted: 'Geaccepteerd', declined: 'Afgewezen',
              };
              const active = quoteFilter === f;
              return (
                <button
                  key={f}
                  onClick={() => setQuoteFilter(f)}
                  className={cn(
                    'inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-full border transition-all',
                    active
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : 'bg-card text-muted-foreground border-border/70 hover:border-primary/40 hover:text-foreground',
                  )}
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full', active ? 'bg-accent' : statusDot[f])} />
                  {labels[f]}
                  <span className={cn('text-[10px]', active ? 'text-primary-foreground/80' : 'text-muted-foreground/70')}>
                    {quoteStatusCounts[f]}
                  </span>
                </button>
              );
            })}
          </div>
          <UnifiedDocumentTable
            documents={filteredQuotes}
            loading={qLoading}
            emptyMessage="Geen offertes gevonden"
            onDeleteQuote={deleteQuote}
          />
        </TabsContent>

        {/* Invoices tab */}
        <TabsContent value="invoices" className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            {(['all', 'draft', 'sent', 'overdue', 'paid'] as InvoiceFilter[]).map((f) => {
              const labels: Record<InvoiceFilter, string> = {
                all: 'Alle', draft: 'Concept', sent: 'Verzonden', overdue: 'Verlopen', paid: 'Betaald',
              };
              const active = invoiceFilter === f;
              return (
                <button
                  key={f}
                  onClick={() => setInvoiceFilter(f)}
                  className={cn(
                    'inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-full border transition-all',
                    active
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : 'bg-card text-muted-foreground border-border/70 hover:border-primary/40 hover:text-foreground',
                  )}
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full', active ? 'bg-accent' : statusDot[f])} />
                  {labels[f]}
                  <span className={cn('text-[10px]', active ? 'text-primary-foreground/80' : 'text-muted-foreground/70')}>
                    {invoiceStatusCounts[f]}
                  </span>
                </button>
              );
            })}
          </div>
          <UnifiedDocumentTable
            documents={filteredInvoices}
            loading={iLoading}
            emptyMessage="Geen facturen gevonden"
            onDeleteInvoice={deleteInvoice}
          />
        </TabsContent>

        {/* Templates tab */}
        <TabsContent value="templates" className="mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tLoading ? (
              [...Array(3)].map((_, i) => (
                <div key={i} className="h-44 bg-muted/40 animate-pulse rounded-xl" />
              ))
            ) : templates.length === 0 ? (
              <Card className="col-span-full border-dashed border-2 border-border/70 bg-secondary/30">
                <CardContent className="py-14 text-center">
                  <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                    <LayoutTemplate size={24} className="text-primary" />
                  </div>
                  <p className="text-foreground font-medium">Nog geen sjablonen aangemaakt</p>
                  <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                    Maak een sjabloon om in een paar klikken consistente offertes en contracten te versturen.
                  </p>
                  <Button className="mt-5 gap-1.5" onClick={() => navigate('/templates/new')}>
                    <Plus size={14} /> Eerste sjabloon maken
                  </Button>
                </CardContent>
              </Card>
            ) : (
              templates.map((tpl) => (
                <Card
                  key={tpl.id}
                  className="cursor-pointer card-shadow hover:card-shadow-hover hover:border-primary/40 transition-all group overflow-hidden"
                  onClick={() => navigate(`/templates/${tpl.id}`)}
                >
                  {/* Document preview header */}
                  <div className="relative h-24 bg-gradient-to-br from-secondary via-secondary/60 to-background border-b border-border/60 overflow-hidden">
                    <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-accent to-primary/40" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <FileText size={36} className="text-primary/30 group-hover:scale-110 transition-transform" />
                    </div>
                    {tpl.isDefault && (
                      <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/90 text-accent-foreground text-[10px] font-semibold">
                        <Star size={10} className="fill-current" /> Standaard
                      </div>
                    )}
                  </div>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground truncate">{tpl.name}</p>
                        {tpl.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{tpl.description}</p>
                        )}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 opacity-60 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical size={14} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenuItem onClick={() => navigate(`/templates/${tpl.id}`)}>
                            <FileText size={14} className="mr-2" /> Openen
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={async () => {
                              const ok = await deleteTemplate(tpl.id);
                              if (ok) toast({ title: 'Sjabloon verwijderd' });
                            }}
                          >
                            <Trash2 size={14} className="mr-2" /> Verwijderen
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-3 pt-3 border-t border-border/50">
                      Aangemaakt op {formatDate(tpl.createdAt, false)}
                    </p>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
