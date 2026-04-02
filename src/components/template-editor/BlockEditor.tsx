import { useState, useCallback, useRef, useEffect } from 'react';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import BlockSidebar from './BlockSidebar';
import BlockRenderer from './BlockRenderer';
import PdfBackgroundUpload from './PdfBackgroundUpload';
import PdfPageRenderer, { usePdfPageCount } from './PdfPageRenderer';
import type { TemplateBlock, BlockType } from '@/types/templateBlocks';
import { createDefaultBlock } from '@/types/templateBlocks';

interface BlockEditorProps {
  blocks: TemplateBlock[];
  onBlocksChange: (blocks: TemplateBlock[]) => void;
  pdfBackgroundUrl?: string | null;
  onPdfBackgroundChange?: (url: string | null) => void;
}

export default function BlockEditor({ blocks, onBlocksChange, pdfBackgroundUrl, onPdfBackgroundChange }: BlockEditorProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [activePage, setActivePage] = useState(0);
  const [pageDimensions, setPageDimensions] = useState<Record<number, { width: number; height: number }>>({});
  const pageContainerRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [containerWidth, setContainerWidth] = useState(800);
  const measureRef = useRef<HTMLDivElement>(null);

  const pageCount = usePdfPageCount(pdfBackgroundUrl || null);
  const hasPdf = !!pdfBackgroundUrl && pageCount > 0;
  const totalPages = hasPdf ? pageCount : 1;

  // Measure container width
  useEffect(() => {
    if (!measureRef.current) return;
    const obs = new ResizeObserver(entries => {
      for (const entry of entries) setContainerWidth(entry.contentRect.width);
    });
    obs.observe(measureRef.current);
    return () => obs.disconnect();
  }, []);

  const sortedBlocks = [...blocks].sort((a, b) => a.sortOrder - b.sortOrder);

  // Get blocks for a specific page
  const blocksForPage = useCallback((pageIdx: number) => {
    return sortedBlocks.filter(b => (b.pageIndex ?? 0) === pageIdx);
  }, [sortedBlocks]);

  const addBlock = useCallback((type: BlockType) => {
    const maxOrder = blocks.length > 0 ? Math.max(...blocks.map(b => b.sortOrder)) : -1;
    const newBlock = createDefaultBlock(type, maxOrder + 1);
    // Place on active page, centered
    (newBlock as any).pageIndex = activePage;
    (newBlock as any).x = 10;
    (newBlock as any).y = 10;
    onBlocksChange([...blocks, newBlock]);
    setSelectedBlockId(newBlock.id);
  }, [blocks, onBlocksChange, activePage]);

  const updateBlock = useCallback((id: string, updates: Partial<TemplateBlock>) => {
    onBlocksChange(blocks.map(b => b.id === id ? { ...b, ...updates } as TemplateBlock : b));
  }, [blocks, onBlocksChange]);

  const deleteBlock = useCallback((id: string) => {
    onBlocksChange(blocks.filter(b => b.id !== id));
    if (selectedBlockId === id) setSelectedBlockId(null);
  }, [blocks, onBlocksChange, selectedBlockId]);

  const moveBlock = useCallback((id: string, direction: 'up' | 'down') => {
    const pageBlocks = blocksForPage(activePage);
    const idx = pageBlocks.findIndex(b => b.id === id);
    if ((direction === 'up' && idx === 0) || (direction === 'down' && idx === pageBlocks.length - 1)) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    const newBlocks = [...blocks];
    const aIdx = newBlocks.findIndex(b => b.id === pageBlocks[idx].id);
    const bIdx = newBlocks.findIndex(b => b.id === pageBlocks[swapIdx].id);
    const tempOrder = newBlocks[aIdx].sortOrder;
    newBlocks[aIdx] = { ...newBlocks[aIdx], sortOrder: newBlocks[bIdx].sortOrder } as TemplateBlock;
    newBlocks[bIdx] = { ...newBlocks[bIdx], sortOrder: tempOrder } as TemplateBlock;
    onBlocksChange(newBlocks);
  }, [blocks, onBlocksChange, activePage, blocksForPage]);

  // Handle drag on a page
  const handleDragStart = useCallback((e: React.DragEvent, blockId: string) => {
    e.dataTransfer.setData('blockId', blockId);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, pageIdx: number) => {
    e.preventDefault();
    const blockId = e.dataTransfer.getData('blockId');
    if (!blockId) return;

    const container = pageContainerRefs.current[pageIdx];
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    updateBlock(blockId, {
      pageIndex: pageIdx,
      x: Math.max(0, Math.min(85, x)),
      y: Math.max(0, Math.min(90, y)),
    } as any);
  }, [updateBlock]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  return (
    <div className="flex border rounded-lg overflow-hidden bg-background min-h-[600px]">
      {/* Sidebar */}
      <BlockSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onAddBlock={addBlock}
      />

      {/* Main editor area */}
      <div className="flex-1 flex flex-col">
        {/* Top bar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30 flex-wrap">
          {!sidebarOpen && (
            <Button variant="ghost" size="sm" onClick={() => setSidebarOpen(true)} className="gap-1.5 text-xs">
              <Plus size={14} /> Element
            </Button>
          )}

          {onPdfBackgroundChange && (
            <PdfBackgroundUpload
              pdfUrl={pdfBackgroundUrl || null}
              onPdfChange={onPdfBackgroundChange}
            />
          )}

          {/* Page navigator */}
          {totalPages > 1 && (
            <div className="flex items-center gap-1 ml-2">
              <Button
                variant="ghost" size="sm" className="h-7 w-7 p-0"
                disabled={activePage === 0}
                onClick={() => setActivePage(p => p - 1)}
              >
                <ChevronLeft size={14} />
              </Button>
              <span className="text-xs text-foreground font-medium min-w-[60px] text-center">
                Pagina {activePage + 1} / {totalPages}
              </span>
              <Button
                variant="ghost" size="sm" className="h-7 w-7 p-0"
                disabled={activePage >= totalPages - 1}
                onClick={() => setActivePage(p => p + 1)}
              >
                <ChevronRight size={14} />
              </Button>
            </div>
          )}

          <span className="text-xs text-muted-foreground ml-auto">
            {blocks.length} {blocks.length === 1 ? 'element' : 'elementen'}
            {hasPdf && ` · ${pageCount} pagina${pageCount > 1 ? "'s" : ''}`}
          </span>
        </div>

        {/* Document canvas - scrollable with all pages */}
        <div
          className="flex-1 overflow-y-auto bg-muted/10 p-4 md:p-8"
          onClick={() => setSelectedBlockId(null)}
        >
          <div ref={measureRef} className="max-w-[800px] mx-auto space-y-6">
            {Array.from({ length: totalPages }, (_, pageIdx) => {
              const pageBlocks = blocksForPage(pageIdx);
              const dims = pageDimensions[pageIdx];
              const pageHeight = dims ? (dims.height / dims.width) * containerWidth : 1122; // A4 ratio fallback

              return (
                <div
                  key={pageIdx}
                  className={`relative bg-background shadow-sm rounded-lg border overflow-hidden transition-shadow ${
                    activePage === pageIdx ? 'ring-2 ring-primary/30' : ''
                  }`}
                  style={{ minHeight: hasPdf ? pageHeight : 842 }}
                  onClick={(e) => { e.stopPropagation(); setActivePage(pageIdx); setSelectedBlockId(null); }}
                  onDrop={(e) => handleDrop(e, pageIdx)}
                  onDragOver={handleDragOver}
                  ref={(el) => { pageContainerRefs.current[pageIdx] = el; }}
                >
                  {/* Page label */}
                  <div className="absolute top-2 right-2 z-20 bg-muted/80 text-muted-foreground text-[10px] px-1.5 py-0.5 rounded">
                    Pagina {pageIdx + 1}
                  </div>

                  {/* PDF Background */}
                  {hasPdf && (
                    <div className="absolute inset-0 z-0 pointer-events-none">
                      <PdfPageRenderer
                        pdfUrl={pdfBackgroundUrl!}
                        pageNumber={pageIdx + 1}
                        width={containerWidth}
                        onDimensionsReady={(d) => setPageDimensions(prev => ({ ...prev, [pageIdx]: d }))}
                      />
                    </div>
                  )}

                  {/* Blocks layer */}
                  <div className="relative z-10 w-full h-full" style={{ minHeight: hasPdf ? pageHeight : 842 }}>
                    {!hasPdf && pageBlocks.length === 0 && pageIdx === 0 ? (
                      <div className="flex flex-col items-center justify-center py-20 text-center p-8">
                        <Plus size={32} className="text-muted-foreground mb-3" />
                        <p className="text-sm text-muted-foreground">
                          Gebruik het paneel links om elementen toe te voegen,
                          of upload een PDF als achtergrond.
                        </p>
                      </div>
                    ) : hasPdf && pageBlocks.length === 0 ? (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <p className="text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded">
                          Sleep elementen naar deze pagina
                        </p>
                      </div>
                    ) : null}

                    {pageBlocks.map((block, idx) => (
                      <div
                        key={block.id}
                        className="absolute cursor-move"
                        style={{
                          left: `${block.x ?? 5}%`,
                          top: `${block.y ?? (5 + idx * 8)}%`,
                          maxWidth: '80%',
                          minWidth: '120px',
                        }}
                        draggable
                        onDragStart={(e) => handleDragStart(e, block.id)}
                      >
                        <BlockRenderer
                          block={block}
                          selected={selectedBlockId === block.id}
                          onSelect={() => { setSelectedBlockId(block.id); setActivePage(pageIdx); }}
                          onUpdate={(updates) => updateBlock(block.id, updates)}
                          onDelete={() => deleteBlock(block.id)}
                          onMoveUp={() => moveBlock(block.id, 'up')}
                          onMoveDown={() => moveBlock(block.id, 'down')}
                          isFirst={idx === 0}
                          isLast={idx === pageBlocks.length - 1}
                        />
                      </div>
                    ))}

                    {/* Add block to this page */}
                    {activePage === pageIdx && (
                      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); setSidebarOpen(true); }}
                          className="text-xs gap-1.5 bg-background/90 shadow-sm"
                        >
                          <Plus size={14} /> Element toevoegen
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
