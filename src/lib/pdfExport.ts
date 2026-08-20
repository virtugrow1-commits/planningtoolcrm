import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const BRAND: [number, number, number] = [158, 82, 58]; // #9e523a
const ACCENT: [number, number, number] = [228, 187, 122]; // #e4bb7a

export interface PdfExportMeta {
  title: string;
  subtitle?: string;
  countLabel?: string;
}

export function exportToPDF<T extends Record<string, unknown>>(
  data: T[],
  columns: { key: string; label: string }[],
  filename: string,
  meta: PdfExportMeta
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  const fontSize = columns.length > 10 ? 6 : columns.length > 7 ? 7 : 8;

  autoTable(doc, {
    head: [columns.map((c) => c.label)],
    body: data.map((row) => columns.map((c) => String(row[c.key] ?? ''))),
    startY: 92,
    margin: { top: 92, right: 28, bottom: 34, left: 28 },
    styles: { fontSize, cellPadding: 3, overflow: 'linebreak', textColor: [40, 40, 40] },
    headStyles: { fillColor: BRAND, textColor: [255, 255, 255], fontStyle: 'bold', fontSize },
    alternateRowStyles: { fillColor: [250, 246, 240] },
    tableLineColor: ACCENT,
    tableLineWidth: 0.2,
    didDrawPage: () => {
      doc.setFillColor(...BRAND);
      doc.rect(0, 0, pageWidth, 6, 'F');

      doc.setTextColor(...BRAND);
      doc.setFontSize(16);
      doc.text(meta.title, 28, 40);

      doc.setTextColor(110, 110, 110);
      doc.setFontSize(9);
      if (meta.subtitle) doc.text(meta.subtitle, 28, 58);
      if (meta.countLabel) doc.text(meta.countLabel, 28, 74);

      const pageHeight = doc.internal.pageSize.getHeight();
      const page = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(140, 140, 140);
      doc.text(`Pagina ${page}`, pageWidth - 28, pageHeight - 16, { align: 'right' });
    },
  });

  doc.save(`${filename}.pdf`);
}
