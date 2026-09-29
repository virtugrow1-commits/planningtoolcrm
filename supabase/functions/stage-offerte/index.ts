// supabase/functions/stage-offerte/index.ts
//
// Zet de offertegegevens van één aanvraag klaar op het GHL-contact, zodat de
// Documents & Contracts-sjablonen ({{contact.offerte_*}}) de juiste waarden
// tonen zodra het contact in GHL wordt geselecteerd.
//
// Twee manieren van aanroepen:
//   { inquiry_id, bump: true }   – knop "Offerte klaarzetten": revisie +1 en velden schrijven
//   { inquiry_id, bump: false }  – automatisch na opslaan van aanvraag/reservering:
//                                  velden schrijven met de huidige revisie (min. 01)
//   { contact_id, bump: false }  – automatisch: de meest recente open aanvraag van dit contact
//
// Aanroepen mogen alleen door een ingelogde gebruiker of met de service key.

import { createClient } from "npm:@supabase/supabase-js@2";
import { GHL_API_BASE, jsonResponse, readError } from "../_shared/ghlCommon.ts";

const TOKEN = Deno.env.get("GHL_API_KEY") || "";
const LOCATION = Deno.env.get("GHL_LOCATION_ID") || "";

// GHL custom field IDs (locatie a6wexXlGQhhJXChWHIet)
export const OFFERTE_FIELDS = {
  nummer:    "JMRAn3VvUCoksUv6qqrj", // contact.offertenummer
  revisie:   "Jjj92MCxxHGtlXQ3uACn", // contact.offerte_revisie
  datum:     "fIbhsRZEWfzrJaEChHUv", // contact.offerte_reserveringsdatum
  start:     "KsWTbojomRjolVt0uX8W", // contact.offerte_starttijd
  eind:      "p3Op3sdxwZDeqrTTUBAc", // contact.offerte_eindtijd
  bedrijf:   "L0maTpOnmTs9uUNgNYX1", // contact.offerte_bedrijfsnaam
  type:      "ojJr556776arwRPW3bwC", // contact.offerte_type_bijeenkomst
  gasten:    "rHmHn79J8YpqAWGC3cOw", // contact.offerte_aantal_gasten
  resnummer: "dMjCLFLYajsZG2jX75ku", // contact.offerte_reserveringsnummer
};

const ghlHeaders = {
  Authorization: `Bearer ${TOKEN}`,
  "Content-Type": "application/json",
  Version: "2021-07-28",
};

