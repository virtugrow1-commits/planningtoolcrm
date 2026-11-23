import { assertEquals } from "jsr:@std/assert@1";
import { buildBundle } from "./offertetoolBundle.ts";

const inq = { id: "i1", display_number: "#001930", event_type: "Borrel & Besloten Feest", status: "option", guest_count: 30,
  preferred_date: "2026-12-11", preferred_start_time: "18:00:00", preferred_end_time: "22:00:00", op_naam_van: "Fam. Jansen – 50-jarig huwelijk", kostenplaats: null };
const contact = { id: "c1", first_name: "Anna", infix: "de", last_name: "Vries", email: "anna@example.nl", phone: "", mobile: "0612345678", company: null, ghl_contact_id: "g1" };

Deno.test("particulier: optie gaat voor voorkeur, Op naam van op het document", () => {
  const b = buildBundle(inq, contact, null, null, [
    { id: "b1", date: "2026-12-12", start_hour: 17, start_minute: 0, end_hour: 21, end_minute: 30, status: "option", guest_count: 35, room_name: "Petit Café", room_setup: "Receptie" },
    { id: "b2", date: "2026-12-20", start_hour: 10, start_minute: 0, end_hour: 12, end_minute: 0, status: "cancelled", guest_count: 2, room_name: "X", room_setup: "" },
  ]);
  assertEquals(b.company, { isPrivate: true, name: "", id: null });
  assertEquals(b.documentName, "Fam. Jansen – 50-jarig huwelijk");
  assertEquals(b.event.date, "2026-12-12");
  assertEquals([b.event.startTime, b.event.endTime, b.event.walkInTime], ["17:00", "21:30", "16:45"]);
  assertEquals(b.event.guests, 35);
  assertEquals(b.event.room, "Petit Café");
  assertEquals(b.contact?.firstName, "Anna de");
  assertEquals(b.contact?.phone, "0612345678");
  assertEquals(b.bookings.length, 1);
});

Deno.test("zakelijk zonder reservering: voorkeurstijden en bedrijfsnaam", () => {
  const b = buildBundle({ ...inq, op_naam_van: null, kostenplaats: "KP-12" }, { ...contact, company: "Acme BV" }, { id: "co", name: "Acme BV", is_private: false }, null, []);
  assertEquals(b.company, { isPrivate: false, name: "Acme BV", id: "co" });
  assertEquals(b.documentName, "Acme BV");
  assertEquals(b.costCentre, "KP-12");
  assertEquals([b.event.date, b.event.startTime, b.event.endTime, b.event.source], ["2026-12-11", "18:00", "22:00", "voorkeur"]);
  assertEquals(b.event.guests, 30);
});

Deno.test("adres: eigen adres van het contact, anders dat van het bedrijf", () => {
  const withOwn = buildBundle(inq, { ...contact, address: "Kerkstraat 1", postcode: "5101 AB", city: "Dongen" }, null, { id: "co", name: "X", address: "Lage Ham 190", postcode: "5102 AD", city: "Dongen" }, []);
  assertEquals([withOwn.contact?.address, withOwn.contact?.postcode], ["Kerkstraat 1", "5101 AB"]);
  const fallback = buildBundle(inq, { ...contact, address: null, postcode: null, city: null }, null, { id: "co", name: "Fam. Jansen", is_private: true, address: "Lage Ham 190", postcode: "5102 AD", city: "Dongen" }, []);
  assertEquals([fallback.contact?.address, fallback.contact?.postcode, fallback.contact?.city], ["Lage Ham 190", "5102 AD", "Dongen"]);
});
