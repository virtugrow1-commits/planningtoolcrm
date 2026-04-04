import { useState, useRef, useEffect, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import PdfEditorToolbar from './PdfEditorToolbar';
import AnnotationRenderer from './AnnotationRenderer';
import DrawingCanvas from './DrawingCanvas';
import SignaturePad from './SignaturePad';
import type { PdfAnnotation, AnnotationTool } from './types';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

interface PdfEditorProps {
  pdfUrl: string | null;
  annotations: PdfAnnotation[];
  onAnnotationsChange: (annotations: PdfAnnotation[]) => void;
  onPdfUpload?: (url: string) => void;
  readOnly?: boolean;
}

export default function PdfEditor({
  pdfUrl, annotations, onAnnotationsChange, onPdfUpload, readOnly = false,
}: PdfEditorProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [pageImages, setPageImages] = useState<string[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [pdfDimensions, setPdfDimensions] = useState({ width: 595, height: 842 });
  const [pageScales, setPageScales] = useState<number[]>([]);

  // Editor state
  const [activeTool, setActiveTool] = useState<AnnotationTool>('select');
  const [activeColor, setActiveColor] = useState('#000000');
  const [activeStrokeWidth, setActiveStrokeWidth] = useState(2);
  const [activeFontSize, setActiveFontSize] = useState(14);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [signatureTarget, setSignatureTarget] = useState<string | null>(null);

  // Undo/redo
  const [history, setHistory] = useState<PdfAnnotation[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Push to undo stack
  const pushHistory = useCallback((newAnns: PdfAnnotation[]) => {
    setHistory((prev) => {
      const next = [...prev.slice(0, historyIndex + 1), newAnns];
      return next.slice(-50); // max 50 steps
    });
    setHistoryIndex((prev) => Math.min(prev + 1, 49));
    onAnnotationsChange(newAnns);
  }, [historyIndex, onAnnotationsChange]);

  const undo = useCallback(() => {
    if (historyIndex <= 0) return;
    const prev = history[historyIndex - 1];
    setHistoryIndex((i) => i - 1);
    onAnnotationsChange(prev);
  }, [history, historyIndex, onAnnotationsChange]);

  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    const next = history[historyIndex + 1];
    setHistoryIndex((i) => i + 1);
    onAnnotationsChange(next);
  }, [history, historyIndex, onAnnotationsChange]);

  // Init history
  useEffect(() => {
    if (history.length === 0) {
      setHistory([annotations]);
      setHistoryIndex(0);
    }
  }, []);

  // Render PDF pages
  useEffect(() => {
    if (!pdfUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const pdf = await pdfjsLib.getDocument(pdfUrl).promise;
        if (cancelled) return;
        setTotalPages(pdf.numPages);
        const images: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 2 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d')!;
          await page.render({ canvasContext: ctx, viewport }).promise;
          images.push(canvas.toDataURL());
          if (i === 1) setPdfDimensions({ width: viewport.width, height: viewport.height });
        }
        if (!cancelled) setPageImages(images);
      } catch {
        toast({ title: 'Fout bij laden PDF', variant: 'destructive' });
      }
    })();
    return () => { cancelled = true; };
  }, [pdfUrl]);

  // Calculate scales
  useEffect(() => {
    if (pageImages.length === 0) return;
    const updateScales = () => {
      const scales = pageRefs.current.map((ref) => (ref ? ref.clientWidth / pdfDimensions.width : 1));
      setPageScales(scales);
    };
    updateScales();
    const observer = new ResizeObserver(updateScales);
    pageRefs.current.forEach((ref) => ref && observer.observe(ref));
    return () => observer.disconnect();
  }, [pageImages, pdfDimensions.width]);

  const generateId = () => `ann-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const updateAnnotation = useCallback((id: string, updates: Partial<PdfAnnotation>) => {
    const newAnns = annotations.map((a) => (a.id === id ? { ...a, ...updates } : a));
    pushHistory(newAnns);
  }, [annotations, pushHistory]);

  const deleteAnnotation = useCallback((id: string) => {
    const newAnns = annotations.filter((a) => a.id !== id);
    pushHistory(newAnns);
    if (selectedId === id) setSelectedId(null);
  }, [annotations, pushHistory, selectedId]);

  const handlePageClick = useCallback((e: React.MouseEvent, pageIndex: number) => {
    if (readOnly) return;
    const pageRef = pageRefs.current[pageIndex];
    if (!pageRef) return;
    const rect = pageRef.getBoundingClientRect();
    const scale = pageScales[pageIndex] || 1;
    const x = Math.round((e.clientX - rect.left) / scale);
    const y = Math.round((e.clientY - rect.top) / scale);

    if (activeTool === 'text') {
      const ann: PdfAnnotation = {
        id: generateId(), type: 'text', page: pageIndex,
        x, y, width: 200, height: 30,
        content: '', fontSize: activeFontSize, fontWeight: 'normal',
        fontStyle: 'normal', color: activeColor, textAlign: 'left',
      };
      pushHistory([...annotations, ann]);
      setSelectedId(ann.id);
      setActiveTool('select');
    } else if (activeTool === 'sticky') {
      const ann: PdfAnnotation = {
        id: generateId(), type: 'sticky', page: pageIndex,
        x, y, width: 180, height: 120,
        content: '', fontSize: 12, stickyColor: '#FEF08A',
      };
      pushHistory([...annotations, ann]);
      setSelectedId(ann.id);
      setActiveTool('select');
    } else if (activeTool === 'signature') {
      const ann: PdfAnnotation = {
        id: generateId(), type: 'signature', page: pageIndex,
        x, y, width: 200, height: 80,
      };
      pushHistory([...annotations, ann]);
      setSignatureTarget(ann.id);
      setActiveTool('select');
    } else if (activeTool === 'checkbox') {
      const ann: PdfAnnotation = {
        id: generateId(), type: 'checkbox', page: pageIndex,
        x, y, width: 160, height: 24,
        checked: false, label: 'Akkoord', fontSize: 13,
      };
      pushHistory([...annotations, ann]);
      setSelectedId(ann.id);
      setActiveTool('select');
    } else if (activeTool === 'select') {
      setSelectedId(null);
    }
  }, [activeTool, activeColor, activeFontSize, annotations, pageScales, pushHistory, readOnly]);

  const handleStrokeComplete = useCallback((ann: Omit<PdfAnnotation, 'id'>) => {
    pushHistory([...annotations, { ...ann, id: generateId() }]);
  }, [annotations, pushHistory]);

  const handleEraseAt = useCallback((x: number, y: number) => {
    const threshold = 15;
    const toRemove = annotations.filter((a) => {
      if (a.type !== 'draw' && a.type !== 'highlight') return false;
      if (!a.path) return false;
      return a.path.some((p) => Math.abs(p.x - x) < threshold && Math.abs(p.y - y) < threshold);
    });
    if (toRemove.length > 0) {
      pushHistory(annotations.filter((a) => !toRemove.includes(a)));
    }
  }, [annotations, pushHistory]);

  const handleSignatureSave = (dataUrl: string) => {
    if (signatureTarget) {
      updateAnnotation(signatureTarget, { signatureDataUrl: dataUrl });
    }
    setSignatureTarget(null);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !onPdfUpload) return;
    if (file.type !== 'application/pdf') { toast({ title: 'Alleen PDF-bestanden', variant: 'destructive' }); return; }
    if (file.size > 25 * 1024 * 1024) { toast({ title: 'Max 25MB', variant: 'destructive' }); return; }
    setUploading(true);
    const filePath = `${user.id}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from('quote-pdfs').upload(filePath, file);
    if (error) { toast({ title: 'Upload mislukt', variant: 'destructive' }); setUploading(false); return; }
    const { data: urlData } = supabase.storage.from('quote-pdfs').getPublicUrl(filePath);
    onPdfUpload(urlData.publicUrl);
    setUploading(false);
  };

  const selectedAnnotation = annotations.find((a) => a.id === selectedId) || null;
  const drawTool = (activeTool === 'draw' || activeTool === 'highlight' || activeTool === 'eraser') ? activeTool : null;

  // Upload prompt
  if (!pdfUrl) {
    return (
      <Card>
        <div className="p-8">
          <label className="flex flex-col items-center justify-center gap-3 p-12 border-2 border-dashed border-muted-foreground/25 rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
            {uploading ? <Loader2 size={32} className="text-muted-foreground animate-spin" /> : <Upload size={32} className="text-muted-foreground" />}
            <div className="text-center">
              <p className="text-sm font-medium">{uploading ? 'Uploaden...' : 'Upload een PDF om te bewerken'}</p>
              <p className="text-xs text-muted-foreground mt-1">Max 25MB · Sleep tekst, markeringen en handtekeningen op de PDF</p>
            </div>
            <input type="file" accept="application/pdf" className="hidden" onChange={handleFileUpload} disabled={uploading} />
          </label>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      {!readOnly && (
        <PdfEditorToolbar
          activeTool={activeTool}
          activeColor={activeColor}
          activeStrokeWidth={activeStrokeWidth}
          activeFontSize={activeFontSize}
          selectedAnnotation={selectedAnnotation}
          onToolChange={setActiveTool}
          onColorChange={setActiveColor}
          onStrokeWidthChange={setActiveStrokeWidth}
          onFontSizeChange={setActiveFontSize}
          onAnnotationUpdate={updateAnnotation}
          onDeleteSelected={() => selectedId && deleteAnnotation(selectedId)}
          onUndo={undo}
          onRedo={redo}
          canUndo={historyIndex > 0}
          canRedo={historyIndex < history.length - 1}
        />
      )}

      {/* PDF pages */}
      <div className="space-y-4 max-w-[900px] mx-auto">
        {pageImages.map((imgSrc, pageIndex) => {
          const scale = pageScales[pageIndex] || 1;
          const pageAnns = annotations.filter((a) => a.page === pageIndex && a.type !== 'draw' && a.type !== 'highlight');

          return (
            <Card key={pageIndex} className="overflow-hidden">
              {totalPages > 1 && (
                <div className="px-3 py-1.5 text-xs text-muted-foreground bg-muted/30 border-b">
                  Pagina {pageIndex + 1} van {totalPages}
                </div>
              )}
              <div
                ref={(el) => { pageRefs.current[pageIndex] = el; }}
                className="relative select-none"
                style={{ height: pdfDimensions.height * scale }}
                onClick={(e) => handlePageClick(e, pageIndex)}
              >
                <img src={imgSrc} alt={`Pagina ${pageIndex + 1}`} className="w-full h-auto pointer-events-none" draggable={false} />

                {/* Drawing canvas */}
                <DrawingCanvas
                  width={pdfDimensions.width * scale}
                  height={pdfDimensions.height * scale}
                  annotations={annotations}
                  scale={scale}
                  activeTool={drawTool}
                  activeColor={activeColor}
                  activeStrokeWidth={activeStrokeWidth}
                  onStrokeComplete={handleStrokeComplete}
                  onEraseAt={handleEraseAt}
                  pageIndex={pageIndex}
                />

                {/* Annotation overlays */}
                {pageAnns.map((ann) => (
                  <AnnotationRenderer
                    key={ann.id}
                    annotation={ann}
                    scale={scale}
                    selected={selectedId === ann.id}
                    onSelect={() => setSelectedId(ann.id)}
                    onUpdate={(updates) => updateAnnotation(ann.id, updates)}
                    onDelete={() => deleteAnnotation(ann.id)}
                    readOnly={readOnly}
                  />
                ))}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Signature dialog */}
      <SignaturePad
        open={!!signatureTarget}
        onClose={() => setSignatureTarget(null)}
        onSave={handleSignatureSave}
      />

      {/* Replace PDF */}
      {!readOnly && onPdfUpload && (
        <div className="text-center">
          <label className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors underline">
            Andere PDF uploaden
            <input type="file" accept="application/pdf" className="hidden" onChange={handleFileUpload} disabled={uploading} />
          </label>
        </div>
      )}
    </div>
  );
}
