import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const GHL_API_BASE = 'https://services.leadconnectorhq.com';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Rate-limit-aware fetch: retries on 429 with SHORT backoff to preserve quota */
async function ghlFetch(url: string, opts: RequestInit = {}): Promise<Response> {
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const backoff = Math.min(2000 * attempt, 5000) + Math.floor(Math.random() * 1000);
      console.warn(`GHL retry ${attempt}/${MAX_RETRIES}, waiting ${backoff}ms for ${url}`);
      await delay(backoff);
    }
    const res = await fetch(url, opts);
    if (res.status !== 429) return res;
    await res.text();
  }
  console.error(`GHL rate limit after ${MAX_RETRIES} retries: ${url}`);
  return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429 });
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

    const userIds = orgUsers.map((u: { id: string }) => u.id);
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

Deno.serve(async (req) => {
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
          .select('id, user_id, updated_at')
          .in('user_id', orgUserIds)
          .eq('ghl_contact_id', ghlContact.id)
          .maybeSingle();

        if (existing) {
          // Timestamp-based: only overwrite if GHL is newer
          const ghlUpdatedAt = ghlContact.dateUpdated || ghlContact.dateAdded || null;
          const crmIsNewer = !ghlUpdatedAt || existing.updated_at >= ghlUpdatedAt;

          if (!crmIsNewer) {
            await supabase.from('contacts').update({
              first_name: firstName,
              last_name: lastName,
              email: ghlContact.email || null,
              phone: ghlContact.phone || null,
              company: ghlContact.companyName || null,
              tags: Array.isArray(ghlContact.tags) ? ghlContact.tags : [],
            }).eq('id', existing.id);
            console.log(`[Contacts Sync] Updated contact (GHL newer): ${firstName} ${lastName} (${existing.id})`);
          } else {
            console.log(`[Contacts Sync] Skipped contact (CRM newer): ${firstName} ${lastName} (${existing.id})`);
          }
        } else {
          const { data: inserted } = await supabase.from('contacts').insert({
            user_id: primaryUserId, // Assign new contacts to primary org user
            ghl_contact_id: ghlContact.id,
            first_name: firstName,
            last_name: lastName,
            email: ghlContact.email || null,
            phone: ghlContact.phone || null,
            company: ghlContact.companyName || null,
            tags: Array.isArray(ghlContact.tags) ? ghlContact.tags : [],
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
        const basePayload: Record<string, any> = {
          firstName: contact.first_name || 'Onbekend',
          lastName: contact.last_name || '',
        };
        if (contact.email) basePayload.email = contact.email;
        if (contact.phone) basePayload.phone = contact.phone;
        if (contact.company) basePayload.companyName = contact.company;

        // GHL contact update endpoint rejects locationId; create endpoint requires it
        const createPayload: Record<string, any> = { ...basePayload, locationId: GHL_LOCATION_ID };
        const updatePayload: Record<string, any> = { ...basePayload };

        try {
          if (contact.ghl_contact_id) {
            // Update existing GHL contact
            const res = await ghlFetch(`${GHL_API_BASE}/contacts/${contact.ghl_contact_id}`, {
              method: 'PUT',
              headers: ghlHeaders,
              body: JSON.stringify(updatePayload),
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
              body: JSON.stringify(createPayload),
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
          .select('id, room_name, user_id, updated_at')
          .in('user_id', orgUserIds)
          .eq('ghl_event_id', evt.id)
          .maybeSingle();

        if (existing) {
          // Timestamp-based: only overwrite if GHL is newer
          const ghlUpdatedAt = evt.dateUpdated || evt.dateAdded || null;
          const crmIsNewer = !ghlUpdatedAt || existing.updated_at >= ghlUpdatedAt;

          if (!crmIsNewer) {
            // GHL wins → update time/date fields, preserve locally-set fields (room, notes, guest_count, etc.)
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
            console.log(`[Calendar Sync] Updated booking (GHL newer): ${title} (${existing.id})`);
          } else {
            console.log(`[Calendar Sync] Skipped booking (CRM newer): ${title} (${existing.id})`);
          }
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
        if (lower.includes('condoleance') || lower.includes('condolence')) return 'condolence_reminder';
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

      const basePayload: Record<string, any> = {
        firstName: contact.first_name || 'Onbekend',
        lastName: contact.last_name || '',
      };
      if (contact.email) basePayload.email = contact.email;
      if (contact.phone) basePayload.phone = contact.phone;
      if (contact.company) basePayload.companyName = contact.company;

      // GHL contact update endpoint rejects locationId; create endpoint requires it
      const createPayload: Record<string, any> = { ...basePayload, locationId: GHL_LOCATION_ID };
      const updatePayload: Record<string, any> = { ...basePayload };

      try {
        if (contact.ghl_contact_id) {
          // Update existing GHL contact
          const res = await ghlFetch(`${GHL_API_BASE}/contacts/${contact.ghl_contact_id}`, {
            method: 'PUT',
            headers: ghlHeaders,
            body: JSON.stringify(updatePayload),
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
            body: JSON.stringify(createPayload),
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

        // Mark contact as fully synced
        await supabase.from('contacts').update({
          pending_outbound_sync: false,
          last_synced_at: new Date().toISOString(),
          last_sync_error: null,
        }).eq('id', contact.id);

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

      const baseCompanyPayload: Record<string, any> = {
        name: company.name || 'Onbekend',
      };
      if (company.email) baseCompanyPayload.email = company.email;
      if (company.phone) baseCompanyPayload.phone = company.phone;
      if (company.website) baseCompanyPayload.website = company.website;
      if (company.address) baseCompanyPayload.address = company.address;
      if (company.city) baseCompanyPayload.city = company.city;
      if (company.postcode) baseCompanyPayload.postalCode = company.postcode;
      if (company.country) baseCompanyPayload.country = company.country;

      // GHL business update endpoint rejects locationId; create endpoint requires it
      const createCompanyPayload: Record<string, any> = { ...baseCompanyPayload, locationId: GHL_LOCATION_ID };
      const updateCompanyPayload: Record<string, any> = { ...baseCompanyPayload };

      try {
        if (company.ghl_company_id) {
          // Update existing GHL company
          const res = await ghlFetch(`${GHL_API_BASE}/businesses/${company.ghl_company_id}`, {
            method: 'PUT',
            headers: ghlHeaders,
            body: JSON.stringify(updateCompanyPayload),
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
          const res = await ghlFetch(`${GHL_API_BASE}/businesses/`, {
            method: 'POST',
            headers: ghlHeaders,
            body: JSON.stringify(createCompanyPayload),
          });
          if (res.ok) {
            const created = await res.json();
            const newGhlId = created.business?.id || created.company?.id;
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

        // Mark company as fully synced
        await supabase.from('companies').update({
          pending_outbound_sync: false,
          last_synced_at: new Date().toISOString(),
          last_sync_error: null,
        }).eq('id', company.id);

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
        return new Response(JSON.stringify({ ok: false, error: 'Task data required' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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

      // GHL Tasks API requires a contactId — skip if none available
      if (!ghlContactId) {
        console.log(`[Push Task] No GHL contact linked for task ${task.id}, skipping GHL sync`);
        await logSyncOperation(supabase, authUser.id, 'push-task', 'task', { taskId: task.id, note: 'no_ghl_contact' });
        return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'no_ghl_contact' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const ghlPayload: Record<string, any> = {
        title: task.title || 'Taak',
        body: task.description || '',
        completed: task.status === 'completed',
      };
      if (task.due_date) ghlPayload.dueDate = task.due_date;

      try {
        if (task.ghl_task_id) {
          // Update existing GHL task
          const res = await ghlFetch(`${GHL_API_BASE}/contacts/${ghlContactId}/tasks/${task.ghl_task_id}`, {
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
            return new Response(JSON.stringify({ ok: false, error: `GHL update failed: ${errText}` }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
        } else {
          // Create new GHL task under the contact
          const res = await ghlFetch(`${GHL_API_BASE}/contacts/${ghlContactId}/tasks`, {
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
            return new Response(JSON.stringify({ ok: false, error: `GHL create failed: ${errText}` }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
        }

        await logSyncOperation(supabase, authUser.id, 'push-task', 'task', { taskId: task.id, ghlId: task.ghl_task_id });
        return new Response(JSON.stringify({ ok: true, success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (err) {
        console.error('Error pushing task:', err);
        await logSyncOperation(supabase, authUser.id, 'push-task', 'task', { error: String(err), taskId: task.id }, 'error');
        return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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
          // Treat "Contact not found" as success — already deleted
          const isNotFound = res.status === 400 && errText.includes('Contact not found');
          if (isNotFound) {
            console.log(`[Delete Contact] GHL contact already gone: ${ghl_contact_id}`);
            await logSyncOperation(supabase, authUser.id, 'delete-contact', 'contact', { ghlContactId: ghl_contact_id, note: 'already_deleted' });
          } else if (res.status === 429) {
            // Rate limited — return success to client, sync_queue will retry via background job
            console.warn(`[Delete Contact] Rate limited for GHL contact: ${ghl_contact_id}, will be retried via sync queue`);
            await logSyncOperation(supabase, authUser.id, 'delete-contact', 'contact', { ghlContactId: ghl_contact_id, note: 'rate_limited_queued' }, 'error');
            return new Response(JSON.stringify({ success: true, queued: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          } else {
            console.error(`Failed to delete GHL contact: [${res.status}] ${errText}`);
            await logSyncOperation(supabase, authUser.id, 'delete-contact', 'contact', { error: errText, ghlContactId: ghl_contact_id }, 'error');
            return new Response(JSON.stringify({ error: errText }), { status: res.status, headers: corsHeaders });
          }
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
        const res = await ghlFetch(`${GHL_API_BASE}/businesses/${ghl_company_id}`, {
          method: 'DELETE',
          headers: ghlHeaders,
        });

        if (res.ok) {
          console.log(`[Delete Company] Successfully deleted GHL company: ${ghl_company_id}`);
          await logSyncOperation(supabase, authUser.id, 'delete-company', 'company', { ghlCompanyId: ghl_company_id });
        } else {
          const errText = await res.text();
          const isNotFound = res.status === 400 && errText.includes('not found');
          if (isNotFound) {
            console.log(`[Delete Company] GHL company already gone: ${ghl_company_id}`);
            await logSyncOperation(supabase, authUser.id, 'delete-company', 'company', { ghlCompanyId: ghl_company_id, note: 'already_deleted' });
          } else if (res.status === 429) {
            console.warn(`[Delete Company] Rate limited for GHL company: ${ghl_company_id}, will be retried via sync queue`);
            await logSyncOperation(supabase, authUser.id, 'delete-company', 'company', { ghlCompanyId: ghl_company_id, note: 'rate_limited_queued' }, 'error');
            return new Response(JSON.stringify({ success: true, queued: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          } else {
            console.error(`Failed to delete GHL company: [${res.status}] ${errText}`);
            await logSyncOperation(supabase, authUser.id, 'delete-company', 'company', { error: errText, ghlCompanyId: ghl_company_id }, 'error');
            return new Response(JSON.stringify({ error: errText }), { status: res.status, headers: corsHeaders });
          }
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
        return new Response(JSON.stringify({ ok: false, error: 'ghl_task_id required' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Resolve GHL contact ID for the contact-scoped endpoint
      let ghlContactId: string | null = null;
      if (contact_id) {
        const { data: contact } = await supabase
          .from('contacts')
          .select('ghl_contact_id')
          .eq('id', contact_id)
          .single();
        ghlContactId = contact?.ghl_contact_id;
      }

      if (!ghlContactId) {
        console.error(`[Delete Task] No GHL contact for task deletion`);
        return new Response(JSON.stringify({ ok: false, error: 'Geen gekoppeld extern contact voor taakverwijdering' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      console.log(`[Delete Task] Deleting GHL task: ${ghl_task_id} under contact ${ghlContactId}`);

      try {
        const res = await ghlFetch(`${GHL_API_BASE}/contacts/${ghlContactId}/tasks/${ghl_task_id}`, {
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
          return new Response(JSON.stringify({ ok: false, error: `GHL delete failed: ${errText}` }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        return new Response(JSON.stringify({ ok: true, success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (err) {
        console.error('Error deleting task:', err);
        await logSyncOperation(supabase, authUser.id, 'delete-task', 'task', { error: String(err), ghlTaskId: ghl_task_id }, 'error');
        return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    if (action === 'push-inquiry') {
      // Create a new GHL opportunity from a CRM inquiry
      const { inquiry_id, contact_name, event_type, budget, status, message } = body;
      if (!inquiry_id) {
        return new Response(JSON.stringify({ error: 'inquiry_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      console.log(`[Push Inquiry] Creating GHL opportunity for inquiry: ${inquiry_id}, contact: ${contact_name}`);

      try {
        // Get pipelines to find the correct stage
        const pipelinesRes = await ghlFetch(`${GHL_API_BASE}/opportunities/pipelines?locationId=${GHL_LOCATION_ID}`, { headers: ghlHeaders });
        let pipelineId: string | null = null;
        let stageId: string | null = null;

        if (pipelinesRes.ok) {
          const pipelinesData = await pipelinesRes.json();
          const pipeline = pipelinesData.pipelines?.[0];
          if (pipeline) {
            pipelineId = pipeline.id;
            // Map status to correct pipeline stage (same mapping as push-inquiry-status)
            const statusToStageKeywords: Record<string, string[]> = {
              'new': ['nieuwe aanvraag', 'new'],
              'contacted': ['lopend contact'],
              'option': ['optie'],
              'quote_revised': ['aangepaste offerte'],
              'quoted': ['offerte verzonden', 'offerte'],
              'confirmed': ['definitieve reservering', 'definitief'],
              'reserved': ['reservering'],
              'script': ['draaiboek'],
              'invoiced': ['facturatie', 'invoice'],
              'lost': ['vervallen', 'verloren', 'lost'],
              'after_sales': ['after sales', 'aftersales'],
              'condolence_reminder': ['condoleance', 'condolence'],
              'converted': ['evenement'],
            };
            const keywords = statusToStageKeywords[status] || [];
            for (const stage of pipeline.stages || []) {
              const stageLower = stage.name.toLowerCase();
              if (keywords.some((kw: string) => stageLower.includes(kw))) {
                stageId = stage.id;
                break;
              }
            }
            // Fallback to first stage if no match found
            if (!stageId) stageId = pipeline.stages?.[0]?.id || null;
            console.log(`[Push Inquiry] Mapped status "${status}" to stage: ${stageId}`);
          }
        } else {
          await pipelinesRes.text();
        }

        if (!pipelineId) {
          console.warn('[Push Inquiry] No pipeline found in GHL');
          return new Response(JSON.stringify({ success: false, error: 'No GHL pipeline found' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // Resolve GHL contact
        let ghlContactId: string | null = null;
        const { data: inquiryRow } = await supabase.from('inquiries').select('contact_id').eq('id', inquiry_id).single();
        if (inquiryRow?.contact_id) {
          const { data: contactRow } = await supabase.from('contacts').select('ghl_contact_id').eq('id', inquiryRow.contact_id).single();
          ghlContactId = contactRow?.ghl_contact_id || null;
        }
        if (!ghlContactId) {
          // Search or create contact
          const searchRes = await ghlFetch(`${GHL_API_BASE}/contacts/?locationId=${GHL_LOCATION_ID}&query=${encodeURIComponent(contact_name || 'Onbekend')}&limit=1`, { headers: ghlHeaders });
          if (searchRes.ok) {
            const sd = await searchRes.json();
            ghlContactId = sd.contacts?.[0]?.id || null;
          } else { await searchRes.text(); }
          if (!ghlContactId) {
            const nameParts = (contact_name || 'Onbekend').split(' ');
            const cRes = await ghlFetch(`${GHL_API_BASE}/contacts/`, { method: 'POST', headers: ghlHeaders, body: JSON.stringify({ firstName: nameParts[0], lastName: nameParts.slice(1).join(' ') || '-', locationId: GHL_LOCATION_ID }) });
            if (cRes.ok) { const cd = await cRes.json(); ghlContactId = cd.contact?.id || null; }
            else { await cRes.text(); }
          }
        }

        const oppPayload: Record<string, any> = {
          pipelineId,
          locationId: GHL_LOCATION_ID,
          name: event_type || contact_name || 'Aanvraag',
          status: status === 'lost' ? 'lost' : status === 'converted' ? 'won' : 'open',
          contactId: ghlContactId || undefined,
        };
        if (stageId) oppPayload.pipelineStageId = stageId;
        if (budget) oppPayload.monetaryValue = budget;

        const res = await ghlFetch(`${GHL_API_BASE}/opportunities/`, { method: 'POST', headers: ghlHeaders, body: JSON.stringify(oppPayload) });
        if (res.ok) {
          const created = await res.json();
          const newOppId = created.opportunity?.id;
          if (newOppId) {
            await supabase.from('inquiries').update({ ghl_opportunity_id: newOppId }).eq('id', inquiry_id);
            console.log(`[Push Inquiry] Created GHL opportunity: ${newOppId}`);
          }
          await logSyncOperation(supabase, authUser.id, 'push-inquiry', 'inquiry', { inquiryId: inquiry_id, ghlOppId: newOppId });
        } else {
          const errText = await res.text();
          console.error(`[Push Inquiry] Failed: [${res.status}] ${errText}`);
          await logSyncOperation(supabase, authUser.id, 'push-inquiry', 'inquiry', { error: errText, inquiryId: inquiry_id }, 'error');
        }

        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (err) {
        console.error('[Push Inquiry] Error:', err);
        await logSyncOperation(supabase, authUser.id, 'push-inquiry', 'inquiry', { error: String(err), inquiryId: inquiry_id }, 'error');
        return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    if (action === 'push-inquiry-status') {
      const { ghl_opportunity_id, status, name, monetary_value, contact_name, guest_count } = body;
      if (!ghl_opportunity_id) {
        return new Response(JSON.stringify({ error: 'ghl_opportunity_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      console.log(`[Push Inquiry Status] Updating GHL opportunity: ${ghl_opportunity_id}, status: ${status}`);

      // Map CRM status back to GHL pipeline stage
      // We need to find the correct pipeline and stage
      try {
        const pipelinesRes = await ghlFetch(`${GHL_API_BASE}/opportunities/pipelines?locationId=${GHL_LOCATION_ID}`, { headers: ghlHeaders });
        let stageId: string | null = null;
        let pipelineId: string | null = null;

        if (pipelinesRes.ok) {
          const pipelinesData = await pipelinesRes.json();
          const statusToStageKeywords: Record<string, string[]> = {
            'new': ['nieuwe aanvraag', 'new'],
            'contacted': ['lopend contact'],
            'option': ['optie'],
            'quote_revised': ['aangepaste offerte'],
            'quoted': ['offerte verzonden', 'offerte'],
            'confirmed': ['definitieve reservering', 'definitief'],
            'reserved': ['reservering'],
            'script': ['draaiboek'],
            'invoiced': ['facturatie', 'invoice'],
            'lost': ['vervallen', 'verloren', 'lost'],
            'after_sales': ['after sales', 'aftersales'],
            'condolence_reminder': ['condoleance', 'condolence'],
            'converted': ['evenement'],
          };

          const keywords = statusToStageKeywords[status] || [];
          for (const pipeline of pipelinesData.pipelines || []) {
            for (const stage of pipeline.stages || []) {
              const stageLower = stage.name.toLowerCase();
              if (keywords.some((kw: string) => stageLower.includes(kw))) {
                stageId = stage.id;
                pipelineId = pipeline.id;
                break;
              }
            }
            if (stageId) break;
          }
        } else {
          await pipelinesRes.text();
        }

        const ghlPayload: Record<string, any> = {};
        if (stageId) ghlPayload.pipelineStageId = stageId;
        if (pipelineId) ghlPayload.pipelineId = pipelineId;
        if (name) ghlPayload.name = name;
        if (monetary_value != null) ghlPayload.monetaryValue = monetary_value;
        if (status) ghlPayload.status = status === 'lost' ? 'lost' : status === 'converted' ? 'won' : 'open';

        const res = await ghlFetch(`${GHL_API_BASE}/opportunities/${ghl_opportunity_id}`, {
          method: 'PUT',
          headers: ghlHeaders,
          body: JSON.stringify(ghlPayload),
        });

        if (res.ok) {
          console.log(`[Push Inquiry Status] Updated GHL opportunity: ${ghl_opportunity_id}`);
          await logSyncOperation(supabase, authUser.id, 'push-inquiry-status', 'inquiry', { ghlOpportunityId: ghl_opportunity_id, status, stageId });
        } else {
          const errText = await res.text();
          console.error(`Failed to update GHL opportunity: [${res.status}] ${errText}`);
          await logSyncOperation(supabase, authUser.id, 'push-inquiry-status', 'inquiry', { error: errText, ghlOpportunityId: ghl_opportunity_id }, 'error');
          return new Response(JSON.stringify({ error: errText }), { status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        return new Response(JSON.stringify({ success: true, stageId, pipelineId }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (err) {
        console.error('Error pushing inquiry status:', err);
        await logSyncOperation(supabase, authUser.id, 'push-inquiry-status', 'inquiry', { error: String(err), ghlOpportunityId: ghl_opportunity_id }, 'error');
        return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    if (action === 'delete-inquiry') {
      const { ghl_opportunity_id } = body;
      if (!ghl_opportunity_id) {
        return new Response(JSON.stringify({ success: true, skipped: 'no ghl_opportunity_id' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      try {
        const res = await ghlFetch(`${GHL_API_BASE}/opportunities/${ghl_opportunity_id}`, {
          method: 'DELETE',
          headers: ghlHeaders,
        });
        if (res.ok || res.status === 404) {
          await res.text();
          console.log(`[Delete Inquiry] Deleted GHL opportunity: ${ghl_opportunity_id}`);
          await logSyncOperation(supabase, authUser.id, 'delete-inquiry', 'inquiry', { ghlOpportunityId: ghl_opportunity_id });
        } else {
          const errText = await res.text();
          console.error(`Failed to delete GHL opportunity: [${res.status}] ${errText}`);
          await logSyncOperation(supabase, authUser.id, 'delete-inquiry', 'inquiry', { error: errText, ghlOpportunityId: ghl_opportunity_id }, 'error');
        }
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (err) {
        console.error('Error deleting inquiry from GHL:', err);
        await logSyncOperation(supabase, authUser.id, 'delete-inquiry', 'inquiry', { error: String(err) }, 'error');
        return new Response(JSON.stringify({ error: String(err) }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // =================== sync-companies ===================
    if (action === 'sync-companies') {
      console.log(`[Companies Sync] Starting companies sync for organization`);
      const primaryUserId = orgUserIds[0];
      let synced = 0;

      // GHL doesn't have a dedicated companies list endpoint with locationId filter
      // Instead, we extract unique companies from contacts
      const { data: localContacts } = await supabase
        .from('contacts')
        .select('company, company_id')
        .in('user_id', orgUserIds)
        .not('company', 'is', null);

      const uniqueCompanies = new Set<string>();
      for (const c of localContacts || []) {
        if (c.company && c.company.trim()) uniqueCompanies.add(c.company.trim());
      }

      // Ensure each company exists in the companies table
      for (const companyName of uniqueCompanies) {
        const { data: existing } = await supabase
          .from('companies')
          .select('id')
          .in('user_id', orgUserIds)
          .ilike('name', companyName)
          .maybeSingle();

        if (!existing) {
          await supabase.from('companies').insert({
            user_id: primaryUserId,
            name: companyName,
          });
          synced++;
        }
      }

      await logSyncOperation(supabase, authUser.id, 'sync-companies', 'company', { synced, total: uniqueCompanies.size });
      return new Response(JSON.stringify({ success: true, synced, total: uniqueCompanies.size }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // =================== sync-tasks ===================
    if (action === 'sync-tasks') {
      console.log(`[Tasks Sync] Starting tasks sync for organization`);
      const primaryUserId = orgUserIds[0];

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

      // Fetch contacts with ghl_contact_id to get tasks per contact
      const { data: linkedContacts } = await supabase
        .from('contacts')
        .select('id, ghl_contact_id')
        .in('user_id', orgUserIds)
        .not('ghl_contact_id', 'is', null);

      let synced = 0;
      for (const contact of linkedContacts || []) {
        await delay(300); // Rate limit protection between contacts
        const res = await ghlFetch(`${GHL_API_BASE}/contacts/${contact.ghl_contact_id}/tasks?locationId=${GHL_LOCATION_ID}`, {
          headers: ghlHeaders,
        });
        if (!res.ok) {
          if (res.status === 429) {
            console.warn(`[Tasks Sync] Rate limited, stopping task sync early`);
            break;
          }
          await res.text();
          continue;
        }
        const data = await res.json();
        const tasks = data.tasks || [];

        for (const ghlTask of tasks) {
          if (deletedGhlTaskIds.has(ghlTask.id)) {
            const deleteRes = await ghlFetch(`${GHL_API_BASE}/contacts/${contact.ghl_contact_id}/tasks/${ghlTask.id}`, {
              method: 'DELETE',
              headers: ghlHeaders,
            });
            await deleteRes.text();
            console.log(`[Tasks Sync] Suppressed deleted task ${ghlTask.id}; external delete status ${deleteRes.status}`);
            continue;
          }
          const { data: existing } = await supabase
            .from('tasks')
            .select('id, status, title, description, due_date, local_status_changed_at')
            .in('user_id', orgUserIds)
            .eq('ghl_task_id', ghlTask.id)
            .maybeSingle();

          if (existing) {
            const externalStatus = ghlTask.completed ? 'completed' : 'open';
            if (existing.local_status_changed_at && existing.status !== externalStatus) {
              const protectedPayload: Record<string, any> = {
                title: existing.title || 'Taak',
                body: existing.description || '',
                completed: existing.status === 'completed',
              };
              if (existing.due_date) protectedPayload.dueDate = existing.due_date;
              const pushRes = await ghlFetch(`${GHL_API_BASE}/contacts/${contact.ghl_contact_id}/tasks/${ghlTask.id}`, {
                method: 'PUT',
                headers: ghlHeaders,
                body: JSON.stringify(protectedPayload),
              });
              if (pushRes.ok) {
                await logSyncOperation(supabase, authUser.id, 'protect_local_task_status', 'task', {
                  taskId: existing.id,
                  ghlTaskId: ghlTask.id,
                  crmStatus: existing.status,
                  externalStatus,
                });
              }
            } else {
              await supabase.from('tasks').update({
                title: ghlTask.title || 'Taak',
                description: ghlTask.body || null,
                status: externalStatus,
                due_date: ghlTask.dueDate || null,
                completed_at: ghlTask.completed ? (ghlTask.completedDate || new Date().toISOString()) : null,
              }).eq('id', existing.id);
            }
          } else {
            await supabase.from('tasks').insert({
              user_id: primaryUserId,
              ghl_task_id: ghlTask.id,
              contact_id: contact.id,
              title: ghlTask.title || 'Taak',
              description: ghlTask.body || null,
              status: ghlTask.completed ? 'completed' : 'open',
              due_date: ghlTask.dueDate || null,
              priority: 'medium',
              completed_at: ghlTask.completed ? (ghlTask.completedDate || new Date().toISOString()) : null,
            });
          }
          synced++;
        }
      }

      await logSyncOperation(supabase, authUser.id, 'sync-tasks', 'task', { synced, contactsChecked: linkedContacts?.length || 0 });
      return new Response(JSON.stringify({ success: true, synced, contactsChecked: linkedContacts?.length || 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // =================== push-call-log (Gespreksverslag → GHL Note) ===================
    if (action === 'push-call-log') {
      const { activity_id } = body;
      if (!activity_id) {
        return new Response(JSON.stringify({ ok: false, error: 'activity_id required' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: activity, error: actErr } = await supabase
        .from('contact_activities')
        .select('id, contact_id, body, subject, created_at, related_task_id, ghl_note_id')
        .eq('id', activity_id)
        .single();

      if (actErr || !activity) {
        return new Response(JSON.stringify({ ok: false, error: 'activity not found' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!activity.contact_id) {
        await logSyncOperation(supabase, authUser.id, 'push-call-log', 'activity', { activityId: activity.id, note: 'no_contact' });
        return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'no_contact' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: contact } = await supabase
        .from('contacts')
        .select('ghl_contact_id')
        .eq('id', activity.contact_id)
        .single();

      const ghlContactId = contact?.ghl_contact_id;
      if (!ghlContactId) {
        await logSyncOperation(supabase, authUser.id, 'push-call-log', 'activity', { activityId: activity.id, note: 'no_ghl_contact' });
        return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'no_ghl_contact' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Optional: pull task title for context in the note body
      let taskTitle: string | null = null;
      if (activity.related_task_id) {
        const { data: t } = await supabase
          .from('tasks')
          .select('title')
          .eq('id', activity.related_task_id)
          .single();
        taskTitle = t?.title || null;
      }

      const dateStr = new Date(activity.created_at).toLocaleString('nl-NL', {
        timeZone: 'Europe/Amsterdam', dateStyle: 'short', timeStyle: 'short',
      });
      const noteBody = `📞 Gespreksverslag — ${dateStr}\n\n${activity.body || ''}` +
        (taskTitle ? `\n\n— Gekoppeld aan taak: ${taskTitle}` : '');

      try {
        let res: Response;
        if (activity.ghl_note_id) {
          res = await ghlFetch(`${GHL_API_BASE}/contacts/${ghlContactId}/notes/${activity.ghl_note_id}`, {
            method: 'PUT',
            headers: ghlHeaders,
            body: JSON.stringify({ body: noteBody }),
          });
        } else {
          res = await ghlFetch(`${GHL_API_BASE}/contacts/${ghlContactId}/notes`, {
            method: 'POST',
            headers: ghlHeaders,
            body: JSON.stringify({ body: noteBody }),
          });
        }

        if (!res.ok) {
          const errText = await res.text();
          // Ignore benign errors per project conventions
          if (errText.includes('Contact not found') || res.status === 404) {
            await logSyncOperation(supabase, authUser.id, 'push-call-log', 'activity', { activityId: activity.id, note: 'ghl_contact_missing' });
            return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'ghl_contact_missing' }), {
              status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
          await logSyncOperation(supabase, authUser.id, 'push-call-log', 'activity', { error: errText, activityId: activity.id }, 'error');
          return new Response(JSON.stringify({ ok: false, error: errText }), {
            status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const created = await res.json();
        const noteId = created?.note?.id || created?.id || activity.ghl_note_id;
        if (noteId && noteId !== activity.ghl_note_id) {
          await supabase.from('contact_activities').update({ ghl_note_id: noteId }).eq('id', activity.id);
        }

        await logSyncOperation(supabase, authUser.id, 'push-call-log', 'activity', { activityId: activity.id, ghlNoteId: noteId });
        return new Response(JSON.stringify({ ok: true, ghl_note_id: noteId }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (err) {
        console.error('Error pushing call log:', err);
        await logSyncOperation(supabase, authUser.id, 'push-call-log', 'activity', { error: String(err), activityId: activity.id }, 'error');
        return new Response(JSON.stringify({ ok: false, error: String(err) }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // =================== delete-call-log ===================
    if (action === 'delete-call-log') {
      const { ghl_note_id, ghl_contact_id } = body;
      if (!ghl_note_id || !ghl_contact_id) {
        return new Response(JSON.stringify({ ok: true, skipped: true }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      try {
        const res = await ghlFetch(`${GHL_API_BASE}/contacts/${ghl_contact_id}/notes/${ghl_note_id}`, {
          method: 'DELETE',
          headers: ghlHeaders,
        });
        if (!res.ok && res.status !== 404) {
          const errText = await res.text();
          await logSyncOperation(supabase, authUser.id, 'delete-call-log', 'activity', { error: errText, ghlNoteId: ghl_note_id }, 'error');
        } else {
          await res.text();
          await logSyncOperation(supabase, authUser.id, 'delete-call-log', 'activity', { ghlNoteId: ghl_note_id });
        }
      } catch (err) {
        await logSyncOperation(supabase, authUser.id, 'delete-call-log', 'activity', { error: String(err) }, 'error');
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // =================== sync-notes ===================
    if (action === 'sync-notes') {
      console.log(`[Notes Sync] Starting notes/conversations sync for organization`);
      const primaryUserId = orgUserIds[0];

      // Fetch conversations from GHL
      let synced = 0;
      let skipped = 0;
      const res = await ghlFetch(`${GHL_API_BASE}/conversations/search?locationId=${GHL_LOCATION_ID}&limit=50`, {
        method: 'GET',
        headers: ghlHeaders,
      });

      if (!res.ok) {
        if (res.status === 429) {
          return new Response(JSON.stringify({ success: true, synced: 0, skipped: 0, rateLimited: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const errText = await res.text();
        await logSyncOperation(supabase, authUser.id, 'sync-notes', 'conversation', { error: errText }, 'error');
        return new Response(JSON.stringify({ success: false, error: errText }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const data = await res.json();
      const conversations = data.conversations || [];

      for (const conv of conversations) {
        const contactName = conv.contactName || conv.fullName || 'Onbekend';
        const { data: existing } = await supabase
          .from('conversations')
          .select('id')
          .in('user_id', orgUserIds)
          .eq('ghl_conversation_id', conv.id)
          .maybeSingle();

        if (existing) {
          await supabase.from('conversations').update({
            contact_name: contactName,
            last_message_body: conv.lastMessageBody || null,
            last_message_date: conv.lastMessageDate || null,
            last_message_direction: conv.lastMessageDirection || null,
            unread: conv.unreadCount > 0,
          }).eq('id', existing.id);
          synced++;
        } else {
          await supabase.from('conversations').insert({
            user_id: primaryUserId,
            ghl_conversation_id: conv.id,
            contact_name: contactName,
            email: conv.email || null,
            phone: conv.phone || null,
            last_message_body: conv.lastMessageBody || null,
            last_message_date: conv.lastMessageDate || null,
            last_message_direction: conv.lastMessageDirection || null,
            unread: conv.unreadCount > 0,
          });
          synced++;
        }
      }

      await logSyncOperation(supabase, authUser.id, 'sync-notes', 'conversation', { synced, skipped, total: conversations.length });
      return new Response(JSON.stringify({ success: true, synced, skipped, total: conversations.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // =================== push-booking (single) ===================
    if (action === 'push-booking') {
      const { booking } = body;
      if (!booking) {
        return new Response(JSON.stringify({ error: 'Booking data required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      console.log(`[Push Booking] Pushing booking: ${booking.title || booking.id}, room: ${booking.room_name}`);

      // Get room → calendar mapping
      const { data: roomSetting } = await supabase
        .from('room_settings')
        .select('ghl_calendar_id')
        .eq('room_name', booking.room_name)
        .not('ghl_calendar_id', 'is', null)
        .limit(1)
        .maybeSingle();

      if (!roomSetting?.ghl_calendar_id) {
        console.warn(`[Push Booking] No GHL calendar mapped for room: ${booking.room_name}`);
        return new Response(JSON.stringify({ success: false, error: `No GHL calendar for room: ${booking.room_name}` }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Build start/end ISO timestamps (Europe/Amsterdam)
      const dateStr = booking.date;
      const startH = String(booking.start_hour).padStart(2, '0');
      const startM = String(booking.start_minute ?? 0).padStart(2, '0');
      const endH = String(booking.end_hour).padStart(2, '0');
      const endM = String(booking.end_minute ?? 0).padStart(2, '0');
      // If end hour is past midnight (< 7) and start is during the day, use next day for end
      let endDateStr = dateStr;
      if (booking.end_hour < 7 && booking.start_hour >= 7) {
        const nextDay = new Date(dateStr + 'T12:00:00Z');
        nextDay.setUTCDate(nextDay.getUTCDate() + 1);
        endDateStr = nextDay.toISOString().slice(0, 10);
      }
      const startISO = `${dateStr}T${startH}:${startM}:00`;
      const endISO = `${endDateStr}T${endH}:${endM}:00`;

      // Calculate Europe/Amsterdam timezone offset
      const probeDate = new Date(`${dateStr}T12:00:00Z`);
      const amStr = probeDate.toLocaleString('en-US', { timeZone: 'Europe/Amsterdam', hour12: false });
      const amDate = new Date(amStr);
      const offsetH = Math.round((amDate.getTime() - probeDate.getTime()) / 3600000);
      const tz = `${offsetH >= 0 ? '+' : '-'}${String(Math.abs(offsetH)).padStart(2, '0')}:00`;
      const startISOwTZ = `${startISO}${tz}`;
      const endISOwTZ = `${endISO}${tz}`;

      // Resolve GHL contact ID for the booking
      let ghlContactId: string | null = null;
      if (booking.contact_id) {
        const { data: contactRow } = await supabase
          .from('contacts')
          .select('ghl_contact_id, first_name, last_name, email, phone')
          .eq('id', booking.contact_id)
          .single();
        ghlContactId = contactRow?.ghl_contact_id || null;

        // If contact exists locally but not in GHL, create it
        if (!ghlContactId && contactRow) {
          const cPayload: Record<string, any> = {
            firstName: contactRow.first_name || 'Onbekend',
            lastName: contactRow.last_name || '',
            locationId: GHL_LOCATION_ID,
          };
          if (contactRow.email) cPayload.email = contactRow.email;
          if (contactRow.phone) cPayload.phone = contactRow.phone;
          const cRes = await ghlFetch(`${GHL_API_BASE}/contacts/`, { method: 'POST', headers: ghlHeaders, body: JSON.stringify(cPayload) });
          if (cRes.ok) {
            const cData = await cRes.json();
            ghlContactId = cData.contact?.id || null;
            if (ghlContactId) {
              await supabase.from('contacts').update({ ghl_contact_id: ghlContactId }).eq('id', booking.contact_id);
              console.log(`[Push Booking] Created GHL contact: ${ghlContactId}`);
            }
          } else {
            const cErr = await cRes.text();
            console.warn(`[Push Booking] Failed to create GHL contact: ${cErr}`);
            // Try to extract existing ID from duplicate error
            if (cRes.status === 400 || cRes.status === 409) {
              const idMatch = cErr.match(/"id"\s*:\s*"([^"]+)"/);
              if (idMatch) {
                ghlContactId = idMatch[1];
                await supabase.from('contacts').update({ ghl_contact_id: ghlContactId }).eq('id', booking.contact_id);
              }
            }
          }
        }
      }

      // If still no GHL contact, search by name or create a minimal one
      if (!ghlContactId) {
        const searchName = booking.contact_name || booking.title || 'Reservering';
        const searchRes = await ghlFetch(`${GHL_API_BASE}/contacts/?locationId=${GHL_LOCATION_ID}&query=${encodeURIComponent(searchName)}&limit=1`, { headers: ghlHeaders });
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          if (searchData.contacts?.length > 0) {
            ghlContactId = searchData.contacts[0].id;
          }
        } else { await searchRes.text(); }

        if (!ghlContactId) {
          const nameParts = (booking.contact_name || 'Reservering').split(' ');
          const cPayload = { firstName: nameParts[0], lastName: nameParts.slice(1).join(' ') || '-', locationId: GHL_LOCATION_ID };
          const cRes = await ghlFetch(`${GHL_API_BASE}/contacts/`, { method: 'POST', headers: ghlHeaders, body: JSON.stringify(cPayload) });
          if (cRes.ok) {
            const cData = await cRes.json();
            ghlContactId = cData.contact?.id || null;
            console.log(`[Push Booking] Created minimal GHL contact: ${ghlContactId}`);
          } else {
            const cErr = await cRes.text();
            console.warn(`[Push Booking] Could not create GHL contact: ${cErr}`);
            // Try to extract ID from duplicate error
            const idMatch = cErr.match(/"id"\s*:\s*"([^"]+)"/);
            if (idMatch) ghlContactId = idMatch[1];
          }
        }
      }

      if (!ghlContactId) {
        console.error(`[Push Booking] Cannot push booking without GHL contactId`);
        return new Response(JSON.stringify({ success: false, error: 'Could not resolve GHL contact' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const calEventHeaders = { ...ghlHeaders, 'Version': '2021-04-15' };

      // Options should NOT trigger GHL workflows that move opportunity stages.
      // We push them as 'confirmed' to GHL (so the workflow doesn't fire on "new appointment"),
      // and prefix the title/notes so it's still visually identifiable in GHL.
      const isOption = booking.status === 'option';
      const titleForGhl = isOption ? `[OPTIE] ${booking.title || 'Reservering'}` : (booking.title || 'Reservering');
      const notesForGhl = isOption
        ? `[OPTIE — geen workflow update]${booking.notes ? `\n\n${booking.notes}` : ''}`
        : (booking.notes || null);

      // Appointments payload - ignoreFreeSlotValidation bypasses service calendar slot checks
      const eventPayload: Record<string, any> = {
        calendarId: roomSetting.ghl_calendar_id,
        locationId: GHL_LOCATION_ID,
        contactId: ghlContactId,
        title: titleForGhl,
        startTime: startISOwTZ,
        endTime: endISOwTZ,
        appointmentStatus: 'confirmed',
        ignoreDateRange: true,
        ignoreValidation: true,
        ignoreFreeSlotValidation: true,
        selectedTimezone: 'Europe/Amsterdam',
      };
      if (notesForGhl) eventPayload.notes = notesForGhl;


      console.log(`[Push Booking] Calendar: ${roomSetting.ghl_calendar_id}, Contact: ${ghlContactId}, Room: ${booking.room_name}`);

      // Check if calendar is active before attempting push
      const calCheckRes = await fetch(`${GHL_API_BASE}/calendars/${roomSetting.ghl_calendar_id}`, { headers: ghlHeaders });
      if (calCheckRes.ok) {
        const calInfo = await calCheckRes.json();
        if (calInfo?.calendar?.isActive === false) {
          console.warn(`[Push Booking] Calendar ${roomSetting.ghl_calendar_id} is inactive, skipping`);
          return new Response(JSON.stringify({ success: false, error: 'Calendar is inactive' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
      // Helper: fallback to generic /calendars/events endpoint (works for service calendars)
      const createViaCalendarEvents = async (): Promise<string | null> => {
        console.log(`[Push Booking] Falling back to /calendars/events for room: ${booking.room_name}, calendar: ${roomSetting.ghl_calendar_id}`);
        const evtPayload: Record<string, any> = {
          calendarId: roomSetting.ghl_calendar_id,
          locationId: GHL_LOCATION_ID,
          contactId: ghlContactId,
          title: titleForGhl,
          startTime: startISOwTZ,
          endTime: endISOwTZ,
          appointmentStatus: 'confirmed',
          selectedTimezone: 'Europe/Amsterdam',
        };
        if (notesForGhl) evtPayload.notes = notesForGhl;
        // Try v2 calendar events endpoint
        const evtRes = await ghlFetch(`${GHL_API_BASE}/calendars/events`, {
          method: 'POST', headers: { ...ghlHeaders, 'Version': '2021-07-28' }, body: JSON.stringify(evtPayload),
        });
        if (evtRes.ok) {
          const evtData = await evtRes.json();
          const evtId = evtData.id || evtData.event?.id;
          console.log(`[Push Booking] Created via /calendars/events: ${evtId}, room: ${booking.room_name}`);
          return evtId || null;
        }
        const evtErr = await evtRes.text();
        console.error(`[Push Booking] /calendars/events also failed: [${evtRes.status}] ${evtErr}`);
        // Last resort: try block-slots
        const blockPayload = { calendarId: roomSetting.ghl_calendar_id, locationId: GHL_LOCATION_ID, title: titleForGhl, startTime: startISOwTZ, endTime: endISOwTZ };
        const blockRes = await ghlFetch(`${GHL_API_BASE}/calendars/events/block-slots`, { method: 'POST', headers: calEventHeaders, body: JSON.stringify(blockPayload) });
        if (blockRes.ok) {
          const blockData = await blockRes.json();
          const blockId = blockData.id || blockData.event?.id;
          console.log(`[Push Booking] Created via block-slots: ${blockId}, room: ${booking.room_name}`);
          return blockId || null;
        }
        const blockErr = await blockRes.text();
        console.error(`[Push Booking] Block-slots also failed: [${blockRes.status}] ${blockErr}`);
        return null;
      };

      // Helper: delete an existing GHL appointment (for room changes)
      const deleteOldAppointment = async (eventId: string): Promise<void> => {
        try {
          const delRes = await ghlFetch(`${GHL_API_BASE}/calendars/events/appointments/${eventId}`, {
            method: 'DELETE', headers: calEventHeaders,
          });
          if (delRes.ok || delRes.status === 404) {
            await delRes.text();
            console.log(`[Push Booking] Deleted old appointment: ${eventId}`);
          } else {
            const delErr = await delRes.text();
            console.warn(`[Push Booking] Failed to delete old appointment ${eventId}: ${delErr}`);
            // Also try block-slots delete
            const delRes2 = await ghlFetch(`${GHL_API_BASE}/calendars/events/block-slots/${eventId}`, {
              method: 'DELETE', headers: calEventHeaders,
            });
            await delRes2.text();
          }
        } catch (e) {
          console.warn(`[Push Booking] Error deleting old appointment: ${e}`);
        }
      };

      // Track inactive-calendar detection so we can skip gracefully
      let calendarInactive = false;

      // Helper: create appointment with /calendars/events fallback, returns new event ID or null
      const createNewAppointment = async (): Promise<string | null> => {
        const res = await ghlFetch(`${GHL_API_BASE}/calendars/events/appointments`, {
          method: 'POST', headers: calEventHeaders, body: JSON.stringify(eventPayload),
        });
        if (res.ok) {
          const created = await res.json();
          const newId = created.id || created.event?.id;
          console.log(`[Push Booking] Created GHL appointment: ${newId}, room: ${booking.room_name}, calendar: ${roomSetting.ghl_calendar_id}`);
          return newId || null;
        }
        const errText = await res.text();
        // Detect inactive calendar — benign, do not retry through fallbacks
        if (/calendar is inactive/i.test(errText)) {
          console.warn(`[Push Booking] Calendar ${roomSetting.ghl_calendar_id} is inactive (detected on POST), skipping fallbacks`);
          calendarInactive = true;
          return null;
        }
        console.warn(`[Push Booking] Appointment create failed: [${res.status}] ${errText}, trying /calendars/events for room: ${booking.room_name}`);
        return await createViaCalendarEvents();
      };

      let syncSuccess = false;
      try {
        if (booking.ghl_event_id) {
          // Try updating existing appointment
          const res = await ghlFetch(`${GHL_API_BASE}/calendars/events/appointments/${booking.ghl_event_id}`, {
            method: 'PUT', headers: calEventHeaders, body: JSON.stringify(eventPayload),
          });
          if (res.ok) {
            await res.json().catch(() => ({}));
            console.log(`[Push Booking] Updated GHL appointment: ${booking.ghl_event_id}, room: ${booking.room_name}, calendar: ${roomSetting.ghl_calendar_id}`);
            syncSuccess = true;
          } else {
            const errText = await res.text();
            console.warn(`[Push Booking] Update failed [${res.status}]: ${errText}. Deleting old and creating new in correct calendar.`);
            // Room may have changed, or appointment doesn't exist anymore → delete old + create new
            await deleteOldAppointment(booking.ghl_event_id);
            const newId = await createNewAppointment();
            if (newId) {
              await supabase.from('bookings').update({ ghl_event_id: newId }).eq('id', booking.id);
              syncSuccess = true;
            }
          }
        } else {
          // No existing GHL event → create new
          const newId = await createNewAppointment();
          if (newId) {
            await supabase.from('bookings').update({ ghl_event_id: newId }).eq('id', booking.id);
            syncSuccess = true;
          }
        }

        await logSyncOperation(supabase, authUser.id, 'push-booking', 'booking', {
          entity_id: booking.id, bookingId: booking.id, room: booking.room_name,
          calendarId: roomSetting.ghl_calendar_id, contactId: ghlContactId, title: booking.title,
          syncSuccess,
        }, syncSuccess ? 'success' : 'error');

        if (syncSuccess) {
          return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        } else if (calendarInactive) {
          // Benign skip — calendar is disabled in GHL. Local save proceeds, no retry queued.
          return new Response(JSON.stringify({ success: true, skipped: 'calendar_inactive' }), {
            status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } else {
          return new Response(JSON.stringify({ success: false, error: 'Both appointment and block-slots creation failed' }), {
            status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } catch (err) {
        console.error(`[Push Booking] Error for room ${booking.room_name}, calendar ${roomSetting.ghl_calendar_id}:`, err);
        await logSyncOperation(supabase, authUser.id, 'push-booking', 'booking', { error: String(err), bookingId: booking.id, room: booking.room_name, calendarId: roomSetting.ghl_calendar_id }, 'error');
        return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // =================== push-all-bookings ===================
    if (action === 'push-all-bookings') {
      const batchSize = body.batchSize || 5;
      const offset = body.offset || 0;
      console.log(`[Push All Bookings] Batch push offset=${offset}, batchSize=${batchSize}`);

      // Load room → calendar mapping
      const { data: roomSettings } = await supabase
        .from('room_settings')
        .select('room_name, ghl_calendar_id')
        .in('user_id', orgUserIds)
        .not('ghl_calendar_id', 'is', null);

      const roomToCalendar: Record<string, string> = {};
      for (const rs of roomSettings || []) {
        if (rs.ghl_calendar_id) roomToCalendar[rs.room_name] = rs.ghl_calendar_id;
      }

      // Count total missing first
      const onlyMissing = body.onlyMissing !== false;
      let countQuery = supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .in('user_id', orgUserIds);
      if (onlyMissing) countQuery = countQuery.is('ghl_event_id', null);
      const { count: totalCount } = await countQuery;

      // Load batch of bookings
      let bookingsQuery = supabase
        .from('bookings')
        .select('*')
        .in('user_id', orgUserIds)
        .order('date', { ascending: true })
        .range(offset, offset + batchSize - 1);
      if (onlyMissing) {
        bookingsQuery = bookingsQuery.is('ghl_event_id', null);
      }
      const { data: allBookings } = await bookingsQuery;

      console.log(`[Push All Bookings] Found ${allBookings?.length || 0} bookings to push`);

      const calEventHeaders = { ...ghlHeaders, 'Version': '2021-04-15' };
      let pushed = 0;
      let skipped = 0;
      let errors = 0;

      // Build a cache of contact_id → ghl_contact_id
      const contactIds = [...new Set((allBookings || []).map(b => b.contact_id).filter(Boolean))];
      const contactGhlMap: Record<string, string> = {};
      if (contactIds.length > 0) {
        const { data: contacts } = await supabase
          .from('contacts')
          .select('id, ghl_contact_id, first_name, last_name, email, phone')
          .in('id', contactIds);
        for (const c of contacts || []) {
          if (c.ghl_contact_id) contactGhlMap[c.id] = c.ghl_contact_id;
        }
      }

      for (const booking of allBookings || []) {
        const calendarId = roomToCalendar[booking.room_name];
        if (!calendarId) {
          console.warn(`[Push All Bookings] No calendar for room: ${booking.room_name}, skipping`);
          skipped++;
          continue;
        }

        // Resolve GHL contact
        let ghlContactId = booking.contact_id ? (contactGhlMap[booking.contact_id] || null) : null;
        if (!ghlContactId) {
          // Create minimal contact in GHL
          const nameParts = (booking.contact_name || 'Reservering').split(' ');
          const cPayload = { firstName: nameParts[0], lastName: nameParts.slice(1).join(' ') || '-', locationId: GHL_LOCATION_ID };
          const cRes = await ghlFetch(`${GHL_API_BASE}/contacts/`, { method: 'POST', headers: ghlHeaders, body: JSON.stringify(cPayload) });
          if (cRes.ok) {
            const cData = await cRes.json();
            ghlContactId = cData.contact?.id || null;
            if (ghlContactId && booking.contact_id) {
              contactGhlMap[booking.contact_id] = ghlContactId;
              await supabase.from('contacts').update({ ghl_contact_id: ghlContactId }).eq('id', booking.contact_id);
            }
          } else {
            const cErr = await cRes.text();
            // Try extract ID from duplicate error
            const idMatch = cErr.match(/"id"\s*:\s*"([^"]+)"/);
            if (idMatch) {
              ghlContactId = idMatch[1];
              if (booking.contact_id) {
                contactGhlMap[booking.contact_id] = ghlContactId!;
                await supabase.from('contacts').update({ ghl_contact_id: ghlContactId }).eq('id', booking.contact_id);
              }
            }
          }
        }

        if (!ghlContactId) {
          console.warn(`[Push All] No GHL contact for booking: ${booking.title}, skipping`);
          skipped++;
          continue;
        }

        const startH = String(booking.start_hour).padStart(2, '0');
        const startM = String(booking.start_minute ?? 0).padStart(2, '0');
        const endH = String(booking.end_hour).padStart(2, '0');
        const endM = String(booking.end_minute ?? 0).padStart(2, '0');

        // If end hour is past midnight (< 7) and start is during the day, use next day for end
        let endDateStr = booking.date;
        if (booking.end_hour < 7 && booking.start_hour >= 7) {
          const nextDay = new Date(booking.date + 'T12:00:00Z');
          nextDay.setUTCDate(nextDay.getUTCDate() + 1);
          endDateStr = nextDay.toISOString().slice(0, 10);
        }

        const probeDate = new Date(`${booking.date}T12:00:00Z`);
        const amStr = probeDate.toLocaleString('en-US', { timeZone: 'Europe/Amsterdam', hour12: false });
        const amDate = new Date(amStr);
        const offsetH = Math.round((amDate.getTime() - probeDate.getTime()) / 3600000);
        const tz = `${offsetH >= 0 ? '+' : '-'}${String(Math.abs(offsetH)).padStart(2, '0')}:00`;
        const startISO = `${booking.date}T${startH}:${startM}:00${tz}`;
        const endISO = `${endDateStr}T${endH}:${endM}:00${tz}`;

        const ghlPayload: Record<string, any> = {
          calendarId,
          locationId: GHL_LOCATION_ID,
          contactId: ghlContactId,
          title: booking.title || 'Reservering',
          startTime: startISO,
          endTime: endISO,
          appointmentStatus: booking.status === 'confirmed' ? 'confirmed' : 'new',
          ignoreDateRange: true,
          ignoreValidation: true,
          ignoreFreeSlotValidation: true,
          selectedTimezone: 'Europe/Amsterdam',
        };
        if (booking.notes) ghlPayload.notes = booking.notes;

        try {
          await delay(500);

          // Helper for block-slots fallback in bulk push
          const bulkBlockSlotsFallback = async (): Promise<string | null> => {
            console.log(`[Push All] Falling back to block-slots for: ${booking.title}, calendar: ${calendarId}`);
            const blockPayload = {
              calendarId,
              locationId: GHL_LOCATION_ID,
              title: booking.title || 'Reservering',
              startTime: startISO,
              endTime: endISO,
            };
            const blockRes = await ghlFetch(`${GHL_API_BASE}/calendars/events/block-slots`, {
              method: 'POST', headers: calEventHeaders, body: JSON.stringify(blockPayload),
            });
            if (blockRes.ok) {
              const blockData = await blockRes.json();
              return blockData.id || blockData.event?.id || null;
            }
            const blockErr = await blockRes.text();
            console.error(`[Push All] Block-slots also failed: [${blockRes.status}] ${blockErr}`);
            return null;
          };

          if (booking.ghl_event_id) {
            const res = await ghlFetch(`${GHL_API_BASE}/calendars/events/appointments/${booking.ghl_event_id}`, {
              method: 'PUT', headers: calEventHeaders, body: JSON.stringify(ghlPayload),
            });
            if (res.ok) {
              await res.text();
              pushed++;
            } else if (res.status === 404) {
              await res.text();
              const createRes = await ghlFetch(`${GHL_API_BASE}/calendars/events/appointments`, {
                method: 'POST', headers: calEventHeaders, body: JSON.stringify(ghlPayload),
              });
              if (createRes.ok) {
                const created = await createRes.json();
                const newId = created.id || created.event?.id;
                if (newId) await supabase.from('bookings').update({ ghl_event_id: newId }).eq('id', booking.id);
                pushed++;
              } else {
                const ce = await createRes.text();
                console.warn(`[Push All] Appointment failed: [${createRes.status}] ${ce}, trying block-slots`);
                const blockId = await bulkBlockSlotsFallback();
                if (blockId) { await supabase.from('bookings').update({ ghl_event_id: blockId }).eq('id', booking.id); pushed++; }
                else errors++;
              }
            } else if (res.status === 429) { await res.text(); break; }
            else {
              const et = await res.text();
              console.warn(`[Push All] Update failed: [${res.status}] ${et}, trying block-slots`);
              const blockId = await bulkBlockSlotsFallback();
              if (blockId) { await supabase.from('bookings').update({ ghl_event_id: blockId }).eq('id', booking.id); pushed++; }
              else errors++;
            }
          } else {
            const res = await ghlFetch(`${GHL_API_BASE}/calendars/events/appointments`, {
              method: 'POST', headers: calEventHeaders, body: JSON.stringify(ghlPayload),
            });
            if (res.ok) {
              const created = await res.json();
              const newId = created.id || created.event?.id;
              if (newId) {
                await supabase.from('bookings').update({ ghl_event_id: newId }).eq('id', booking.id);
                console.log(`[Push All Bookings] Created: ${booking.title} → ${newId} (cal: ${calendarId}, room: ${booking.room_name})`);
              }
              pushed++;
            } else if (res.status === 429) { await res.text(); break; }
            else {
              const errText = await res.text();
              console.warn(`[Push All Bookings] Appointment failed: ${booking.title} [${res.status}] ${errText}, trying block-slots`);
              const blockId = await bulkBlockSlotsFallback();
              if (blockId) {
                await supabase.from('bookings').update({ ghl_event_id: blockId }).eq('id', booking.id);
                console.log(`[Push All Bookings] Created via block-slots: ${booking.title} → ${blockId} (cal: ${calendarId}, room: ${booking.room_name})`);
                pushed++;
              } else errors++;
            }
          }
        } catch (err) {
          console.error(`[Push All Bookings] Error for ${booking.id}:`, err);
          errors++;
        }
      }

      const batchProcessed = allBookings?.length || 0;
      const hasMore = onlyMissing ? (pushed + skipped + errors) < (totalCount || 0) - offset : batchProcessed === batchSize;
      // For onlyMissing: since successfully pushed items lose their NULL ghl_event_id,
      // the next call with offset=0 will get the next batch automatically
      const nextOffset = onlyMissing ? 0 : offset + batchSize;

      await logSyncOperation(supabase, authUser.id, 'push-all-bookings', 'booking', { pushed, skipped, errors, batchProcessed, totalRemaining: totalCount || 0, offset });
      return new Response(JSON.stringify({ success: true, pushed, skipped, errors, total: totalCount || 0, batchProcessed, hasMore: (totalCount || 0) > batchProcessed, nextOffset }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // =================== delete-booking ===================
    if (action === 'delete-booking') {
      const { ghl_event_id } = body;
      if (!ghl_event_id) {
        return new Response(JSON.stringify({ success: true, skipped: 'no ghl_event_id' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`[Delete Booking] Deleting GHL appointment: ${ghl_event_id}`);
      const calEventHeaders = { ...ghlHeaders, 'Version': '2021-04-15' };

      try {
        // Try appointments endpoint first
        const res = await ghlFetch(`${GHL_API_BASE}/calendars/events/appointments/${ghl_event_id}`, {
          method: 'DELETE',
          headers: calEventHeaders,
        });
        if (res.ok || res.status === 404) {
          await res.text();
          console.log(`[Delete Booking] Deleted GHL appointment: ${ghl_event_id}`);
          await logSyncOperation(supabase, authUser.id, 'delete-booking', 'booking', { ghlEventId: ghl_event_id });
        } else {
          const errText = await res.text();
          console.error(`[Delete Booking] Failed: [${res.status}] ${errText}`);
          // Fallback: try block-slots delete
          const res2 = await ghlFetch(`${GHL_API_BASE}/calendars/events/block-slots/${ghl_event_id}`, {
            method: 'DELETE', headers: calEventHeaders,
          });
          if (res2.ok || res2.status === 404) {
            await res2.text();
            console.log(`[Delete Booking] Deleted via block-slots fallback: ${ghl_event_id}`);
          } else {
            await res2.text();
          }
          await logSyncOperation(supabase, authUser.id, 'delete-booking', 'booking', { error: errText, ghlEventId: ghl_event_id }, 'error');
        }
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (err) {
        console.error('[Delete Booking] Error:', err);
        return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // =================== process-sync-queue ===================
    if (action === 'process-sync-queue') {
      console.log(`[Process Queue] Processing pending sync queue items`);
      
      const { data: pendingItems } = await supabase
        .from('sync_queue')
        .select('*')
        .in('status', ['pending', 'retrying'])
        .order('created_at', { ascending: true })
        .limit(10);

      if (!pendingItems || pendingItems.length === 0) {
        return new Response(JSON.stringify({ success: true, processed: 0, message: 'No pending items' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let processed = 0, succeeded = 0, failed = 0;
      const selfUrl = `${SUPABASE_URL}/functions/v1/ghl-sync`;

      for (const item of pendingItems) {
        processed++;
        const payload = item.payload as Record<string, any>;

        await supabase.from('sync_queue').update({
          status: 'retrying',
          retry_count: (item.retry_count || 0) + 1,
          last_attempt_at: new Date().toISOString(),
        }).eq('id', item.id);

        try {
          let replayPayload = payload;

          // Re-fetch current data for replay (payload may be stale)
          if (item.entity_type === 'booking' && (item.action_type === 'create' || item.action_type === 'update')) {
            const { data: currentBooking } = await supabase.from('bookings').select('*').eq('id', item.entity_id).single();
            if (!currentBooking) {
              await supabase.from('sync_queue').delete().eq('id', item.id);
              console.log(`[Process Queue] Booking ${item.entity_id} deleted, removed from queue`);
              continue;
            }
            replayPayload = { action: 'push-booking', booking: currentBooking };
          } else if (item.entity_type === 'booking' && item.action_type === 'delete') {
            // Use original payload for delete (needs ghl_event_id)
            replayPayload = payload?.action ? payload : { action: 'delete-booking', ghl_event_id: payload?.ghl_event_id || payload?.booking?.ghl_event_id };
          } else if (item.entity_type === 'contact' && (item.action_type === 'create' || item.action_type === 'update')) {
            const { data: currentContact } = await supabase.from('contacts').select('*').eq('id', item.entity_id).single();
            if (!currentContact) {
              await supabase.from('sync_queue').delete().eq('id', item.id);
              continue;
            }
            replayPayload = { action: 'push-contact', contact: currentContact };
          } else if (item.entity_type === 'contact' && item.action_type === 'delete') {
            replayPayload = payload?.action ? payload : { action: 'delete-contact', ghl_contact_id: payload?.ghl_contact_id };
          } else if (item.entity_type === 'company' && (item.action_type === 'create' || item.action_type === 'update')) {
            const { data: currentCompany } = await supabase.from('companies').select('*').eq('id', item.entity_id).single();
            if (!currentCompany) {
              await supabase.from('sync_queue').delete().eq('id', item.id);
              continue;
            }
            replayPayload = { action: 'push-company', company: currentCompany };
          } else if (item.entity_type === 'company' && item.action_type === 'delete') {
            replayPayload = payload?.action ? payload : { action: 'delete-company', ghl_company_id: payload?.ghl_company_id };
          } else if (item.entity_type === 'task' && (item.action_type === 'create' || item.action_type === 'update')) {
            const { data: currentTask } = await supabase.from('tasks').select('*').eq('id', item.entity_id).single();
            if (!currentTask) {
              await supabase.from('sync_queue').delete().eq('id', item.id);
              continue;
            }
            replayPayload = { action: 'push-task', task: currentTask };
          } else if (item.entity_type === 'task' && item.action_type === 'delete') {
            replayPayload = payload?.action ? payload : { action: 'delete-task', ghl_task_id: payload?.ghl_task_id, contact_id: payload?.contact_id };
          } else if (item.entity_type === 'inquiry' && (item.action_type === 'create' || item.action_type === 'update')) {
            const { data: currentInquiry } = await supabase.from('inquiries').select('*').eq('id', item.entity_id).single();
            if (!currentInquiry) {
              await supabase.from('sync_queue').delete().eq('id', item.id);
              continue;
            }
            replayPayload = { action: 'push-inquiry', inquiry_id: currentInquiry.id, contact_name: currentInquiry.contact_name, event_type: currentInquiry.event_type, budget: currentInquiry.budget, status: currentInquiry.status, message: currentInquiry.message };
          } else if (item.entity_type === 'inquiry' && item.action_type === 'delete') {
            replayPayload = payload?.action ? payload : { action: 'delete-inquiry', ghl_opportunity_id: payload?.ghl_opportunity_id };
          }

          const result = await ghlFetch(selfUrl, {
            method: 'POST',
            headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
            body: JSON.stringify(replayPayload),
          });

          let resultBody: Record<string, any> | null = null;
          try {
            resultBody = await result.clone().json();
          } catch (_) { /* non-JSON response is handled by HTTP status */ }
          const functionSucceeded = result.ok && resultBody?.ok !== false && !resultBody?.error;

          if (functionSucceeded) {
            await supabase.from('sync_queue').update({
              status: 'completed', completed_at: new Date().toISOString(),
            }).eq('id', item.id);
            succeeded++;
            console.log(`[Process Queue] ✓ ${item.entity_type}/${item.action_type} for ${item.entity_id}`);
          } else {
            const errText = resultBody?.error
              ? String(resultBody.error)
              : await result.text();
            const newRetry = (item.retry_count || 0) + 1;
            await supabase.from('sync_queue').update({
              status: newRetry >= (item.max_retries || 5) ? 'failed' : 'pending',
              last_error: errText.substring(0, 500),
              last_attempt_at: new Date().toISOString(),
              retry_count: newRetry,
            }).eq('id', item.id);
            failed++;
            console.log(`[Process Queue] ✗ ${item.entity_type}/${item.action_type}: ${errText.substring(0, 200)}`);
          }
        } catch (err: any) {
          const newRetry = (item.retry_count || 0) + 1;
          await supabase.from('sync_queue').update({
            status: newRetry >= (item.max_retries || 5) ? 'failed' : 'pending',
            last_error: err?.message || 'Unknown error',
            last_attempt_at: new Date().toISOString(),
            retry_count: newRetry,
          }).eq('id', item.id);
          failed++;
        }

        await delay(300); // Reduced delay between queue items
      }

      console.log(`[Process Queue] Done: ${processed} processed, ${succeeded} ok, ${failed} failed`);
      return new Response(JSON.stringify({ success: true, processed, succeeded, failed }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'push-document') {
      // Push a CRM quote/invoice to GHL as a document
      const { documentType, documentId, title, contactName, amount, status: docStatus, ghlContactId, ghlOpportunityId } = body;
      
      if (!documentId || !documentType) {
        return new Response(JSON.stringify({ error: 'documentId and documentType required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`[Push Document] Pushing ${documentType} ${documentId} to GHL`);

      // Log the sync for tracking
      await logSyncOperation(supabase, authUser.id, 'push-document', documentType, {
        entity_id: documentId,
        title,
        contact: contactName,
        amount,
        status: docStatus,
        ghl_opportunity_id: ghlOpportunityId,
      });

      // If there's a linked opportunity, update its monetary value
      if (ghlOpportunityId && amount) {
        try {
          const oppUpdateRes = await ghlFetch(`${GHL_API_BASE}/opportunities/${ghlOpportunityId}`, {
            method: 'PUT',
            headers: ghlHeaders,
            body: JSON.stringify({ monetaryValue: amount }),
          });
          if (oppUpdateRes.ok) {
            console.log(`[Push Document] Updated GHL opportunity ${ghlOpportunityId} monetary value: ${amount}`);
          } else {
            console.warn(`[Push Document] Failed to update opportunity monetary value: ${oppUpdateRes.status}`);
          }
        } catch (e) {
          console.warn('[Push Document] Non-fatal: opportunity update failed:', e);
        }
      }

      return new Response(JSON.stringify({ success: true, message: 'Document sync logged' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
