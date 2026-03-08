import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GHL_API_BASE = 'https://services.leadconnectorhq.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/** Normalize string for comparison (lowercase, trim, collapse whitespace) */
function norm(s: string | null | undefined): string {
  return (s || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

/** Rate-limit delay to avoid 429 errors */
function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

/** Fetch all rows from a table using paginated queries (batches of 1000) */
async function fetchAll(supabase: any, table: string, selectCols: string, filters: Record<string, any> = {}): Promise<any[]> {
  const rows: any[] = [];
  let from = 0;
  const batchSize = 1000;
  while (true) {
    let q = supabase.from(table).select(selectCols).range(from, from + batchSize - 1);
    for (const [key, val] of Object.entries(filters)) {
      if (val === null) q = q.is(key, null);
      else q = q.eq(key, val);
    }
    const { data, error } = await q;
    if (error || !data || data.length === 0) break;
    rows.push(...data);
    if (data.length < batchSize) break;
    from += batchSize;
  }
  return rows;
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
    return new Response(JSON.stringify({ error: 'No user found' }), { status: 200, headers: corsHeaders });
  }

  // Run heavy sync in background using EdgeRuntime.waitUntil
  const backgroundSync = async () => {
    const results: any = { bookings_pulled: 0, bookings_pushed: 0, contacts: 0, opportunities: 0, contacts_pushed: 0, companies_synced: 0, companies_pushed: 0, tasks_pulled: 0, tasks_pushed: 0, conversations_synced: 0, errors: [] };

    try {
      // PRE-LOAD: Fetch all existing CRM records into lookup Maps ONCE
      // This eliminates thousands of individual DB queries
      const [existingContacts, existingCompanies, existingInquiries, existingTasks] = await Promise.all([
        fetchAll(supabase, 'contacts', 'id, ghl_contact_id, first_name, last_name, email, phone, company, company_id, status, updated_at', { user_id: userId }),
        fetchAll(supabase, 'companies', 'id, ghl_company_id, name, email, phone, website, address, city, updated_at', { user_id: userId }),
        fetchAll(supabase, 'inquiries', 'id, ghl_opportunity_id, status, budget, event_type, contact_name, contact_id, updated_at', { user_id: userId }),
        fetchAll(supabase, 'tasks', 'id, ghl_task_id, title, description, status, updated_at, contact_id', { user_id: userId }),
      ]);

      // Build lookup maps
      const contactByGhlId = new Map<string, any>();
      const contactByNameEmail = new Map<string, any>();
      for (const c of existingContacts) {
        if (c.ghl_contact_id) contactByGhlId.set(c.ghl_contact_id, c);
        const key = `${norm(c.first_name)}|${norm(c.last_name)}|${norm(c.email)}`;
        contactByNameEmail.set(key, c);
      }

      const companyByGhlId = new Map<string, any>();
      const companyByName = new Map<string, any>();
      for (const c of existingCompanies) {
        if (c.ghl_company_id) companyByGhlId.set(c.ghl_company_id, c);
        companyByName.set(norm(c.name), c);
      }

      const inquiryByGhlId = new Map<string, any>();
      for (const i of existingInquiries) {
        if (i.ghl_opportunity_id) inquiryByGhlId.set(i.ghl_opportunity_id, i);
      }

      const taskByGhlId = new Map<string, any>();
      const taskByTitle = new Map<string, any>();
      for (const t of existingTasks) {
        if (t.ghl_task_id) taskByGhlId.set(t.ghl_task_id, t);
        if (!taskByTitle.has(t.title)) taskByTitle.set(t.title, t);
      }

      const lookups = { contactByGhlId, contactByNameEmail, companyByGhlId, companyByName, inquiryByGhlId, taskByGhlId, taskByTitle, existingContacts, existingCompanies, existingInquiries };

      // Run all syncs in PARALLEL
      await Promise.allSettled([
        syncCalendar(supabase, ghlHeaders, GHL_LOCATION_ID, userId, results),
        syncOpportunities(supabase, ghlHeaders, GHL_LOCATION_ID, userId, results, lookups),
        syncContacts(supabase, ghlHeaders, GHL_LOCATION_ID, userId, results, lookups),
        syncCompanies(supabase, ghlHeaders, GHL_LOCATION_ID, userId, results, lookups),
        syncTasks(supabase, ghlHeaders, GHL_LOCATION_ID, userId, results, lookups),
        syncConversations(supabase, ghlHeaders, GHL_LOCATION_ID, userId, results, lookups),
      ]);

      // Push local inquiries without GHL opportunity ID
      await pushLocalInquiries(supabase, ghlHeaders, GHL_LOCATION_ID, userId, results);

      console.log('Auto-sync completed:', JSON.stringify(results));
    } catch (err) {
      console.error('Background sync error:', err);
    }
  };

  // @ts-ignore - EdgeRuntime.waitUntil is available in Supabase Edge Functions
  EdgeRuntime.waitUntil(backgroundSync());

  return new Response(JSON.stringify({ success: true, message: 'Sync started in background' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});

// === CALENDAR SYNC ===
async function syncCalendar(supabase: any, ghlHeaders: any, locationId: string, userId: string, results: any) {
  try {
    const calRes = await fetch(`${GHL_API_BASE}/calendars/?locationId=${locationId}`, { headers: ghlHeaders });
    if (!calRes.ok) { console.error('Calendar list error:', calRes.status); return; }

    const calData = await calRes.json();
    const calendars = calData.calendars || [];
    console.log(`Found ${calendars.length} calendars`);

    const { data: roomMappings } = await supabase
      .from('room_settings')
      .select('room_name, ghl_calendar_id')
      .eq('user_id', userId)
      .not('ghl_calendar_id', 'is', null);
    
    const calIdToRoom: Record<string, string> = {};
    const roomToCalId: Record<string, string> = {};
    for (const rm of roomMappings || []) {
      if (rm.ghl_calendar_id) {
        calIdToRoom[rm.ghl_calendar_id] = rm.room_name;
        roomToCalId[rm.room_name] = rm.ghl_calendar_id;
      }
    }

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

    // Load recently deleted GHL event IDs from sync_log to prevent re-import
    const deletedSince = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // last 24h
    const { data: deletedLogs } = await supabase
      .from('sync_log')
      .select('details')
      .eq('entity_type', 'booking')
      .eq('action', 'delete_booking')
      .gte('created_at', deletedSince);
    const deletedGhlEventIds = new Set<string>();
    for (const log of deletedLogs || []) {
      const ghlId = (log.details as any)?.ghl_event_id;
      if (ghlId) deletedGhlEventIds.add(ghlId);
    }
    if (deletedGhlEventIds.size > 0) {
      console.log(`Skipping ${deletedGhlEventIds.size} recently deleted GHL events`);
    }

    // Batch upsert events in chunks of 20
    const CHUNK_SIZE = 20;
    for (let i = 0; i < allEvents.length; i += CHUNK_SIZE) {
      const chunk = allEvents.slice(i, i + CHUNK_SIZE);
      const upsertRows = [];

      for (const evt of chunk) {
        try {
          // Skip events that were recently deleted from CRM
          if (deletedGhlEventIds.has(evt.id)) {
            console.log(`Skipping re-import of deleted event: ${evt.id}`);
            continue;
          }

          const evtStart = new Date(evt.startTime || evt.start || evt.startDate);
          const evtEnd = new Date(evt.endTime || evt.end || evt.endDate);
          if (isNaN(evtStart.getTime())) continue;

          const startLocal = toAmsterdam(evtStart);
          const endLocal = isNaN(evtEnd.getTime()) ? null : toAmsterdam(evtEnd);
          const dateStr = startLocal.dateStr;
          const startHour = startLocal.hours;
          const startMinute = startLocal.minutes;
          const endHour = endLocal ? endLocal.hours : Math.min(startHour + 1, 23);
          const endMinute = endLocal ? endLocal.minutes : 0;

          const contactName = evt.contact?.name || evt.title || evt.calendarName || 'GHL Afspraak';
          const title = evt.title || evt.name || evt.calendarName || 'GHL Afspraak';
          const evtStatus = (evt.status === 'confirmed' || evt.appointmentStatus === 'confirmed') ? 'confirmed' : 'option';
          const roomName = calIdToRoom[evt.calendarId] || evt.calendarName || 'Ontmoeten Aan de Donge';

          upsertRows.push({
            user_id: userId,
            ghl_event_id: evt.id,
            room_name: roomName,
            date: dateStr,
            start_hour: startHour,
            start_minute: startMinute,
            end_hour: endHour,
            end_minute: endMinute,
            title,
            contact_name: contactName,
            status: evtStatus,
          });
        } catch (evtErr) { console.error('Event error:', evt.id, evtErr); }
      }

      if (upsertRows.length > 0) {
        const { error: upsertErr } = await supabase.from('bookings').upsert(upsertRows, { onConflict: 'ghl_event_id' });
        if (upsertErr) {
          console.error(`Booking batch upsert error:`, upsertErr.message);
          results.errors.push(`booking_batch:${upsertErr.message}`);
        } else {
          results.bookings_pulled += upsertRows.length;
        }
      }
    }

    // Push local bookings
    const defaultCalendarId = calendars[0]?.id;
    const { data: localBookings } = await supabase.from('bookings').select('*, contacts!bookings_contact_id_fkey(ghl_contact_id)').eq('user_id', userId).is('ghl_event_id', null);
    for (const booking of localBookings || []) {
      const ghlContactId = (booking as any).contacts?.ghl_contact_id || null;
      if (!ghlContactId) continue;
      const targetCalendarId = roomToCalId[booking.room_name] || defaultCalendarId;
      if (!targetCalendarId) continue;
      try {
        // Dynamic timezone offset for Europe/Amsterdam
        const probeDate = new Date(`${booking.date}T12:00:00Z`);
        const amStr = probeDate.toLocaleString('en-US', { timeZone: 'Europe/Amsterdam', hour12: false });
        const amDate = new Date(amStr);
        const offsetH = Math.round((amDate.getTime() - probeDate.getTime()) / 3600000);
        const tz = `${offsetH >= 0 ? '+' : '-'}${String(Math.abs(offsetH)).padStart(2, '0')}:00`;
        const startTime = `${booking.date}T${String(booking.start_hour).padStart(2, '0')}:${String(booking.start_minute || 0).padStart(2, '0')}:00${tz}`;
        const endTime = `${booking.date}T${String(booking.end_hour).padStart(2, '0')}:${String(booking.end_minute || 0).padStart(2, '0')}:00${tz}`;
        const res = await fetch(`${GHL_API_BASE}/calendars/events/appointments`, {
          method: 'POST', headers: ghlHeaders,
          body: JSON.stringify({ calendarId: targetCalendarId, locationId, contactId: ghlContactId, title: booking.title || 'CRM Boeking', startTime, endTime, appointmentStatus: booking.status === 'confirmed' ? 'confirmed' : 'new' }),
        });
        if (res.ok) {
          const created = await res.json();
          const ghlId = created.id || created.event?.id;
          if (ghlId) await supabase.from('bookings').update({ ghl_event_id: ghlId }).eq('id', booking.id);
          results.bookings_pushed++;
        } else { console.error(`Push booking ${booking.id} failed: ${await res.text()}`); }
      } catch (e) { console.error('Push booking error:', booking.id, e); }
    }
  } catch (e) { console.error('Calendar sync error:', e); }
}

// === OPPORTUNITIES BIDIRECTIONAL SYNC ===
async function syncOpportunities(supabase: any, ghlHeaders: any, locationId: string, userId: string, results: any, lookups: any) {
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
      if (l.includes('nieuwe aanvraag') || l === 'new') return 'new';
      if (l.includes('lopend contact')) return 'contacted';
      if (l.includes('optie')) return 'option';
      if (l.includes('aangepaste offerte')) return 'quote_revised';
      if (l.includes('offerte verzonden') || l.includes('offerte')) return 'quoted';
      if (l.includes('definitieve reservering') || l.includes('definitief')) return 'confirmed';
      if (l.includes('reservering')) return 'reserved';
      if (l.includes('draaiboek')) return 'script';
      if (l.includes('facturatie') || l.includes('invoice')) return 'invoiced';
      if (l.includes('vervallen') || l.includes('verloren') || l.includes('lost')) return 'lost';
      if (l.includes('after sales') || l.includes('aftersales')) return 'after_sales';
      if (l.includes('evenement')) return 'converted';
      return 'new';
    };

    const statusToStageName: Record<string, string> = {
      'new': 'nieuwe aanvraag', 'contacted': 'lopend contact', 'option': 'optie',
      'quoted': 'offerte verzonden', 'quote_revised': 'aangepaste offerte',
      'reserved': 'reservering', 'script': 'draaiboek maken',
      'confirmed': 'definitieve reservering',
      'invoiced': 'facturatie', 'lost': 'vervallen', 'after_sales': 'after sales',
      'converted': 'evenement',
    };

    const findStageId = (crmStatus: string): string | null => {
      const target = statusToStageName[crmStatus];
      if (!target) return null;
      for (const [name, id] of Object.entries(stageNameToId)) {
        if (name.includes(target)) return id;
      }
      return null;
    };

    const recentThreshold = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const seenGhlOppIds = new Set<string>();

    // 1. Pull GHL opportunities
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

        // Use pre-loaded lookup instead of DB query
        const existing = lookups.inquiryByGhlId.get(opp.id);

        if (existing) {
          const crmRecentlyUpdated = existing.updated_at > recentThreshold;
          const crmDiffers = existing.status !== ghlStatus || 
                             existing.event_type !== (opp.name || 'Onbekend') ||
                             (existing.budget ? Number(existing.budget) : null) !== monetaryValue;

          if (crmRecentlyUpdated && crmDiffers) {
            // CRM wins → push to GHL
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
              console.log(`Pushed CRM -> GHL opp ${opp.id}: ${existing.status}`);
              results.opportunities_pushed = (results.opportunities_pushed || 0) + 1;
            } else {
              console.error(`Push to GHL failed for ${opp.id}: ${await pushRes.text()}`);
            }
          } else if (crmDiffers) {
            // GHL wins → update CRM
            const { error: updateErr } = await supabase.from('inquiries').update({
              contact_name: contactName,
              status: ghlStatus,
              budget: monetaryValue,
              event_type: opp.name || 'Onbekend',
            }).eq('id', existing.id);
            if (!updateErr) {
              console.log(`GHL -> CRM opp ${opp.id} -> ${ghlStatus} (stage: ${stageName})`);
            }
          }
        } else {
          // New from GHL → check for merge candidate using in-memory lookups
          const recentMergeCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
          let mergedExisting = null;

          if (contactName && contactName !== 'Onbekend') {
            mergedExisting = lookups.existingInquiries.find((i: any) =>
              !i.ghl_opportunity_id &&
              norm(i.contact_name) === norm(contactName) &&
              i.created_at > recentMergeCutoff
            );
          }

          if (!mergedExisting && opp.contact?.id) {
            const localContact = lookups.contactByGhlId.get(opp.contact.id);
            if (localContact) {
              mergedExisting = lookups.existingInquiries.find((i: any) =>
                !i.ghl_opportunity_id &&
                i.contact_id === localContact.id &&
                i.created_at > recentMergeCutoff
              );
            }
          }

          if (mergedExisting) {
            await supabase.from('inquiries').update({
              ghl_opportunity_id: opp.id, status: ghlStatus, budget: monetaryValue,
              event_type: opp.name || 'Onbekend',
            }).eq('id', mergedExisting.id);
            console.log(`Auto-sync: Merged form inquiry ${mergedExisting.id} with GHL opp ${opp.id}`);
          } else {
            const { error: insertErr } = await supabase.from('inquiries').upsert({
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
            }, { onConflict: 'ghl_opportunity_id', ignoreDuplicates: true });
            if (insertErr) {
              results.errors.push(`insert:${opp.id}:${insertErr.message}`);
            }
          }
        }
        results.opportunities++;
      }

      hasMore = opportunities.length === 100;
      page++;
    }

    // 2. Push recently changed CRM inquiries not seen in GHL loop
    const { data: recentlyChanged } = await supabase
      .from('inquiries')
      .select('id, ghl_opportunity_id, status, event_type, budget, contact_name')
      .eq('user_id', userId)
      .not('ghl_opportunity_id', 'is', null)
      .gt('updated_at', recentThreshold);

    for (const inq of recentlyChanged || []) {
      if (seenGhlOppIds.has(inq.ghl_opportunity_id)) continue;
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

    // 3. Orphan cleanup — only check items NOT seen in GHL search, limit to 10 verifications per run
    const linkedNotSeen = lookups.existingInquiries.filter((i: any) =>
      i.ghl_opportunity_id && !seenGhlOppIds.has(i.ghl_opportunity_id)
    );

    let deletedCount = 0;
    const MAX_ORPHAN_CHECKS = 10;
    for (const inq of linkedNotSeen.slice(0, MAX_ORPHAN_CHECKS)) {
      await delay(200);
      const verifyRes = await fetch(`${GHL_API_BASE}/opportunities/${inq.ghl_opportunity_id}`, { headers: ghlHeaders });
      if (verifyRes.status === 404 || verifyRes.status === 422 || verifyRes.status === 400) {
        const { error: delErr } = await supabase.from('inquiries').delete().eq('id', inq.id);
        if (!delErr) {
          console.log(`Deleted orphaned inquiry ${inq.id} (GHL opp ${inq.ghl_opportunity_id})`);
          deletedCount++;
        }
      } else {
        await verifyRes.text(); // consume body
      }
      if (verifyRes.status === 429) await delay(2000);
    }
    if (deletedCount > 0) {
      results.inquiries_deleted = deletedCount;
      console.log(`Cleaned up ${deletedCount} orphaned inquiries`);
    }
  } catch (e) { console.error('Opp sync error:', e); }
}

