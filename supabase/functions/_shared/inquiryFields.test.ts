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
});
