import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GHL_API_BASE = 'https://services.leadconnectorhq.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** Convert a Date to Europe/Amsterdam local components */
function toAmsterdam(date: Date) {
  const s = date.toLocaleString('en-US', { timeZone: 'Europe/Amsterdam', hour12: false });
  const d = new Date(s);
  return {
    dateStr: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    hours: d.getHours(),
    minutes: d.getMinutes(),
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const GHL_API_KEY = Deno.env.get('GHL_API_KEY');
  const GHL_LOCATION_ID = Deno.env.get('GHL_LOCATION_ID');
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  if (!GHL_API_KEY || !GHL_LOCATION_ID) {
    return new Response(JSON.stringify({ error: 'GHL not configured' }), { status: 500, headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const payload = await req.json();
    console.log('GHL webhook received:', JSON.stringify(payload).substring(0, 500));

    const type = payload.type || payload.event || '';

    // Get primary user_id
    const { data: anyUser } = await supabase.from('contacts').select('user_id').limit(1).maybeSingle();
    const { data: anyBookingUser } = await supabase.from('bookings').select('user_id').limit(1).maybeSingle();
    const userId = anyUser?.user_id || anyBookingUser?.user_id;
    if (!userId) {
      return new Response(JSON.stringify({ error: 'No user found' }), { status: 200, headers: corsHeaders });
    }

    const ghlHeaders = {
      'Authorization': `Bearer ${GHL_API_KEY}`,
      'Content-Type': 'application/json',
      'Version': '2021-07-28',
    };

    // Detect webhook type - GHL sometimes sends pipeline/opportunity data without a type field
    const hasPipelineData = payload.pipeline_id || payload.pipleline_stage || payload.pipeline_name || payload.opportunity_name;
    const hasContactData = payload.contact_id && (payload.first_name || payload.last_name || payload.full_name);
    const hasAppointmentData = payload.startTime || payload.appointmentId || payload.calendarId;

    // Handle different webhook types
    if (type.includes('opportunity') || type.includes('OpportunityStatus') || type.includes('pipeline') || (hasPipelineData && !hasAppointmentData)) {
      await handleOpportunityFromWebhookPayload(supabase, ghlHeaders, GHL_LOCATION_ID, userId, payload);
    } else if (type.includes('contact') || type.includes('Contact') || (hasContactData && !hasPipelineData && !hasAppointmentData)) {
      await handleContactWebhook(supabase, userId, payload);
    } else if (type.includes('appointment') || type.includes('calendar') || type.includes('event') || hasAppointmentData) {
      await handleAppointmentWebhook(supabase, userId, payload);
    } else {
      console.log('Unknown webhook type, skipping:', type);
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('Webhook error:', e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});

async function handleOpportunityFromWebhookPayload(supabase: any, ghlHeaders: any, locationId: string, userId: string, payload: any) {
  // GHL sends pipeline webhooks in two formats:
  // 1. With an opportunity ID (fetch full data from API)
  // 2. Direct payload with pipleline_stage, opportunity_name, contact_id etc.
  
  const oppId = payload.id || payload.opportunityId || payload.data?.id;
  const stageName = payload.pipleline_stage || payload.pipeline_stage || '';
  
  if (!oppId && !stageName) { console.log('No opportunity ID or stage in webhook'); return; }

  let status: string;
  let contactName: string;
  let monetaryValue: number | null = null;
  let eventType: string;
  let ghlOppId = oppId;

  if (stageName) {
    // Direct payload from GHL webhook trigger (most common)
    status = stageToStatus(stageName);
    contactName = payload.full_name || payload.opportunity_name || payload.contact_name || 'Onbekend';
    monetaryValue = payload.lead_value ? Number(payload.lead_value) : null;
    eventType = payload.opportunity_name || 'Onbekend';
    ghlOppId = oppId || payload.id;
  } else {
    // Fallback: fetch from GHL API
    const res = await fetch(`${GHL_API_BASE}/opportunities/${oppId}`, { headers: ghlHeaders });
    if (!res.ok) { console.error('Fetch opp failed:', res.status); return; }
    const opp = (await res.json()).opportunity || await res.json();

    const pipelinesRes = await fetch(`${GHL_API_BASE}/opportunities/pipelines?locationId=${locationId}`, { headers: ghlHeaders });
    const stageMap: Record<string, string> = {};
    if (pipelinesRes.ok) {
      const pd = await pipelinesRes.json();
      for (const p of pd.pipelines || []) {
        for (const s of p.stages || []) { stageMap[s.id] = s.name; }
      }
    }
    const resolvedStage = stageMap[opp.pipelineStageId] || opp.status || 'new';
    status = stageToStatus(resolvedStage);
    contactName = opp.contact?.name || opp.name || 'Onbekend';
    monetaryValue = opp.monetaryValue ? Number(opp.monetaryValue) : null;
    eventType = opp.name || 'Onbekend';
  }

  if (!ghlOppId) { console.log('No GHL opportunity ID resolved'); return; }

  const { data: existing } = await supabase.from('inquiries').select('id, updated_at').eq('user_id', userId).eq('ghl_opportunity_id', ghlOppId).maybeSingle();

  if (existing) {
    const recentThreshold = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    if (existing.updated_at <= recentThreshold) {
      await supabase.from('inquiries').update({
        contact_name: contactName, status, budget: monetaryValue, event_type: eventType,
      }).eq('id', existing.id);
      console.log(`Webhook: GHL -> CRM opp ${ghlOppId} -> ${status}`);
    } else {
      console.log(`Webhook: Skipped opp ${ghlOppId}, CRM recently updated`);
    }
  } else {
    // Try to link to existing contact
    let contactId = null;
    if (payload.contact_id) {
      const { data: contactMatch } = await supabase.from('contacts').select('id').eq('ghl_contact_id', payload.contact_id).maybeSingle();
      contactId = contactMatch?.id || null;
    }
    
    await supabase.from('inquiries').insert({
      user_id: userId, ghl_opportunity_id: ghlOppId, contact_name: contactName,
      event_type: eventType, status, guest_count: 0,
      budget: monetaryValue, source: 'GHL', contact_id: contactId,
    });
    console.log(`Webhook: Inserted new opp ${ghlOppId} -> ${status}`);
  }
}

async function handleContactWebhook(supabase: any, userId: string, payload: any) {
  const contactId = payload.id || payload.contactId || payload.data?.id;
  if (!contactId) return;

  const firstName = payload.firstName || payload.first_name || payload.name?.split(' ')[0] || 'Onbekend';
  const lastName = payload.lastName || payload.last_name || payload.name?.split(' ').slice(1).join(' ') || '';

  const { data: existing } = await supabase.from('contacts').select('id').eq('user_id', userId).eq('ghl_contact_id', contactId).maybeSingle();

  if (existing) {
    await supabase.from('contacts').update({
      first_name: firstName, last_name: lastName,
      email: payload.email || null, phone: payload.phone || null,
      company: payload.companyName || payload.company || null,
    }).eq('id', existing.id);
  } else {
    await supabase.from('contacts').insert({
      user_id: userId, ghl_contact_id: contactId,
      first_name: firstName, last_name: lastName,
      email: payload.email || null, phone: payload.phone || null,
      company: payload.companyName || payload.company || null, status: 'lead',
    });
  }
  console.log(`Webhook: Contact ${contactId} synced`);
}

async function handleAppointmentWebhook(supabase: any, userId: string, payload: any) {
  const eventId = payload.id || payload.appointmentId || payload.data?.id;
  if (!eventId) return;

  const startTime = new Date(payload.startTime || payload.start || payload.data?.startTime);
  const endTime = new Date(payload.endTime || payload.end || payload.data?.endTime);
  if (isNaN(startTime.getTime())) return;

  const startLocal = toAmsterdam(startTime);
  const endLocal = isNaN(endTime.getTime()) ? null : toAmsterdam(endTime);
  const dateStr = startLocal.dateStr;
  const startHour = startLocal.hours;
  const startMinute = startLocal.minutes;
  // Preserve exact end time from GHL — never override
  const endHour = endLocal ? endLocal.hours : Math.min(startHour + 1, 23);
  const endMinute = endLocal ? endLocal.minutes : 0;

  const title = payload.title || payload.name || 'GHL Afspraak';
  const contactName = payload.contact?.name || title;
  const status = (payload.status === 'confirmed' || payload.appointmentStatus === 'confirmed') ? 'confirmed' : 'option';

  const { data: existing } = await supabase.from('bookings').select('id').eq('user_id', userId).eq('ghl_event_id', eventId).maybeSingle();

  if (existing) {
    await supabase.from('bookings').update({
      date: dateStr, start_hour: startHour, start_minute: startMinute,
      end_hour: endHour, end_minute: endMinute,
      title, contact_name: contactName, status,
    }).eq('id', existing.id);
  } else {
    await supabase.from('bookings').insert({
      user_id: userId, ghl_event_id: eventId, room_name: 'Ontmoeten Aan de Donge',
      date: dateStr, start_hour: startHour, start_minute: startMinute,
      end_hour: endHour, end_minute: endMinute,
      title, contact_name: contactName, status,
    });
  }
  console.log(`Webhook: Appointment ${eventId} synced (${startHour}:${String(startMinute).padStart(2,'0')}-${endHour}:${String(endMinute).padStart(2,'0')})`);
}

function stageToStatus(s: string): string {
  const l = s.toLowerCase();
  if (l.includes('nieuwe aanvraag') || l.includes('new')) return 'new';
  if (l.includes('lopend contact') || l.includes('contact')) return 'contacted';
  if (l.includes('optie')) return 'option';
  if (l.includes('aangepaste offerte')) return 'quote_revised';
  if (l.includes('offerte verzonden') || l.includes('offerte')) return 'quoted';
  if (l.includes('definitieve reservering') || l.includes('definitief')) return 'confirmed';
  if (l.includes('reservering')) return 'reserved';
  if (l.includes('draaiboek')) return 'script';
  if (l.includes('facturatie') || l.includes('invoice')) return 'invoiced';
  if (l.includes('vervallen') || l.includes('verloren') || l.includes('lost')) return 'lost';
  if (l.includes('after sales') || l.includes('aftersales')) return 'after_sales';
  if (l.includes('evenement')) return 'confirmed';
  return 'new';
}
