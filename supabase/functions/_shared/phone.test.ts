import { assertEquals } from "jsr:@std/assert@1";
import { fillContactPhone, hasPhone, normalizePhone } from "./phone.ts";

Deno.test('normalizePhone', () => {
  assertEquals(normalizePhone('06 12444829'), '+31612444829');
  assertEquals(normalizePhone('0162-240022'), '+31162240022');
  assertEquals(normalizePhone('+44 7956 543235'), '+447956543235');
  assertEquals(normalizePhone('0031612444829'), '+31612444829');
  assertEquals(normalizePhone(''), null);
  assertEquals(normalizePhone('onbekend'), null);
});

Deno.test('hasPhone', () => {
  assertEquals(hasPhone('+31612444829'), true);
  assertEquals(hasPhone(''), false);
  assertEquals(hasPhone('—'), false);
  assertEquals(hasPhone('ontbreekt'), false);
});

function fakeDb(row: any) {
  const updates: any[] = [];
  const db = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }),
      update: (u: any) => ({ eq: async () => { updates.push(u); return { error: null }; } }),
    }),
  };
  return { db, updates };
}

Deno.test('fillContactPhone vult alleen aan als het contact nog geen nummer heeft', async () => {
  const leeg = fakeDb({ phone: null, mobile: null });
  await fillContactPhone(leeg.db, 'c1', '06 12444829');
  assertEquals(leeg.updates, [{ phone: '+31612444829' }]);

  const bekend = fakeDb({ phone: '+31600000000', mobile: null });
  await fillContactPhone(bekend.db, 'c1', '06 12444829');
  assertEquals(bekend.updates, []);

  const geenNummer = fakeDb({ phone: null, mobile: null });
  await fillContactPhone(geenNummer.db, 'c1', '');
  assertEquals(geenNummer.updates, []);
});
