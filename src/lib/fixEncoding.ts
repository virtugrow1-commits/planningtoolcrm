/**
 * Fix common UTF-8 mojibake patterns (Latin-1 misinterpretation).
 * Used as a safety net for data that may have been stored with wrong encoding.
 */
const MOJIBAKE_MAP: [string, string][] = [
  ['Ã©', 'é'],
  ['Ã«', 'ë'],
  ['Ã¶', 'ö'],
  ['Ã¼', 'ü'],
  ['Ã¡', 'á'],
  ['Ã³', 'ó'],
  ['Ã¨', 'è'],
  ['Ã¯', 'ï'],
  ['Ã§', 'ç'],
  ['Ã®', 'î'],
  ['Ã¢', 'â'],
  ['Ã ', 'à'],
  ['Ã´', 'ô'],
  ['Ã»', 'û'],
  ['Ã±', 'ñ'],
  ['Ã¤', 'ä'],
  ['Ã¥', 'å'],
  ['Ã¦', 'æ'],
  ['Ã°', 'ð'],
  ['Ã½', 'ý'],
  ['Ã¿', 'ÿ'],
  ['Ã\u0096', 'Ö'],
  ['Ã\u009C', 'Ü'],
  ['Ã\u0084', 'Ä'],
  ['â\u0080\u0093', '–'],
  ['â\u0080\u0094', '—'],
  ['â\u0080\u0099', '''],
  ['â\u0080\u009C', '"'],
  ['â\u0080\u009D', '"'],
  ['Â©', '©'],
  ['Â®', '®'],
  ['Â ', ''], // non-breaking space artifact
];

export function fixEncoding(text: string | null | undefined): string {
  if (!text) return text ?? '';
  let result = text;
  for (const [bad, good] of MOJIBAKE_MAP) {
    result = result.replaceAll(bad, good);
  }
  return result;
}

/** Returns true if the string contains likely mojibake patterns */
export function hasMojibake(text: string | null | undefined): boolean {
  if (!text) return false;
  return /Ã[©«¶¼¡³¨¯§®¢ ´»±¤¥¦°½¿]/.test(text) || /â\u0080[\u0093\u0094\u0099\u009C\u009D]/.test(text);
}
