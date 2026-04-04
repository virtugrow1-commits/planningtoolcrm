import { useState, useCallback, useRef, useEffect } from 'react';
import { Rnd } from 'react-rnd';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import BlockSidebar from './BlockSidebar';
import BlockRenderer from './BlockRenderer';
import BlockPropertiesPanel from './BlockPropertiesPanel';
import PdfBackgroundUpload from './PdfBackgroundUpload';
import PdfPageRenderer, { usePdfPageCount } from './PdfPageRenderer';
import type { TemplateBlock, BlockType } from '@/types/templateBlocks';
import { createDefaultBlock } from '@/types/templateBlocks';
import type { CustomFont } from './FontPicker';

interface BlockEditorProps {
  blocks: TemplateBlock[];
  onBlocksChange: (blocks: TemplateBlock[]) => void;
  pdfBackgroundUrl?: string | null;
  onPdfBackgroundChange?: (url: string | null) => void;
  customFonts?: CustomFont[];
  onCustomFontsChange?: (fonts: CustomFont[]) => void;
}

export default function BlockEditor({ blocks, onBlocksChange, pdfBackgroundUrl, onPdfBackgroundChange, customFonts = [], onCustomFontsChange }: BlockEditorProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [activePage, setActivePage] = useState(0);
  const [pageDimensions, setPageDimensions] = useState<Record<number, { width: number; height: number }>>({});
  const [containerWidth, setContainerWidth] = useState(800);
  const measureRef = useRef<HTMLDivElement>(null);

  const pageCount = usePdfPageCount(pdfBackgroundUrl || null);
  const hasPdf = !!pdfBackgroundUrl && pageCount > 0;
  const totalPages = hasPdf ? pageCount : 1;

  const selectedBlock = selectedBlockId ? blocks.find(b => b.id === selectedBlockId) : null;

  useEffect(() => {
    if (!measureRef.current) return;
    const obs = new ResizeObserver(entries => {
      for (const entry of entries) setContainerWidth(entry.contentRect.width);
    });
    obs.observe(measureRef.current);
    return () => obs.disconnect();
  }, []);

  const sortedBlocks = [...blocks].sort((a, b) => a.sortOrder - b.sortOrder);

  const blocksForPage = useCallback((pageIdx: number) => {
    return sortedBlocks.filter(b => (b.pageIndex ?? 0) === pageIdx);
  }, [sortedBlocks]);

  const addBlock = useCallback((type: BlockType, pageIdx?: number, x?: number, y?: number) => {
    const maxOrder = blocks.length > 0 ? Math.max(...blocks.map(b => b.sortOrder)) : -1;
    const newBlock = createDefaultBlock(type, maxOrder + 1);
    (newBlock as any).pageIndex = pageIdx ?? activePage;
    (newBlock as any).x = x ?? 40;
    (newBlock as any).y = y ?? 40;
    (newBlock as any).w = type === 'text' ? 300 : type === 'image' ? 200 : type === 'table' || type === 'product-list' ? 400 : 180;
    (newBlock as any).h = type === 'text' ? 60 : type === 'image' ? 150 : type === 'table' || type === 'product-list' ? 200 : 50;
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

  // Handle drop from sidebar (new block) or existing block
  const handlePageDrop = useCallback((e: React.DragEvent, pageIdx: number, containerEl: HTMLElement) => {
    e.preventDefault();
    const rect = containerEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const newBlockType = e.dataTransfer.getData('newBlockType') as BlockType;
    if (newBlockType) {
      addBlock(newBlockType, pageIdx, x, y);
      return;
    }
  }, [addBlock]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  return (
    <div className="flex border rounded-lg overflow-hidden bg-background min-h-[600px]">
      {/* Sidebar - sticky */}
      <BlockSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onAddBlock={addBlock}
      />

      {/* Main editor area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30 flex-wrap sticky top-0 z-10">
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

        {/* Document canvas */}
        <div
          className="flex-1 overflow-y-auto bg-muted/10 p-4 md:p-8"
          onClick={() => setSelectedBlockId(null)}
        >
          <div ref={measureRef} className="max-w-[800px] mx-auto space-y-6">
            {Array.from({ length: totalPages }, (_, pageIdx) => {
              const pageBlocks = blocksForPage(pageIdx);
              const dims = pageDimensions[pageIdx];
              const pageHeight = dims ? (dims.height / dims.width) * containerWidth : 1122;

              return (
                <div
                  key={pageIdx}
                  className={`relative bg-background shadow-sm rounded-lg border overflow-hidden transition-shadow ${
                    activePage === pageIdx ? 'ring-2 ring-primary/30' : ''
                  }`}
                  style={{ height: hasPdf ? pageHeight : 842 }}
                  onClick={(e) => { e.stopPropagation(); setActivePage(pageIdx); setSelectedBlockId(null); }}
                  onDrop={(e) => {
                    const el = e.currentTarget as HTMLElement;
                    handlePageDrop(e, pageIdx, el);
                  }}
                  onDragOver={handleDragOver}
                >
                  {/* Page label */}
                  <div className="absolute top-2 right-2 z-30 bg-muted/80 text-muted-foreground text-[10px] px-1.5 py-0.5 rounded pointer-events-none">
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

                  {/* Blocks layer with react-rnd */}
                  <div className="absolute inset-0 z-10">
                    {!hasPdf && pageBlocks.length === 0 && pageIdx === 0 && (
                      <div className="flex flex-col items-center justify-center h-full text-center p-8">
                        <Plus size={32} className="text-muted-foreground mb-3" />
                        <p className="text-sm text-muted-foreground">
                          Sleep elementen vanuit het paneel links naar deze pagina,
                          of upload een PDF als achtergrond.
                        </p>
                      </div>
                    )}

                    {hasPdf && pageBlocks.length === 0 && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <p className="text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded">
                          Sleep elementen naar deze pagina
                        </p>
                      </div>
                    )}

                    {pageBlocks.map((block, idx) => (
                      <Rnd
                        key={block.id}
                        position={{ x: block.x ?? 40, y: block.y ?? (20 + idx * 70) }}
                        size={{ width: block.w ?? 200, height: block.h ?? 60 }}
                        minWidth={80}
                        minHeight={30}
                        bounds="parent"
                        onDragStop={(_e, d) => {
                          updateBlock(block.id, { x: d.x, y: d.y } as any);
                        }}
                        onResizeStop={(_e, _dir, ref, _delta, pos) => {
                          updateBlock(block.id, {
                            w: ref.offsetWidth,
                            h: ref.offsetHeight,
                            x: pos.x,
                            y: pos.y,
                          } as any);
                        }}
                        className={`${selectedBlockId === block.id ? 'z-20' : 'z-10'}`}
                        enableResizing={{
                          top: false, right: true, bottom: true, left: false,
                          topRight: false, bottomRight: true, bottomLeft: false, topLeft: false,
                        }}
                        resizeHandleStyles={{
                          bottomRight: { width: 12, height: 12, bottom: 0, right: 0, cursor: 'nwse-resize' },
                          right: { width: 6, right: -3, cursor: 'ew-resize' },
                          bottom: { height: 6, bottom: -3, cursor: 'ns-resize' },
                        }}
                      >
                        <div className="w-full h-full overflow-visible">
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
                            customFonts={customFonts}
                            onCustomFontsChange={onCustomFontsChange}
                          />
                        </div>
                      </Rnd>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Properties panel - sticky right */}
      {selectedBlock && (
        <BlockPropertiesPanel
          block={selectedBlock}
          onUpdate={(updates) => updateBlock(selectedBlock.id, updates)}
        />
      )}
    </div>
  );
}
