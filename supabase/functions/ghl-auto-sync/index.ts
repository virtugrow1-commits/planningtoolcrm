import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GHL_API_BASE = 'https://services.leadconnectorhq.com';

serve(async (req) => {
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

  // Get one user_id (primary user)
  const { data: anyUser } = await supabase.from('contacts').select('user_id').limit(1).maybeSingle();
  const { data: anyBookingUser } = await supabase.from('bookings').select('user_id').limit(1).maybeSingle();
  const { data: anyInqUser } = await supabase.from('inquiries').select('user_id').limit(1).maybeSingle();
  const userId = anyUser?.user_id || anyBookingUser?.user_id || anyInqUser?.user_id;
  
  if (!userId) {
    console.log('No user found, skipping sync');
    return new Response(JSON.stringify({ error: 'No user found' }), { status: 200 });
  }

  const results: any = { bookings_pulled: 0, bookings_pushed: 0, contacts: 0, opportunities: 0, contacts_pushed: 0 };

  // Run all 3 syncs in PARALLEL to avoid timeout
  const calendarSync = syncCalendar(supabase, ghlHeaders, GHL_LOCATION_ID, userId, results);
  const opportunitiesSync = syncOpportunities(supabase, ghlHeaders, GHL_LOCATION_ID, userId, results);
  const contactsSync = syncContacts(supabase, ghlHeaders, GHL_LOCATION_ID, userId, results);

  await Promise.allSettled([calendarSync, opportunitiesSync, contactsSync]);

  console.log('Auto-sync completed:', results);
  return new Response(JSON.stringify({ success: true, ...results }), { headers: { 'Content-Type': 'application/json' } });
});

