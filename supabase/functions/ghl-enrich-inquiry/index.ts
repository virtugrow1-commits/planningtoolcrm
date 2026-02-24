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

    const ghlHeaders = {
      'Authorization': `Bearer ${GHL_API_KEY}`,
      'Content-Type': 'application/json',
      'Version': '2021-07-28',
    };

    // Fetch opportunity from GHL
    const oppRes = await fetch(`${GHL_API_BASE}/opportunities/${inquiry.ghl_opportunity_id}`, { headers: ghlHeaders });
    if (!oppRes.ok) {
      console.error('GHL API error:', oppRes.status, await oppRes.text());
      return new Response(JSON.stringify({ error: 'Failed to fetch opportunity from GHL' }), { status: 502, headers: corsHeaders });
    }

    const oppData = await oppRes.json();
    const opp = oppData.opportunity || oppData;
    console.log('GHL opportunity data:', JSON.stringify(opp).substring(0, 1000));

    // Custom fields can be on opportunity OR on the contact — fetch both
    const fieldMap: Record<string, string> = {};

    // 1. Opportunity custom fields
    const oppCustomFields = opp.customFields || opp.custom_fields || [];
    for (const cf of oppCustomFields) {
      const name = (cf.name || cf.fieldName || cf.key || '').toLowerCase();
      const value = cf.value || cf.fieldValue || '';
      if (value) fieldMap[name] = String(value);
    }

    // 2. Fetch contact custom fields from GHL (form data lives here)
    const ghlContactId = opp.contactId || opp.contact?.id;
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
            const name = (cf.name || cf.fieldName || cf.key || '').toLowerCase();
            const value = cf.value || cf.fieldValue || '';
            if (value && !fieldMap[name]) fieldMap[name] = String(value);
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

    // Build message from custom fields
    const messageParts = [
      inquiry.message || '',
      fieldMap['kies je dagdeel'] ? `Dagdeel: ${fieldMap['kies je dagdeel']}` : '',
      fieldMap['gewenste catering'] ? `Catering: ${fieldMap['gewenste catering']}` : '',
      fieldMap['speciale benodigdheden'] ? `Speciale benodigdheden: ${fieldMap['speciale benodigdheden']}` : '',
      fieldMap['na-zit gewenst?'] ? `Na-zit: ${fieldMap['na-zit gewenst?']}` : '',
      fieldMap['service type'] ? `Service: ${fieldMap['service type']}` : '',
      fieldMap['extra informatie'] ? `Extra: ${fieldMap['extra informatie']}` : '',
      fieldMap['opmerkingen'] ? `Opmerkingen: ${fieldMap['opmerkingen']}` : '',
    ].filter(Boolean);

    // Add any remaining custom fields not already captured
    const knownKeys = new Set([
      'aantal gasten', 'guest_count', 'guests',
      'selecteer de gewenste datum', 'preferred_date', 'datum',
      'gewenste zaalopstelling', 'room_preference', 'zaal',
      'budget', 'kies je dagdeel', 'gewenste catering',
      'speciale benodigdheden', 'na-zit gewenst?', 'service type',
      'extra informatie', 'opmerkingen',
      'type evenement', 'event_type', 'soort evenement',
    ]);
    for (const [key, value] of Object.entries(fieldMap)) {
      if (!knownKeys.has(key) && value) {
        messageParts.push(`${key}: ${value}`);
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
