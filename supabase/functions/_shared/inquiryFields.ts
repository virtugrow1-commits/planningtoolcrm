// Shared inquiry field mapping for CliqCRM/GHL ingestion.
// Used by ghl-webhook, ghl-auto-sync and ghl-enrich-inquiry so that a form
// submission always lands in the same CRM fields, regardless of entry point.

export const GHL_API_BASE = 'https://services.leadconnectorhq.com';

/** Known form/custom field labels that may show up as top-level payload keys */
export const KNOWN_FORM_KEYS = [
  'Type Evenement', 'Type evenement', 'Type gelegenheid', 'Soort evenement', 'Soort bijeenkomst',
  'Aantal gasten', 'Aantal personen', 'Aantal deelnemers',
  'Selecteer de gewenste datum', 'Gewenste datum', 'Datum', 'Voorkeursdatum',
  'Kies je dagdeel', 'Selecteer dagdeel', 'Dagdeel',
  'Starttijd', 'Begintijd', 'Aanvangstijd', 'Van', 'Eindtijd', 'Tot',
  'Gewenste zaalopstelling', 'Zaalopstelling', 'Gewenste ruimte', 'Zaal',
  'Gewenste catering', 'Catering',
  'Extra informatie', 'Opmerkingen', 'Toelichting', 'Vraag', 'Bericht',
  'Speciale Benodigdheden', 'Na-zit gewenst?', 'Service Type',
  'Bedrijfsnaam', 'Bedrijf', 'Naam bedrijf', 'Organisatie',
  'Budget', 'KVK', 'BTW',
];

export type FieldMap = Record<string, string>;

/** Normalize a company name for matching ("Acme B.V." === "acme bv") */
export function normalizeCompanyName(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/\bb\.?\s*v\.?\b/g, 'bv')
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// --- Custom field definitions (id -> label), cached per isolate ---
let cachedFieldDefs: Record<string, string> | null = null;
let cachedFieldDefsAt = 0;
const CACHE_TTL = 30 * 60 * 1000;

export async function loadFieldDefs(headers: Record<string, string>, locationId?: string | null): Promise<Record<string, string>> {
  if (!locationId) return cachedFieldDefs || {};
  if (cachedFieldDefs && Date.now() - cachedFieldDefsAt < CACHE_TTL) return cachedFieldDefs;
  try {
    const res = await fetch(`${GHL_API_BASE}/locations/${locationId}/customFields`, { headers });
    if (!res.ok) { await res.text(); return cachedFieldDefs || {}; }
    const data = await res.json();
    const fields = data.customFields || data || [];
    const map: Record<string, string> = {};
    for (const f of fields) {
      if (f?.id && f?.name) map[f.id] = f.name;
    }
    cachedFieldDefs = map;
    cachedFieldDefsAt = Date.now();
    return map;
  } catch {
    return cachedFieldDefs || {};
  }
}

/**
 * Build a lowercase label -> value map from any mix of webhook payloads,
 * GHL objects with customFields arrays, and already-flat maps.
 */
export function buildFieldMap(sources: any[], fieldDefs: Record<string, string> = {}): FieldMap {
  const fieldMap: FieldMap = {};
  const put = (rawKey: string, rawVal: any) => {
    const key = String(rawKey || '').trim().toLowerCase();
    const value = Array.isArray(rawVal) ? rawVal.filter(Boolean).join(', ') : String(rawVal ?? '').trim();
    if (!key || !value) return;
    if (!fieldMap[key]) fieldMap[key] = value;
  };

  for (const src of sources.filter(Boolean)) {
    // Top-level known labels
    for (const key of KNOWN_FORM_KEYS) put(key, src[key]);

    // Any other top-level key that looks like a label (contains a space or is Dutch-ish)
    for (const [k, v] of Object.entries(src)) {
      if (typeof v !== 'string' && typeof v !== 'number') continue;
      if (/^(id|contactId|contact_id|locationId|pipelineId|pipelineStageId|userId|assignedTo|dateAdded|type|webhookId)$/i.test(k)) continue;
      if (/[ ?]/.test(k)) put(k, v);
    }

    // customFields arrays (opportunity / contact)
    const cfs = src.customFields || src.custom_fields || src.customField || [];
    for (const cf of Array.isArray(cfs) ? cfs : []) {
      const label = cf?.name || cf?.fieldName || cf?.key || fieldDefs[cf?.id] || cf?.id || '';
      const value = cf?.value ?? cf?.fieldValue ?? cf?.field_value ?? '';
      put(label, value);
    }
  }

  return fieldMap;
}

