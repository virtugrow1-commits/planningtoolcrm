import { assertEquals } from "jsr:@std/assert@1";
import { buildFieldMap, dagdeelToTimes, extractInquiryFields, isBuutOutputField } from "./inquiryFields.ts";

Deno.test('offerte-/reserveringsvelden van een eerdere offerte tellen niet als klantinvoer', () => {
  const contact = {
    customFields: [
      { name: 'Offerte aantal gasten', value: '25' },
      { name: 'Reservering zaalopstelling', value: 'Receptie / staand' },
      { name: 'Reservering eindtijd', value: '20:00' },
      { name: 'Offerte starttijd', value: '16:00' },
      { name: 'Type gelegenheid', value: 'Borrel & Besloten Feest' },
      { name: 'Gewenste datum', value: '2026-11-27' },
      { name: 'Selecteer dagdeel', value: 'Middag/Avond' },
    ],
  };
  const x = extractInquiryFields(buildFieldMap([contact]));
  assertEquals(x.guestCount, null);
  assertEquals(x.roomPreference, null);
  assertEquals(x.preferredStartTime, '13:00');
  assertEquals(x.preferredEndTime, '22:00');
  assertEquals(x.eventType, 'Borrel & Besloten Feest');
  assertEquals(x.preferredDate, '2026-11-27');
  assertEquals(/offerte|reservering/i.test(x.message || ''), false);
});

Deno.test('echte formuliervelden blijven werken', () => {
  const x = extractInquiryFields(buildFieldMap([{ 'Aantal gasten': '30', 'Gewenste zaalopstelling': 'Theater' }]));
  assertEquals(x.guestCount, 30);
  assertEquals(x.roomPreference, 'Theater');
});

Deno.test('dagdeel → tijden', () => {
  assertEquals(dagdeelToTimes('Ochtend'), ['09:00', '12:00']);
  assertEquals(dagdeelToTimes('Middag'), ['13:00', '17:00']);
  assertEquals(dagdeelToTimes('Ochtend/Middag'), ['09:00', '17:00']);
  assertEquals(dagdeelToTimes('Middag/Avond'), ['13:00', '22:00']);
  assertEquals(dagdeelToTimes('Ochtend, middag en avond'), ['09:00', '22:00']);
  assertEquals(dagdeelToTimes(''), null);
  assertEquals(isBuutOutputField('reservering_datum'), true);
  assertEquals(isBuutOutputField('Reserveringstype'), false);
  assertEquals(isBuutOutputField('contact.offerte_aantal_gasten'), true);
  assertEquals(isBuutOutputField('Offertenummer'), true);
});

Deno.test('terugkerende klant krijgt een nieuwe aanvraag; alleen dubbele inzending werkt de bestaande bij', async () => {
  const { isDuplicateSubmission } = await import('./inquiryFields.ts');
  const now = new Date('2026-10-23T12:00:00Z');
  // Zelfde aanvraag een uur geleden nog eens verstuurd
  assertEquals(isDuplicateSubmission({ status: 'new', created_at: '2026-10-23T11:00:00Z', preferred_date: '2026-11-27' }, { preferredDate: '2026-11-27' }, now), true);
  // Oude aanvraag (verloren / al reservering / lang geleden / andere datum) → nieuwe aanvraag
  assertEquals(isDuplicateSubmission({ status: 'lost', created_at: '2026-10-23T11:00:00Z', preferred_date: '2026-11-27' }, { preferredDate: '2026-11-27' }, now), false);
  assertEquals(isDuplicateSubmission({ status: 'reserved', created_at: '2026-10-23T11:00:00Z' }, {}, now), false);
  assertEquals(isDuplicateSubmission({ status: 'new', created_at: '2026-09-01T10:00:00Z', preferred_date: '2026-11-27' }, { preferredDate: '2026-11-27' }, now), false);
  assertEquals(isDuplicateSubmission({ status: 'new', created_at: '2026-10-23T11:00:00Z', preferred_date: '2026-11-20' }, { preferredDate: '2026-12-04' }, now), false);
});

Deno.test('aantal gasten uit een bereik', async () => {
  const { parseGuestCount } = await import('./inquiryFields.ts');
  assertEquals(parseGuestCount('van 21 tot 50 p.'), 50);
  assertEquals(parseGuestCount('tot 20 p.'), 20);
  assertEquals(parseGuestCount('vanaf 100 p.'), 100);
  assertEquals(parseGuestCount('35'), 35);
  assertEquals(Number.isNaN(parseGuestCount('')), true);
});

Deno.test('veld-ID van een opportunity-veld wordt herkend (aantal gasten)', async () => {
  const { loadFieldDefs } = await import('./inquiryFields.ts');
  const realFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = ((url: string) => {
    calls.push(String(url));
    const all = String(url).includes('model=all');
    const body = all
      ? { customFields: [{ id: 'c1', name: 'Type gelegenheid' }, { id: '3kgpapaxtsha4cc3omeu', name: 'Aantal gasten' }] }
      : { customFields: [{ id: 'c1', name: 'Type gelegenheid' }] };
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  }) as typeof fetch;
  try {
    const defs = await loadFieldDefs({}, 'loc');
    assertEquals(calls.some((u) => u.includes('model=all')), true);
    const map = buildFieldMap([{ customFields: [{ id: '3kgpapaxtsha4cc3omeu', value: 'van 21 tot 50 p.' }] }], defs);
    assertEquals(extractInquiryFields(map).guestCount, 50);
  } finally {
    globalThis.fetch = realFetch;
  }
});