/** "2026-10-19" -> "19-10-2026" */
function nlDate(iso?: string | null): string {
  if (!iso) return "";
  const m = String(iso).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(iso);
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** 19, 0 -> "19:00" */
function hhmm(h?: number | null, min?: number | null): string {
  if (h === null || h === undefined) return "";
  return `${String(h).padStart(2, "0")}:${String(min ?? 0).padStart(2, "0")}`;
}

/** "18:00:00" -> "18:00" */
function trimTime(t?: string | null): string {
  return t ? String(t).slice(0, 5) : "";
}

const stripRes = (n?: string | null) => (n ? String(n).replace(/^RES-/i, "") : "");
const stripCon = (n?: string | null) => (n ? String(n).replace(/^CON-/i, "") : "");

/** Lege waarde -> em dash, zodat GHL nooit een kale {{token}} toont */
const dash = (v?: string | null): string => {
  const s = v === null || v === undefined ? "" : String(v).trim();
  return s === "" ? "—" : s;
};

export interface OfferteData {
  offertenummer: string;   // "444151"
  revisie: string;         // "01"
  datum: string;           // "19-10-2026"
  start: string;           // "19:00"
  eind: string;            // "23:00"
  bedrijf: string;
  type: string;
  gasten: string;
  reserveringsnummer: string; // "911269"
  bron: "reservering" | "voorkeur" | "geen";
}

/** Bouw de waarden voor de GHL custom fields uit aanvraag + contact + bedrijf + beste reservering. */
export function buildOfferteData(
  inq: any,
  contact: any,
  company: any | null,
  bookings: any[],
  revisie: number,
): OfferteData {
  // Beste reservering: bevestigd gaat voor optie, vroegste (toekomstige) datum eerst
  const booking = (bookings ?? [])
    .filter((b) => b.status === "confirmed" || b.status === "option")
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "confirmed" ? -1 : 1;
      return String(a.date).localeCompare(String(b.date));
    })[0];

  const datum = booking ? nlDate(booking.date) : nlDate(inq.preferred_date);
  const start = booking ? hhmm(booking.start_hour, booking.start_minute) : trimTime(inq.preferred_start_time);
  const eind = booking ? hhmm(booking.end_hour, booking.end_minute) : trimTime(inq.preferred_end_time);
  const gasten = (booking?.guest_count && Number(booking.guest_count) > 0) ? booking.guest_count : (inq.guest_count ?? 0);

  const volledigeNaam = `${contact?.first_name ?? ""} ${contact?.last_name ?? ""}`.trim();
  const bedrijf = company?.name || contact?.company || volledigeNaam || "—";

  return {
    offertenummer: dash(stripCon(contact?.display_number)),
    revisie: String(Math.max(1, revisie)).padStart(2, "0"),
    datum: dash(datum),
    start: dash(start),
    eind: dash(eind),
    bedrijf,
    type: dash(inq.event_type),
    gasten: String(gasten ?? 0),
    reserveringsnummer: dash(stripRes(booking?.reservation_number)),
    bron: booking ? "reservering" : (datum ? "voorkeur" : "geen"),
  };
}

