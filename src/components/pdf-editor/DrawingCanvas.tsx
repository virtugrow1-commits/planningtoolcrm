import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import type { PdfAnnotation } from './types';

interface DrawingCanvasProps {
  width: number;
  height: number;
  annotations: PdfAnnotation[];
  scale: number;
  activeTool: 'draw' | 'highlight' | 'eraser' | null;
  activeColor: string;
  activeStrokeWidth: number;
  onStrokeComplete: (annotation: Omit<PdfAnnotation, 'id'>) => void;
  onEraseAt: (x: number, y: number) => void;
  pageIndex: number;
}

export interface DrawingCanvasRef {
  redraw: () => void;
}

const DrawingCanvas = forwardRef<DrawingCanvasRef, DrawingCanvasProps>(({
  width, height, annotations, scale, activeTool, activeColor,
  activeStrokeWidth, onStrokeComplete, onEraseAt, pageIndex,
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const pathRef = useRef<{ x: number; y: number }[]>([]);

  const drawAnnotations = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const drawAnns = annotations.filter((a) =>
      (a.type === 'draw' || a.type === 'highlight') && a.page === pageIndex && a.path && a.path.length > 1
    );

    for (const ann of drawAnns) {
      ctx.save();
      ctx.globalAlpha = ann.type === 'highlight' ? (ann.opacity ?? 0.35) : 1;
      ctx.strokeStyle = ann.color || '#000000';
      ctx.lineWidth = (ann.strokeWidth || 2) * scale;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (ann.type === 'highlight') {
        ctx.lineWidth = (ann.strokeWidth || 12) * scale;
      }
      ctx.beginPath();
      const pts = ann.path!;
      ctx.moveTo(pts[0].x * scale, pts[0].y * scale);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x * scale, pts[i].y * scale);
      }
      ctx.stroke();
      ctx.restore();
    }
  }, [annotations, scale, pageIndex]);

  useImperativeHandle(ref, () => ({ redraw: drawAnnotations }), [drawAnnotations]);

  useEffect(() => { drawAnnotations(); }, [drawAnnotations]);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
  };

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    if (!activeTool) return;
    e.preventDefault();
    if (activeTool === 'eraser') {
      const pos = getPos(e);
      onEraseAt(pos.x, pos.y);
      return;
    }
    isDrawingRef.current = true;
    pathRef.current = [getPos(e)];
  };

  const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!activeTool) return;
    e.preventDefault();
    if (activeTool === 'eraser') {
      if (('buttons' in e && e.buttons === 1) || 'touches' in e) {
        const pos = getPos(e);
        onEraseAt(pos.x, pos.y);
      }
      return;
    }
    if (!isDrawingRef.current) return;
    const pos = getPos(e);
    pathRef.current.push(pos);

    // Live preview
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    drawAnnotations();
    ctx.save();
    ctx.globalAlpha = activeTool === 'highlight' ? 0.35 : 1;
    ctx.strokeStyle = activeColor;
    ctx.lineWidth = (activeTool === 'highlight' ? 12 : activeStrokeWidth) * scale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const pts = pathRef.current;
    ctx.moveTo(pts[0].x * scale, pts[0].y * scale);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x * scale, pts[i].y * scale);
    }
    ctx.stroke();
    ctx.restore();
  };

  const handleEnd = () => {
    if (!isDrawingRef.current || !activeTool || activeTool === 'eraser') {
      isDrawingRef.current = false;
      return;
    }
    isDrawingRef.current = false;
    const pts = pathRef.current;
    if (pts.length < 2) return;

    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);

    onStrokeComplete({
      type: activeTool === 'highlight' ? 'highlight' : 'draw',
      page: pageIndex,
      x: minX,
      y: minY,
      width: Math.max(...xs) - minX,
      height: Math.max(...ys) - minY,
      path: pts,
      color: activeColor,
      strokeWidth: activeTool === 'highlight' ? 12 : activeStrokeWidth,
      opacity: activeTool === 'highlight' ? 0.35 : 1,
    });
    pathRef.current = [];
  };

  const isActive = activeTool === 'draw' || activeTool === 'highlight' || activeTool === 'eraser';

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={`absolute inset-0 ${isActive ? 'z-15' : 'z-5 pointer-events-none'}`}
      style={{
        cursor: activeTool === 'draw' ? 'crosshair' : activeTool === 'highlight' ? 'text' : activeTool === 'eraser' ? 'cell' : 'default',
        touchAction: 'none',
        zIndex: isActive ? 15 : 5,
      }}
      onMouseDown={handleStart}
      onMouseMove={handleMove}
      onMouseUp={handleEnd}
      onMouseLeave={handleEnd}
      onTouchStart={handleStart}
      onTouchMove={handleMove}
      onTouchEnd={handleEnd}
    />
  );
});

DrawingCanvas.displayName = 'DrawingCanvas';
export default DrawingCanvas;
