// offertetool-api
//
// Koppeling voor de offertetool (eigen app, los van BUUT). De tool haalt hier
// alle bekende gegevens van een aanvraag op, zodat medewerkers niets hoeven over
// te typen, en meldt verzonden/geaccepteerde documenten terug zodat BUUT de
// aanvraag, de optie, de taken en het dashboard bijwerkt zoals bij CliqCRM-documenten.
//
// Auth: header "x-api-key" moet gelijk zijn aan secret OFFERTETOOL_API_KEY.
//
//   GET  ?action=search&q=…                    open aanvragen zoeken
//   GET  ?action=by_ghl_contact&ghl_contact_id= aanvragen van een CliqCRM-contact
//   GET  ?action=inquiry&id=…                  alles wat de offerte nodig heeft
//   POST { action: "document_event", … }       document verzonden / geaccepteerd
//
// Documenten uit de tool staan in public.documents met ghl_document_id
// "offertetool:<id>". De documentensync van CliqCRM laat die rijen met rust.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { addressOf, buildBundle, contactName } from "../_shared/offertetoolBundle.ts";

const headers = {
  ...corsHeaders,
  "Access-Control-Allow-Headers": `${corsHeaders["Access-Control-Allow-Headers"] ?? ""}, x-api-key`,
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const UUID = /^[0-9a-f-]{36}$/i;
const CLOSED = ["lost", "converted", "after_sales", "invoiced"];
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  const expected = Deno.env.get("OFFERTETOOL_API_KEY");
  if (!expected) return json({ error: "OFFERTETOOL_API_KEY is niet ingesteld" }, 500);
  if (!safeEqual(req.headers.get("x-api-key") ?? "", expected)) return json({ error: "Unauthorized" }, 401);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const db = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const url = new URL(req.url);

  try {
    if (req.method === "GET") {
      const action = url.searchParams.get("action") ?? "";
      const listCols = "id, display_number, title, event_type, status, preferred_date, contact_id, contact_name, company_id, ghl_opportunity_id, created_at, contacts:contact_id ( email, ghl_contact_id ), companies:company_id ( name )";
      const mapList = (rows: any[]) => rows.map((r) => ({
        id: r.id, displayNumber: r.display_number, title: r.title ?? "", eventType: r.event_type ?? "", status: r.status,
        date: r.preferred_date, contactName: r.contact_name, email: r.contacts?.email ?? "", ghlContactId: r.contacts?.ghl_contact_id ?? null,
        companyName: r.companies?.name ?? "", createdAt: r.created_at,
      }));

      if (action === "search") {
        const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100).replace(/[,()%*]/g, " ");
        let query = db.from("inquiries").select(listCols).is("deleted_at", null).not("status", "in", `(${CLOSED.join(",")})`);
        if (q) query = query.or(["title", "contact_name", "event_type", "display_number"].map((c) => `${c}.ilike.%${q}%`).join(","));
        const { data, error } = await query.order("created_at", { ascending: false }).limit(30);
        if (error) throw error;
        return json({ data: mapList(data ?? []) });
      }

      if (action === "by_ghl_contact") {
        const gid = (url.searchParams.get("ghl_contact_id") ?? "").trim();
        if (!gid || gid.length > 64) return json({ error: "ghl_contact_id ontbreekt" }, 400);
        const { data: cs } = await db.from("contacts").select("id").eq("ghl_contact_id", gid);
        const ids = (cs ?? []).map((c: any) => c.id);
        if (!ids.length) return json({ data: [] });
        const { data, error } = await db.from("inquiries").select(listCols).is("deleted_at", null).in("contact_id", ids)
          .order("created_at", { ascending: false }).limit(20);
        if (error) throw error;
        return json({ data: mapList(data ?? []) });
      }

      if (action === "inquiry") {
        const id = url.searchParams.get("id") ?? "";
        if (!UUID.test(id)) return json({ error: "Ongeldig id" }, 400);
        const { data: inq, error } = await db.from("inquiries").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
        if (error) throw error;
        if (!inq) return json({ error: "Aanvraag niet gevonden" }, 404);
        const { data: contact } = inq.contact_id
          ? await db.from("contacts").select("id, first_name, infix, last_name, email, phone, mobile, address, postcode, city, country, company, company_id, ghl_contact_id").eq("id", inq.contact_id).maybeSingle()
          : { data: null };
        const companyIds = [inq.company_id, (contact as any)?.company_id].filter(Boolean);
        const { data: cos } = companyIds.length ? await db.from("companies").select("*").in("id", companyIds) : { data: [] };
        const byId = new Map((cos ?? []).map((c: any) => [c.id, c]));
        const company = inq.company_id ? byId.get(inq.company_id) ?? null : null;
        const contactCompany = (contact as any)?.company_id ? byId.get((contact as any).company_id) ?? null : null;
        const bookingCols = "id, date, start_hour, start_minute, end_hour, end_minute, reservation_number, status, guest_count, room_name, room_setup, option_expires_at";
        const { data: bookings } = await db.from("bookings").select(bookingCols).eq("inquiry_id", id);
        const bundle = buildBundle(inq, contact, company, contactCompany, bookings ?? []);
        // Andere contactpersonen van hetzelfde bedrijf (keuze ontvanger, bijv. dochter i.p.v. ouders)
        const coId = inq.company_id || (contact as any)?.company_id;
        const { data: colleagues } = coId
          ? await db.from("contacts").select("id, first_name, infix, last_name, email, phone, mobile, ghl_contact_id, address, postcode, city, country").eq("company_id", coId).eq("departed", false).limit(25)
          : { data: [] };
        return json({
          ...bundle,
          otherContacts: (colleagues ?? []).filter((c: any) => c.id !== (contact as any)?.id).map((c: any) => ({
            id: c.id, fullName: contactName(c), firstName: [c.first_name, c.infix].filter(Boolean).join(" "), lastName: c.last_name ?? "",
            email: c.email ?? "", phone: c.phone || c.mobile || "", ghlContactId: c.ghl_contact_id ?? null,
            ...addressOf(c, byId.get(coId) ?? null),
          })),
        });
      }
      return json({ error: "Onbekende action. Gebruik search, by_ghl_contact of inquiry." }, 400);
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (body.action !== "document_event") return json({ error: "Onbekende action" }, 400);
      const inquiryId = String(body.inquiry_id ?? "");
      const externalId = String(body.external_id ?? "");
      const kind = body.kind === "reserveringsbevestiging" ? "reserveringsbevestiging" : "offerte";
      const status = body.status === "signed" ? "signed" : "sent";
      if (!UUID.test(inquiryId) || !/^[\w-]{6,80}$/.test(externalId)) return json({ error: "inquiry_id of external_id ongeldig" }, 400);

      const { data: inq } = await db.from("inquiries").select("id, user_id, contact_id, contact_name, company_id").eq("id", inquiryId).maybeSingle();
      if (!inq) return json({ error: "Aanvraag niet gevonden" }, 404);

      // De titel bepaalt in BUUT de soort (document_kind): "Offerte …" of "Reserveringsbevestiging …"
      const label = kind === "offerte" ? "Offerte" : "Reserveringsbevestiging";
      const rawTitle = String(body.title ?? "").trim().slice(0, 200);
      const title = new RegExp(kind === "offerte" ? "offerte" : "reserveringsbevestiging", "i").test(rawTitle) ? rawTitle : `${label} ${rawTitle}`.trim();
      const now = new Date().toISOString();
      const ghlDocumentId = `offertetool:${externalId}`;
      const row: Record<string, unknown> = {
        user_id: inq.user_id, contact_id: inq.contact_id, inquiry_id: inq.id, company_id: inq.company_id,
        ghl_document_id: ghlDocumentId, title, document_type: "proposal", status,
        sent_at: body.sent_at || now, amount: body.amount != null ? Number(body.amount) : null,
        external_url: typeof body.url === "string" ? body.url.slice(0, 500) : null, contact_name: inq.contact_name || "Onbekend",
        updated_at: now,
      };
      if (status === "signed") row.signed_at = body.signed_at || now;
      if (kind === "offerte" && body.number) row.offerte_nummer = String(body.number).slice(0, 40);

      const { data: existing } = await db.from("documents").select("id, status").eq("ghl_document_id", ghlDocumentId).maybeSingle();
      // Een geaccepteerd document gaat nooit terug naar "verzonden"
      if (existing && existing.status === "signed" && status === "sent") delete row.status;
      const { error: wErr } = existing
        ? await db.from("documents").update(row).eq("id", existing.id)
        : await db.from("documents").insert(row);
      if (wErr) throw wErr;

      // Bij akkoord: vast reserveringsnummer van de aanvraag (zelfde als in BUUT)
      let reservationNumber: string | null = null;
      if (status === "signed") {
        const { data: nr, error: nrErr } = await db.rpc("ensure_inquiry_reservation_number", { p_inquiry_id: inquiryId });
        if (nrErr) console.warn("offertetool-api: reserveringsnummer", nrErr.message);
        else reservationNumber = nr ? `RES-${String(nr).replace(/^RES-/i, "")}` : null;
      }

      // Fase, optie → bevestigd en taken direct laten verwerken (anders bij de volgende cron-ronde)
      let automations: string = "skipped";
      try {
        const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
        const r = await fetch(`${SUPABASE_URL}/functions/v1/crm-automations`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${anon}` },
          body: JSON.stringify({ inquiry_id: inquiryId, source: "offertetool" }),
        });
        await r.text();
        automations = r.ok ? "ok" : `status ${r.status}`;
      } catch (e) {
        automations = `fout: ${String(e)}`;
      }
      return json({ ok: true, reservationNumber, automations });
    }
    return json({ error: "Method not allowed" }, 405);
  } catch (e) {
    console.error("offertetool-api", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
