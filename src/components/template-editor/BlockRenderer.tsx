import { useState, useRef, useCallback } from 'react';
import MergeTagPicker from './MergeTagPicker';
import FontPicker, { type CustomFont } from './FontPicker';
import { Trash2, GripVertical, ChevronUp, ChevronDown, Upload, Plus, X, PenTool } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type {
  TemplateBlock, TextBlock, ImageBlock, VideoBlock, TableBlock,
  ProductListBlock, SignatureBlock, TextFieldBlock, DateFieldBlock,
  InitialsBlock, CheckboxBlock, DetailsBlock
} from '@/types/templateBlocks';

interface BlockRendererProps {
  block: TemplateBlock;
  selected: boolean;
  onSelect: () => void;
  onUpdate: (updates: Partial<TemplateBlock>) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
  customFonts?: CustomFont[];
  onCustomFontsChange?: (fonts: CustomFont[]) => void;
}

export default function BlockRenderer({
  block, selected, onSelect, onUpdate, onDelete,
  onMoveUp, onMoveDown, isFirst, isLast, customFonts = [], onCustomFontsChange
}: BlockRendererProps) {
  return (
    <div
      className={`group relative border rounded-lg transition-all ${
        selected ? 'border-primary ring-1 ring-primary/30' : 'border-transparent hover:border-border'
      }`}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
    >
      {/* Block toolbar */}
      <div className={`absolute -left-10 top-0 flex flex-col gap-0.5 transition-opacity ${
        selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
      }`}>
        <button onClick={onMoveUp} disabled={isFirst} className="p-1 rounded hover:bg-accent disabled:opacity-30">
          <ChevronUp size={14} />
        </button>
        <div className="p-1 cursor-grab text-muted-foreground">
          <GripVertical size={14} />
        </div>
        <button onClick={onMoveDown} disabled={isLast} className="p-1 rounded hover:bg-accent disabled:opacity-30">
          <ChevronDown size={14} />
        </button>
      </div>

      {/* Delete button */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className={`absolute -right-3 -top-3 z-10 w-6 h-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center transition-opacity ${
          selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        <Trash2 size={12} />
      </button>

      <div className="p-3">
        {renderBlockContent(block, selected, onUpdate, customFonts, onCustomFontsChange)}
      </div>
    </div>
  );
}

function renderBlockContent(
  block: TemplateBlock,
  selected: boolean,
  onUpdate: (updates: Partial<TemplateBlock>) => void
) {
  switch (block.type) {
    case 'text': return <TextBlockEditor block={block} selected={selected} onUpdate={onUpdate} />;
    case 'image': return <ImageBlockEditor block={block} onUpdate={onUpdate} />;
    case 'video': return <VideoBlockEditor block={block} onUpdate={onUpdate} />;
    case 'table': return <TableBlockEditor block={block} onUpdate={onUpdate} />;
    case 'product-list': return <ProductListBlockEditor block={block} onUpdate={onUpdate} />;
    case 'page-break': return <PageBreakBlockRenderer />;
    case 'signature': return <SignatureBlockEditor block={block} selected={selected} onUpdate={onUpdate} />;
    case 'text-field': return <TextFieldBlockEditor block={block} selected={selected} onUpdate={onUpdate} />;
    case 'date-field': return <DateFieldBlockEditor block={block} selected={selected} onUpdate={onUpdate} />;
    case 'initials': return <InitialsBlockEditor block={block} selected={selected} onUpdate={onUpdate} />;
    case 'checkbox': return <CheckboxBlockEditor block={block} selected={selected} onUpdate={onUpdate} />;
    case 'details': return <DetailsBlockEditor block={block} selected={selected} onUpdate={onUpdate} />;
    default: return <div className="text-sm text-muted-foreground">Onbekend blok</div>;
  }
}

// ─── Text Block ──────────────────────────────────────────────
function TextBlockEditor({ block, selected, onUpdate }: { block: TextBlock; selected: boolean; onUpdate: (u: any) => void }) {
  const ref = useRef<HTMLDivElement>(null);

  const insertMergeTag = useCallback((tag: string) => {
    if (!ref.current) return;
    ref.current.focus();
    
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      // Check if selection is inside our editor
      if (ref.current.contains(range.commonAncestorContainer)) {
        range.deleteContents();
        const tagSpan = document.createElement('span');
        tagSpan.className = 'inline-block bg-primary/10 text-primary border border-primary/20 rounded px-1 text-xs font-mono';
        tagSpan.contentEditable = 'false';
        tagSpan.textContent = tag;
        range.insertNode(tagSpan);
        // Move cursor after the inserted span
        range.setStartAfter(tagSpan);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        // Append at end
        ref.current.innerHTML += `<span class="inline-block bg-primary/10 text-primary border border-primary/20 rounded px-1 text-xs font-mono" contenteditable="false">${tag}</span>`;
      }
    } else {
      ref.current.innerHTML += `<span class="inline-block bg-primary/10 text-primary border border-primary/20 rounded px-1 text-xs font-mono" contenteditable="false">${tag}</span>`;
    }
    
    onUpdate({ content: ref.current.innerHTML });
  }, [onUpdate]);

  return (
    <div className="space-y-2">
      {selected && (
        <div className="flex items-center gap-1 flex-wrap pb-2 border-b">
          <select
            value={block.fontSize}
            onChange={(e) => onUpdate({ fontSize: Number(e.target.value) })}
            className="h-7 text-xs border rounded px-1 bg-background"
          >
            {[10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48].map(s => (
              <option key={s} value={s}>{s}px</option>
            ))}
          </select>
          <button
            className={`h-7 w-7 flex items-center justify-center rounded text-xs font-bold ${block.fontWeight === 'bold' ? 'bg-accent' : 'hover:bg-accent'}`}
            onClick={() => onUpdate({ fontWeight: block.fontWeight === 'bold' ? 'normal' : 'bold' })}
          >B</button>
          <button
            className={`h-7 w-7 flex items-center justify-center rounded text-xs italic ${block.fontStyle === 'italic' ? 'bg-accent' : 'hover:bg-accent'}`}
            onClick={() => onUpdate({ fontStyle: block.fontStyle === 'italic' ? 'normal' : 'italic' })}
          >I</button>
          <button
            className={`h-7 w-7 flex items-center justify-center rounded text-xs underline ${block.textDecoration === 'underline' ? 'bg-accent' : 'hover:bg-accent'}`}
            onClick={() => onUpdate({ textDecoration: block.textDecoration === 'underline' ? 'none' : 'underline' })}
          >U</button>
          <div className="w-px h-5 bg-border mx-1" />
          {(['left', 'center', 'right', 'justify'] as const).map(align => (
            <button
              key={align}
              className={`h-7 w-7 flex items-center justify-center rounded text-[10px] ${block.textAlign === align ? 'bg-accent' : 'hover:bg-accent'}`}
              onClick={() => onUpdate({ textAlign: align })}
            >
              {align === 'left' ? '⊣' : align === 'center' ? '⊡' : align === 'right' ? '⊢' : '⊞'}
            </button>
          ))}
          <div className="w-px h-5 bg-border mx-1" />
          <input
            type="color"
            value={block.color}
            onChange={(e) => onUpdate({ color: e.target.value })}
            className="w-7 h-7 rounded border cursor-pointer"
          />
          <div className="w-px h-5 bg-border mx-1" />
          <MergeTagPicker onInsert={insertMergeTag} />
        </div>
      )}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        className="outline-none min-h-[1.5em] whitespace-pre-wrap"
        style={{
          fontSize: block.fontSize,
          fontWeight: block.fontWeight,
          fontStyle: block.fontStyle,
          textDecoration: block.textDecoration,
          textAlign: block.textAlign,
          color: block.color,
          lineHeight: block.lineHeight,
        }}
        dangerouslySetInnerHTML={{ __html: block.content }}
        onBlur={(e) => onUpdate({ content: e.currentTarget.innerHTML })}
      />
    </div>
  );
}

// ─── Image Block ──────────────────────────────────────────────
function ImageBlockEditor({ block, onUpdate }: { block: ImageBlock; onUpdate: (u: any) => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Alleen afbeeldingen', variant: 'destructive' });
      return;
    }

    setUploading(true);
    const filePath = `${user.id}/images/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from('quote-pdfs').upload(filePath, file);
    if (error) {
      toast({ title: 'Upload mislukt', description: error.message, variant: 'destructive' });
      setUploading(false);
      return;
    }
    const { data: urlData } = supabase.storage.from('quote-pdfs').getPublicUrl(filePath);
    onUpdate({ src: urlData.publicUrl });
    setUploading(false);
  };

  if (!block.src) {
    return (
      <label className="flex flex-col items-center gap-2 p-6 border-2 border-dashed border-muted-foreground/25 rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
        <Upload size={24} className="text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          {uploading ? 'Uploaden...' : 'Klik om een afbeelding te uploaden'}
        </span>
        <input type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
      </label>
    );
  }

  return (
    <div style={{ textAlign: block.alignment }}>
      <img
        src={block.src}
        alt={block.alt}
        style={{ width: `${block.width}%`, display: 'inline-block' }}
        className="rounded"
      />
    </div>
  );
}

// ─── Video Block ──────────────────────────────────────────────
function VideoBlockEditor({ block, onUpdate }: { block: VideoBlock; onUpdate: (u: any) => void }) {
  if (!block.url) {
    return (
      <div className="space-y-2">
        <Label className="text-xs">Video URL (YouTube/Vimeo)</Label>
        <Input
          placeholder="https://youtube.com/watch?v=..."
          onBlur={(e) => onUpdate({ url: e.target.value })}
          className="h-8"
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="aspect-video bg-muted rounded flex items-center justify-center">
        <span className="text-sm text-muted-foreground">🎥 Video: {block.url}</span>
      </div>
      <Input
        value={block.caption}
        onChange={(e) => onUpdate({ caption: e.target.value })}
        placeholder="Bijschrift..."
        className="h-7 text-xs"
      />
    </div>
  );
}

// ─── Table Block ──────────────────────────────────────────────
function TableBlockEditor({ block, onUpdate }: { block: TableBlock; onUpdate: (u: any) => void }) {
  const addRow = () => {
    const newRow: Record<string, string> = {};
    block.columns.forEach(c => { newRow[c.id] = ''; });
    onUpdate({ rows: [...block.rows, newRow] });
  };

  const addColumn = () => {
    const colId = `col${Date.now()}`;
    onUpdate({
      columns: [...block.columns, { id: colId, header: `Kolom ${block.columns.length + 1}` }],
      rows: block.rows.map(r => ({ ...r, [colId]: '' })),
    });
  };

  const updateCell = (rowIdx: number, colId: string, value: string) => {
    const newRows = [...block.rows];
    newRows[rowIdx] = { ...newRows[rowIdx], [colId]: value };
    onUpdate({ rows: newRows });
  };

  const updateHeader = (colId: string, header: string) => {
    onUpdate({ columns: block.columns.map(c => c.id === colId ? { ...c, header } : c) });
  };

  const removeRow = (idx: number) => {
    onUpdate({ rows: block.rows.filter((_, i) => i !== idx) });
  };

  const removeColumn = (colId: string) => {
    if (block.columns.length <= 1) return;
    onUpdate({
      columns: block.columns.filter(c => c.id !== colId),
      rows: block.rows.map(r => { const { [colId]: _, ...rest } = r; return rest; }),
    });
  };

  return (
    <div className="space-y-2 overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {block.columns.map(col => (
              <th key={col.id} className="border border-border p-1.5 bg-muted/50">
                <div className="flex items-center gap-1">
                  <input
                    value={col.header}
                    onChange={(e) => updateHeader(col.id, e.target.value)}
                    className="flex-1 bg-transparent text-xs font-semibold outline-none"
                  />
                  <button onClick={() => removeColumn(col.id)} className="text-muted-foreground hover:text-destructive">
                    <X size={10} />
                  </button>
                </div>
              </th>
            ))}
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, ri) => (
            <tr key={ri}>
              {block.columns.map(col => (
                <td key={col.id} className="border border-border p-1">
                  <input
                    value={row[col.id] || ''}
                    onChange={(e) => updateCell(ri, col.id, e.target.value)}
                    className="w-full bg-transparent text-xs outline-none"
                  />
                </td>
              ))}
              <td className="p-1">
                <button onClick={() => removeRow(ri)} className="text-muted-foreground hover:text-destructive">
                  <X size={12} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={addRow} className="text-xs h-7">
          <Plus size={12} className="mr-1" /> Rij
        </Button>
        <Button variant="ghost" size="sm" onClick={addColumn} className="text-xs h-7">
          <Plus size={12} className="mr-1" /> Kolom
        </Button>
      </div>
    </div>
  );
}

