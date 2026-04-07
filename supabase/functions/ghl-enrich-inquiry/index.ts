import { createClient } from "npm:@supabase/supabase-js@2";

const GHL_API_BASE = 'https://services.leadconnectorhq.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Single fetch attempt — NO retries. Returns null on rate limit or error. */
async function ghlFetchOnce(url: string, opts: RequestInit = {}): Promise<Response | null> {
  try {
    const res = await fetch(url, opts);
    if (res.status === 429) {
      await res.text();
      console.warn(`Rate limited: ${url}`);
      return null;
    }
    return res;
  } catch (e) {
    console.error(`Fetch error for ${url}:`, e);
    return null;
  }
}

// In-memory cache for custom field definitions
let cachedFieldDefs: Record<string, string> | null = null;
let cachedFieldDefsAt = 0;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

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

    // Load custom field defs from cache or fetch (single attempt)
    let fieldDefsMap: Record<string, string> = cachedFieldDefs ? { ...cachedFieldDefs } : {};
    if (GHL_LOCATION_ID && (!cachedFieldDefs || Date.now() - cachedFieldDefsAt > CACHE_TTL)) {
      const cfRes = await ghlFetchOnce(`${GHL_API_BASE}/locations/${GHL_LOCATION_ID}/customFields`, { headers: ghlHeaders });
      if (cfRes && cfRes.ok) {
        const cfData = await cfRes.json();
        const fields = cfData.customFields || cfData || [];
        fieldDefsMap = {};
        for (const f of fields) {
          if (f.id && f.name) fieldDefsMap[f.id] = f.name;
        }
        cachedFieldDefs = fieldDefsMap;
        cachedFieldDefsAt = Date.now();
        console.log(`Loaded ${Object.keys(fieldDefsMap).length} field definitions`);
      }
      // Wait a bit before next API call
      await delay(500);
    }

    const resolveCustomField = (cf: any): { name: string; value: string } => {
      const name = cf.name || cf.fieldName || cf.key || fieldDefsMap[cf.id] || cf.id || '';
      const value = cf.value || cf.fieldValue || '';
      return { name: name.toLowerCase(), value: String(value) };
    };

    const fieldMap: Record<string, string> = {};
    let opp: any = {};
    let ghlContactId: string | null = null;
    let rateLimited = false;

    // Step 1: Try to fetch opportunity (single attempt)
    const oppRes = await ghlFetchOnce(`${GHL_API_BASE}/opportunities/${inquiry.ghl_opportunity_id}`, { headers: ghlHeaders });
    
    if (oppRes && oppRes.ok) {
      const oppData = await oppRes.json();
      opp = oppData.opportunity || oppData;
      ghlContactId = opp.contactId || opp.contact?.id;
      console.log(`Opportunity OK. contactId: ${ghlContactId}, customFields: ${(opp.customFields || opp.custom_fields || []).length}`);

      const oppCustomFields = opp.customFields || opp.custom_fields || [];
      for (const cf of oppCustomFields) {
        const { name, value } = resolveCustomField(cf);
        if (value) fieldMap[name] = value;
      }
    } else {
      rateLimited = !oppRes; // null = rate limited
      if (oppRes) await oppRes.text();
      console.warn(`Opportunity fetch failed (rate_limited=${rateLimited})`);
      
      // Fallback: get ghl_contact_id from local DB
      if (inquiry.contact_id) {
        const { data: localContact } = await supabase.from('contacts').select('ghl_contact_id').eq('id', inquiry.contact_id).maybeSingle();
        ghlContactId = localContact?.ghl_contact_id || null;
        console.log(`DB fallback: ghl_contact_id=${ghlContactId}`);
      }
    }

    // Step 2: Wait before contact fetch to avoid rate limit
    if (rateLimited) {
      console.log('Rate limited on opportunity, waiting 5s before contact fetch...');
      await delay(5000);
    } else {
      await delay(500);
    }

    // Step 3: Fetch contact custom fields (this is where form data usually lives)
    if (ghlContactId) {
      const contactRes = await ghlFetchOnce(`${GHL_API_BASE}/contacts/${ghlContactId}`, { headers: ghlHeaders });
      if (contactRes && contactRes.ok) {
        const contactData = await contactRes.json();
        const ghlContact = contactData.contact || contactData;
        console.log(`Contact OK. customFields: ${(ghlContact.customFields || ghlContact.custom_fields || ghlContact.customField || []).length}`);

        const contactCustomFields = ghlContact.customFields || ghlContact.custom_fields || ghlContact.customField || [];
        for (const cf of contactCustomFields) {
          const { name, value } = resolveCustomField(cf);
          if (value && !fieldMap[name]) fieldMap[name] = value;
        }

        // Top-level contact fields
        const contactTopFields: Record<string, string | undefined> = {
          'aantal gasten': ghlContact.numberOfGuests || ghlContact.guest_count,
          'type evenement': ghlContact.eventType || ghlContact.event_type,
          'gewenste datum': ghlContact.preferredDate || ghlContact.preferred_date,
        };
        for (const [key, val] of Object.entries(contactTopFields)) {
          if (val && !fieldMap[key]) fieldMap[key] = val;
        }

        // Update local contact info
        if (inquiry.contact_id) {
          const updateData: Record<string, any> = {};
          if (ghlContact.email) updateData.email = ghlContact.email;
          if (ghlContact.phone) updateData.phone = ghlContact.phone;
          if (ghlContact.companyName) updateData.company = ghlContact.companyName;
          if (Object.keys(updateData).length > 0) {
            await supabase.from('contacts').update(updateData).eq('id', inquiry.contact_id);
          }
        }
      } else {
        console.warn(`Contact fetch also failed for ${ghlContactId}`);
      }
    } else {
      console.warn('No ghlContactId available for contact lookup');
    }

    // Fuzzy field matching
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

    // Only update if we found fields OR if rate limited (don't overwrite with empty)
    if (Object.keys(fieldMap).length > 0) {
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
    }

    console.log(`Enriched inquiry ${inquiry_id}. Fields: ${Object.keys(fieldMap).join(', ')}`);

    return new Response(JSON.stringify({
      success: true,
      fieldsFound: Object.keys(fieldMap),
      source: enrichedSource,
      rateLimited,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e) {
    console.error('Enrich error:', e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
