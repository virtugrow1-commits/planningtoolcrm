// Read-only API for external tools (Casting tool / narrowcasting).
// Auth: header "x-api-key" must equal secret CASTING_TOOL_API_KEY.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const headers = {
  ...corsHeaders,
  "Access-Control-Allow-Headers": `${corsHeaders["Access-Control-Allow-Headers"] ?? ""}, x-api-key`,
  "Content-Type": "application/json",
};

const RESOURCES: Record<string, { table: string; cols: string; search?: string[]; dateCol?: string; order: string }> = {
  rooms: {
    table: "room_settings",
    cols: "id, room_name, display_name, max_guests, enabled",
    order: "room_name",
  },
  companies: {
    table: "companies",
    cols: "id, display_number, name, is_private, email, phone, website, address, postcode, city, country, kvk, updated_at",
    search: ["name", "email", "city"],
    order: "name",
  },
  contacts: {
    table: "contacts",
    cols: "id, display_number, first_name, infix, last_name, email, phone, mobile, job_title, company_id, company, birth_date, departed, is_active, updated_at",
    search: ["first_name", "last_name", "email", "company"],
    order: "last_name",
  },
  inquiries: {
    table: "inquiries",
    cols: "id, display_number, title, event_type, status, preferred_date, preferred_start_time, preferred_end_time, room_preference, guest_count, contact_id, contact_name, company_id, assigned_to, updated_at",
    search: ["title", "contact_name", "event_type"],
    order: "created_at",
  },
  bookings: {
    table: "bookings",
    cols: "id, reservation_number, title, room_name, date, start_hour, start_minute, end_hour, end_minute, status, guest_count, room_setup, contact_id, contact_name, company_id, inquiry_id, updated_at",
    search: ["title", "contact_name", "room_name"],
    dateCol: "date",
    order: "date",
  },
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "GET") return json({ error: "Only GET allowed" }, 405);

  const expected = Deno.env.get("CASTING_TOOL_API_KEY");
  const given = req.headers.get("x-api-key") ?? "";
  if (!expected) return json({ error: "API key not configured" }, 500);
  if (!safeEqual(given, expected)) return json({ error: "Unauthorized" }, 401);

  const url = new URL(req.url);
  const resource = url.searchParams.get("resource") ?? "";
  const cfg = RESOURCES[resource];
  if (!cfg) return json({ error: `Unknown resource. Use: ${Object.keys(RESOURCES).join(", ")}` }, 400);

  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "200", 10) || 200, 1), 500);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100).replace(/[,()%*]/g, " ");
  const id = url.searchParams.get("id");
  const companyId = url.searchParams.get("company_id");
  let from = url.searchParams.get("from");
  let to = url.searchParams.get("to");
  // Narrowcasting convenience: ?day=today returns only today's bookings (Europe/Amsterdam).
  if (url.searchParams.get("day") === "today") {
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
    from = today;
    to = today;
  }
  const uuid = /^[0-9a-f-]{36}$/i;
  const day = /^\d{4}-\d{2}-\d{2}$/;
  if ((id && !uuid.test(id)) || (companyId && !uuid.test(companyId))) return json({ error: "Invalid id" }, 400);
  if ((from && !day.test(from)) || (to && !day.test(to))) return json({ error: "Dates must be yyyy-MM-dd" }, 400);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let query = db.from(cfg.table).select(cfg.cols, { count: "exact" });
  if (id) query = query.eq("id", id);
  if (companyId && resource !== "rooms" && resource !== "companies") query = query.eq("company_id", companyId);
  if (resource === "rooms") query = query.eq("enabled", true);
  if (resource === "inquiries") query = query.is("deleted_at", null);
  if (cfg.dateCol && from) query = query.gte(cfg.dateCol, from);
  if (cfg.dateCol && to) query = query.lte(cfg.dateCol, to);
  if (q && cfg.search) query = query.or(cfg.search.map((c) => `${c}.ilike.%${q}%`).join(","));
  query = query.order(cfg.order, { ascending: resource !== "inquiries" }).range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) {
    console.error("crm-read-api error", error);
    return json({ error: error.message }, 500);
  }
  return json({ resource, count, offset, limit, data });
});
