import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const GHL_API_BASE = 'https://services.leadconnectorhq.com';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Rate-limit-aware fetch: retries on 429 with backoff */
async function ghlFetch(url: string, opts: RequestInit = {}): Promise<Response> {
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) {
      const backoff = Math.min(2000 * attempt, 10000);
      console.warn(`GHL retry attempt ${attempt}, waiting ${backoff}ms`);
      await delay(backoff);
    }
    const res = await fetch(url, opts);
    if (res.status !== 429) return res;
    // Consume body to free resources
    await res.text();
    const retryAfter = res.headers.get('retry-after');
    if (retryAfter) {
      await delay(parseInt(retryAfter) * 1000);
    }
  }
  throw new Error(`GHL API rate limit exceeded after 5 retries for ${url}`);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const GHL_API_KEY = Deno.env.get('GHL_API_KEY');
  if (!GHL_API_KEY) {
    return new Response(JSON.stringify({ error: 'GHL_API_KEY is not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const GHL_LOCATION_ID = Deno.env.get('GHL_LOCATION_ID');
  if (!GHL_LOCATION_ID) {
    return new Response(JSON.stringify({ error: 'GHL_LOCATION_ID is not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  try {
    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const anonClient = createClient(SUPABASE_URL, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: authUser }, error: authError } = await anonClient.auth.getUser();
    
    if (authError || !authUser) {
      console.error('Auth error:', authError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const user = { id: authUser.id };

    const body = await req.json();
    const { action } = body;

    const ghlHeaders = {
      'Authorization': `Bearer ${GHL_API_KEY}`,
      'Content-Type': 'application/json',
      'Version': '2021-07-28',
    };

    if (action === 'sync-contacts') {
      // Paginated sync: fetch one page at a time, caller passes nextPageUrl
      const limit = body.limit || 50;
      const pageUrl = body.nextPageUrl || `${GHL_API_BASE}/contacts/?locationId=${GHL_LOCATION_ID}&limit=${limit}`;

      const res = await ghlFetch(pageUrl, { headers: ghlHeaders });
      if (!res.ok) {
        const errText = await res.text();
        return new Response(JSON.stringify({ success: false, error: `GHL fetch failed [${res.status}]: ${errText}` }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const data = await res.json();
      const contacts = data.contacts || [];
      const nextPageUrl = data.meta?.nextPageUrl || null;

      // Upsert this page of contacts
      let synced = 0;
      for (const ghlContact of contacts) {
        const firstName = ghlContact.firstName || ghlContact.name?.split(' ')[0] || 'Onbekend';
        const lastName = ghlContact.lastName || ghlContact.name?.split(' ').slice(1).join(' ') || '';

        const { data: existing } = await supabase
          .from('contacts')
          .select('id')
          .eq('user_id', user.id)
          .eq('ghl_contact_id', ghlContact.id)
          .maybeSingle();

        if (existing) {
          await supabase.from('contacts').update({
            first_name: firstName,
            last_name: lastName,
            email: ghlContact.email || null,
            phone: ghlContact.phone || null,
            company: ghlContact.companyName || null,
          }).eq('id', existing.id);
        } else {
          await supabase.from('contacts').insert({
            user_id: user.id,
            ghl_contact_id: ghlContact.id,
            first_name: firstName,
            last_name: lastName,
            email: ghlContact.email || null,
            phone: ghlContact.phone || null,
            company: ghlContact.companyName || null,
            status: 'lead',
          });
        }
        synced++;
      }

      return new Response(JSON.stringify({ success: true, synced, pageContacts: contacts.length, nextPageUrl, hasMore: !!nextPageUrl }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'push-contacts') {
      // Push local contacts to GHL
      const { data: localContacts } = await supabase
        .from('contacts')
        .select('*')
        .eq('user_id', user.id);

      let pushed = 0;
      for (const contact of localContacts || []) {
        const ghlPayload: Record<string, any> = {
          firstName: contact.first_name || 'Onbekend',
          lastName: contact.last_name || '',
          locationId: GHL_LOCATION_ID,
        };
        if (contact.email) ghlPayload.email = contact.email;
        if (contact.phone) ghlPayload.phone = contact.phone;
        if (contact.company) ghlPayload.companyName = contact.company;

        if (contact.ghl_contact_id) {
          // Update existing GHL contact
          const res = await ghlFetch(`${GHL_API_BASE}/contacts/${contact.ghl_contact_id}`, {
            method: 'PUT',
            headers: ghlHeaders,
            body: JSON.stringify(ghlPayload),
          });
          if (!res.ok) {
            const errText = await res.text();
            console.error(`Failed to update GHL contact ${contact.ghl_contact_id}: [${res.status}] ${errText}`);
          }
        } else {
          // Create new GHL contact
          const res = await ghlFetch(`${GHL_API_BASE}/contacts/`, {
            method: 'POST',
            headers: ghlHeaders,
            body: JSON.stringify(ghlPayload),
          });
          if (res.ok) {
            const created = await res.json();
            if (created.contact?.id) {
              await supabase.from('contacts').update({
                ghl_contact_id: created.contact.id,
              }).eq('id', contact.id);
            }
          } else {
            const errText = await res.text();
            console.error(`Failed to create GHL contact: [${res.status}] ${errText}`);
          }
        }
        pushed++;
      }

      return new Response(JSON.stringify({ success: true, pushed }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'sync-calendars') {
      // Fetch all calendars first
      const calRes = await ghlFetch(`${GHL_API_BASE}/calendars/?locationId=${GHL_LOCATION_ID}`, {
        headers: ghlHeaders,
      });
      if (!calRes.ok) {
        const errText = await calRes.text();
        throw new Error(`GHL calendars fetch failed [${calRes.status}]: ${errText}`);
      }
      const calData = await calRes.json();
      const calendars = calData.calendars || [];
      console.log(`Found ${calendars.length} calendars:`, calendars.map((c: any) => c.name));

      // Build room_name -> ghl_calendar_id mapping from room_settings
      const { data: roomMappings } = await supabase
        .from('room_settings')
        .select('room_name, ghl_calendar_id')
        .eq('user_id', user.id)
        .not('ghl_calendar_id', 'is', null);
      
      const calIdToRoom: Record<string, string> = {};
      for (const rm of roomMappings || []) {
        if (rm.ghl_calendar_id) calIdToRoom[rm.ghl_calendar_id] = rm.room_name;
      }

      // Fetch events from each calendar (past 365 days + next 365 days for complete import)
      const now = new Date();
      const startDateCal = new Date(now);
      startDateCal.setDate(startDateCal.getDate() - 365);
      const startTimeMs = String(startDateCal.getTime());
      const endDate = new Date(now);
      endDate.setDate(endDate.getDate() + 365);
      const endTimeMs = String(endDate.getTime());

      // Calendar events endpoint requires Version 2021-04-15 and times in milliseconds
      const calEventHeaders = { ...ghlHeaders, 'Version': '2021-04-15' };

      // Default room for unmapped calendars
      const defaultRoom = body.defaultRoom || 'Ontmoeten Aan de Donge';

      let allEvents: any[] = [];
      for (const cal of calendars) {
        const eventsUrl = `${GHL_API_BASE}/calendars/events?locationId=${GHL_LOCATION_ID}&calendarId=${cal.id}&startTime=${startTimeMs}&endTime=${endTimeMs}`;
        console.log(`Fetching events for calendar "${cal.name}" (${cal.id})`);
        const eventsRes = await ghlFetch(eventsUrl, { headers: calEventHeaders });
        if (eventsRes.ok) {
          const eventsData = await eventsRes.json();
          console.log(`Calendar "${cal.name}": events count: ${(eventsData.events || []).length}`);
          allEvents = allEvents.concat((eventsData.events || []).map((e: any) => ({ ...e, calendarName: cal.name, calendarId: cal.id })));
        } else {
          const errText = await eventsRes.text();
          console.warn(`Failed to fetch events for calendar ${cal.name} [${eventsRes.status}]: ${errText}`);
        }
      }

      // Upsert events as bookings
      let synced = 0;
      let skipped = 0;
      for (const evt of allEvents) {
        const evtStart = new Date(evt.startTime || evt.start);
        const evtEnd = new Date(evt.endTime || evt.end);
        // Use local date components to avoid UTC shift
        const dateStr = `${evtStart.getFullYear()}-${String(evtStart.getMonth() + 1).padStart(2, '0')}-${String(evtStart.getDate()).padStart(2, '0')}`;
        const startHour = evtStart.getHours();
        const startMinute = evtStart.getMinutes();
        const endHour = evtEnd.getHours() || 17;
        const endMinute = evtEnd.getMinutes();
        const contactName = evt.contact?.name || evt.title || 'GHL Afspraak';
        const title = evt.title || evt.calendarName || 'GHL Afspraak';
        const status = (evt.status === 'confirmed' || evt.appointmentStatus === 'confirmed') ? 'confirmed' : 'option';

        // Determine room: use mapping if available, otherwise default
        const roomName = calIdToRoom[evt.calendarId] || defaultRoom;

        const { data: existing } = await supabase
          .from('bookings')
          .select('id, room_name')
          .eq('user_id', user.id)
          .eq('ghl_event_id', evt.id)
          .maybeSingle();

        if (existing) {
          // Update existing but keep the room assignment (user may have moved it)
          await supabase.from('bookings').update({
            date: dateStr,
            start_hour: startHour,
            start_minute: startMinute,
            end_hour: endHour,
            end_minute: endMinute,
            title,
            contact_name: contactName,
            status,
          }).eq('id', existing.id);
        } else {
          await supabase.from('bookings').insert({
            user_id: user.id,
            ghl_event_id: evt.id,
            room_name: roomName,
            date: dateStr,
            start_hour: startHour,
            start_minute: startMinute,
            end_hour: endHour,
            end_minute: endMinute,
            title,
            contact_name: contactName,
            status,
          });
        }
        synced++;
      }

      return new Response(JSON.stringify({ success: true, synced, skipped, totalEvents: allEvents.length, calendars: calendars.length, defaultRoom }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'sync-opportunities') {
      // First get pipelines to map stage IDs to names
      const pipelinesRes = await ghlFetch(`${GHL_API_BASE}/opportunities/pipelines?locationId=${GHL_LOCATION_ID}`, {
        headers: ghlHeaders,
      });
      if (!pipelinesRes.ok) {
        const errText = await pipelinesRes.text();
        throw new Error(`GHL pipelines fetch failed [${pipelinesRes.status}]: ${errText}`);
      }
      const pipelinesData = await pipelinesRes.json();
      
      // Build stage name lookup
      const stageMap: Record<string, string> = {};
      for (const pipeline of pipelinesData.pipelines || []) {
        for (const stage of pipeline.stages || []) {
          stageMap[stage.id] = stage.name;
        }
      }

      // Map GHL stage names to CRM statuses
      const stageToStatus = (stageName: string): string => {
        const lower = stageName.toLowerCase();
        if (lower.includes('nieuwe aanvraag') || lower.includes('new')) return 'new';
        if (lower.includes('lopend contact') || lower.includes('contact')) return 'contacted';
        if (lower.includes('optie')) return 'option';
        if (lower.includes('aangepaste offerte') || lower.includes('adjusted')) return 'quote_revised';
        if (lower.includes('offerte verzonden') || lower.includes('offerte')) return 'quoted';
        if (lower.includes('definitieve reservering') || lower.includes('definitief')) return 'confirmed';
        if (lower.includes('reservering')) return 'reserved';
        if (lower.includes('facturatie') || lower.includes('invoice')) return 'invoiced';
        if (lower.includes('vervallen') || lower.includes('verloren') || lower.includes('lost')) return 'lost';
        if (lower.includes('after sales') || lower.includes('aftersales')) return 'after_sales';
        return 'new';
      };

      // Fetch all opportunities
      let allOpportunities: any[] = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const res = await ghlFetch(
          `${GHL_API_BASE}/opportunities/search?location_id=${GHL_LOCATION_ID}&limit=100&page=${page}`,
          { headers: ghlHeaders }
        );
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`GHL opportunities fetch failed [${res.status}]: ${errText}`);
        }
        const data = await res.json();
        const opps = data.opportunities || [];
        allOpportunities = allOpportunities.concat(opps);
        hasMore = opps.length === 100;
        page++;
      }

      let synced = 0;
      for (const opp of allOpportunities) {
        const stageName = stageMap[opp.pipelineStageId] || opp.status || 'new';
        const crmStatus = stageToStatus(stageName);
        const contactName = opp.contact?.name || opp.name || 'Onbekend';
        const monetaryValue = opp.monetaryValue ? Number(opp.monetaryValue) : null;

        // Check if opportunity already exists
        const { data: existing } = await supabase
          .from('inquiries')
          .select('id')
          .eq('user_id', user.id)
          .eq('ghl_opportunity_id', opp.id)
          .maybeSingle();

        if (existing) {
          await supabase.from('inquiries').update({
            contact_name: contactName,
            status: crmStatus,
            budget: monetaryValue,
            event_type: opp.name || 'Onbekend',
          }).eq('id', existing.id);
        } else {
          await supabase.from('inquiries').insert({
            user_id: user.id,
            ghl_opportunity_id: opp.id,
            contact_name: contactName,
            contact_id: null,
            event_type: opp.name || 'Onbekend',
            status: crmStatus,
            guest_count: 0,
            budget: monetaryValue,
            source: 'GHL',
            message: opp.notes || null,
            preferred_date: opp.date || null,
            room_preference: null,
          });
        }
        synced++;
      }

      return new Response(JSON.stringify({ success: true, synced, total: allOpportunities.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'full-sync') {
      // Pull contacts from GHL
      let allContacts: any[] = [];
      let nextPageUrl: string | null = `${GHL_API_BASE}/contacts/?locationId=${GHL_LOCATION_ID}&limit=100`;

      while (nextPageUrl) {
        await delay(500);
        const res = await ghlFetch(nextPageUrl, { headers: ghlHeaders });
        if (!res.ok) {
          console.error(`GHL contacts fetch failed [${res.status}]`);
          break;
        }
        const data = await res.json();
        allContacts = allContacts.concat(data.contacts || []);
        nextPageUrl = data.meta?.nextPageUrl || null;
      }

      let contactsSynced = 0;
      for (const ghlContact of allContacts) {
        const firstName = ghlContact.firstName || ghlContact.name?.split(' ')[0] || 'Onbekend';
        const lastName = ghlContact.lastName || ghlContact.name?.split(' ').slice(1).join(' ') || '';

        const { data: existing } = await supabase
          .from('contacts')
          .select('id')
          .eq('user_id', user.id)
          .eq('ghl_contact_id', ghlContact.id)
          .maybeSingle();

        if (existing) {
          await supabase.from('contacts').update({
            first_name: firstName,
            last_name: lastName,
            email: ghlContact.email || null,
            phone: ghlContact.phone || null,
            company: ghlContact.companyName || null,
          }).eq('id', existing.id);
        } else {
          await supabase.from('contacts').insert({
            user_id: user.id,
            ghl_contact_id: ghlContact.id,
            first_name: firstName,
            last_name: lastName,
            email: ghlContact.email || null,
            phone: ghlContact.phone || null,
            company: ghlContact.companyName || null,
            status: 'lead',
          });
        }
        contactsSynced++;
      }

      // Push local contacts without GHL ID to GHL
      const { data: localOnly } = await supabase
        .from('contacts')
        .select('*')
        .eq('user_id', user.id)
        .is('ghl_contact_id', null);

      let contactsPushed = 0;
      for (const contact of localOnly || []) {
        const ghlPayload: Record<string, any> = {
          firstName: contact.first_name || 'Onbekend',
          lastName: contact.last_name || '',
          locationId: GHL_LOCATION_ID,
        };
        if (contact.email) ghlPayload.email = contact.email;
        if (contact.phone) ghlPayload.phone = contact.phone;
        if (contact.company) ghlPayload.companyName = contact.company;
        const res = await ghlFetch(`${GHL_API_BASE}/contacts/`, {
          method: 'POST',
          headers: ghlHeaders,
          body: JSON.stringify(ghlPayload),
        });
        if (res.ok) {
          const created = await res.json();
          if (created.contact?.id) {
            await supabase.from('contacts').update({
              ghl_contact_id: created.contact.id,
            }).eq('id', contact.id);
          }
          contactsPushed++;
        } else {
          const errText = await res.text();
          console.error(`Failed to push contact to GHL: [${res.status}] ${errText}`);
        }
      }

      // Also sync opportunities
      let oppsSynced = 0;
      try {
        const pipelinesRes = await ghlFetch(`${GHL_API_BASE}/opportunities/pipelines?locationId=${GHL_LOCATION_ID}`, {
          headers: ghlHeaders,
        });
        if (pipelinesRes.ok) {
          const pipelinesData = await pipelinesRes.json();
          const stageMap: Record<string, string> = {};
          for (const pipeline of pipelinesData.pipelines || []) {
            for (const stage of pipeline.stages || []) {
              stageMap[stage.id] = stage.name;
            }
          }

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

          let allOpps: any[] = [];
          let oppPage = 1;
          let oppHasMore = true;
          while (oppHasMore) {
            const res = await ghlFetch(
              `${GHL_API_BASE}/opportunities/search?location_id=${GHL_LOCATION_ID}&limit=100&page=${oppPage}`,
              { headers: ghlHeaders }
            );
            if (!res.ok) break;
            const data = await res.json();
            const opps = data.opportunities || [];
            allOpps = allOpps.concat(opps);
            oppHasMore = opps.length === 100;
            oppPage++;
          }

          for (const opp of allOpps) {
            const stageName = stageMap[opp.pipelineStageId] || opp.status || 'new';
            const crmStatus = stageToStatus(stageName);
            const contactName = opp.contact?.name || opp.name || 'Onbekend';
            const monetaryValue = opp.monetaryValue ? Number(opp.monetaryValue) : null;

            const { data: existing } = await supabase
              .from('inquiries')
              .select('id')
              .eq('user_id', user.id)
              .eq('ghl_opportunity_id', opp.id)
              .maybeSingle();

            if (existing) {
              await supabase.from('inquiries').update({
                contact_name: contactName,
                status: crmStatus,
                budget: monetaryValue,
                event_type: opp.name || 'Onbekend',
              }).eq('id', existing.id);
            } else {
              await supabase.from('inquiries').insert({
                user_id: user.id,
                ghl_opportunity_id: opp.id,
                contact_name: contactName,
                contact_id: null,
                event_type: opp.name || 'Onbekend',
                status: crmStatus,
                guest_count: 0,
                budget: monetaryValue,
                source: 'GHL',
                message: opp.notes || null,
                preferred_date: opp.date || null,
                room_preference: null,
              });
            }
            oppsSynced++;
          }
        }
      } catch (oppErr) {
        console.error('Opportunity sync error during full-sync:', oppErr);
      }

      // Also sync calendar events as bookings
      let bookingsSynced = 0;
      try {
        const calRes = await ghlFetch(`${GHL_API_BASE}/calendars/?locationId=${GHL_LOCATION_ID}`, { headers: ghlHeaders });
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
            const eventsRes = await ghlFetch(
              `${GHL_API_BASE}/calendars/events?locationId=${GHL_LOCATION_ID}&calendarId=${cal.id}&startTime=${encodeURIComponent(startTime)}&endTime=${encodeURIComponent(endTime)}`,
              { headers: ghlHeaders }
            );
            if (eventsRes.ok) {
              const eventsData = await eventsRes.json();
              allEvents = allEvents.concat((eventsData.events || []).map((e: any) => ({ ...e, calendarName: cal.name })));
            }
          }

          for (const evt of allEvents) {
          const evtStart = new Date(evt.startTime || evt.start);
            const evtEnd = new Date(evt.endTime || evt.end);
            // Use Amsterdam timezone for correct local time
            const startStr = evtStart.toLocaleString('en-US', { timeZone: 'Europe/Amsterdam', hour12: false });
            const startD = new Date(startStr);
            const dateStr = `${startD.getFullYear()}-${String(startD.getMonth() + 1).padStart(2, '0')}-${String(startD.getDate()).padStart(2, '0')}`;
            const startHour = startD.getHours();
            const startMinute = startD.getMinutes();
            const endStr = evtEnd.toLocaleString('en-US', { timeZone: 'Europe/Amsterdam', hour12: false });
            const endD = new Date(endStr);
            const endHour = isNaN(evtEnd.getTime()) ? 17 : endD.getHours();
            const endMinute = isNaN(evtEnd.getTime()) ? 0 : endD.getMinutes();
            const contactName = evt.contact?.name || evt.title || 'GHL Afspraak';
            const title = evt.title || evt.calendarName || 'GHL Afspraak';
            const evtStatus = (evt.status === 'confirmed' || evt.appointmentStatus === 'confirmed') ? 'confirmed' : 'option';

            const { data: existing } = await supabase
              .from('bookings')
              .select('id')
              .eq('user_id', user.id)
              .eq('ghl_event_id', evt.id)
              .maybeSingle();

            if (existing) {
              await supabase.from('bookings').update({
                date: dateStr,
                start_hour: startHour,
                start_minute: startMinute,
                end_hour: endHour,
                end_minute: endMinute,
                title,
                contact_name: contactName,
                status: evtStatus,
              }).eq('id', existing.id);
            } else {
              await supabase.from('bookings').insert({
                user_id: user.id,
                ghl_event_id: evt.id,
                room_name: evt.calendarName || 'Vergaderzaal 100',
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
            bookingsSynced++;
          }
        }
      } catch (calErr) {
        console.error('Calendar sync error during full-sync:', calErr);
      }

      return new Response(JSON.stringify({
        success: true,
        contactsSynced,
        contactsPushed,
        totalGhlContacts: allContacts.length,
        opportunitiesSynced: oppsSynced,
        bookingsSynced,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // === INDIVIDUAL PUSH ACTIONS (CRM → GHL) ===

    if (action === 'push-contact') {
      const { contact } = body;
      if (!contact) {
        return new Response(JSON.stringify({ error: 'contact data required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const ghlPayload = {
        firstName: contact.first_name,
        lastName: contact.last_name,
        email: contact.email || undefined,
        phone: contact.phone || undefined,
        companyName: contact.company || undefined,
        locationId: GHL_LOCATION_ID,
      };

      if (contact.ghl_contact_id) {
        // Update existing GHL contact
        const res = await ghlFetch(`${GHL_API_BASE}/contacts/${contact.ghl_contact_id}`, {
          method: 'PUT', headers: ghlHeaders, body: JSON.stringify(ghlPayload),
        });
        return new Response(JSON.stringify({ success: res.ok, action: 'updated' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } else {
        // Create new GHL contact
        const res = await ghlFetch(`${GHL_API_BASE}/contacts/`, {
          method: 'POST', headers: ghlHeaders, body: JSON.stringify(ghlPayload),
        });
        if (res.ok) {
          const created = await res.json();
          if (created.contact?.id && contact.id) {
            await supabase.from('contacts').update({ ghl_contact_id: created.contact.id }).eq('id', contact.id);
          }
          return new Response(JSON.stringify({ success: true, action: 'created', ghl_contact_id: created.contact?.id }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ success: false, error: await res.text() }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (action === 'delete-contact') {
      const { ghl_contact_id } = body;
      if (ghl_contact_id) {
        const res = await ghlFetch(`${GHL_API_BASE}/contacts/${ghl_contact_id}`, {
          method: 'DELETE', headers: ghlHeaders,
        });
        return new Response(JSON.stringify({ success: res.ok }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ success: true, skipped: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'push-booking') {
      const { booking } = body;
      if (!booking) {
        return new Response(JSON.stringify({ error: 'booking data required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Try to find room-specific GHL calendar ID from room_settings
      let calendarId: string | null = null;
      if (booking.room_name) {
        const { data: roomSetting } = await supabase
          .from('room_settings')
          .select('ghl_calendar_id')
          .eq('user_id', user.id)
          .eq('room_name', booking.room_name)
          .maybeSingle();
        calendarId = roomSetting?.ghl_calendar_id || null;
      }

      // Fallback: get first available calendar
      if (!calendarId) {
        const calRes = await ghlFetch(`${GHL_API_BASE}/calendars/?locationId=${GHL_LOCATION_ID}`, { headers: ghlHeaders });
        const calData = calRes.ok ? await calRes.json() : { calendars: [] };
        calendarId = calData.calendars?.[0]?.id || null;
      }
      if (!calendarId) {
        return new Response(JSON.stringify({ success: false, error: 'No GHL calendar found' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const startTime = `${booking.date}T${String(booking.start_hour).padStart(2, '0')}:${String(booking.start_minute || 0).padStart(2, '0')}:00+01:00`;
      const endTime = `${booking.date}T${String(booking.end_hour).padStart(2, '0')}:${String(booking.end_minute || 0).padStart(2, '0')}:00+01:00`;

      // Try to find the GHL contact ID for this booking's contact
      let ghlContactId: string | null = null;
      if (booking.contact_id) {
        const { data: contactRow } = await supabase.from('contacts').select('ghl_contact_id').eq('id', booking.contact_id).maybeSingle();
        ghlContactId = contactRow?.ghl_contact_id || null;
      }

      if (!ghlContactId) {
        console.info(`Skip push booking ${booking.id}: no GHL contact linked`);
        return new Response(JSON.stringify({ success: false, warning: 'No GHL contact linked to this booking' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // GHL Create Appointment API requires Version 2021-04-15 and ignoreFreeSlotValidation
      const appointmentHeaders = { ...ghlHeaders, 'Version': '2021-04-15' };
      const eventPayload: Record<string, any> = {
        calendarId,
        locationId: GHL_LOCATION_ID,
        contactId: ghlContactId,
        title: booking.title,
        startTime,
        endTime,
        appointmentStatus: booking.status === 'confirmed' ? 'confirmed' : 'new',
        ignoreDateRange: true,
        ignoreFreeSlotValidation: true,
        toNotify: false,
      };

      console.log('GHL push-booking payload:', JSON.stringify(eventPayload));

      if (booking.ghl_event_id) {
        const res = await ghlFetch(`${GHL_API_BASE}/calendars/events/appointments/${booking.ghl_event_id}`, {
          method: 'PUT', headers: appointmentHeaders, body: JSON.stringify(eventPayload),
        });
        if (!res.ok) {
          const errText = await res.text();
          console.warn(`GHL push-booking update failed [${res.status}]: ${errText}`);
        }
        return new Response(JSON.stringify({ success: res.ok, action: 'updated' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } else {
        const res = await ghlFetch(`${GHL_API_BASE}/calendars/events/appointments`, {
          method: 'POST', headers: appointmentHeaders, body: JSON.stringify(eventPayload),
        });
        if (res.ok) {
          const created = await res.json();
          const eventId = created.id || created.event?.id;
          if (eventId && booking.id) {
            await supabase.from('bookings').update({ ghl_event_id: eventId }).eq('id', booking.id);
          }
          console.log('GHL push-booking success:', JSON.stringify(created));
          return new Response(JSON.stringify({ success: true, action: 'created', ghl_event_id: eventId }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const errText = await res.text();
        console.warn(`GHL push-booking failed [${res.status}]: ${errText}`);
        return new Response(JSON.stringify({ success: false, warning: 'GHL rejected booking, saved locally', detail: errText }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (action === 'delete-booking') {
      const { ghl_event_id } = body;
      if (ghl_event_id) {
        const res = await ghlFetch(`${GHL_API_BASE}/calendars/events/appointments/${ghl_event_id}`, {
          method: 'DELETE', headers: ghlHeaders,
        });
        return new Response(JSON.stringify({ success: res.ok }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ success: true, skipped: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'push-inquiry') {
      // Create a new opportunity in GHL from a local inquiry
      const { inquiry_id, contact_name, event_type, budget, status, message } = body;
      if (!inquiry_id) {
        return new Response(JSON.stringify({ error: 'inquiry_id required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get pipelines to find the right stage
      const pipelinesRes = await ghlFetch(`${GHL_API_BASE}/opportunities/pipelines?locationId=${GHL_LOCATION_ID}`, { headers: ghlHeaders });
      if (!pipelinesRes.ok) {
        return new Response(JSON.stringify({ success: false, error: 'Cannot fetch pipelines' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const pipelinesData = await pipelinesRes.json();
      const pipeline = pipelinesData.pipelines?.[0];
      if (!pipeline) {
        return new Response(JSON.stringify({ success: false, error: 'No pipeline found' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Map CRM status to GHL stage
      const statusToStageName: Record<string, string> = {
        'new': 'Nieuwe Aanvraag', 'contacted': 'Lopend contact', 'option': 'Optie',
        'quoted': 'Offerte Verzonden', 'quote_revised': 'Aangepaste offerte verzonden',
        'reserved': 'Reservering', 'script': 'Draaiboek maken',
        'confirmed': 'Definitieve Reservering',
        'invoiced': 'Facturatie', 'lost': 'Vervallen / Verloren', 'after_sales': 'After Sales',
        'converted': 'Evenement',
      };
      const targetStageName = statusToStageName[status || 'new'] || 'Nieuwe Aanvraag';
      let targetStageId = pipeline.stages?.[0]?.id; // default to first stage
      for (const stage of pipeline.stages || []) {
        if (stage.name.toLowerCase().includes(targetStageName.toLowerCase())) {
          targetStageId = stage.id;
          break;
        }
      }

      // Try to find or create a GHL contact for this inquiry
      let ghlContactId = null;
      // Check if inquiry has a linked contact with ghl_contact_id
      const { data: inquiry } = await supabase.from('inquiries').select('contact_id').eq('id', inquiry_id).maybeSingle();
      if (inquiry?.contact_id) {
        const { data: contact } = await supabase.from('contacts').select('ghl_contact_id').eq('id', inquiry.contact_id).maybeSingle();
        ghlContactId = contact?.ghl_contact_id || null;
      }
      // If no GHL contact, search by name
      if (!ghlContactId && contact_name) {
        const searchRes = await ghlFetch(`${GHL_API_BASE}/contacts/?locationId=${GHL_LOCATION_ID}&query=${encodeURIComponent(contact_name)}&limit=1`, { headers: ghlHeaders });
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          ghlContactId = searchData.contacts?.[0]?.id || null;
        }
      }
      // If still no contact, create one
      if (!ghlContactId) {
        const nameParts = (contact_name || 'Onbekend').split(' ');
        const createRes = await ghlFetch(`${GHL_API_BASE}/contacts/`, {
          method: 'POST', headers: ghlHeaders,
          body: JSON.stringify({ firstName: nameParts[0], lastName: nameParts.slice(1).join(' ') || '', locationId: GHL_LOCATION_ID }),
        });
        if (createRes.ok) {
          const created = await createRes.json();
          ghlContactId = created.contact?.id || null;
        }
      }

      const oppPayload: any = {
        pipelineId: pipeline.id,
        pipelineStageId: targetStageId,
        locationId: GHL_LOCATION_ID,
        name: event_type || 'CRM Aanvraag',
        status: status === 'lost' ? 'lost' : (status === 'confirmed' || status === 'converted') ? 'won' : 'open',
        monetaryValue: budget || 0,
      };
      if (ghlContactId) oppPayload.contactId = ghlContactId;

      const res = await ghlFetch(`${GHL_API_BASE}/opportunities/`, {
        method: 'POST', headers: ghlHeaders, body: JSON.stringify(oppPayload),
      });

      if (res.ok) {
        const created = await res.json();
        const ghlOppId = created.opportunity?.id || created.id;
        if (ghlOppId) {
          await supabase.from('inquiries').update({ ghl_opportunity_id: ghlOppId }).eq('id', inquiry_id);
        }
        return new Response(JSON.stringify({ success: true, action: 'created', ghl_opportunity_id: ghlOppId }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errText = await res.text();
      console.error('Failed to create GHL opportunity:', errText);
      return new Response(JSON.stringify({ success: false, error: errText }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'push-inquiry-status') {
      const { ghl_opportunity_id, status, name, monetary_value } = body;
      if (!ghl_opportunity_id) {
        return new Response(JSON.stringify({ success: true, skipped: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get pipelines to find stage ID from status name
      const pipelinesRes = await ghlFetch(`${GHL_API_BASE}/opportunities/pipelines?locationId=${GHL_LOCATION_ID}`, { headers: ghlHeaders });
      if (!pipelinesRes.ok) {
        return new Response(JSON.stringify({ success: false, error: 'Cannot fetch pipelines' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const pipelinesData = await pipelinesRes.json();

      // Map CRM status back to GHL stage
      const statusToStageName: Record<string, string> = {
        'new': 'Nieuwe Aanvraag',
        'contacted': 'Lopend contact',
        'option': 'Optie',
        'quoted': 'Offerte Verzonden',
        'quote_revised': 'Aangepaste offerte verzonden',
        'reserved': 'Reservering',
        'script': 'Draaiboek maken',
        'confirmed': 'Definitieve Reservering',
        'invoiced': 'Facturatie',
        'lost': 'Vervallen / Verloren',
        'after_sales': 'After Sales',
        'converted': 'Evenement',
      };

      const targetStageName = statusToStageName[status] || 'Nieuwe Aanvraag';
      let targetStageId = null;
      let targetPipelineId = null;

      for (const pipeline of pipelinesData.pipelines || []) {
        for (const stage of pipeline.stages || []) {
          if (stage.name.toLowerCase().includes(targetStageName.toLowerCase())) {
            targetStageId = stage.id;
            targetPipelineId = pipeline.id;
            break;
          }
        }
        if (targetStageId) break;
      }

      const updatePayload: any = {};
      if (targetStageId) updatePayload.pipelineStageId = targetStageId;
      if (targetPipelineId) updatePayload.pipelineId = targetPipelineId;
      if (name) updatePayload.name = name;
      if (monetary_value !== undefined) updatePayload.monetaryValue = monetary_value;
      if (status === 'lost') updatePayload.status = 'lost';
      else if (status === 'converted' || status === 'confirmed') updatePayload.status = 'won';
      else updatePayload.status = 'open';

      const res = await ghlFetch(`${GHL_API_BASE}/opportunities/${ghl_opportunity_id}`, {
        method: 'PUT', headers: ghlHeaders, body: JSON.stringify(updatePayload),
      });

      return new Response(JSON.stringify({ success: res.ok, action: 'updated', targetStage: targetStageName }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Task sync actions ──
    if (action === 'push-task') {
      const { task } = body;
      if (!task) {
        return new Response(JSON.stringify({ error: 'Missing task data' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Find contact GHL ID if linked
      let contactId = null;
      if (task.contact_id) {
        const { data: contact } = await supabase.from('contacts').select('ghl_contact_id').eq('id', task.contact_id).maybeSingle();
        contactId = contact?.ghl_contact_id || null;
      }

      const ghlPayload: any = {
        title: task.title,
        body: task.description || '',
        dueDate: task.due_date || new Date().toISOString(),
        completed: task.status === 'completed',
        locationId: GHL_LOCATION_ID,
      };
      if (contactId) ghlPayload.contactId = contactId;

      if (task.ghl_task_id) {
        // Update existing GHL task
        const res = await ghlFetch(`${GHL_API_BASE}/contacts/${contactId || 'none'}/tasks/${task.ghl_task_id}`, {
          method: 'PUT', headers: ghlHeaders, body: JSON.stringify(ghlPayload),
        });
        return new Response(JSON.stringify({ success: res.ok, action: 'task-updated' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } else {
        // Create new GHL task (requires a contact)
        if (contactId) {
          const res = await ghlFetch(`${GHL_API_BASE}/contacts/${contactId}/tasks`, {
            method: 'POST', headers: ghlHeaders, body: JSON.stringify(ghlPayload),
          });
          if (res.ok) {
            const created = await res.json();
            if (created.task?.id) {
              await supabase.from('tasks').update({ ghl_task_id: created.task.id }).eq('id', task.id);
            }
          }
          return new Response(JSON.stringify({ success: res.ok, action: 'task-created' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ success: true, action: 'task-created-local-only', note: 'No GHL contact linked' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (action === 'delete-task') {
      const { ghl_task_id } = body;
      // GHL task deletion requires contact context; fire-and-forget
      return new Response(JSON.stringify({ success: true, action: 'task-delete-noted', ghl_task_id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'sync-tasks') {
      // Fetch tasks from GHL contacts
      const { data: contacts } = await supabase.from('contacts').select('id, ghl_contact_id').eq('user_id', user.id).not('ghl_contact_id', 'is', null);
      
      let synced = 0;
      for (const contact of contacts || []) {
        try {
          const res = await ghlFetch(`${GHL_API_BASE}/contacts/${contact.ghl_contact_id}/tasks`, { headers: ghlHeaders });
          if (!res.ok) continue;
          const data = await res.json();
          for (const ghlTask of data.tasks || []) {
            const { data: existing } = await supabase.from('tasks').select('id').eq('user_id', user.id).eq('ghl_task_id', ghlTask.id).maybeSingle();
            
            const taskRow = {
              title: ghlTask.title || 'GHL Taak',
              description: ghlTask.body || null,
              status: ghlTask.completed ? 'completed' : 'open',
              priority: 'normal',
              due_date: ghlTask.dueDate ? ghlTask.dueDate.split('T')[0] : null,
              contact_id: contact.id,
              ghl_task_id: ghlTask.id,
              completed_at: ghlTask.completed ? (ghlTask.completedDate || new Date().toISOString()) : null,
            };

            if (existing) {
              await supabase.from('tasks').update(taskRow).eq('id', existing.id);
            } else {
              await supabase.from('tasks').insert({ ...taskRow, user_id: user.id });
            }
            synced++;
          }
        } catch (e) {
          console.error(`Failed to sync tasks for contact ${contact.ghl_contact_id}:`, e);
        }
      }

      return new Response(JSON.stringify({ success: true, synced }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'sync-companies') {
      // Fetch all contacts from GHL and extract unique companies
      let allContacts: any[] = [];
      let nextPageUrl: string | null = `${GHL_API_BASE}/contacts/?locationId=${GHL_LOCATION_ID}&limit=100`;

      while (nextPageUrl) {
        await delay(500);
        const res = await ghlFetch(nextPageUrl, { headers: ghlHeaders });
        if (!res.ok) break;
        const data = await res.json();
        allContacts = allContacts.concat(data.contacts || []);
        nextPageUrl = data.meta?.nextPageUrl || null;
      }

      // Extract unique companies from contacts
      const companyMap = new Map<string, any>();
      for (const contact of allContacts) {
        const companyName = contact.companyName;
        if (companyName && !companyMap.has(companyName.toLowerCase())) {
          companyMap.set(companyName.toLowerCase(), {
            name: companyName,
            email: contact.email || null,
            phone: contact.phone || null,
            website: contact.website || null,
            address: contact.address1 || contact.address || null,
          });
        }
      }

      let synced = 0;
      for (const [, company] of companyMap) {
        // Check if company exists by name
        const { data: existing } = await supabase
          .from('companies')
          .select('id')
          .eq('user_id', user.id)
          .ilike('name', company.name)
          .maybeSingle();

        if (existing) {
          // Update if needed
          await supabase.from('companies').update({
            email: company.email,
            phone: company.phone,
            website: company.website,
            address: company.address,
          }).eq('id', existing.id);
        } else {
          await supabase.from('companies').insert({
            user_id: user.id,
            name: company.name,
            email: company.email,
            phone: company.phone,
            website: company.website,
            address: company.address,
          });
        }
        synced++;
      }

      return new Response(JSON.stringify({ success: true, synced, totalContacts: allContacts.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'sync-company-details') {
      // Fetch all contacts from GHL to extract company-level details (address, city, postcode, etc.)
      let allContacts: any[] = [];
      let nextPageUrl: string | null = `${GHL_API_BASE}/contacts/?locationId=${GHL_LOCATION_ID}&limit=100`;
      let pageCount = 0;
      const maxPages = 5; // Limit to avoid timeout (500 contacts should cover most companies)

      while (nextPageUrl && pageCount < maxPages) {
        const res = await ghlFetch(nextPageUrl, { headers: ghlHeaders });
        if (!res.ok) {
          console.error(`GHL contacts fetch failed [${res.status}]`);
          break;
        }
        const data = await res.json();
        allContacts = allContacts.concat(data.contacts || []);
        nextPageUrl = data.meta?.nextPageUrl || null;
        pageCount++;
      }

      console.log(`Fetched ${allContacts.length} contacts from GHL for company detail extraction`);

      // Group contacts by company name, pick the richest data
      // Log a sample contact to see available fields
      if (allContacts.length > 0) {
        const sample = allContacts.find((c: any) => c.companyName) || allContacts[0];
        console.log('Sample GHL contact fields:', JSON.stringify(Object.keys(sample)));
        console.log('Sample GHL contact data:', JSON.stringify({ companyName: sample.companyName, address1: sample.address1, city: sample.city, postalCode: sample.postalCode, country: sample.country, customFields: sample.customFields?.length || 0, website: sample.website }));
      }
      const companyData = new Map<string, Record<string, any>>();
      for (const c of allContacts) {
        const companyName = c.companyName;
        if (!companyName) continue;
        const key = companyName.toLowerCase().trim();
        const existing = companyData.get(key) || { name: companyName };

        // Take first non-empty value for each field
        if (!existing.address && (c.address1 || c.address)) existing.address = c.address1 || c.address;
        if (!existing.city && c.city) existing.city = c.city;
        if (!existing.postcode && (c.postalCode || c.postal_code)) existing.postcode = c.postalCode || c.postal_code;
        if (!existing.country && c.country) existing.country = c.country;
        if (!existing.website && c.website) existing.website = c.website;

        // Check custom fields for KVK, BTW, klantnummer etc.
        for (const cf of c.customFields || []) {
          const fieldKey = (cf.id || cf.fieldKey || cf.key || '').toLowerCase();
          const fieldValue = cf.value || cf.fieldValue || '';
          if (!fieldValue) continue;
          if (fieldKey.includes('kvk') && !existing.kvk) existing.kvk = String(fieldValue);
          if ((fieldKey.includes('btw') || fieldKey.includes('vat')) && !existing.btw_number) existing.btw_number = String(fieldValue);
          if ((fieldKey.includes('klantnummer') || fieldKey.includes('customer')) && !existing.customer_number) existing.customer_number = String(fieldValue);
          if ((fieldKey.includes('doelgroep') || fieldKey.includes('crm')) && !existing.crm_group) existing.crm_group = String(fieldValue);
        }

        companyData.set(key, existing);
      }

      console.log(`Found ${companyData.size} unique companies with detail data`);

      let synced = 0;
      let noMatch = 0;
      let noUpdates = 0;
      for (const [key, data] of companyData) {
        const { data: localCo, error: matchErr } = await (supabase as any)
          .from('companies')
          .select('id, address, city, postcode, country, kvk, btw_number, customer_number, crm_group, website')
          .eq('user_id', user.id)
          .ilike('name', data.name.trim())
          .maybeSingle();

        if (matchErr) {
          console.error(`Match error for "${data.name}":`, matchErr.message);
          continue;
        }
        if (!localCo) { noMatch++; continue; }

        const updates: Record<string, any> = {};
        if (data.address && !localCo.address) updates.address = data.address;
        if (data.city && !localCo.city) updates.city = data.city;
        if (data.postcode && !localCo.postcode) updates.postcode = data.postcode;
        if (data.country && !localCo.country) updates.country = data.country;
        if (data.website && !localCo.website) updates.website = data.website;
        if (data.kvk && !localCo.kvk) updates.kvk = data.kvk;
        if (data.btw_number && !localCo.btw_number) updates.btw_number = data.btw_number;
        if (data.customer_number && !localCo.customer_number) updates.customer_number = data.customer_number;
        if (data.crm_group && !localCo.crm_group) updates.crm_group = data.crm_group;

        if (Object.keys(updates).length > 0) {
          const { error: updateErr } = await (supabase as any).from('companies').update(updates).eq('id', localCo.id);
          if (updateErr) {
            console.error(`Update error for "${data.name}":`, updateErr.message);
          } else {
            synced++;
          }
        } else {
          noUpdates++;
        }
      }
      console.log(`Sync results: synced=${synced}, noMatch=${noMatch}, noUpdates=${noUpdates}`);

      return new Response(JSON.stringify({ success: true, synced, totalContacts: allContacts.length, uniqueCompanies: companyData.size }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'updateCompany') {
      const { companyId, company } = body;
      if (!companyId || !company) {
        return new Response(JSON.stringify({ success: true, skipped: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get ghl_company_id from local DB
      const { data: localCo } = await supabase.from('companies').select('ghl_company_id').eq('id', companyId).maybeSingle();
      const ghlCompanyId = localCo?.ghl_company_id;

      if (!ghlCompanyId) {
        console.log(`Company ${companyId} has no GHL link, skipping push`);
        return new Response(JSON.stringify({ success: true, skipped: true, reason: 'no_ghl_id' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const ghlPayload: Record<string, any> = {
        name: company.name,
      };
      if (company.email) ghlPayload.email = company.email;
      if (company.phone) ghlPayload.phone = company.phone;
      if (company.website) ghlPayload.website = company.website;
      if (company.address) ghlPayload.address1 = company.address;
      if (company.city) ghlPayload.city = company.city;
      if (company.postcode) ghlPayload.postalCode = company.postcode;
      if (company.country) ghlPayload.country = company.country;

      const res = await ghlFetch(`${GHL_API_BASE}/companies/${ghlCompanyId}`, {
        method: 'PUT',
        headers: ghlHeaders,
        body: JSON.stringify(ghlPayload),
      });

      if (res.ok) {
        return new Response(JSON.stringify({ success: true, action: 'updated' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errText = await res.text();
      console.error(`Failed to update GHL company ${ghlCompanyId}: [${res.status}] ${errText}`);
      return new Response(JSON.stringify({ success: false, error: errText }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'sync-notes') {
      // Fetch notes from GHL for each contact and store as contact_activities
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, ghl_contact_id')
        .eq('user_id', user.id)
        .not('ghl_contact_id', 'is', null);

      let synced = 0;
      let skipped = 0;
      for (const contact of contacts || []) {
        try {
          await delay(300); // Rate limit protection
          const res = await ghlFetch(
            `${GHL_API_BASE}/contacts/${contact.ghl_contact_id}/notes`,
            { headers: ghlHeaders }
          );
          if (!res.ok) {
            console.warn(`Failed to fetch notes for contact ${contact.ghl_contact_id}: [${res.status}]`);
            skipped++;
            continue;
          }
          const data = await res.json();
          const notes = data.notes || [];

          for (const note of notes) {
            // Check if we already have this note (match on contact_id + body + approximate time)
            const noteBody = note.body || note.description || '';
            const noteDate = note.dateAdded || note.createdAt || note.date || new Date().toISOString();

            // Use a unique identifier: GHL note doesn't have a stable ID always, so match on body+date
            const { data: existing } = await supabase
              .from('contact_activities')
              .select('id')
              .eq('user_id', user.id)
              .eq('contact_id', contact.id)
              .eq('type', 'note')
              .eq('body', noteBody)
              .maybeSingle();

            if (existing) {
              skipped++;
              continue;
            }

            await supabase.from('contact_activities').insert({
              user_id: user.id,
              contact_id: contact.id,
              type: 'note',
              subject: 'GHL Notitie',
              body: noteBody || null,
              created_at: noteDate,
            });
            synced++;
          }
        } catch (e) {
          console.error(`Failed to sync notes for contact ${contact.ghl_contact_id}:`, e);
          skipped++;
        }
      }

      return new Response(JSON.stringify({ success: true, synced, skipped, totalContacts: (contacts || []).length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Conversations ──

    if (action === 'get-conversations') {
      const query = body.query || '';
      const searchParams = new URLSearchParams({
        locationId: GHL_LOCATION_ID,
      });
      if (query) searchParams.set('query', query);
      searchParams.set('limit', '50');
      searchParams.set('sort', 'desc');
      searchParams.set('sortBy', 'last_message_date');

      const res = await ghlFetch(
        `${GHL_API_BASE}/conversations/search?${searchParams.toString()}`,
        { headers: ghlHeaders }
      );
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`GHL conversations fetch failed [${res.status}]: ${errText}`);
      }
      const data = await res.json();
      const conversations = (data.conversations || []).map((c: any) => ({
        id: c.id,
        contactId: c.contactId,
        contactName: c.contactName || c.fullName || 'Onbekend',
        lastMessageBody: c.lastMessageBody || '',
        lastMessageDate: c.lastMessageDate || c.dateUpdated || '',
        lastMessageType: c.lastMessageType || '',
        lastMessageDirection: c.lastMessageDirection || '',
        unreadCount: c.unreadCount || 0,
        type: c.type || c.lastMessageType || 'SMS',
        phone: c.phone || '',
        email: c.email || '',
      }));

      return new Response(JSON.stringify({ success: true, conversations }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'get-messages') {
      const { conversationId } = body;
      if (!conversationId) {
        return new Response(JSON.stringify({ error: 'conversationId required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const res = await ghlFetch(
        `${GHL_API_BASE}/conversations/${conversationId}/messages?limit=50`,
        { headers: ghlHeaders }
      );
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`GHL messages fetch failed [${res.status}]: ${errText}`);
      }
      const data = await res.json();
      console.log('GHL messages response keys:', JSON.stringify(Object.keys(data)));
      
      // GHL may return messages under different keys
      const rawMessages = Array.isArray(data.messages) ? data.messages
        : Array.isArray(data.data?.messages) ? data.data.messages
        : Array.isArray(data) ? data
        : [];
      
      const messages = rawMessages.map((m: any) => ({
        id: m.id,
        body: m.body || m.message || m.text || '',
        direction: m.direction || (m.type === 1 ? 'inbound' : 'outbound'),
        dateAdded: m.dateAdded || m.createdAt || '',
        type: m.messageType || m.type || 'SMS',
        status: m.status || '',
        contentType: m.contentType || 'text',
        attachments: m.attachments || [],
      }));

      return new Response(JSON.stringify({ success: true, messages }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'send-message') {
      const { conversationId, contactId, message, type } = body;
      if (!conversationId || !message) {
        return new Response(JSON.stringify({ error: 'conversationId and message required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Resolve the GHL contact ID from the local contact UUID
      let ghlContactId = contactId;
      if (contactId) {
        const { data: contactRow } = await supabase
          .from('contacts')
          .select('ghl_contact_id')
          .eq('id', contactId)
          .maybeSingle();
        if (contactRow?.ghl_contact_id) {
          ghlContactId = contactRow.ghl_contact_id;
        }
      }

      // Only Email is supported for now
      const msgType = 'Email';
      
      const payload: any = {
        type: msgType,
        contactId: ghlContactId,
        message,
        subject: body.subject || 'Re:',
        html: message,
      };

      // Add CC/BCC if provided
      if (body.cc) payload.cc = Array.isArray(body.cc) ? body.cc : [body.cc];
      if (body.bcc) payload.bcc = Array.isArray(body.bcc) ? body.bcc : [body.bcc];
      if (body.replyToMessageId) payload.replyMessageId = body.replyToMessageId;

      const res = await ghlFetch(`${GHL_API_BASE}/conversations/messages`, {
        method: 'POST',
        headers: ghlHeaders,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(`GHL send message failed [${res.status}]: ${errText}`);
        return new Response(JSON.stringify({ success: false, error: `Verzenden mislukt [${res.status}]: ${errText}` }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const result = await res.json();
      return new Response(JSON.stringify({ success: true, messageId: result.messageId || result.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'delete-conversation') {
      const { conversationId } = body;
      if (!conversationId) {
        return new Response(JSON.stringify({ error: 'conversationId required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const res = await ghlFetch(`${GHL_API_BASE}/conversations/${conversationId}`, {
        method: 'DELETE', headers: ghlHeaders,
      });
      return new Response(JSON.stringify({ success: res.ok }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('GHL sync error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

