// supabase/functions/stage-reservering/index.ts
//
// Knop "Reserveringsbevestiging klaarzetten" op een aanvraag. Zet alle gegevens
// voor het sjabloon Reserveringsbevestiging klaar op het GHL-contact
// ({{contact.reservering_*}}) en kent een vast reserveringsnummer toe.
//
//   { inquiry_id }                – alleen als er een getekende offerte is
//   { inquiry_id, force: true }   – ook zonder getekende offerte (bevestigd door gebruiker)
//   { inquiry_id, refresh: true } – automatisch na opslaan van aanvraag/reservering:
//                                   alleen als de bevestiging al eens is klaargezet,
//                                   zodat gewijzigde gegevens (zoals het aantal gasten)
//                                   direct in {{contact.reservering_*}} staan.
//
// Antwoord zonder getekende offerte: { ok: false, code: "no_signed_quote" }.

import { createClient } from "npm:@supabase/supabase-js@2";
import { GHL_API_BASE, jsonResponse, readError } from "../_shared/ghlCommon.ts";
import { buildReserveringData, LARGE_TEXT_FIELDS, pickSignedQuoteForInquiry, RESERVERING_FIELDS, signedOfferteNummer } from "../_shared/reservering.ts";
import { buildBegroting, invoiceLines, pickInvoice, type Invoice } from "../_shared/begroting.ts";
import { isQuoteDocument } from "../_shared/automations.ts";

const TOKEN = Deno.env.get("GHL_API_KEY") || "";
const LOCATION = Deno.env.get("GHL_LOCATION_ID") || "";

const ghlHeaders = {
  Authorization: `Bearer ${TOKEN}`,
  "Content-Type": "application/json",
  Version: "2021-07-28",
};

// Statussen waarin de klant de offerte al heeft geaccepteerd (ook als dat buiten GHL ging)
const ACCEPTED_STATUSES = ["reserved", "script", "confirmed", "invoiced", "after_sales", "converted"];

/** Haal de ID's van de reservering_*-velden op; ontbrekende velden worden aangemaakt. */
async function resolveFieldIds(): Promise<Record<string, string>> {
  const list = async () => {
    const res = await fetch(`${GHL_API_BASE}/locations/${LOCATION}/customFields?model=contact`, { headers: ghlHeaders });
    if (!res.ok) throw new Error(`GHL customFields ${res.status}: ${await readError(res)}`);
    const body = await res.json();
    const map: Record<string, string> = {};
    for (const f of body.customFields || []) {
      const key = String(f.fieldKey || "").replace(/^contact\./, "");
      if (key in RESERVERING_FIELDS) map[key] = f.id;
    }
    return map;
  };

  let ids = await list();
  const missing = Object.keys(RESERVERING_FIELDS).filter((k) => !ids[k]);
  if (missing.length) {
    for (const key of missing) {
      const res = await fetch(`${GHL_API_BASE}/locations/${LOCATION}/customFields`, {
        method: "POST",
        headers: ghlHeaders,
        body: JSON.stringify({ name: RESERVERING_FIELDS[key], dataType: LARGE_TEXT_FIELDS.has(key) ? "LARGE_TEXT" : "TEXT", model: "contact" }),
      });
      if (!res.ok) console.warn(`stage-reservering: veld ${key} aanmaken mislukt ${res.status}: ${await readError(res)}`);
      else await res.text();
    }
    ids = await list();
  }
  const stillMissing = Object.keys(RESERVERING_FIELDS).filter((k) => !ids[k]);
  if (stillMissing.length) throw new Error(`Ontbrekende GHL-velden: ${stillMissing.map((k) => `contact.${k}`).join(", ")}`);
  return ids;
}

/**
 * De factuur die GHL bij het ondertekenen van de offerte aanmaakte
 * ("<titel> - Invoice"), met de geaccepteerde productregels.
 * Vereist de scope invoices.readonly op de private integration.
 */