// ─── Product List Block ──────────────────────────────────────
function ProductListBlockEditor({ block, onUpdate }: { block: ProductListBlock; onUpdate: (u: any) => void }) {
  const addItem = () => {
    onUpdate({
      items: [...block.items, {
        id: `item-${Date.now()}`,
        name: '',
        description: '',
        quantity: 1,
        unitPrice: 0,
        vatRate: 21,
      }]
    });
  };

  const updateItem = (idx: number, updates: any) => {
    const items = [...block.items];
    items[idx] = { ...items[idx], ...updates };
    onUpdate({ items });
  };

  const removeItem = (idx: number) => {
    onUpdate({ items: block.items.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-2 overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-muted/50">
            <th className="border border-border p-1.5 text-left text-xs font-semibold">Product</th>
            <th className="border border-border p-1.5 text-left text-xs font-semibold w-20">Aantal</th>
            <th className="border border-border p-1.5 text-left text-xs font-semibold w-24">Prijs</th>
            <th className="border border-border p-1.5 text-left text-xs font-semibold w-20">BTW</th>
            <th className="border border-border p-1.5 text-right text-xs font-semibold w-24">Totaal</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {block.items.map((item, i) => {
            const lineTotal = item.quantity * item.unitPrice;
            return (
              <tr key={item.id}>
                <td className="border border-border p-1">
                  <input
                    value={item.name}
                    onChange={(e) => updateItem(i, { name: e.target.value })}
                    className="w-full bg-transparent text-xs outline-none"
                    placeholder="Productnaam"
                  />
                </td>
                <td className="border border-border p-1">
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })}
                    className="w-full bg-transparent text-xs outline-none"
                  />
                </td>
                <td className="border border-border p-1">
                  <input
                    type="number"
                    value={item.unitPrice}
                    onChange={(e) => updateItem(i, { unitPrice: Number(e.target.value) })}
                    className="w-full bg-transparent text-xs outline-none"
                    step="0.01"
                  />
                </td>
                <td className="border border-border p-1">
                  <select
                    value={item.vatRate}
                    onChange={(e) => updateItem(i, { vatRate: Number(e.target.value) })}
                    className="w-full bg-transparent text-xs outline-none"
                  >
                    <option value={0}>0%</option>
                    <option value={9}>9%</option>
                    <option value={21}>21%</option>
                  </select>
                </td>
                <td className="border border-border p-1 text-right text-xs">
                  €{lineTotal.toFixed(2)}
                </td>
                <td className="p-1">
                  <button onClick={() => removeItem(i)} className="text-muted-foreground hover:text-destructive">
                    <X size={12} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <Button variant="ghost" size="sm" onClick={addItem} className="text-xs h-7">
        <Plus size={12} className="mr-1" /> Product toevoegen
      </Button>
    </div>
  );
}

// ─── Page Break ──────────────────────────────────────────────
function PageBreakBlockRenderer() {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex-1 border-t-2 border-dashed border-muted-foreground/30" />
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Pagina-einde</span>
      <div className="flex-1 border-t-2 border-dashed border-muted-foreground/30" />
    </div>
  );
}

// ─── Signature Block ──────────────────────────────────────────
function SignatureBlockEditor({ block, selected, onUpdate }: { block: SignatureBlock; selected: boolean; onUpdate: (u: any) => void }) {
  return (
    <div className="space-y-2">
      <div className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-4 flex flex-col items-center gap-2 min-h-[80px] justify-center">
        <PenTool size={20} className="text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{block.label}</span>
      </div>
      {selected && (
        <div className="flex gap-2 items-center">
          <Input value={block.label} onChange={(e) => onUpdate({ label: e.target.value })} className="h-7 text-xs flex-1" />
          <label className="flex items-center gap-1 text-xs">
            <Checkbox checked={block.required} onCheckedChange={(c) => onUpdate({ required: !!c })} />
            Verplicht
          </label>
        </div>
      )}
    </div>
  );
}



// ─── Text Field Block ──────────────────────────────────────────
function TextFieldBlockEditor({ block, selected, onUpdate }: { block: TextFieldBlock; selected: boolean; onUpdate: (u: any) => void }) {
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label className="text-xs font-semibold">{block.label}</Label>
        <Input disabled placeholder={block.placeholder} className="h-8 text-sm bg-muted/30" />
      </div>
      {selected && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px]">Label</Label>
            <Input value={block.label} onChange={(e) => onUpdate({ label: e.target.value })} className="h-7 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">Merge tag</Label>
            <Input value={block.mergeTag} onChange={(e) => onUpdate({ mergeTag: e.target.value })} className="h-7 text-xs" placeholder="{{veldnaam}}" />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Date Field Block ──────────────────────────────────────────
function DateFieldBlockEditor({ block, selected, onUpdate }: { block: DateFieldBlock; selected: boolean; onUpdate: (u: any) => void }) {
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label className="text-xs font-semibold">{block.label}</Label>
        <Input disabled value="dd-mm-jjjj" className="h-8 text-sm bg-muted/30 w-40" />
      </div>
      {selected && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px]">Label</Label>
            <Input value={block.label} onChange={(e) => onUpdate({ label: e.target.value })} className="h-7 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">Merge tag</Label>
            <Input value={block.mergeTag} onChange={(e) => onUpdate({ mergeTag: e.target.value })} className="h-7 text-xs" />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Initials Block ──────────────────────────────────────────
function InitialsBlockEditor({ block, selected, onUpdate }: { block: InitialsBlock; selected: boolean; onUpdate: (u: any) => void }) {
  return (
    <div className="space-y-2">
      <div className="border-2 border-dashed border-muted-foreground/30 rounded w-20 h-12 flex items-center justify-center">
        <span className="text-xs text-muted-foreground font-mono">IN</span>
      </div>
      <span className="text-xs text-muted-foreground">{block.label}</span>
      {selected && (
        <div className="flex gap-2 items-center">
          <Input value={block.label} onChange={(e) => onUpdate({ label: e.target.value })} className="h-7 text-xs flex-1" />
          <label className="flex items-center gap-1 text-xs">
            <Checkbox checked={block.required} onCheckedChange={(c) => onUpdate({ required: !!c })} />
            Verplicht
          </label>
        </div>
      )}
    </div>
  );
}

// ─── Checkbox Block ──────────────────────────────────────────
function CheckboxBlockEditor({ block, selected, onUpdate }: { block: CheckboxBlock; selected: boolean; onUpdate: (u: any) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <Checkbox disabled className="mt-0.5" />
        <div>
          <p className="text-sm font-medium">{block.label}</p>
          <p className="text-xs text-muted-foreground">{block.description}</p>
        </div>
      </div>
      {selected && (
        <div className="space-y-2 pt-2 border-t">
          <div className="space-y-1">
            <Label className="text-[10px]">Label</Label>
            <Input value={block.label} onChange={(e) => onUpdate({ label: e.target.value })} className="h-7 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">Beschrijving</Label>
            <Input value={block.description} onChange={(e) => onUpdate({ description: e.target.value })} className="h-7 text-xs" />
          </div>
          <label className="flex items-center gap-1 text-xs">
            <Checkbox checked={block.required} onCheckedChange={(c) => onUpdate({ required: !!c })} />
            Verplicht
          </label>
        </div>
      )}
    </div>
  );
}

// ─── Details Block ──────────────────────────────────────────
function DetailsBlockEditor({ block, selected, onUpdate }: { block: DetailsBlock; selected: boolean; onUpdate: (u: any) => void }) {
  const addField = () => {
    onUpdate({
      fields: [...block.fields, { id: `d-${Date.now()}`, label: 'Nieuw veld', mergeTag: '' }]
    });
  };

  const updateField = (idx: number, updates: any) => {
    const fields = [...block.fields];
    fields[idx] = { ...fields[idx], ...updates };
    onUpdate({ fields });
  };

  const removeField = (idx: number) => {
    onUpdate({ fields: block.fields.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-2 p-3 bg-muted/20 rounded-lg">
      {block.fields.map((field, i) => (
        <div key={field.id} className="flex items-center gap-2">
          {selected ? (
            <>
              <Input
                value={field.label}
                onChange={(e) => updateField(i, { label: e.target.value })}
                className="h-7 text-xs flex-1"
                placeholder="Label"
              />
              <Input
                value={field.mergeTag}
                onChange={(e) => updateField(i, { mergeTag: e.target.value })}
                className="h-7 text-xs flex-1"
                placeholder="{{merge_tag}}"
              />
              <button onClick={() => removeField(i)} className="text-muted-foreground hover:text-destructive">
                <X size={12} />
              </button>
            </>
          ) : (
            <>
              <span className="text-xs font-semibold w-32">{field.label}:</span>
              <span className="text-xs text-muted-foreground">{field.mergeTag || '—'}</span>
            </>
          )}
        </div>
      ))}
      {selected && (
        <Button variant="ghost" size="sm" onClick={addField} className="text-xs h-7">
          <Plus size={12} className="mr-1" /> Veld toevoegen
        </Button>
      )}
    </div>
  );
}
