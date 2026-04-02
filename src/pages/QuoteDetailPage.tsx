import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Copy, ExternalLink, FileText, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useQuotes } from '@/hooks/useQuotes';
import { useInvoices } from '@/hooks/useInvoices';
import QuoteStatusBadge from '@/components/quotation/QuoteStatusBadge';
import LineItemsEditor from '@/components/quotation/LineItemsEditor';
import type { Quote } from '@/types/quotation';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getQuoteWithItems, updateQuoteStatus } = useQuotes();
  const { createInvoiceFromQuote } = useInvoices();
  const { toast } = useToast();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    getQuoteWithItems(id).then((q) => {
      setQuote(q);
      setLoading(false);
    });
  }, [id, getQuoteWithItems]);

  const handleSendQuote = async () => {
    if (!quote) return;
    await updateQuoteStatus(quote.id, 'sent');
    setQuote((prev) => prev ? { ...prev, status: 'sent', sentAt: new Date().toISOString() } : null);
    toast({ title: 'Offerte verzonden', description: 'De status is bijgewerkt naar Verzonden.' });
  };

  const handleCreateInvoice = async () => {
    if (!quote) return;
    const inv = await createInvoiceFromQuote(quote.id);
    if (inv) {
      navigate(`/invoices/${inv.id}`);
    }
  };

  const copyPublicLink = () => {
    if (!quote?.publicToken) return;
    const url = `${window.location.origin}/quote/view/${quote.publicToken}`;
    navigator.clipboard.writeText(url);
    toast({ title: 'Link gekopieerd' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-muted-foreground">Laden...</p>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-muted-foreground">Offerte niet gevonden</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/quotes')}>
          <ArrowLeft size={18} />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-foreground">{quote.displayNumber}</h1>
            <QuoteStatusBadge status={quote.status} />
          </div>
          <p className="text-sm text-muted-foreground">{quote.title}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {quote.publicToken && (
            <Button variant="outline" size="sm" onClick={copyPublicLink} className="gap-1.5">
              <Copy size={14} /> Kopieer link
            </Button>
          )}
          {quote.status === 'draft' && (
            <Button size="sm" onClick={handleSendQuote} className="gap-1.5">
              <Send size={14} /> Verzenden
            </Button>
          )}
          {quote.status === 'accepted' && (
            <Button size="sm" onClick={handleCreateInvoice} className="gap-1.5">
              <FileText size={14} /> Maak factuur
            </Button>
          )}
        </div>
      </div>

      {/* Client info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Klantgegevens</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground font-semibold mb-0.5">Contactpersoon</p>
              <p>{quote.contactName}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-semibold mb-0.5">E-mail</p>
              <p>{quote.clientEmail || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-semibold mb-0.5">Bedrijf</p>
              <p>{quote.companyName || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-semibold mb-0.5">Adres</p>
              <p>{quote.clientAddress || '—'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Introduction */}
      {quote.introduction && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm whitespace-pre-wrap">{quote.introduction}</p>
          </CardContent>
        </Card>
      )}

      {/* Line items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Producten & Diensten</CardTitle>
        </CardHeader>
        <CardContent>
          <LineItemsEditor items={quote.lineItems || []} onChange={() => {}} readOnly />
        </CardContent>
      </Card>

      {/* Terms */}
      {quote.termsAndConditions && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Voorwaarden</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">{quote.termsAndConditions}</p>
          </CardContent>
        </Card>
      )}

      {/* Signature (if accepted) */}
      {quote.signatureData && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Handtekening</CardTitle>
          </CardHeader>
          <CardContent>
            <img src={quote.signatureData} alt="Handtekening" className="border rounded-lg max-w-xs" />
            <p className="text-xs text-muted-foreground mt-2">
              Ondertekend op {quote.acceptedAt ? format(new Date(quote.acceptedAt), 'dd MMM yyyy HH:mm', { locale: nl }) : '—'}
              {quote.signatureIp && ` · IP: ${quote.signatureIp}`}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Metadata */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs text-muted-foreground">
            <div>
              <p className="font-semibold mb-0.5">Aangemaakt</p>
              <p>{format(new Date(quote.createdAt), 'dd MMM yyyy HH:mm', { locale: nl })}</p>
            </div>
            {quote.sentAt && (
              <div>
                <p className="font-semibold mb-0.5">Verzonden</p>
                <p>{format(new Date(quote.sentAt), 'dd MMM yyyy HH:mm', { locale: nl })}</p>
              </div>
            )}
            {quote.validUntil && (
              <div>
                <p className="font-semibold mb-0.5">Geldig tot</p>
                <p>{format(new Date(quote.validUntil), 'dd MMM yyyy', { locale: nl })}</p>
              </div>
            )}
            {quote.viewedAt && (
              <div>
                <p className="font-semibold mb-0.5">Bekeken</p>
                <p>{format(new Date(quote.viewedAt), 'dd MMM yyyy HH:mm', { locale: nl })}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
