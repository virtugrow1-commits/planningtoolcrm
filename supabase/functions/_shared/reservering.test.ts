import { assertEquals } from "jsr:@std/assert@1";
import { buildReserveringData, signedOfferteNummer, todayNl } from "./reservering.ts";
import { buildBegroting } from "./begroting.ts";

const inquiry = {
  event_type: 'Zakelijke bijeenkomst', guest_count: 20, preferred_date: '2026-11-20',
  preferred_start_time: '09:00:00', preferred_end_time: '17:00:00', room_preference: 'Keukentafel',
};
const contact = { first_name: 'Jan', last_name: 'Jansen', company: 'Jansen BV', display_number: 'CON-444151' };

for (const [veld, producten] of [
  ['reservering_lunch', ['Uitgebreide lunch conform beschrijving']],
  ['reservering_borrel', ['Donge Borrelarrangement exclusief dranken', 'Hapjes', 'Bites', 'Bittergarnituur']],
  ['reservering_diner', ['Diner inclusief dranken', 'Kookworkshop', 'Kookstudio', 'Buffet', 'BBQ', 'Barbecue', 'Proeverij']],
] as const) {
  Deno.test(`${veld}: uitsluitend Ja bij onderdeel in geaccepteerde begroting, anders Nee`, () => {
    const input = { inquiry, contact, company: null, bookings: [], reservationNumber: 'RES-1', offerteNummer: 'OFF-1', today: 'x' };
    for (const product of producten) {
      const d = buildReserveringData({ ...input, begroting: buildBegroting({ items: [{ name: product, amount: 10 }] }) });
      assertEquals(d[veld], 'Ja');
    }
    const zonderOnderdeel = buildReserveringData({ ...input, begroting: buildBegroting({ items: [{ name: 'Zaalhuur', amount: 100 }] }) });
    assertEquals(zonderOnderdeel[veld], 'Nee');
  });

  Deno.test(`${veld}: bestaande fallback zonder begroting blijft ongewijzigd`, () => {
    const input = { inquiry, contact, company: null, bookings: [], reservationNumber: 'RES-1', offerteNummer: 'OFF-1', today: 'x' };
    assertEquals(buildReserveringData(input)[veld], '—');
    assertEquals(buildReserveringData({ ...input, begroting: buildBegroting(null, 100) })[veld], '—');
  });
}

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
  assertEquals(d.reservering_kostenplaats, 'n.v.t.');
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

Deno.test('losse offerte die eerder op dezelfde dag is getekend hoort niet bij een latere aanvraag', () => {
  const docs = [{ id: 'oud-zelfde-dag', inquiry_id: null, signed_at: '2026-10-22T14:20:00Z' }];
  assertEquals(pickSignedQuoteForInquiry(docs, 'inq-nieuw', '2026-10-22T15:23:00Z'), null);
});

Deno.test('reservering: "op naam van" gaat voor bedrijf en contactnaam', () => {
  const d = buildReserveringData({
    inquiry: { ...inquiry, op_naam_van: '  Fam. Jansen – 50-jarig huwelijk ' },
    contact: { first_name: 'Eva', last_name: 'Jansen', display_number: 'CON-444160' },
    company: null, bookings: [], reservationNumber: 'RES-000914', offerteNummer: '', today: 'x',
  });
  assertEquals(d.reservering_bedrijfsnaam, 'Fam. Jansen – 50-jarig huwelijk');
});

Deno.test('reservering: leeg "op naam van" zonder bedrijf = Particulier', () => {
  const d = buildReserveringData({
    inquiry: { ...inquiry, op_naam_van: '' },
    contact: { first_name: 'Eva', last_name: 'Jansen' },
    company: null, bookings: [], reservationNumber: 'RES-000915', offerteNummer: '', today: 'x',
  });
  assertEquals(d.reservering_bedrijfsnaam, 'Particulier');
  assertEquals(d.reservering_kostenplaats, 'n.v.t.');
});

Deno.test('reservering: particuliere klantkaart of bedrijf "Onbekend" = Particulier', () => {
  const priv = buildReserveringData({
    inquiry, contact: { first_name: 'Willem', last_name: 'Boers', company: 'Willem Boers', private_company: { is_private: true } },
    company: { name: 'Willem Boers', is_private: true }, bookings: [], reservationNumber: 'RES-1', offerteNummer: '', today: 'x',
  });
  assertEquals(priv.reservering_bedrijfsnaam, 'Particulier');
  const onbekend = buildReserveringData({
    inquiry, contact: { first_name: 'Willem', last_name: 'Boers', company: 'Onbekend' },
    company: { name: 'Onbekend' }, bookings: [], reservationNumber: 'RES-2', offerteNummer: '', today: 'x',
  });
  assertEquals(onbekend.reservering_bedrijfsnaam, 'Particulier');
});

Deno.test('oude offerte die per ongeluk aan een nieuwe aanvraag gekoppeld is telt niet mee', () => {
  const docs = [{ id: 'oud-gekoppeld', inquiry_id: 'inq-nieuw', signed_at: '2026-09-25T10:00:00Z' }];
  assertEquals(pickSignedQuoteForInquiry(docs, 'inq-nieuw', '2026-10-26T21:00:00Z'), null);
});

Deno.test('losse offerte getekend na de volgende aanvraag hoort niet bij de eerdere aanvraag', () => {
  const docs = [{ id: 'los', inquiry_id: null, signed_at: '2026-11-10T10:00:00Z' }];
  assertEquals(pickSignedQuoteForInquiry(docs, 'inq-eerst', '2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z'), null);
  assertEquals(pickSignedQuoteForInquiry(docs, 'inq-later', '2026-11-01T00:00:00Z')?.id, 'los');
});
