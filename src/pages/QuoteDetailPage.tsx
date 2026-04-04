import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Copy, FileText, Save, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useQuotes } from '@/hooks/useQuotes';
import { useInvoices } from '@/hooks/useInvoices';
import QuoteStatusBadge from '@/components/quotation/QuoteStatusBadge';
import LineItemsEditor from '@/components/quotation/LineItemsEditor';
import ClientInfoCard from '@/components/quotation/ClientInfoCard';
import PdfOverlayEditor from '@/components/quotation/PdfOverlayEditor';
import type { OverlayField } from '@/components/quotation/PdfOverlayEditor';
import DeleteConfirmDialog from '@/components/quotation/DeleteConfirmDialog';
import DocumentMetadata, { formatDate } from '@/components/quotation/DocumentMetadata';
import type { Quote, LineItem } from '@/types/quotation';
import { calcFinancials } from '@/types/quotation';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getQuoteWithItems, updateQuoteStatus, updateQuote } = useQuotes();
  const { createInvoiceFromQuote } = useInvoices();
  const { toast } = useToast();

  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Editable state
  const [title, setTitle] = useState('');
  const [contactId, setContactId] = useState('');
  const [contactName, setContactName] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [introduction, setIntroduction] = useState('');
  const [termsAndConditions, setTermsAndConditions] = useState('');
  const [notes, setNotes] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [overlayFields, setOverlayFields] = useState<OverlayField[]>([]);

  const loadQuote = useCallback(async () => {
    if (!id) return;
    const q = await getQuoteWithItems(id);
    if (q) {
      setQuote(q);
      setTitle(q.title);
      setContactId(q.contactId || '');
      setContactName(q.contactName);
      setCompanyId(q.companyId || '');
      setCompanyName(q.companyName || '');
      setClientEmail(q.clientEmail || '');
      setClientAddress(q.clientAddress || '');
      setIntroduction(q.introduction || '');
      setTermsAndConditions(q.termsAndConditions || '');
      setNotes(q.notes || '');
      setValidUntil(q.validUntil || '');
      setLineItems(q.lineItems || []);
      setPdfUrl(q.pdfUrl || null);
      setOverlayFields((q.overlayFields as OverlayField[]) || []);
    }
    setLoading(false);
  }, [id, getQuoteWithItems]);

  useEffect(() => { loadQuote(); }, [loadQuote]);

  const isDraft = quote?.status === 'draft';
  const isEditable = isDraft && editing;

  const handleSave = async () => {
    if (!quote) return;
    setSaving(true);
    const fin = calcFinancials(lineItems);

    const ok = await updateQuote(quote.id, {
      title,
      contactName,
      companyName: companyName || undefined,
      clientEmail: clientEmail || undefined,
      clientAddress: clientAddress || undefined,
      introduction: introduction || undefined,
      termsAndConditions: termsAndConditions || undefined,
      notes: notes || undefined,
      validUntil: validUntil || undefined,
      pdfUrl,
      overlayFields,
      subtotal: fin.subtotal,
      vatAmount: fin.vatAmount,
      discountAmount: fin.discountAmount,
      total: fin.total,
    });

    if (ok) {
      await supabase.from('quote_line_items').delete().eq('quote_id', quote.id);
      if (lineItems.length > 0) {
        await supabase.from('quote_line_items').insert(
          lineItems.map((li, i) => ({
            quote_id: quote.id,
            sort_order: i,
            item_name: li.itemName,
            description: li.description || null,
            quantity: li.quantity,
            unit_price: li.unitPrice,
            vat_rate: li.vatRate,
            discount_percent: li.discountPercent,
            line_total: li.lineTotal,
          }))
        );
      }
    }

    setSaving(false);
    if (ok) {
      toast({ title: 'Offerte opgeslagen' });
      setEditing(false);
      await loadQuote();
    }
  };

  const handleSend = async () => {
    if (!quote) return;
    await updateQuoteStatus(quote.id, 'sent');
    toast({ title: 'Offerte verzonden', description: 'Status bijgewerkt naar Verzonden.' });
    await loadQuote();
  };

  const handleCreateInvoice = async () => {
    if (!quote) return;
    const inv = await createInvoiceFromQuote(quote.id);
    if (inv) navigate(`/invoices/${inv.id}`);
  };

  const handleDelete = async () => {
    if (!quote) return;
    await supabase.from('quote_line_items').delete().eq('quote_id', quote.id);
    const { error } = await supabase.from('quotes').delete().eq('id', quote.id);
    if (error) {
      toast({ title: 'Fout bij verwijderen', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Offerte verwijderd' });
    navigate('/quotes');
  };

  const copyPublicLink = () => {
    if (!quote?.publicToken) return;
    const url = `${window.location.origin}/quote/view/${quote.publicToken}`;
    navigator.clipboard.writeText(url);
    toast({ title: 'Link gekopieerd' });
  };

  if (loading) return <div className="flex items-center justify-center min-h-[50vh]"><p className="text-muted-foreground">Laden...</p></div>;
  if (!quote) return <div className="flex items-center justify-center min-h-[50vh]"><p className="text-muted-foreground">Offerte niet gevonden</p></div>;

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
          {isDraft && !editing && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="gap-1.5">
              <Pencil size={14} /> Bewerken
            </Button>
          )}
          {isEditable && (
            <Button variant="outline" size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
              <Save size={14} /> {saving ? 'Opslaan...' : 'Opslaan'}
            </Button>
          )}
          {isDraft && (
            <Button size="sm" onClick={handleSend} className="gap-1.5">
              <Send size={14} /> Verzenden
            </Button>
          )}
          {quote.status === 'accepted' && (
            <Button size="sm" onClick={handleCreateInvoice} className="gap-1.5">
              <FileText size={14} /> Maak factuur
            </Button>
          )}
          {isDraft && <DeleteConfirmDialog title="Offerte verwijderen?" onConfirm={handleDelete} />}
        </div>
      </div>

      {/* Client info */}
      {isEditable ? (
        <ClientInfoCard
          data={{ contactId, contactName, companyId, companyName, clientEmail, clientAddress }}
          onChange={(updates) => {
            if (updates.contactId !== undefined) setContactId(updates.contactId);
            if (updates.contactName !== undefined) setContactName(updates.contactName);
            if (updates.companyId !== undefined) setCompanyId(updates.companyId);
            if (updates.companyName !== undefined) setCompanyName(updates.companyName);
            if (updates.clientEmail !== undefined) setClientEmail(updates.clientEmail);
            if (updates.clientAddress !== undefined) setClientAddress(updates.clientAddress);
          }}
        />
      ) : (
        <ClientInfoCard
          data={{ contactId, contactName, companyId, companyName, clientEmail: quote.clientEmail || '', clientAddress: quote.clientAddress || '' }}
          readOnly
        />
      )}

      {/* Quote details (edit mode) */}
      {isEditable && (
        <Card>
          <CardHeader><CardTitle className="text-base">Offerte details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Titel</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Geldig tot</Label>
                <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Introductietekst</Label>
              <Textarea value={introduction} onChange={(e) => setIntroduction(e.target.value)} className="min-h-[80px]" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Introduction (read-only) */}
      {!isEditable && quote.introduction && (
        <Card><CardContent className="pt-6"><p className="text-sm whitespace-pre-wrap">{quote.introduction}</p></CardContent></Card>
      )}

      {/* PDF Template */}
      {(pdfUrl || isEditable) && (
        <PdfOverlayEditor
          pdfUrl={pdfUrl}
          overlayFields={overlayFields}
          onPdfUpload={setPdfUrl}
          onFieldsChange={setOverlayFields}
          readOnly={!isEditable}
        />
      )}

      {/* Line items */}
      <Card>
        <CardHeader><CardTitle className="text-base">Producten & Diensten</CardTitle></CardHeader>
        <CardContent>
          <LineItemsEditor items={lineItems} onChange={isEditable ? setLineItems : () => {}} readOnly={!isEditable} />
        </CardContent>
      </Card>

      {/* Terms & Notes */}
      {isEditable ? (
        <Card>
          <CardHeader><CardTitle className="text-base">Voorwaarden & Notities</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Algemene voorwaarden</Label>
              <Textarea value={termsAndConditions} onChange={(e) => setTermsAndConditions(e.target.value)} className="min-h-[80px]" />
            </div>
            <div className="space-y-1.5">
              <Label>Interne notities</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[60px]" />
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {quote.termsAndConditions && (
            <Card>
              <CardHeader><CardTitle className="text-base">Voorwaarden</CardTitle></CardHeader>
              <CardContent><p className="text-sm whitespace-pre-wrap text-muted-foreground">{quote.termsAndConditions}</p></CardContent>
            </Card>
          )}
          {quote.notes && (
            <Card>
              <CardHeader><CardTitle className="text-base">Notities</CardTitle></CardHeader>
              <CardContent><p className="text-sm whitespace-pre-wrap text-muted-foreground">{quote.notes}</p></CardContent>
            </Card>
          )}
        </>
      )}

      {/* Signature */}
      {quote.signatureData && (
        <Card>
          <CardHeader><CardTitle className="text-base">Handtekening</CardTitle></CardHeader>
          <CardContent>
            <img src={quote.signatureData} alt="Handtekening" className="border rounded-lg max-w-xs" />
            <p className="text-xs text-muted-foreground mt-2">
              Ondertekend op {quote.acceptedAt ? formatDate(quote.acceptedAt) : '—'}
              {quote.signatureIp && ` · IP: ${quote.signatureIp}`}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Metadata */}
      <DocumentMetadata
        items={[
          { label: 'Aangemaakt', value: formatDate(quote.createdAt) },
          { label: 'Verzonden', value: quote.sentAt ? formatDate(quote.sentAt) : undefined },
          { label: 'Geldig tot', value: quote.validUntil ? formatDate(quote.validUntil, false) : undefined },
          { label: 'Bekeken', value: quote.viewedAt ? formatDate(quote.viewedAt) : undefined },
        ]}
      />
    </div>
  );
}
