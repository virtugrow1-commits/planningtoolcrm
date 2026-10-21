/** Dutch tussenvoegsels: lowercase when they appear after the first word of a person name. */
const PARTICLES = new Set([
  'van', 'de', 'den', 'der', 'des', 'ten', 'ter', 'te', 'het', "'t", "'s",
  'op', 'in', 'aan', 'bij', 'uit', 'voor', 'onder', 'over', 'tot',
  'la', 'le', 'du', 'da', 'di', 'del', 'della', 'von', 'zu', 'dos', 'das',
]);

/** Capitalize the first letter only; keep the rest as typed. "ij…" becomes "IJ…". */
function capFirst(part: string): string {
  if (!part) return part;
  if (/^ij/i.test(part)) return 'IJ' + part.slice(2);
  return part.charAt(0).toUpperCase() + part.slice(1);
}

function capWord(word: string): string {
  return word.split('-').map(capFirst).join('-');
}

/**
 * Person name (first name, last name or full name):
 * keeps the user's own capitals, starts every name part with a capital (IJ as one letter),
 * and lowercases tussenvoegsels that are not the first word.
 */
export function normalizePersonName(str: string, opts: { infix?: boolean } = {}): string {
  if (!str) return str;
  const words = str.trim().split(/\s+/);
  if (opts.infix) return words.map((w) => w.toLowerCase()).join(' ');
  return words
    .map((w, i) => (i > 0 && PARTICLES.has(w.toLowerCase()) ? w.toLowerCase() : capWord(w)))
    .join(' ');
}

/** Company name: kept exactly as typed, only the first letter is made a capital. */
export function normalizeCompanyName(str: string): string {
  if (!str) return str;
  const t = str.trim();
  return capFirst(t);
}