// === BIDIRECTIONAL CONTACTS SYNC ===
async function syncContacts(supabase: any, ghlHeaders: any, locationId: string, userId: string, results: any, lookups: any) {
  try {
    const recentThreshold = new Date(Date.now() - 2 * 60 * 1000).toISOString();

    // 1. Pull ALL GHL contacts (paginate)
    const ghlContacts: any[] = [];
    let contactPage = 1;
    let contactHasMore = true;
    while (contactHasMore && contactPage <= 20) {
      const res = await fetch(`${GHL_API_BASE}/contacts/?locationId=${locationId}&limit=100&page=${contactPage}`, { headers: ghlHeaders });
      if (!res.ok) {
        console.error('Contacts error:', res.status, await res.text());
        break;
      }
      const data = await res.json();
      const batch = data.contacts || [];
      ghlContacts.push(...batch);
      contactHasMore = batch.length === 100;
      contactPage++;
    }
    console.log(`Fetched ${ghlContacts.length} contacts from GHL (${contactPage - 1} pages)`);

    const seenGhlContactIds = new Set<string>();

    for (const ghlContact of ghlContacts) {
      seenGhlContactIds.add(ghlContact.id);
      const firstName = ghlContact.firstName || ghlContact.name?.split(' ')[0] || 'Onbekend';
      const lastName = ghlContact.lastName || ghlContact.name?.split(' ').slice(1).join(' ') || '';
      const ghlEmail = ghlContact.email || null;
      const ghlPhone = ghlContact.phone || null;
      const ghlCompanyName = ghlContact.companyName || null;

      // Use pre-loaded lookup instead of DB query
      const existing = lookups.contactByGhlId.get(ghlContact.id);

      if (existing) {
        const crmRecentlyUpdated = existing.updated_at > recentThreshold;
        const crmDiffers = norm(existing.first_name) !== norm(firstName) ||
                           norm(existing.last_name) !== norm(lastName) ||
                           norm(existing.email) !== norm(ghlEmail) ||
                           norm(existing.phone) !== norm(ghlPhone) ||
                           (ghlCompanyName && norm(existing.company) !== norm(ghlCompanyName));

        if (crmRecentlyUpdated && crmDiffers) {
          // CRM wins → push to GHL
          const pushPayload: any = {
            firstName: existing.first_name,
            lastName: existing.last_name,
            email: existing.email || undefined,
            phone: existing.phone || undefined,
            companyName: existing.company || undefined,
          };
          await delay(300);
          const pushRes = await fetch(`${GHL_API_BASE}/contacts/${ghlContact.id}`, {
            method: 'PUT', headers: ghlHeaders, body: JSON.stringify(pushPayload),
          });
          if (pushRes.ok) {
            results.contacts_pushed++;
          } else if (pushRes.status === 429) {
            await delay(2000);
          }
        } else if (crmDiffers) {
          // GHL wins → update CRM (never overwrite status!)
          const updatePayload: any = {
            first_name: firstName,
            last_name: lastName,
            email: ghlEmail,
            phone: ghlPhone,
          };
          if (ghlCompanyName && !existing.company) {
            updatePayload.company = ghlCompanyName;
          }
          await supabase.from('contacts').update(updatePayload).eq('id', existing.id);
        }
      } else {
        // New from GHL → check in-memory lookup by name+email
        const key = `${norm(firstName)}|${norm(lastName)}|${norm(ghlEmail)}`;
        const nameMatch = lookups.contactByNameEmail.get(key);

        if (nameMatch) {
          if (!nameMatch.ghl_contact_id) {
            await supabase.from('contacts').update({
              ghl_contact_id: ghlContact.id,
              phone: ghlPhone || undefined,
              company: ghlCompanyName || undefined,
            }).eq('id', nameMatch.id);
            // Update lookup
            nameMatch.ghl_contact_id = ghlContact.id;
            lookups.contactByGhlId.set(ghlContact.id, nameMatch);
          }
        } else {
          // Truly new → insert
          const { data: inserted, error: insertErr } = await supabase.from('contacts').insert({
            user_id: userId,
            ghl_contact_id: ghlContact.id,
            first_name: firstName,
            last_name: lastName,
            email: ghlEmail,
            phone: ghlPhone,
            company: ghlCompanyName,
            status: 'lead',
          }).select('id').maybeSingle();
          if (insertErr) {
            if (insertErr.message?.includes('contacts_unique_name_email')) {
              console.log(`Duplicate contact \\${firstName} ${lastName}, linking to GHL ${ghlContact.id}`);
              await supabase.from('contacts').update({ ghl_contact_id: ghlContact.id })
                .eq('user_id', userId)
                .ilike('first_name', firstName.trim())
                .ilike('last_name', lastName.trim());
            }
          } else if (inserted) {
            // Add to lookup for subsequent iterations
            const newContact = { id: inserted.id, ghl_contact_id: ghlContact.id, first_name: firstName, last_name: lastName, email: ghlEmail, phone: ghlPhone, company: ghlCompanyName };
            lookups.contactByGhlId.set(ghlContact.id, newContact);
            lookups.contactByNameEmail.set(key, newContact);
          }
        }
      }
      results.contacts++;
    }

    // 2. Push recently changed CRM contacts
    const { data: recentlyChanged } = await supabase
      .from('contacts')
      .select('id, ghl_contact_id, first_name, last_name, email, phone, company')
      .eq('user_id', userId)
      .not('ghl_contact_id', 'is', null)
      .gt('updated_at', recentThreshold);

    for (const contact of recentlyChanged || []) {
      if (seenGhlContactIds.has(contact.ghl_contact_id)) continue;
      const pushPayload: any = {
        firstName: contact.first_name,
        lastName: contact.last_name,
        email: contact.email || undefined,
        phone: contact.phone || undefined,
        companyName: contact.company || undefined,
      };
      await delay(300);
      const pushRes = await fetch(`${GHL_API_BASE}/contacts/${contact.ghl_contact_id}`, {
        method: 'PUT', headers: ghlHeaders, body: JSON.stringify(pushPayload),
      });
      if (pushRes.ok) {
        results.contacts_pushed++;
      } else if (pushRes.status === 429) {
        await delay(2000);
      }
    }

    // 3. Push local contacts without GHL ID — limit to 50 per run to avoid timeout
    const localOnly = lookups.existingContacts.filter((c: any) => !c.ghl_contact_id).slice(0, 50);
    for (const contact of localOnly) {
      let companyName = contact.company || null;
      if (!companyName && contact.company_id) {
        const companyRow = lookups.existingCompanies.find((c: any) => c.id === contact.company_id);
        companyName = companyRow?.name || null;
      }

      await delay(300);
      const pushRes = await fetch(`${GHL_API_BASE}/contacts/`, {
        method: 'POST', headers: ghlHeaders,
        body: JSON.stringify({
          firstName: contact.first_name,
          lastName: contact.last_name,
          email: contact.email || undefined,
          phone: contact.phone || undefined,
          companyName: companyName || undefined,
          locationId,
        }),
      });
      if (pushRes.ok) {
        const created = await pushRes.json();
        if (created.contact?.id) {
          await supabase.from('contacts').update({ ghl_contact_id: created.contact.id }).eq('id', contact.id);
        }
        results.contacts_pushed++;
      } else if (pushRes.status === 429) {
        await delay(2000);
      }
    }

    // 4. Fill missing company text — use in-memory lookup
    const missingCompanyText = lookups.existingContacts.filter((c: any) => !c.company && c.company_id).slice(0, 20);
    for (const c of missingCompanyText) {
      const companyRow = lookups.existingCompanies.find((co: any) => co.id === c.company_id);
      if (companyRow?.name) {
        await supabase.from('contacts').update({ company: companyRow.name }).eq('id', c.id);
      }
    }
  } catch (e) { console.error('Contact sync error:', e); }
}

