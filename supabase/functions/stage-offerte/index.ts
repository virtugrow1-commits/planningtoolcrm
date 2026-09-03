// supabase/functions/stage-offerte/index.ts
//
// Zet de offertegegevens van één aanvraag klaar op het GHL-contact,
// zodat de Documents & Contracts sjablonen de juiste waarden tonen.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GHL = "https://services.leadconnectorhq.com";
const TOKEN = Deno.env.get("GHL_API_KEY")!;
const LOCATION = Deno.env.get("GHL_LOCATION_ID")!;

// GHL custom field IDs (locatie a6wexXlGQhhJXChWHIet)
const F = {
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

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** "2026-10-19" -> "19-10-2026" */
function nlDate(iso?: string | null): string {
  if (!iso) return "";
  const m = String(iso).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(iso); // al Nederlands of onbekend formaat: laat staan
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

/** "RES-911269" -> "911269" (sjabloon heeft al een statische RES-) */
function stripRes(n?: string | null): string {
  return n ? String(n).replace(/^RES-/i, "") : "";
}

/** "CON-444151" -> "444151" */
function stripCon(n?: string | null): string {
  return n ? String(n).replace(/^CON-/i, "") : "";
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { inquiry_id } = await req.json();
    if (!inquiry_id) throw new Error("inquiry_id ontbreekt");

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Aanvraag + contact + bedrijf ophalen
    const { data: inq, error: inqErr } = await db
      .from("inquiries")
      .select(`
        id, display_number, event_type, guest_count,
        preferred_date, preferred_start_time, preferred_end_time,
        contact_id, company_id,
        contacts:contact_id (
          id, first_name, last_name, email, company,
          display_number, ghl_contact_id
        ),
        companies:company_id ( id, name )
      `)
      .eq("id", inquiry_id)
      .single();

    if (inqErr || !inq) throw new Error("Aanvraag niet gevonden");

    const contact = inq.contacts as any;
    if (!contact) throw new Error("Aanvraag heeft geen gekoppeld contact");
    if (!contact.email) throw new Error("Contact heeft geen e-mailadres");

    // 2. Beste reservering zoeken: gekoppeld aan deze aanvraag,
    //    bevestigd gaat voor optie, vroegste datum eerst.
    const { data: bookings } = await db
      .from("bookings")
      .select("date, start_hour, start_minute, end_hour, end_minute, reservation_number, status")
      .eq("inquiry_id", inquiry_id)
      .in("status", ["confirmed", "option"]);

    const booking = (bookings ?? []).sort((a, b) => {
      if (a.status !== b.status) return a.status === "confirmed" ? -1 : 1;
      return String(a.date).localeCompare(String(b.date));
    })[0];

    // 3. Datum en tijden: reservering wint, anders voorkeur uit de aanvraag
    const datum = booking
      ? nlDate(booking.date)
      : nlDate(inq.preferred_date);

    const start = booking
      ? hhmm(booking.start_hour, booking.start_minute)
      : trimTime(inq.preferred_start_time);

    const eind = booking
      ? hhmm(booking.end_hour, booking.end_minute)
      : trimTime(inq.preferred_end_time);

    if (!datum) {
      throw new Error(
        "Deze aanvraag heeft geen datum (geen reservering en geen voorkeursdatum). " +
        "Vul eerst een datum in voordat je de offerte klaarzet.",
      );
    }

    // 4. Bedrijfsnaam: gekoppeld bedrijf wint van het vrije tekstveld
    const bedrijf = (inq.companies as any)?.name ?? contact.company ?? "";

    // 5. Revisienummer ophogen (atomair in Postgres)
    const { data: revisie, error: revErr } = await db
      .rpc("bump_offerte_revisie", { p_inquiry_id: inquiry_id });
    if (revErr) throw revErr;

    const revisieStr = String(revisie).padStart(2, "0");

    // 6. GHL-contact bepalen
    let ghlId: string | null = contact.ghl_contact_id;
    if (!ghlId) {
      const res = await fetch(`${GHL}/contacts/upsert`, {
        method: "POST",
        headers: ghlHeaders,
        body: JSON.stringify({
          locationId: LOCATION,
          email: contact.email,
          firstName: contact.first_name ?? undefined,
          lastName: contact.last_name ?? undefined,
        }),
      });
      const body = await res.json();
      ghlId = body?.contact?.id ?? null;
      if (!ghlId) throw new Error(`GHL-contact niet gevonden: ${JSON.stringify(body)}`);

      await db.from("contacts").update({ ghl_contact_id: ghlId }).eq("id", contact.id);
    }

    // 7. Velden wegschrijven
    const customFields = [
      { id: F.nummer,    value: String(contact.display_number ?? "") },
      { id: F.revisie,   value: revisieStr },
      { id: F.datum,     value: datum },
      { id: F.start,     value: start },
      { id: F.eind,      value: eind },
      { id: F.bedrijf,   value: bedrijf },
      { id: F.type,      value: inq.event_type ?? "" },
      { id: F.gasten,    value: inq.guest_count ? String(inq.guest_count) : "" },
      { id: F.resnummer, value: stripRes(booking?.reservation_number) },
    ];

    const put = await fetch(`${GHL}/contacts/${ghlId}`, {
      method: "PUT",
      headers: ghlHeaders,
      body: JSON.stringify({ customFields }),
    });

    if (!put.ok) {
      throw new Error(`GHL ${put.status}: ${await put.text()}`);
    }

    return json({
      ok: true,
      revisie: revisieStr,
      offertenummer: `OFF-${contact.display_number}-${revisieStr}`,
      bron: booking ? "reservering" : "voorkeur",
      datum,
      tijd: start && eind ? `${start} tot ${eind}` : "",
      ghl_contact_id: ghlId,
    });
  } catch (e) {
    console.error("stage-offerte:", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 400);
  }
});
