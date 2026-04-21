import { useEffect, useRef, useState } from 'react';
import PdfPageRenderer, { usePdfPageCount } from '@/components/template-editor/PdfPageRenderer';
import type { TemplateBlock, TextBlock, ImageBlock, ProductListBlock, TableBlock, DetailsBlock } from '@/types/templateBlocks';
import type { LineItem } from '@/types/quotation';

interface TemplatePreviewProps {
  /** Preferred PDF URL — falls back to pdfBackgroundUrl/editorPdfUrl if empty */
  pdfUrl?: string | null;
  pdfBackgroundUrl?: string | null;
  editorPdfUrl?: string | null;
  blocks: TemplateBlock[];
  /** Optional product line items to render at the end (so the user always sees products) */
  lineItems?: LineItem[];
  totals?: { subtotal: number; vatAmount: number; discountAmount: number; total: number };
}

const fmtEUR = (n: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n || 0);

/**
 * Read-only A4 preview that renders the template PDF background with blocks
 * positioned exactly as in the editor, and appends a product table at the end
 * so the user always sees how the document will look for the client.
 */
export default function TemplatePreview({
  pdfUrl,
  pdfBackgroundUrl,
  editorPdfUrl,
  blocks,
  lineItems = [],
  totals,
}: TemplatePreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [pageDimensions, setPageDimensions] = useState<Record<number, { width: number; height: number }>>({});

  // Resolve effective PDF URL — templates may store under different field names
  const finalPdfUrl = pdfUrl || pdfBackgroundUrl || editorPdfUrl || null;
  const hasPdf = !!finalPdfUrl;
  const pdfPageCount = usePdfPageCount(finalPdfUrl);

  // Detect whether the template has its own product-list block
  const hasProductListBlock = blocks.some((b) => b.type === 'product-list');

  // Compute the highest pageIndex used by any block
  const maxBlockPage = blocks.reduce((m, b) => Math.max(m, b.pageIndex ?? 0), 0);
  const totalPages = hasPdf ? Math.max(pdfPageCount, maxBlockPage + 1) : Math.max(1, maxBlockPage + 1);

  // Measure available width
  useEffect(() => {
    if (!containerRef.current) return;
    const update = () => {
      if (containerRef.current) setContainerWidth(containerRef.current.clientWidth);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const blocksForPage = (pageIdx: number) =>
    blocks.filter((b) => (b.pageIndex ?? 0) === pageIdx);

  if (!hasPdf && blocks.length === 0 && lineItems.length === 0) {
    return (
      <div className="text-center text-sm text-muted-foreground py-12">
        Dit sjabloon heeft nog geen inhoud.
      </div>
    );
  }

  // A4 ratio fallback when PDF dimensions aren't yet known (210 × 297 mm)
  const A4_RATIO = 297 / 210;

  return (
    <div ref={containerRef} className="w-full max-w-[800px] mx-auto space-y-6">
      {Array.from({ length: totalPages }, (_, pageIdx) => {
        const pageBlocks = blocksForPage(pageIdx);
        const dims = pageDimensions[pageIdx];
        const pageHeight = dims && containerWidth
          ? (dims.height / dims.width) * containerWidth
          : containerWidth
            ? containerWidth * A4_RATIO
            : 1122;

        return (
          <div
            key={pageIdx}
            className="relative bg-white shadow-lg rounded-sm border border-border/40 overflow-hidden"
            style={{ height: pageHeight }}
          >
            {/* PDF Background */}
            {hasPdf && containerWidth > 0 && (
              <div className="absolute inset-0 z-0 pointer-events-none">
                <PdfPageRenderer
                  pdfUrl={finalPdfUrl!}
                  pageNumber={pageIdx + 1}
                  width={containerWidth}
                  onDimensionsReady={(d) =>
                    setPageDimensions((prev) =>
                      prev[pageIdx]?.width === d.width && prev[pageIdx]?.height === d.height
                        ? prev
                        : { ...prev, [pageIdx]: d }
                    )
                  }
                />
              </div>
            )}

            {/* Blocks layer (read-only, absolutely positioned like editor) */}
            <div className="absolute inset-0 z-10">
              {pageBlocks.map((block, idx) => (
                <div
                  key={block.id}
                  className="absolute"
                  style={{
                    left: block.x ?? 40,
                    top: block.y ?? (20 + idx * 70),
                    width: block.w ?? 200,
                    minHeight: block.h ?? 60,
                  }}
                >
                  <PreviewBlock block={block} lineItems={lineItems} />
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Always-visible product table page if template has no product-list block */}
      {!hasProductListBlock && lineItems.length > 0 && (
        <div className="bg-white shadow-lg rounded-sm border border-border/40 p-8 space-y-4">
          <h3 className="text-lg font-semibold text-foreground border-b pb-2">
            Producten &amp; diensten
          </h3>
          <ProductTable items={lineItems} totals={totals} />
        </div>
      )}
    </div>
  );
}

function PreviewBlock({ block, lineItems }: { block: TemplateBlock; lineItems: LineItem[] }) {
  switch (block.type) {
    case 'text':
      return <TextPreview block={block} />;
    case 'image':
      return <ImagePreview block={block} />;
    case 'product-list':
      // If template has a product-list block AND user added line items, render the actual items.
      // Otherwise fall back to the template's own placeholder items.
      return <ProductListPreview block={block} lineItems={lineItems} />;
    case 'table':
      return <TablePreview block={block} />;
    case 'details':
      return <DetailsPreview block={block} />;
    case 'signature':
      return (
        <div className="border-b-2 border-dashed border-muted-foreground/40 h-full flex items-end pb-1 text-xs text-muted-foreground">
          Handtekening
        </div>
      );
    case 'text-field':
    case 'date-field':
      return (
        <div className="border border-dashed border-muted-foreground/40 rounded px-2 py-1 text-sm text-muted-foreground h-full">
          {(block as any).label || 'Veld'}
        </div>
      );
    case 'initials':
      return (
        <div className="border border-dashed border-muted-foreground/40 rounded text-xs text-muted-foreground flex items-center justify-center h-full">
          Paraaf
        </div>
      );
    case 'checkbox':
      return (
        <div className="flex items-start gap-2 text-sm">
          <div className="w-4 h-4 border border-foreground rounded mt-0.5 shrink-0" />
          <span>{(block as any).label}</span>
        </div>
      );
    case 'page-break':
      return null;
    default:
      return null;
  }
}

function TextPreview({ block }: { block: TextBlock }) {
  return (
    <div
      className="whitespace-pre-wrap break-words"
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
      dangerouslySetInnerHTML={{ __html: block.content }}
    />
  );
}

function ImagePreview({ block }: { block: ImageBlock }) {
  if (!block.src) return null;
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

function ProductListPreview({ block, lineItems }: { block: ProductListBlock; lineItems: LineItem[] }) {
  // Prefer real line items (mapped from quote) when present; else show template's items
  const rows = lineItems.length > 0
    ? lineItems.map((it) => ({
        id: it.id,
        name: it.itemName,
        description: it.description || '',
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        vatRate: it.vatRate,
      }))
    : block.items;

  return (
    <table className="w-full border-collapse text-sm">
      {block.showHeaders && (
        <thead>
          <tr className="bg-muted/50">
            <th className="border border-border p-1.5 text-left text-xs font-semibold">Product</th>
            <th className="border border-border p-1.5 text-left text-xs font-semibold w-16">Aantal</th>
            <th className="border border-border p-1.5 text-left text-xs font-semibold w-20">Prijs</th>
            <th className="border border-border p-1.5 text-right text-xs font-semibold w-24">Totaal</th>
          </tr>
        </thead>
      )}
      <tbody>
        {rows.map((it) => (
          <tr key={it.id}>
            <td className="border border-border p-1.5">
              <div>{it.name}</div>
              {it.description && (
                <div className="text-xs text-muted-foreground">{it.description}</div>
              )}
            </td>
            <td className="border border-border p-1.5">{it.quantity}</td>
            <td className="border border-border p-1.5">{fmtEUR(it.unitPrice)}</td>
            <td className="border border-border p-1.5 text-right">
              {fmtEUR(it.quantity * it.unitPrice)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TablePreview({ block }: { block: TableBlock }) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr>
          {block.columns.map((c) => (
            <th key={c.id} className="border border-border p-1.5 bg-muted/50 text-left text-xs font-semibold">
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {block.rows.map((row, ri) => (
          <tr key={ri}>
            {block.columns.map((c) => (
              <td key={c.id} className="border border-border p-1.5 text-xs">
                {row[c.id] || ''}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DetailsPreview({ block }: { block: DetailsBlock }) {
  return (
    <div className="space-y-1 text-sm">
      {block.fields.map((f) => (
        <div key={f.id} className="flex gap-2">
          <span className="text-muted-foreground min-w-[120px]">{f.label}:</span>
          <span className="text-foreground">{f.mergeTag}</span>
        </div>
      ))}
    </div>
  );
}

/** Standalone product table used for the always-appended product page */
function ProductTable({
  items,
  totals,
}: {
  items: LineItem[];
  totals?: { subtotal: number; vatAmount: number; discountAmount: number; total: number };
}) {
  return (
    <div className="space-y-3">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-muted/40">
            <th className="border border-border p-2 text-left text-xs font-semibold">Omschrijving</th>
            <th className="border border-border p-2 text-left text-xs font-semibold w-16">Aantal</th>
            <th className="border border-border p-2 text-right text-xs font-semibold w-24">Stukprijs</th>
            <th className="border border-border p-2 text-right text-xs font-semibold w-16">BTW</th>
            <th className="border border-border p-2 text-right text-xs font-semibold w-28">Totaal</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id}>
              <td className="border border-border p-2">
                <div className="font-medium">{it.itemName}</div>
                {it.description && (
                  <div className="text-xs text-muted-foreground mt-0.5">{it.description}</div>
                )}
              </td>
              <td className="border border-border p-2">{it.quantity}</td>
              <td className="border border-border p-2 text-right">{fmtEUR(it.unitPrice)}</td>
              <td className="border border-border p-2 text-right">{it.vatRate}%</td>
              <td className="border border-border p-2 text-right font-medium">
                {fmtEUR(it.lineTotal || it.quantity * it.unitPrice)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {totals && (
        <div className="flex justify-end">
          <div className="w-full max-w-xs space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotaal</span>
              <span className="text-foreground">{fmtEUR(totals.subtotal)}</span>
            </div>
            {totals.discountAmount > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Korting</span>
                <span className="text-foreground">- {fmtEUR(totals.discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">BTW</span>
              <span className="text-foreground">{fmtEUR(totals.vatAmount)}</span>
            </div>
            <div className="flex justify-between border-t pt-1.5 mt-1.5 font-semibold text-base">
              <span className="text-foreground">Totaal incl. BTW</span>
              <span className="text-primary">{fmtEUR(totals.total)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