async function fetchAcceptedInvoice(ghlContactId: string, docTitle: string | null, docAmount: number | null): Promise<{ invoice: Invoice | null; warning?: string }> {
  const base = `${GHL_API_BASE}/invoices/`;
  const qs = (extra: string) => `?altId=${LOCATION}&altType=location&limit=100&offset=0${extra}`;
  let res = await fetch(`${base}${qs(`&contactId=${encodeURIComponent(ghlContactId)}`)}`, { headers: ghlHeaders });
  if (!res.ok) {
    const err = await readError(res);
    return { invoice: null, warning: `GHL facturen ${res.status}: ${err}` };
  }
  let list: Invoice[] = (await res.json()).invoices || [];
  // Sommige accounts negeren contactId: dan zelf filteren
  list = list.filter((i) => !i.contactDetails?.id || i.contactDetails.id === ghlContactId);
  const picked = pickInvoice(list, docTitle, docAmount);
  if (!picked?._id) return { invoice: null, warning: list.length ? "Geen factuur gevonden die bij de getekende offerte hoort" : "Contact heeft geen facturen in CliqCRM" };
  if (invoiceLines(picked).length) return { invoice: picked };
  res = await fetch(`${base}${picked._id}${qs("")}`, { headers: ghlHeaders });
  if (!res.ok) return { invoice: null, warning: `GHL factuur ${res.status}: ${await readError(res)}` };
  const body = await res.json();
  const invoice = (body.invoice || body) as Invoice;
  if (!invoiceLines(invoice).length) {
    console.warn("stage-reservering: factuur zonder regels, velden:", Object.keys(invoice || {}).join(","));
    return { invoice, warning: `Factuur ${(invoice as any).invoiceNumber || picked._id} heeft geen productregels` };
  }
  return { invoice };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return jsonResponse(null, 200);
  if (!TOKEN || !LOCATION) return jsonResponse({ ok: false, error: "GHL niet geconfigureerd" }, 500);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

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
    const inquiryId: string | null = body.inquiry_id || null;
    const refresh = body.refresh === true;
    const force = body.force === true || refresh;
    if (!inquiryId) throw new Error("inquiry_id ontbreekt");

    const db = createClient(SUPABASE_URL, SERVICE_KEY);

    // 1. Aanvraag + contact + bedrijf
    const { data: inq, error: inqErr } = await db
      .from("inquiries")
      .select(`
        id, display_number, event_type, guest_count, status, room_preference, created_at,
        preferred_date, preferred_start_time, preferred_end_time,
        contact_id, company_id, offerte_revisie, reservation_number, reservering_gestaged_op,
        contacts:contact_id ( id, first_name, last_name, email, phone, company, company_id, display_number, ghl_contact_id ),
        companies:company_id ( id, name )
      `)
      .eq("id", inquiryId)
      .single();
    if (inqErr || !inq) throw new Error("Aanvraag niet gevonden");
    if (refresh && !(inq as any).reservering_gestaged_op) {
      return jsonResponse({ ok: true, skipped: "not_staged" });
    }

    // "Op naam van" apart ophalen: de kolom kan ontbreken zolang migratie
    // 20261026210000 nog niet is toegepast; dan gewoon overslaan.
    {
      const { data: onvRow, error: onvErr } = await db.from("inquiries").select("op_naam_van").eq("id", inquiryId).maybeSingle();
      if (!onvErr && onvRow) (inq as any).op_naam_van = (onvRow as any).op_naam_van ?? null;
    }
    const contact = inq.contacts as any;
    if (!contact) throw new Error("Aanvraag heeft geen gekoppeld contact");

    // Particulier-vlaggen (companies.is_private) los ophalen
    {
      const ids = [(inq as any).company_id, contact.company_id].filter(Boolean);
      if (ids.length) {
        const { data: cos, error: coErr } = await db.from("companies").select("id, name, is_private").in("id", ids);
        if (!coErr && cos) {
          const byId = new Map((cos as any[]).map((c) => [c.id, c]));
          if ((inq as any).company_id && byId.has((inq as any).company_id)) (inq as any).companies = byId.get((inq as any).company_id);
          if (contact.company_id && byId.has(contact.company_id)) contact.private_company = byId.get(contact.company_id);
        }
      }
    }

    // 2. Getekende offerte zoeken (documenten van deze aanvraag, anders van het contact)
    const quoteCfg = { sent_status: "", signed_status: "", convert_option_to_confirmed: false, title_keywords: ["offerte", "contract"] };
    const findSignedDoc = async (): Promise<any> => {
      const { data: docs } = await db
        .from("documents")
        .select("id, title, document_type, document_kind, status, signed_at, offerte_nummer, inquiry_id, contact_id, amount")
        .or(`inquiry_id.eq.${inquiryId},contact_id.eq.${contact.id}`)
        .in("status", ["signed", "paid"])
        .order("signed_at", { ascending: false });
      const signedQuotes = (docs ?? []).filter((d: any) => isQuoteDocument(d, quoteCfg));
      return pickSignedQuoteForInquiry(signedQuotes as any[], inquiryId, inq.created_at);
    };
    let signedDoc: any = await findSignedDoc();
    // Net getekend in CliqCRM maar nog niet binnen in BUUT (de sync loopt elke
    // 5–10 min)? Dan eerst de documenten ophalen, anders komen begroting en
    // offertenummer van de getekende offerte niet mee.
    if (!refresh) {
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/ghl-auto-sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_KEY}` },
          body: JSON.stringify({ scope: "documents", trigger: "stage-reservering" }),
        });
        await r.text();
        signedDoc = (await findSignedDoc()) ?? signedDoc;
      } catch (e) {
        console.warn("stage-reservering: documenten ophalen mislukt", e);
      }
    }

    if (!signedDoc && !ACCEPTED_STATUSES.includes(inq.status) && !force) {
      return jsonResponse({
        ok: false,
        code: "no_signed_quote",
        error: "Er is nog geen getekende offerte voor deze aanvraag.",
      });
    }

    // 3. Reserveringen + vast reserveringsnummer
    const bookingCols = "id, date, start_hour, start_minute, end_hour, end_minute, reservation_number, status, guest_count, room_name, room_setup";
    const { data: inqBookings } = await db.from("bookings").select(bookingCols).eq("inquiry_id", inquiryId);
    // Reserveringen van hetzelfde contact op dezelfde dag zonder aanvraag-koppeling
    // (bijv. een aparte kookworkshop na de vergadering) horen bij hetzelfde evenement.
    const dates = [...new Set([...(inqBookings ?? []).map((b: any) => b.date), inq.preferred_date].filter(Boolean))];
    let extra: any[] = [];
    if (dates.length) {
      const { data } = await db.from("bookings").select(bookingCols)
        .eq("contact_id", contact.id).is("inquiry_id", null).in("date", dates);
      extra = data ?? [];
    }
    const bookings = [...(inqBookings ?? []), ...extra.filter((e) => !(inqBookings ?? []).some((b: any) => b.id === e.id))];

    const hasDate = (bookings ?? []).some((b: any) => b.status === "confirmed" || b.status === "option") || Boolean(inq.preferred_date);
    if (!hasDate) {
      throw new Error("Deze aanvraag heeft geen datum. Maak eerst een reservering of vul een voorkeursdatum in.");
    }

    const { data: resNr, error: resErr } = await db.rpc("ensure_inquiry_reservation_number", { p_inquiry_id: inquiryId });
    if (resErr) throw resErr;

    // 4. Offertenummer van de getekende versie
    let bumpedAfterSigned = false;
    if (signedDoc && !signedDoc.offerte_nummer) {
      const { data: run } = await db.from("automation_runs").select("result")
        .eq("dedupe_key", `quote_sent:${signedDoc.id}`).maybeSingle();
      bumpedAfterSigned = Boolean(run && !(run as any).result?.skipped);
    }
    const offerteNummer = signedOfferteNummer({
      contactDisplayNumber: contact.display_number,
      currentRevisie: Number(inq.offerte_revisie ?? 0),
      signedDoc,
      revisieBumpedAfterSigned: bumpedAfterSigned,
    });

    // 5. GHL-contact (aanmaken als het nog niet bestaat)
    let ghlId: string | null = contact.ghl_contact_id;
    if (!ghlId) {
      if (!contact.email && !contact.phone) throw new Error("Contact heeft geen e-mailadres of telefoonnummer; kan geen GHL-contact aanmaken");
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

    // 6. Begroting van de geaccepteerde offerte (uit de GHL-factuur)
    const docAmount = signedDoc?.amount != null ? Number(signedDoc.amount) : null;
    let begrotingWarning: string | undefined;
    let invoice: Invoice | null = null;
    if (signedDoc) {
      try {
        const r = await fetchAcceptedInvoice(ghlId, signedDoc.title, docAmount);
        invoice = r.invoice;
        begrotingWarning = r.warning;
      } catch (e) {
        begrotingWarning = `Begroting ophalen mislukt: ${e instanceof Error ? e.message : String(e)}`;
      }
      if (begrotingWarning) console.warn("stage-reservering:", begrotingWarning);
    }
    const begroting = buildBegroting(invoice, docAmount);

    const data = buildReserveringData({
      inquiry: inq,
      contact,
      company: inq.companies as any,
      bookings: bookings ?? [],
      reservationNumber: String(resNr),
      offerteNummer,
      begroting,
    });

    // 7. Velden wegschrijven
    const ids = await resolveFieldIds();
    const customFields = Object.entries(data).map(([key, value]) => ({ id: ids[key], value }));
    const put = await fetch(`${GHL_API_BASE}/contacts/${ghlId}`, {
      method: "PUT",
      headers: ghlHeaders,
      body: JSON.stringify({ customFields }),
    });
    if (!put.ok) throw new Error(`GHL ${put.status}: ${await readError(put)}`);
    await put.text();

    await db.from("inquiries").update({ reservering_gestaged_op: new Date().toISOString() }).eq("id", inquiryId);

    return jsonResponse({
      ok: true,
      reserveringsnummer: `RES-${data.reservering_nummer}`,
      offertenummer: data.reservering_offertenummer,
      getekend: Boolean(signedDoc),
      begroting_bron: begroting.bron,
      begroting_melding: begrotingWarning ?? null,
      velden: data,
      ghl_contact_id: ghlId,
    });
  } catch (e) {
    console.error("stage-reservering:", e);
    return jsonResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }, 400);
  }
});
