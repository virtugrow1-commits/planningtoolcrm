import { createClient } from "npm:@supabase/supabase-js@2";

const GHL_API_BASE = 'https://services.leadconnectorhq.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/** Fix common UTF-8 mojibake patterns */
const MOJIBAKE: [string, string][] = [
  ['Ã©', 'é'], ['Ã«', 'ë'], ['Ã¶', 'ö'], ['Ã¼', 'ü'], ['Ã¡', 'á'], ['Ã³', 'ó'],
  ['Ã¨', 'è'], ['Ã¯', 'ï'], ['Ã§', 'ç'], ['Ã®', 'î'], ['Ã¢', 'â'], ['Ã´', 'ô'],
  ['Ã»', 'û'], ['Ã±', 'ñ'], ['Ã¤', 'ä'], ['Ã¥', 'å'], ['Ã¦', 'æ'], ['Ã°', 'ð'],
  ['Ã½', 'ý'], ['Ã¿', 'ÿ'], ['ã©', 'é'], ['ã«', 'ë'], ['ã¶', 'ö'], ['ã¼', 'ü'],
  ['ã¨', 'è'], ['ã¯', 'ï'],
];
function fixEnc(text: string | null | undefined): string {
  if (!text) return text ?? '';
  let r = text;
  for (const [bad, good] of MOJIBAKE) r = r.split(bad).join(good);
  return r;
}