// === CALENDAR SYNC ===
async function syncCalendar(supabase: any, ghlHeaders: any, locationId: string, userId: string, results: any) {
  try {
    const calRes = await fetch(`${GHL_API_BASE}/calendars/?locationId=${locationId}`, { headers: ghlHeaders });
    if (!calRes.ok) { console.error('Calendar list error:', calRes.status); return; }

    const calData = await calRes.json();
    const calendars = calData.calendars || [];
    console.log(`Found ${calendars.length} calendars`);

    const now = new Date();
    const startDate = new Date(now); startDate.setDate(startDate.getDate() - 365);
    const endDate = new Date(now); endDate.setDate(endDate.getDate() + 365);

    // Fetch all calendars in parallel
    const eventPromises = calendars.map(async (cal: any) => {
      try {
        const eventsUrl = `${GHL_API_BASE}/calendars/events?locationId=${locationId}&calendarId=${cal.id}&startTime=${startDate.getTime()}&endTime=${endDate.getTime()}`;
        const eventsRes = await fetch(eventsUrl, { headers: ghlHeaders });
        if (eventsRes.ok) {
          const eventsData = await eventsRes.json();
          const events = eventsData.events || [];
          console.log(`Calendar "${cal.name}": ${events.length} events`);
          return events.map((e: any) => ({ ...e, calendarName: cal.name, calendarId: cal.id }));
        } else {
          console.error(`Calendar "${cal.name}" error: ${eventsRes.status}`);
          return [];
        }
      } catch (e) { console.error(`Calendar "${cal.name}" fetch error:`, e); return []; }
    });

    const eventArrays = await Promise.all(eventPromises);
    const allEvents = eventArrays.flat();
    console.log(`Total events from GHL: ${allEvents.length}`);

    // Batch upsert events
    for (const evt of allEvents) {
      try {
        const evtStart = new Date(evt.startTime || evt.start || evt.startDate);
        const evtEnd = new Date(evt.endTime || evt.end || evt.endDate);
        if (isNaN(evtStart.getTime())) continue;

        const dateStr = evtStart.toISOString().split('T')[0];
        const startHour = evtStart.getHours();
        let endHour = evtEnd.getHours();
        if (isNaN(evtEnd.getTime()) || endHour <= startHour) endHour = Math.min(startHour + 1, 23);

        const contactName = evt.contact?.name || evt.title || evt.calendarName || 'GHL Afspraak';
        const title = evt.title || evt.name || evt.calendarName || 'GHL Afspraak';
        const evtStatus = (evt.status === 'confirmed' || evt.appointmentStatus === 'confirmed') ? 'confirmed' : 'option';
        const roomName = evt.calendarName || 'Ontmoeten Aan de Donge';

        const { data: existing } = await supabase.from('bookings').select('id').eq('user_id', userId).eq('ghl_event_id', evt.id).maybeSingle();
        if (existing) {
          await supabase.from('bookings').update({
            date: dateStr, start_hour: startHour, end_hour: endHour,
            title, contact_name: contactName, status: evtStatus, room_name: roomName,
          }).eq('id', existing.id);
        } else {
          await supabase.from('bookings').insert({
            user_id: userId, ghl_event_id: evt.id, room_name: roomName,
            date: dateStr, start_hour: startHour, end_hour: endHour,
            title, contact_name: contactName, status: evtStatus,
          });
        }
        results.bookings_pulled++;
      } catch (evtErr) { console.error('Event error:', evt.id, evtErr); }
    }

    // Push local bookings with GHL contact linked
    const defaultCalendarId = calendars[0]?.id;
    if (defaultCalendarId) {
      const { data: localBookings } = await supabase.from('bookings').select('*, contacts!bookings_contact_id_fkey(ghl_contact_id)').eq('user_id', userId).is('ghl_event_id', null);
      for (const booking of localBookings || []) {
        const ghlContactId = (booking as any).contacts?.ghl_contact_id || null;
        if (!ghlContactId) { console.log(`Skip push booking ${booking.id}: no GHL contact linked`); continue; }
        try {
          const startTime = `${booking.date}T${String(booking.start_hour).padStart(2, '0')}:00:00`;
          const endTime = `${booking.date}T${String(booking.end_hour).padStart(2, '0')}:00:00`;
          const res = await fetch(`${GHL_API_BASE}/calendars/events/appointments`, {
            method: 'POST', headers: ghlHeaders,
            body: JSON.stringify({ calendarId: defaultCalendarId, locationId, contactId: ghlContactId, title: booking.title || 'CRM Boeking', startTime, endTime, appointmentStatus: booking.status === 'confirmed' ? 'confirmed' : 'new' }),
          });
          if (res.ok) {
            const created = await res.json();
            const ghlId = created.id || created.event?.id;
            if (ghlId) await supabase.from('bookings').update({ ghl_event_id: ghlId }).eq('id', booking.id);
            results.bookings_pushed++;
          } else { console.error(`Push booking ${booking.id} failed: ${await res.text()}`); }
        } catch (e) { console.error('Push booking error:', booking.id, e); }
      }
    }
  } catch (e) { console.error('Calendar sync error:', e); }
}

