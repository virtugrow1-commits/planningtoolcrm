const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
};

function decodeEntity(entity: string): string {
  if (entity.startsWith('#x') || entity.startsWith('#X')) {
    const codePoint = Number.parseInt(entity.slice(2), 16);
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : `&${entity};`;
  }
  if (entity.startsWith('#')) {
    const codePoint = Number.parseInt(entity.slice(1), 10);
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : `&${entity};`;
  }
  return HTML_ENTITIES[entity.toLowerCase()] ?? `&${entity};`;
}

const LOOKS_LIKE_HTML = /<\/?(p|br|div|span|li|ul|ol|h[1-6]|strong|em|b|i|u|a|table|tr|td|th|tbody|font)\b[^<>]*>/i;

/** Convert rich-text task bodies to readable plain text before persistence. */
export function htmlToPlainText(value: string | null | undefined): string | null {
  if (!value) return null;
  // Only treat the text as HTML when it actually contains HTML tags; otherwise a
  // typed note like "Bel terug <na 17:00>" would lose the part between brackets.
  if (!LOOKS_LIKE_HTML.test(value)) return value.trim() || null;

  const text = value
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|li|h[1-6])\s*>/gi, '\n')
    .replace(/<\s*li(?:\s[^>]*)?>/gi, '• ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, entity: string) => decodeEntity(entity))
    .replace(/\r\n?/g, '\n')
    .replace(/[\t ]+\n/g, '\n')
    .replace(/\n[\t ]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[\t ]{2,}/g, ' ')
    .trim();

  return text || null;
}