// === BIDIRECTIONAL COMPANIES SYNC ===
async function syncCompanies(supabase: any, ghlHeaders: any, locationId: string, userId: string, results: any, lookups: any) {
  try {
    const recentThreshold = new Date(Date.now() - 2 * 60 * 1000).toISOString();

    // 1. Pull ALL GHL companies (paginate)
    const ghlCompanies: any[] = [];
    let companyHasMore = true;
    let skip = 0;
    while (companyHasMore) {
      const res = await fetch(`${GHL_API_BASE}/businesses/?locationId=${locationId}&limit=100&skip=${skip}`, { headers: ghlHeaders });
      if (!res.ok) { console.warn('Businesses endpoint not available:', res.status); break; }
      const data = await res.json();
      const batch = data.businesses || [];
      ghlCompanies.push(...batch);
      companyHasMore = batch.length === 100;
      skip += batch.length;
    }
    console.log(`Fetched ${ghlCompanies.length} companies from GHL`);

    const seenGhlCompanyIds = new Set<string>();

    // 2. Upsert GHL companies — all lookups are in-memory now
    for (const ghlCompany of ghlCompanies) {
      seenGhlCompanyIds.add(ghlCompany.id);
      const ghlName = ghlCompany.name || 'Onbekend';
      const ghlEmail = ghlCompany.email || null;
      const ghlPhone = ghlCompany.phone || null;
      const ghlWebsite = ghlCompany.website || null;
      const ghlAddress = ghlCompany.address || null;
      const ghlCity = ghlCompany.city || null;

      // In-memory lookup by ghl_company_id
      const existing = lookups.companyByGhlId.get(ghlCompany.id);

      if (existing) {
        const crmRecentlyUpdated = existing.updated_at > recentThreshold;
        const crmDiffers = norm(existing.name) !== norm(ghlName) ||
                           norm(existing.email) !== norm(ghlEmail) ||
                           norm(existing.phone) !== norm(ghlPhone);

        if (crmRecentlyUpdated && crmDiffers) {
          // CRM wins
          const pushPayload: any = { name: existing.name };
          if (existing.email) pushPayload.email = existing.email;
          if (existing.phone) pushPayload.phone = existing.phone;
          if (existing.website) pushPayload.website = existing.website;
          if (existing.address) pushPayload.address = existing.address;
          if (existing.city) pushPayload.city = existing.city;
          pushPayload.locationId = locationId;
          await fetch(`${GHL_API_BASE}/businesses/${ghlCompany.id}`, {
            method: 'PUT', headers: ghlHeaders, body: JSON.stringify(pushPayload),
          });
          results.companies_pushed++;
        } else if (crmDiffers) {
          // GHL wins
          await supabase.from('companies').update({
            name: ghlName, email: ghlEmail, phone: ghlPhone,
            website: ghlWebsite, address: ghlAddress, city: ghlCity,
          }).eq('id', existing.id);
        }
      } else {
        // New from GHL → in-memory name match
        const nameMatch = lookups.companyByName.get(norm(ghlName));

        if (nameMatch) {
          await supabase.from('companies').update({ ghl_company_id: ghlCompany.id }).eq('id', nameMatch.id);
          nameMatch.ghl_company_id = ghlCompany.id;
          lookups.companyByGhlId.set(ghlCompany.id, nameMatch);
          console.log(`Linked existing company "${ghlName}" to GHL ${ghlCompany.id}`);
        } else {
          const { data: inserted, error: insertErr } = await supabase.from('companies').insert({
            user_id: userId,
            ghl_company_id: ghlCompany.id,
            name: ghlName,
            email: ghlEmail,
            phone: ghlPhone,
            website: ghlWebsite,
            address: ghlAddress,
            city: ghlCity,
          }).select('id').maybeSingle();
          if (insertErr) {
            if (insertErr.message?.includes('unique')) {
              const { data: dup } = await supabase.from('companies').select('id').ilike('name', ghlName).maybeSingle();
              if (dup) {
                await supabase.from('companies').update({ ghl_company_id: ghlCompany.id }).eq('id', dup.id);
                console.log(`Linked duplicate company "${ghlName}" to GHL ${ghlCompany.id}`);
              }
            } else {
              console.error(`Company insert error for ${ghlCompany.id}:`, insertErr.message);
            }
          } else if (inserted) {
            const newCompany = { id: inserted.id, ghl_company_id: ghlCompany.id, name: ghlName };
            lookups.companyByGhlId.set(ghlCompany.id, newCompany);
            lookups.companyByName.set(norm(ghlName), newCompany);
          }
        }
      }
      results.companies_synced++;
    }

    // 3. Push CRM companies without GHL ID — limit to 50 per run
    const localCompanies = lookups.existingCompanies.filter((c: any) => !c.ghl_company_id).slice(0, 50);
    
    // Pre-fetch all GHL companies for name matching (already in ghlCompanies)
    const ghlCompanyNameSet = new Set(ghlCompanies.map((c: any) => norm(c.name)));
    const ghlCompanyByName = new Map(ghlCompanies.map((c: any) => [norm(c.name), c]));

    for (const company of localCompanies) {
      const matchedGhl = ghlCompanyByName.get(norm(company.name));

      if (matchedGhl) {
        await supabase.from('companies').update({ ghl_company_id: matchedGhl.id }).eq('id', company.id);
        const pushPayload: any = { name: company.name, locationId };
        if (company.email) pushPayload.email = company.email;
        if (company.phone) pushPayload.phone = company.phone;
        if (company.website) pushPayload.website = company.website;
        await fetch(`${GHL_API_BASE}/businesses/${matchedGhl.id}`, {
          method: 'PUT', headers: ghlHeaders, body: JSON.stringify(pushPayload),
        });
      } else {
        const createPayload: any = { name: company.name, locationId };
        if (company.email) createPayload.email = company.email;
        if (company.phone) createPayload.phone = company.phone;
        if (company.website) createPayload.website = company.website;
        if (company.address) createPayload.address = company.address;
        if (company.city) createPayload.city = company.city;

        const createRes = await fetch(`${GHL_API_BASE}/businesses/`, {
          method: 'POST', headers: ghlHeaders, body: JSON.stringify(createPayload),
        });
        if (createRes.ok) {
          const created = await createRes.json();
          const newId = created.business?.id || created.id;
          if (newId) {
            await supabase.from('companies').update({ ghl_company_id: newId }).eq('id', company.id);
          }
          results.companies_pushed++;
        } else {
          console.error(`Push company failed for ${company.name}: ${await createRes.text()}`);
        }
      }
    }
  } catch (e) { console.error('Company sync error:', e); }
}

