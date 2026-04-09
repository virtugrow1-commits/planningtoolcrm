import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Copy, FileText, Save, Pencil, Check, AlertTriangle, Eye } from 'lucide-react';
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
import DeleteConfirmDialog from '@/components/quotation/DeleteConfirmDialog';
import DocumentMetadata, { formatDate } from '@/components/quotation/DocumentMetadata';
import DocumentViewer from '@/components/quotation/DocumentViewer';
import QuotePreviewDialog from '@/components/quotation/QuotePreviewDialog';
import type { Quote, LineItem } from '@/types/quotation';
import { calcFinancials } from '@/types/quotation';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getQuoteWithItems, updateQuoteStatus, updateQuote, createQuote } = useQuotes();
  const { createInvoiceFromQuote } = useInvoices();
  const { toast } = useToast();

  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const hasUnsaved = useRef(false);

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
  const [contentBlocks, setContentBlocks] = useState<any[]>([]);

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
      setContentBlocks((q.contentBlocks as any[]) || []);
    }
    setLoading(false);
  }, [id, getQuoteWithItems]);

  useEffect(() => { loadQuote(); }, [loadQuote]);

  // Track unsaved changes
  useEffect(() => {
    if (editing) hasUnsaved.current = true;
  }, [title, contactName, companyName, clientEmail, clientAddress, introduction, termsAndConditions, notes, validUntil, lineItems]);

  // Allow editing on draft AND viewed (not yet decided) quotes
  const canEdit = quote?.status === 'draft' || quote?.status === 'viewed';
  const isEditable = canEdit && editing;
  const isExpired = quote?.validUntil && new Date(quote.validUntil) < new Date();

  const handleSave = async () => {
    if (!quote || saving) return;
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
      contentBlocks,
      subtotal: fin.subtotal,
      vatAmount: fin.vatAmount,
      discountAmount: fin.discountAmount,
      total: fin.total,
    });

    if (ok) {
      // Replace line items
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
      hasUnsaved.current = false;
      toast({ title: 'Offerte opgeslagen' });
      setEditing(false);
      await loadQuote();
    }
    setSaving(false);
  };

  const handleSend = async () => {
    if (!quote) return;
    // If still in edit mode, save first
    if (editing) await handleSave();
    const ok = await updateQuoteStatus(quote.id, 'sent');
    if (ok) {
      toast({ title: 'Offerte gemarkeerd als verzonden' });
      await loadQuote();
    }
  };

  const handleCreateInvoice = async () => {
    if (!quote) return;
    const inv = await createInvoiceFromQuote(quote.id);
    if (inv) navigate(`/invoices/${inv.id}`);
  };

  const handleDuplicate = async () => {
    if (!quote) return;
    const dup = await createQuote(
      {
        title: `${quote.title} (kopie)`,
        templateId: quote.templateId,
        contactId: quote.contactId,
        companyId: quote.companyId,
        contactName: quote.contactName,
        companyName: quote.companyName,
        clientEmail: quote.clientEmail,
        clientAddress: quote.clientAddress,
        introduction: quote.introduction,
        termsAndConditions: quote.termsAndConditions,
        notes: quote.notes,
        validUntil: quote.validUntil,
        contentBlocks: contentBlocks,
        subtotal: quote.subtotal,
        vatAmount: quote.vatAmount,
        discountAmount: quote.discountAmount,
        total: quote.total,
      },
      lineItems
    );
    if (dup) {
      toast({ title: 'Offerte gedupliceerd', description: dup.displayNumber });
      navigate(`/quotes/${dup.id}`);
    }
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
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
    toast({ title: 'Link gekopieerd naar klembord' });
  };

  const handleBackClick = () => {
    if (editing && hasUnsaved.current) {
      if (window.confirm('Je hebt niet-opgeslagen wijzigingen. Toch weg?')) {
        navigate('/quotes');
      }
    } else {
      navigate('/quotes');
    }
  };

  if (loading) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] flex-col gap-3">
        <AlertTriangle size={32} className="text-muted-foreground" />
        <p className="text-muted-foreground">Offerte niet gevonden</p>
        <Button variant="outline" onClick={() => navigate('/quotes')}>Terug naar overzicht</Button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <Button variant="ghost" size="icon" onClick={handleBackClick}>
          <ArrowLeft size={18} />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-foreground">{quote.displayNumber}</h1>
            <QuoteStatusBadge status={quote.status} />
            {isExpired && quote.status !== 'accepted' && quote.status !== 'declined' && (
              <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                Verlopen
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground truncate">{quote.title}</p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {quote.publicToken && (
            <Button variant="outline" size="sm" onClick={copyPublicLink} className="gap-1.5">
              {linkCopied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
              {linkCopied ? 'Gekopieerd!' : 'Kopieer link'}
            </Button>
          )}

          <QuotePreviewDialog quote={quote} contentBlocks={contentBlocks} />

          <Button variant="outline" size="sm" onClick={handleDuplicate} className="gap-1.5">
            <Copy size={14} /> Dupliceer
          </Button>

          {canEdit && !editing && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="gap-1.5">
              <Pencil size={14} /> Bewerken
            </Button>
          )}

          {isEditable && (
            <Button variant="outline" size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
              <Save size={14} /> {saving ? 'Opslaan...' : 'Opslaan'}
            </Button>
          )}

          {(quote.status === 'draft' || quote.status === 'viewed') && (
            <Button size="sm" onClick={handleSend} className="gap-1.5">
              <Send size={14} /> Markeer verzonden
            </Button>
          )}

          {quote.status === 'accepted' && (
            <Button size="sm" onClick={handleCreateInvoice} className="gap-1.5">
              <FileText size={14} /> Maak factuur
            </Button>
          )}

          {canEdit && <DeleteConfirmDialog title="Offerte verwijderen?" onConfirm={handleDelete} />}
        </div>
      </div>

      {/* Expired warning */}
      {isExpired && quote.status === 'sent' && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <AlertTriangle size={16} className="text-amber-600 shrink-0" />
            <p className="text-sm text-amber-800">
              Deze offerte is verlopen op {formatDate(quote.validUntil!, false)}.
              Bewerk de geldigheidsdatum en stuur opnieuw.
            </p>
          </CardContent>
        </Card>
      )}

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
          data={{
            contactId,
            contactName: quote.contactName,
            companyId,
            companyName: quote.companyName || '',
            clientEmail: quote.clientEmail || '',
            clientAddress: quote.clientAddress || '',
          }}
          readOnly
        />
      )}

      {/* Edit mode: metadata fields */}
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

      {/* Read-only introduction */}
      {!isEditable && quote.introduction && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm whitespace-pre-wrap text-foreground">{quote.introduction}</p>
          </CardContent>
        </Card>
      )}

      {/* Document blocks */}
      {contentBlocks.length > 0 && (
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-3">Document</p>
          <DocumentViewer blocks={contentBlocks} />
        </div>
      )}

      {/* Line items (shown when no block-based content, or always in edit mode) */}
      {(contentBlocks.length === 0 || isEditable) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {contentBlocks.length > 0 ? 'Extra regelitems' : 'Producten & Diensten'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <LineItemsEditor
              items={lineItems}
              onChange={isEditable ? setLineItems : () => {}}
              readOnly={!isEditable}
            />
          </CardContent>
        </Card>
      )}

      {/* Notes & Terms in edit mode */}
      {isEditable && (
        <Card>
          <CardHeader><CardTitle className="text-base">Voorwaarden & Notities</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Algemene voorwaarden</Label>
              <Textarea
                value={termsAndConditions}
                onChange={(e) => setTermsAndConditions(e.target.value)}
                className="min-h-[80px]"
                placeholder="Betalingstermijn, annuleringsbeleid, etc."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Interne notities</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-[60px]"
                placeholder="Niet zichtbaar voor de klant"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Read-only terms & notes */}
      {!isEditable && (
        <>
          {quote.termsAndConditions && (
            <Card>
              <CardHeader><CardTitle className="text-base">Voorwaarden</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">{quote.termsAndConditions}</p>
              </CardContent>
            </Card>
          )}
          {quote.notes && (
            <Card>
              <CardHeader><CardTitle className="text-base">Interne notities</CardTitle></CardHeader>
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
          <CardHeader><CardTitle className="text-base">Handtekening</CardTitle></CardHeader>
          <CardContent>
            <img src={quote.signatureData} alt="Handtekening" className="border rounded-lg max-w-xs bg-white" />
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
          { label: 'Geaccepteerd', value: quote.acceptedAt ? formatDate(quote.acceptedAt) : undefined },
          { label: 'Afgewezen', value: quote.declinedAt ? formatDate(quote.declinedAt) : undefined },
        ]}
      />
    </div>
  );
}
