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

/** Get all user IDs within the same organization as the authenticated user */
async function getOrganizationUserIds(supabase: any, authUserId: string): Promise<string[]> {
  try {
    console.log(`[Org Scope] Getting organization users for user: ${authUserId}`);
    
    // Get the organization_id of the authenticated user
    const { data: userProfile, error: profileErr } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', authUserId)
      .single();

    if (profileErr || !userProfile?.organization_id) {
      console.error('Failed to get user organization:', profileErr);
      // Fallback to single user to maintain functionality
      return [authUserId];
    }

    // Get all users in the same organization
    const { data: orgUsers, error: usersErr } = await supabase
      .from('profiles')
      .select('id')
      .eq('organization_id', userProfile.organization_id);

    if (usersErr || !orgUsers) {
      console.error('Failed to get organization users:', usersErr);
      // Fallback to single user
      return [authUserId];
    }

    const userIds = orgUsers.map(u => u.id);
    console.log(`[Org Scope] Found ${userIds.length} users in organization ${userProfile.organization_id}`);
    return userIds;
  } catch (err) {
    console.error('Error getting organization users:', err);
    // Fallback to single user
    return [authUserId];
  }
}

/** Log sync operation for debugging and auditing */
async function logSyncOperation(supabase: any, userId: string, operation: string, entityType: string, details: any, status: 'success' | 'error' = 'success') {
  try {
    await supabase.from('sync_log').insert({
      user_id: userId,
      action: operation,
      entity_type: entityType,
      entity_id: details.entity_id || null,
      details,
      status,
    });
  } catch (err) {
    console.error('Failed to log sync operation:', err);
  }
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

    // Get organization-wide user IDs instead of single user
    const orgUserIds = await getOrganizationUserIds(supabase, authUser.id);
    console.log(`[Sync] Operating on ${orgUserIds.length} users in organization`);

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

      console.log(`[Contacts Sync] Fetching from: ${pageUrl}`);
      const res = await ghlFetch(pageUrl, { headers: ghlHeaders });
      if (!res.ok) {
        const errText = await res.text();
        await logSyncOperation(supabase, authUser.id, 'sync-contacts', 'contact', { error: errText, url: pageUrl }, 'error');
        return new Response(JSON.stringify({ success: false, error: `GHL fetch failed [${res.status}]: ${errText}` }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const data = await res.json();
      const contacts = data.contacts || [];
      const nextPageUrl = data.meta?.nextPageUrl || null;

      console.log(`[Contacts Sync] Processing ${contacts.length} contacts for organization`);

      // Upsert this page of contacts - assign to first org user for new contacts
      let synced = 0;
      const primaryUserId = orgUserIds[0];
      for (const ghlContact of contacts) {
        const firstName = ghlContact.firstName || ghlContact.name?.split(' ')[0] || 'Onbekend';
        const lastName = ghlContact.lastName || ghlContact.name?.split(' ').slice(1).join(' ') || '';

        // Check if contact exists in any user within the organization
        const { data: existing } = await supabase
          .from('contacts')
          .select('id, user_id')
          .in('user_id', orgUserIds)
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
          console.log(`[Contacts Sync] Updated existing contact: ${firstName} ${lastName} (${existing.id})`);
        } else {
          const { data: inserted } = await supabase.from('contacts').insert({
            user_id: primaryUserId, // Assign new contacts to primary org user
            ghl_contact_id: ghlContact.id,
            first_name: firstName,
            last_name: lastName,
            email: ghlContact.email || null,
            phone: ghlContact.phone || null,
            company: ghlContact.companyName || null,
            status: 'lead',
          }).select('id').single();
          console.log(`[Contacts Sync] Created new contact: ${firstName} ${lastName} (${inserted?.id}) for user ${primaryUserId}`);
        }
        synced++;
      }

      await logSyncOperation(supabase, authUser.id, 'sync-contacts', 'contact', { synced, total: contacts.length, orgUsers: orgUserIds.length });
      return new Response(JSON.stringify({ success: true, synced, pageContacts: contacts.length, nextPageUrl, hasMore: !!nextPageUrl, orgUsers: orgUserIds.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'push-contacts') {
      // Push local contacts to GHL - now for entire organization
      console.log(`[Push Contacts] Fetching contacts for ${orgUserIds.length} organization users`);
      const { data: localContacts } = await supabase
        .from('contacts')
        .select('*')
        .in('user_id', orgUserIds);

      console.log(`[Push Contacts] Found ${localContacts?.length || 0} contacts to push`);

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

        try {
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
            } else {
              console.log(`[Push Contacts] Updated GHL contact: ${contact.first_name} ${contact.last_name}`);
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
                console.log(`[Push Contacts] Created GHL contact: ${contact.first_name} ${contact.last_name} (${created.contact.id})`);
              }
            } else {
              const errText = await res.text();
              console.error(`Failed to create GHL contact: [${res.status}] ${errText}`);
              
              // Handle duplicate contact error
              if (res.status === 400 && errText.includes('duplicate')) {
                console.log(`[Push Contacts] Handling duplicate contact for: ${contact.first_name} ${contact.last_name}`);
                // Extract contactId from error if possible and link it
                const idMatch = errText.match(/contact.*?([a-zA-Z0-9_-]{20,})/i);
                if (idMatch) {
                  const existingId = idMatch[1];
                  await supabase.from('contacts').update({ ghl_contact_id: existingId }).eq('id', contact.id);
                  console.log(`[Push Contacts] Linked existing GHL contact ${existingId}`);
                }
              }
            }
          }
          pushed++;
        } catch (err) {
          console.error(`Error pushing contact ${contact.id}:`, err);
        }
      }

      await logSyncOperation(supabase, authUser.id, 'push-contacts', 'contact', { pushed, total: localContacts?.length || 0, orgUsers: orgUserIds.length });
      return new Response(JSON.stringify({ success: true, pushed, total: localContacts?.length || 0, orgUsers: orgUserIds.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'sync-calendars') {
      // Fetch all calendars first
      console.log(`[Calendar Sync] Starting calendar sync for organization`);
      const calRes = await ghlFetch(`${GHL_API_BASE}/calendars/?locationId=${GHL_LOCATION_ID}`, {
        headers: ghlHeaders,
      });
      if (!calRes.ok) {
        const errText = await calRes.text();
        await logSyncOperation(supabase, authUser.id, 'sync-calendars', 'booking', { error: errText }, 'error');
        throw new Error(`GHL calendars fetch failed [${calRes.status}]: ${errText}`);
      }
      const calData = await calRes.json();
      const calendars = calData.calendars || [];
      console.log(`[Calendar Sync] Found ${calendars.length} calendars:`, calendars.map((c: any) => c.name));

      // Build room_name -> ghl_calendar_id mapping from room_settings across all org users
      const { data: roomMappings } = await supabase
        .from('room_settings')
        .select('room_name, ghl_calendar_id, user_id')
        .in('user_id', orgUserIds)
        .not('ghl_calendar_id', 'is', null);
      
      console.log(`[Calendar Sync] Found ${roomMappings?.length || 0} room mappings across organization`);
      
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
      const primaryUserId = orgUserIds[0];

      let allEvents: any[] = [];
      for (const cal of calendars) {
        const eventsUrl = `${GHL_API_BASE}/calendars/events?locationId=${GHL_LOCATION_ID}&calendarId=${cal.id}&startTime=${startTimeMs}&endTime=${endTimeMs}`;
        console.log(`[Calendar Sync] Fetching events for calendar "${cal.name}" (${cal.id})`);
        const eventsRes = await ghlFetch(eventsUrl, { headers: calEventHeaders });
        if (eventsRes.ok) {
          const eventsData = await eventsRes.json();
          console.log(`[Calendar Sync] Calendar "${cal.name}": events count: ${(eventsData.events || []).length}`);
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

        // Check if booking exists across all organization users
        const { data: existing } = await supabase
          .from('bookings')
          .select('id, room_name, user_id')
          .in('user_id', orgUserIds)
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
          console.log(`[Calendar Sync] Updated booking: ${title} (${existing.id}) for user ${existing.user_id}`);
        } else {
          const { data: inserted } = await supabase.from('bookings').insert({
            user_id: primaryUserId, // Assign new bookings to primary org user
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
          }).select('id').single();
          console.log(`[Calendar Sync] Created booking: ${title} (${inserted?.id}) for user ${primaryUserId}`);
        }
        synced++;
      }

      await logSyncOperation(supabase, authUser.id, 'sync-calendars', 'booking', { synced, skipped, totalEvents: allEvents.length, orgUsers: orgUserIds.length });
      return new Response(JSON.stringify({ success: true, synced, skipped, totalEvents: allEvents.length, calendars: calendars.length, defaultRoom, orgUsers: orgUserIds.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'sync-opportunities') {
      // First get pipelines to map stage IDs to names
      console.log(`[Opportunities Sync] Starting opportunities sync for organization`);
      const pipelinesRes = await ghlFetch(`${GHL_API_BASE}/opportunities/pipelines?locationId=${GHL_LOCATION_ID}`, {
        headers: ghlHeaders,
      });
      if (!pipelinesRes.ok) {
        const errText = await pipelinesRes.text();
        await logSyncOperation(supabase, authUser.id, 'sync-opportunities', 'inquiry', { error: errText }, 'error');
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
        if (lower.includes('nieuwe aanvraag') || lower === 'new') return 'new';
        if (lower.includes('lopend contact')) return 'contacted';
        if (lower.includes('optie')) return 'option';
        if (lower.includes('aangepaste offerte')) return 'quote_revised';
        if (lower.includes('offerte verzonden') || lower.includes('offerte')) return 'quoted';
        if (lower.includes('definitieve reservering') || lower.includes('definitief')) return 'confirmed';
        if (lower.includes('reservering')) return 'reserved';
        if (lower.includes('draaiboek')) return 'script';
        if (lower.includes('facturatie') || lower.includes('invoice')) return 'invoiced';
        if (lower.includes('vervallen') || lower.includes('verloren') || lower.includes('lost')) return 'lost';
        if (lower.includes('after sales') || lower.includes('aftersales')) return 'after_sales';
        if (lower.includes('evenement')) return 'converted';
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
          await logSyncOperation(supabase, authUser.id, 'sync-opportunities', 'inquiry', { error: errText, page }, 'error');
          throw new Error(`GHL opportunities fetch failed [${res.status}]: ${errText}`);
        }
        const data = await res.json();
        const opps = data.opportunities || [];
        allOpportunities = allOpportunities.concat(opps);
        hasMore = opps.length === 100;
        page++;
      }

      console.log(`[Opportunities Sync] Found ${allOpportunities.length} opportunities to sync`);

      let synced = 0;
      const primaryUserId = orgUserIds[0];
      for (const opp of allOpportunities) {
        const stageName = stageMap[opp.pipelineStageId] || opp.status || 'new';
        const crmStatus = stageToStatus(stageName);
        const contactName = opp.contact?.name || opp.name || 'Onbekend';
        const monetaryValue = opp.monetaryValue ? Number(opp.monetaryValue) : null;

        // Check if opportunity exists across all organization users
        const { data: existing } = await supabase
          .from('inquiries')
          .select('id, user_id')
          .in('user_id', orgUserIds)
          .eq('ghl_opportunity_id', opp.id)
          .maybeSingle();

        if (existing) {
          await supabase.from('inquiries').update({
            contact_name: contactName,
            status: crmStatus,
            budget: monetaryValue,
            event_type: opp.name || 'Onbekend',
          }).eq('id', existing.id);
          console.log(`[Opportunities Sync] Updated inquiry: ${contactName} (${existing.id}) for user ${existing.user_id}`);
        } else {
          const { data: inserted } = await supabase.from('inquiries').insert({
            user_id: primaryUserId, // Assign new inquiries to primary org user
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
          }).select('id').single();
          console.log(`[Opportunities Sync] Created inquiry: ${contactName} (${inserted?.id}) for user ${primaryUserId}`);
        }
        synced++;
      }

      await logSyncOperation(supabase, authUser.id, 'sync-opportunities', 'inquiry', { synced, total: allOpportunities.length, orgUsers: orgUserIds.length });
      return new Response(JSON.stringify({ success: true, synced, total: allOpportunities.length, orgUsers: orgUserIds.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'push-contact') {
      // Handle single contact push (from context providers)
      const { contact } = body;
      if (!contact) {
        return new Response(JSON.stringify({ error: 'Contact data required' }), { status: 400, headers: corsHeaders });
      }

      console.log(`[Push Contact] Pushing single contact: ${contact.first_name} ${contact.last_name} (${contact.id})`);

      const ghlPayload: Record<string, any> = {
        firstName: contact.first_name || 'Onbekend',
        lastName: contact.last_name || '',
        locationId: GHL_LOCATION_ID,
      };
      if (contact.email) ghlPayload.email = contact.email;
      if (contact.phone) ghlPayload.phone = contact.phone;
      if (contact.company) ghlPayload.companyName = contact.company;

      try {
        if (contact.ghl_contact_id) {
          // Update existing GHL contact
          const res = await ghlFetch(`${GHL_API_BASE}/contacts/${contact.ghl_contact_id}`, {
            method: 'PUT',
            headers: ghlHeaders,
            body: JSON.stringify(ghlPayload),
          });
          if (res.ok) {
            console.log(`[Push Contact] Updated GHL contact: ${contact.ghl_contact_id}`);
          } else {
            const errText = await res.text();
            console.error(`Failed to update GHL contact: [${res.status}] ${errText}`);
            await logSyncOperation(supabase, authUser.id, 'push-contact', 'contact', { error: errText, contactId: contact.id }, 'error');
            return new Response(JSON.stringify({ error: errText }), { status: res.status, headers: corsHeaders });
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
            const newGhlId = created.contact?.id;
            if (newGhlId) {
              // Update the local contact with the GHL ID
              await supabase.from('contacts').update({
                ghl_contact_id: newGhlId,
              }).eq('id', contact.id);
              console.log(`[Push Contact] Created GHL contact: ${newGhlId}`);
            }
          } else {
            const errText = await res.text();
            console.error(`Failed to create GHL contact: [${res.status}] ${errText}`);
            
            // Handle duplicate contact error - extract existing ID and link it
            if (res.status === 400 && errText.includes('duplicate')) {
              console.log(`[Push Contact] Handling duplicate contact for: ${contact.first_name} ${contact.last_name}`);
              const idMatch = errText.match(/contact.*?([a-zA-Z0-9_-]{20,})/i);
              if (idMatch) {
                const existingId = idMatch[1];
                await supabase.from('contacts').update({ ghl_contact_id: existingId }).eq('id', contact.id);
                console.log(`[Push Contact] Linked existing GHL contact ${existingId}`);
                await logSyncOperation(supabase, authUser.id, 'push-contact', 'contact', { linkedExistingId: existingId, contactId: contact.id });
                return new Response(JSON.stringify({ success: true, linked_existing: existingId }), { headers: corsHeaders });
              }
            }
            
            await logSyncOperation(supabase, authUser.id, 'push-contact', 'contact', { error: errText, contactId: contact.id }, 'error');
            return new Response(JSON.stringify({ error: errText }), { status: res.status, headers: corsHeaders });
          }
        }

        await logSyncOperation(supabase, authUser.id, 'push-contact', 'contact', { contactId: contact.id, ghlId: contact.ghl_contact_id });
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      } catch (err) {
        console.error('Error pushing contact:', err);
        await logSyncOperation(supabase, authUser.id, 'push-contact', 'contact', { error: String(err), contactId: contact.id }, 'error');
        return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
      }
    }

    if (action === 'push-company') {
      const { company } = body;
      if (!company) {
        return new Response(JSON.stringify({ error: 'Company data required' }), { status: 400, headers: corsHeaders });
      }

      console.log(`[Push Company] Pushing single company: ${company.name} (${company.id})`);

      const ghlPayload: Record<string, any> = {
        name: company.name || 'Onbekend',
        locationId: GHL_LOCATION_ID,
      };
      if (company.email) ghlPayload.email = company.email;
      if (company.phone) ghlPayload.phone = company.phone;
      if (company.website) ghlPayload.website = company.website;
      if (company.address) ghlPayload.address = company.address;
      if (company.city) ghlPayload.city = company.city;
      if (company.postcode) ghlPayload.postalCode = company.postcode;
      if (company.country) ghlPayload.country = company.country;

      try {
        if (company.ghl_company_id) {
          // Update existing GHL company
          const res = await ghlFetch(`${GHL_API_BASE}/companies/${company.ghl_company_id}`, {
            method: 'PUT',
            headers: ghlHeaders,
            body: JSON.stringify(ghlPayload),
          });
          if (res.ok) {
            console.log(`[Push Company] Updated GHL company: ${company.ghl_company_id}`);
          } else {
            const errText = await res.text();
            console.error(`Failed to update GHL company: [${res.status}] ${errText}`);
            await logSyncOperation(supabase, authUser.id, 'push-company', 'company', { error: errText, companyId: company.id }, 'error');
            return new Response(JSON.stringify({ error: errText }), { status: res.status, headers: corsHeaders });
          }
        } else {
          // Create new GHL company
          const res = await ghlFetch(`${GHL_API_BASE}/companies/`, {
            method: 'POST',
            headers: ghlHeaders,
            body: JSON.stringify(ghlPayload),
          });
          if (res.ok) {
            const created = await res.json();
            const newGhlId = created.company?.id;
            if (newGhlId) {
              await supabase.from('companies').update({
                ghl_company_id: newGhlId,
              }).eq('id', company.id);
              console.log(`[Push Company] Created GHL company: ${newGhlId}`);
            }
          } else {
            const errText = await res.text();
            console.error(`Failed to create GHL company: [${res.status}] ${errText}`);
            await logSyncOperation(supabase, authUser.id, 'push-company', 'company', { error: errText, companyId: company.id }, 'error');
            return new Response(JSON.stringify({ error: errText }), { status: res.status, headers: corsHeaders });
          }
        }

        await logSyncOperation(supabase, authUser.id, 'push-company', 'company', { companyId: company.id, ghlId: company.ghl_company_id });
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      } catch (err) {
        console.error('Error pushing company:', err);
        await logSyncOperation(supabase, authUser.id, 'push-company', 'company', { error: String(err), companyId: company.id }, 'error');
        return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
      }
    }

    if (action === 'push-task') {
      const { task } = body;
      if (!task) {
        return new Response(JSON.stringify({ error: 'Task data required' }), { status: 400, headers: corsHeaders });
      }

      console.log(`[Push Task] Pushing single task: ${task.title} (${task.id})`);

      // Find the contact's GHL ID if task has contact_id
      let ghlContactId = null;
      if (task.contact_id) {
        const { data: contact } = await supabase
          .from('contacts')
          .select('ghl_contact_id')
          .eq('id', task.contact_id)
          .single();
        ghlContactId = contact?.ghl_contact_id;
      }

      const ghlPayload: Record<string, any> = {
        title: task.title || 'Taak',
        body: task.description || '',
        locationId: GHL_LOCATION_ID,
      };
      if (ghlContactId) ghlPayload.contactId = ghlContactId;
      if (task.due_date) ghlPayload.dueDate = task.due_date;
      if (task.status === 'completed') ghlPayload.completed = true;

      try {
        if (task.ghl_task_id) {
          // Update existing GHL task
          const res = await ghlFetch(`${GHL_API_BASE}/tasks/${task.ghl_task_id}`, {
            method: 'PUT',
            headers: ghlHeaders,
            body: JSON.stringify(ghlPayload),
          });
          if (res.ok) {
            console.log(`[Push Task] Updated GHL task: ${task.ghl_task_id}`);
          } else {
            const errText = await res.text();
            console.error(`Failed to update GHL task: [${res.status}] ${errText}`);
            await logSyncOperation(supabase, authUser.id, 'push-task', 'task', { error: errText, taskId: task.id }, 'error');
            return new Response(JSON.stringify({ error: errText }), { status: res.status, headers: corsHeaders });
          }
        } else {
          // Create new GHL task
          const res = await ghlFetch(`${GHL_API_BASE}/tasks/`, {
            method: 'POST',
            headers: ghlHeaders,
            body: JSON.stringify(ghlPayload),
          });
          if (res.ok) {
            const created = await res.json();
            const newGhlId = created.task?.id;
            if (newGhlId) {
              await supabase.from('tasks').update({
                ghl_task_id: newGhlId,
              }).eq('id', task.id);
              console.log(`[Push Task] Created GHL task: ${newGhlId}`);
            }
          } else {
            const errText = await res.text();
            console.error(`Failed to create GHL task: [${res.status}] ${errText}`);
            await logSyncOperation(supabase, authUser.id, 'push-task', 'task', { error: errText, taskId: task.id }, 'error');
            return new Response(JSON.stringify({ error: errText }), { status: res.status, headers: corsHeaders });
          }
        }

        await logSyncOperation(supabase, authUser.id, 'push-task', 'task', { taskId: task.id, ghlId: task.ghl_task_id });
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      } catch (err) {
        console.error('Error pushing task:', err);
        await logSyncOperation(supabase, authUser.id, 'push-task', 'task', { error: String(err), taskId: task.id }, 'error');
        return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
      }
    }

    if (action === 'delete-contact') {
      const { ghl_contact_id } = body;
      if (!ghl_contact_id) {
        return new Response(JSON.stringify({ error: 'ghl_contact_id required' }), { status: 400, headers: corsHeaders });
      }

      console.log(`[Delete Contact] Deleting GHL contact: ${ghl_contact_id}`);

      try {
        const res = await ghlFetch(`${GHL_API_BASE}/contacts/${ghl_contact_id}`, {
          method: 'DELETE',
          headers: ghlHeaders,
        });

        if (res.ok) {
          console.log(`[Delete Contact] Successfully deleted GHL contact: ${ghl_contact_id}`);
          await logSyncOperation(supabase, authUser.id, 'delete-contact', 'contact', { ghlContactId: ghl_contact_id });
        } else {
          const errText = await res.text();
          console.error(`Failed to delete GHL contact: [${res.status}] ${errText}`);
          await logSyncOperation(supabase, authUser.id, 'delete-contact', 'contact', { error: errText, ghlContactId: ghl_contact_id }, 'error');
          return new Response(JSON.stringify({ error: errText }), { status: res.status, headers: corsHeaders });
        }

        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      } catch (err) {
        console.error('Error deleting contact:', err);
        await logSyncOperation(supabase, authUser.id, 'delete-contact', 'contact', { error: String(err), ghlContactId: ghl_contact_id }, 'error');
        return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
      }
    }

    if (action === 'delete-company') {
      const { ghl_company_id } = body;
      if (!ghl_company_id) {
        return new Response(JSON.stringify({ error: 'ghl_company_id required' }), { status: 400, headers: corsHeaders });
      }

      console.log(`[Delete Company] Deleting GHL company: ${ghl_company_id}`);

      try {
        const res = await ghlFetch(`${GHL_API_BASE}/companies/${ghl_company_id}`, {
          method: 'DELETE',
          headers: ghlHeaders,
        });

        if (res.ok) {
          console.log(`[Delete Company] Successfully deleted GHL company: ${ghl_company_id}`);
          await logSyncOperation(supabase, authUser.id, 'delete-company', 'company', { ghlCompanyId: ghl_company_id });
        } else {
          const errText = await res.text();
          console.error(`Failed to delete GHL company: [${res.status}] ${errText}`);
          await logSyncOperation(supabase, authUser.id, 'delete-company', 'company', { error: errText, ghlCompanyId: ghl_company_id }, 'error');
          return new Response(JSON.stringify({ error: errText }), { status: res.status, headers: corsHeaders });
        }

        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      } catch (err) {
        console.error('Error deleting company:', err);
        await logSyncOperation(supabase, authUser.id, 'delete-company', 'company', { error: String(err), ghlCompanyId: ghl_company_id }, 'error');
        return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
      }
    }

    if (action === 'delete-task') {
      const { ghl_task_id, contact_id } = body;
      if (!ghl_task_id) {
        return new Response(JSON.stringify({ error: 'ghl_task_id required' }), { status: 400, headers: corsHeaders });
      }

      console.log(`[Delete Task] Deleting GHL task: ${ghl_task_id}`);

      try {
        const res = await ghlFetch(`${GHL_API_BASE}/tasks/${ghl_task_id}`, {
          method: 'DELETE',
          headers: ghlHeaders,
        });

        if (res.ok) {
          console.log(`[Delete Task] Successfully deleted GHL task: ${ghl_task_id}`);
          await logSyncOperation(supabase, authUser.id, 'delete-task', 'task', { ghlTaskId: ghl_task_id, contactId: contact_id });
        } else {
          const errText = await res.text();
          console.error(`Failed to delete GHL task: [${res.status}] ${errText}`);
          await logSyncOperation(supabase, authUser.id, 'delete-task', 'task', { error: errText, ghlTaskId: ghl_task_id }, 'error');
          return new Response(JSON.stringify({ error: errText }), { status: res.status, headers: corsHeaders });
        }

        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      } catch (err) {
        console.error('Error deleting task:', err);
        await logSyncOperation(supabase, authUser.id, 'delete-task', 'task', { error: String(err), ghlTaskId: ghl_task_id }, 'error');
        return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
      }
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e) {
    console.error('GHL Sync error:', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
