import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { crmStatusWins } from "./ghlCommon.ts";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

Deno.test("crmStatusWins: no local status change -> false", () => {
  assertEquals(crmStatusWins(null, new Date(Date.now() - 2 * MIN).toISOString()), false);
  assertEquals(crmStatusWins(undefined, null), false);
  assertEquals(crmStatusWins("", null), false);
});

Deno.test("crmStatusWins: local change 10 min ago, GHL 2 min ago -> false (GHL newer)", () => {
  const local = new Date(Date.now() - 10 * MIN).toISOString();
  const ghl = new Date(Date.now() - 2 * MIN).toISOString();
  assertEquals(crmStatusWins(local, ghl), false);
});

Deno.test("crmStatusWins: local change 1 min ago, GHL 5 min ago -> true (CRM newer)", () => {
  const local = new Date(Date.now() - 1 * MIN).toISOString();
  const ghl = new Date(Date.now() - 5 * MIN).toISOString();
  assertEquals(crmStatusWins(local, ghl), true);
});

Deno.test("crmStatusWins: local change older than 24h -> false", () => {
  const local = new Date(Date.now() - 25 * HOUR).toISOString();
  assertEquals(crmStatusWins(local, null), false);
  assertEquals(crmStatusWins(local, new Date(Date.now() - 30 * HOUR).toISOString()), false);
});

Deno.test("crmStatusWins: GHL timestamp null and recent local change -> true", () => {
  const local = new Date(Date.now() - 3 * MIN).toISOString();
  assertEquals(crmStatusWins(local, null), true);
});
