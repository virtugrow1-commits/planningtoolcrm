import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, FileText, Receipt, LayoutTemplate, TrendingUp, Clock, CheckCircle2, Euro, Trash2, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useQuotes } from '@/hooks/useQuotes';
import { useInvoices } from '@/hooks/useInvoices';
import { useQuoteTemplates } from '@/hooks/useQuoteTemplates';
import { useUnifiedDocuments } from '@/hooks/useUnifiedDocuments';
import UnifiedDocumentTable from '@/components/documents/UnifiedDocumentTable';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/components/quotation/DocumentMetadata';

type QuoteFilter = 'all' | 'draft' | 'sent' | 'viewed' | 'accepted' | 'declined';
type InvoiceFilter = 'all' | 'draft' | 'sent' | 'overdue' | 'paid';

export default function QuotesPage() {
  const navigate = useNavigate();
  const { quotes, loading: qLoading } = useQuotes();
  const { invoices, loading: iLoading } = useInvoices();
  const { templates, loading: tLoading, deleteTemplate } = useQuoteTemplates();
  const { documents: allDocs, loading: allLoading } = useUnifiedDocuments();
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all');
  const [quoteFilter, setQuoteFilter] = useState<QuoteFilter>('all');
  const [invoiceFilter, setInvoiceFilter] = useState<InvoiceFilter>('all');

  const searchFilter = (fields: (string | undefined | null)[]) =>
    fields.filter(Boolean).join(' ').toLowerCase().includes(search.toLowerCase());

  // Filter unified docs
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

  const ghlCount = allDocs.filter((d) => d.source === 'ghl').length;

  const kpis = [
    { label: 'Verzonden', value: totalQuotesSent, icon: FileText, color: 'text-info' },
    { label: 'Acceptatiegraad', value: `${acceptanceRate}%`, icon: TrendingUp, color: 'text-success' },
    { label: 'Openstaand', value: pendingInvoices, icon: Clock, color: 'text-warning' },
    { label: 'Omzet geïnd', value: `€${revenueCollected.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}`, icon: Euro, color: 'text-success' },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Documenten</h1>
          <p className="text-sm text-muted-foreground">
            Offertes, facturen en VirtuGrow documenten op één plek
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => navigate('/quotes/new')} className="gap-1.5">
            <Plus size={16} /> Nieuwe offerte
          </Button>
          <Button variant="outline" onClick={() => navigate('/templates/new')} className="gap-1.5">
            <LayoutTemplate size={16} /> Nieuw sjabloon
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-4 flex items-start gap-3">
              <div className={`p-2 rounded-lg bg-muted ${kpi.color}`}>
                <kpi.icon size={18} />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">{kpi.label}</p>
                <p className="text-xl font-bold text-foreground mt-0.5">{kpi.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Zoeken..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all" className="gap-1.5">
            <Globe size={14} /> Alle documenten
            <Badge variant="secondary" className="ml-1 text-xs h-5 px-1.5">{allDocs.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="quotes" className="gap-1.5">
            <FileText size={14} /> Offertes
            <Badge variant="secondary" className="ml-1 text-xs h-5 px-1.5">{quotes.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="invoices" className="gap-1.5">
            <Receipt size={14} /> Facturen
            <Badge variant="secondary" className="ml-1 text-xs h-5 px-1.5">{invoices.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-1.5">
            <LayoutTemplate size={14} /> Sjablonen
            <Badge variant="secondary" className="ml-1 text-xs h-5 px-1.5">{templates.length}</Badge>
          </TabsTrigger>
        </TabsList>

        {/* All Documents tab */}
        <TabsContent value="all" className="mt-4">
          <UnifiedDocumentTable documents={filteredAll} loading={allLoading} />
        </TabsContent>

        {/* Quotes tab */}
        <TabsContent value="quotes" className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {(['all', 'draft', 'sent', 'viewed', 'accepted', 'declined'] as QuoteFilter[]).map((f) => {
              const labels: Record<QuoteFilter, string> = { all: 'Alle', draft: 'Concept', sent: 'Verzonden', viewed: 'Bekeken', accepted: 'Geaccepteerd', declined: 'Afgewezen' };
              return (
                <button
                  key={f}
                  onClick={() => setQuoteFilter(f)}
                  className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                    quoteFilter === f
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border hover:bg-accent'
                  }`}
                >
                  {labels[f]} ({quoteStatusCounts[f]})
                </button>
              );
            })}
          </div>
          <UnifiedDocumentTable documents={filteredQuotes} loading={qLoading} emptyMessage="Geen offertes gevonden" />
        </TabsContent>

        {/* Invoices tab */}
        <TabsContent value="invoices" className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {(['all', 'draft', 'sent', 'overdue', 'paid'] as InvoiceFilter[]).map((f) => {
              const labels: Record<InvoiceFilter, string> = { all: 'Alle', draft: 'Concept', sent: 'Verzonden', overdue: 'Verlopen', paid: 'Betaald' };
              return (
                <button
                  key={f}
                  onClick={() => setInvoiceFilter(f)}
                  className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                    invoiceFilter === f
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border hover:bg-accent'
                  }`}
                >
                  {labels[f]} ({invoiceStatusCounts[f]})
                </button>
              );
            })}
          </div>
          <UnifiedDocumentTable documents={filteredInvoices} loading={iLoading} emptyMessage="Geen facturen gevonden" />
        </TabsContent>

        {/* Templates tab */}
        <TabsContent value="templates" className="mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tLoading ? (
              <p className="text-muted-foreground col-span-full text-center py-8">Laden...</p>
            ) : templates.length === 0 ? (
              <Card className="col-span-full">
                <CardContent className="py-12 text-center">
                  <LayoutTemplate size={32} className="mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">Nog geen sjablonen aangemaakt.</p>
                  <Button variant="outline" className="mt-4 gap-1.5" onClick={() => navigate('/templates/new')}>
                    <Plus size={14} /> Eerste sjabloon maken
                  </Button>
                </CardContent>
              </Card>
            ) : (
              templates.map((tpl) => (
                <Card
                  key={tpl.id}
                  className="cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all group"
                  onClick={() => navigate(`/templates/${tpl.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground truncate">{tpl.name}</p>
                        {tpl.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{tpl.description}</p>}
                        {tpl.isDefault && <Badge variant="secondary" className="mt-1.5 text-xs">Standaard</Badge>}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={async (e) => {
                          e.stopPropagation();
                          const ok = await deleteTemplate(tpl.id);
                          if (ok) toast({ title: 'Sjabloon verwijderd' });
                        }}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">{formatDate(tpl.createdAt, false)}</p>
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
