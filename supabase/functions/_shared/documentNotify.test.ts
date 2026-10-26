import { assert, assertEquals } from "jsr:@std/assert@1";
import { buildNotification, notifyKind, notifyRecipients, shouldNotify } from "./documentNotify.ts";

const qc = { sent_status: "quoted", signed_status: "reserved", convert_option_to_confirmed: true, title_keywords: ["offerte", "contract"] } as any;
const now = Date.parse("2026-10-27T10:00:00Z");
const cfg = { vanaf: "2026-10-26T19:00:00Z", max_age_hours: 48 };

Deno.test("soort document: offerte (ook revisie 2) en reserveringsbevestiging", () => {
  assertEquals(notifyKind({ id: "1", title: "Offerte_Vergadertafel | Keukentafel revisie 02", document_type: "proposal" }, qc), "offerte");
  assertEquals(notifyKind({ id: "2", title: "Reserveringsbevestiging - 40e verjaardag", document_type: "proposal" }, qc), "reserveringsbevestiging");
});

Deno.test("alleen verzonden, recente documenten na de start", () => {
  assert(shouldNotify({ id: "1", status: "sent", sent_at: "2026-10-27T09:00:00Z" }, cfg, now));
  assert(shouldNotify({ id: "1", status: "signed", sent_at: "2026-10-27T09:00:00Z" }, cfg, now));
  assert(!shouldNotify({ id: "1", status: "draft", sent_at: "2026-10-27T09:00:00Z" }, cfg, now));
  assert(!shouldNotify({ id: "1", status: "sent", sent_at: "2026-10-26T17:30:00Z" }, cfg, now)); // voor de start
  assert(!shouldNotify({ id: "1", status: "sent", sent_at: null }, cfg, now));
  assert(!shouldNotify({ id: "1", status: "sent", sent_at: "2026-10-30T09:00:00Z" }, { max_age_hours: 48 }, Date.parse("2026-11-02T10:00:00Z")));
});

Deno.test("ontvangers: standaard contact@, of de ingestelde adressen", () => {
  assertEquals(notifyRecipients({}), ["contact@ontmoetenaandedonge.nl"]);
  assertEquals(notifyRecipients({ to: "a@b.nl, c@d.nl" }), ["a@b.nl", "c@d.nl"]);
  assertEquals(notifyRecipients({ to: "geen-adres" }), ["contact@ontmoetenaandedonge.nl"]);
});

Deno.test("mail bevat klant, document, NL-bedrag en link naar de aanvraag", () => {
  const m = buildNotification({ id: "1", title: "Offerte_Borrel <TEST>", contact_name: "Dex Boers", sent_at: "2026-10-27T09:05:00Z", inquiry_id: "abc", amount: 2100.5, offerte_nummer: "OFF-444146-02" }, "offerte");
  assertEquals(m.subject, "Offerte verzonden aan Dex Boers: Offerte_Borrel <TEST>");
  assert(m.html.includes("Offerte_Borrel &lt;TEST&gt;"));
  assert(m.text.includes("Bedrag: € 2.100,50"));
  assert(m.text.includes("Verzonden op: 27-10-2026 om 10:05"));
  assert(m.text.includes("https://buut.cliqmakers.nl/inquiries/abc"));
  assert(m.text.includes("OFF-444146-02"));
});
