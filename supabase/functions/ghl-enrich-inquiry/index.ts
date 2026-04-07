import { createClient } from "npm:@supabase/supabase-js@2";

const GHL_API_BASE = 'https://services.leadconnectorhq.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Rate-limit-aware fetch with max 3 retries and shorter backoff */
async function ghlFetch(url: string, opts: RequestInit = {}): Promise<Response> {
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const backoff = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
      await delay(backoff + Math.floor(Math.random() * 500));
    }
    const res = await fetch(url, opts);
    if (res.status !== 429) return res;
    await res.text();
  }
  return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429 });
}

// In-memory cache for custom field definitions (persists across warm invocations)
let cachedFieldDefs: Record<string, string> | null = null;
let cachedFieldDefsAt = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const GHL_API_KEY = Deno.env.get('GHL_API_KEY');
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  if (!GHL_API_KEY) {
    return new Response(JSON.stringify({ error: 'GHL not configured' }), { status: 500, headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { inquiry_id } = await req.json();
    if (!inquiry_id) {
      return new Response(JSON.stringify({ error: 'inquiry_id required' }), { status: 400, headers: corsHeaders });
    }

    const { data: inquiry, error: inqErr } = await supabase
      .from('inquiries')
      .select('*')
      .eq('id', inquiry_id)
      .single();

    if (inqErr || !inquiry) {
      return new Response(JSON.stringify({ error: 'Inquiry not found' }), { status: 404, headers: corsHeaders });
    }

    if (!inquiry.ghl_opportunity_id) {
      return new Response(JSON.stringify({ error: 'No GHL opportunity linked' }), { status: 400, headers: corsHeaders });
    }

    const GHL_LOCATION_ID = Deno.env.get('GHL_LOCATION_ID');
    const ghlHeaders = {
      'Authorization': `Bearer ${GHL_API_KEY}`,
      'Content-Type': 'application/json',
      'Version': '2021-07-28',
    };

    // Parallel fetch: opportunity + custom field defs (if not cached)
    const needFieldDefs = GHL_LOCATION_ID && (!cachedFieldDefs || Date.now() - cachedFieldDefsAt > CACHE_TTL);
    
    const [oppRes, fieldDefsRes] = await Promise.all([
      ghlFetch(`${GHL_API_BASE}/opportunities/${inquiry.ghl_opportunity_id}`, { headers: ghlHeaders }),
      needFieldDefs
        ? ghlFetch(`${GHL_API_BASE}/locations/${GHL_LOCATION_ID}/customFields`, { headers: ghlHeaders })
        : Promise.resolve(null),
    ]);

    // Process custom field definitions
    const fieldDefsMap: Record<string, string> = cachedFieldDefs ? { ...cachedFieldDefs } : {};
    if (fieldDefsRes && fieldDefsRes.ok) {
      const cfData = await fieldDefsRes.json();
      const fields = cfData.customFields || cfData || [];
      for (const f of fields) {
        if (f.id && f.name) fieldDefsMap[f.id] = f.name;
      }
      cachedFieldDefs = fieldDefsMap;
      cachedFieldDefsAt = Date.now();
      console.log(`Loaded ${Object.keys(fieldDefsMap).length} custom field definitions`);
    } else if (fieldDefsRes && !fieldDefsRes.ok) {
      console.warn(`Custom field defs fetch failed: ${fieldDefsRes.status} (using ${Object.keys(fieldDefsMap).length} cached)`);
      await fieldDefsRes.text(); // consume body
    }

    const resolveCustomField = (cf: any): { name: string; value: string } => {
      const name = cf.name || cf.fieldName || cf.key || fieldDefsMap[cf.id] || cf.id || '';
      const value = cf.value || cf.fieldValue || '';
      return { name: name.toLowerCase(), value: String(value) };
    };

    const fieldMap: Record<string, string> = {};
    let opp: any = {};
    let ghlContactId: string | null = null;

    if (oppRes.ok) {
      const oppData = await oppRes.json();
      opp = oppData.opportunity || oppData;
      ghlContactId = opp.contactId || opp.contact?.id;
      console.log(`Opportunity fetched. contactId: ${ghlContactId}, customFields: ${(opp.customFields || opp.custom_fields || []).length}`);

      const oppCustomFields = opp.customFields || opp.custom_fields || [];
      for (const cf of oppCustomFields) {
        const { name, value } = resolveCustomField(cf);
        if (value) fieldMap[name] = value;
      }
    } else {
      const status = oppRes.status;
      await oppRes.text(); // consume body
      console.warn(`GHL opportunity fetch failed: ${status}`);
      // Fallback: get ghl_contact_id from local DB
      if (inquiry.contact_id) {
        const { data: localContact } = await supabase.from('contacts').select('ghl_contact_id').eq('id', inquiry.contact_id).maybeSingle();
        ghlContactId = localContact?.ghl_contact_id || null;
        console.log(`Fallback contact lookup: ghl_contact_id=${ghlContactId}`);
      }
    }

    // Fetch contact custom fields
    if (ghlContactId) {
      try {
        const contactRes = await ghlFetch(`${GHL_API_BASE}/contacts/${ghlContactId}`, { headers: ghlHeaders });
        if (contactRes.ok) {
          const contactData = await contactRes.json();
          const ghlContact = contactData.contact || contactData;

          const contactCustomFields = ghlContact.customFields || ghlContact.custom_fields || ghlContact.customField || [];
          for (const cf of contactCustomFields) {
            const { name, value } = resolveCustomField(cf);
            if (value && !fieldMap[name]) fieldMap[name] = value;
          }

          const contactTopFields: Record<string, string | undefined> = {
            'aantal gasten': ghlContact.numberOfGuests || ghlContact.guest_count,
            'type evenement': ghlContact.eventType || ghlContact.event_type,
            'gewenste datum': ghlContact.preferredDate || ghlContact.preferred_date,
          };
          for (const [key, val] of Object.entries(contactTopFields)) {
            if (val && !fieldMap[key]) fieldMap[key] = val;
          }

          if (inquiry.contact_id) {
            const updateData: Record<string, any> = {};
            if (ghlContact.email) updateData.email = ghlContact.email;
            if (ghlContact.phone) updateData.phone = ghlContact.phone;
            if (ghlContact.companyName) updateData.company = ghlContact.companyName;
            if (Object.keys(updateData).length > 0) {
              await supabase.from('contacts').update(updateData).eq('id', inquiry.contact_id);
            }
          }
        }
      } catch (contactErr) {
        console.error('Failed to fetch GHL contact (non-fatal):', contactErr);
      }
    }

    const contact = opp.contact || {};

    const fuzzyFind = (...terms: string[]): string => {
      for (const term of terms) {
        if (fieldMap[term]) return fieldMap[term];
      }
      for (const term of terms) {
        for (const [key, value] of Object.entries(fieldMap)) {
          if (key.includes(term) && value) return value;
        }
      }
      return '';
    };

    const guestCount = parseInt(fuzzyFind('aantal gasten', 'guest_count', 'guests', 'gasten') || '0', 10) || inquiry.guest_count || 0;
    const preferredDate = fuzzyFind('gewenste datum', 'selecteer de gewenste datum', 'preferred_date', 'datum') || inquiry.preferred_date;
    const roomPreference = fuzzyFind('gewenste zaalopstelling', 'zaalopstelling', 'room_preference', 'zaal') || inquiry.room_preference;
    const budget = fuzzyFind('budget') ? Number(fuzzyFind('budget')) : (opp.monetaryValue ? Number(opp.monetaryValue) : inquiry.budget);

    const messageParts: string[] = [];
    const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    for (const [key, value] of Object.entries(fieldMap)) {
      if (value) messageParts.push(`${capitalize(key)}: ${value}`);
    }
    const fullMessage = messageParts.join('\n').trim() || null;

    const eventType = fuzzyFind('type evenement', 'type gelegenheid', 'event_type', 'soort evenement') || opp.name || inquiry.event_type;
    const enrichedSource = opp.source && opp.source !== 'GHL' ? opp.source : inquiry.source;

    const { error: updateErr } = await supabase.from('inquiries').update({
      event_type: eventType,
      guest_count: guestCount,
      preferred_date: preferredDate || null,
      room_preference: roomPreference || null,
      budget: budget || null,
      message: fullMessage,
      source: enrichedSource,
    }).eq('id', inquiry_id);

    if (updateErr) {
      console.error('Update error:', updateErr);
      return new Response(JSON.stringify({ error: updateErr.message }), { status: 500, headers: corsHeaders });
    }

    console.log(`Enriched inquiry ${inquiry_id}. Fields: ${Object.keys(fieldMap).join(', ')}`);

    return new Response(JSON.stringify({
      success: true,
      fieldsFound: Object.keys(fieldMap),
      source: enrichedSource,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e) {
    console.error('Enrich error:', e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
