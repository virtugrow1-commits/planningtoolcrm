import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import BlockEditor from '@/components/template-editor/BlockEditor';
import { useQuoteTemplates } from '@/hooks/useQuoteTemplates';
import { useToast } from '@/hooks/use-toast';
import type { TemplateBlock } from '@/types/templateBlocks';
import type { CustomFont } from '@/components/template-editor/FontPicker';

export default function TemplateEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { templates, createTemplate, updateTemplate, loading } = useQuoteTemplates();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [termsAndConditions, setTermsAndConditions] = useState('');
  const [blocks, setBlocks] = useState<TemplateBlock[]>([]);
  const [pdfBackgroundUrl, setPdfBackgroundUrl] = useState<string | null>(null);
  const [customFonts, setCustomFonts] = useState<CustomFont[]>([]);

  const isEdit = !!id;

  // Load existing template
  useEffect(() => {
    if (!id || loading) return;
    const tpl = templates.find(t => t.id === id);
    if (tpl) {
      setName(tpl.name);
      setDescription(tpl.description || '');
      setTermsAndConditions(tpl.termsAndConditions || '');
      const cb = tpl.contentBlocks as any;
      setBlocks(cb?.blocks || []);
      setPdfBackgroundUrl(cb?.pdfBackgroundUrl || null);
    }
  }, [id, templates, loading]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: 'Geef het sjabloon een naam', variant: 'destructive' });
      return;
    }

    setSaving(true);

    const contentBlocks = { blocks, pdfBackgroundUrl };

    if (isEdit) {
      const ok = await updateTemplate(id!, { name, description, termsAndConditions, contentBlocks });
      if (ok) {
        toast({ title: 'Sjabloon bijgewerkt' });
        navigate('/quotes');
      }
    } else {
      const result = await createTemplate(name, contentBlocks, termsAndConditions, description);
      if (result) {
        toast({ title: 'Sjabloon opgeslagen', description: `"${name}" is beschikbaar bij het aanmaken van offertes.` });
        navigate('/quotes');
      }
    }

    setSaving(false);
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/quotes')}>
          <ArrowLeft size={18} />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground">
            {isEdit ? 'Sjabloon bewerken' : 'Nieuw sjabloon'}
          </h1>
          <p className="text-sm text-muted-foreground">
            Bouw je document op met blokken en sla op als herbruikbaar sjabloon.
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-1.5">
          <Save size={16} /> {saving ? 'Opslaan...' : 'Opslaan'}
        </Button>
      </div>

      {/* Template info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sjabloon gegevens</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Naam *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="bijv. Reserveringsbevestiging"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Beschrijving</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Korte omschrijving van het sjabloon"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Block Editor */}
      <BlockEditor
        blocks={blocks}
        onBlocksChange={setBlocks}
        pdfBackgroundUrl={pdfBackgroundUrl}
        onPdfBackgroundChange={setPdfBackgroundUrl}
      />

      {/* Default terms */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Standaard voorwaarden</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={termsAndConditions}
            onChange={(e) => setTermsAndConditions(e.target.value)}
            placeholder="Voorwaarden die standaard worden ingevuld bij offertes met dit sjabloon..."
            className="min-h-[80px]"
          />
        </CardContent>
      </Card>
    </div>
  );
}