/** Fuzzy lookup: exact label first, then substring match */
export function makeFuzzyFind(fieldMap: FieldMap) {
  return (...terms: string[]): string => {
    for (const term of terms) {
      const v = fieldMap[term.toLowerCase()];
      if (v) return v;
    }
    for (const term of terms) {
      for (const [key, value] of Object.entries(fieldMap)) {
        if (value && key.includes(term.toLowerCase())) return value;
      }
    }
    return '';
  };
}

const MONTHS: Record<string, string> = {
  januari: '01', februari: '02', maart: '03', april: '04', mei: '05', juni: '06',
  juli: '07', augustus: '08', september: '09', oktober: '10', november: '11', december: '12',
  january: '01', february: '02', march: '03', may: '05', june: '06', july: '07',
  august: '08', october: '10',
};

/** Parse a date from the many formats GHL forms produce into yyyy-MM-dd */
export function parseFormDate(input?: string | null): string | null {
  if (!input) return null;
  const raw = String(input).trim();
  if (!raw) return null;

  let m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  m = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;

  m = raw.match(/^(\d{1,2})\s+([A-Za-zé]+)\s+(\d{4})/);
  if (m) {
    const mm = MONTHS[m[2].toLowerCase()];
    if (mm) return `${m[3]}-${mm}-${m[1].padStart(2, '0')}`;
  }

  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

/** Parse a time like "10:00", "10.00 uur", "10 u" into HH:mm */
export function parseFormTime(input?: string | null): string | null {
  if (!input) return null;
  const m = String(input).match(/(\d{1,2})[:.h]?(\d{2})?/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  if (isNaN(h) || h > 23) return null;
  const min = m[2] ? parseInt(m[2], 10) : 0;
  if (min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** Opportunity names like "Jan Jansen - Aanvraag" are not a real event type */
export function isGenericEventType(name?: string | null): boolean {
  if (!name) return true;
  const n = name.trim().toLowerCase();
  if (!n || n === 'onbekend') return true;
  return /(^|\s[-–]\s)(aanvraag|nieuwe aanvraag|lead|opportunity|inquiry)$/.test(n);
}

export interface ExtractedInquiry {
  eventType: string | null;
  guestCount: number | null;
  preferredDate: string | null;
  preferredStartTime: string | null;
  preferredEndTime: string | null;
  roomPreference: string | null;
  budget: number | null;
  companyName: string | null;
  message: string | null;
}

const MESSAGE_SKIP = /^(bedrijfsnaam|bedrijf|naam bedrijf|organisatie|kvk|btw|e-?mail|e-?mailadres|telefoon|telefoonnummer|voornaam|achternaam|naam|volledige naam)$/;

/** Turn a field map into CRM inquiry values */
export function extractInquiryFields(fieldMap: FieldMap, fallbacks: { eventType?: string | null; budget?: number | null } = {}): ExtractedInquiry {
  const find = makeFuzzyFind(fieldMap);

  const guestRaw = find('aantal gasten', 'aantal personen', 'aantal deelnemers', 'guest_count', 'guests', 'gasten', 'personen');
  const guestCount = parseInt(String(guestRaw).replace(/\D+/g, ''), 10);

  const eventTypeField = find('type evenement', 'type gelegenheid', 'soort evenement', 'soort bijeenkomst', 'event_type');
  const eventType = eventTypeField || (isGenericEventType(fallbacks.eventType) ? null : fallbacks.eventType) || fallbacks.eventType || null;

  const budgetRaw = find('budget');
  const budgetParsed = budgetRaw ? Number(String(budgetRaw).replace(/[^\d,.-]/g, '').replace(',', '.')) : NaN;

  const messageParts: string[] = [];
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  for (const [key, value] of Object.entries(fieldMap)) {
    if (!value || MESSAGE_SKIP.test(key)) continue;
    messageParts.push(`${capitalize(key)}: ${value}`);
  }

  return {
    eventType,
    guestCount: isNaN(guestCount) || guestCount <= 0 ? null : guestCount,
    preferredDate: parseFormDate(find('gewenste datum', 'selecteer de gewenste datum', 'voorkeursdatum', 'preferred_date', 'datum')),
    preferredStartTime: parseFormTime(find('starttijd', 'begintijd', 'aanvangstijd', 'start_time', 'van')),
    preferredEndTime: parseFormTime(find('eindtijd', 'end_time', 'tot')),
    roomPreference: find('gewenste zaalopstelling', 'zaalopstelling', 'gewenste ruimte', 'room_preference', 'zaal') || null,
    budget: isNaN(budgetParsed) || budgetParsed <= 0 ? (fallbacks.budget ?? null) : budgetParsed,
    companyName: find('bedrijfsnaam', 'naam bedrijf', 'bedrijf', 'organisatie', 'company') || null,
    message: messageParts.length ? messageParts.join('\n') : null,
  };
}

/** Find (or create) a company by name and return its id */
export async function resolveCompanyId(
  supabase: any,
  userId: string,
  companyName?: string | null,
  extra: { kvk?: string | null; btw_number?: string | null } = {},
): Promise<string | null> {
  const name = companyName ? String(companyName).trim() : '';
  if (!name) return null;
  const normalized = normalizeCompanyName(name);

  const { data: candidates } = await supabase
    .from('companies')
    .select('id, name')
    .ilike('name', `%${name.split(' ')[0]}%`)
    .limit(50);

  const match = (candidates || []).find((c: any) => normalizeCompanyName(c.name || '') === normalized);
  if (match) return match.id;

  const { data: created, error } = await supabase
    .from('companies')
    .insert({ user_id: userId, name, kvk: extra.kvk || null, btw_number: extra.btw_number || null })
    .select('id')
    .single();
  if (error) {
    console.error('[inquiryFields] company insert failed:', error.message);
    return null;
  }
  return created?.id || null;
}

/** Link a contact to a company without overwriting an existing primary company */
export async function linkContactToCompany(supabase: any, userId: string, contactId: string, companyId: string, companyName?: string | null) {
  const { data: contactRow } = await supabase.from('contacts').select('company_id').eq('id', contactId).maybeSingle();
  const isPrimary = !contactRow?.company_id;
  if (isPrimary) {
    await supabase
      .from('contacts')
      .update({ company_id: companyId, company: companyName || null })
      .eq('id', contactId)
      .is('company_id', null);
  }
  await supabase
    .from('contact_companies')
    .upsert({ contact_id: contactId, company_id: companyId, is_primary: isPrimary, user_id: userId }, { onConflict: 'contact_id,company_id' });
}

/**
 * Build the inquiry update payload from extracted fields, only including
 * values we actually found so nothing gets wiped with empties.
 */
export function buildInquiryUpdate(x: ExtractedInquiry, opts: { includeMessage?: boolean } = {}): Record<string, any> {
  const update: Record<string, any> = {};
  if (x.eventType) update.event_type = x.eventType;
  if (x.guestCount) update.guest_count = x.guestCount;
  if (x.preferredDate) update.preferred_date = x.preferredDate;
  if (x.preferredStartTime) update.preferred_start_time = x.preferredStartTime;
  if (x.preferredEndTime) update.preferred_end_time = x.preferredEndTime;
  if (x.roomPreference) update.room_preference = x.roomPreference;
  if (x.budget) update.budget = x.budget;
  if (opts.includeMessage !== false && x.message) update.message = x.message;
  return update;
}
