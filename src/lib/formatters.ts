/**
 * Central formatters for raw CRM data → human-readable display values.
 * Prevents serialized strings, [object Object], null, etc. from appearing in the UI.
 */

const CRM_GROUP_LABELS: Record<string, string> = {
  huurder_kantoorruimte: 'Huurder kantoorruimte',
  huurder_hybride_enof_virtueel_kantoor: 'Huurder hybride/virtueel kantoor',
  kookstudio: 'Kookstudio',
  vergaderaccommodatie: 'Vergaderaccommodatie',
  horeca: 'Horeca',
  overige: 'Overige',
  oud_huurder: 'Oud-huurder',
};

/**
 * Parse PHP-serialized crm_group data into a readable comma-separated string.
 * Handles: `a:7:{i:0;a:2:{s:3:"key";s:21:"huurder_kantoorruimte";s:5:"value";s:1:"1";}...}`
 * Also handles already-parsed clean labels (idempotent).
 * Returns null if no active groups found or input is empty.
 */
export function parseCrmGroup(raw: string | null | undefined): string | null {
  if (!raw) return null;

  // Already a clean label (no PHP serialization markers)?
  if (!raw.startsWith('a:') && !raw.includes('{') && !raw.includes('"key"')) {
    // Could be an already-parsed value or a simple status key
    return raw;
  }

  const active: string[] = [];
  for (const [key, label] of Object.entries(CRM_GROUP_LABELS)) {
    // Match key + value "1" (string or int) in PHP serialized format
    const pattern = new RegExp(`"${key}".*?"value";(?:s:1:"|i:)1`, 's');
    if (pattern.test(raw)) active.push(label);
  }
  return active.length > 0 ? active.join(', ') : null;
}

/**
 * Safe display value: never shows null, undefined, [object Object], serialized data, or "?".
 * Returns fallback (default '—') for any non-displayable value.
 */
export function safeDisplay(value: unknown, fallback = '—'): string {
  if (value === null || value === undefined) return fallback;
  const str = String(value).trim();
  if (
    str === '' ||
    str === 'null' ||
    str === 'undefined' ||
    str === '?' ||
    str === '[object Object]' ||
    str.startsWith('a:') // PHP serialized
  ) {
    return fallback;
  }
  return str;
}

/**
 * Format any date-like value (ISO string, yyyy-MM-dd, Date) as Dutch
 * day-month-year: `dd-MM-yyyy`. Returns fallback for empty/invalid input.
 */
export function formatDate(value: string | Date | null | undefined, fallback = '—'): string {
  if (!value) return fallback;
  let d: Date;
  if (value instanceof Date) {
    d = value;
  } else {
    const s = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value;
    d = new Date(s);
  }
  if (isNaN(d.getTime())) return fallback;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

/** Same as formatDate but also appends HH:mm. */
export function formatDateTime(value: string | Date | null | undefined, fallback = '—'): string {
  if (!value) return fallback;
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return fallback;
  const base = formatDate(d, fallback);
  if (base === fallback) return fallback;
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${base} ${hh}:${mi}`;
}
