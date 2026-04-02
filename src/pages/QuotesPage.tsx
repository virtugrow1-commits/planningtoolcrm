import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FileText, Search, Layout, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useQuotes } from '@/hooks/useQuotes';
import { useInvoices } from '@/hooks/useInvoices';
import { useQuoteTemplates } from '@/hooks/useQuoteTemplates';
import QuoteStatusBadge from '@/components/quotation/QuoteStatusBadge';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';

export default function QuotesPage() {
  const navigate = useNavigate();
  const { quotes, loading: qLoading } = useQuotes();
  const { invoices, loading: iLoading } = useInvoices();
  const { templates, loading: tLoading, deleteTemplate } = useQuoteTemplates();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('quotes');

  const filteredQuotes = quotes.filter((q) =>
    [q.displayNumber, q.contactName, q.companyName, q.title]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const filteredInvoices = invoices.filter((inv) =>
    [inv.displayNumber, inv.contactName, inv.companyName, inv.title]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  // KPIs
  const totalQuotesSent = quotes.filter((q) => q.status !== 'draft').length;
  const acceptedQuotes = quotes.filter((q) => q.status === 'accepted').length;
  const acceptanceRate = totalQuotesSent > 0 ? Math.round((acceptedQuotes / totalQuotesSent) * 100) : 0;
  const pendingInvoices = invoices.filter((inv) => inv.status === 'sent' || inv.status === 'overdue').length;
  const revenueCollected = invoices.filter((inv) => inv.status === 'paid').reduce((sum, inv) => sum + inv.total, 0);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Offertes & Facturen</h1>
          <p className="text-sm text-muted-foreground">Beheer offertes, facturen en betalingen</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => navigate('/quotes/new')} className="gap-1.5">
            <Plus size={16} /> Nieuwe offerte
          </Button>
          <Button variant="outline" onClick={() => navigate('/templates/new')} className="gap-1.5">
            <Layout size={16} /> Nieuw sjabloon
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Offertes verzonden', value: totalQuotesSent, icon: FileText },
          { label: 'Acceptatiegraad', value: `${acceptanceRate}%`, icon: FileText },
          { label: 'Openstaande facturen', value: pendingInvoices, icon: FileText },
          { label: 'Omzet geïnd', value: `€ ${revenueCollected.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}`, icon: FileText },
        ].map((kpi, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground">{kpi.label}</p>
              <p className="text-2xl font-bold text-foreground mt-1">{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search + tabs */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Zoeken..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="quotes">Offertes ({quotes.length})</TabsTrigger>
          <TabsTrigger value="invoices">Facturen ({invoices.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="quotes" className="mt-4">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nummer</TableHead>
                  <TableHead>Titel</TableHead>
                  <TableHead>Klant</TableHead>
                  <TableHead>Bedrijf</TableHead>
                  <TableHead className="text-right">Totaal</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Datum</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {qLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Laden...</TableCell>
                  </TableRow>
                ) : filteredQuotes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Geen offertes gevonden</TableCell>
                  </TableRow>
                ) : (
                  filteredQuotes.map((q) => (
                    <TableRow
                      key={q.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/quotes/${q.id}`)}
                    >
                      <TableCell className="font-mono text-xs">{q.displayNumber}</TableCell>
                      <TableCell className="font-medium">{q.title}</TableCell>
                      <TableCell>{q.contactName}</TableCell>
                      <TableCell className="text-muted-foreground">{q.companyName || '—'}</TableCell>
                      <TableCell className="text-right font-medium">€ {q.total.toFixed(2)}</TableCell>
                      <TableCell><QuoteStatusBadge status={q.status} /></TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {format(new Date(q.createdAt), 'dd MMM yyyy', { locale: nl })}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="invoices" className="mt-4">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nummer</TableHead>
                  <TableHead>Titel</TableHead>
                  <TableHead>Klant</TableHead>
                  <TableHead className="text-right">Totaal</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Vervaldatum</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {iLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Laden...</TableCell>
                  </TableRow>
                ) : filteredInvoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Geen facturen gevonden</TableCell>
                  </TableRow>
                ) : (
                  filteredInvoices.map((inv) => (
                    <TableRow
                      key={inv.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/invoices/${inv.id}`)}
                    >
                      <TableCell className="font-mono text-xs">{inv.displayNumber}</TableCell>
                      <TableCell className="font-medium">{inv.title}</TableCell>
                      <TableCell>{inv.contactName}</TableCell>
                      <TableCell className="text-right font-medium">€ {inv.total.toFixed(2)}</TableCell>
                      <TableCell><QuoteStatusBadge status={inv.status} /></TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {inv.dueDate ? format(new Date(inv.dueDate), 'dd MMM yyyy', { locale: nl }) : '—'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
