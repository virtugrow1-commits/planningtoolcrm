import { useState, useCallback, useRef, useEffect } from 'react';
import { Plus } from 'lucide-react';
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
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(800);

  const sortedBlocks = [...blocks].sort((a, b) => a.sortOrder - b.sortOrder);
  const pageCount = usePdfPageCount(pdfBackgroundUrl || null);

  // Measure canvas width for PDF rendering
  useEffect(() => {
    if (!canvasRef.current) return;
    const obs = new ResizeObserver(entries => {
      for (const entry of entries) {
        setCanvasWidth(entry.contentRect.width);
      }
    });
    obs.observe(canvasRef.current);
    return () => obs.disconnect();
  }, []);

  const addBlock = useCallback((type: BlockType) => {
    const maxOrder = blocks.length > 0 ? Math.max(...blocks.map(b => b.sortOrder)) : -1;
    const newBlock = createDefaultBlock(type, maxOrder + 1);
    onBlocksChange([...blocks, newBlock]);
    setSelectedBlockId(newBlock.id);
  }, [blocks, onBlocksChange]);

  const updateBlock = useCallback((id: string, updates: Partial<TemplateBlock>) => {
    onBlocksChange(blocks.map(b => b.id === id ? { ...b, ...updates } as TemplateBlock : b));
  }, [blocks, onBlocksChange]);

  const deleteBlock = useCallback((id: string) => {
    onBlocksChange(blocks.filter(b => b.id !== id));
    if (selectedBlockId === id) setSelectedBlockId(null);
  }, [blocks, onBlocksChange, selectedBlockId]);

  const moveBlock = useCallback((id: string, direction: 'up' | 'down') => {
    const idx = sortedBlocks.findIndex(b => b.id === id);
    if ((direction === 'up' && idx === 0) || (direction === 'down' && idx === sortedBlocks.length - 1)) return;

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    const newBlocks = [...sortedBlocks];
    const tempOrder = newBlocks[idx].sortOrder;
    newBlocks[idx] = { ...newBlocks[idx], sortOrder: newBlocks[swapIdx].sortOrder } as TemplateBlock;
    newBlocks[swapIdx] = { ...newBlocks[swapIdx], sortOrder: tempOrder } as TemplateBlock;
    onBlocksChange(newBlocks);
  }, [sortedBlocks, onBlocksChange]);

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
        <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30">
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

          <span className="text-xs text-muted-foreground ml-auto">
            {blocks.length} {blocks.length === 1 ? 'element' : 'elementen'}
            {pdfBackgroundUrl && pageCount > 0 && ` · ${pageCount} PDF pagina${pageCount > 1 ? "'s" : ''}`}
          </span>
        </div>

        {/* Document canvas */}
        <div
          className="flex-1 overflow-y-auto bg-muted/10 p-4 md:p-8"
          onClick={() => setSelectedBlockId(null)}
        >
          <div
            ref={canvasRef}
            className="max-w-[800px] mx-auto bg-background shadow-sm rounded-lg border min-h-[842px] relative"
          >
            {/* PDF Background layer */}
            {pdfBackgroundUrl && pageCount > 0 && (
              <div className="absolute inset-0 overflow-hidden rounded-lg pointer-events-none z-0">
                {Array.from({ length: pageCount }, (_, i) => (
                  <PdfPageRenderer
                    key={i}
                    pdfUrl={pdfBackgroundUrl}
                    pageNumber={i + 1}
                    width={canvasWidth}
                  />
                ))}
              </div>
            )}

            {/* Content layer */}
            <div className="relative z-10 p-8 md:p-12 space-y-4">
              {sortedBlocks.length === 0 && !pdfBackgroundUrl ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <Plus size={32} className="text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">
                    Gebruik het paneel links om elementen aan je document toe te voegen,
                    of upload een PDF als achtergrond.
                  </p>
                </div>
              ) : sortedBlocks.length === 0 && pdfBackgroundUrl ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <p className="text-sm text-muted-foreground bg-background/80 px-3 py-1.5 rounded">
                    PDF achtergrond geladen – voeg nu elementen toe bovenop de PDF
                  </p>
                </div>
              ) : (
                sortedBlocks.map((block, idx) => (
                  <BlockRenderer
                    key={block.id}
                    block={block}
                    selected={selectedBlockId === block.id}
                    onSelect={() => setSelectedBlockId(block.id)}
                    onUpdate={(updates) => updateBlock(block.id, updates)}
                    onDelete={() => deleteBlock(block.id)}
                    onMoveUp={() => moveBlock(block.id, 'up')}
                    onMoveDown={() => moveBlock(block.id, 'down')}
                    isFirst={idx === 0}
                    isLast={idx === sortedBlocks.length - 1}
                  />
                ))
              )}

              {/* Add block button at bottom */}
              {(sortedBlocks.length > 0 || pdfBackgroundUrl) && (
                <div className="flex justify-center pt-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); setSidebarOpen(true); }}
                    className="text-xs text-muted-foreground gap-1.5 bg-background/80"
                  >
                    <Plus size={14} /> Element toevoegen
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
