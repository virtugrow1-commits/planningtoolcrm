/**
 * DocumentViewer — read-only renderer of template blocks for quotes/invoices.
 * Renders resolved blocks (merge tags already substituted).
 */
import { useRef, useEffect, useState } from 'react';
import { PenTool, CheckSquare } from 'lucide-react';
import type { TemplateBlock } from '@/types/templateBlocks';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

interface SignatureState {
  blockId: string;
  data: string; // base64 dataURL
}

interface DocumentViewerProps {
  blocks: any[]; // resolved TemplateBlocks
  pdfBackgroundUrl?: string | null;
  /** When provided, signature/checkbox blocks become interactive */
  onSignatureCapture?: (blockId: string, dataUrl: string) => void;
  onCheckboxChange?: (blockId: string, checked: boolean) => void;
  signatureValues?: Record<string, string>;
  checkboxValues?: Record<string, boolean>;
}

export default function DocumentViewer({
  blocks,
  pdfBackgroundUrl,
  onSignatureCapture,
  onCheckboxChange,
  signatureValues = {},
  checkboxValues = {},
}: DocumentViewerProps) {
  const sortedBlocks = [...blocks].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  // Group blocks by pages (split on page-break)
  const pages: any[][] = [];
  let current: any[] = [];
  for (const block of sortedBlocks) {
    if (block.type === 'page-break') {
      pages.push(current);
      current = [];
    } else {
      current.push(block);
    }
  }
  pages.push(current);

  return (
    <div className="space-y-8 max-w-[800px] mx-auto">
      {pages.map((pageBlocks, pi) => (
        <div key={pi} className="bg-white shadow-sm rounded-lg border overflow-hidden print:shadow-none print:border-none">
          {pdfBackgroundUrl && (
            <PdfPageBackground url={pdfBackgroundUrl} pageNumber={pi + 1} />
          )}
          <div className="p-8 md:p-12 space-y-4">
            {pageBlocks.map((block) => (
              <BlockView
                key={block.id}
                block={block}
                onSignatureCapture={onSignatureCapture}
                onCheckboxChange={onCheckboxChange}
                signatureValue={signatureValues[block.id]}
                checkboxValue={checkboxValues[block.id]}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PdfPageBackground({ url, pageNumber }: { url: string; pageNumber: number }) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const pdf = await pdfjsLib.getDocument(url).promise;
        if (pageNumber > pdf.numPages) return;
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d')!;
        await page.render({ canvasContext: ctx, viewport }).promise;
        setImgSrc(canvas.toDataURL());
      } catch { /* ignore */ }
    })();
  }, [url, pageNumber]);

  if (!imgSrc) return null;
  return (
    <div className="absolute inset-0 pointer-events-none z-0">
      <img src={imgSrc} alt="" className="w-full h-auto" />
    </div>
  );
}

function BlockView({ block, onSignatureCapture, onCheckboxChange, signatureValue, checkboxValue }: {
  block: any;
  onSignatureCapture?: (id: string, dataUrl: string) => void;
  onCheckboxChange?: (id: string, checked: boolean) => void;
  signatureValue?: string;
  checkboxValue?: boolean;
}) {
  switch (block.type) {
    case 'text':
      return (
        <div
          style={{
            fontSize: block.fontSize,
            fontFamily: block.fontFamily || 'Inter',
            fontWeight: block.fontWeight,
            fontStyle: block.fontStyle,
            textDecoration: block.textDecoration,
            textAlign: block.textAlign,
            color: block.color,
            lineHeight: block.lineHeight,
          }}
          dangerouslySetInnerHTML={{ __html: block.content || '' }}
          className="whitespace-pre-wrap"
        />
      );

    case 'image':
      if (!block.src) return null;
      return (
        <div style={{ textAlign: block.alignment || 'left' }}>
          <img
            src={block.src}
            alt={block.alt || ''}
            style={{ width: `${block.width || 100}%`, display: 'inline-block' }}
            className="rounded max-w-full"
          />
        </div>
      );

    case 'table':
      return (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted/50">
                {(block.columns || []).map((col: any) => (
                  <th key={col.id} className="border border-border p-2 text-left font-semibold">{col.header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(block.rows || []).map((row: any, ri: number) => (
                <tr key={ri} className={ri % 2 === 1 ? 'bg-muted/20' : ''}>
                  {(block.columns || []).map((col: any) => (
                    <td key={col.id} className="border border-border p-2 text-sm">{row[col.id] || ''}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case 'product-list':
      return <ProductListView block={block} />;

    case 'details':
      return (
        <div className="grid grid-cols-2 gap-x-8 gap-y-1 p-4 bg-muted/20 rounded-lg text-sm">
          {(block.fields || []).map((field: any) => (
            <div key={field.id} className="flex gap-2">
              <span className="font-semibold text-foreground min-w-[120px]">{field.label}:</span>
              <span className="text-muted-foreground">{field.resolvedValue || field.mergeTag || '—'}</span>
            </div>
          ))}
        </div>
      );

    case 'signature':
      return (
        <SignatureView
          block={block}
          value={signatureValue}
          onCapture={onSignatureCapture ? (data) => onSignatureCapture(block.id, data) : undefined}
        />
      );

    case 'checkbox':
      return (
        <div className="flex items-start gap-3 p-4 border rounded-lg bg-muted/10">
          <input
            type="checkbox"
            id={`cb-${block.id}`}
            checked={checkboxValue ?? false}
            onChange={onCheckboxChange ? (e) => onCheckboxChange(block.id, e.target.checked) : undefined}
            disabled={!onCheckboxChange}
            className="mt-0.5 w-4 h-4 accent-primary"
          />
          <label htmlFor={`cb-${block.id}`} className="cursor-pointer">
            <p className="text-sm font-medium text-foreground">{block.label}</p>
            {block.description && <p className="text-xs text-muted-foreground mt-0.5">{block.description}</p>}
          </label>
        </div>
      );

    case 'text-field':
      return (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{block.label}</p>
          {block.resolvedValue ? (
            <p className="text-sm text-foreground">{block.resolvedValue}</p>
          ) : (
            <div className="border-b border-muted-foreground/30 pb-1 min-h-[1.5rem]" />
          )}
        </div>
      );

    case 'date-field':
      return (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{block.label}</p>
          <p className="text-sm text-foreground">{block.resolvedValue || '—'}</p>
        </div>
      );

    case 'initials':
      return (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{block.label}</p>
          <div className="border-2 border-dashed border-muted-foreground/30 rounded w-20 h-12 flex items-center justify-center">
            <span className="text-xs text-muted-foreground">Paraaf</span>
          </div>
        </div>
      );

    case 'video':
      return (
        <div className="aspect-video bg-muted rounded flex items-center justify-center">
          <span className="text-sm text-muted-foreground">🎥 Video: {block.url}</span>
        </div>
      );

    default:
      return null;
  }
}

function ProductListView({ block }: { block: any }) {
  const items = block.items || [];
  const totals = items.reduce(
    (acc: any, item: any) => {
      const net = item.quantity * item.unitPrice;
      const vat = net * (item.vatRate / 100);
      acc.subtotal += net;
      acc.vat += vat;
      acc.total += net + vat;
      return acc;
    },
    { subtotal: 0, vat: 0, total: 0 }
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-muted/50 text-xs uppercase tracking-wide">
            <th className="border border-border p-2 text-left font-semibold">Omschrijving</th>
            <th className="border border-border p-2 text-right font-semibold w-16">Aantal</th>
            <th className="border border-border p-2 text-right font-semibold w-24">Prijs</th>
            <th className="border border-border p-2 text-right font-semibold w-16">BTW</th>
            <th className="border border-border p-2 text-right font-semibold w-24">Totaal</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item: any, i: number) => {
            const lineTotal = item.quantity * item.unitPrice;
            return (
              <tr key={item.id || i} className={i % 2 === 1 ? 'bg-muted/10' : ''}>
                <td className="border border-border p-2">
                  <p className="font-medium text-foreground">{item.name}</p>
                  {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
                </td>
                <td className="border border-border p-2 text-right tabular-nums">{item.quantity}</td>
                <td className="border border-border p-2 text-right tabular-nums">€ {Number(item.unitPrice).toFixed(2)}</td>
                <td className="border border-border p-2 text-right">{item.vatRate}%</td>
                <td className="border border-border p-2 text-right tabular-nums font-medium">€ {lineTotal.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border">
            <td colSpan={4} className="p-2 text-right text-xs text-muted-foreground">Subtotaal excl. BTW</td>
            <td className="p-2 text-right tabular-nums font-medium">€ {totals.subtotal.toFixed(2)}</td>
          </tr>
          <tr>
            <td colSpan={4} className="p-2 text-right text-xs text-muted-foreground">BTW</td>
            <td className="p-2 text-right tabular-nums">€ {totals.vat.toFixed(2)}</td>
          </tr>
          <tr className="bg-muted/30 font-bold">
            <td colSpan={4} className="p-2 text-right">Totaal incl. BTW</td>
            <td className="p-2 text-right tabular-nums">€ {totals.total.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function SignatureView({ block, value, onCapture }: {
  block: any;
  value?: string;
  onCapture?: (dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!onCapture || !canvasRef.current) return;
    setDrawing(true);
    const ctx = canvasRef.current.getContext('2d')!;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing || !canvasRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d')!;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#000';
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  };

  const endDraw = () => {
    if (!drawing || !canvasRef.current) return;
    setDrawing(false);
    if (hasSignature && onCapture) {
      onCapture(canvasRef.current.toDataURL());
    }
  };

  const clearSignature = () => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d')!;
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    setHasSignature(false);
    if (onCapture) onCapture('');
  };

  if (value) {
    return (
      <div className="space-y-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{block.label}</p>
        <img src={value} alt="Handtekening" className="border rounded max-w-xs" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{block.label}</p>
      {onCapture ? (
        <div className="space-y-2">
          <canvas
            ref={canvasRef}
            width={400}
            height={120}
            className="border-2 border-dashed border-muted-foreground/40 rounded-lg w-full touch-none cursor-crosshair bg-white"
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={endDraw}
            onMouseLeave={endDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={endDraw}
          />
          {hasSignature && (
            <button onClick={clearSignature} className="text-xs text-muted-foreground hover:text-destructive">
              Wissen
            </button>
          )}
        </div>
      ) : (
        <div className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-6 flex flex-col items-center gap-2">
          <PenTool size={20} className="text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{block.label}</span>
        </div>
      )}
    </div>
  );
}
