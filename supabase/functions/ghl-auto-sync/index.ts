import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GHL_API_BASE = 'https://services.leadconnectorhq.com';

serve(async (req) => {
  // This function is called by pg_cron — no user auth needed, uses service role
  const GHL_API_KEY = Deno.env.get('GHL_API_KEY');
  const GHL_LOCATION_ID = Deno.env.get('GHL_LOCATION_ID');
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  if (!GHL_API_KEY || !GHL_LOCATION_ID) {
    return new Response(JSON.stringify({ error: 'GHL not configured' }), { status: 500 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const ghlHeaders = {
    'Authorization': `Bearer ${GHL_API_KEY}`,
    'Content-Type': 'application/json',
    'Version': '2021-07-28',
  };

  // Get all users that have data (distinct user_ids)
  const { data: users } = await supabase.from('contacts').select('user_id').limit(100);
  const userIds = [...new Set((users || []).map((u: any) => u.user_id))];

  const results: any = { contacts: 0, opportunities: 0, bookings: 0, pushed: 0 };

  try {
    // === PULL CONTACTS FROM GHL ===
    let allContacts: any[] = [];
    let nextPageUrl: string | null = `${GHL_API_BASE}/contacts/?locationId=${GHL_LOCATION_ID}&limit=100`;
    while (nextPageUrl) {
      const res = await fetch(nextPageUrl, { headers: ghlHeaders });
      if (!res.ok) break;
      const data = await res.json();
      allContacts = allContacts.concat(data.contacts || []);
      nextPageUrl = data.meta?.nextPageUrl || null;
    }

    for (const userId of userIds) {
      for (const ghlContact of allContacts) {
        const firstName = ghlContact.firstName || ghlContact.name?.split(' ')[0] || 'Onbekend';
        const lastName = ghlContact.lastName || ghlContact.name?.split(' ').slice(1).join(' ') || '';
        const { data: existing } = await supabase.from('contacts').select('id').eq('user_id', userId).eq('ghl_contact_id', ghlContact.id).maybeSingle();
        if (existing) {
          await supabase.from('contacts').update({
            first_name: firstName, last_name: lastName,
            email: ghlContact.email || null, phone: ghlContact.phone || null,
            company: ghlContact.companyName || null,
          }).eq('id', existing.id);
        } else {
          await supabase.from('contacts').insert({
            user_id: userId, ghl_contact_id: ghlContact.id,
            first_name: firstName, last_name: lastName,
            email: ghlContact.email || null, phone: ghlContact.phone || null,
            company: ghlContact.companyName || null, status: 'lead',
          });
        }
        results.contacts++;
      }

      // Push local contacts without GHL ID
      const { data: localOnly } = await supabase.from('contacts').select('*').eq('user_id', userId).is('ghl_contact_id', null);
      for (const contact of localOnly || []) {
        const res = await fetch(`${GHL_API_BASE}/contacts/`, {
          method: 'POST', headers: ghlHeaders,
          body: JSON.stringify({
            firstName: contact.first_name, lastName: contact.last_name,
            email: contact.email || undefined, phone: contact.phone || undefined,
            companyName: contact.company || undefined, locationId: GHL_LOCATION_ID,
          }),
        });
        if (res.ok) {
          const created = await res.json();
          if (created.contact?.id) {
            await supabase.from('contacts').update({ ghl_contact_id: created.contact.id }).eq('id', contact.id);
          }
          results.pushed++;
        }
      }
    }

    // === PULL OPPORTUNITIES FROM GHL ===
    const stageToStatus = (stageName: string): string => {
      const lower = stageName.toLowerCase();
      if (lower.includes('nieuwe aanvraag') || lower.includes('new')) return 'new';
      if (lower.includes('lopend contact') || lower.includes('contact')) return 'contacted';
      if (lower.includes('optie')) return 'option';
      if (lower.includes('aangepaste offerte')) return 'quote_revised';
      if (lower.includes('offerte verzonden') || lower.includes('offerte')) return 'quoted';
      if (lower.includes('definitieve reservering') || lower.includes('definitief')) return 'confirmed';
      if (lower.includes('reservering')) return 'reserved';
      if (lower.includes('facturatie') || lower.includes('invoice')) return 'invoiced';
      if (lower.includes('vervallen') || lower.includes('verloren') || lower.includes('lost')) return 'lost';
      if (lower.includes('after sales') || lower.includes('aftersales')) return 'after_sales';
      return 'new';
    };

    try {
      const pipelinesRes = await fetch(`${GHL_API_BASE}/opportunities/pipelines?locationId=${GHL_LOCATION_ID}`, { headers: ghlHeaders });
      if (pipelinesRes.ok) {
        const pipelinesData = await pipelinesRes.json();
        const stageMap: Record<string, string> = {};
        for (const pipeline of pipelinesData.pipelines || []) {
          for (const stage of pipeline.stages || []) {
            stageMap[stage.id] = stage.name;
          }
        }

        let allOpps: any[] = [];
        let oppPage = 1;
        let oppHasMore = true;
        while (oppHasMore) {
          const res = await fetch(`${GHL_API_BASE}/opportunities/search?location_id=${GHL_LOCATION_ID}&limit=100&page=${oppPage}`, { headers: ghlHeaders });
          if (!res.ok) break;
          const data = await res.json();
          allOpps = allOpps.concat(data.opportunities || []);
          oppHasMore = (data.opportunities || []).length === 100;
          oppPage++;
        }

        for (const userId of userIds) {
          for (const opp of allOpps) {
            const stageName = stageMap[opp.pipelineStageId] || opp.status || 'new';
            const crmStatus = stageToStatus(stageName);
            const contactName = opp.contact?.name || opp.name || 'Onbekend';
            const monetaryValue = opp.monetaryValue ? Number(opp.monetaryValue) : null;

            const { data: existing } = await supabase.from('inquiries').select('id').eq('user_id', userId).eq('ghl_opportunity_id', opp.id).maybeSingle();
            if (existing) {
              await supabase.from('inquiries').update({
                contact_name: contactName, status: crmStatus,
                budget: monetaryValue, event_type: opp.name || 'Onbekend',
              }).eq('id', existing.id);
            } else {
              await supabase.from('inquiries').insert({
                user_id: userId, ghl_opportunity_id: opp.id,
                contact_name: contactName, contact_id: null,
                event_type: opp.name || 'Onbekend', status: crmStatus,
                guest_count: 0, budget: monetaryValue, source: 'GHL',
                message: opp.notes || null, preferred_date: opp.date || null,
                room_preference: null,
              });
            }
            results.opportunities++;
          }
        }
      }
    } catch (e) { console.error('Opp sync error:', e); }

    // === PULL CALENDAR EVENTS FROM GHL ===
    try {
      const calRes = await fetch(`${GHL_API_BASE}/calendars/?locationId=${GHL_LOCATION_ID}`, { headers: ghlHeaders });
      if (calRes.ok) {
        const calData = await calRes.json();
        const calendars = calData.calendars || [];
        const now = new Date();
        const startTime = now.toISOString();
        const endDate = new Date(now);
        endDate.setDate(endDate.getDate() + 90);
        const endTime = endDate.toISOString();

        let allEvents: any[] = [];
        for (const cal of calendars) {
          const eventsRes = await fetch(
            `${GHL_API_BASE}/calendars/events?locationId=${GHL_LOCATION_ID}&calendarId=${cal.id}&startTime=${encodeURIComponent(startTime)}&endTime=${encodeURIComponent(endTime)}`,
            { headers: ghlHeaders }
          );
          if (eventsRes.ok) {
            const eventsData = await eventsRes.json();
            allEvents = allEvents.concat((eventsData.events || []).map((e: any) => ({ ...e, calendarName: cal.name })));
          }
        }

        for (const userId of userIds) {
          for (const evt of allEvents) {
            const evtStart = new Date(evt.startTime || evt.start);
            const evtEnd = new Date(evt.endTime || evt.end);
            const dateStr = evtStart.toISOString().split('T')[0];
            const startHour = evtStart.getHours();
            const endHour = evtEnd.getHours() || 17;
            const contactName = evt.contact?.name || evt.title || 'GHL Afspraak';
            const title = evt.title || evt.calendarName || 'GHL Afspraak';
            const evtStatus = (evt.status === 'confirmed' || evt.appointmentStatus === 'confirmed') ? 'confirmed' : 'option';

            const { data: existing } = await supabase.from('bookings').select('id').eq('user_id', userId).eq('ghl_event_id', evt.id).maybeSingle();
            if (existing) {
              await supabase.from('bookings').update({
                date: dateStr, start_hour: startHour, end_hour: endHour,
                title, contact_name: contactName, status: evtStatus,
              }).eq('id', existing.id);
            } else {
              await supabase.from('bookings').insert({
                user_id: userId, ghl_event_id: evt.id,
                room_name: evt.calendarName || 'Vergaderzaal 100',
                date: dateStr, start_hour: startHour, end_hour: endHour,
                title, contact_name: contactName, status: evtStatus,
              });
            }
            results.bookings++;
          }
        }
      }
    } catch (e) { console.error('Calendar sync error:', e); }

  } catch (error) {
    console.error('Auto-sync error:', error);
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
  }

  console.log('Auto-sync completed:', results);
  return new Response(JSON.stringify({ success: true, ...results }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
