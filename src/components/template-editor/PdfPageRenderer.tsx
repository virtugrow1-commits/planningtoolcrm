import { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

// Set worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

interface PdfPageRendererProps {
  pdfUrl: string;
  pageNumber: number;
  width: number;
}

export default function PdfPageRenderer({ pdfUrl, pageNumber, width }: PdfPageRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

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
        setDimensions({ width: scaledViewport.width, height: scaledViewport.height });

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;
      } catch (err) {
        console.error('PDF render error:', err);
      }
    }

    render();
    return () => { cancelled = true; };
  }, [pdfUrl, pageNumber, width]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{
        width: dimensions ? dimensions.width : '100%',
        height: dimensions ? dimensions.height : 'auto',
      }}
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
