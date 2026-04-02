import { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

interface PdfPageRendererProps {
  pdfUrl: string;
  pageNumber: number;
  width: number;
  onDimensionsReady?: (dims: { width: number; height: number }) => void;
}

export default function PdfPageRenderer({ pdfUrl, pageNumber, width, onDimensionsReady }: PdfPageRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        const pdf = await pdfjsLib.getDocument(pdfUrl).promise;
        if (cancelled) return;

        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;

        const viewport = page.getViewport({ scale: 1 });
        const scale = width / viewport.width;
        const scaledViewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;

        onDimensionsReady?.({ width: scaledViewport.width, height: scaledViewport.height });

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;
      } catch (err) {
        console.error('PDF render error:', err);
      }
    }

    if (width > 0) render();
    return () => { cancelled = true; };
  }, [pdfUrl, pageNumber, width]);

  return (
    <canvas
      ref={canvasRef}
      className="block w-full pointer-events-none"
    />
  );
}

export function usePdfPageCount(pdfUrl: string | null): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!pdfUrl) { setCount(0); return; }
    let cancelled = false;

    pdfjsLib.getDocument(pdfUrl).promise
      .then(pdf => { if (!cancelled) setCount(pdf.numPages); })
      .catch(() => { if (!cancelled) setCount(0); });

    return () => { cancelled = true; };
  }, [pdfUrl]);

  return count;
}
