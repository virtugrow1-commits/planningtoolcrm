import { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, Plus, Trash2, Type, GripVertical, Settings2, ChevronDown, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import * as pdfjsLib from 'pdfjs-dist';

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
  fontFamily?: string;
}

interface PdfOverlayEditorProps {
  pdfUrl: string | null;
  overlayFields: OverlayField[];
  onPdfUpload: (url: string) => void;
  onFieldsChange: (fields: OverlayField[]) => void;
  readOnly?: boolean;
}

const MERGE_TAGS = [
  { group: 'Contact', items: [
    { label: 'Klantnaam', value: '{{contact.name}}' },
    { label: 'Voornaam', value: '{{contact.first_name}}' },
    { label: 'Achternaam', value: '{{contact.last_name}}' },
    { label: 'E-mail', value: '{{contact.email}}' },
    { label: 'Telefoon', value: '{{contact.phone}}' },
    { label: 'Functie', value: '{{contact.job_title}}' },
  ]},
  { group: 'Bedrijf', items: [
    { label: 'Bedrijfsnaam', value: '{{company.name}}' },
    { label: 'Bedrijf adres', value: '{{company.address}}' },
    { label: 'Bedrijf postcode', value: '{{company.postcode}}' },
    { label: 'Bedrijf plaats', value: '{{company.city}}' },
    { label: 'KVK nummer', value: '{{company.kvk}}' },
    { label: 'BTW nummer', value: '{{company.btw_number}}' },
  ]},
  { group: 'Offerte', items: [
    { label: 'Offerte nummer', value: '{{quote.number}}' },
    { label: 'Offerte titel', value: '{{quote.title}}' },
    { label: 'Datum', value: '{{quote.date}}' },
    { label: 'Geldig tot', value: '{{quote.valid_until}}' },
    { label: 'Subtotaal', value: '{{quote.subtotal}}' },
    { label: 'BTW bedrag', value: '{{quote.vat_amount}}' },
    { label: 'Totaal', value: '{{quote.total}}' },
  ]},
  { group: 'Reservering', items: [
    { label: 'Reserveringsnummer', value: '{{booking.number}}' },
    { label: 'Evenement', value: '{{booking.title}}' },
    { label: 'Datum', value: '{{booking.date}}' },
    { label: 'Starttijd', value: '{{booking.start_time}}' },
    { label: 'Eindtijd', value: '{{booking.end_time}}' },
    { label: 'Zaal', value: '{{booking.room}}' },
    { label: 'Aantal gasten', value: '{{booking.guest_count}}' },
  ]},
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
  const [pageImages, setPageImages] = useState<string[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ fieldId: string; offsetX: number; offsetY: number; pageIndex: number } | null>(null);
  const [resizing, setResizing] = useState<{ fieldId: string; startX: number; startY: number; startW: number; startH: number } | null>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [pageScales, setPageScales] = useState<number[]>([]);
  const [pdfDimensions, setPdfDimensions] = useState({ width: 595, height: 842 });

  // Render all PDF pages
  useEffect(() => {
    if (!pdfUrl) return;
    (async () => {
      try {
        const pdf = await pdfjsLib.getDocument(pdfUrl).promise;
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
        setPageImages(images);
      } catch {
        toast({ title: 'Fout bij laden PDF', variant: 'destructive' });
      }
    })();
  }, [pdfUrl]);

  // Calculate scales for each page container
  useEffect(() => {
    if (pageImages.length === 0) return;
    const updateScales = () => {
      const scales = pageRefs.current.map((ref) => {
        if (!ref) return 1;
        return ref.clientWidth / pdfDimensions.width;
      });
      setPageScales(scales);
    };
    updateScales();
    const observer = new ResizeObserver(updateScales);
    pageRefs.current.forEach((ref) => ref && observer.observe(ref));
    return () => observer.disconnect();
  }, [pageImages, pdfDimensions.width]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.type !== 'application/pdf') { toast({ title: 'Alleen PDF-bestanden', variant: 'destructive' }); return; }
    if (file.size > 50 * 1024 * 1024) { toast({ title: 'Max 50MB', variant: 'destructive' }); return; }

    setUploading(true);
    const filePath = `${user.id}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from('quote-pdfs').upload(filePath, file);
    if (error) { toast({ title: 'Upload mislukt', description: error.message, variant: 'destructive' }); setUploading(false); return; }

    const { data: urlData } = supabase.storage.from('quote-pdfs').getPublicUrl(filePath);
    onPdfUpload(urlData.publicUrl);
    setUploading(false);
    toast({ title: 'PDF geüpload' });
  };

  const addField = (mergeTag?: { label: string; value: string }, pageIndex = 0) => {
    const newField: OverlayField = {
      id: `field-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label: mergeTag?.label || 'Vrij tekstveld',
      value: mergeTag?.value || '',
      x: 50, y: 50 + overlayFields.filter((f) => f.page === pageIndex).length * 40,
      width: 200, height: 30,
      page: pageIndex,
      fontSize: 14, fontWeight: 'normal', color: '#000000',
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

  // Drag handling
  const handleMouseDown = (e: React.MouseEvent, fieldId: string, pageIndex: number) => {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    const pageRef = pageRefs.current[pageIndex];
    if (!pageRef) return;
    const rect = pageRef.getBoundingClientRect();
    const scale = pageScales[pageIndex] || 1;
    const field = overlayFields.find((f) => f.id === fieldId);
    if (!field) return;

    setDragging({
      fieldId,
      offsetX: (e.clientX - rect.left) / scale - field.x,
      offsetY: (e.clientY - rect.top) / scale - field.y,
      pageIndex,
    });
    setSelectedFieldId(fieldId);
  };

  // Resize handling
  const handleResizeStart = (e: React.MouseEvent, fieldId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const field = overlayFields.find((f) => f.id === fieldId);
    if (!field) return;
    setResizing({ fieldId, startX: e.clientX, startY: e.clientY, startW: field.width, startH: field.height });
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (dragging) {
      const pageRef = pageRefs.current[dragging.pageIndex];
      if (!pageRef) return;
      const rect = pageRef.getBoundingClientRect();
      const scale = pageScales[dragging.pageIndex] || 1;
      const x = Math.max(0, (e.clientX - rect.left) / scale - dragging.offsetX);
      const y = Math.max(0, (e.clientY - rect.top) / scale - dragging.offsetY);
      updateField(dragging.fieldId, { x: Math.round(x), y: Math.round(y) });
    }
    if (resizing) {
      const field = overlayFields.find((f) => f.id === resizing.fieldId);
      if (!field) return;
      const scale = pageScales[field.page] || 1;
      const dw = (e.clientX - resizing.startX) / scale;
      const dh = (e.clientY - resizing.startY) / scale;
      updateField(resizing.fieldId, {
        width: Math.max(40, Math.round(resizing.startW + dw)),
        height: Math.max(20, Math.round(resizing.startH + dh)),
      });
    }
  }, [dragging, resizing, pageScales, overlayFields]);

  const handleMouseUp = useCallback(() => { setDragging(null); setResizing(null); }, []);

  useEffect(() => {
    if (dragging || resizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
    }
  }, [dragging, resizing, handleMouseMove, handleMouseUp]);

  // Handle drop from sidebar
  const handleDrop = (e: React.DragEvent, pageIndex: number) => {
    e.preventDefault();
    const data = e.dataTransfer.getData('application/merge-tag');
    if (!data) return;
    const tag = JSON.parse(data);
    const pageRef = pageRefs.current[pageIndex];
    if (!pageRef) return;
    const rect = pageRef.getBoundingClientRect();
    const scale = pageScales[pageIndex] || 1;

    const newField: OverlayField = {
      id: `field-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label: tag.label,
      value: tag.value,
      x: Math.round((e.clientX - rect.left) / scale),
      y: Math.round((e.clientY - rect.top) / scale),
      width: 200, height: 30,
      page: pageIndex,
      fontSize: 14, fontWeight: 'normal', color: '#000000',
    };
    onFieldsChange([...overlayFields, newField]);
    setSelectedFieldId(newField.id);
  };

  const selectedField = overlayFields.find((f) => f.id === selectedFieldId);

  // Upload prompt if no PDF
  if (!pdfUrl) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">PDF Template</CardTitle></CardHeader>
        <CardContent>
          <label className="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-muted-foreground/25 rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
            <Upload size={32} className="text-muted-foreground" />
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">{uploading ? 'Uploaden...' : 'Upload een PDF als achtergrond'}</p>
              <p className="text-xs text-muted-foreground mt-1">Max 50MB · Alleen PDF</p>
            </div>
            <input type="file" accept="application/pdf" className="hidden" onChange={handleFileUpload} disabled={uploading} />
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
              {/* Merge tags dropdown */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Plus size={14} /> Merge veld <ChevronDown size={12} />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-0" align="start">
                  <div className="max-h-[400px] overflow-y-auto">
                    {MERGE_TAGS.map((group) => (
                      <div key={group.group}>
                        <div className="px-3 py-2 text-xs font-semibold text-muted-foreground bg-muted/50 sticky top-0">{group.group}</div>
                        {group.items.map((tag) => (
                          <button
                            key={tag.value}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center justify-between"
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData('application/merge-tag', JSON.stringify(tag));
                            }}
                            onClick={() => addField(tag)}
                          >
                            <span>{tag.label}</span>
                            <span className="text-xs text-muted-foreground font-mono">{tag.value}</span>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              <Button variant="outline" size="sm" onClick={() => addField()} className="gap-1.5">
                <Type size={14} /> Vrij tekstveld
              </Button>

              <div className="ml-auto">
                <label className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                  <span className="underline">Andere PDF uploaden</span>
                  <input type="file" accept="application/pdf" className="hidden" onChange={handleFileUpload} disabled={uploading} />
                </label>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
        {/* All PDF pages stacked vertically */}
        <div className="space-y-4">
          {pageImages.map((imgSrc, pageIndex) => {
            const scale = pageScales[pageIndex] || 1;
            const pageFields = overlayFields.filter((f) => f.page === pageIndex);

            return (
              <Card key={pageIndex} className="overflow-hidden">
                {totalPages > 1 && (
                  <div className="px-3 py-1.5 text-xs text-muted-foreground bg-muted/30 border-b">
                    Pagina {pageIndex + 1} van {totalPages}
                  </div>
                )}
                <div
                  ref={(el) => { pageRefs.current[pageIndex] = el; }}
                  className="relative"
                  style={{ height: pdfDimensions.height * scale }}
                  onClick={() => setSelectedFieldId(null)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleDrop(e, pageIndex)}
                >
                  <img src={imgSrc} alt={`Pagina ${pageIndex + 1}`} className="w-full h-auto pointer-events-none select-none" draggable={false} />

                  {/* Overlay fields */}
                  {pageFields.map((field) => (
                    <div
                      key={field.id}
                      className={`absolute group ${readOnly ? '' : 'cursor-move'} ${
                        selectedFieldId === field.id
                          ? 'ring-2 ring-primary z-10'
                          : 'ring-1 ring-primary/20 hover:ring-primary/50'
                      }`}
                      style={{
                        left: field.x * scale,
                        top: field.y * scale,
                        width: field.width * scale,
                        height: field.height * scale,
                        fontSize: field.fontSize * scale,
                        fontWeight: field.fontWeight,
                        color: field.color,
                        fontFamily: field.fontFamily || 'inherit',
                        backgroundColor: selectedFieldId === field.id ? 'rgba(59,130,246,0.08)' : 'rgba(59,130,246,0.03)',
                      }}
                      onMouseDown={(e) => handleMouseDown(e, field.id, pageIndex)}
                      onClick={(e) => { e.stopPropagation(); setSelectedFieldId(field.id); }}
                    >
                      <div className="w-full h-full flex items-center px-1 truncate select-none">
                        {field.value || field.label}
                      </div>

                      {/* Delete button */}
                      {!readOnly && selectedFieldId === field.id && (
                        <>
                          <button
                            className="absolute -top-2.5 -right-2.5 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center text-xs hover:scale-110 transition-transform z-20"
                            onClick={(e) => { e.stopPropagation(); removeField(field.id); }}
                          >×</button>
                          {/* Resize handle */}
                          <div
                            className="absolute bottom-0 right-0 w-3 h-3 bg-primary rounded-tl cursor-se-resize z-20"
                            onMouseDown={(e) => handleResizeStart(e, field.id)}
                          />
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>

        {/* Properties panel - sticky */}
        {!readOnly && (
          <div className="space-y-3 lg:sticky lg:top-4 lg:self-start">
            {/* Fields list */}
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm">Velden ({overlayFields.length})</CardTitle>
              </CardHeader>
              <CardContent className="p-2 space-y-0.5 max-h-[250px] overflow-y-auto">
                {overlayFields.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    Voeg merge velden of vrije tekstvelden toe via de werkbalk of sleep ze naar een pagina.
                  </p>
                ) : (
                  overlayFields.map((field) => (
                    <div
                      key={field.id}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm cursor-pointer transition-colors ${
                        selectedFieldId === field.id ? 'bg-primary/10 text-primary' : 'hover:bg-accent'
                      }`}
                      onClick={() => setSelectedFieldId(field.id)}
                    >
                      <span className="text-xs text-muted-foreground w-5 text-center">{field.page + 1}</span>
                      <span className="flex-1 truncate">{field.label}</span>
                      <button className="text-muted-foreground hover:text-destructive shrink-0" onClick={(e) => { e.stopPropagation(); removeField(field.id); }}>
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
                    <Settings2 size={14} /> Eigenschappen
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Label</Label>
                    <Input value={selectedField.label} onChange={(e) => updateField(selectedField.id, { label: e.target.value })} className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Waarde <span className="text-muted-foreground">(of merge tag)</span></Label>
                    <Input
                      value={selectedField.value}
                      onChange={(e) => updateField(selectedField.id, { value: e.target.value })}
                      className="h-8 text-sm font-mono"
                      placeholder="{{contact.name}} of vrije tekst"
                    />
                  </div>

                  <Separator />

                  {/* Position */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">X positie</Label>
                      <Input type="number" value={selectedField.x} onChange={(e) => updateField(selectedField.id, { x: Number(e.target.value) })} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Y positie</Label>
                      <Input type="number" value={selectedField.y} onChange={(e) => updateField(selectedField.id, { y: Number(e.target.value) })} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Breedte</Label>
                      <Input type="number" value={selectedField.width} onChange={(e) => updateField(selectedField.id, { width: Number(e.target.value) })} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Hoogte</Label>
                      <Input type="number" value={selectedField.height} onChange={(e) => updateField(selectedField.id, { height: Number(e.target.value) })} className="h-8 text-sm" />
                    </div>
                  </div>

                  <Separator />

                  {/* Styling */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Lettergrootte</Label>
                      <Input type="number" min={8} max={72} value={selectedField.fontSize} onChange={(e) => updateField(selectedField.id, { fontSize: Number(e.target.value) })} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Gewicht</Label>
                      <Select value={selectedField.fontWeight} onValueChange={(v) => updateField(selectedField.id, { fontWeight: v as 'normal' | 'bold' })}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="normal">Normaal</SelectItem>
                          <SelectItem value="bold">Vet</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Kleur</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={selectedField.color}
                        onChange={(e) => updateField(selectedField.id, { color: e.target.value })}
                        className="w-8 h-8 rounded border border-border cursor-pointer"
                      />
                      <Input
                        value={selectedField.color}
                        onChange={(e) => updateField(selectedField.id, { color: e.target.value })}
                        className="h-8 text-sm font-mono flex-1"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Pagina</Label>
                    <Select value={String(selectedField.page)} onValueChange={(v) => updateField(selectedField.id, { page: Number(v) })}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: totalPages }, (_, i) => (
                          <SelectItem key={i} value={String(i)}>Pagina {i + 1}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
