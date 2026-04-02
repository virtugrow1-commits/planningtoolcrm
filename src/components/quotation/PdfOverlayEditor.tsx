import { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, Plus, Trash2, Type, GripVertical, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import * as pdfjsLib from 'pdfjs-dist';

// Configure pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

export interface OverlayField {
  id: string;
  label: string;
  value: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  color: string;
}

interface PdfOverlayEditorProps {
  pdfUrl: string | null;
  overlayFields: OverlayField[];
  onPdfUpload: (url: string) => void;
  onFieldsChange: (fields: OverlayField[]) => void;
  readOnly?: boolean;
}

const MERGE_TAGS = [
  { label: 'Klantnaam', value: '{{client_name}}' },
  { label: 'Bedrijfsnaam', value: '{{company_name}}' },
  { label: 'E-mail', value: '{{client_email}}' },
  { label: 'Adres', value: '{{client_address}}' },
  { label: 'Offerte nummer', value: '{{quote_number}}' },
  { label: 'Datum', value: '{{date}}' },
  { label: 'Geldig tot', value: '{{valid_until}}' },
  { label: 'Subtotaal', value: '{{subtotal}}' },
  { label: 'BTW', value: '{{vat_amount}}' },
  { label: 'Totaal', value: '{{total}}' },
];

export default function PdfOverlayEditor({
  pdfUrl,
  overlayFields,
  onPdfUpload,
  onFieldsChange,
  readOnly = false,
}: PdfOverlayEditorProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [pages, setPages] = useState<HTMLCanvasElement[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ fieldId: string; offsetX: number; offsetY: number } | null>(null);
  const [resizing, setResizing] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerScale, setContainerScale] = useState(1);
  const [pdfDimensions, setPdfDimensions] = useState<{ width: number; height: number }>({ width: 595, height: 842 });

  // Render PDF pages
  useEffect(() => {
    if (!pdfUrl) return;

    const loadPdf = async () => {
      try {
        const pdf = await pdfjsLib.getDocument(pdfUrl).promise;
        setTotalPages(pdf.numPages);
        const renderedPages: HTMLCanvasElement[] = [];

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d')!;
          await page.render({ canvasContext: ctx, viewport }).promise;
          renderedPages.push(canvas);

          if (i === 1) {
            setPdfDimensions({ width: viewport.width, height: viewport.height });
          }
        }

        setPages(renderedPages);
      } catch (err) {
        console.error('PDF load error:', err);
        toast({ title: 'Fout bij laden PDF', variant: 'destructive' });
      }
    };

    loadPdf();
  }, [pdfUrl]);

  // Calculate scale when container resizes
  useEffect(() => {
    if (!containerRef.current || pages.length === 0) return;

    const updateScale = () => {
      const containerWidth = containerRef.current?.clientWidth || 600;
      const scale = containerWidth / pdfDimensions.width;
      setContainerScale(scale);
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [pages, pdfDimensions.width]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.type !== 'application/pdf') {
      toast({ title: 'Alleen PDF-bestanden zijn toegestaan', variant: 'destructive' });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: 'Bestand is te groot (max 10MB)', variant: 'destructive' });
      return;
    }

    setUploading(true);
    const filePath = `${user.id}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from('quote-pdfs').upload(filePath, file);

    if (error) {
      toast({ title: 'Upload mislukt', description: error.message, variant: 'destructive' });
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from('quote-pdfs').getPublicUrl(filePath);
    onPdfUpload(urlData.publicUrl);
    setUploading(false);
    toast({ title: 'PDF geüpload' });
  };

  const addField = (mergeTag?: { label: string; value: string }) => {
    const newField: OverlayField = {
      id: `field-${Date.now()}`,
      label: mergeTag?.label || 'Nieuw veld',
      value: mergeTag?.value || '',
      x: 50,
      y: 50 + overlayFields.filter((f) => f.page === currentPage).length * 40,
      width: 200,
      height: 30,
      page: currentPage,
      fontSize: 14,
      fontWeight: 'normal',
      color: '#000000',
    };
    onFieldsChange([...overlayFields, newField]);
    setSelectedFieldId(newField.id);
  };

  const updateField = (id: string, updates: Partial<OverlayField>) => {
    onFieldsChange(overlayFields.map((f) => (f.id === id ? { ...f, ...updates } : f)));
  };

  const removeField = (id: string) => {
    onFieldsChange(overlayFields.filter((f) => f.id !== id));
    if (selectedFieldId === id) setSelectedFieldId(null);
  };

  const handleMouseDown = (e: React.MouseEvent, fieldId: string) => {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const field = overlayFields.find((f) => f.id === fieldId);
    if (!field) return;

    setDragging({
      fieldId,
      offsetX: (e.clientX - rect.left) / containerScale - field.x,
      offsetY: (e.clientY - rect.top) / containerScale - field.y,
    });
    setSelectedFieldId(fieldId);
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragging || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = Math.max(0, (e.clientX - rect.left) / containerScale - dragging.offsetX);
      const y = Math.max(0, (e.clientY - rect.top) / containerScale - dragging.offsetY);
      updateField(dragging.fieldId, {
        x: Math.round(x),
        y: Math.round(y),
      });
    },
    [dragging, containerScale]
  );

  const handleMouseUp = useCallback(() => {
    setDragging(null);
    setResizing(null);
  }, []);

  useEffect(() => {
    if (dragging || resizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragging, resizing, handleMouseMove, handleMouseUp]);

  const currentPageFields = overlayFields.filter((f) => f.page === currentPage);
  const selectedField = overlayFields.find((f) => f.id === selectedFieldId);

  if (!pdfUrl) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">PDF Template</CardTitle>
        </CardHeader>
        <CardContent>
          <label
            className="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-muted-foreground/25 rounded-lg cursor-pointer hover:border-primary/50 transition-colors"
          >
            <Upload size={32} className="text-muted-foreground" />
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">
                {uploading ? 'Uploaden...' : 'Sleep een PDF hierheen of klik om te uploaden'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Max 10MB · Alleen PDF</p>
            </div>
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handleFileUpload}
              disabled={uploading}
            />
          </label>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      {!readOnly && (
        <Card>
          <CardContent className="p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Plus size={14} /> Merge veld
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2" align="start">
                  <div className="space-y-1">
                    {MERGE_TAGS.map((tag) => (
                      <button
                        key={tag.value}
                        className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent transition-colors"
                        onClick={() => addField(tag)}
                      >
                        {tag.label}
                        <span className="text-xs text-muted-foreground ml-2">{tag.value}</span>
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              <Button variant="outline" size="sm" onClick={() => addField()} className="gap-1.5">
                <Type size={14} /> Vrij tekstveld
              </Button>

              <div className="ml-auto flex items-center gap-2">
                <label className="text-xs text-muted-foreground cursor-pointer">
                  <span className="underline">Andere PDF uploaden</span>
                  <input
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={handleFileUpload}
                    disabled={uploading}
                  />
                </label>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
        {/* PDF Canvas with overlay fields */}
        <Card className="overflow-hidden">
          {/* Page navigation */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 py-2 border-b bg-muted/30">
              <Button
                variant="ghost"
                size="sm"
                disabled={currentPage === 0}
                onClick={() => setCurrentPage((p) => p - 1)}
              >
                ←
              </Button>
              <span className="text-sm text-muted-foreground">
                Pagina {currentPage + 1} van {totalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={currentPage >= totalPages - 1}
                onClick={() => setCurrentPage((p) => p + 1)}
              >
                →
              </Button>
            </div>
          )}

          <div
            ref={containerRef}
            className="relative bg-muted/10 overflow-hidden"
            style={{
              height: pdfDimensions.height * containerScale,
            }}
            onClick={() => setSelectedFieldId(null)}
          >
            {/* Rendered PDF page */}
            {pages[currentPage] && (
              <img
                src={pages[currentPage].toDataURL()}
                alt={`Pagina ${currentPage + 1}`}
                className="w-full h-auto pointer-events-none select-none"
                draggable={false}
              />
            )}

            {/* Overlay fields */}
            {currentPageFields.map((field) => (
              <div
                key={field.id}
                className={`absolute group ${
                  readOnly ? '' : 'cursor-move'
                } ${selectedFieldId === field.id ? 'ring-2 ring-primary' : 'ring-1 ring-primary/30 hover:ring-primary/60'}`}
                style={{
                  left: field.x * containerScale,
                  top: field.y * containerScale,
                  width: field.width * containerScale,
                  height: field.height * containerScale,
                  fontSize: field.fontSize * containerScale,
                  fontWeight: field.fontWeight,
                  color: field.color,
                  backgroundColor:
                    selectedFieldId === field.id ? 'rgba(59, 130, 246, 0.08)' : 'rgba(59, 130, 246, 0.04)',
                }}
                onMouseDown={(e) => handleMouseDown(e, field.id)}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedFieldId(field.id);
                }}
              >
                <div className="w-full h-full flex items-center px-1 truncate">
                  {field.value || field.label}
                </div>
                {!readOnly && selectedFieldId === field.id && (
                  <button
                    className="absolute -top-2 -right-2 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center text-xs hover:scale-110 transition-transform"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeField(field.id);
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* Field properties panel */}
        {!readOnly && (
          <div className="space-y-3">
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm">Velden op pagina {currentPage + 1}</CardTitle>
              </CardHeader>
              <CardContent className="p-2 space-y-1 max-h-[200px] overflow-y-auto">
                {currentPageFields.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-3">
                    Nog geen velden. Voeg een merge veld of vrij tekstveld toe.
                  </p>
                ) : (
                  currentPageFields.map((field) => (
                    <div
                      key={field.id}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm cursor-pointer transition-colors ${
                        selectedFieldId === field.id ? 'bg-primary/10 text-primary' : 'hover:bg-accent'
                      }`}
                      onClick={() => setSelectedFieldId(field.id)}
                    >
                      <GripVertical size={12} className="text-muted-foreground" />
                      <span className="flex-1 truncate">{field.label}</span>
                      <button
                        className="text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeField(field.id);
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Selected field properties */}
            {selectedField && (
              <Card>
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm flex items-center gap-1.5">
                    <Settings2 size={14} /> Veldinstellingen
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Label</Label>
                    <Input
                      value={selectedField.label}
                      onChange={(e) => updateField(selectedField.id, { label: e.target.value })}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">
                      Waarde <span className="text-muted-foreground">(of merge tag)</span>
                    </Label>
                    <Input
                      value={selectedField.value}
                      onChange={(e) => updateField(selectedField.id, { value: e.target.value })}
                      className="h-8 text-sm"
                      placeholder="{{client_name}} of vrije tekst"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Lettergrootte</Label>
                      <Input
                        type="number"
                        value={selectedField.fontSize}
                        onChange={(e) => updateField(selectedField.id, { fontSize: Number(e.target.value) || 14 })}
                        className="h-8 text-sm"
                        min={8}
                        max={72}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Gewicht</Label>
                      <Select
                        value={selectedField.fontWeight}
                        onValueChange={(v) => updateField(selectedField.id, { fontWeight: v as 'normal' | 'bold' })}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="normal">Normaal</SelectItem>
                          <SelectItem value="bold">Vet</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Breedte</Label>
                      <Input
                        type="number"
                        value={selectedField.width}
                        onChange={(e) => updateField(selectedField.id, { width: Number(e.target.value) || 100 })}
                        className="h-8 text-sm"
                        min={50}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Hoogte</Label>
                      <Input
                        type="number"
                        value={selectedField.height}
                        onChange={(e) => updateField(selectedField.id, { height: Number(e.target.value) || 30 })}
                        className="h-8 text-sm"
                        min={20}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Kleur</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={selectedField.color}
                        onChange={(e) => updateField(selectedField.id, { color: e.target.value })}
                        className="w-8 h-8 rounded border cursor-pointer"
                      />
                      <Input
                        value={selectedField.color}
                        onChange={(e) => updateField(selectedField.id, { color: e.target.value })}
                        className="h-8 text-sm flex-1"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
