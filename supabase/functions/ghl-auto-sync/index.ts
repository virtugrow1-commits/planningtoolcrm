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

  // Get all user_ids from both tables
  const [{ data: cUsers }, { data: bUsers }, { data: iUsers }] = await Promise.all([
    supabase.from('contacts').select('user_id'),
    supabase.from('bookings').select('user_id'),
    supabase.from('inquiries').select('user_id'),
  ]);
  const userIds = [...new Set([
    ...(cUsers || []).map((u: any) => u.user_id),
    ...(bUsers || []).map((u: any) => u.user_id),
    ...(iUsers || []).map((u: any) => u.user_id),
  ])];

  const results: any = { bookings_pulled: 0, bookings_pushed: 0, contacts: 0, opportunities: 0, contacts_pushed: 0 };

  // === 1. CALENDAR SYNC FIRST (highest priority) ===
  try {
    const calRes = await fetch(`${GHL_API_BASE}/calendars/?locationId=${GHL_LOCATION_ID}`, { headers: ghlHeaders });
    console.log('Calendar API status:', calRes.status);

    if (calRes.ok) {
      const calData = await calRes.json();
      const calendars = calData.calendars || [];
      console.log(`Found ${calendars.length} calendars:`, calendars.map((c: any) => `${c.name} (${c.id})`));

      // 365 days back + 365 forward
      const now = new Date();
      const startDate = new Date(now); startDate.setDate(startDate.getDate() - 365);
      const endDate = new Date(now); endDate.setDate(endDate.getDate() + 365);
      const startEpoch = startDate.getTime();
      const endEpoch = endDate.getTime();

      let allEvents: any[] = [];
      for (const cal of calendars) {
        try {
          // Try epoch ms format
          const eventsUrl = `${GHL_API_BASE}/calendars/events?locationId=${GHL_LOCATION_ID}&calendarId=${cal.id}&startTime=${startEpoch}&endTime=${endEpoch}`;
          console.log(`Fetching events URL: ${eventsUrl}`);
          const eventsRes = await fetch(eventsUrl, { headers: ghlHeaders });
          
          if (eventsRes.ok) {
            const eventsData = await eventsRes.json();
            const events = eventsData.events || eventsData.data?.events || [];
            console.log(`Calendar "${cal.name}": ${events.length} events, raw keys:`, Object.keys(eventsData));
            allEvents = allEvents.concat(events.map((e: any) => ({ ...e, calendarName: cal.name, calendarId: cal.id })));
          } else {
            const errBody = await eventsRes.text();
            console.error(`Calendar "${cal.name}" error: ${eventsRes.status} ${errBody}`);
          }
        } catch (e) { console.error(`Calendar "${cal.name}" fetch error:`, e); }
      }

      console.log(`Total events from GHL: ${allEvents.length}`);

      // Upsert events into bookings
      for (const userId of userIds) {
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
            const roomName = evt.calendarName || 'Vergaderzaal 100';

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
      }

      // Push local bookings without ghl_event_id
      const defaultCalendarId = calendars[0]?.id;
      if (defaultCalendarId) {
        for (const userId of userIds) {
          const { data: localBookings } = await supabase.from('bookings').select('*, contacts!bookings_contact_id_fkey(ghl_contact_id)').eq('user_id', userId).is('ghl_event_id', null);
          for (const booking of localBookings || []) {
            try {
              // Need a GHL contact to create appointment
              const ghlContactId = (booking as any).contacts?.ghl_contact_id || null;
              if (!ghlContactId) {
                console.log(`Skip push booking ${booking.id}: no GHL contact linked`);
                continue;
              }
              const startTime = `${booking.date}T${String(booking.start_hour).padStart(2, '0')}:00:00`;
              const endTime = `${booking.date}T${String(booking.end_hour).padStart(2, '0')}:00:00`;
              const res = await fetch(`${GHL_API_BASE}/calendars/events/appointments`, {
                method: 'POST', headers: ghlHeaders,
                body: JSON.stringify({ calendarId: defaultCalendarId, locationId: GHL_LOCATION_ID, contactId: ghlContactId, title: booking.title || 'CRM Boeking', startTime, endTime, appointmentStatus: booking.status === 'confirmed' ? 'confirmed' : 'new' }),
              });
              if (res.ok) {
                const created = await res.json();
                const ghlId = created.id || created.event?.id;
                if (ghlId) await supabase.from('bookings').update({ ghl_event_id: ghlId }).eq('id', booking.id);
                results.bookings_pushed++;
              } else {
                console.error(`Push booking ${booking.id} failed: ${await res.text()}`);
              }
            } catch (e) { console.error('Push booking error:', booking.id, e); }
          }
        }
      }
    } else {
      console.error('Calendar list error:', calRes.status, await calRes.text());
    }
  } catch (e) { console.error('Calendar sync error:', e); }

  // === 2. CONTACTS (only new/changed — limit API calls) ===
  try {
    // Only fetch first page of GHL contacts to stay within timeout
    const res = await fetch(`${GHL_API_BASE}/contacts/?locationId=${GHL_LOCATION_ID}&limit=100&sortBy=dateUpdated&sortOrder=desc`, { headers: ghlHeaders });
    if (res.ok) {
      const data = await res.json();
      const recentContacts = data.contacts || [];
      for (const userId of userIds) {
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
      }

      // Push local contacts without GHL ID (max 20 per run)
      for (const userId of userIds) {
        const { data: localOnly } = await supabase.from('contacts').select('*').eq('user_id', userId).is('ghl_contact_id', null).limit(20);
        for (const contact of localOnly || []) {
          const pushRes = await fetch(`${GHL_API_BASE}/contacts/`, { method: 'POST', headers: ghlHeaders, body: JSON.stringify({ firstName: contact.first_name, lastName: contact.last_name, email: contact.email || undefined, phone: contact.phone || undefined, companyName: contact.company || undefined, locationId: GHL_LOCATION_ID }) });
          if (pushRes.ok) {
            const created = await pushRes.json();
            if (created.contact?.id) await supabase.from('contacts').update({ ghl_contact_id: created.contact.id }).eq('id', contact.id);
            results.contacts_pushed++;
          }
        }
      }
    }
  } catch (e) { console.error('Contact sync error:', e); }

  // === 3. OPPORTUNITIES ===
  try {
    const pipelinesRes = await fetch(`${GHL_API_BASE}/opportunities/pipelines?locationId=${GHL_LOCATION_ID}`, { headers: ghlHeaders });
    if (pipelinesRes.ok) {
      const pipelinesData = await pipelinesRes.json();
      const stageMap: Record<string, string> = {};
      for (const pipeline of pipelinesData.pipelines || []) {
        for (const stage of pipeline.stages || []) stageMap[stage.id] = stage.name;
      }

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
        return 'new';
      };

      const oppRes = await fetch(`${GHL_API_BASE}/opportunities/search?location_id=${GHL_LOCATION_ID}&limit=100&page=1`, { headers: ghlHeaders });
      if (oppRes.ok) {
        const oppData = await oppRes.json();
        for (const userId of userIds) {
          for (const opp of oppData.opportunities || []) {
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
        }
      }
    }
  } catch (e) { console.error('Opp sync error:', e); }

  console.log('Auto-sync completed:', results);
  return new Response(JSON.stringify({ success: true, ...results }), { headers: { 'Content-Type': 'application/json' } });
});
