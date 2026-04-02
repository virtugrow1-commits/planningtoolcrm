import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Layout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ContactSelector from '@/components/quotation/ContactSelector';
import LineItemsEditor from '@/components/quotation/LineItemsEditor';
import PdfOverlayEditor from '@/components/quotation/PdfOverlayEditor';
import type { OverlayField } from '@/components/quotation/PdfOverlayEditor';
import { useQuotes } from '@/hooks/useQuotes';
import { useQuoteTemplates } from '@/hooks/useQuoteTemplates';
import { calcFinancials } from '@/types/quotation';
import type { LineItem } from '@/types/quotation';
import { useToast } from '@/hooks/use-toast';

export default function NewQuotePage() {
  const navigate = useNavigate();
  const { createQuote } = useQuotes();
  const { templates } = useQuoteTemplates();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    title: 'Offerte',
    contactId: '',
    contactName: '',
    companyId: '',
    companyName: '',
    clientEmail: '',
    clientAddress: '',
    introduction: '',
    termsAndConditions: '',
    notes: '',
    validUntil: '',
  });

  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [overlayFields, setOverlayFields] = useState<OverlayField[]>([]);

  const handleContactSelect = (
    contactId: string,
    contactName: string,
    companyId?: string,
    companyName?: string,
    email?: string
  ) => {
    setForm((prev) => ({
      ...prev,
      contactId,
      contactName,
      companyId: companyId || '',
      companyName: companyName || '',
      clientEmail: email || prev.clientEmail,
    }));
  };

  const handleSave = async () => {
    if (!form.contactName) {
      toast({ title: 'Vul een contactpersoon in', variant: 'destructive' });
      return;
    }
    if (lineItems.length === 0 && !pdfUrl) {
      toast({ title: 'Voeg minimaal één item toe of upload een PDF', variant: 'destructive' });
      return;
    }

    setSaving(true);
    const fin = calcFinancials(lineItems);

    const result = await createQuote(
      {
        title: form.title,
        contactId: form.contactId || undefined,
        companyId: form.companyId || undefined,
        contactName: form.contactName,
        companyName: form.companyName || undefined,
        clientEmail: form.clientEmail || undefined,
        clientAddress: form.clientAddress || undefined,
        introduction: form.introduction || undefined,
        termsAndConditions: form.termsAndConditions || undefined,
        notes: form.notes || undefined,
        validUntil: form.validUntil || undefined,
        pdfUrl: pdfUrl || undefined,
        overlayFields: overlayFields.length > 0 ? overlayFields : undefined,
        subtotal: fin.subtotal,
        vatAmount: fin.vatAmount,
        discountAmount: fin.discountAmount,
        total: fin.total,
      },
      lineItems
    );

    setSaving(false);
    if (result) {
      toast({ title: 'Offerte aangemaakt', description: `${result.displayNumber} is opgeslagen als concept.` });
      navigate(`/quotes/${result.id}`);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/quotes')}>
          <ArrowLeft size={18} />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground">Nieuwe offerte</h1>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-1.5">
          <Save size={16} /> {saving ? 'Opslaan...' : 'Opslaan als concept'}
        </Button>
      </div>

      {/* Client info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Klantgegevens</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Contactpersoon</Label>
              <ContactSelector value={form.contactId} onChange={handleContactSelect} />
            </div>
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input
                value={form.clientEmail}
                onChange={(e) => setForm((p) => ({ ...p, clientEmail: e.target.value }))}
                placeholder="email@voorbeeld.nl"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Bedrijf</Label>
              <Input value={form.companyName} onChange={(e) => setForm((p) => ({ ...p, companyName: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Adres</Label>
              <Input
                value={form.clientAddress}
                onChange={(e) => setForm((p) => ({ ...p, clientAddress: e.target.value }))}
                placeholder="Straat, Postcode, Plaats"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quote details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Offerte details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Titel</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Geldig tot</Label>
              <Input
                type="date"
                value={form.validUntil}
                onChange={(e) => setForm((p) => ({ ...p, validUntil: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Introductietekst</Label>
            <Textarea
              value={form.introduction}
              onChange={(e) => setForm((p) => ({ ...p, introduction: e.target.value }))}
              placeholder="Optionele inleidende tekst voor de offerte..."
              className="min-h-[80px]"
            />
          </div>
        </CardContent>
      </Card>

      {/* PDF Template Editor */}
      <PdfOverlayEditor
        pdfUrl={pdfUrl}
        overlayFields={overlayFields}
        onPdfUpload={setPdfUrl}
        onFieldsChange={setOverlayFields}
      />

      {/* Line items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Producten & Diensten</CardTitle>
        </CardHeader>
        <CardContent>
          <LineItemsEditor items={lineItems} onChange={setLineItems} />
        </CardContent>
      </Card>

      {/* Notes & Terms */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Voorwaarden & Notities</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Algemene voorwaarden</Label>
            <Textarea
              value={form.termsAndConditions}
              onChange={(e) => setForm((p) => ({ ...p, termsAndConditions: e.target.value }))}
              placeholder="Betalingstermijn, annuleringsbeleid, etc."
              className="min-h-[80px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Interne notities</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              placeholder="Niet zichtbaar voor de klant..."
              className="min-h-[60px]"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
