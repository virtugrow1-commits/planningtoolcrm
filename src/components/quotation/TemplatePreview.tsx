import { useEffect, useRef, useState } from 'react';
import PdfPageRenderer, { usePdfPageCount } from '@/components/template-editor/PdfPageRenderer';
import type { TemplateBlock, TextBlock, ImageBlock, ProductListBlock, TableBlock, DetailsBlock } from '@/types/templateBlocks';

interface TemplatePreviewProps {
  pdfUrl?: string | null;
  blocks: TemplateBlock[];
}

/**
 * Read-only preview that renders the template PDF background with blocks
 * positioned exactly as in the editor (using x/y/w/h per pageIndex).
 * Used in the "Voorbeeld" dialog so users see the document like the client will.
 */
export default function TemplatePreview({ pdfUrl, blocks }: TemplatePreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [pageDimensions, setPageDimensions] = useState<Record<number, { width: number; height: number }>>({});

  const hasPdf = !!pdfUrl;
  const pdfPageCount = usePdfPageCount(pdfUrl || null);

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

  if (!hasPdf && blocks.length === 0) {
    return (
      <div className="text-center text-sm text-muted-foreground py-12">
        Dit sjabloon heeft nog geen inhoud.
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full max-w-[800px] mx-auto space-y-6">
      {Array.from({ length: totalPages }, (_, pageIdx) => {
        const pageBlocks = blocksForPage(pageIdx);
        const dims = pageDimensions[pageIdx];
        const pageHeight = dims && containerWidth
          ? (dims.height / dims.width) * containerWidth
          : (hasPdf ? 1122 : 842);

        return (
          <div
            key={pageIdx}
            className="relative bg-background shadow-sm rounded-lg border overflow-hidden"
            style={{ height: pageHeight }}
          >
            {/* PDF Background */}
            {hasPdf && containerWidth > 0 && (
              <div className="absolute inset-0 z-0 pointer-events-none">
                <PdfPageRenderer
                  pdfUrl={pdfUrl!}
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
                  <PreviewBlock block={block} />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PreviewBlock({ block }: { block: TemplateBlock }) {
  switch (block.type) {
    case 'text':
      return <TextPreview block={block} />;
    case 'image':
      return <ImagePreview block={block} />;
    case 'product-list':
      return <ProductListPreview block={block} />;
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

function ProductListPreview({ block }: { block: ProductListBlock }) {
  const fmt = (n: number) =>
    new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n);
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
        {block.items.map((it) => (
          <tr key={it.id}>
            <td className="border border-border p-1.5">
              <div>{it.name}</div>
              {it.description && (
                <div className="text-xs text-muted-foreground">{it.description}</div>
              )}
            </td>
            <td className="border border-border p-1.5">{it.quantity}</td>
            <td className="border border-border p-1.5">{fmt(it.unitPrice)}</td>
            <td className="border border-border p-1.5 text-right">
              {fmt(it.quantity * it.unitPrice)}
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
