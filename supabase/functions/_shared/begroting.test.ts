import { assertEquals, assert } from "jsr:@std/assert@1";
import { buildBegroting, euro, inloopVoor, onderdeel, ONDERDELEN, pickInvoice } from "./begroting.ts";

const invoice = {
  _id: 'inv9', name: 'Offerte_Vergadertafel | Keukentafel - dinsdag 13 oktober - Invoice', status: 'draft', total: 1703.45,
  items: [
    { name: 'Zaalhuur inclusief subruimte, 1 dagdeel', qty: 1, amount: 225, taxes: [{ rate: 21, calculation: 'exclusive' }] },
    { name: 'Dagdeelarrangement per persoon', description: '<p>Koffie, thee, water</p>', qty: 12, amount: 20.125, taxes: [{ rate: 9 }] },
    { name: 'Van vergadertafel naar keukentafel | kookworkshop tapas', description: '1x geen noten<br>1x lactose vrij', qty: 12, amount: 89.5, taxes: [{ rate: 9 }] },
  ],
};

Deno.test('euro', () => {
  assertEquals(euro(1703.45), '€ 1.703,45');
  assertEquals(euro(0), '€ 0,00');
});

Deno.test('begroting uit de factuur: regels, btw per tarief en totaal', () => {
  const b = buildBegroting(invoice, 1703.45);
  assertEquals(b.bron, 'factuur');
  const regels = b.regels.split('\n');
  assertEquals(regels.length, 3);
  assertEquals(regels[0], '1 × Zaalhuur inclusief subruimte, 1 dagdeel à € 225,00 = € 225,00');
  assertEquals(regels[2], '12 × Van vergadertafel naar keukentafel | kookworkshop tapas à € 89,50 = € 1.074,00 (1x geen noten; 1x lactose vrij)');
  assertEquals(b.subtotaal, '€ 1.540,50');
  assertEquals(b.btw, '€ 165,65 (9%: € 118,40, 21%: € 47,25)'); // 21% van 225 + 9% van 1315,50
  assert(b.btw.includes('9%:') && b.btw.includes('21%:'));
  assertEquals(b.totaal, '€ 1.703,45');         // totaal van de factuur gaat voor
});

Deno.test('zonder factuur: alleen het totaal van het document', () => {
  const b = buildBegroting(null, 572.58);
  assertEquals(b.bron, 'document_totaal');
  assertEquals(b.totaal, '€ 572,58');
  assertEquals(b.regels, '—');
  assertEquals(buildBegroting(null, null).bron, 'geen');
});

Deno.test('juiste factuur kiezen', () => {
  const list = [
    { _id: 'a', name: 'Andere offerte - Invoice', total: 99 },
    { _id: 'b', name: 'Offerte X - Invoice', total: 500, status: 'void' },
    { _id: 'c', name: 'Offerte X - Invoice', total: 500 },
    { _id: 'd', name: 'Los', total: 750, createdAt: '2026-10-01' },
  ];
  assertEquals(pickInvoice(list, 'Offerte X', 500)?._id, 'c');
  assertEquals(pickInvoice(list, 'Onbekend', 750)?._id, 'd');
  assertEquals(pickInvoice(list, 'Onbekend', 1), null);
});

Deno.test('lunch / borrel / diner uit de geaccepteerde producten', () => {
  const b = buildBegroting(invoice, null);
  assertEquals(onderdeel(b.itemNamen, ONDERDELEN.lunch, b.bron), 'Nee');
  assertEquals(onderdeel(b.itemNamen, ONDERDELEN.borrel, b.bron), 'Nee');
  assert(onderdeel(b.itemNamen, ONDERDELEN.diner, b.bron).startsWith('Ja – Van vergadertafel'));
  assertEquals(onderdeel([], ONDERDELEN.lunch, 'geen'), '—');
});

Deno.test('inloop een kwartier voor aanvang', () => {
  assertEquals(inloopVoor('13:00'), '12:45');
  assertEquals(inloopVoor('00:10'), '23:55');
  assertEquals(inloopVoor('—'), '—');
});

Deno.test('GHL-factuur met invoiceItems (zoals de Invoices-API ze teruggeeft)', () => {
  const ghl = { _id: 'x', total: 1703.45, invoiceItems: invoice.items } as any;
  const b = buildBegroting(ghl, null);
  assertEquals(b.bron, 'factuur');
  assertEquals(b.regels.split('\n').length, 3);
  assertEquals(b.totaal, '€ 1.703,45');
});

Deno.test('factuur zonder regels: totaal van de factuur als terugval', () => {
  const b = buildBegroting({ _id: 'x', total: 572.58 } as any, null);
  assertEquals(b.bron, 'document_totaal');
  assertEquals(b.totaal, '€ 572,58');
});

Deno.test('korteNaam: productnaam past op één regel in de bevestiging', async () => {
  const { korteNaam, onderdeel, ONDERDELEN } = await import('./begroting.ts');
  assertEquals(korteNaam('Donge_Borrelarrangement_conform beschrijving, exclusief dranken. Twee weken'), 'Donge Borrelarrangement');
  assertEquals(korteNaam('Lunch'), 'Lunch');
  assert(korteNaam('Een heel erg lange productnaam zonder scheidingstekens erin').length <= 26);
  assertEquals(onderdeel(['Donge_Borrelarrangement_conform beschrijving'], ONDERDELEN.borrel, 'factuur'), 'Ja – Donge Borrelarrangement');
});

Deno.test("buildBegroting: prijzen incl. btw tellen de btw niet dubbel", () => {
  const b = buildBegroting({
    total: 1210,
    items: [{ name: "Zaalhuur", qty: 1, amount: 1210, taxes: [{ rate: 21, calculation: "inclusive" }] }],
  });
  assertEquals(b.subtotaal, "€ 1.000,00");
  assertEquals(b.btw, "€ 210,00");
  assertEquals(b.totaal, "€ 1.210,00");
});
