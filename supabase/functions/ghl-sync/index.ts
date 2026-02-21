import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const GHL_API_BASE = 'https://services.leadconnectorhq.com';

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
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const anonClient = createClient(SUPABASE_URL, anonKey);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(authHeader.replace('Bearer ', ''));
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { action } = await req.json();

    const ghlHeaders = {
      'Authorization': `Bearer ${GHL_API_KEY}`,
      'Content-Type': 'application/json',
      'Version': '2021-07-28',
    };

    if (action === 'sync-contacts') {
      // Fetch contacts from GHL
      let allContacts: any[] = [];
      let nextPageUrl = `${GHL_API_BASE}/contacts/?locationId=${GHL_LOCATION_ID}&limit=100`;

      while (nextPageUrl) {
        const res = await fetch(nextPageUrl, { headers: ghlHeaders });
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`GHL contacts fetch failed [${res.status}]: ${errText}`);
        }
        const data = await res.json();
        allContacts = allContacts.concat(data.contacts || []);
        nextPageUrl = data.meta?.nextPageUrl || null;
      }

      // Upsert contacts into database
      let synced = 0;
      for (const ghlContact of allContacts) {
        const firstName = ghlContact.firstName || ghlContact.name?.split(' ')[0] || 'Onbekend';
        const lastName = ghlContact.lastName || ghlContact.name?.split(' ').slice(1).join(' ') || '';

        // Check if contact exists by ghl_contact_id
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

      return new Response(JSON.stringify({ success: true, synced, total: allContacts.length }), {
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
          const res = await fetch(`${GHL_API_BASE}/contacts/${contact.ghl_contact_id}`, {
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
          const res = await fetch(`${GHL_API_BASE}/contacts/`, {
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
      const calRes = await fetch(`${GHL_API_BASE}/calendars/?locationId=${GHL_LOCATION_ID}`, {
        headers: ghlHeaders,
      });
      if (!calRes.ok) {
        const errText = await calRes.text();
        throw new Error(`GHL calendars fetch failed [${calRes.status}]: ${errText}`);
      }
      const calData = await calRes.json();
      const calendars = calData.calendars || [];

      // Fetch events from each calendar (next 90 days)
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

      // Upsert events as bookings
      let synced = 0;
      for (const evt of allEvents) {
        const startDate = new Date(evt.startTime || evt.start);
        const endDateEvt = new Date(evt.endTime || evt.end);
        const dateStr = startDate.toISOString().split('T')[0];
        const startHour = startDate.getHours();
        const endHour = endDateEvt.getHours() || 17;
        const contactName = evt.contact?.name || evt.title || 'GHL Afspraak';
        const title = evt.title || evt.calendarName || 'GHL Afspraak';
        const status = (evt.status === 'confirmed' || evt.appointmentStatus === 'confirmed') ? 'confirmed' : 'option';

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
            end_hour: endHour,
            title,
            contact_name: contactName,
            status,
          }).eq('id', existing.id);
        } else {
          await supabase.from('bookings').insert({
            user_id: user.id,
            ghl_event_id: evt.id,
            room_name: evt.calendarName || 'Vergaderzaal 100',
            date: dateStr,
            start_hour: startHour,
            end_hour: endHour,
            title,
            contact_name: contactName,
            status,
          });
        }
        synced++;
      }

      return new Response(JSON.stringify({ success: true, synced, totalEvents: allEvents.length, calendars: calendars.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'sync-opportunities') {
      // First get pipelines to map stage IDs to names
      const pipelinesRes = await fetch(`${GHL_API_BASE}/opportunities/pipelines?locationId=${GHL_LOCATION_ID}`, {
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
        const res = await fetch(
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
        const res = await fetch(nextPageUrl, { headers: ghlHeaders });
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`GHL contacts fetch failed [${res.status}]: ${errText}`);
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
        const res = await fetch(`${GHL_API_BASE}/contacts/`, {
          method: 'POST',
          headers: ghlHeaders,
          body: JSON.stringify({
            firstName: contact.first_name,
            lastName: contact.last_name,
            email: contact.email || undefined,
            phone: contact.phone || undefined,
            companyName: contact.company || undefined,
            locationId: GHL_LOCATION_ID,
          }),
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
        const pipelinesRes = await fetch(`${GHL_API_BASE}/opportunities/pipelines?locationId=${GHL_LOCATION_ID}`, {
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
            const res = await fetch(
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

          for (const evt of allEvents) {
            const evtStart = new Date(evt.startTime || evt.start);
            const evtEnd = new Date(evt.endTime || evt.end);
            const dateStr = evtStart.toISOString().split('T')[0];
            const startHour = evtStart.getHours();
            const endHour = evtEnd.getHours() || 17;
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
                end_hour: endHour,
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
                end_hour: endHour,
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
