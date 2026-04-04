import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PdfEditor } from '@/components/pdf-editor';
import type { PdfAnnotation } from '@/components/pdf-editor/types';
import { useQuotes } from '@/hooks/useQuotes';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

export default function PdfEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getQuoteWithItems, updateQuote } = useQuotes();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<PdfAnnotation[]>([]);
  const [title, setTitle] = useState('');

  useEffect(() => {
    if (!id) return;
    (async () => {
      const q = await getQuoteWithItems(id);
      if (q) {
        setTitle(q.displayNumber + ' — ' + q.title);
        setPdfUrl(q.pdfUrl || null);
        // Load annotations from overlay_fields JSON
        const raw = q.overlayFields as any;
        if (raw?.annotations) {
          setAnnotations(raw.annotations);
        }
      }
      setLoading(false);
    })();
  }, [id]);

  const handleSave = async () => {
    if (!id || saving) return;
    setSaving(true);
    const ok = await updateQuote(id, {
      pdfUrl,
      overlayFields: { annotations } as any,
    });
    if (ok) {
      toast({ title: 'PDF-annotaties opgeslagen' });
    }
    setSaving(false);
  };

  const handlePdfUpload = async (url: string) => {
    setPdfUrl(url);
    if (id) {
      await updateQuote(id, { pdfUrl: url });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="animate-spin text-muted-foreground" size={32} />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/quotes/${id}`)}>
          <ArrowLeft size={18} />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-foreground truncate">PDF Bewerken</h1>
          <p className="text-sm text-muted-foreground truncate">{title}</p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-1.5">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? 'Opslaan...' : 'Opslaan'}
        </Button>
      </div>

      {/* Editor */}
      <PdfEditor
        pdfUrl={pdfUrl}
        annotations={annotations}
        onAnnotationsChange={setAnnotations}
        onPdfUpload={handlePdfUpload}
      />
    </div>
  );
}
