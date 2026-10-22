import { assertEquals } from "jsr:@std/assert@1";
import { buildReserveringData, signedOfferteNummer, todayNl } from "./reservering.ts";

const inquiry = {
  event_type: 'Zakelijke bijeenkomst', guest_count: 20, preferred_date: '2026-11-20',
  preferred_start_time: '09:00:00', preferred_end_time: '17:00:00', room_preference: 'Keukentafel',
};
const contact = { first_name: 'Jan', last_name: 'Jansen', company: 'Jansen BV', display_number: 'CON-444151' };

Deno.test('reservering: gegevens uit reserveringen (bevestigd gaat voor optie, zalen samen)', () => {
  const d = buildReserveringData({
    inquiry, contact, company: { name: 'Jansen Holding' },
    bookings: [
      { status: 'option', date: '2026-11-01', start_hour: 10, start_minute: 0, end_hour: 12, end_minute: 0, room_name: 'Oud', guest_count: 5 },
      { status: 'confirmed', date: '2026-11-20', start_hour: 9, start_minute: 30, end_hour: 16, end_minute: 0, room_name: 'Vergadertafel', room_setup: 'U-vorm', guest_count: 24 },
      { status: 'confirmed', date: '2026-11-20', start_hour: 12, start_minute: 0, end_hour: 18, end_minute: 15, room_name: 'Keukentafel', guest_count: 10 },
      { status: 'cancelled', date: '2026-11-20', start_hour: 8, start_minute: 0, end_hour: 23, end_minute: 0, room_name: 'Weg' },
    ],
    reservationNumber: 'RES-000912', offerteNummer: 'OFF-444151-02', today: '22-10-2026',
  });
  assertEquals(d.reservering_nummer, '000912');
  assertEquals(d.reservering_offertenummer, 'OFF-444151-02');
  assertEquals(d.reservering_datum, '20-11-2026');
  assertEquals(d.reservering_starttijd, '09:30');
  assertEquals(d.reservering_eindtijd, '18:15');
  assertEquals(d.reservering_zaal, 'Vergadertafel, Keukentafel');
  assertEquals(d.reservering_zaalopstelling, 'U-vorm');
  assertEquals(d.reservering_aantal_gasten, '24');
  assertEquals(d.reservering_bedrijfsnaam, 'Jansen Holding');
  assertEquals(d.reservering_kostenplaats, 'Jansen Holding');
});

Deno.test('reservering: zonder reservering valt terug op voorkeur van de aanvraag', () => {
  const d = buildReserveringData({ inquiry, contact, company: null, bookings: [], reservationNumber: 'RES-000913', offerteNummer: '', today: 'x' });
  assertEquals(d.reservering_datum, '20-11-2026');
  assertEquals(d.reservering_starttijd, '09:00');
  assertEquals(d.reservering_eindtijd, '17:00');
  assertEquals(d.reservering_aantal_gasten, '20');
  assertEquals(d.reservering_zaal, 'Keukentafel');
  assertEquals(d.reservering_zaalopstelling, '—');
  assertEquals(d.reservering_offertenummer, '—');
  assertEquals(d.reservering_bedrijfsnaam, 'Jansen BV');
});

Deno.test('offertenummer van de getekende versie', () => {
  assertEquals(signedOfferteNummer({ contactDisplayNumber: 'CON-1', currentRevisie: 3, signedDoc: { offerte_nummer: 'OFF-1-02' } }), 'OFF-1-02');
  assertEquals(signedOfferteNummer({ contactDisplayNumber: 'CON-444151', currentRevisie: 3, revisieBumpedAfterSigned: true }), 'OFF-444151-02');
  assertEquals(signedOfferteNummer({ contactDisplayNumber: 'CON-444151', currentRevisie: 2 }), 'OFF-444151-02');
  assertEquals(signedOfferteNummer({ contactDisplayNumber: 'CON-444151', currentRevisie: 0 }), 'OFF-444151-01');
  assertEquals(signedOfferteNummer({ contactDisplayNumber: null, currentRevisie: 2 }), '—');
});

Deno.test('todayNl', () => {
  assertEquals(todayNl(new Date('2026-10-22T23:30:00Z')), '23-10-2026'); // al 23 okt in NL
});

import { pickSignedQuoteForInquiry } from "./reservering.ts";

Deno.test('getekende offerte hoort bij deze aanvraag, niet bij een oude aanvraag van hetzelfde contact', () => {
  const docs = [
    { id: 'oud', inquiry_id: 'inq-oud', signed_at: '2026-09-29T10:00:00Z' },
    { id: 'los-oud', inquiry_id: null, signed_at: '2026-09-30T10:00:00Z' },
    { id: 'nieuw', inquiry_id: 'inq-nieuw', signed_at: '2026-10-22T14:30:00Z' },
  ];
  assertEquals(pickSignedQuoteForInquiry(docs, 'inq-nieuw', '2026-10-22T14:00:00Z')?.id, 'nieuw');
  // Nog niet gekoppeld: alleen losse documenten van na het aanmaken van de aanvraag
  assertEquals(pickSignedQuoteForInquiry(docs.slice(0, 2), 'inq-nieuw', '2026-10-22T14:00:00Z'), null);
  assertEquals(pickSignedQuoteForInquiry([{ id: 'los', inquiry_id: null, signed_at: '2026-10-22T15:00:00Z' }], 'inq-nieuw', '2026-10-22T14:00:00Z')?.id, 'los');
});
