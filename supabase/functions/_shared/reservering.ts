import { buildBegroting, inloopVoor, onderdeel, ONDERDELEN, type Begroting } from './begroting.ts';

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
  reservering_inloop: 'Reservering inloop',
  reservering_lunch: 'Reservering lunch',
  reservering_borrel: 'Reservering borrel',
  reservering_diner: 'Reservering diner',
  reservering_begroting: 'Reservering begroting',
  reservering_subtotaal: 'Reservering subtotaal',
  reservering_btw: 'Reservering btw',
  reservering_totaalbedrag: 'Reservering totaalbedrag',
};

/** Velden die in GHL "Meerdere regels" (LARGE_TEXT) zijn; de rest is "Enkele lijn". */
export const LARGE_TEXT_FIELDS = new Set(['reservering_begroting']);

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
  reservering_inloop: string;
  reservering_lunch: string;
  reservering_borrel: string;
  reservering_diner: string;
  reservering_begroting: string;
  reservering_subtotaal: string;
  reservering_btw: string;
  reservering_totaalbedrag: string;
}

export function buildReserveringData(input: {
  inquiry: any;
  contact: any;
  company: any | null;
  bookings: any[];
  reservationNumber: string;
  offerteNummer: string;
  today?: string;
  /** Begroting van de geaccepteerde offerte (uit de GHL-factuur) */
  begroting?: Begroting;
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

  const beg: Begroting = input.begroting ?? buildBegroting(null, null);

  const volledigeNaam = `${contact?.first_name ?? ''} ${contact?.last_name ?? ''}`.trim();
  // "Op naam van" (bijv. "Fam. Jansen – 50-jarig huwelijk") gaat voor; het
  // contact blijft de geadresseerde en ondertekenaar.
  const opNaamVan = String(inq?.op_naam_van ?? '').trim();
  const bedrijf = opNaamVan || company?.name || contact?.company || volledigeNaam || '—';

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
    reservering_inloop: start ? inloopVoor(start) : '—',
    reservering_lunch: onderdeel(beg.itemNamen, ONDERDELEN.lunch, beg.bron),
    reservering_borrel: onderdeel(beg.itemNamen, ONDERDELEN.borrel, beg.bron),
    reservering_diner: onderdeel(beg.itemNamen, ONDERDELEN.diner, beg.bron),
    reservering_begroting: beg.regels,
    reservering_subtotaal: beg.subtotaal,
    reservering_btw: beg.btw,
    reservering_totaalbedrag: beg.totaal,
  };
}

/**
 * Getekende offerte die bij déze aanvraag hoort:
 * 1. gekoppeld aan deze aanvraag (nieuwste eerst)
 * 2. anders een document van hetzelfde contact zonder aanvraag-koppeling,
 *    getekend op of na het aanmaken van de aanvraag.
 * Documenten van een andere aanvraag tellen nooit mee.
 */
export function pickSignedQuoteForInquiry<T extends { inquiry_id?: string | null; signed_at?: string | null }>(
  docs: T[], inquiryId: string, inquiryCreatedAt?: string | null,
): T | null {
  const byNewest = [...(docs ?? [])].sort((a, b) => String(b.signed_at || '').localeCompare(String(a.signed_at || '')));
  const own = byNewest.find((d) => d.inquiry_id === inquiryId);
  if (own) return own;
  // Op het exacte moment vergelijken: een oude offerte die eerder op dezelfde dag
  // is getekend hoort niet bij een aanvraag die daarna binnenkwam.
  const since = inquiryCreatedAt ? Date.parse(String(inquiryCreatedAt)) : NaN;
  return byNewest.find((d) => {
    if (d.inquiry_id) return false;
    if (!Number.isFinite(since)) return true;
    const signed = Date.parse(String(d.signed_at || ''));
    return Number.isFinite(signed) && signed >= since;
  }) ?? null;
}
