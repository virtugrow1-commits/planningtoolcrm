import { assertEquals } from "jsr:@std/assert@1";
import { isKnownPersonName, linkableCompanyName } from "./inquiryFields.ts";

/** Minimale Supabase-mock: inquiries met contact_name, contacts met first/last name */
function mockSupabase(inquiries: string[], contacts: Array<[string, string]>) {
  return {
    from(table: string) {
      const state: { col?: string; pattern?: string } = {};
      const q: any = {
        select() { return q; },
        limit() { return q; },
        ilike(col: string, pattern: string) { state.col = col; state.pattern = pattern; return q; },
        maybeSingle() {
          const hit = inquiries.find(n => n.toLowerCase() === String(state.pattern).toLowerCase());
          return Promise.resolve({ data: hit ? { id: 'x' } : null });
        },
        then(resolve: (v: any) => void) {
          const needle = String(state.pattern).replace(/%/g, '').toLowerCase();
          const rows = contacts
            .filter(([, last]) => last.toLowerCase().includes(needle))
            .map(([first_name, last_name]) => ({ first_name, last_name }));
          resolve({ data: rows });
        },
      };
      if (table !== 'inquiries' && table !== 'contacts') throw new Error(`unexpected table ${table}`);
      return q;
    },
  };
}

Deno.test('linkableCompanyName: bedrijfsnaam uit het formulier telt altijd', async () => {
  const sb = mockSupabase(['Kim Hendriks'], [['Jolanda en Leon', 'Hendriks']]);
  assertEquals(await linkableCompanyName(sb, 'Kim Hendriks', null), 'Kim Hendriks');
  assertEquals(await linkableCompanyName(sb, ' Jansen BV ', 'Kim Hendriks'), 'Jansen BV');
});

Deno.test('linkableCompanyName: persoonsnaam op het contact wordt geen bedrijf', async () => {
  const sb = mockSupabase(['Kim Hendriks'], [['Jolanda en Leon', 'Hendriks']]);
  // Kim Hendriks is de contactnaam van een (oude) aanvraag → geen koppeling
  assertEquals(await linkableCompanyName(sb, null, 'Kim Hendriks'), null);
  // Een bestaand contact (voor- + achternaam) → geen koppeling
  assertEquals(await linkableCompanyName(sb, null, 'Jolanda en Leon Hendriks'), null);
  // Een echt bedrijf blijft gewoon werken
  assertEquals(await linkableCompanyName(sb, null, 'Thebe Holding B.V.'), 'Thebe Holding B.V.');
  assertEquals(await linkableCompanyName(sb, null, ''), null);
  assertEquals(await linkableCompanyName(sb, undefined, undefined), null);
});

Deno.test('isKnownPersonName: alleen een volledige naam matcht, niet de achternaam alleen', async () => {
  const sb = mockSupabase([], [['Kim', 'Hendriks']]);
  assertEquals(await isKnownPersonName(sb, 'Kim Hendriks'), true);
  assertEquals(await isKnownPersonName(sb, 'kim  hendriks '), true);
  assertEquals(await isKnownPersonName(sb, 'Hendriks'), false);
  assertEquals(await isKnownPersonName(sb, 'Hendriks Bouw'), false);
});
