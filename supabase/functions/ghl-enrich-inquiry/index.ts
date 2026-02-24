import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GHL_API_BASE = 'https://services.leadconnectorhq.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
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

    // Get the inquiry
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

    // Fetch custom field definitions to map IDs to human-readable names
    const fieldDefsMap: Record<string, string> = {};
    if (GHL_LOCATION_ID) {
      try {
        const cfRes = await fetch(`${GHL_API_BASE}/locations/${GHL_LOCATION_ID}/customFields`, { headers: ghlHeaders });
        if (cfRes.ok) {
          const cfData = await cfRes.json();
          const fields = cfData.customFields || cfData || [];
          for (const f of fields) {
            if (f.id && f.name) {
              fieldDefsMap[f.id] = f.name;
            }
          }
          console.log('Custom field definitions loaded:', Object.keys(fieldDefsMap).length, 'fields:', JSON.stringify(fieldDefsMap));
        } else {
          console.error('Failed to fetch custom field defs:', cfRes.status, await cfRes.text());
        }
      } catch (e) {
        console.error('Error fetching custom field defs:', e);
      }
    } else {
      console.warn('GHL_LOCATION_ID not set — cannot resolve custom field names');
    }

    // Helper: resolve a custom field entry to {name, value}
    const resolveCustomField = (cf: any): { name: string; value: string } => {
      // Try cf.name first (some endpoints include it), then look up cf.id in definitions
      const name = cf.name || cf.fieldName || cf.key || fieldDefsMap[cf.id] || cf.id || '';
      const value = cf.value || cf.fieldValue || '';
      return { name: name.toLowerCase(), value: String(value) };
    };

    // Fetch opportunity from GHL
    let opp: any = {};
    let ghlContactId: string | null = null;
    const oppRes = await fetch(`${GHL_API_BASE}/opportunities/${inquiry.ghl_opportunity_id}`, { headers: ghlHeaders });
    if (oppRes.ok) {
      const oppData = await oppRes.json();
      opp = oppData.opportunity || oppData;
      console.log('GHL opportunity data:', JSON.stringify(opp).substring(0, 1000));
      ghlContactId = opp.contactId || opp.contact?.id;

      // 1. Opportunity custom fields
      const oppCustomFields = opp.customFields || opp.custom_fields || [];
      for (const cf of oppCustomFields) {
        const { name, value } = resolveCustomField(cf);
        if (value) fieldMap[name] = value;
      }
    } else {
      // Opportunity deleted or invalid — try to get contactId from local contact record
      console.warn('GHL opportunity not found (deleted?), falling back to contact-only enrichment:', oppRes.status);
      if (inquiry.contact_id) {
        const { data: localContact } = await supabase.from('contacts').select('ghl_contact_id').eq('id', inquiry.contact_id).maybeSingle();
        ghlContactId = localContact?.ghl_contact_id || null;
      }
    }

    // 2. Fetch contact custom fields from GHL (form data lives here)
    if (ghlContactId) {
      try {
        const contactRes = await fetch(`${GHL_API_BASE}/contacts/${ghlContactId}`, { headers: ghlHeaders });
        if (contactRes.ok) {
          const contactData = await contactRes.json();
          const ghlContact = contactData.contact || contactData;
          console.log('GHL contact data:', JSON.stringify(ghlContact).substring(0, 1500));

          // Contact custom fields
          const contactCustomFields = ghlContact.customFields || ghlContact.custom_fields || ghlContact.customField || [];
          for (const cf of contactCustomFields) {
            const { name, value } = resolveCustomField(cf);
            if (value && !fieldMap[name]) fieldMap[name] = value;
          }

          // Also check top-level contact fields that might contain form data
          const contactTopFields: Record<string, string | undefined> = {
            'aantal gasten': ghlContact.numberOfGuests || ghlContact.guest_count,
            'type evenement': ghlContact.eventType || ghlContact.event_type,
            'gewenste datum': ghlContact.preferredDate || ghlContact.preferred_date,
          };
          for (const [key, val] of Object.entries(contactTopFields)) {
            if (val && !fieldMap[key]) fieldMap[key] = val;
          }

          // Update local contact with any new info
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

    // Map known fields
    const guestCount = parseInt(
      fieldMap['aantal gasten'] || fieldMap['guest_count'] || fieldMap['guests'] || '0', 10
    ) || inquiry.guest_count || 0;

    const preferredDate = fieldMap['selecteer de gewenste datum'] || fieldMap['preferred_date'] || fieldMap['datum'] || inquiry.preferred_date;
    const roomPreference = fieldMap['gewenste zaalopstelling'] || fieldMap['room_preference'] || fieldMap['zaal'] || inquiry.room_preference;
    const budget = fieldMap['budget'] ? Number(fieldMap['budget']) : (opp.monetaryValue ? Number(opp.monetaryValue) : inquiry.budget);

    // Build message from ALL custom fields so everything is visible in Klantinvoer
    const messageParts: string[] = [];
    
    // Capitalize first letter of field name for display
    const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    
    for (const [key, value] of Object.entries(fieldMap)) {
      if (value) {
        messageParts.push(`${capitalize(key)}: ${value}`);
      }
    }

    const fullMessage = messageParts.join('\n').trim() || null;

    // Also get event type from custom fields if available
    const eventType = fieldMap['type evenement'] || fieldMap['event_type'] || fieldMap['soort evenement'] || opp.name || inquiry.event_type;

    // Use opportunity source (e.g. "Snel een offerte (Klaar)") as inquiry source if available
    const enrichedSource = opp.source && opp.source !== 'GHL' ? opp.source : inquiry.source;

    // Update the inquiry with enriched data
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

    console.log(`Enriched inquiry ${inquiry_id} with GHL data. Fields found: ${Object.keys(fieldMap).join(', ')}`);

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
