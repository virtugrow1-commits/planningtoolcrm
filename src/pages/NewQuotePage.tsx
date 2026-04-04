import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, ChevronRight, ChevronLeft, User, Building2, LayoutTemplate } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useQuotes } from '@/hooks/useQuotes';
import { useQuoteTemplates } from '@/hooks/useQuoteTemplates';
import { calcFinancials } from '@/types/quotation';
import type { LineItem } from '@/types/quotation';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { resolveBlocksMergeTags } from '@/lib/mergeTags';
import type { MergeTagData } from '@/lib/mergeTags';
import DocumentViewer from '@/components/quotation/DocumentViewer';
import LineItemsEditor from '@/components/quotation/LineItemsEditor';

type Step = 'template' | 'contact' | 'document';

export default function NewQuotePage() {
  const navigate = useNavigate();
  const { createQuote } = useQuotes();
  const { templates, loading: tLoading } = useQuoteTemplates();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>('template');
  const [saving, setSaving] = useState(false);

  // Step 1: template
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  // Step 2: contact
  const [contacts, setContacts] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [selectedContact, setSelectedContact] = useState<any | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<any | null>(null);

  // Step 3: document
  const [title, setTitle] = useState('Offerte');
  const [validUntil, setValidUntil] = useState('');
  const [resolvedBlocks, setResolvedBlocks] = useState<any[]>([]);
  const [manualLineItems, setManualLineItems] = useState<LineItem[]>([]);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  // Load contacts for step 2
  useEffect(() => {
    if (step !== 'contact') return;
    supabase
      .from('contacts')
      .select('id, first_name, last_name, email, phone, job_title, department, company_id')
      .order('last_name')
      .then(({ data }) => setContacts(data || []));
    supabase
      .from('companies')
      .select('id, name, email, phone, address, postcode, city, country, kvk, btw_number, website')
      .order('name')
      .then(({ data }) => setCompanies(data || []));
  }, [step]);

  // Resolve merge tags when entering document step
  useEffect(() => {
    if (step !== 'document' || !selectedTemplate) return;

    const cb = selectedTemplate.contentBlocks as any;
    const rawBlocks: any[] = cb?.blocks || [];

    const mergeData: MergeTagData = {
      contact: selectedContact
        ? {
            name: [selectedContact.first_name, selectedContact.last_name].filter(Boolean).join(' '),
            first_name: selectedContact.first_name,
            last_name: selectedContact.last_name,
            email: selectedContact.email,
            phone: selectedContact.phone,
            job_title: selectedContact.job_title,
            department: selectedContact.department,
          }
        : undefined,
      company: selectedCompany
        ? {
            name: selectedCompany.name,
            email: selectedCompany.email,
            phone: selectedCompany.phone,
            address: selectedCompany.address,
            postcode: selectedCompany.postcode,
            city: selectedCompany.city,
            country: selectedCompany.country,
            kvk: selectedCompany.kvk,
            btw_number: selectedCompany.btw_number,
            website: selectedCompany.website,
          }
        : undefined,
      quote: { title, valid_until: validUntil || undefined },
    };

    setResolvedBlocks(resolveBlocksMergeTags(rawBlocks, mergeData));
  }, [step, selectedTemplate, selectedContact, selectedCompany, title, validUntil]);

  // Auto-load company for selected contact
  useEffect(() => {
    if (!selectedContact?.company_id) {
      setSelectedCompany(null);
      return;
    }
    const co = companies.find((c) => c.id === selectedContact.company_id);
    if (co) setSelectedCompany(co);
  }, [selectedContact, companies]);

  const filteredContacts = contacts.filter((c) => {
    const q = contactSearch.toLowerCase();
    return (
      (c.first_name || '').toLowerCase().includes(q) ||
      (c.last_name || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q)
    );
  });

  const hasProductListBlocks = resolvedBlocks.some((b) => b.type === 'product-list');

  /** Extract line items from product-list blocks or manual items */
  const extractLineItems = (): LineItem[] => {
    if (hasProductListBlocks) {
      const productBlocks = resolvedBlocks.filter((b) => b.type === 'product-list');
      const items: LineItem[] = [];
      let sortOrder = 0;
      for (const block of productBlocks) {
        for (const item of block.items || []) {
          const base = item.quantity * item.unitPrice;
          items.push({
            id: item.id || `li-${sortOrder}`,
            sortOrder: sortOrder++,
            itemName: item.name,
            description: item.description || undefined,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            vatRate: item.vatRate,
            discountPercent: 0,
            lineTotal: base,
          });
        }
      }
      return items;
    }
    return manualLineItems;
  };

  const handleSave = async () => {
    if (!selectedTemplate) {
      toast({ title: 'Selecteer een sjabloon', variant: 'destructive' });
      return;
    }
    if (!selectedContact) {
      toast({ title: 'Selecteer een contactpersoon', variant: 'destructive' });
      return;
    }
    setSaving(true);

    const lineItems = extractLineItems();
    const fin = calcFinancials(lineItems);
    const contactName = [selectedContact.first_name, selectedContact.last_name].filter(Boolean).join(' ');

    const result = await createQuote(
      {
        title,
        templateId: selectedTemplate.id,
        contactId: selectedContact.id,
        companyId: selectedCompany?.id,
        contactName,
        companyName: selectedCompany?.name,
        clientEmail: selectedContact.email,
        clientAddress: [selectedCompany?.address, selectedCompany?.postcode, selectedCompany?.city]
          .filter(Boolean)
          .join(', ') || undefined,
        introduction: undefined,
        termsAndConditions: selectedTemplate.termsAndConditions || undefined,
        validUntil: validUntil || undefined,
        contentBlocks: resolvedBlocks,
        subtotal: fin.subtotal,
        vatAmount: fin.vatAmount,
        discountAmount: fin.discountAmount,
        total: fin.total,
      },
      lineItems
    );

    setSaving(false);
    if (result) {
      toast({ title: 'Offerte aangemaakt', description: `${result.displayNumber} opgeslagen als concept.` });
      navigate(`/quotes/${result.id}`);
    }
  };

  const contactName = selectedContact
    ? [selectedContact.first_name, selectedContact.last_name].filter(Boolean).join(' ')
    : null;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/quotes')}>
          <ArrowLeft size={18} />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground">Nieuwe offerte</h1>
          <p className="text-sm text-muted-foreground">
            {step === 'template' && 'Stap 1 — Kies een sjabloon'}
            {step === 'contact' && 'Stap 2 — Selecteer een contactpersoon'}
            {step === 'document' && 'Stap 3 — Controleer en sla op'}
          </p>
        </div>
        {step === 'document' && (
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            <Save size={16} /> {saving ? 'Opslaan...' : 'Opslaan als concept'}
          </Button>
        )}
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-sm">
        {(['template', 'contact', 'document'] as Step[]).map((s, i) => {
          const labels = { template: 'Sjabloon', contact: 'Contact', document: 'Document' };
          const icons = { template: LayoutTemplate, contact: User, document: Save };
          const Icon = icons[s];
          const isActive = step === s;
          const isDone = ['template', 'contact', 'document'].indexOf(step) > i;
          return (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <ChevronRight size={14} className="text-muted-foreground" />}
              <button
                onClick={() => {
                  if (isDone || (s === 'contact' && selectedTemplateId)) setStep(s);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : isDone
                    ? 'bg-muted text-foreground hover:bg-accent cursor-pointer'
                    : 'text-muted-foreground cursor-default'
                }`}
              >
                <Icon size={12} />
                {labels[s]}
              </button>
            </div>
          );
        })}
      </div>

      {/* ── Step 1: Template ── */}
      {step === 'template' && (
        <div className="space-y-4">
          {tLoading ? (
            <p className="text-muted-foreground text-sm">Laden...</p>
          ) : templates.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <LayoutTemplate size={32} className="mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">Nog geen sjablonen. Maak eerst een sjabloon aan.</p>
                <Button variant="outline" className="mt-4" onClick={() => navigate('/templates/new')}>
                  Sjabloon aanmaken
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((tpl) => (
                <Card
                  key={tpl.id}
                  className={`cursor-pointer transition-all hover:ring-2 hover:ring-primary/30 ${
                    selectedTemplateId === tpl.id ? 'ring-2 ring-primary' : ''
                  }`}
                  onClick={() => setSelectedTemplateId(tpl.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-foreground">{tpl.name}</p>
                        {tpl.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">{tpl.description}</p>
                        )}
                        {tpl.isDefault && (
                          <Badge variant="secondary" className="mt-1.5 text-xs">Standaard</Badge>
                        )}
                      </div>
                      {selectedTemplateId === tpl.id && (
                        <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0">
                          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                            <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          {selectedTemplateId && (
            <div className="flex justify-end">
              <Button onClick={() => setStep('contact')} className="gap-1.5">
                Volgende <ChevronRight size={16} />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── Step 2: Contact ── */}
      {step === 'contact' && (
        <div className="space-y-4">
          <div className="relative max-w-sm">
            <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Zoek op naam of e-mail..."
              value={contactSearch}
              onChange={(e) => setContactSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <Card>
            <div className="divide-y max-h-[400px] overflow-y-auto">
              {filteredContacts.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground text-sm">Geen contacten gevonden</p>
              ) : (
                filteredContacts.map((c) => {
                  const name = [c.first_name, c.last_name].filter(Boolean).join(' ');
                  const company = companies.find((co) => co.id === c.company_id);
                  const isSelected = selectedContact?.id === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelectedContact(c)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/50 transition-colors ${
                        isSelected ? 'bg-accent' : ''
                      }`}
                    >
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <User size={14} className="text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{name}</p>
                        <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                      </div>
                      {company && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Building2 size={12} />
                          <span className="truncate max-w-[120px]">{company.name}</span>
                        </div>
                      )}
                      {isSelected && (
                        <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0">
                          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                            <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </Card>

          <div className="flex gap-3 justify-between">
            <Button variant="outline" onClick={() => setStep('template')} className="gap-1.5">
              <ChevronLeft size={16} /> Terug
            </Button>
            {selectedContact && (
              <Button onClick={() => setStep('document')} className="gap-1.5">
                Volgende <ChevronRight size={16} />
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── Step 3: Document ── */}
      {step === 'document' && (
        <div className="space-y-6">
          {/* Summary bar */}
          <Card>
            <CardContent className="p-4 flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2 text-sm">
                <LayoutTemplate size={14} className="text-muted-foreground" />
                <span className="font-medium">{selectedTemplate?.name}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <User size={14} className="text-muted-foreground" />
                <span className="font-medium">{contactName}</span>
                {selectedCompany && (
                  <span className="text-muted-foreground">· {selectedCompany.name}</span>
                )}
              </div>
              <Button variant="ghost" size="sm" className="ml-auto text-xs gap-1.5" onClick={() => setStep('contact')}>
                <ChevronLeft size={12} /> Wijzigen
              </Button>
            </CardContent>
          </Card>

          {/* Quote metadata */}
          <Card>
            <CardHeader><CardTitle className="text-base">Document instellingen</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Titel</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Geldig tot</Label>
                <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
              </div>
            </CardContent>
          </Card>

          {/* Document preview */}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-3">Voorbeeld document</p>
            {resolvedBlocks.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground text-sm">
                  Dit sjabloon heeft nog geen inhoud. Bewerk het sjabloon eerst.
                </CardContent>
              </Card>
            ) : (
              <DocumentViewer
                blocks={resolvedBlocks}
                pdfBackgroundUrl={(selectedTemplate?.contentBlocks as any)?.pdfBackgroundUrl || null}
              />
            )}
          </div>

          {/* Manual line items — shown when template has no product-list blocks */}
          {resolvedBlocks.length > 0 && !hasProductListBlocks && (
            <Card>
              <CardHeader><CardTitle className="text-base">Producten & Diensten</CardTitle></CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-3">
                  Dit sjabloon bevat geen productlijst. Voeg hier handmatig de regelitems toe voor de facturatie.
                </p>
                <LineItemsEditor items={manualLineItems} onChange={setManualLineItems} />
              </CardContent>
            </Card>
          )}

          <div className="flex gap-3 justify-between">
            <Button variant="outline" onClick={() => setStep('contact')} className="gap-1.5">
              <ChevronLeft size={16} /> Terug
            </Button>
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">
              <Save size={16} /> {saving ? 'Opslaan...' : 'Opslaan als concept'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
