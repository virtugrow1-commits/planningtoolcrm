import { useState, useRef, useEffect, useCallback } from 'react';
import type { PdfAnnotation } from './types';

interface AnnotationRendererProps {
  annotation: PdfAnnotation;
  scale: number;
  selected: boolean;
  onSelect: () => void;
  onUpdate: (updates: Partial<PdfAnnotation>) => void;
  onDelete: () => void;
  readOnly?: boolean;
}

export default function AnnotationRenderer({
  annotation: a, scale, selected, onSelect, onUpdate, onDelete, readOnly,
}: AnnotationRendererProps) {
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const dragStart = useRef<{ x: number; y: number; ax: number; ay: number } | null>(null);
  const resizeStart = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // Focus textarea on select for text/sticky
  useEffect(() => {
    if (selected && (a.type === 'text' || a.type === 'sticky') && textRef.current) {
      textRef.current.focus();
    }
  }, [selected, a.type]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect();
    dragStart.current = { x: e.clientX, y: e.clientY, ax: a.x, ay: a.y };
    setDragging(true);
  }, [a.x, a.y, onSelect, readOnly]);

  const handleResizeDown = useCallback((e: React.MouseEvent) => {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    resizeStart.current = { x: e.clientX, y: e.clientY, w: a.width, h: a.height };
    setResizing(true);
  }, [a.width, a.height, readOnly]);

  useEffect(() => {
    if (!dragging && !resizing) return;
    const handleMove = (e: MouseEvent) => {
      if (dragging && dragStart.current) {
        const dx = (e.clientX - dragStart.current.x) / scale;
        const dy = (e.clientY - dragStart.current.y) / scale;
        onUpdate({ x: Math.max(0, Math.round(dragStart.current.ax + dx)), y: Math.max(0, Math.round(dragStart.current.ay + dy)) });
      }
      if (resizing && resizeStart.current) {
        const dx = (e.clientX - resizeStart.current.x) / scale;
        const dy = (e.clientY - resizeStart.current.y) / scale;
        onUpdate({ width: Math.max(30, Math.round(resizeStart.current.w + dx)), height: Math.max(20, Math.round(resizeStart.current.h + dy)) });
      }
    };
    const handleUp = () => { setDragging(false); setResizing(false); };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => { window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp); };
  }, [dragging, resizing, scale, onUpdate]);

  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    left: a.x * scale,
    top: a.y * scale,
    width: a.width * scale,
    height: a.height * scale,
    zIndex: selected ? 20 : 10,
  };

  // Draw / highlight paths rendered in parent canvas, not here
  if (a.type === 'draw' || a.type === 'highlight') return null;

  const renderContent = () => {
    switch (a.type) {
      case 'text':
        return (
          <textarea
            ref={textRef}
            value={a.content || ''}
            onChange={(e) => onUpdate({ content: e.target.value })}
            readOnly={readOnly}
            className="w-full h-full bg-transparent border-none outline-none resize-none p-1"
            style={{
              fontSize: (a.fontSize || 14) * scale,
              fontWeight: a.fontWeight || 'normal',
              fontStyle: a.fontStyle || 'normal',
              color: a.color || '#000000',
              textAlign: a.textAlign || 'left',
              fontFamily: a.fontFamily || 'Inter, sans-serif',
              lineHeight: 1.3,
            }}
            placeholder="Typ hier..."
          />
        );
      case 'sticky':
        return (
          <div
            className="w-full h-full rounded shadow-md p-2 overflow-hidden flex flex-col"
            style={{ backgroundColor: a.stickyColor || '#FEF08A' }}
          >
            <textarea
              ref={textRef}
              value={a.content || ''}
              onChange={(e) => onUpdate({ content: e.target.value })}
              readOnly={readOnly}
              className="flex-1 w-full bg-transparent border-none outline-none resize-none text-gray-800"
              style={{ fontSize: (a.fontSize || 12) * scale, lineHeight: 1.3 }}
              placeholder="Notitie..."
            />
          </div>
        );
      case 'signature':
        return a.signatureDataUrl ? (
          <img src={a.signatureDataUrl} alt="Handtekening" className="w-full h-full object-contain" />
        ) : (
          <div className="w-full h-full border-2 border-dashed border-gray-300 rounded flex items-center justify-center">
            <span className="text-xs text-gray-400">Klik om te tekenen</span>
          </div>
        );
      case 'checkbox':
        return (
          <div className="flex items-center gap-2 h-full px-1" style={{ fontSize: (a.fontSize || 14) * scale }}>
            <input
              type="checkbox"
              checked={a.checked || false}
              onChange={(e) => onUpdate({ checked: e.target.checked })}
              disabled={readOnly}
              className="w-4 h-4 accent-blue-600"
              style={{ transform: `scale(${scale})`, transformOrigin: 'left center' }}
            />
            <span className="text-sm text-gray-800 truncate" style={{ fontSize: (a.fontSize || 13) * scale }}>
              {a.label || 'Checkbox'}
            </span>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div
      style={baseStyle}
      className={`group ${readOnly ? '' : 'cursor-move'} ${
        selected ? 'ring-2 ring-primary' : 'ring-1 ring-transparent hover:ring-primary/30'
      }`}
      onMouseDown={handleMouseDown}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
    >
      {renderContent()}

      {/* Selection handles */}
      {selected && !readOnly && (
        <>
          <button
            className="absolute -top-2.5 -right-2.5 w-5 h-5 bg-destructive text-white rounded-full flex items-center justify-center text-xs hover:scale-110 transition-transform z-30"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
          >×</button>
          <div
            className="absolute bottom-0 right-0 w-3 h-3 bg-primary rounded-tl cursor-se-resize z-30"
            onMouseDown={handleResizeDown}
          />
        </>
      )}
    </div>
  );
}
