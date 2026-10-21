/** Dutch tussenvoegsels (and the connector "en"): lowercase unless they open a first/full name. */
const PARTICLES = new Set([
  'van', 'de', 'den', 'der', 'des', 'ten', 'ter', 'te', 'het', "'t", "'s",
  'op', 'in', 'aan', 'bij', 'uit', 'voor', 'onder', 'over', 'tot',
  'la', 'le', 'du', 'da', 'di', 'del', 'della', 'von', 'zu', 'dos', 'das', 'en',
]);

/** Capitalize the first letter only; keep the rest as typed. "ij…" becomes "IJ…". */
function capFirst(part: string): string {
  if (!part) return part;
  if (/^ij/i.test(part)) return 'IJ' + part.slice(2);
  return part.charAt(0).toUpperCase() + part.slice(1);
}

/**
 * Person name. Keeps the user's own capitals, starts every name part with a capital
 * (IJ counts as one letter) and keeps tussenvoegsels lowercase. A tussenvoegsel that opens
 * a first or full name gets a capital; in a last-name field it stays lowercase ("van Pelt").
 */
export function normalizePersonName(str: string, opts: { infix?: boolean; lastName?: boolean } = {}): string {
  if (!str) return str;
  const words = str.trim().split(/\s+/);
  if (opts.infix) return words.map((w) => w.toLowerCase()).join(' ');
  return words
    .map((w, i) =>
      w.split('-').map((p, j) =>
        PARTICLES.has(p.toLowerCase()) && (i > 0 || j > 0 || opts.lastName) ? p.toLowerCase() : capFirst(p),
      ).join('-'),
    )
    .join(' ');
}

/** Company name: kept exactly as typed, only the first letter is made a capital. */
export function normalizeCompanyName(str: string): string {
  if (!str) return str;
  return capFirst(str.trim());
}
