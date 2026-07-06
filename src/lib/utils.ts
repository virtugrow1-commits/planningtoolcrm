import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Dutch tussenvoegsels — should stay lowercase unless they're the first word */
const DUTCH_TUSSENVOEGSELS = new Set([
  'van', 'de', 'den', 'der', 'des', 'ten', 'ter', 'te', 'het',
  'op', 'in', 'aan', 'bij', 'onder', 'over', 'uit', 'voor', 'tot',
  "'t", "'s", 'la', 'le', 'du', 'da', 'do', 'dos', 'das', 'di', 'del', 'della',
  'von', 'zu', 'af', 'al', 'el', 'y',
]);

/**
 * Normalize a name/string:
 *  - Preserves the user's own capitalization (does NOT force Title Case).
 *  - Always lowercases Dutch tussenvoegsels ("van", "de", "der", ...) wherever
 *    they appear, so "Van Der Berg" becomes "van der Berg".
 */
export function capitalizeWords(str: string): string {
  if (!str) return str;
  return str
    .split(/(\s+)/)
    .map((word) => {
      if (!word || /^\s+$/.test(word)) return word;
      if (DUTCH_TUSSENVOEGSELS.has(word.toLowerCase())) return word.toLowerCase();
      return word;
    })
    .join('');
}