async function pushLocalInquiries(supabase: any, ghlHeaders: any, locationId: string, userId: string, results: any) {
  try {
    const { data: localInquiries } = await supabase.from('inquiries').select('*').eq('user_id', userId).is('ghl_opportunity_id', null).limit(50);
    if (!localInquiries || localInquiries.length === 0) return;

    const pipelinesRes = await fetch(`${GHL_API_BASE}/opportunities/pipelines?locationId=${locationId}`, { headers: ghlHeaders });
    if (!pipelinesRes.ok) return;
    const pipelinesData = await pipelinesRes.json();
    const pipeline = pipelinesData.pipelines?.[0];
    if (!pipeline) return;

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
        if (!ghlContactId) {
          const nameParts = (inq.contact_name || 'Onbekend').split(' ');
          const createRes = await fetch(`${GHL_API_BASE}/contacts/`, {
            method: 'POST', headers: ghlHeaders,
            body: JSON.stringify({ firstName: nameParts[0], lastName: nameParts.slice(1).join(' ') || '', locationId }),
          });
          if (createRes.ok) {
            const created = await createRes.json();
            ghlContactId = created.contact?.id || null;
            if (ghlContactId && inq.contact_id) {
              await supabase.from('contacts').update({ ghl_contact_id: ghlContactId }).eq('id', inq.contact_id);
            }
          }
        }
        if (!ghlContactId) continue;

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
          }
          results.inquiries_pushed++;
        } else {
          console.error(`Push inquiry ${inq.id} failed: ${await res.text()}`);
        }
      } catch (e) { console.error('Push inquiry error:', inq.id, e); }
    }
  } catch (e) { console.error('Push local inquiries error:', e); }
}

