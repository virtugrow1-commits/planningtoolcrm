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
      // Fetch calendars/events from GHL
      const calRes = await fetch(`${GHL_API_BASE}/calendars/?locationId=${GHL_LOCATION_ID}`, {
        headers: ghlHeaders,
      });
      if (!calRes.ok) {
        const errText = await calRes.text();
        throw new Error(`GHL calendars fetch failed [${calRes.status}]: ${errText}`);
      }
      const calData = await calRes.json();

      return new Response(JSON.stringify({ success: true, calendars: calData.calendars || [] }), {
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

      return new Response(JSON.stringify({
        success: true,
        contactsSynced,
        contactsPushed,
        totalGhlContacts: allContacts.length,
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
