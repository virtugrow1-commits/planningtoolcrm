import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Dutch tussenvoegsels — should always stay lowercase */
const DUTCH_TUSSENVOEGSELS = new Set([
  'van', 'de', 'den', 'der', 'des', 'ten', 'ter', 'te', 'het',
  'op', 'in', 'aan', 'bij', 'onder', 'over', 'uit', 'voor', 'tot', 'en',
  "'t", "'s", 'la', 'le', 'du', 'da', 'do', 'dos', 'das', 'di', 'del', 'della',
  'von', 'zu', 'af', 'al', 'el', 'y',
]);

/**
 * Normalize a name/string:
 *  - Preserves the user's own capitalization (does NOT force Title Case).
 *  - Always lowercases Dutch tussenvoegsels ("van", "de", "der", ...) wherever
 *    they appear, so "Van Der Berg" becomes "van der Berg".
 *  - Keeps the Dutch "IJ" digraph intact at the start of a word ("IJsbrand").
 */
export function capitalizeWords(str: string): string {
  if (!str) return str;
  return str
    .split(/(\s+)/)
    .map((word) => {
      if (!word || /^\s+$/.test(word)) return word;
      if (DUTCH_TUSSENVOEGSELS.has(word.toLowerCase())) return word.toLowerCase();
      // "Ijsbrand" / "Ijmuiden" -> "IJsbrand" / "IJmuiden"
      if (/^Ij[a-z]/.test(word)) return 'IJ' + word.slice(2);
      return word;
    })
    .join('');
}

