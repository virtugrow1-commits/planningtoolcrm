// Gegevens voor de reserveringsbevestiging (GHL Documents & Contracts).
//
// De bevestiging gebruikt eigen contactvelden ({{contact.reservering_*}}), los
// van de offertevelden ({{contact.offerte_*}}). Zo kan een nieuwe offerte of de
// automatische revisie-ophoging na verzenden de bevestiging nooit overschrijven.

/** Veldsleutel (zonder "contact.") → naam waarmee het veld in GHL heet. */
export const RESERVERING_FIELDS: Record<string, string> = {
  reservering_nummer: 'Reservering nummer',
  reservering_offertenummer: 'Reservering offertenummer',
  reservering_bevestigingsdatum: 'Reservering bevestigingsdatum',
  reservering_datum: 'Reservering datum',
  reservering_starttijd: 'Reservering starttijd',
  reservering_eindtijd: 'Reservering eindtijd',
  reservering_bedrijfsnaam: 'Reservering bedrijfsnaam',
  reservering_kostenplaats: 'Reservering kostenplaats',
  reservering_type_bijeenkomst: 'Reservering type bijeenkomst',
  reservering_aantal_gasten: 'Reservering aantal gasten',
  reservering_zaal: 'Reservering zaal',
  reservering_zaalopstelling: 'Reservering zaalopstelling',
};

export type ReserveringKey = keyof typeof RESERVERING_FIELDS;

/** "2026-10-19" -> "19-10-2026" */
export function nlDate(iso?: string | null): string {
  if (!iso) return '';
  const m = String(iso).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(iso);
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** 19, 0 -> "19:00" */
export function hhmm(h?: number | null, min?: number | null): string {
  if (h === null || h === undefined) return '';
  return `${String(h).padStart(2, '0')}:${String(min ?? 0).padStart(2, '0')}`;
}

const trimTime = (t?: string | null) => (t ? String(t).slice(0, 5) : '');
export const stripRes = (n?: string | null) => (n ? String(n).replace(/^RES-/i, '') : '');
const stripCon = (n?: string | null) => (n ? String(n).replace(/^CON-/i, '') : '');

/** Lege waarde -> em dash, zodat GHL nooit een kale {{token}} toont */
export const dash = (v?: string | number | null): string => {
  const s = v === null || v === undefined ? '' : String(v).trim();
  return s === '' ? '—' : s;
};

/** Vandaag als dd-mm-jjjj in Nederlandse tijd. */
export function todayNl(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', day: '2-digit', month: '2-digit', year: 'numeric' })
    .formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('day')}-${get('month')}-${get('year')}`;
}

/** Bevestigde reservering gaat voor optie, daarna vroegste datum. */
export function pickBookings(bookings: any[]): any[] {
  return (bookings ?? [])
    .filter((b) => b.status === 'confirmed' || b.status === 'option')
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'confirmed' ? -1 : 1;
      return String(a.date).localeCompare(String(b.date));
    });
}

/**
 * Offertenummer van de getekende versie.
 * 1. vastgelegd op het getekende document (bij verzenden)
 * 2. anders: huidige revisie, min één als de automatisering na verzenden van
 *    dit document de revisie al heeft opgehoogd
 */
export function signedOfferteNummer(opts: {
  contactDisplayNumber?: string | null;
  currentRevisie: number;
  signedDoc?: { offerte_nummer?: string | null } | null;
  revisieBumpedAfterSigned?: boolean;
}): string {
  if (opts.signedDoc?.offerte_nummer) return opts.signedDoc.offerte_nummer;
  const nr = stripCon(opts.contactDisplayNumber);
  if (!nr) return '—';
  let rev = Number(opts.currentRevisie || 0);
  if (opts.revisieBumpedAfterSigned && rev > 1) rev -= 1;
  return `OFF-${nr}-${String(Math.max(1, rev)).padStart(2, '0')}`;
}

export interface ReserveringData {
  reservering_nummer: string;
  reservering_offertenummer: string;
  reservering_bevestigingsdatum: string;
  reservering_datum: string;
  reservering_starttijd: string;
  reservering_eindtijd: string;
  reservering_bedrijfsnaam: string;
  reservering_kostenplaats: string;
  reservering_type_bijeenkomst: string;
  reservering_aantal_gasten: string;
  reservering_zaal: string;
  reservering_zaalopstelling: string;
}

export function buildReserveringData(input: {
  inquiry: any;
  contact: any;
  company: any | null;
  bookings: any[];
  reservationNumber: string;
  offerteNummer: string;
  today?: string;
}): ReserveringData {
  const { inquiry: inq, contact, company } = input;
  const picked = pickBookings(input.bookings);
  const main = picked[0];
  // Alle zalen op de hoofddatum (meerdere zalen = één evenement)
  const sameDay = main ? picked.filter((b) => b.date === main.date) : [];
  const zalen = [...new Set(sameDay.map((b) => b.room_name).filter(Boolean))].join(', ');
  const opstelling = [...new Set(sameDay.map((b) => b.room_setup).filter(Boolean))].join(', ');

  const datum = main ? nlDate(main.date) : nlDate(inq.preferred_date);
  const start = main ? hhmm(main.start_hour, main.start_minute) : trimTime(inq.preferred_start_time);
  const mins = (b: any) => Number(b.end_hour) * 60 + Number(b.end_minute ?? 0);
  const last = main ? sameDay.reduce((m, b) => (mins(b) > mins(m) ? b : m), main) : null;
  const eind = last ? hhmm(last.end_hour, last.end_minute) : trimTime(inq.preferred_end_time);
  const gastenBooking = Math.max(0, ...sameDay.map((b) => Number(b.guest_count) || 0));
  const gasten = gastenBooking > 0 ? gastenBooking : Number(inq.guest_count) || 0;

  const volledigeNaam = `${contact?.first_name ?? ''} ${contact?.last_name ?? ''}`.trim();
  const bedrijf = company?.name || contact?.company || volledigeNaam || '—';

  return {
    reservering_nummer: dash(stripRes(input.reservationNumber)),
    reservering_offertenummer: dash(input.offerteNummer),
    reservering_bevestigingsdatum: input.today ?? todayNl(),
    reservering_datum: dash(datum),
    reservering_starttijd: dash(start),
    reservering_eindtijd: dash(eind),
    reservering_bedrijfsnaam: bedrijf,
    reservering_kostenplaats: company?.name || contact?.company || '—',
    reservering_type_bijeenkomst: dash(inq.event_type),
    reservering_aantal_gasten: String(gasten),
    reservering_zaal: dash(zalen || inq.room_preference),
    reservering_zaalopstelling: dash(opstelling),
  };
}
