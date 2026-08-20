import * as XLSX from 'xlsx';

/** Columns whose values must stay text (leading zeros / + signs). */
const TEXT_KEYS = new Set(['phone', 'postcode', 'displayNumber']);

export function exportToXLSX<T extends Record<string, unknown>>(
  data: T[],
  columns: { key: string; label: string }[],
  filename: string,
  sheetName = 'Export'
) {
  const aoa: unknown[][] = [
    columns.map((c) => c.label),
    ...data.map((row) =>
      columns.map((c) => {
        const value = row[c.key];
        if (value == null) return '';
        return TEXT_KEYS.has(c.key) ? String(value) : value;
      })
    ),
  ];

  const sheet = XLSX.utils.aoa_to_sheet(aoa);

  // Bold header row
  for (let i = 0; i < columns.length; i++) {
    const ref = XLSX.utils.encode_cell({ r: 0, c: i });
    if (sheet[ref]) sheet[ref].s = { font: { bold: true } };
  }

  // Column widths based on content length
  sheet['!cols'] = columns.map((c, i) => {
    const longest = data.reduce((max, row) => {
      const len = String(row[c.key] ?? '').length;
      return len > max ? len : max;
    }, c.label.length);
    return { wch: Math.min(Math.max(longest + 2, 10), 45) };
  });

  sheet['!freeze'] = { xSplit: '0', ySplit: '1' };
  sheet['!autofilter'] = {
    ref: XLSX.utils.encode_range(
      { r: 0, c: 0 },
      { r: data.length, c: Math.max(columns.length - 1, 0) }
    ),
  };

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName.slice(0, 31));
  XLSX.writeFile(book, `${filename}.xlsx`);
}