// === BIDIRECTIONAL TASK SYNC ===
async function syncTasks(supabase: any, ghlHeaders: any, locationId: string, userId: string, results: any, lookups: any) {
  try {
    // Only sync tasks for contacts that have GHL IDs — limit to 100 contacts per run
    const contactsWithGhl = lookups.existingContacts
      .filter((c: any) => c.ghl_contact_id)
      .slice(0, 100);

    if (contactsWithGhl.length === 0) return;

    const recentThreshold = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const seenGhlTaskIds = new Set<string>();

    // Batch: fetch tasks for multiple contacts in parallel (chunks of 5 to avoid rate limits)
    const TASK_CHUNK = 5;
    for (let i = 0; i < contactsWithGhl.length; i += TASK_CHUNK) {
      const chunk = contactsWithGhl.slice(i, i + TASK_CHUNK);
      
      const taskFetches = chunk.map(async (contact: any) => {
        try {
          const res = await fetch(`${GHL_API_BASE}/contacts/${contact.ghl_contact_id}/tasks`, { headers: ghlHeaders });
          if (!res.ok) return [];
          const data = await res.json();
          return (data.tasks || []).map((t: any) => ({ ...t, _localContactId: contact.id, _ghlContactId: contact.ghl_contact_id }));
        } catch { return []; }
      });

      const taskResults = await Promise.all(taskFetches);
      const allTasks = taskResults.flat();

      for (const ghlTask of allTasks) {
        seenGhlTaskIds.add(ghlTask.id);
        const ghlStatus = ghlTask.completed ? 'completed' : 'open';
        const ghlTitle = ghlTask.title || 'GHL Taak';
        const ghlDescription = ghlTask.body || null;
        const ghlDueDate = ghlTask.dueDate ? ghlTask.dueDate.split('T')[0] : null;

        // In-memory lookup
        const existing = lookups.taskByGhlId.get(ghlTask.id);

        if (existing) {
          const crmRecentlyUpdated = existing.updated_at > recentThreshold;
          const crmDiffers = existing.status !== ghlStatus || existing.title !== ghlTitle;

          if (crmRecentlyUpdated && crmDiffers) {
            // CRM wins
            const pushPayload: any = {
              title: existing.title,
              body: existing.description || '',
              completed: existing.status === 'completed',
            };
            const pushRes = await fetch(`${GHL_API_BASE}/contacts/${ghlTask._ghlContactId}/tasks/${ghlTask.id}`, {
              method: 'PUT', headers: ghlHeaders, body: JSON.stringify(pushPayload),
            });
            if (pushRes.ok) results.tasks_pushed++;
          } else if (crmDiffers) {
            // GHL wins
            await supabase.from('tasks').update({
              title: ghlTitle,
              description: ghlDescription,
              status: ghlStatus,
              due_date: ghlDueDate,
              completed_at: ghlTask.completed ? (ghlTask.completedDate || new Date().toISOString()) : null,
            }).eq('id', existing.id);
            results.tasks_pulled++;
          }
        } else {
          // Check title dedup in-memory
          const titleDup = lookups.taskByTitle.get(ghlTitle);

          if (titleDup) {
            await supabase.from('tasks').update({ ghl_task_id: ghlTask.id }).eq('id', titleDup.id);
            lookups.taskByGhlId.set(ghlTask.id, titleDup);
          } else {
            const { data: inserted } = await supabase.from('tasks').insert({
              user_id: userId,
              title: ghlTitle,
              description: ghlDescription,
              status: ghlStatus,
              priority: 'normal',
              due_date: ghlDueDate,
              contact_id: ghlTask._localContactId,
              ghl_task_id: ghlTask.id,
              completed_at: ghlTask.completed ? (ghlTask.completedDate || new Date().toISOString()) : null,
            }).select('id').maybeSingle();
            if (inserted) {
              const newTask = { id: inserted.id, ghl_task_id: ghlTask.id, title: ghlTitle };
              lookups.taskByGhlId.set(ghlTask.id, newTask);
              lookups.taskByTitle.set(ghlTitle, newTask);
            }
            results.tasks_pulled++;
          }
        }
      }

      // Small delay between chunks to avoid rate limits
      if (i + TASK_CHUNK < contactsWithGhl.length) await delay(100);
    }

    // === ORPHAN CLEANUP: Delete CRM tasks whose GHL task no longer exists ===
    // Only check tasks with ghl_task_id that were NOT seen in GHL fetch above
    const MAX_TASK_ORPHAN_CHECKS = 15;
    const linkedTasksNotSeen = lookups.existingContacts.length > 0
      ? (lookups.existingContacts as any[]).reduce((acc: any[], contact: any) => {
          // Find CRM tasks linked to this contact with a ghl_task_id not in seenGhlTaskIds
          const tasks = (lookups.taskByGhlId as Map<string, any>);
          return acc;
        }, [])
      : [];

    // Better approach: iterate all tasks with ghl_task_id from the pre-loaded lookup
    const orphanCandidates: any[] = [];
    for (const [ghlTaskId, task] of lookups.taskByGhlId as Map<string, any>) {
      if (!seenGhlTaskIds.has(ghlTaskId)) {
        orphanCandidates.push({ ...task, ghl_task_id: ghlTaskId });
      }
    }

    let tasksDeleted = 0;
    for (const task of orphanCandidates.slice(0, MAX_TASK_ORPHAN_CHECKS)) {
      // Verify via GHL API that this task truly doesn't exist anymore
      // We need the contact's ghl_contact_id
      const contact = lookups.existingContacts.find((c: any) => c.id === task.contact_id);
      if (!contact?.ghl_contact_id) continue;

      await delay(200);
      try {
        const verifyRes = await fetch(`${GHL_API_BASE}/contacts/${contact.ghl_contact_id}/tasks/${task.ghl_task_id}`, { headers: ghlHeaders });
        if (verifyRes.status === 404 || verifyRes.status === 422 || verifyRes.status === 400) {
          // Task no longer exists in GHL → delete from CRM
          const { error: delErr } = await supabase.from('tasks').delete().eq('id', task.id);
          if (!delErr) {
            console.log(`Deleted orphaned CRM task ${task.id} (GHL task ${task.ghl_task_id} no longer exists)`);
            tasksDeleted++;
            // Log the deletion
            await supabase.from('sync_log').insert({
              user_id: userId,
              entity_type: 'task',
              entity_id: task.id,
              action: 'delete_task_orphan',
              details: { ghl_task_id: task.ghl_task_id, reason: 'GHL task deleted' },
              status: 'success',
            });
          }
        } else {
          await verifyRes.text(); // consume body
        }
        if (verifyRes.status === 429) await delay(2000);
      } catch (e) { console.error('Task orphan check error:', task.id, e); }
    }
    if (tasksDeleted > 0) {
      results.tasks_deleted = tasksDeleted;
      console.log(`Cleaned up ${tasksDeleted} orphaned tasks (deleted from GHL)`);
    }

    // Push local tasks without GHL ID
    const localTasks = lookups.existingContacts.length > 0
      ? (await supabase.from('tasks').select('*').eq('user_id', userId).is('ghl_task_id', null).not('contact_id', 'is', null).limit(20)).data || []
      : [];

    for (const task of localTasks) {
      const contact = lookups.existingContacts.find((c: any) => c.id === task.contact_id);
      if (!contact?.ghl_contact_id) continue;

      try {
        const ghlPayload = {
          title: task.title,
          body: task.description || '',
          dueDate: task.due_date || new Date().toISOString(),
          completed: task.status === 'completed',
        };
        const res = await fetch(`${GHL_API_BASE}/contacts/${contact.ghl_contact_id}/tasks`, {
          method: 'POST', headers: ghlHeaders, body: JSON.stringify(ghlPayload),
        });
        if (res.ok) {
          const created = await res.json();
          if (created.task?.id) {
            await supabase.from('tasks').update({ ghl_task_id: created.task.id }).eq('id', task.id);
          }
          results.tasks_pushed++;
        }
      } catch (e) { console.error('Push task error:', task.id, e); }
    }
  } catch (e) { console.error('Task sync error:', e); }
}

