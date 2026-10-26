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
