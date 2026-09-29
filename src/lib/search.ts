/** Normaliseert tekst alleen voor zoeken: geen hoofdletters, accenten of speciale tekens. Originele data blijft ongewijzigd. */
export function normalizeSearch(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9@.\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True als alle woorden uit de zoekterm in de (samengevoegde) velden voorkomen. */
export function matchesSearch(query: string, ...fields: unknown[]): boolean {
  const q = normalizeSearch(query);
  if (!q) return true;
  const hay = normalizeSearch(fields.filter(Boolean).join(' '));
  return q.split(' ').every((w) => hay.includes(w));
}
