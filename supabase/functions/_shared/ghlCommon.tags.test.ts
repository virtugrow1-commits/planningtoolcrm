import { assertEquals } from "jsr:@std/assert@1";
import { resolveContactTags } from "./ghlCommon.ts";
const ago = (m: number) => new Date(Date.now() - m * 60000).toISOString();
Deno.test("recent CRM tag change wins over GHL", () => {
  assertEquals(resolveContactTags(["vip"], [], ago(5)).source, "crm");
});
Deno.test("pending push wins", () => {
  assertEquals(resolveContactTags(["vip"], [], null, true).source, "crm");
});
Deno.test("CRM change older than 24h -> GHL mirrored", () => {
  const r = resolveContactTags(["vip"], ["klant"], ago(25 * 60));
  assertEquals([r.source, r.tags, r.changed], ["ghl", ["klant"], true]);
});
Deno.test("case/space differences are not a change", () => {
  assertEquals(resolveContactTags(["VIP "], ["vip"], null).changed, false);
});
