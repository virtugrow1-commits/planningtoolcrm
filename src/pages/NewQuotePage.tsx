import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Save, LayoutTemplate, FileText, Loader2, Eye, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useQuotes } from '@/hooks/useQuotes';
import { useQuoteTemplates } from '@/hooks/useQuoteTemplates';
import { calcFinancials } from '@/types/quotation';
import type { LineItem, Quote } from '@/types/quotation';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { resolveBlocksMergeTags } from '@/lib/mergeTags';
import type { MergeTagData } from '@/lib/mergeTags';
import ContactSelector from '@/components/quotation/ContactSelector';
import CompanySelector from '@/components/quotation/CompanySelector';
import LineItemsEditor from '@/components/quotation/LineItemsEditor';
import SendQuoteDialog from '@/components/quotation/SendQuoteDialog';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import TemplatePreview from '@/components/quotation/TemplatePreview';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

export default function NewQuotePage() {
  const navigate = useNavigate();
  const { createQuote } = useQuotes();
  const { templates, loading: tLoading } = useQuoteTemplates();
  const { toast } = useToast();

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [contactId, setContactId] = useState<string>('');
  const [contactName, setContactName] = useState<string>('');
  const [companyId, setCompanyId] = useState<string>('');
  const [companyName, setCompanyName] = useState<string>('');
  const [clientEmail, setClientEmail] = useState<string>('');
  const [clientAddress, setClientAddress] = useState<string>('');
  const [title, setTitle] = useState('Offerte');
  const [validUntil, setValidUntil] = useState('');

  const [contacts, setContacts] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [manualLineItems, setManualLineItems] = useState<LineItem[]>([]);

  const [savingDraft, setSavingDraft] = useState(false);
  const [savingAndSend, setSavingAndSend] = useState(false);
  const [createdQuote, setCreatedQuote] = useState<Quote | null>(null);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId),
    [templates, selectedTemplateId]
  );

  // Auto-pick first/default template once loaded
  useEffect(() => {
    if (!selectedTemplateId && templates.length > 0) {
      const def = templates.find((t) => t.isDefault) || templates[0];
      setSelectedTemplateId(def.id);
    }
  }, [templates, selectedTemplateId]);

  // Load contacts + companies once
  useEffect(() => {
    supabase.from('contacts')
      .select('id, first_name, last_name, email, phone, job_title, department, company_id')
      .order('last_name')
      .then(({ data }) => setContacts(data || []));
    supabase.from('companies')
      .select('id, name, email, phone, address, postcode, city, country, kvk, btw_number, website')
      .order('name')
      .then(({ data }) => setCompanies(data || []));
  }, []);

  // Auto-fill company + address when picking contact.
  // Also fetches the company directly if it's not in our local cache, so the
  // address fields are reliably populated for any contact in the organisation.
  useEffect(() => {
    if (!contactId) return;
    const c = contacts.find((x) => x.id === contactId);
    if (!c) return;
    setContactName([c.first_name, c.last_name].filter(Boolean).join(' '));
    setClientEmail(c.email || '');

    if (!c.company_id) return;

    const fillFromCompany = (co: any) => {
      setCompanyId(co.id);
      setCompanyName(co.name || '');
      const addr = [co.address, [co.postcode, co.city].filter(Boolean).join(' ')]
        .filter(Boolean)
        .join(', ');
      if (addr) setClientAddress(addr);
    };

    const cached = companies.find((x) => x.id === c.company_id);
    if (cached) {
      fillFromCompany(cached);
      return;
    }
    // Not yet in cache — fetch directly so address gets filled regardless
    supabase
      .from('companies')
      .select('id, name, email, phone, address, postcode, city, country, kvk, btw_number, website')
      .eq('id', c.company_id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setCompanies((prev) => (prev.some((p) => p.id === data.id) ? prev : [...prev, data]));
        fillFromCompany(data);
      });
  }, [contactId, contacts, companies]);

  const selectedContact = contacts.find((c) => c.id === contactId);
  const selectedCompany = companies.find((c) => c.id === companyId);

  // Resolve content blocks from template + extract line items from product-list blocks
  const { resolvedBlocks, blockLineItems } = useMemo(() => {
    if (!selectedTemplate) return { resolvedBlocks: [], blockLineItems: [] as LineItem[] };
    const cb = selectedTemplate.contentBlocks as any;
    const rawBlocks: any[] = cb?.blocks || [];

    const mergeData: MergeTagData = {
      contact: selectedContact ? {
        name: contactName,
        first_name: selectedContact.first_name,
        last_name: selectedContact.last_name,
        email: clientEmail,
        phone: selectedContact.phone,
        job_title: selectedContact.job_title,
        department: selectedContact.department,
      } : { name: contactName, email: clientEmail },
      company: selectedCompany ? {
        name: companyName,
        email: selectedCompany.email,
        phone: selectedCompany.phone,
        address: selectedCompany.address,
        postcode: selectedCompany.postcode,
        city: selectedCompany.city,
        country: selectedCompany.country,
        kvk: selectedCompany.kvk,
        btw_number: selectedCompany.btw_number,
        website: selectedCompany.website,
      } : { name: companyName },
      quote: { title, valid_until: validUntil || undefined },
    };

    const resolved = resolveBlocksMergeTags(rawBlocks, mergeData);

    const items: LineItem[] = [];
    let sortOrder = 0;
    for (const block of resolved) {
      if (block.type !== 'product-list') continue;
      for (const item of block.items || []) {
        const base = (item.quantity || 0) * (item.unitPrice || 0);
        items.push({
          id: item.id || `tpl-${sortOrder}`,
          sortOrder: sortOrder++,
          itemName: item.name || '',
          description: item.description || undefined,
          quantity: item.quantity || 1,
          unitPrice: item.unitPrice || 0,
          vatRate: item.vatRate ?? 21,
          discountPercent: 0,
          lineTotal: base,
        });
      }
    }
    return { resolvedBlocks: resolved, blockLineItems: items };
  }, [selectedTemplate, selectedContact, selectedCompany, contactName, clientEmail, companyName, title, validUntil]);

  const effectiveLineItems = blockLineItems.length > 0 ? blockLineItems : manualLineItems;
  const fin = useMemo(() => calcFinancials(effectiveLineItems), [effectiveLineItems]);

  /** Create the quote. Returns the created quote or null on failure. */
  const persistQuote = async (): Promise<Quote | null> => {
    if (!selectedTemplate) {
      toast({ title: 'Selecteer een sjabloon', variant: 'destructive' });
      return null;
    }
    // At least one of: contact OR company is required
    if (!contactName.trim() && !companyName.trim()) {
      toast({ title: 'Kies een bedrijf of contactpersoon', variant: 'destructive' });
      return null;
    }
    // Fallback contactName to companyName when only company is chosen
    const effectiveContactName = contactName.trim() || companyName.trim();
    const tplCb = selectedTemplate.contentBlocks as any;
    // Templates may store the PDF under different field names depending on
    // which editor uploaded it. Use any of them as a fallback.
    const templatePdfUrl = tplCb?.pdfUrl || tplCb?.pdfBackgroundUrl || tplCb?.editorPdfUrl || undefined;

    return await createQuote(
      {
        title,
        templateId: selectedTemplate.id,
        contactId: contactId || undefined,
        companyId: companyId || undefined,
        contactName: effectiveContactName,
        companyName: companyName || undefined,
        clientEmail: clientEmail || undefined,
        clientAddress: clientAddress || undefined,
        termsAndConditions: selectedTemplate.termsAndConditions || undefined,
        validUntil: validUntil || undefined,
        contentBlocks: resolvedBlocks,
        // Carry over the template's PDF + overlay so the email attachment uses it
        pdfUrl: templatePdfUrl,
        overlayFields: tplCb?.overlayFields || [],
        subtotal: fin.subtotal,
        vatAmount: fin.vatAmount,
        discountAmount: fin.discountAmount,
        total: fin.total,
      },
      effectiveLineItems
    );
  };

  const [downloadingPreview, setDownloadingPreview] = useState(false);

  /** Generate the exact PDF the client will receive and open it in a new tab. */
  const handleDownloadPreview = async () => {
    if (!selectedTemplate || (!contactName.trim() && !companyName.trim())) {
      toast({ title: 'Vul eerst een bedrijf of contactpersoon en sjabloon in', variant: 'destructive' });
      return;
    }
    setDownloadingPreview(true);
    try {
      const q = await persistQuote();
      if (!q) return;
      const { data, error } = await supabase.functions.invoke('generate-quote-pdf', {
        body: { quoteId: q.id },
      });
      if (error) throw error;
      const url = (data as any)?.pdfUrl;
      if (url) window.open(url, '_blank');
      toast({ title: 'Voorbeeld gegenereerd', description: 'De offerte is opgeslagen als concept.' });
      navigate(`/quotes/${q.id}`);
    } catch (e: any) {
      toast({ title: 'Fout bij genereren voorbeeld', description: e.message, variant: 'destructive' });
    } finally {
      setDownloadingPreview(false);
    }
  };

  const handleSaveDraft = async () => {
    setSavingDraft(true);
    const q = await persistQuote();
    setSavingDraft(false);
    if (q) {
      toast({ title: 'Concept opgeslagen', description: q.displayNumber });
      navigate(`/quotes/${q.id}`);
    }
  };

  const handleSaveAndSend = async () => {
    setSavingAndSend(true);
    const q = await persistQuote();
    setSavingAndSend(false);
    if (q) {
      setCreatedQuote(q);
      setSendDialogOpen(true);
    }
  };

  const handleSent = () => {
    setSendDialogOpen(false);
    if (createdQuote) navigate(`/quotes/${createdQuote.id}`);
  };

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/quotes')}>
          <ArrowLeft size={18} />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground">Nieuwe offerte</h1>
          <p className="text-sm text-muted-foreground">
            Kies een sjabloon, vul de gegevens aan en verstuur direct naar de klant.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => setPreviewOpen(true)}
            disabled={!selectedTemplate}
            className="gap-1.5"
          >
            <Eye size={14} />
            Voorbeeld
          </Button>
          <Button
            variant="outline"
            onClick={handleDownloadPreview}
            disabled={downloadingPreview || savingDraft || savingAndSend || !selectedTemplate}
            className="gap-1.5"
          >
            {downloadingPreview ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Download voorbeeld-PDF
          </Button>
          <Button
            variant="outline"
            onClick={handleSaveDraft}
            disabled={savingDraft || savingAndSend || !selectedTemplate}
            className="gap-1.5"
          >
            {savingDraft ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Opslaan als concept
          </Button>
          <Button
            onClick={handleSaveAndSend}
            disabled={savingDraft || savingAndSend || !selectedTemplate}
            className="gap-1.5"
          >
            {savingAndSend ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
            Verstuur naar klant
          </Button>
        </div>
      </div>

      {/* Template selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <LayoutTemplate size={16} className="text-primary" /> Sjabloon
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {tLoading ? (
            <p className="text-sm text-muted-foreground">Sjablonen laden…</p>
          ) : templates.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-center space-y-2">
              <p className="text-sm text-muted-foreground">Nog geen sjablonen aangemaakt.</p>
              <Button variant="outline" size="sm" onClick={() => navigate('/templates/new')}>
                Sjabloon aanmaken
              </Button>
            </div>
          ) : (
            <>
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Kies een sjabloon" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <div className="flex items-center gap-2">
                        <span>{t.name}</span>
                        {t.isDefault && <Badge variant="secondary" className="text-xs">Standaard</Badge>}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedTemplate && (() => {
                const cb = selectedTemplate.contentBlocks as any;
                const hasPdf = !!(cb?.pdfUrl || cb?.pdfBackgroundUrl || cb?.editorPdfUrl);
                return (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {hasPdf ? (
                    <>
                      <FileText size={12} className="text-primary" />
                      Sjabloon-PDF wordt als bijlage gebruikt
                      {selectedTemplate.overlayFields && selectedTemplate.overlayFields.length > 0 &&
                        ` · ${selectedTemplate.overlayFields.length} velden worden ingevuld`}
                    </>
                  ) : (
                    <span>Geen PDF in sjabloon — er wordt een gegenereerde PDF gebruikt</span>
                  )}
                </div>
                );
              })()}
            </>
          )}
        </CardContent>
      </Card>

      {/* Klant + offerte info */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Klant &amp; offerte</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Bedrijf</Label>
              <CompanySelector
                value={companyId}
                onChange={(id, name, full) => {
                  setCompanyId(id || '');
                  setCompanyName(name || '');
                  // Reset contact selection if it doesn't belong to the new company
                  if (id && contactId) {
                    const c = contacts.find((x) => x.id === contactId);
                    if (c?.company_id !== id) setContactId('');
                  }
                  if (full) {
                    const addr = [full.address, [full.postcode, full.city].filter(Boolean).join(' ')]
                      .filter(Boolean).join(', ');
                    if (addr) setClientAddress(addr);
                    setCompanies((prev) => (prev.some((p) => p.id === full.id) ? prev : [...prev, full]));
                  }
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Contactpersoon {companyId && <span className="text-primary">· gefilterd op bedrijf</span>}
              </Label>
              <ContactSelector
                value={contactId}
                filterCompanyId={companyId || undefined}
                onChange={(id, name, coId, coName, email) => {
                  setContactId(id);
                  if (name) setContactName(name);
                  if (email) setClientEmail(email);
                  // Auto-fill company only when none is chosen yet
                  if (!companyId && coId) {
                    setCompanyId(coId);
                    if (coName) setCompanyName(coName);
                  }
                }}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Contactnaam</Label>
              <Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Volledige naam" />
            </div>
            <div className="space-y-1.5">
              <Label>E-mail klant</Label>
              <Input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="naam@bedrijf.nl" />
            </div>
            <div className="space-y-1.5">
              <Label>Bedrijfsnaam</Label>
              <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Optioneel" />
            </div>
            <div className="space-y-1.5">
              <Label>Adres</Label>
              <Input value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} placeholder="Straat, postcode, plaats" />
            </div>
            <div className="space-y-1.5">
              <Label>Titel</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Geldig tot</Label>
              <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Line items (only if no product-list block) */}
      {blockLineItems.length === 0 && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Producten &amp; diensten</CardTitle></CardHeader>
          <CardContent>
            <LineItemsEditor items={manualLineItems} onChange={setManualLineItems} />
          </CardContent>
        </Card>
      )}

      {/* Totaalwaarde overzicht */}
      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {effectiveLineItems.length} {effectiveLineItems.length === 1 ? 'regelitem' : 'regelitems'}
            {blockLineItems.length > 0 && ' (uit sjabloon)'}
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Totaal incl. BTW</p>
            <p className="text-2xl font-bold text-primary">
              {new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(fin.total)}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Footer hints */}
      <p className="text-xs text-muted-foreground text-center">
        Bij <strong>Verstuur naar klant</strong> wordt de offerte aangemaakt en meteen via e-mail verzonden met de sjabloon-PDF als bijlage.
      </p>

      {/* Send dialog */}
      {createdQuote && (
        <SendQuoteDialog
          open={sendDialogOpen}
          onOpenChange={(o) => {
            setSendDialogOpen(o);
            if (!o && createdQuote) navigate(`/quotes/${createdQuote.id}`);
          }}
          quote={createdQuote}
          onSent={handleSent}
        />
      )}

      {/* Preview dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">
          <div className="sticky top-0 z-10 bg-background border-b px-6 py-3">
            <DialogTitle className="text-lg font-bold">{title || 'Offerte'}</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Voorbeeld · zo ziet de klant het document
            </p>
          </div>
          <div className="bg-muted/30 p-6 space-y-6">
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
                  {contactName && (
                    <div>
                      <span className="text-muted-foreground">Voor:</span>{' '}
                      <span className="font-medium text-foreground">{contactName}</span>
                    </div>
                  )}
                  {companyName && (
                    <div>
                      <span className="text-muted-foreground">Bedrijf:</span>{' '}
                      <span className="font-medium text-foreground">{companyName}</span>
                    </div>
                  )}
                  {clientEmail && (
                    <div>
                      <span className="text-muted-foreground">E-mail:</span>{' '}
                      <span className="text-foreground">{clientEmail}</span>
                    </div>
                  )}
                  {validUntil && (
                    <div>
                      <span className="text-muted-foreground">Geldig tot:</span>{' '}
                      <span className="text-foreground">
                        {format(new Date(validUntil), 'dd MMMM yyyy', { locale: nl })}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <TemplatePreview
              pdfUrl={(selectedTemplate?.contentBlocks as any)?.pdfUrl || null}
              pdfBackgroundUrl={(selectedTemplate?.contentBlocks as any)?.pdfBackgroundUrl || null}
              editorPdfUrl={(selectedTemplate?.contentBlocks as any)?.editorPdfUrl || null}
              blocks={resolvedBlocks}
              lineItems={effectiveLineItems}
              totals={fin}
            />

            {selectedTemplate?.termsAndConditions && (
              <Card>
                <CardContent className="pt-6">
                  <h3 className="text-sm font-semibold text-foreground mb-2">Algemene voorwaarden</h3>
                  <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                    {selectedTemplate.termsAndConditions}
                  </p>
                </CardContent>
              </Card>
            )}

            <Card className="opacity-60">
              <CardContent className="pt-6 space-y-3">
                <h3 className="text-base font-semibold text-foreground">Uw akkoord</h3>
                <p className="text-sm text-muted-foreground">
                  Door akkoord te gaan bevestigt u de inhoud van dit document.
                </p>
                <div className="flex gap-3 pt-1">
                  <Button disabled>Akkoord</Button>
                  <Button variant="outline" disabled>Niet akkoord</Button>
                </div>
                <p className="text-xs text-muted-foreground italic">
                  (Voorbeeld — knoppen werken niet)
                </p>
              </CardContent>
            </Card>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