/** Normalize string for comparison (lowercase, trim, collapse whitespace) */
function norm(s: string | null | undefined): string {
  return fixEnc((s || '')).toLowerCase().trim().replace(/\s+/g, ' ');
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

const AUTO_SYNC_COOLDOWN_MS = 2 * 60 * 1000;
const FULL_SYNC_INTERVAL_MS = 30 * 60 * 1000;

async function logSystemSync(
  supabase: any,
  userId: string,
  action: string,
  details: Record<string, any>,
  status: 'success' | 'error' = 'success'
) {
  try {
    await supabase.from('sync_log').insert({
      user_id: userId,
      action,
      entity_type: 'system',
      entity_id: null,
      details,
      status,
    });
  } catch (error) {
    console.error(`Failed to log ${action}:`, error);
  }
}

Deno.serve(async (req) => {
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
  let requestBody: Record<string, any> = {};
  try {
    requestBody = await req.json();
  } catch {
    requestBody = {};
  }

  const ghlHeaders = {
    'Authorization': `Bearer ${GHL_API_KEY}`,
    'Content-Type': 'application/json',
    'Version': '2021-07-28',
  };

  // Get one user_id (primary user) - also check profiles as fallback when tables are empty
  const { data: anyUser } = await supabase.from('contacts').select('user_id').limit(1).maybeSingle();
  const { data: anyBookingUser } = await supabase.from('bookings').select('user_id').limit(1).maybeSingle();
  const { data: anyInqUser } = await supabase.from('inquiries').select('user_id').limit(1).maybeSingle();
  const { data: anyProfile } = await supabase.from('profiles').select('id').limit(1).maybeSingle();
  const userId = anyUser?.user_id || anyBookingUser?.user_id || anyInqUser?.user_id || anyProfile?.id;
  
  if (!userId) {
    console.log('No user found, skipping sync');
    return new Response(JSON.stringify({ error: 'No user found' }), { status: 200, headers: corsHeaders });
  }

  const triggerSource = requestBody.trigger || requestBody.source || (Object.keys(requestBody).length === 0 ? 'manual' : 'background');
  const requestedScope = requestBody.scope || null;
  const isManualFullSync = Object.keys(requestBody).length === 0 || requestedScope === 'full' || triggerSource === 'manual';

  const { data: latestRun } = await supabase
    .from('sync_log')
    .select('created_at, details')
    .eq('action', 'auto-sync-run')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestRun?.created_at) {
    const lastRunAt = new Date(latestRun.created_at).getTime();
    if (Date.now() - lastRunAt < AUTO_SYNC_COOLDOWN_MS) {
      return new Response(JSON.stringify({
        success: true,
        skipped: true,
        reason: 'cooldown_active',
        trigger: triggerSource,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  }

  const { data: latestFullSync } = await supabase
    .from('sync_log')
    .select('created_at')
    .eq('action', 'auto-sync-full')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const shouldRunFullSync = isManualFullSync || !latestFullSync?.created_at || (Date.now() - new Date(latestFullSync.created_at).getTime()) >= FULL_SYNC_INTERVAL_MS;
  const syncScope = shouldRunFullSync ? 'full' : 'light';

  await logSystemSync(supabase, userId, 'auto-sync-run', {
    phase: 'started',
    scope: syncScope,
    trigger: triggerSource,
  });

  // Run heavy sync in background using EdgeRuntime.waitUntil
  const backgroundSync = async () => {
    const results: any = { scope: syncScope, bookings_pulled: 0, bookings_pushed: 0, contacts: 0, opportunities: 0, contacts_pushed: 0, companies_synced: 0, companies_pushed: 0, tasks_pulled: 0, tasks_pushed: 0, conversations_synced: 0, documents_synced: 0, errors: [] };

    try {
      // PRE-LOAD: Fetch all existing CRM records into lookup Maps ONCE
      // This eliminates thousands of individual DB queries
      const [existingContacts, existingCompanies, existingInquiries, existingTasks] = await Promise.all([
        fetchAll(supabase, 'contacts', 'id, ghl_contact_id, first_name, last_name, email, phone, company, company_id, status, tags, updated_at, pending_outbound_sync, last_local_edit_at', {}),
        fetchAll(supabase, 'companies', 'id, ghl_company_id, name, email, phone, website, address, city, updated_at, pending_outbound_sync, last_local_edit_at', {}),
        fetchAll(supabase, 'inquiries', 'id, ghl_opportunity_id, status, budget, event_type, contact_name, contact_id, updated_at', {}),
        fetchAll(supabase, 'tasks', 'id, ghl_task_id, title, description, status, updated_at, contact_id, local_status_changed_at', {}),
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
      const taskByContactAndTitle = new Map<string, any>();
      for (const t of existingTasks) {
        if (t.ghl_task_id) taskByGhlId.set(t.ghl_task_id, t);
        const taskKey = `${t.contact_id || ''}|${norm(t.title)}`;
        if (!taskByContactAndTitle.has(taskKey)) taskByContactAndTitle.set(taskKey, t);
      }

      const { data: taskDeleteQueue } = await supabase
        .from('sync_queue')
        .select('payload')
        .eq('entity_type', 'task')
        .eq('action_type', 'delete');
      const deletedGhlTaskIds = new Set<string>();
      for (const item of taskDeleteQueue || []) {
        const deletedId = item.payload?.ghl_task_id;
        if (deletedId) deletedGhlTaskIds.add(deletedId);
      }

      const lookups = { contactByGhlId, contactByNameEmail, companyByGhlId, companyByName, inquiryByGhlId, taskByGhlId, taskByContactAndTitle, deletedGhlTaskIds, existingContacts, existingCompanies, existingInquiries };

      // Apply outbound creates, updates and deletes before reading external state.
      // Otherwise a pending task deletion can be pulled back into the CRM first.
      await processSyncQueue(supabase, ghlHeaders, GHL_LOCATION_ID, userId, results);

      if (shouldRunFullSync) {
        await syncContacts(supabase, ghlHeaders, GHL_LOCATION_ID, userId, results, lookups);
        await delay(200);
        await syncCompanies(supabase, ghlHeaders, GHL_LOCATION_ID, userId, results, lookups);
        await delay(200);
      }

      await syncOpportunities(supabase, ghlHeaders, GHL_LOCATION_ID, userId, results, lookups);
      await delay(200);

      // Calendar sync runs in BOTH light and full mode (only the pull window differs)
      await syncCalendar(supabase, ghlHeaders, GHL_LOCATION_ID, userId, results, shouldRunFullSync);
      await delay(200);

      if (shouldRunFullSync) {
        await syncTasks(supabase, ghlHeaders, GHL_LOCATION_ID, userId, results, lookups);
        await delay(200);
        await syncConversations(supabase, ghlHeaders, GHL_LOCATION_ID, userId, results, lookups);
        await delay(200);
        await syncDocuments(supabase, ghlHeaders, GHL_LOCATION_ID, userId, results);
      }

      // Push local inquiries without GHL opportunity ID
      await pushLocalInquiries(supabase, ghlHeaders, GHL_LOCATION_ID, userId, results);

      await logSystemSync(supabase, userId, 'auto-sync-run', {
        phase: 'completed',
        scope: syncScope,
        trigger: triggerSource,
        results,
      });

      if (shouldRunFullSync) {
        await logSystemSync(supabase, userId, 'auto-sync-full', {
          trigger: triggerSource,
          results,
        });
      }

      console.log('Auto-sync completed:', JSON.stringify(results));
    } catch (err) {
      console.error('Background sync error:', err);
      await logSystemSync(supabase, userId, 'auto-sync-run', {
        phase: 'failed',
        scope: syncScope,
        trigger: triggerSource,
        error: String(err),
      }, 'error');
    }
  };

  // @ts-ignore - EdgeRuntime.waitUntil is available in Supabase Edge Functions
  EdgeRuntime.waitUntil(backgroundSync());

  return new Response(JSON.stringify({ success: true, message: 'Sync started in background', scope: syncScope }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});

// === CALENDAR SYNC ===
async function syncCalendar(supabase: any, ghlHeaders: any, locationId: string, userId: string, results: any, isFullSync: boolean = true) {
  try {
    // showAll=true ensures we also pull events from inactive calendars
    const calRes = await fetch(`${GHL_API_BASE}/calendars/?locationId=${locationId}&showAll=true`, { headers: ghlHeaders });
    if (!calRes.ok) {
      const body = await calRes.text().catch(() => '');
      console.error('Calendar list error:', calRes.status, body);
      await logSystemSync(supabase, userId, 'calendar-list-error', { status: calRes.status, body: body.slice(0, 500) }, 'error');
      return;
    }

    const calData = await calRes.json();
    const calendars = calData.calendars || [];
    console.log(`Found ${calendars.length} calendars (incl. inactive)`);

    const { data: roomMappings } = await supabase
      .from('room_settings')
      .select('room_name, ghl_calendar_id')
      .not('id', 'is', null)
      .not('ghl_calendar_id', 'is', null);
    
    const calIdToRoom: Record<string, string> = {};
    const roomToCalId: Record<string, string> = {};
    for (const rm of roomMappings || []) {
      if (rm.ghl_calendar_id) {
        calIdToRoom[rm.ghl_calendar_id] = rm.room_name;
        roomToCalId[rm.room_name] = rm.ghl_calendar_id;
      }
    }

    // Light sync = laatste 30d / +90d. Full sync = 180d / +365d.
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - (isFullSync ? 180 : 30));
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + (isFullSync ? 365 : 90));

    // Fetch calendars sequentially to respect GHL rate limits
    const allEvents: any[] = [];
    const eventsPerCalendar: Record<string, number> = {};
    for (const cal of calendars) {
      let attempt = 0;
      const maxAttempts = 3;
      while (attempt < maxAttempts) {
        try {
          await delay(300);
          const eventsUrl = `${GHL_API_BASE}/calendars/events?locationId=${locationId}&calendarId=${cal.id}&startTime=${startDate.getTime()}&endTime=${endDate.getTime()}`;
          const eventsRes = await fetch(eventsUrl, { headers: ghlHeaders });
          if (eventsRes.ok) {
            const eventsData = await eventsRes.json();
            const events = eventsData.events || [];
            console.log(`Calendar "${cal.name}"${cal.isActive === false ? ' [inactive]' : ''}: ${events.length} events`);
            eventsPerCalendar[cal.name || cal.id] = events.length;
            allEvents.push(...events.map((e: any) => ({ ...e, calendarName: cal.name, calendarId: cal.id })));
            break;
          } else if (eventsRes.status === 429 || eventsRes.status >= 500) {
            attempt++;
            const wait = 1000 * Math.pow(2, attempt); // 2s, 4s, 8s
            console.warn(`Calendar "${cal.name}" ${eventsRes.status}, retry ${attempt}/${maxAttempts} after ${wait}ms`);
            await delay(wait);
          } else {
            const errBody = await eventsRes.text().catch(() => '');
            console.error(`Calendar "${cal.name}" error: ${eventsRes.status} ${errBody.slice(0, 200)}`);
            await logSystemSync(supabase, userId, 'calendar-events-error', {
              calendar: cal.name,
              calendarId: cal.id,
              status: eventsRes.status,
              body: errBody.slice(0, 500),
            }, 'error');
            break;
          }
        } catch (e) {
          attempt++;
          console.error(`Calendar "${cal.name}" fetch error (attempt ${attempt}):`, e);
          if (attempt < maxAttempts) await delay(1000 * attempt);
        }
      }
    }
    console.log(`Total events from GHL: ${allEvents.length}`);
    results.events_per_calendar = eventsPerCalendar;

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

    // Pre-load all existing bookings with ghl_event_id for timestamp comparison
    const existingBookings = await fetchAll(supabase, 'bookings', 'id, ghl_event_id, updated_at, room_name, date, start_hour, start_minute, end_hour, end_minute, title, contact_name, status, notes, guest_count, room_setup, requirements, preparation_status, assigned_to', {});
    const bookingByGhlId = new Map<string, any>();
    const bookingByDateRoomTime = new Map<string, any>();
    const dupKey = (date: string, startHour: number, room: string, contactName: string) =>
      `${date}|${startHour}|${norm(room)}|${norm(contactName)}`;
    for (const b of existingBookings) {
      if (b.ghl_event_id) bookingByGhlId.set(b.ghl_event_id, b);
      bookingByDateRoomTime.set(dupKey(b.date, b.start_hour, b.room_name, b.contact_name), b);
    }

    // Process events individually with timestamp comparison
    let newBookingRows = [];
    for (const evt of allEvents) {
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
        const roomName = calIdToRoom[evt.calendarId] || evt.calendarName || 'Onbekende ruimte';

        const existing = bookingByGhlId.get(evt.id);
        if (existing) {
          // Booking exists — compare timestamps to decide who wins
          const ghlUpdatedAt = evt.dateUpdated || evt.dateAdded || null;
          const crmIsNewer = !ghlUpdatedAt || existing.updated_at >= ghlUpdatedAt;

          if (crmIsNewer) {
            // CRM wins → don't overwrite local changes
            console.log(`Booking ${existing.id}: CRM is newer, preserving local changes`);
          } else {
            // GHL wins → update only time/date fields, preserve locally-set fields (notes, guest_count, room_setup, etc.)
            await supabase.from('bookings').update({
              date: dateStr,
              start_hour: startHour,
              start_minute: startMinute,
              end_hour: endHour,
              end_minute: endMinute,
              title,
              contact_name: contactName,
              status: evtStatus,
              // Preserve: room_name (user may have moved it), notes, guest_count, room_setup, requirements, preparation_status, assigned_to
            }).eq('id', existing.id);
            console.log(`GHL -> CRM booking ${existing.id}: GHL is newer (GHL: ${ghlUpdatedAt}, CRM: ${existing.updated_at})`);
            results.bookings_pulled++;
          }
        } else {
          // Fallback: same date+start_hour+room+contact already exists → backfill ghl_event_id instead of inserting duplicate
          const fallback = bookingByDateRoomTime.get(dupKey(dateStr, startHour, roomName, contactName));
          if (fallback) {
            await supabase.from('bookings').update({ ghl_event_id: evt.id }).eq('id', fallback.id);
            console.log(`Booking ${fallback.id}: linked to GHL event ${evt.id} (duplicate fallback)`);
            continue;
          }
          // New booking from GHL → insert
          newBookingRows.push({
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
        }
      } catch (evtErr) { console.error('Event error:', evt.id, evtErr); }
    }

    // Batch insert new bookings
    if (newBookingRows.length > 0) {
      const CHUNK_SIZE = 20;
      for (let i = 0; i < newBookingRows.length; i += CHUNK_SIZE) {
        const chunk = newBookingRows.slice(i, i + CHUNK_SIZE);
        const { error: insertErr } = await supabase.from('bookings').insert(chunk);
        if (insertErr) {
          console.error(`Booking batch insert error:`, insertErr.message);
          results.errors.push(`booking_batch:${insertErr.message}`);
        } else {
          results.bookings_pulled += chunk.length;
        }
      }
    }

    // Push local bookings (with rate limiting to avoid 429)
    const activeCalendarIds = new Set(calendars.filter((c: any) => c.isActive !== false).map((c: any) => c.id));
    const defaultCalendarId = calendars.find((c: any) => c.isActive !== false)?.id;
    const { data: localBookings } = await supabase.from('bookings').select('*, contacts!bookings_contact_id_fkey(ghl_contact_id)').not('id', 'is', null).is('ghl_event_id', null);
    for (const booking of localBookings || []) {
      const ghlContactId = (booking as any).contacts?.ghl_contact_id || null;
      if (!ghlContactId) continue;
      const targetCalendarId = roomToCalId[booking.room_name] || defaultCalendarId;
      if (!targetCalendarId) continue;
      // Skip inactive calendars
      if (!activeCalendarIds.has(targetCalendarId)) {
        console.log(`Skipping booking ${booking.id}: calendar ${targetCalendarId} is inactive`);
        continue;
      }
      try {
        await delay(500); // Rate limit between pushes
        const probeDate = new Date(`${booking.date}T12:00:00Z`);
        const amStr = probeDate.toLocaleString('en-US', { timeZone: 'Europe/Amsterdam', hour12: false });
        const amDate = new Date(amStr);
        const offsetH = Math.round((amDate.getTime() - probeDate.getTime()) / 3600000);
        const tz = `${offsetH >= 0 ? '+' : '-'}${String(Math.abs(offsetH)).padStart(2, '0')}:00`;
        const startTime = `${booking.date}T${String(booking.start_hour).padStart(2, '0')}:${String(booking.start_minute || 0).padStart(2, '0')}:00${tz}`;
        const endTime = `${booking.date}T${String(booking.end_hour).padStart(2, '0')}:${String(booking.end_minute || 0).padStart(2, '0')}:00${tz}`;
        const appointmentPayload: Record<string, any> = {
          calendarId: targetCalendarId,
          locationId,
          contactId: ghlContactId,
          title: booking.title || 'CRM Boeking',
          startTime,
          endTime,
          appointmentStatus: booking.status === 'confirmed' ? 'confirmed' : 'new',
          ignoreDateRange: true,
          ignoreValidation: true,
          ignoreFreeSlotValidation: true,
          selectedTimezone: 'Europe/Amsterdam',
        };
        const res = await fetch(`${GHL_API_BASE}/calendars/events/appointments`, {
          method: 'POST', headers: ghlHeaders,
          body: JSON.stringify(appointmentPayload),
        });
        if (res.ok) {
          const created = await res.json();
          const ghlId = created.id || created.event?.id;
          if (ghlId) await supabase.from('bookings').update({ ghl_event_id: ghlId }).eq('id', booking.id);
          results.bookings_pushed++;
        } else {
          const errText = await res.text();
          console.error(`Push booking ${booking.id} failed: ${errText}`);
          // Don't retry with /calendars/events - that endpoint doesn't exist (404)
        }
      } catch (e) { console.error('Push booking error:', booking.id, e); }
    }
  } catch (e) { console.error('Calendar sync error:', e); }
}

// === AUTO-ENRICH: Fetch custom fields for a single opportunity ===
async function autoEnrichInquiry(supabase: any, ghlHeaders: any, locationId: string, oppId: string, inquiryId: string) {
  try {
    const oppRes = await fetch(`${GHL_API_BASE}/opportunities/${oppId}`, { headers: ghlHeaders });
    if (!oppRes.ok) return;
    const oppData = await oppRes.json();
    const opp = oppData.opportunity || oppData;
    const customFields = opp.customFields || opp.custom_fields || [];
    
    // Also fetch contact custom fields
    const ghlContactId = opp.contactId || opp.contact?.id;
    const fieldMap: Record<string, string> = {};
    
    for (const cf of customFields) {
      const name = (cf.name || cf.fieldName || cf.key || cf.id || '').toLowerCase();
      const value = cf.value || cf.fieldValue || '';
      if (value && name) fieldMap[name] = String(value);
    }
    
    if (ghlContactId) {
      try {
        const contactRes = await fetch(`${GHL_API_BASE}/contacts/${ghlContactId}`, { headers: ghlHeaders });
        if (contactRes.ok) {
          const contactData = await contactRes.json();
          const ghlContact = contactData.contact || contactData;
          for (const cf of (ghlContact.customFields || ghlContact.custom_fields || [])) {
            const name = (cf.name || cf.fieldName || cf.key || cf.id || '').toLowerCase();
            const value = cf.value || cf.fieldValue || '';
            if (value && name && !fieldMap[name]) fieldMap[name] = String(value);
          }
        }
      } catch { /* non-fatal */ }
    }
    
    if (Object.keys(fieldMap).length === 0) return;
    
    // Fuzzy field lookup
    const fuzzyFind = (...terms: string[]): string => {
      for (const term of terms) { if (fieldMap[term]) return fieldMap[term]; }
      for (const term of terms) { for (const [key, value] of Object.entries(fieldMap)) { if (key.includes(term) && value) return value; } }
      return '';
    };
    
    const guestCount = parseInt(fuzzyFind('aantal gasten', 'guest_count', 'guests', 'gasten') || '0', 10) || 0;
    const preferredDate = fuzzyFind('gewenste datum', 'selecteer de gewenste datum', 'preferred_date', 'datum') || null;
    const roomPreference = fuzzyFind('gewenste zaalopstelling', 'zaalopstelling', 'room_preference', 'zaal') || null;
    const enrichedBudget = fuzzyFind('budget') ? Number(fuzzyFind('budget')) : (opp.monetaryValue ? Number(opp.monetaryValue) : null);
    const enrichedEventType = fuzzyFind('type evenement', 'type gelegenheid', 'soort evenement') || opp.name || null;
    const enrichedSource = opp.source && opp.source !== 'GHL' ? opp.source : null;
    
    const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    const messageParts: string[] = [];
    for (const [key, value] of Object.entries(fieldMap)) {
      if (value) messageParts.push(`${capitalize(key)}: ${value}`);
    }
    
    const updateData: Record<string, any> = {};
    if (guestCount) updateData.guest_count = guestCount;
    if (preferredDate) updateData.preferred_date = preferredDate;
    if (roomPreference) updateData.room_preference = roomPreference;
    if (enrichedBudget) updateData.budget = enrichedBudget;
    if (enrichedEventType) updateData.event_type = enrichedEventType;
    if (enrichedSource) updateData.source = enrichedSource;
    if (messageParts.length > 0) updateData.message = messageParts.join('\n');
    
    if (Object.keys(updateData).length > 0) {
      await supabase.from('inquiries').update(updateData).eq('id', inquiryId);
      console.log(`Auto-enriched inquiry ${inquiryId} with ${Object.keys(fieldMap).length} fields from opp ${oppId}`);
    }
  } catch (e) {
    console.error(`Auto-enrich failed for ${inquiryId} (non-fatal):`, e);
  }
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
      if (l.includes('condoleance') || l.includes('condolence')) return 'condolence_reminder';
      if (l.includes('evenement')) return 'converted';
      return 'new';
    };

    const statusToStageName: Record<string, string> = {
      'new': 'nieuwe aanvraag', 'contacted': 'lopend contact', 'option': 'optie',
      'quoted': 'offerte verzonden', 'quote_revised': 'aangepaste offerte',
      'reserved': 'reservering', 'script': 'draaiboek maken',
      'confirmed': 'definitieve reservering',
      'invoiced': 'facturatie', 'lost': 'vervallen', 'after_sales': 'after sales',
      'condolence_reminder': 'condoleance herdenkingen', 'converted': 'evenement',
    };

    const findStageId = (crmStatus: string): string | null => {
      const target = statusToStageName[crmStatus];
      if (!target) return null;
      for (const [name, id] of Object.entries(stageNameToId)) {
        if (name.includes(target)) return id;
      }
      return null;
    };

    // CRM is the source of truth for status.
    // GHL may only overwrite CRM status if GHL's own dateUpdated is NEWER than CRM's updated_at.
    // This prevents auto-sync from reverting manual status changes made in the CRM.
    const seenGhlOppIds = new Set<string>();

    // 1. Pull GHL opportunities
    let page = 1;
    let hasMore = true;
    while (hasMore && page <= 20) {
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
          const crmDiffers = existing.status !== ghlStatus ||
                             existing.event_type !== (opp.name || 'Onbekend') ||
                             (existing.budget ? Number(existing.budget) : null) !== monetaryValue;

          if (crmDiffers) {
            // Determine who changed last using GHL's own dateUpdated timestamp.
            // If CRM updated_at is newer than GHL's dateUpdated → CRM wins (user made a manual change).
            // If GHL dateUpdated is newer → GHL wins (change originated in GHL).
            const ghlUpdatedAt = opp.dateUpdated || opp.dateAdded || null;
            const crmIsNewer = !ghlUpdatedAt || existing.updated_at >= ghlUpdatedAt;

            if (crmIsNewer) {
              // CRM wins → push CRM status to GHL so they stay in sync
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
                console.log(`CRM -> GHL opp ${opp.id}: ${existing.status} (CRM updated_at: ${existing.updated_at}, GHL dateUpdated: ${ghlUpdatedAt})`);
                results.opportunities_pushed = (results.opportunities_pushed || 0) + 1;
              } else {
                console.error(`Push to GHL failed for ${opp.id}: ${await pushRes.text()}`);
              }
            } else {
              // GHL wins → GHL has a more recent change, update CRM
              // NOTE: only overwrite status if GHL explicitly changed it (not a CRM-to-GHL echo)
              const { error: updateErr } = await supabase.from('inquiries').update({
                contact_name: contactName,
                status: ghlStatus,
                budget: monetaryValue,
                event_type: opp.name || 'Onbekend',
              }).eq('id', existing.id);
              if (!updateErr) {
                console.log(`GHL -> CRM opp ${opp.id}: ${ghlStatus} (GHL dateUpdated: ${ghlUpdatedAt}, CRM updated_at: ${existing.updated_at})`);
              }
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
            // Auto-enrich merged inquiry
            await autoEnrichInquiry(supabase, ghlHeaders, locationId, opp.id, mergedExisting.id);
          } else {
            const { data: inserted, error: insertErr } = await supabase.from('inquiries').upsert({
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
            }, { onConflict: 'ghl_opportunity_id', ignoreDuplicates: true }).select('id').maybeSingle();
            if (insertErr) {
              results.errors.push(`insert:${opp.id}:${insertErr.message}`);
            } else if (inserted?.id) {
              // Auto-enrich newly created inquiry with custom fields
              await autoEnrichInquiry(supabase, ghlHeaders, locationId, opp.id, inserted.id);
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
      .not('id', 'is', null)
      .not('ghl_opportunity_id', 'is', null)
      .gt('updated_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

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
  const allSeenTags = new Set<string>();
  try {
    const recentThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // 1. Pull ALL GHL contacts (paginate)
    const ghlContacts: any[] = [];
    let contactPage = 1;
    let contactHasMore = true;
    let contactRateLimitRetries = 0;
    const MAX_RATE_LIMIT_RETRIES = 5;
    while (contactHasMore && contactPage <= 40) {
      await delay(200); // Rate limit between pages
      const res = await fetch(`${GHL_API_BASE}/contacts/?locationId=${locationId}&limit=100&page=${contactPage}`, { headers: ghlHeaders });
      if (res.status === 429) {
        contactRateLimitRetries++;
        if (contactRateLimitRetries >= MAX_RATE_LIMIT_RETRIES) {
          console.error(`Contacts: rate limit exceeded ${MAX_RATE_LIMIT_RETRIES} times, aborting contact sync to preserve API quota`);
          break;
        }
        console.log(`Contacts page ${contactPage}: rate limited (${contactRateLimitRetries}/${MAX_RATE_LIMIT_RETRIES}), waiting 10s...`);
        await delay(10000);
        continue; // retry same page
      }
      contactRateLimitRetries = 0; // reset on success
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
      const firstName = fixEnc(ghlContact.firstName || ghlContact.name?.split(' ')[0] || 'Onbekend');
      const lastName = fixEnc(ghlContact.lastName || ghlContact.name?.split(' ').slice(1).join(' ') || '');
      const ghlEmail = ghlContact.email || null;
      const ghlPhone = ghlContact.phone || null;
      const ghlCompanyName = fixEnc(ghlContact.companyName || null);

      // Use pre-loaded lookup instead of DB query
      const existing = lookups.contactByGhlId.get(ghlContact.id);

      if (existing) {
        // SAFEGUARD 1: never overwrite a record that has unsynced local edits
        if (existing.pending_outbound_sync === true) {
          console.log(`[Inbound] Skipping contact ${existing.id}: pending outbound sync (local edit not yet pushed)`);
          results.contacts++;
          continue;
        }

        // Timestamp-based conflict resolution: only overwrite CRM if GHL is newer
        const crmDiffers = norm(existing.first_name) !== norm(firstName) ||
                           norm(existing.last_name) !== norm(lastName) ||
                           norm(existing.email) !== norm(ghlEmail) ||
                           norm(existing.phone) !== norm(ghlPhone) ||
                           (ghlCompanyName && norm(existing.company) !== norm(ghlCompanyName));

        if (crmDiffers) {
          // Compare timestamps: GHL dateUpdated vs CRM updated_at
          const ghlUpdatedAt = ghlContact.dateUpdated || ghlContact.dateAdded || null;
          const crmIsNewer = !ghlUpdatedAt || existing.updated_at >= ghlUpdatedAt;

          if (crmIsNewer) {
            // CRM wins → push local changes to GHL instead
            const pushPayload: any = {
              firstName: existing.first_name,
              lastName: existing.last_name,
              email: existing.email || undefined,
              phone: existing.phone || undefined,
              companyName: existing.company || undefined,
            };
            await delay(150);
            const pushRes = await fetch(`${GHL_API_BASE}/contacts/${ghlContact.id}`, {
              method: 'PUT', headers: ghlHeaders, body: JSON.stringify(pushPayload),
            });
            if (pushRes.ok) {
              console.log(`CRM -> GHL contact ${ghlContact.id}: CRM is newer (CRM: ${existing.updated_at}, GHL: ${ghlUpdatedAt})`);
              results.contacts_pushed++;
            } else {
              await pushRes.text();
            }
          } else {
            // GHL wins → only fill fields where GHL has a real value (NEVER blank out CRM data)
            const updatePayload: any = {};
            if (firstName && firstName.trim()) updatePayload.first_name = firstName;
            if (lastName && lastName.trim()) updatePayload.last_name = lastName;
            if (ghlEmail && ghlEmail.trim()) updatePayload.email = ghlEmail;
            if (ghlPhone && ghlPhone.trim()) updatePayload.phone = ghlPhone;
            if (ghlCompanyName && ghlCompanyName.trim()) updatePayload.company = ghlCompanyName;

            if (Object.keys(updatePayload).length > 0) {
              await supabase.from('contacts').update(updatePayload).eq('id', existing.id);
              console.log(`GHL -> CRM contact ${existing.id}: enriched ${Object.keys(updatePayload).length} field(s) (GHL newer)`);
            }
          }
        }

        // Tags are managed in GHL and are always mirrored into the CRM
        if (Array.isArray(ghlContact.tags)) {
          const ghlTags: string[] = ghlContact.tags.map((t: any) => fixEnc(String(t))).filter(Boolean);
          for (const t of ghlTags) allSeenTags.add(t);
          const currentTags: string[] = Array.isArray(existing.tags) ? existing.tags : [];
          const differs = currentTags.length !== ghlTags.length ||
            ghlTags.some((t) => !currentTags.some((c) => norm(c) === norm(t)));
          if (differs) {
            await supabase.from('contacts').update({ tags: ghlTags }).eq('id', existing.id);
            existing.tags = ghlTags;
          }
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
          const newTags: string[] = Array.isArray(ghlContact.tags)
            ? ghlContact.tags.map((t: any) => fixEnc(String(t))).filter(Boolean)
            : [];
          for (const t of newTags) allSeenTags.add(t);
          const { data: inserted, error: insertErr } = await supabase.from('contacts').insert({
            user_id: userId,
            ghl_contact_id: ghlContact.id,
            first_name: firstName,
            last_name: lastName,
            email: ghlEmail,
            phone: ghlPhone,
            company: ghlCompanyName,
            tags: newTags,
            status: 'lead',
          }).select('id').maybeSingle();
          if (insertErr) {
            if (insertErr.message?.includes('contacts_unique_name_email')) {
              console.log(`Duplicate contact \\${firstName} ${lastName}, linking to GHL ${ghlContact.id}`);
              await supabase.from('contacts').update({ ghl_contact_id: ghlContact.id })
                .not('id', 'is', null)
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

    // Keep the selectable tag list in sync with everything seen on GHL contacts
    if (allSeenTags.size > 0) {
      const { data: knownTags } = await supabase.from('ghl_tags').select('id, name');
      const known = new Set<string>((knownTags || []).map((t: any) => norm(t.name)));
      const newTagRows = Array.from(allSeenTags)
        .filter((t) => !known.has(norm(t)))
        .map((t) => ({ name: t }));
      if (newTagRows.length > 0) {
        await supabase.from('ghl_tags').insert(newTagRows);
        console.log(`[Tags] Added ${newTagRows.length} new tag(s) to the selectable list`);
      }
    }



    // 2. Push recently changed CRM contacts
    const { data: recentlyChanged } = await supabase
      .from('contacts')
      .select('id, ghl_contact_id, first_name, last_name, email, phone, company')
      .not('id', 'is', null)
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
      await delay(150);
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

      await delay(150);
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

    // 5. SAFEGUARD: orphan cleanup is DISABLED.
    // Auto-sync mag NOOIT contacten automatisch verwijderen, ook niet als GHL ze tijdelijk niet teruggeeft.
    // GHL kan rate-limit geven, paginatie kan falen, of een contact kan tijdelijk uit een lijst vallen.
    // Verwijderen mag alleen via een expliciete gebruikersactie (deleteContact in de UI).
    // We loggen verdachte gevallen wel, zodat ze handmatig nagekeken kunnen worden.
    if (seenGhlContactIds.size > 0) {
      const linkedNotSeen = lookups.existingContacts.filter((c: any) =>
        c.ghl_contact_id && !seenGhlContactIds.has(c.ghl_contact_id)
      );
      if (linkedNotSeen.length > 0) {
        console.log(`[Safeguard] ${linkedNotSeen.length} CRM-contacten niet gezien in GHL — NIET verwijderd (handmatige controle vereist).`);
        try {
          await supabase.from('sync_log').insert({
            user_id: userId,
            action: 'orphan_contacts_detected',
            entity_type: 'contact',
            entity_id: null,
            details: {
              count: linkedNotSeen.length,
              note: 'Auto-delete is uitgeschakeld. Handmatige controle vereist.',
              sample: linkedNotSeen.slice(0, 10).map((c: any) => ({ id: c.id, name: `${c.first_name} ${c.last_name}`, ghl_contact_id: c.ghl_contact_id })),
            },
            status: 'success',
          });
        } catch (_) { /* intentional */ }
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
      const ghlName = fixEnc(ghlCompany.name || 'Onbekend');
      const ghlEmail = ghlCompany.email || null;
      const ghlPhone = ghlCompany.phone || null;
      const ghlWebsite = ghlCompany.website || null;
      const ghlAddress = ghlCompany.address || null;
      const ghlCity = ghlCompany.city || null;

      // In-memory lookup by ghl_company_id
      const existing = lookups.companyByGhlId.get(ghlCompany.id);

      if (existing) {
        // SAFEGUARD 1: never overwrite a record that has unsynced local edits
        if (existing.pending_outbound_sync === true) {
          console.log(`[Inbound] Skipping company ${existing.id}: pending outbound sync (local edit not yet pushed)`);
          results.companies_synced++;
          continue;
        }

        // Timestamp-based conflict resolution: if CRM was updated recently (within 24h), skip GHL overwrite
        const crmUpdated = existing.updated_at ? new Date(existing.updated_at).getTime() : 0;
        const recentlyEditedLocally = (Date.now() - crmUpdated) < 24 * 60 * 60 * 1000;

        if (recentlyEditedLocally) {
          // CRM has recent local edits — don't overwrite, push CRM → GHL instead
          console.log(`Company "${existing.name}" was recently edited locally, skipping GHL overwrite`);
        } else {
          // SAFEGUARD 2: only enrich fields where GHL has a real value (NEVER blank out CRM data)
          const updatePayload: any = {};
          if (ghlName && ghlName.trim() && norm(existing.name) !== norm(ghlName)) updatePayload.name = ghlName;
          if (ghlEmail && ghlEmail.trim() && norm(existing.email) !== norm(ghlEmail)) updatePayload.email = ghlEmail;
          if (ghlPhone && ghlPhone.trim() && norm(existing.phone) !== norm(ghlPhone)) updatePayload.phone = ghlPhone;
          if (ghlWebsite && ghlWebsite.trim() && norm(existing.website) !== norm(ghlWebsite)) updatePayload.website = ghlWebsite;
          if (ghlAddress && ghlAddress.trim() && norm(existing.address) !== norm(ghlAddress)) updatePayload.address = ghlAddress;
          if (ghlCity && ghlCity.trim() && norm(existing.city) !== norm(ghlCity)) updatePayload.city = ghlCity;

          if (Object.keys(updatePayload).length > 0) {
            await supabase.from('companies').update(updatePayload).eq('id', existing.id);
            console.log(`GHL -> CRM company ${existing.id}: enriched ${Object.keys(updatePayload).length} field(s)`);
          }
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
    const { data: localInquiries } = await supabase.from('inquiries').select('*').not('id', 'is', null).is('ghl_opportunity_id', null).limit(50);
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
      'condolence_reminder': 'Condoleance Herdenkingen',
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
    // Sync tasks for ALL contacts that have GHL IDs (no artificial limit)
    const contactsWithGhl = lookups.existingContacts
      .filter((c: any) => c.ghl_contact_id);

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
        if (lookups.deletedGhlTaskIds.has(ghlTask.id)) {
          const deleteRes = await fetch(`${GHL_API_BASE}/contacts/${ghlTask._ghlContactId}/tasks/${ghlTask.id}`, {
            method: 'DELETE', headers: ghlHeaders,
          });
          await deleteRes.text();
          console.log(`[Task Sync] Suppressed deleted task ${ghlTask.id}; external delete status ${deleteRes.status}`);
          continue;
        }
        const ghlStatus = ghlTask.completed ? 'completed' : 'open';
        const ghlTitle = ghlTask.title || 'GHL Taak';
        const ghlDescription = ghlTask.body || null;
        const ghlDueDate = ghlTask.dueDate ? ghlTask.dueDate.split('T')[0] : null;

        // In-memory lookup
        const existing = lookups.taskByGhlId.get(ghlTask.id);

        if (existing) {
          const crmRecentlyUpdated = existing.updated_at > recentThreshold;
          const crmDiffers = existing.status !== ghlStatus || existing.title !== ghlTitle;
          const localStatusIsAuthoritative = Boolean(existing.local_status_changed_at) && existing.status !== ghlStatus;

          if (localStatusIsAuthoritative || (crmRecentlyUpdated && crmDiffers)) {
            // CRM wins
            const pushPayload: any = {
              title: existing.title,
              body: existing.description || '',
              completed: existing.status === 'completed',
            };
            const pushRes = await fetch(`${GHL_API_BASE}/contacts/${ghlTask._ghlContactId}/tasks/${ghlTask.id}`, {
              method: 'PUT', headers: ghlHeaders, body: JSON.stringify(pushPayload),
            });
            if (pushRes.ok) {
              results.tasks_pushed++;
              if (localStatusIsAuthoritative) {
                await supabase.from('sync_log').insert({
                  user_id: userId,
                  entity_type: 'task',
                  entity_id: existing.id,
                  action: 'protect_local_task_status',
                  details: { crm_status: existing.status, external_status: ghlStatus, ghl_task_id: ghlTask.id },
                  status: 'success',
                });
              }
            }
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
          // Only deduplicate within the same contact. Global title matching linked
          // common titles such as "Offerte nabellen" to unrelated contacts.
          const titleKey = `${ghlTask._localContactId || ''}|${norm(ghlTitle)}`;
          const titleDup = lookups.taskByContactAndTitle.get(titleKey);

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
              lookups.taskByContactAndTitle.set(titleKey, newTask);
            }
            results.tasks_pulled++;
          }
        }
      }

      // Small delay between chunks to avoid rate limits
      if (i + TASK_CHUNK < contactsWithGhl.length) await delay(100);
    }

    // === ORPHAN CLEANUP: Delete CRM tasks whose GHL task no longer exists ===
    // Collect ALL tasks with ghl_task_id that were NOT seen in GHL fetch above
    const orphanCandidates: any[] = [];
    for (const [ghlTaskId, task] of lookups.taskByGhlId as Map<string, any>) {
      if (!seenGhlTaskIds.has(ghlTaskId)) {
        orphanCandidates.push({ ...task, ghl_task_id: ghlTaskId });
      }
    }

    console.log(`Task orphan candidates: ${orphanCandidates.length} (seen: ${seenGhlTaskIds.size}, total linked: ${lookups.taskByGhlId.size})`);

    let tasksDeleted = 0;
    const MAX_TASK_ORPHAN_CHECKS = 100; // Much more aggressive cleanup

    for (const task of orphanCandidates.slice(0, MAX_TASK_ORPHAN_CHECKS)) {
      const contact = lookups.existingContacts.find((c: any) => c.id === task.contact_id);

      if (!contact?.ghl_contact_id) {
        // Task has no contact or contact has no GHL ID — if it wasn't seen, it's orphaned
        // For safety, only delete if the contact was in our fetch scope (has ghl_contact_id)
        // If contact has no ghl_contact_id, we can't verify — skip for now
        if (!task.contact_id) {
          // Task not linked to any contact but has ghl_task_id and wasn't seen → delete
          const { error: delErr } = await supabase.from('tasks').delete().eq('id', task.id);
          if (!delErr) {
            console.log(`Deleted unlinked orphaned CRM task ${task.id} (ghl_task_id: ${task.ghl_task_id})`);
            tasksDeleted++;
            await supabase.from('sync_log').insert({
              user_id: userId, entity_type: 'task', entity_id: task.id,
              action: 'delete_task_orphan',
              details: { ghl_task_id: task.ghl_task_id, reason: 'No contact, GHL task not found' },
              status: 'success',
            });
          }
        }
        continue;
      }

      await delay(150);
      try {
        const verifyRes = await fetch(`${GHL_API_BASE}/contacts/${contact.ghl_contact_id}/tasks/${task.ghl_task_id}`, { headers: ghlHeaders });
        if (verifyRes.status === 404 || verifyRes.status === 422 || verifyRes.status === 400) {
          const { error: delErr } = await supabase.from('tasks').delete().eq('id', task.id);
          if (!delErr) {
            console.log(`Deleted orphaned CRM task ${task.id} (GHL task ${task.ghl_task_id} no longer exists)`);
            tasksDeleted++;
            await supabase.from('sync_log').insert({
              user_id: userId, entity_type: 'task', entity_id: task.id,
              action: 'delete_task_orphan',
              details: { ghl_task_id: task.ghl_task_id, contact_ghl_id: contact.ghl_contact_id, reason: 'GHL task deleted' },
              status: 'success',
            });
          }
        } else {
          await verifyRes.text();
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
      ? (await supabase.from('tasks').select('*').not('id', 'is', null).is('ghl_task_id', null).not('contact_id', 'is', null).limit(20)).data || []
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
    const MAX_MESSAGE_SYNCS = 3;

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

// === PROCESS SYNC QUEUE ===
async function processSyncQueue(supabase: any, ghlHeaders: any, locationId: string, userId: string, results: any) {
  try {
    // Only process items that haven't permanently failed
    const { data: pendingItems } = await supabase
      .from('sync_queue')
      .select('*')
      .in('status', ['pending', 'retrying'])
      .order('created_at', { ascending: true })
      .limit(10);

    if (!pendingItems || pendingItems.length === 0) return;

    console.log(`[Queue] Processing ${pendingItems.length} pending items`);

    // Pre-fetch calendar active status to avoid repeated API calls
    const { data: roomSettings } = await supabase
      .from('room_settings')
      .select('room_name, ghl_calendar_id')
      .not('ghl_calendar_id', 'is', null);
    const roomToCalId: Record<string, string> = {};
    for (const rs of roomSettings || []) {
      if (rs.ghl_calendar_id) roomToCalId[rs.room_name] = rs.ghl_calendar_id;
    }

    // Check calendar active status once (cache)
    const calendarActiveCache = new Map<string, boolean>();
    const checkCalendarActive = async (calId: string): Promise<boolean> => {
      if (calendarActiveCache.has(calId)) return calendarActiveCache.get(calId)!;
      try {
        const res = await fetch(`${GHL_API_BASE}/calendars/${calId}`, { headers: ghlHeaders });
        const isActive = res.ok ? (await res.json())?.calendar?.isActive !== false : false;
        calendarActiveCache.set(calId, isActive);
        return isActive;
      } catch { calendarActiveCache.set(calId, false); return false; }
    };

    let succeeded = 0, failed = 0;

    for (const item of pendingItems) {
      // Quick check: skip booking items for inactive calendars immediately
      if (item.entity_type === 'booking' && (item.action_type === 'create' || item.action_type === 'update')) {
        const { data: booking } = await supabase.from('bookings').select('room_name').eq('id', item.entity_id).maybeSingle();
        if (!booking) { await supabase.from('sync_queue').delete().eq('id', item.id); continue; }
        const calId = roomToCalId[booking.room_name];
        if (!calId || !(await checkCalendarActive(calId))) {
          await supabase.from('sync_queue').update({ status: 'failed', last_error: 'GHL kalender is inactief' }).eq('id', item.id);
          failed++; continue;
        }
      }

      await supabase.from('sync_queue').update({
        status: 'retrying',
        retry_count: (item.retry_count || 0) + 1,
        last_attempt_at: new Date().toISOString(),
      }).eq('id', item.id);

      try {
        let success = false;

        if (item.entity_type === 'booking' && (item.action_type === 'create' || item.action_type === 'update')) {
          const { data: booking } = await supabase.from('bookings').select('*, contacts!bookings_contact_id_fkey(ghl_contact_id)').eq('id', item.entity_id).single();
          if (!booking) { await supabase.from('sync_queue').delete().eq('id', item.id); continue; }
          const ghlContactId = (booking as any).contacts?.ghl_contact_id;
          const calendarId = roomToCalId[booking.room_name];
          if (!ghlContactId || !calendarId) {
            const nr = (item.retry_count || 0) + 1;
            await supabase.from('sync_queue').update({ status: nr >= 5 ? 'failed' : 'pending', last_error: 'Missing GHL contact or calendar mapping', retry_count: nr }).eq('id', item.id);
            failed++; continue;
          }
          const probeDate = new Date(`${booking.date}T12:00:00Z`);
          const amStr = probeDate.toLocaleString('en-US', { timeZone: 'Europe/Amsterdam', hour12: false });
          const amDate = new Date(amStr);
          const offsetH = Math.round((amDate.getTime() - probeDate.getTime()) / 3600000);
          const tz = `${offsetH >= 0 ? '+' : '-'}${String(Math.abs(offsetH)).padStart(2, '0')}:00`;
          const startTime = `${booking.date}T${String(booking.start_hour).padStart(2, '0')}:${String(booking.start_minute || 0).padStart(2, '0')}:00${tz}`;
          const endTime = `${booking.date}T${String(booking.end_hour).padStart(2, '0')}:${String(booking.end_minute || 0).padStart(2, '0')}:00${tz}`;
          const payload: Record<string, any> = {
            calendarId, locationId, contactId: ghlContactId,
            title: booking.title || 'Reservering', startTime, endTime,
            appointmentStatus: booking.status === 'confirmed' ? 'confirmed' : 'new',
            ignoreDateRange: true, ignoreValidation: true, ignoreFreeSlotValidation: true,
            selectedTimezone: 'Europe/Amsterdam',
          };
          if (booking.ghl_event_id) {
            const res = await fetch(`${GHL_API_BASE}/calendars/events/appointments/${booking.ghl_event_id}`, { method: 'PUT', headers: ghlHeaders, body: JSON.stringify(payload) });
            success = res.ok;
            if (!res.ok) { const e = await res.text(); console.error(`[Queue] Update appointment failed: ${e}`); }
            else { await res.text(); }
          } else {
            const res = await fetch(`${GHL_API_BASE}/calendars/events/appointments`, { method: 'POST', headers: ghlHeaders, body: JSON.stringify(payload) });
            if (res.ok) {
              const created = await res.json();
              const ghlId = created.id || created.event?.id;
              if (ghlId) await supabase.from('bookings').update({ ghl_event_id: ghlId }).eq('id', booking.id);
              success = true;
            } else {
              const errText = await res.text();
              console.error(`[Queue] Create appointment failed: ${errText}`);
            }
          }
        } else if (item.entity_type === 'booking' && item.action_type === 'delete') {
          const ghlEventId = (item.payload as any)?.ghl_event_id;
          if (ghlEventId) { const res = await fetch(`${GHL_API_BASE}/calendars/events/appointments/${ghlEventId}`, { method: 'DELETE', headers: ghlHeaders }); success = res.ok || res.status === 404; await res.text(); }
          else { success = true; }
        } else if (item.entity_type === 'contact' && (item.action_type === 'create' || item.action_type === 'update')) {
          const { data: contact } = await supabase.from('contacts').select('*').eq('id', item.entity_id).single();
          if (!contact) { await supabase.from('sync_queue').delete().eq('id', item.id); continue; }
          const cPayload: Record<string, any> = { firstName: contact.first_name || 'Onbekend', lastName: contact.last_name || '', locationId };
          if (contact.email) cPayload.email = contact.email;
          if (contact.phone) cPayload.phone = contact.phone;
          if (contact.ghl_contact_id) {
            const res = await fetch(`${GHL_API_BASE}/contacts/${contact.ghl_contact_id}`, { method: 'PUT', headers: ghlHeaders, body: JSON.stringify(cPayload) });
            success = res.ok; await res.text();
          } else {
            const res = await fetch(`${GHL_API_BASE}/contacts/`, { method: 'POST', headers: ghlHeaders, body: JSON.stringify(cPayload) });
            if (res.ok) { const cd = await res.json(); if (cd.contact?.id) await supabase.from('contacts').update({ ghl_contact_id: cd.contact.id }).eq('id', contact.id); success = true; }
            else { await res.text(); }
          }
        } else if (item.entity_type === 'contact' && item.action_type === 'delete') {
          const ghlId = (item.payload as any)?.ghl_contact_id;
          if (ghlId) { const res = await fetch(`${GHL_API_BASE}/contacts/${ghlId}`, { method: 'DELETE', headers: ghlHeaders }); success = res.ok || res.status === 404; await res.text(); }
          else { success = true; }
        } else if (item.entity_type === 'company' && (item.action_type === 'create' || item.action_type === 'update')) {
          const { data: company } = await supabase.from('companies').select('*').eq('id', item.entity_id).single();
          if (!company) { await supabase.from('sync_queue').delete().eq('id', item.id); continue; }
          const coPayload: Record<string, any> = { name: company.name, locationId };
          if (company.ghl_company_id) {
            const res = await fetch(`${GHL_API_BASE}/companies/${company.ghl_company_id}`, { method: 'PUT', headers: ghlHeaders, body: JSON.stringify(coPayload) });
            success = res.ok; await res.text();
          } else {
            const res = await fetch(`${GHL_API_BASE}/companies/`, { method: 'POST', headers: ghlHeaders, body: JSON.stringify(coPayload) });
            if (res.ok) { const cd = await res.json(); if (cd.company?.id) await supabase.from('companies').update({ ghl_company_id: cd.company.id }).eq('id', company.id); success = true; }
            else { await res.text(); }
          }
        } else if (item.entity_type === 'task' && (item.action_type === 'create' || item.action_type === 'update')) {
          const { data: task } = await supabase.from('tasks').select('*').eq('id', item.entity_id).single();
          if (!task) { await supabase.from('sync_queue').delete().eq('id', item.id); continue; }
          let ghlContactId = null;
          if (task.contact_id) { const { data: c } = await supabase.from('contacts').select('ghl_contact_id').eq('id', task.contact_id).single(); ghlContactId = c?.ghl_contact_id; }
          const tPayload: Record<string, any> = {
            title: task.title || 'Taak',
            body: task.description || '',
            completed: task.status === 'completed',
          };
          if (task.due_date) tPayload.dueDate = task.due_date;
          if (!ghlContactId) {
            await supabase.from('sync_queue').update({ status: 'failed', last_error: 'Geen gekoppeld extern contact voor taak' }).eq('id', item.id);
            failed++;
            continue;
          }
          if (task.ghl_task_id) {
            const res = await fetch(`${GHL_API_BASE}/contacts/${ghlContactId}/tasks/${task.ghl_task_id}`, { method: 'PUT', headers: ghlHeaders, body: JSON.stringify(tPayload) });
            success = res.ok; await res.text();
          } else {
            const res = await fetch(`${GHL_API_BASE}/contacts/${ghlContactId}/tasks`, { method: 'POST', headers: ghlHeaders, body: JSON.stringify(tPayload) });
            if (res.ok) { const td = await res.json(); if (td.task?.id) await supabase.from('tasks').update({ ghl_task_id: td.task.id }).eq('id', task.id); success = true; }
            else { await res.text(); }
          }
        } else if (item.entity_type === 'inquiry' && (item.action_type === 'create' || item.action_type === 'update')) {
          const { data: inquiry } = await supabase.from('inquiries').select('*').eq('id', item.entity_id).single();
          if (!inquiry) { await supabase.from('sync_queue').delete().eq('id', item.id); continue; }
          const pipelinesRes = await fetch(`${GHL_API_BASE}/opportunities/pipelines?locationId=${locationId}`, { headers: ghlHeaders });
          if (pipelinesRes.ok) {
            const pData = await pipelinesRes.json();
            const pipeline = pData.pipelines?.[0];
            if (pipeline) {
              const stage = pipeline.stages?.[0];
              const oppPayload: Record<string, any> = {
                pipelineId: pipeline.id,
                pipelineStageId: stage?.id,
                name: inquiry.event_type || 'Aanvraag',
                locationId,
                status: 'open',
                contactId: null,
              };
              if (inquiry.budget) oppPayload.monetaryValue = inquiry.budget;
              if (inquiry.contact_id) {
                const { data: c } = await supabase.from('contacts').select('ghl_contact_id').eq('id', inquiry.contact_id).single();
                if (c?.ghl_contact_id) oppPayload.contactId = c.ghl_contact_id;
              }
              if (inquiry.ghl_opportunity_id) {
                const res = await fetch(`${GHL_API_BASE}/opportunities/${inquiry.ghl_opportunity_id}`, { method: 'PUT', headers: ghlHeaders, body: JSON.stringify(oppPayload) });
                success = res.ok; await res.text();
              } else if (oppPayload.contactId) {
                const res = await fetch(`${GHL_API_BASE}/opportunities/`, { method: 'POST', headers: ghlHeaders, body: JSON.stringify(oppPayload) });
                if (res.ok) { const od = await res.json(); if (od.opportunity?.id) await supabase.from('inquiries').update({ ghl_opportunity_id: od.opportunity.id }).eq('id', inquiry.id); success = true; }
                else { await res.text(); }
              } else {
                await supabase.from('sync_queue').update({ status: 'failed', last_error: 'Geen gekoppeld GHL-contact voor opportunity' }).eq('id', item.id);
                failed++; continue;
              }
            }
          }
        } else if (item.entity_type === 'inquiry' && item.action_type === 'delete') {
          const ghlOppId = (item.payload as any)?.ghl_opportunity_id;
          if (ghlOppId) { const res = await fetch(`${GHL_API_BASE}/opportunities/${ghlOppId}`, { method: 'DELETE', headers: ghlHeaders }); success = res.ok || res.status === 404; await res.text(); }
          else { success = true; }
        } else if (item.entity_type === 'task' && item.action_type === 'delete') {
          const ghlTaskId = (item.payload as any)?.ghl_task_id;
          const localContactId = (item.payload as any)?.contact_id;
          let ghlContactId = null;
          if (localContactId) { const { data: c } = await supabase.from('contacts').select('ghl_contact_id').eq('id', localContactId).maybeSingle(); ghlContactId = c?.ghl_contact_id; }
          if (ghlTaskId && ghlContactId) { const res = await fetch(`${GHL_API_BASE}/contacts/${ghlContactId}/tasks/${ghlTaskId}`, { method: 'DELETE', headers: ghlHeaders }); success = res.ok || res.status === 404; await res.text(); }
          else { success = true; }
        } else if (item.entity_type === 'company' && item.action_type === 'delete') {
          const ghlCompanyId = (item.payload as any)?.ghl_company_id;
          if (ghlCompanyId) { const res = await fetch(`${GHL_API_BASE}/companies/${ghlCompanyId}`, { method: 'DELETE', headers: ghlHeaders }); success = res.ok || res.status === 404; await res.text(); }
          else { success = true; }
        } else {
          console.log(`[Queue] Unknown type ${item.entity_type}/${item.action_type}, marking failed`);
        }

        if (success) {
          await supabase.from('sync_queue').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', item.id);
          succeeded++;
          console.log(`[Queue] ✓ ${item.entity_type}/${item.action_type} for ${item.entity_id}`);
        } else {
          const nr = (item.retry_count || 0) + 1;
          await supabase.from('sync_queue').update({ status: nr >= (item.max_retries || 5) ? 'failed' : 'pending', last_error: 'Sync failed', retry_count: nr }).eq('id', item.id);
          failed++;
        }
      } catch (err: any) {
        const nr = (item.retry_count || 0) + 1;
        await supabase.from('sync_queue').update({ status: nr >= (item.max_retries || 5) ? 'failed' : 'pending', last_error: err?.message || 'Unknown error', retry_count: nr }).eq('id', item.id);
        failed++;
      }
      await delay(200); // Minimal delay between queue items
    }
    console.log(`[Queue] Done: ${succeeded} succeeded, ${failed} failed`);
  } catch (e) { console.error('Queue processing error:', e); }
}

// === DOCUMENTS SYNC (GHL → CRM) ===
async function syncDocuments(supabase: any, ghlHeaders: any, locationId: string, userId: string, results: any) {
  try {
    // GHL Documents/Proposals search endpoint
    const searchUrl = `${GHL_API_BASE}/documents/search?locationId=${locationId}&limit=100`;
    const res = await fetch(searchUrl, { headers: ghlHeaders });
    
    if (!res.ok) {
      // Documents API may not be available on all GHL plans
      if (res.status === 404 || res.status === 403) {
        console.log('[Documents Sync] Documents API not available, skipping');
        return;
      }
      console.error(`[Documents Sync] Fetch failed: ${res.status}`);
      return;
    }

    const data = await res.json();
    const docs = data.documents || data.data || [];
    console.log(`[Documents Sync] Found ${docs.length} documents from GHL`);

    for (const doc of docs) {
      const ghlDocId = doc.id || doc.documentId;
      if (!ghlDocId) continue;

      const title = doc.title || doc.name || 'Document';
      const contactName = doc.contactName || doc.contact?.name || 'Onbekend';
      const amount = doc.amount || doc.total || doc.monetaryValue ? Number(doc.amount || doc.total || doc.monetaryValue) : null;
      const externalUrl = doc.url || doc.documentUrl || null;
      
      let docType = 'proposal';
      const typeStr = (doc.type || doc.documentType || '').toLowerCase();
      if (typeStr.includes('invoice')) docType = 'invoice';
      else if (typeStr.includes('estimate')) docType = 'estimate';
      else if (typeStr.includes('contract')) docType = 'contract';

      let status = 'sent';
      const statusStr = (doc.status || '').toLowerCase();
      if (statusStr.includes('signed') || statusStr.includes('accepted') || statusStr.includes('completed')) status = 'signed';
      else if (statusStr.includes('viewed') || statusStr.includes('opened')) status = 'viewed';
      else if (statusStr.includes('declined') || statusStr.includes('rejected')) status = 'declined';
      else if (statusStr.includes('paid')) status = 'paid';

      // Link to local contact
      let dbContactId: string | null = null;
      const ghlContactId = doc.contactId || doc.contact?.id;
      if (ghlContactId) {
        const { data: contactMatch } = await supabase.from('contacts').select('id').eq('ghl_contact_id', ghlContactId).maybeSingle();
        dbContactId = contactMatch?.id || null;
      }

      // Upsert into documents table
      const { error } = await supabase.from('documents').upsert({
        user_id: userId,
        ghl_document_id: ghlDocId,
        title,
        document_type: docType,
        status,
        contact_name: contactName,
        contact_id: dbContactId,
        amount,
        external_url: externalUrl,
        sent_at: doc.sentAt || doc.createdAt || new Date().toISOString(),
        viewed_at: doc.viewedAt || null,
        signed_at: doc.signedAt || doc.completedAt || null,
      }, { onConflict: 'ghl_document_id' });

      if (error) {
        console.error(`[Documents Sync] Upsert error for ${ghlDocId}:`, error.message);
      } else {
        results.documents_synced++;
      }
    }
    console.log(`[Documents Sync] Synced ${results.documents_synced} documents`);
  } catch (e) {
    console.error('[Documents Sync] Error:', e);
    results.errors.push(`documents: ${e}`);
  }
}
