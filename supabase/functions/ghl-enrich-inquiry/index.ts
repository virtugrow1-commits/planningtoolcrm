import { createClient } from "npm:@supabase/supabase-js@2";
import {
  GHL_API_BASE,
  buildFieldMap,
  buildInquiryUpdate,
  extractInquiryFields,
  linkContactToCompany,
  loadFieldDefs,
  resolveCompanyId,
} from "../_shared/inquiryFields.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fetch with one retry when GHL rate limits us (429). */
async function ghlFetchWithRetry(url: string, opts: RequestInit = {}): Promise<Response | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, opts);
      if (res.status === 429) {
        await res.text();
        console.warn(`Rate limited: ${url} (attempt ${attempt + 1})`);
        await delay(4000);
        continue;
      }
      return res;
    } catch (e) {
      console.error(`Fetch error for ${url}:`, e);
      await delay(1000);
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const GHL_API_KEY = Deno.env.get('GHL_API_KEY');
  const GHL_LOCATION_ID = Deno.env.get('GHL_LOCATION_ID');
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

    const ghlHeaders = {
      'Authorization': `Bearer ${GHL_API_KEY}`,
      'Content-Type': 'application/json',
      'Version': '2021-07-28',
    };

    const fieldDefs = await loadFieldDefs(ghlHeaders, GHL_LOCATION_ID);

    const sources: any[] = [];
    let opp: any = {};
    let ghlContactId: string | null = null;
    let rateLimited = false;

    // Step 1: opportunity
    const oppRes = await ghlFetchWithRetry(`${GHL_API_BASE}/opportunities/${inquiry.ghl_opportunity_id}`, { headers: ghlHeaders });
    if (oppRes && oppRes.ok) {
      const oppData = await oppRes.json();
      opp = oppData.opportunity || oppData;
      ghlContactId = opp.contactId || opp.contact?.id || null;
      sources.push(opp);
    } else {
      rateLimited = !oppRes;
      if (oppRes) await oppRes.text();
      console.warn(`Opportunity fetch failed (rate_limited=${rateLimited})`);
      if (inquiry.contact_id) {
        const { data: localContact } = await supabase.from('contacts').select('ghl_contact_id').eq('id', inquiry.contact_id).maybeSingle();
        ghlContactId = localContact?.ghl_contact_id || null;
      }
    }

    await delay(rateLimited ? 4000 : 400);

    // Step 2: contact (where form answers usually live)
    let ghlContact: any = null;
    if (ghlContactId) {
      const contactRes = await ghlFetchWithRetry(`${GHL_API_BASE}/contacts/${ghlContactId}`, { headers: ghlHeaders });
      if (contactRes && contactRes.ok) {
        const contactData = await contactRes.json();
        ghlContact = contactData.contact || contactData;
        sources.push(ghlContact);

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
        console.warn(`Contact fetch failed for ${ghlContactId}`);
      }
    }

    const fieldMap = buildFieldMap(sources, fieldDefs);

    const extracted = extractInquiryFields(fieldMap, {
      eventType: opp.name || inquiry.event_type,
      budget: opp.monetaryValue ? Number(opp.monetaryValue) : inquiry.budget,
    });

    const updateData = buildInquiryUpdate(extracted);
    if (opp.source && opp.source !== 'GHL') updateData.source = opp.source;

    // Link company from the form answers
    const companyName = extracted.companyName || ghlContact?.companyName || null;
    if (companyName && !inquiry.company_id) {
      const companyId = await resolveCompanyId(supabase, inquiry.user_id, companyName);
      if (companyId) {
        updateData.company_id = companyId;
        if (inquiry.contact_id) {
          await linkContactToCompany(supabase, inquiry.user_id, inquiry.contact_id, companyId, companyName);
        }
      }
    }

    if (Object.keys(updateData).length > 0) {
      const { error: updateErr } = await supabase.from('inquiries').update(updateData).eq('id', inquiry_id);
      if (updateErr) {
        console.error('Update error:', updateErr);
        return new Response(JSON.stringify({ error: updateErr.message }), { status: 500, headers: corsHeaders });
      }
    }

    console.log(`Enriched inquiry ${inquiry_id}. Fields: ${Object.keys(fieldMap).join(', ')}`);

    return new Response(JSON.stringify({
      success: true,
      fieldsFound: Object.keys(fieldMap),
      updated: Object.keys(updateData),
      rateLimited,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e) {
    console.error('Enrich error:', e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
