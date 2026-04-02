import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Copy, FileText, Trash2, Save, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useQuotes } from '@/hooks/useQuotes';
import { useInvoices } from '@/hooks/useInvoices';
import QuoteStatusBadge from '@/components/quotation/QuoteStatusBadge';
import LineItemsEditor from '@/components/quotation/LineItemsEditor';
import ContactSelector from '@/components/quotation/ContactSelector';
import PdfOverlayEditor from '@/components/quotation/PdfOverlayEditor';
import type { OverlayField } from '@/components/quotation/PdfOverlayEditor';
import type { Quote, LineItem } from '@/types/quotation';
import { calcFinancials } from '@/types/quotation';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

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

    // Update line items: delete + re-insert
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
          {isDraft && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive">
                  <Trash2 size={14} /> Verwijderen
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Offerte verwijderen?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Dit kan niet ongedaan worden gemaakt.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuleren</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
                    Verwijderen
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Client info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Klantgegevens</CardTitle>
        </CardHeader>
        <CardContent>
          {isEditable ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Contactpersoon</Label>
                <ContactSelector
                  value={contactId}
                  onChange={(cId, cName, coId, coName, email) => {
                    setContactId(cId);
                    setContactName(cName);
                    if (coId) setCompanyId(coId);
                    if (coName) setCompanyName(coName);
                    if (email) setClientEmail(email);
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <Input value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Bedrijf</Label>
                <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Adres</Label>
                <Input value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} />
              </div>
            </div>
          ) : (
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
          )}
        </CardContent>
      </Card>

      {/* Quote details */}
      {isEditable && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Offerte details</CardTitle>
          </CardHeader>
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
              <Textarea
                value={introduction}
                onChange={(e) => setIntroduction(e.target.value)}
                className="min-h-[80px]"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Introduction (read-only) */}
      {!isEditable && quote.introduction && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm whitespace-pre-wrap">{quote.introduction}</p>
          </CardContent>
        </Card>
      )}

      {/* PDF Template */}
      {(pdfUrl || isEditable) && (
        <PdfOverlayEditor
          pdfUrl={pdfUrl}
          overlayFields={overlayFields}
          onPdfUpload={(url) => setPdfUrl(url)}
          onFieldsChange={(fields) => setOverlayFields(fields)}
          readOnly={!isEditable}
        />
      )}

      {/* Line items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Producten & Diensten</CardTitle>
        </CardHeader>
        <CardContent>
          <LineItemsEditor
            items={lineItems}
            onChange={isEditable ? setLineItems : () => {}}
            readOnly={!isEditable}
          />
        </CardContent>
      </Card>

      {/* Terms & Notes */}
      {isEditable ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Voorwaarden & Notities</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Algemene voorwaarden</Label>
              <Textarea
                value={termsAndConditions}
                onChange={(e) => setTermsAndConditions(e.target.value)}
                className="min-h-[80px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Interne notities</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-[60px]"
              />
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
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
          {quote.notes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Notities</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">{quote.notes}</p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Signature */}
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
