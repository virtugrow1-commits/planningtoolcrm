import {
  MousePointer2, Type, Pencil, Highlighter, StickyNote,
  PenTool, Square, Eraser, Minus, Plus, Bold, Italic,
  AlignLeft, AlignCenter, AlignRight, Undo2, Redo2, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { AnnotationTool, PdfAnnotation } from './types';

const TOOLS: { tool: AnnotationTool; icon: any; label: string }[] = [
  { tool: 'select', icon: MousePointer2, label: 'Selecteren' },
  { tool: 'text', icon: Type, label: 'Tekst' },
  { tool: 'draw', icon: Pencil, label: 'Tekenen' },
  { tool: 'highlight', icon: Highlighter, label: 'Markeren' },
  { tool: 'sticky', icon: StickyNote, label: 'Notitie' },
  { tool: 'signature', icon: PenTool, label: 'Handtekening' },
  { tool: 'checkbox', icon: Square, label: 'Checkbox' },
  { tool: 'eraser', icon: Eraser, label: 'Wisser' },
];

const COLORS = [
  '#000000', '#DC2626', '#2563EB', '#16A34A', '#CA8A04',
  '#9333EA', '#EA580C', '#0891B2', '#64748B',
];

const STROKE_WIDTHS = [1, 2, 3, 5, 8];

interface PdfEditorToolbarProps {
  activeTool: AnnotationTool;
  activeColor: string;
  activeStrokeWidth: number;
  activeFontSize: number;
  selectedAnnotation: PdfAnnotation | null;
  onToolChange: (tool: AnnotationTool) => void;
  onColorChange: (color: string) => void;
  onStrokeWidthChange: (w: number) => void;
  onFontSizeChange: (s: number) => void;
  onAnnotationUpdate: (id: string, updates: Partial<PdfAnnotation>) => void;
  onDeleteSelected: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export default function PdfEditorToolbar({
  activeTool, activeColor, activeStrokeWidth, activeFontSize,
  selectedAnnotation, onToolChange, onColorChange, onStrokeWidthChange,
  onFontSizeChange, onAnnotationUpdate, onDeleteSelected,
  onUndo, onRedo, canUndo, canRedo,
}: PdfEditorToolbarProps) {
  const showTextOptions = activeTool === 'text' || selectedAnnotation?.type === 'text' || selectedAnnotation?.type === 'sticky';
  const showDrawOptions = activeTool === 'draw' || activeTool === 'highlight';

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-1 p-2 bg-card border rounded-lg shadow-sm flex-wrap">
        {/* Tool buttons */}
        {TOOLS.map(({ tool, icon: Icon, label }) => (
          <Tooltip key={tool}>
            <TooltipTrigger asChild>
              <Button
                variant={activeTool === tool ? 'default' : 'ghost'}
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => onToolChange(tool)}
              >
                <Icon size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p>{label}</p></TooltipContent>
          </Tooltip>
        ))}

        <Separator orientation="vertical" className="h-6 mx-1" />

        {/* Undo/Redo */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onUndo} disabled={!canUndo}>
              <Undo2 size={16} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom"><p>Ongedaan maken</p></TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onRedo} disabled={!canRedo}>
              <Redo2 size={16} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom"><p>Opnieuw</p></TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="h-6 mx-1" />

        {/* Color picker */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 px-2 gap-1.5">
              <div className="w-4 h-4 rounded-full border border-border" style={{ backgroundColor: activeColor }} />
              <span className="text-xs">Kleur</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="start">
            <div className="grid grid-cols-5 gap-1.5">
              {COLORS.map((c) => (
                <button
                  key={c}
                  className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${
                    activeColor === c ? 'border-primary scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                  onClick={() => onColorChange(c)}
                />
              ))}
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <input
                type="color"
                value={activeColor}
                onChange={(e) => onColorChange(e.target.value)}
                className="w-7 h-7 rounded cursor-pointer border-0"
              />
              <span className="text-xs text-muted-foreground font-mono">{activeColor}</span>
            </div>
          </PopoverContent>
        </Popover>

        {/* Draw options */}
        {showDrawOptions && (
          <>
            <Separator orientation="vertical" className="h-6 mx-1" />
            <div className="flex items-center gap-1">
              {STROKE_WIDTHS.map((w) => (
                <Tooltip key={w}>
                  <TooltipTrigger asChild>
                    <Button
                      variant={activeStrokeWidth === w ? 'secondary' : 'ghost'}
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => onStrokeWidthChange(w)}
                    >
                      <div className="rounded-full bg-foreground" style={{ width: w + 4, height: w + 4 }} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom"><p>{w}px</p></TooltipContent>
                </Tooltip>
              ))}
            </div>
          </>
        )}

        {/* Text options */}
        {showTextOptions && (
          <>
            <Separator orientation="vertical" className="h-6 mx-1" />
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => onFontSizeChange(Math.max(8, activeFontSize - 2))}>
                <Minus size={14} />
              </Button>
              <span className="text-xs w-6 text-center tabular-nums">{activeFontSize}</span>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => onFontSizeChange(Math.min(72, activeFontSize + 2))}>
                <Plus size={14} />
              </Button>

              {selectedAnnotation && (
                <>
                  <Button
                    variant={selectedAnnotation.fontWeight === 'bold' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => onAnnotationUpdate(selectedAnnotation.id, { fontWeight: selectedAnnotation.fontWeight === 'bold' ? 'normal' : 'bold' })}
                  >
                    <Bold size={14} />
                  </Button>
                  <Button
                    variant={selectedAnnotation.fontStyle === 'italic' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => onAnnotationUpdate(selectedAnnotation.id, { fontStyle: selectedAnnotation.fontStyle === 'italic' ? 'normal' : 'italic' })}
                  >
                    <Italic size={14} />
                  </Button>
                  <Separator orientation="vertical" className="h-5 mx-0.5" />
                  {(['left', 'center', 'right'] as const).map((align) => {
                    const AlignIcon = align === 'left' ? AlignLeft : align === 'center' ? AlignCenter : AlignRight;
                    return (
                      <Button
                        key={align}
                        variant={selectedAnnotation.textAlign === align ? 'secondary' : 'ghost'}
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => onAnnotationUpdate(selectedAnnotation.id, { textAlign: align })}
                      >
                        <AlignIcon size={14} />
                      </Button>
                    );
                  })}
                </>
              )}
            </div>
          </>
        )}

        {/* Delete selected */}
        {selectedAnnotation && (
          <>
            <Separator orientation="vertical" className="h-6 mx-1" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={onDeleteSelected}>
                  <Trash2 size={16} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom"><p>Verwijder</p></TooltipContent>
            </Tooltip>
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
