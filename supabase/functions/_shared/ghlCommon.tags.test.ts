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

Deno.test("nieuwe contactpersoon krijgt de nieuwsbrief-tag", async () => {
  const { withNewsletterTag } = await import("./ghlCommon.ts");
  assertEquals(withNewsletterTag([]), ["nieuwsbrief aangemeld"]);
  assertEquals(withNewsletterTag(null), ["nieuwsbrief aangemeld"]);
  assertEquals(withNewsletterTag(["vip"]), ["vip", "nieuwsbrief aangemeld"]);
  assertEquals(withNewsletterTag(["Nieuwsbrief aangemeld"]), ["Nieuwsbrief aangemeld"]);
  assertEquals(withNewsletterTag(["nieuwsbrief afgemeld"]), ["nieuwsbrief afgemeld"]);
});
