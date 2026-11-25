import { ROOMS, RoomName } from '@/types/crm';

/** "18:00" / "18:00:00" → [18, 0]; anders null. */
export function parseHHMM(t?: string | null): [number, number] | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  return h <= 23 && min <= 59 ? [h, min] : null;
}

/** Zaalvoorkeur uit het formulier → een bestaande ruimte, of '' als die niet eenduidig is. */
export function roomFromPreference(pref?: string | null): RoomName | '' {
  const p = String(pref ?? '').trim().toLowerCase();
  if (!p) return '';
  const exact = ROOMS.find((r) => r.toLowerCase() === p);
  if (exact) return exact;
  const hits = ROOMS.filter((r) => p.includes(r.toLowerCase()) || r.toLowerCase().includes(p));
  return hits.length === 1 ? hits[0] : '';
}

/**
 * Begintijden voor een nieuwe reservering vanuit een aanvraag: de voorkeurstijd van de klant
 * (of het gekozen dagdeel, dat BUUT al omzet naar tijden). Zonder voorkeur 09:00–17:00.
 */
export function timesFromInquiry(inq: { preferredStartTime?: string | null; preferredEndTime?: string | null }) {
  const s = parseHHMM(inq.preferredStartTime);
  const e = parseHHMM(inq.preferredEndTime);
  if (!s) return { startHour: 9, startMinute: 0, endHour: 17, endMinute: 0 };
  const end = e ?? [(s[0] + 3) % 24, s[1]];
  return { startHour: s[0], startMinute: s[1], endHour: end[0], endMinute: end[1] };
}

/** Voorkeursdatum "2027-02-14" als lokale datum (zonder tijdzoneverschuiving). */
export function localDateFromIso(iso?: string | null): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined;
}