export function toCustomFields(d: OfferteData) {
  return [
    { id: OFFERTE_FIELDS.nummer,    value: d.offertenummer },
    { id: OFFERTE_FIELDS.revisie,   value: d.revisie },
    { id: OFFERTE_FIELDS.datum,     value: d.datum },
    { id: OFFERTE_FIELDS.start,     value: d.start },
    { id: OFFERTE_FIELDS.eind,      value: d.eind },
    { id: OFFERTE_FIELDS.bedrijf,   value: d.bedrijf },
    { id: OFFERTE_FIELDS.type,      value: d.type },
    { id: OFFERTE_FIELDS.gasten,    value: d.gasten },
    { id: OFFERTE_FIELDS.resnummer, value: d.reserveringsnummer },
  ];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return jsonResponse(null, 200);
  if (!TOKEN || !LOCATION) return jsonResponse({ ok: false, error: "GHL niet geconfigureerd" }, 500);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

  // Auth: ingelogde gebruiker (app) of service key (andere edge functions)
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  let authorized = token === SERVICE_KEY && token !== "";
  if (!authorized && token) {
    const anonClient = createClient(SUPABASE_URL, ANON_KEY || token, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await anonClient.auth.getUser();
    authorized = Boolean(user);
  }
  if (!authorized) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);

  try {
    const body = await req.json().catch(() => ({}));
    const bump = body.bump !== false; // knop = true, automatisch = false
    let inquiryId: string | null = body.inquiry_id || null;

    const db = createClient(SUPABASE_URL, SERVICE_KEY);

    // Zonder inquiry_id: de meest recente open aanvraag van het contact
    if (!inquiryId && body.contact_id) {
      const { data: latest } = await db
        .from("inquiries")
        .select("id")
        .eq("contact_id", body.contact_id)
        .not("status", "in", '("lost","converted","after_sales","invoiced")')
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      inquiryId = latest?.id || null;
      if (!inquiryId) return jsonResponse({ ok: true, skipped: "no_open_inquiry" });
    }
    if (!inquiryId) throw new Error("inquiry_id ontbreekt");

    // 1. Aanvraag + contact + bedrijf ophalen
    const { data: inq, error: inqErr } = await db
      .from("inquiries")
      .select(`
        id, display_number, event_type, guest_count, status,
        preferred_date, preferred_start_time, preferred_end_time,
        contact_id, company_id, offerte_revisie,
        contacts:contact_id ( id, first_name, last_name, email, phone, company, display_number, ghl_contact_id ),
        companies:company_id ( id, name )
      `)
      .eq("id", inquiryId)
      .single();
    if (inqErr || !inq) throw new Error("Aanvraag niet gevonden");

    const contact = inq.contacts as any;
    if (!contact) {
      if (bump) throw new Error("Aanvraag heeft geen gekoppeld contact");
      return jsonResponse({ ok: true, skipped: "no_contact" });
    }

    // 2. Reserveringen van deze aanvraag
    const { data: bookings } = await db
      .from("bookings")
      .select("date, start_hour, start_minute, end_hour, end_minute, reservation_number, status, guest_count")
      .eq("inquiry_id", inquiryId);

    // 3. Revisie: knop hoogt op (atomair), automatisch gebruikt de huidige (min. 01)
    let revisie: number = Number(inq.offerte_revisie ?? 0);
    if (bump) {
      const { data: bumped, error: revErr } = await db.rpc("bump_offerte_revisie", { p_inquiry_id: inquiryId });
      if (revErr) throw revErr;
      revisie = Number(bumped);
    }

    const data = buildOfferteData(inq, contact, inq.companies as any, bookings ?? [], revisie);

    if (bump && data.datum === "—") {
      throw new Error(
        "Deze aanvraag heeft geen datum (geen reservering en geen voorkeursdatum). " +
        "Vul eerst een datum in voordat je de offerte klaarzet.",
      );
    }

    // 4. GHL-contact bepalen (aanmaken als het nog niet bestaat)
    let ghlId: string | null = contact.ghl_contact_id;
    if (!ghlId) {
      if (!contact.email && !contact.phone) {
        if (bump) throw new Error("Contact heeft geen e-mailadres of telefoonnummer; kan geen GHL-contact aanmaken");
        return jsonResponse({ ok: true, skipped: "no_ghl_contact" });
      }
      const res = await fetch(`${GHL_API_BASE}/contacts/upsert`, {
        method: "POST",
        headers: ghlHeaders,
        body: JSON.stringify({
          locationId: LOCATION,
          email: contact.email || undefined,
          phone: contact.phone || undefined,
          firstName: contact.first_name ?? undefined,
          lastName: contact.last_name ?? undefined,
        }),
      });
      const created = await res.json().catch(() => ({}));
      ghlId = created?.contact?.id ?? null;
      if (!ghlId) throw new Error(`GHL-contact niet gevonden: ${JSON.stringify(created).slice(0, 300)}`);
      await db.from("contacts").update({ ghl_contact_id: ghlId }).eq("id", contact.id);
    }

    // 5. Velden wegschrijven
    const put = await fetch(`${GHL_API_BASE}/contacts/${ghlId}`, {
      method: "PUT",
      headers: ghlHeaders,
      body: JSON.stringify({ customFields: toCustomFields(data) }),
    });
    if (!put.ok) throw new Error(`GHL ${put.status}: ${await readError(put)}`);
    await put.text();

    if (bump) {
      await db.from("inquiries").update({ offerte_gestaged_op: new Date().toISOString() }).eq("id", inquiryId);
    }

    return jsonResponse({
      ok: true,
      bumped: bump,
      revisie: data.revisie,
      offertenummer: `OFF-${data.offertenummer}-${data.revisie}`,
      bron: data.bron,
      datum: data.datum,
      tijd: data.start !== "—" && data.eind !== "—" ? `${data.start} tot ${data.eind}` : "",
      velden: data,
      ghl_contact_id: ghlId,
    });
  } catch (e) {
    console.error("stage-offerte:", e);
    return jsonResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }, 400);
  }
});