// === CONVERSATIONS SYNC ===
function toISODate(val: any): string | null {
  if (!val) return null;
  if (typeof val === 'string' && val.includes('T')) return val;
  const n = Number(val);
  if (!isNaN(n) && n > 1e12) return new Date(n).toISOString();
  if (!isNaN(n) && n > 1e9) return new Date(n * 1000).toISOString();
  if (typeof val === 'string') { const d = new Date(val); if (!isNaN(d.getTime())) return d.toISOString(); }
  return null;
}

async function syncConversations(supabase: any, ghlHeaders: any, locationId: string, userId: string, results: any, lookups: any) {
  try {
    const searchParams = new URLSearchParams({ locationId, limit: '50', sortBy: 'last_message_date', sortOrder: 'desc' });
    const res = await fetch(`${GHL_API_BASE}/conversations/search?${searchParams.toString()}`, { headers: ghlHeaders });
    if (!res.ok) { console.error('Conversations fetch error:', res.status); return; }

    const data = await res.json();
    const conversations = data.conversations || [];
    console.log(`Fetched ${conversations.length} conversations from GHL`);
    
    let messagesSyncCount = 0;
    const MAX_MESSAGE_SYNCS = 10;

    // Batch upsert conversations
    const convUpsertRows = [];

    for (const conv of conversations) {
      try {
        const contactName = conv.contactName || conv.fullName || conv.contact?.name || 'Onbekend';
        const lastMsg = conv.lastMessageBody || conv.lastMessage?.body || '';
        const lastMsgDate = toISODate(conv.lastMessageDate || conv.dateUpdated || conv.dateAdded);
        const lastMsgDir = conv.lastMessageDirection || 'inbound';
        const phone = conv.phone || conv.contact?.phone || null;
        const email = conv.email || conv.contact?.email || null;
        const ghlContactId = conv.contactId || conv.contact?.id || null;

        // In-memory contact lookup
        let localContactId: string | null = null;
        if (ghlContactId) {
          const localContact = lookups.contactByGhlId.get(ghlContactId);
          localContactId = localContact?.id || null;
        }

        const isUnread = lastMsgDir === 'inbound' && (conv.unreadCount > 0 || false);

        convUpsertRows.push({
          user_id: userId,
          ghl_conversation_id: conv.id,
          contact_id: localContactId,
          contact_name: contactName,
          phone, email,
          last_message_body: lastMsg,
          last_message_date: lastMsgDate,
          last_message_direction: lastMsgDir,
          unread: isUnread,
          channel: conv.type || 'chat',
        });
      } catch (convErr) { console.error('Conversation process error:', convErr); }
    }

    // Batch upsert all conversations at once
    if (convUpsertRows.length > 0) {
      const { error: upsertErr } = await supabase.from('conversations').upsert(convUpsertRows, { onConflict: 'ghl_conversation_id' });
      if (upsertErr) {
        console.error('Conversations batch upsert error:', upsertErr.message);
      } else {
        results.conversations_synced += convUpsertRows.length;
      }
    }

    // Sync messages for recent conversations (limit to MAX_MESSAGE_SYNCS)
    for (const conv of conversations) {
      if (messagesSyncCount >= MAX_MESSAGE_SYNCS) break;
      
      try {
        const msgRes = await fetch(`${GHL_API_BASE}/conversations/${conv.id}/messages?limit=20`, { headers: ghlHeaders });
        if (!msgRes.ok) continue;
        
        const msgData = await msgRes.json();
        const messages = Array.isArray(msgData.messages) ? msgData.messages : (Array.isArray(msgData) ? msgData : []);
        console.log(`Messages fetch for conv ${conv.id}: status=${msgRes.status}, count=${messages.length}`);

        const msgUpsertRows = [];
        for (const msg of messages) {
          const msgDateAdded = toISODate(msg.dateAdded || msg.createdAt);
          msgUpsertRows.push({
            user_id: userId,
            conversation_id: null, // will be resolved below
            ghl_message_id: msg.id,
            body: msg.body || msg.text || '',
            direction: msg.direction || 'inbound',
            date_added: msgDateAdded || new Date().toISOString(),
            message_type: msg.contentType || msg.type || 'TYPE_SMS',
            status: msg.status || 'delivered',
          });
        }

        if (msgUpsertRows.length > 0) {
          // Get local conversation id
          const { data: localConv } = await supabase.from('conversations')
            .select('id')
            .eq('ghl_conversation_id', conv.id)
            .maybeSingle();

          if (localConv) {
            for (const row of msgUpsertRows) {
              row.conversation_id = localConv.id;
            }
            await supabase.from('messages').upsert(msgUpsertRows, { onConflict: 'ghl_message_id' });
          }
        }
        messagesSyncCount++;
      } catch (msgErr) {
        console.error(`Messages sync error for ${conv.id}:`, msgErr);
      }
    }
  } catch (e) { console.error('Conversation sync error:', e); }
}
