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

  const results: any = { bookings_pulled: 0, bookings_pushed: 0, contacts: 0, opportunities: 0, contacts_pushed: 0, errors: [] };

  // Run all 3 syncs in PARALLEL to avoid timeout
  const calendarSync = syncCalendar(supabase, ghlHeaders, GHL_LOCATION_ID, userId, results);
  const opportunitiesSync = syncOpportunities(supabase, ghlHeaders, GHL_LOCATION_ID, userId, results);
  const contactsSync = syncContacts(supabase, ghlHeaders, GHL_LOCATION_ID, userId, results);

  await Promise.allSettled([calendarSync, opportunitiesSync, contactsSync]);

  // Push local inquiries without GHL opportunity ID
  await pushLocalInquiries(supabase, ghlHeaders, GHL_LOCATION_ID, userId, results);

  console.log('Auto-sync completed:', JSON.stringify(results));
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
          // Don't overwrite room_name — user may have moved it to a different room
          await supabase.from('bookings').update({
            date: dateStr, start_hour: startHour, end_hour: endHour,
            title, contact_name: contactName, status: evtStatus,
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

// === OPPORTUNITIES BIDIRECTIONAL SYNC ===
async function syncOpportunities(supabase: any, ghlHeaders: any, locationId: string, userId: string, results: any) {
  try {
    const pipelinesRes = await fetch(`${GHL_API_BASE}/opportunities/pipelines?locationId=${locationId}`, { headers: ghlHeaders });
    if (!pipelinesRes.ok) { console.error('Pipelines error:', pipelinesRes.status); return; }

    const pipelinesData = await pipelinesRes.json();
    const pipeline = pipelinesData.pipelines?.[0];
    const stageMap: Record<string, string> = {};
    const stageNameToId: Record<string, string> = {};
    for (const p of pipelinesData.pipelines || []) {
      for (const stage of p.stages || []) {
        stageMap[stage.id] = stage.name;
        stageNameToId[stage.name.toLowerCase()] = stage.id;
      }
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

    const statusToStageName: Record<string, string> = {
      'new': 'nieuwe aanvraag', 'contacted': 'lopend contact', 'option': 'optie',
      'quoted': 'offerte verzonden', 'quote_revised': 'aangepaste offerte',
      'reserved': 'reservering', 'confirmed': 'definitieve reservering',
      'invoiced': 'facturatie', 'lost': 'vervallen', 'after_sales': 'after sales',
      'converted': 'definitieve reservering',
    };

    const findStageId = (crmStatus: string): string | null => {
      const target = statusToStageName[crmStatus];
      if (!target) return null;
      for (const [name, id] of Object.entries(stageNameToId)) {
        if (name.includes(target)) return id;
      }
      return null;
    };

    // Threshold: if CRM updated_at is within last 2 minutes, CRM wins
    const recentThreshold = new Date(Date.now() - 2 * 60 * 1000).toISOString();

    // Track which GHL opp IDs we've seen (to find CRM-only changes later)
    const seenGhlOppIds = new Set<string>();

    // 1. Pull GHL opportunities and compare with CRM
    let page = 1;
    let hasMore = true;
    while (hasMore && page <= 5) {
      const oppRes = await fetch(`${GHL_API_BASE}/opportunities/search?location_id=${locationId}&limit=100&page=${page}`, { headers: ghlHeaders });
      if (!oppRes.ok) { console.error('Opp search error:', oppRes.status, await oppRes.text()); break; }

      const oppData = await oppRes.json();
      const opportunities = oppData.opportunities || [];
      console.log(`Opportunities page ${page}: ${opportunities.length} items`);

      for (const opp of opportunities) {
        seenGhlOppIds.add(opp.id);
        const stageName = stageMap[opp.pipelineStageId] || opp.status || 'new';
        const ghlStatus = stageToStatus(stageName);
        const contactName = opp.contact?.name || opp.name || 'Onbekend';
        const monetaryValue = opp.monetaryValue ? Number(opp.monetaryValue) : null;

        const { data: existing, error: selectErr } = await supabase
          .from('inquiries')
          .select('id, status, budget, event_type, contact_name, updated_at')
          .eq('user_id', userId)
          .eq('ghl_opportunity_id', opp.id)
          .maybeSingle();

        if (selectErr) {
          console.error(`Opp select error for ${opp.id}:`, selectErr.message);
          results.errors.push(`select:${opp.id}:${selectErr.message}`);
          continue;
        }

        if (existing) {
          // BIDIRECTIONAL: Check if CRM was recently updated (user made changes)
          const crmRecentlyUpdated = existing.updated_at > recentThreshold;
          const crmDiffers = existing.status !== ghlStatus || 
                             existing.event_type !== (opp.name || 'Onbekend') ||
                             (existing.budget ? Number(existing.budget) : null) !== monetaryValue;

          if (crmRecentlyUpdated && crmDiffers) {
            // CRM wins → push CRM data to GHL
            const targetStageId = findStageId(existing.status);
            const updatePayload: any = {
              name: existing.event_type,
              monetaryValue: existing.budget || 0,
              status: existing.status === 'lost' ? 'lost' : (existing.status === 'confirmed' || existing.status === 'converted') ? 'won' : 'open',
            };
            if (targetStageId) {
              updatePayload.pipelineStageId = targetStageId;
              if (pipeline) updatePayload.pipelineId = pipeline.id;
            }

            const pushRes = await fetch(`${GHL_API_BASE}/opportunities/${opp.id}`, {
              method: 'PUT', headers: ghlHeaders, body: JSON.stringify(updatePayload),
            });
            if (pushRes.ok) {
              console.log(`Pushed CRM -> GHL opp ${opp.id}: ${existing.status} (CRM wins, updated ${existing.updated_at})`);
              results.opportunities_pushed = (results.opportunities_pushed || 0) + 1;
            } else {
              console.error(`Push to GHL failed for ${opp.id}: ${await pushRes.text()}`);
            }
          } else {
            // GHL wins → update CRM
            const { error: updateErr } = await supabase.from('inquiries').update({
              contact_name: contactName,
              status: ghlStatus,
              budget: monetaryValue,
              event_type: opp.name || 'Onbekend',
            }).eq('id', existing.id);
            if (updateErr) {
              console.error(`Opp update error for ${opp.id}:`, updateErr.message);
              results.errors.push(`update:${opp.id}:${updateErr.message}`);
            } else {
              console.log(`GHL -> CRM opp ${opp.id} -> ${ghlStatus} (stage: ${stageName})`);
            }
          }
        } else {
          // New from GHL → insert into CRM
          const { error: insertErr } = await supabase.from('inquiries').insert({
            user_id: userId,
            ghl_opportunity_id: opp.id,
            contact_name: contactName,
            contact_id: null,
            event_type: opp.name || 'Onbekend',
            status: ghlStatus,
            guest_count: 0,
            budget: monetaryValue,
            source: 'GHL',
            message: opp.notes || null,
            preferred_date: opp.date || null,
            room_preference: null,
          });
          if (insertErr) {
            console.error(`Opp insert error for ${opp.id}:`, insertErr.message);
            results.errors.push(`insert:${opp.id}:${insertErr.message}`);
          } else {
            console.log(`Inserted GHL opp ${opp.id} -> ${ghlStatus} (stage: ${stageName})`);
          }
        }
        results.opportunities++;
      }

      hasMore = opportunities.length === 100;
      page++;
    }

    // 2. Push CRM changes for linked inquiries that were updated recently but NOT seen in GHL loop
    // (handles case where user updated status but GHL hasn't been polled for that opp yet)
    const { data: recentlyChanged } = await supabase
      .from('inquiries')
      .select('id, ghl_opportunity_id, status, event_type, budget, contact_name')
      .eq('user_id', userId)
      .not('ghl_opportunity_id', 'is', null)
      .gt('updated_at', recentThreshold);

    for (const inq of recentlyChanged || []) {
      if (seenGhlOppIds.has(inq.ghl_opportunity_id)) continue; // already handled above
      const targetStageId = findStageId(inq.status);
      const updatePayload: any = {
        name: inq.event_type,
        monetaryValue: inq.budget || 0,
        status: inq.status === 'lost' ? 'lost' : (inq.status === 'confirmed' || inq.status === 'converted') ? 'won' : 'open',
      };
      if (targetStageId) {
        updatePayload.pipelineStageId = targetStageId;
        if (pipeline) updatePayload.pipelineId = pipeline.id;
      }
      const pushRes = await fetch(`${GHL_API_BASE}/opportunities/${inq.ghl_opportunity_id}`, {
        method: 'PUT', headers: ghlHeaders, body: JSON.stringify(updatePayload),
      });
      if (pushRes.ok) {
        console.log(`Pushed recent CRM change -> GHL opp ${inq.ghl_opportunity_id}: ${inq.status}`);
        results.opportunities_pushed = (results.opportunities_pushed || 0) + 1;
      }
    }
  } catch (e) { console.error('Opp sync error:', e); }
}

// === CONTACTS SYNC ===
async function syncContacts(supabase: any, ghlHeaders: any, locationId: string, userId: string, results: any) {
  try {
    const res = await fetch(`${GHL_API_BASE}/contacts/?locationId=${locationId}&limit=100`, { headers: ghlHeaders });
    if (!res.ok) {
      const errText = await res.text();
      console.error('Contacts error:', res.status, errText);
      return;
    }

    const data = await res.json();
    const recentContacts = data.contacts || [];
    console.log(`Fetched ${recentContacts.length} contacts from GHL`);

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

// === PUSH LOCAL INQUIRIES TO GHL ===
async function pushLocalInquiries(supabase: any, ghlHeaders: any, locationId: string, userId: string, results: any) {
  try {
    // Get local inquiries without ghl_opportunity_id (max 10 per run to avoid timeout)
    const { data: localInquiries } = await supabase.from('inquiries').select('*').eq('user_id', userId).is('ghl_opportunity_id', null).limit(10);
    if (!localInquiries || localInquiries.length === 0) return;

    // Get pipeline info
    const pipelinesRes = await fetch(`${GHL_API_BASE}/opportunities/pipelines?locationId=${locationId}`, { headers: ghlHeaders });
    if (!pipelinesRes.ok) { console.error('Pipelines fetch failed for push'); return; }
    const pipelinesData = await pipelinesRes.json();
    const pipeline = pipelinesData.pipelines?.[0];
    if (!pipeline) { console.error('No pipeline found for push'); return; }

    const statusToStageName: Record<string, string> = {
      'new': 'Nieuwe Aanvraag', 'contacted': 'Lopend contact', 'option': 'Optie',
      'quoted': 'Offerte Verzonden', 'quote_revised': 'Aangepaste offerte verzonden',
      'reserved': 'Reservering', 'confirmed': 'Definitieve Reservering',
      'invoiced': 'Facturatie', 'lost': 'Vervallen / Verloren', 'after_sales': 'After Sales',
    };

    results.inquiries_pushed = 0;

    for (const inq of localInquiries) {
      try {
        const targetStageName = statusToStageName[inq.status] || 'Nieuwe Aanvraag';
        let targetStageId = pipeline.stages?.[0]?.id;
        for (const stage of pipeline.stages || []) {
          if (stage.name.toLowerCase().includes(targetStageName.toLowerCase())) {
            targetStageId = stage.id;
            break;
          }
        }

        // Try to find GHL contact
        let ghlContactId = null;
        if (inq.contact_id) {
          const { data: contact } = await supabase.from('contacts').select('ghl_contact_id').eq('id', inq.contact_id).maybeSingle();
          ghlContactId = contact?.ghl_contact_id || null;
        }
        if (!ghlContactId && inq.contact_name) {
          const searchRes = await fetch(`${GHL_API_BASE}/contacts/?locationId=${locationId}&query=${encodeURIComponent(inq.contact_name)}&limit=1`, { headers: ghlHeaders });
          if (searchRes.ok) {
            const searchData = await searchRes.json();
            ghlContactId = searchData.contacts?.[0]?.id || null;
          }
        }
        // If still no contact, create one in GHL (required field)
        if (!ghlContactId) {
          const nameParts = (inq.contact_name || 'Onbekend').split(' ');
          const createRes = await fetch(`${GHL_API_BASE}/contacts/`, {
            method: 'POST', headers: ghlHeaders,
            body: JSON.stringify({ firstName: nameParts[0], lastName: nameParts.slice(1).join(' ') || '', locationId }),
          });
          if (createRes.ok) {
            const created = await createRes.json();
            ghlContactId = created.contact?.id || null;
            // Link contact back to CRM if possible
            if (ghlContactId && inq.contact_id) {
              await supabase.from('contacts').update({ ghl_contact_id: ghlContactId }).eq('id', inq.contact_id);
            }
          }
        }
        // Skip if we still can't get a contactId (GHL requires it)
        if (!ghlContactId) {
          console.log(`Skip push inquiry ${inq.id}: could not find or create GHL contact`);
          continue;
        }

        const oppPayload: any = {
          pipelineId: pipeline.id,
          pipelineStageId: targetStageId,
          locationId,
          name: inq.event_type || 'CRM Aanvraag',
          status: inq.status === 'lost' ? 'lost' : (inq.status === 'confirmed') ? 'won' : 'open',
          monetaryValue: inq.budget || 0,
          contactId: ghlContactId,
        };

        const res = await fetch(`${GHL_API_BASE}/opportunities/`, {
          method: 'POST', headers: ghlHeaders, body: JSON.stringify(oppPayload),
        });

        if (res.ok) {
          const created = await res.json();
          const ghlOppId = created.opportunity?.id || created.id;
          if (ghlOppId) {
            await supabase.from('inquiries').update({ ghl_opportunity_id: ghlOppId }).eq('id', inq.id);
            console.log(`Pushed inquiry ${inq.id} -> GHL opportunity ${ghlOppId}`);
          }
          results.inquiries_pushed++;
        } else {
          console.error(`Push inquiry ${inq.id} failed: ${await res.text()}`);
        }
      } catch (e) { console.error('Push inquiry error:', inq.id, e); }
    }
  } catch (e) { console.error('Push local inquiries error:', e); }
}