// === OPPORTUNITIES SYNC ===
async function syncOpportunities(supabase: any, ghlHeaders: any, locationId: string, userId: string, results: any) {
  try {
    const pipelinesRes = await fetch(`${GHL_API_BASE}/opportunities/pipelines?locationId=${locationId}`, { headers: ghlHeaders });
    if (!pipelinesRes.ok) { console.error('Pipelines error:', pipelinesRes.status); return; }

    const pipelinesData = await pipelinesRes.json();
    const stageMap: Record<string, string> = {};
    for (const pipeline of pipelinesData.pipelines || []) {
      for (const stage of pipeline.stages || []) stageMap[stage.id] = stage.name;
    }
    console.log('Pipeline stages:', JSON.stringify(stageMap));

    const stageToStatus = (s: string): string => {
      const l = s.toLowerCase();
      if (l.includes('nieuwe aanvraag') || l.includes('new')) return 'new';
      if (l.includes('lopend contact') || l.includes('contact')) return 'contacted';
      if (l.includes('optie')) return 'option';
      if (l.includes('aangepaste offerte')) return 'quote_revised';
      if (l.includes('offerte verzonden') || l.includes('offerte')) return 'quoted';
      if (l.includes('definitieve reservering') || l.includes('definitief')) return 'confirmed';
      if (l.includes('reservering')) return 'reserved';
      if (l.includes('facturatie') || l.includes('invoice')) return 'invoiced';
      if (l.includes('vervallen') || l.includes('verloren') || l.includes('lost')) return 'lost';
      if (l.includes('after sales') || l.includes('aftersales')) return 'after_sales';
      if (l.includes('evenement')) return 'confirmed';
      return 'new';
    };

    // Fetch all pages of opportunities
    let page = 1;
    let hasMore = true;
    while (hasMore && page <= 5) {
      const oppRes = await fetch(`${GHL_API_BASE}/opportunities/search?location_id=${locationId}&limit=100&page=${page}`, { headers: ghlHeaders });
      if (!oppRes.ok) { console.error('Opp search error:', oppRes.status, await oppRes.text()); break; }

      const oppData = await oppRes.json();
      const opportunities = oppData.opportunities || [];
      console.log(`Opportunities page ${page}: ${opportunities.length} items`);

      for (const opp of opportunities) {
        const stageName = stageMap[opp.pipelineStageId] || opp.status || 'new';
        const crmStatus = stageToStatus(stageName);
        const contactName = opp.contact?.name || opp.name || 'Onbekend';
        const monetaryValue = opp.monetaryValue ? Number(opp.monetaryValue) : null;

        const { data: existing } = await supabase.from('inquiries').select('id').eq('user_id', userId).eq('ghl_opportunity_id', opp.id).maybeSingle();
        if (existing) {
          await supabase.from('inquiries').update({ contact_name: contactName, status: crmStatus, budget: monetaryValue, event_type: opp.name || 'Onbekend' }).eq('id', existing.id);
        } else {
          await supabase.from('inquiries').insert({ user_id: userId, ghl_opportunity_id: opp.id, contact_name: contactName, contact_id: null, event_type: opp.name || 'Onbekend', status: crmStatus, guest_count: 0, budget: monetaryValue, source: 'GHL', message: opp.notes || null, preferred_date: opp.date || null, room_preference: null });
        }
        results.opportunities++;
      }

      hasMore = opportunities.length === 100;
      page++;
    }
  } catch (e) { console.error('Opp sync error:', e); }
}

// === CONTACTS SYNC ===
async function syncContacts(supabase: any, ghlHeaders: any, locationId: string, userId: string, results: any) {
  try {
    const res = await fetch(`${GHL_API_BASE}/contacts/?locationId=${locationId}&limit=100&sortBy=dateUpdated&sortOrder=desc`, { headers: ghlHeaders });
    if (!res.ok) { console.error('Contacts error:', res.status); return; }

    const data = await res.json();
    const recentContacts = data.contacts || [];

    for (const ghlContact of recentContacts) {
      const firstName = ghlContact.firstName || ghlContact.name?.split(' ')[0] || 'Onbekend';
      const lastName = ghlContact.lastName || ghlContact.name?.split(' ').slice(1).join(' ') || '';
      const { data: existing } = await supabase.from('contacts').select('id').eq('user_id', userId).eq('ghl_contact_id', ghlContact.id).maybeSingle();
      if (existing) {
        await supabase.from('contacts').update({ first_name: firstName, last_name: lastName, email: ghlContact.email || null, phone: ghlContact.phone || null, company: ghlContact.companyName || null }).eq('id', existing.id);
      } else {
        await supabase.from('contacts').insert({ user_id: userId, ghl_contact_id: ghlContact.id, first_name: firstName, last_name: lastName, email: ghlContact.email || null, phone: ghlContact.phone || null, company: ghlContact.companyName || null, status: 'lead' });
      }
      results.contacts++;
    }

    // Push local contacts without GHL ID (max 10 per run)
    const { data: localOnly } = await supabase.from('contacts').select('*').eq('user_id', userId).is('ghl_contact_id', null).limit(10);
    for (const contact of localOnly || []) {
      const pushRes = await fetch(`${GHL_API_BASE}/contacts/`, { method: 'POST', headers: ghlHeaders, body: JSON.stringify({ firstName: contact.first_name, lastName: contact.last_name, email: contact.email || undefined, phone: contact.phone || undefined, companyName: contact.company || undefined, locationId }) });
      if (pushRes.ok) {
        const created = await pushRes.json();
        if (created.contact?.id) await supabase.from('contacts').update({ ghl_contact_id: created.contact.id }).eq('id', contact.id);
        results.contacts_pushed++;
      }
    }
  } catch (e) { console.error('Contact sync error:', e); }
}
