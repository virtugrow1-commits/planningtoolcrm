/**
 * Generic CSV export utility
 */

function escapeCSV(value: unknown, delimiter: string): string {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(delimiter) || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportToCSV<T extends Record<string, unknown>>(
  data: T[],
  columns: { key: string; label: string }[],
  filename: string,
  delimiter = ';'
) {
  const header = columns.map((c) => escapeCSV(c.label, delimiter)).join(delimiter);
  const rows = data.map((row) =>
    columns.map((c) => escapeCSV(row[c.key], delimiter)).join(delimiter)
  );
  // sep= hint so Excel uses the right delimiter regardless of locale settings
  const csv = [`sep=${delimiter}`, header, ...rows].join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
