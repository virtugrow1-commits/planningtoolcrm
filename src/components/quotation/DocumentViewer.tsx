/**
 * DocumentViewer — read-only renderer of template blocks for quotes/invoices.
 * Renders resolved blocks (merge tags already substituted).
 */
import { useRef, useEffect, useState } from 'react';
import { PenTool } from 'lucide-react';
import { calcFinancials } from '@/types/quotation';
import type { LineItem } from '@/types/quotation';

interface DocumentViewerProps {
  blocks: any[];
  pdfBackgroundUrl?: string | null;
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

  // Split on page-break
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
        <div
          key={pi}
          className="bg-white shadow-sm rounded-lg border overflow-hidden print:shadow-none print:border-none"
        >
          <div className="p-8 md:p-12 space-y-6">
            {pageBlocks.map((block) => (
              <BlockView
                key={block.id}
                block={block}
                onSignatureCapture={onSignatureCapture ? (data) => onSignatureCapture(block.id, data) : undefined}
                onCheckboxChange={onCheckboxChange ? (checked) => onCheckboxChange(block.id, checked) : undefined}
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

function BlockView({
  block,
  onSignatureCapture,
  onCheckboxChange,
  signatureValue,
  checkboxValue,
}: {
  block: any;
  onSignatureCapture?: (dataUrl: string) => void;
  onCheckboxChange?: (checked: boolean) => void;
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
          // Strip merge-tag spans that weren't resolved (replace with plain text)
          dangerouslySetInnerHTML={{
            __html: (block.content || '')
              .replace(/<span[^>]*class="[^"]*bg-primary[^"]*"[^>]*contenteditable="false"[^>]*>([^<]+)<\/span>/g, '$1'),
          }}
          className="whitespace-pre-wrap break-words"
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
              <tr className="bg-gray-50">
                {(block.columns || []).map((col: any) => (
                  <th
                    key={col.id}
                    className="border border-gray-200 p-2 text-left font-semibold text-gray-700"
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(block.rows || []).map((row: any, ri: number) => (
                <tr key={ri} className={ri % 2 === 1 ? 'bg-gray-50/50' : ''}>
                  {(block.columns || []).map((col: any) => (
                    <td key={col.id} className="border border-gray-200 p-2 text-sm text-gray-700">
                      {row[col.id] || ''}
                    </td>
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
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 p-4 bg-gray-50 rounded-lg text-sm border border-gray-100">
          {(block.fields || []).map((field: any) => (
            <div key={field.id} className="flex gap-2">
              <span className="font-semibold text-gray-700 min-w-[120px] shrink-0">{field.label}:</span>
              <span className="text-gray-600">{field.resolvedValue || '—'}</span>
            </div>
          ))}
        </div>
      );

    case 'signature':
      return (
        <SignatureView
          block={block}
          value={signatureValue}
          onCapture={onSignatureCapture}
        />
      );

    case 'checkbox':
      return (
        <div className="flex items-start gap-3 p-4 border border-gray-200 rounded-lg bg-gray-50/50">
          <input
            type="checkbox"
            id={`cb-${block.id}`}
            checked={checkboxValue ?? false}
            onChange={onCheckboxChange ? (e) => onCheckboxChange(e.target.checked) : undefined}
            disabled={!onCheckboxChange}
            className="mt-0.5 w-4 h-4 accent-blue-600"
          />
          <label
            htmlFor={`cb-${block.id}`}
            className={onCheckboxChange ? 'cursor-pointer' : ''}
          >
            <p className="text-sm font-medium text-gray-800">
              {block.label}
              {block.required && <span className="text-red-500 ml-1">*</span>}
            </p>
            {block.description && (
              <p className="text-xs text-gray-500 mt-0.5">{block.description}</p>
            )}
          </label>
        </div>
      );

    case 'text-field':
      return (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {block.label}
            {block.required && <span className="text-red-500 ml-1">*</span>}
          </p>
          {block.resolvedValue ? (
            <p className="text-sm text-gray-800">{block.resolvedValue}</p>
          ) : (
            <div className="border-b border-gray-300 pb-1 min-h-[1.5rem]" />
          )}
        </div>
      );

    case 'date-field':
      return (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{block.label}</p>
          <p className="text-sm text-gray-800">{block.resolvedValue || '—'}</p>
        </div>
      );

    case 'initials':
      return (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{block.label}</p>
          <div className="border-2 border-dashed border-gray-300 rounded w-20 h-12 flex items-center justify-center">
            <span className="text-xs text-gray-400">Paraaf</span>
          </div>
        </div>
      );

    case 'video':
      if (!block.url) return null;
      return (
        <div className="aspect-video bg-gray-100 rounded flex items-center justify-center border">
          <span className="text-sm text-gray-500">🎥 {block.url}</span>
        </div>
      );

    default:
      return null;
  }
}

function ProductListView({ block }: { block: any }) {
  const items: any[] = block.items || [];

  // Build LineItem-compatible array for calcFinancials (uses discount correctly)
  const lineItems: LineItem[] = items.map((item: any, i: number) => ({
    id: item.id || String(i),
    sortOrder: i,
    itemName: item.name || '',
    description: item.description,
    quantity: Number(item.quantity) || 0,
    unitPrice: Number(item.unitPrice) || 0,
    vatRate: Number(item.vatRate) ?? 21,
    discountPercent: Number(item.discountPercent) || 0,
    lineTotal: 0, // will be overridden
  }));

  const financials = calcFinancials(lineItems);
  const hasDiscount = lineItems.some((li) => li.discountPercent > 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <th className="border border-gray-200 p-2 text-left font-semibold">Omschrijving</th>
            <th className="border border-gray-200 p-2 text-right font-semibold w-16">Aantal</th>
            <th className="border border-gray-200 p-2 text-right font-semibold w-24">Stukprijs</th>
            {hasDiscount && (
              <th className="border border-gray-200 p-2 text-right font-semibold w-20">Korting</th>
            )}
            <th className="border border-gray-200 p-2 text-right font-semibold w-16">BTW</th>
            <th className="border border-gray-200 p-2 text-right font-semibold w-24">Totaal</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item: any, i: number) => {
            const gross = item.quantity * item.unitPrice;
            const disc = gross * ((item.discountPercent || 0) / 100);
            const net = gross - disc;
            return (
              <tr key={item.id || i} className={i % 2 === 1 ? 'bg-gray-50/40' : ''}>
                <td className="border border-gray-200 p-2">
                  <p className="font-medium text-gray-800">{item.name}</p>
                  {item.description && (
                    <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
                  )}
                </td>
                <td className="border border-gray-200 p-2 text-right tabular-nums text-gray-700">
                  {item.quantity}
                </td>
                <td className="border border-gray-200 p-2 text-right tabular-nums text-gray-700">
                  € {Number(item.unitPrice).toFixed(2)}
                </td>
                {hasDiscount && (
                  <td className="border border-gray-200 p-2 text-right tabular-nums text-gray-500">
                    {item.discountPercent > 0 ? `${item.discountPercent}%` : '—'}
                  </td>
                )}
                <td className="border border-gray-200 p-2 text-right text-gray-500">
                  {item.vatRate}%
                </td>
                <td className="border border-gray-200 p-2 text-right tabular-nums font-medium text-gray-800">
                  € {net.toFixed(2)}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={hasDiscount ? 5 : 4} className="p-2 text-right text-xs text-gray-500">
              Subtotaal excl. BTW
            </td>
            <td className="p-2 text-right tabular-nums font-medium text-gray-700">
              € {financials.subtotal.toFixed(2)}
            </td>
          </tr>
          {financials.discountAmount > 0 && (
            <tr>
              <td colSpan={hasDiscount ? 5 : 4} className="p-2 text-right text-xs text-red-500">
                Korting
              </td>
              <td className="p-2 text-right tabular-nums text-red-500">
                -€ {financials.discountAmount.toFixed(2)}
              </td>
            </tr>
          )}
          {financials.vatBuckets.map((b) => (
            <tr key={b.rate}>
              <td colSpan={hasDiscount ? 5 : 4} className="p-2 text-right text-xs text-gray-500">
                BTW {b.rate}%
              </td>
              <td className="p-2 text-right tabular-nums text-gray-600">
                € {b.amount.toFixed(2)}
              </td>
            </tr>
          ))}
          <tr className="font-bold border-t-2 border-gray-300">
            <td colSpan={hasDiscount ? 5 : 4} className="p-2 text-right text-gray-800">
              Totaal incl. BTW
            </td>
            <td className="p-2 text-right tabular-nums text-gray-900">
              € {financials.total.toFixed(2)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function SignatureView({
  block,
  value,
  onCapture,
}: {
  block: any;
  value?: string;
  onCapture?: (dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasStrokes, setHasStrokes] = useState(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!onCapture || !canvasRef.current) return;
    e.preventDefault();
    const pos = getPos(e, canvasRef.current);
    lastPos.current = pos;
    setIsDrawing(true);
    const ctx = canvasRef.current.getContext('2d')!;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 1, 0, Math.PI * 2);
    ctx.fill();
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !canvasRef.current || !lastPos.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d')!;
    const pos = getPos(e, canvasRef.current);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1a1a2e';
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
    setHasStrokes(true);
  };

  const endDraw = () => {
    if (!isDrawing || !canvasRef.current) return;
    setIsDrawing(false);
    lastPos.current = null;
    if (hasStrokes && onCapture) {
      onCapture(canvasRef.current.toDataURL());
    }
  };

  const clear = () => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d')!;
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    setHasStrokes(false);
    onCapture?.('');
  };

  // Show signed state
  if (value) {
    return (
      <div className="space-y-2" data-block-type="signature">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {block.label || 'Handtekening'}
          {block.required && <span className="text-red-500 ml-1">*</span>}
        </p>
        <img src={value} alt="Handtekening" className="border border-gray-200 rounded max-w-xs bg-white" />
      </div>
    );
  }

  return (
    <div className="space-y-2" data-block-type="signature">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        {block.label || 'Handtekening'}
        {block.required && <span className="text-red-500 ml-1">*</span>}
      </p>
      {onCapture ? (
        <div className="space-y-1.5">
          <canvas
            ref={canvasRef}
            width={600}
            height={150}
            className="border-2 border-dashed border-gray-300 rounded-lg w-full touch-none cursor-crosshair bg-white select-none"
            style={{ maxWidth: '480px' }}
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={endDraw}
            onMouseLeave={endDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={endDraw}
          />
          <div className="flex items-center gap-3">
            <p className="text-xs text-gray-400">Teken uw handtekening hierboven</p>
            {hasStrokes && (
              <button
                onClick={clear}
                className="text-xs text-gray-400 hover:text-red-500 underline transition-colors"
              >
                Wissen
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 flex flex-col items-center gap-2 max-w-xs">
          <PenTool size={20} className="text-gray-300" />
          <span className="text-xs text-gray-400">{block.label || 'Handtekening'}</span>
        </div>
      )}
    </div>
  );
}
