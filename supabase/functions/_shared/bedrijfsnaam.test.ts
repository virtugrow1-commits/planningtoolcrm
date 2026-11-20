import { assertEquals } from "jsr:@std/assert@1";
import { resolveBedrijfsnaam } from "./bedrijfsnaam.ts";

Deno.test('bedrijfsnaam: op naam van > bedrijf > Particulier', () => {
  assertEquals(resolveBedrijfsnaam({ opNaamVan: 'Fam. Jansen', company: { name: 'Jansen BV' } }), 'Fam. Jansen');
  assertEquals(resolveBedrijfsnaam({ company: { name: 'Jansen BV' } }), 'Jansen BV');
  assertEquals(resolveBedrijfsnaam({ company: null, contactCompany: 'Jansen BV' }), 'Jansen BV');
  assertEquals(resolveBedrijfsnaam({ company: { name: 'Onbekend' }, contactCompany: 'Onbekend' }), 'Particulier');
  assertEquals(resolveBedrijfsnaam({ company: { name: 'Willem Boers', is_private: true } }), 'Particulier');
  assertEquals(resolveBedrijfsnaam({ company: null, contactIsPrivate: true, contactCompany: 'Willem Boers' }), 'Particulier');
  assertEquals(resolveBedrijfsnaam({}), 'Particulier');
});

Deno.test('familie zonder op naam van -> familienaam', () => {
  assertEquals(resolveBedrijfsnaam({ company: { name: 'Familie Boers', is_private: true, client_kind: 'familie' } }), 'Familie Boers');
  assertEquals(resolveBedrijfsnaam({ contactCompanyRow: { name: 'Familie Boers', client_kind: 'familie' }, contactIsPrivate: true }), 'Familie Boers');
});
Deno.test('familie met op naam van -> op naam van', () => {
  assertEquals(resolveBedrijfsnaam({ opNaamVan: 'Fam. Boers 50 jaar', company: { name: 'Familie Boers', is_private: true, client_kind: 'familie' } }), 'Fam. Boers 50 jaar');
});
