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

/** Capitalize first letter of each word, keeping Dutch tussenvoegsels lowercase */
export function capitalizeWords(str: string): string {
  if (!str) return str;
  return str
    .split(/(\s+)/) // preserve whitespace between words
    .map((word, idx) => {
      if (!word || /^\s+$/.test(word)) return word;
      const lower = word.toLowerCase();
      if (idx > 0 && DUTCH_TUSSENVOEGSELS.has(lower)) return lower;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join('');
}
