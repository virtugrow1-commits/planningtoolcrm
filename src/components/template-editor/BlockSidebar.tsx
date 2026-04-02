import {
  Type, Image, Video, Table, List, SeparatorHorizontal,
  PenTool, TextCursorInput, CalendarDays, Stamp,
  CheckSquare, ClipboardList, X
} from 'lucide-react';
import type { BlockType } from '@/types/templateBlocks';
import { BLOCK_DEFINITIONS } from '@/types/templateBlocks';

const ICON_MAP: Record<string, React.ElementType> = {
  Type, Image, Video, Table, List, SeparatorHorizontal,
  PenTool, TextCursorInput, CalendarDays, Signature: Stamp,
  CheckSquare, ClipboardList,
};

interface BlockSidebarProps {
  open: boolean;
  onClose: () => void;
  onAddBlock: (type: BlockType) => void;
}

export default function BlockSidebar({ open, onClose, onAddBlock }: BlockSidebarProps) {
  if (!open) return null;

  const blokken = BLOCK_DEFINITIONS.filter(b => b.category === 'blokken');
  const invulvelden = BLOCK_DEFINITIONS.filter(b => b.category === 'invulvelden');

  const handleDragStart = (e: React.DragEvent, type: BlockType) => {
    e.dataTransfer.setData('newBlockType', type);
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div className="w-[220px] border-r bg-background flex flex-col sticky top-0 self-start h-screen max-h-screen z-20">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-sm font-medium text-foreground">Element toevoegen</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Blokken</p>
          <div className="grid grid-cols-3 gap-1.5">
            {blokken.map(def => {
              const Icon = ICON_MAP[def.icon] || Type;
              return (
                <button
                  key={def.type}
                  draggable
                  onDragStart={(e) => handleDragStart(e, def.type)}
                  onClick={() => onAddBlock(def.type)}
                  className="flex flex-col items-center gap-1 p-2 rounded-md border border-border hover:border-primary/50 hover:bg-accent transition-colors text-center cursor-grab active:cursor-grabbing"
                >
                  <Icon size={20} className="text-muted-foreground" />
                  <span className="text-[10px] text-foreground leading-tight">{def.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Invulbare velden</p>
          <div className="grid grid-cols-3 gap-1.5">
            {invulvelden.map(def => {
              const Icon = ICON_MAP[def.icon] || Type;
              return (
                <button
                  key={def.type}
                  draggable
                  onDragStart={(e) => handleDragStart(e, def.type)}
                  onClick={() => onAddBlock(def.type)}
                  className="flex flex-col items-center gap-1 p-2 rounded-md border border-border hover:border-primary/50 hover:bg-accent transition-colors text-center cursor-grab active:cursor-grabbing"
                >
                  <Icon size={20} className="text-muted-foreground" />
                  <span className="text-[10px] text-foreground leading-tight">{def.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
