import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GHL_API_BASE = 'https://services.leadconnectorhq.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

  try {
    const payload = await req.json();
    console.log('GHL webhook received:', JSON.stringify(payload).substring(0, 500));

    const type = payload.type || payload.event || '';

    // Get primary user_id
    const { data: anyUser } = await supabase.from('contacts').select('user_id').limit(1).maybeSingle();
    const { data: anyBookingUser } = await supabase.from('bookings').select('user_id').limit(1).maybeSingle();
    const userId = anyUser?.user_id || anyBookingUser?.user_id;
    if (!userId) {
      return new Response(JSON.stringify({ error: 'No user found' }), { status: 200, headers: corsHeaders });
    }

    const ghlHeaders = {
      'Authorization': `Bearer ${GHL_API_KEY}`,
      'Content-Type': 'application/json',
      'Version': '2021-07-28',
    };

    // Detect webhook type
    const hasPipelineData = payload.pipeline_id || payload.pipleline_stage || payload.pipeline_name || payload.opportunity_name;
    const hasContactData = payload.contact_id && (payload.first_name || payload.last_name || payload.full_name);
    const hasAppointmentData = payload.startTime || payload.appointmentId || payload.calendarId;
    const hasFormData = payload['Type Evenement'] !== undefined || payload['Aantal gasten'] !== undefined || payload['Selecteer de gewenste datum'] !== undefined || payload['Kies je dagdeel'] !== undefined;
    const hasMessageData = type.includes('InboundMessage') || type.includes('inbound') || type.includes('message') || (payload.body && payload.conversationId);
    const hasDocumentData = type.includes('Document') || type.includes('document') || type.includes('Proposal') || type.includes('proposal') || type.includes('Invoice') || type.includes('invoice') || type.includes('Estimate') || type.includes('estimate') || payload.documentId || payload.proposalId || payload.estimateId;

    // Handle different webhook types
    if (hasDocumentData) {
      await handleDocumentWebhook(supabase, ghlHeaders, userId, payload, type);
    } else if (hasMessageData) {
      await handleInboundMessage(supabase, ghlHeaders, userId, payload);
    } else if (hasFormData) {
      await handleFormSubmission(supabase, userId, payload);
    } else if (type.includes('opportunity') || type.includes('OpportunityStatus') || type.includes('pipeline') || (hasPipelineData && !hasAppointmentData)) {
      await handleOpportunityFromWebhookPayload(supabase, ghlHeaders, GHL_LOCATION_ID, userId, payload);
    } else if (type.includes('contact') || type.includes('Contact') || (hasContactData && !hasPipelineData && !hasAppointmentData)) {
      await handleContactWebhook(supabase, userId, payload);
    } else if (type.includes('appointment') || type.includes('calendar') || type.includes('event') || hasAppointmentData) {
      await handleAppointmentWebhook(supabase, userId, payload);
    } else {
      console.log('Unknown webhook type, trying form handler as fallback:', type);
      const keys = Object.keys(payload);
      const hasDutchFields = keys.some(k => /[a-zà-ÿ]/i.test(k) && k.includes(' '));
      if (hasDutchFields) {
        await handleFormSubmission(supabase, userId, payload);
      } else {
        console.log('Skipping unknown webhook type:', type);
      }
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('Webhook error:', e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});

async function handleFormSubmission(supabase: any, userId: string, payload: any) {
  // Extract contact info from GHL form payload
  const email = payload.email || payload.Email || payload['E-mail'] || payload['E-mailadres'] || null;
  const phone = payload.phone || payload.Phone || payload.Telefoon || payload.Telefoonnummer || null;
  const fullName = payload.full_name || payload.contact_name || payload.name || payload.Naam || payload['Volledige naam'] || '';
  const firstName = payload.first_name || payload.firstName || fullName.split(' ')[0] || 'Onbekend';
  const lastName = payload.last_name || payload.lastName || fullName.split(' ').slice(1).join(' ') || '';
  const companyName = payload.company || payload.companyName || payload.Bedrijf || payload.Bedrijfsnaam || payload['Naam bedrijf'] || null;

  // Extract inquiry data from Dutch form fields
  const eventType = payload['Type Evenement'] || payload.event_type || payload['Soort evenement'] || 'Aanvraag via formulier';
  const guestCount = parseInt(payload['Aantal gasten'] || payload.guest_count || '0', 10) || 0;
  const preferredDate = payload['Selecteer de gewenste datum'] || payload.preferred_date || null;
  const dagdeel = payload['Kies je dagdeel'] || '';
  const roomPreference = payload['Gewenste zaalopstelling'] || payload.room_preference || null;
  const message = payload['Extra informatie'] || payload.message || payload.Opmerkingen || '';
  const budget = payload.budget || payload.Budget ? Number(payload.budget || payload.Budget) : null;
  const ghlContactId = payload.contact_id || payload.contactId || null;
  const formSource = payload.form_name || payload.formName || payload.workflow_name || payload.workflowName || payload['Form Name'] || payload.source || null;

  // Build full message with dagdeel info
  const fullMessage = [
    message,
    dagdeel ? `Dagdeel: ${dagdeel}` : '',
    payload['Gewenste catering'] ? `Catering: ${payload['Gewenste catering']}` : '',
    payload['Speciale Benodigdheden'] ? `Speciale benodigdheden: ${payload['Speciale Benodigdheden']}` : '',
    payload['Na-zit gewenst?'] ? `Na-zit: ${payload['Na-zit gewenst?']}` : '',
    payload['Service Type'] ? `Service: ${payload['Service Type']}` : '',
  ].filter(Boolean).join('\n');


  const contactName = `${firstName} ${lastName}`.trim() || 'Onbekend';

  // Step 1: Find or create contact
  let contactId: string | null = null;
  let companyId: string | null = null;

  if (email) {
    // Try to match by email first
    const { data: existingContact } = await supabase
      .from('contacts')
      .select('id, company_id')
      .eq('email', email)
      .limit(1)
      .maybeSingle();

    if (existingContact) {
      contactId = existingContact.id;
      companyId = existingContact.company_id;
      console.log(`Form: Found existing contact by email: ${email} -> ${contactId}`);
    }
  }

  if (!contactId && ghlContactId) {
    // Try match by GHL contact ID
    const { data: ghlMatch } = await supabase
      .from('contacts')
      .select('id, company_id')
      .eq('ghl_contact_id', ghlContactId)
      .maybeSingle();
    if (ghlMatch) {
      contactId = ghlMatch.id;
      companyId = ghlMatch.company_id;
      console.log(`Form: Found existing contact by GHL ID: ${ghlContactId} -> ${contactId}`);
    }
  }

  // Step 2: Create company if needed
  if (!companyId && companyName) {
    // Try find existing company by name
    const { data: existingCompany } = await supabase
      .from('companies')
      .select('id')
      .ilike('name', companyName.trim())
      .limit(1)
      .maybeSingle();

    if (existingCompany) {
      companyId = existingCompany.id;
      console.log(`Form: Found existing company: ${companyName} -> ${companyId}`);
    } else {
      const { data: newCompany } = await supabase
        .from('companies')
        .insert({
          user_id: userId,
          name: companyName.trim(),
          kvk: payload['KVK'] || null,
          btw_number: payload['BTW'] || null,
        })
        .select('id')
        .single();
      if (newCompany) {
        companyId = newCompany.id;
        console.log(`Form: Created new company: ${companyName} -> ${companyId}`);
      }
    }
  }

  // Step 3: Create contact if needed
  if (!contactId) {
    const { data: newContact } = await supabase
      .from('contacts')
      .insert({
        user_id: userId,
        first_name: firstName,
        last_name: lastName || '',
        email: email,
        phone: phone,
        company: companyName,
        company_id: companyId,
        ghl_contact_id: ghlContactId,
        status: 'lead',
      })
      .select('id')
      .single();
    if (newContact) {
      contactId = newContact.id;
      console.log(`Form: Created new contact: ${contactName} -> ${contactId}`);
    }
  } else if (companyId) {
    // Update existing contact with company if not set
    await supabase
      .from('contacts')
      .update({ company_id: companyId, company: companyName })
      .eq('id', contactId)
      .is('company_id', null);
  }

  // Step 4: Check for duplicate/existing inquiry before creating a new one
  // IMPORTANT: Always prefer updating existing inquiries over creating new ones.
  // This prevents duplicates when a room change or other edit triggers a webhook.
  let duplicateFound = false;

  // 4a: Check if contact already has ANY inquiry with the same event_type (regardless of age)
  if (contactId) {
    const { data: existingByContact } = await supabase
      .from('inquiries')
      .select('id')
      .eq('user_id', userId)
      .eq('contact_id', contactId)
      .eq('event_type', eventType)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingByContact) {
      console.log(`Form: Existing inquiry found by contact_id+event_type, updating ${existingByContact.id}`);
      await supabase.from('inquiries').update({
        preferred_date: preferredDate, room_preference: roomPreference,
        guest_count: guestCount, budget: budget,
        message: fullMessage || null,
      }).eq('id', existingByContact.id);
      duplicateFound = true;
    }
  }

  // 4b: Check by contact_name + event_type (fallback)
  if (!duplicateFound) {
    const { data: existingByName } = await supabase
      .from('inquiries')
      .select('id')
      .eq('user_id', userId)
      .ilike('contact_name', contactName)
      .eq('event_type', eventType)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingByName) {
      console.log(`Form: Existing inquiry found by contact_name+event_type, updating ${existingByName.id}`);
      await supabase.from('inquiries').update({
        contact_id: contactId, preferred_date: preferredDate, room_preference: roomPreference,
        guest_count: guestCount, budget: budget,
        message: fullMessage || null,
      }).eq('id', existingByName.id);
      duplicateFound = true;
    }
  }

  // 4c: Check by GHL contact ID if present
  if (!duplicateFound && ghlContactId) {
    const { data: existingByGhl } = await supabase
      .from('inquiries')
      .select('id')
      .eq('user_id', userId)
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingByGhl) {
      console.log(`Form: Existing inquiry found for same contact, updating ${existingByGhl.id}`);
      await supabase.from('inquiries').update({
        preferred_date: preferredDate, room_preference: roomPreference,
        guest_count: guestCount, budget: budget,
        event_type: eventType,
        message: fullMessage || null,
      }).eq('id', existingByGhl.id);
      duplicateFound = true;
    }
  }

  if (!duplicateFound) {
    const { data: newInquiry, error } = await supabase
      .from('inquiries')
      .insert({
        user_id: userId,
        contact_id: contactId,
        contact_name: contactName,
        event_type: eventType,
        preferred_date: preferredDate,
        room_preference: roomPreference,
        guest_count: guestCount,
        budget: budget,
        message: fullMessage || null,
        status: 'new',
        source: formSource || 'VirtuGrow',
        is_read: false,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Form: Failed to create inquiry:', error.message);
    } else {
      console.log(`Form: Created inquiry ${newInquiry.id} for ${contactName} (contact: ${contactId}, company: ${companyId})`);
    }
  }
}

async function handleOpportunityFromWebhookPayload(supabase: any, ghlHeaders: any, locationId: string, userId: string, payload: any) {
  // GHL sends pipeline webhooks in two formats:
  // 1. With an opportunity ID (fetch full data from API)
  // 2. Direct payload with pipleline_stage, opportunity_name, contact_id etc.
  
  const oppId = payload.id || payload.opportunityId || payload.data?.id;
  const stageName = payload.pipleline_stage || payload.pipeline_stage || '';
  
  if (!oppId && !stageName) { console.log('No opportunity ID or stage in webhook'); return; }

  let status: string;
  let contactName: string;
  let monetaryValue: number | null = null;
  let eventType: string;
  let ghlOppId = oppId;

  if (stageName) {
    // Direct payload from GHL webhook trigger (most common)
    status = stageToStatus(stageName);
    contactName = payload.full_name || payload.opportunity_name || payload.contact_name || 'Onbekend';
    monetaryValue = payload.lead_value ? Number(payload.lead_value) : null;
    eventType = payload.opportunity_name || 'Onbekend';
    ghlOppId = oppId || payload.id;
  } else {
    // Fallback: fetch from GHL API
    const res = await fetch(`${GHL_API_BASE}/opportunities/${oppId}`, { headers: ghlHeaders });
    if (!res.ok) { console.error('Fetch opp failed:', res.status); return; }
    const opp = (await res.json()).opportunity || await res.json();

    const pipelinesRes = await fetch(`${GHL_API_BASE}/opportunities/pipelines?locationId=${locationId}`, { headers: ghlHeaders });
    const stageMap: Record<string, string> = {};
    if (pipelinesRes.ok) {
      const pd = await pipelinesRes.json();
      for (const p of pd.pipelines || []) {
        for (const s of p.stages || []) { stageMap[s.id] = s.name; }
      }
    }
    const resolvedStage = stageMap[opp.pipelineStageId] || opp.status || 'new';
    status = stageToStatus(resolvedStage);
    contactName = opp.contact?.name || opp.name || 'Onbekend';
    monetaryValue = opp.monetaryValue ? Number(opp.monetaryValue) : null;
    eventType = opp.name || 'Onbekend';
  }

  if (!ghlOppId) { console.log('No GHL opportunity ID resolved'); return; }

  const { data: existing } = await supabase.from('inquiries').select('id, updated_at').eq('user_id', userId).eq('ghl_opportunity_id', ghlOppId).maybeSingle();

  if (existing) {
    // Skip if CRM was updated in the last 5 minutes (prevents echo from CRM->GHL->webhook)
    const recentThreshold = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    if (existing.updated_at <= recentThreshold) {
      await supabase.from('inquiries').update({
        contact_name: contactName, status, budget: monetaryValue, event_type: eventType,
      }).eq('id', existing.id);
      console.log(`Webhook: GHL -> CRM opp ${ghlOppId} -> ${status}`);
    } else {
      console.log(`Webhook: Skipped opp ${ghlOppId}, CRM recently updated (within 5min)`);
    }
  } else {
    // Try to link to existing contact
    let contactId = null;
    if (payload.contact_id) {
      const { data: contactMatch } = await supabase.from('contacts').select('id').eq('ghl_contact_id', payload.contact_id).maybeSingle();
      contactId = contactMatch?.id || null;
    }
    
    // Also try matching by name if no GHL contact ID match
    if (!contactId && contactName && contactName !== 'Onbekend') {
      const { data: nameMatch } = await supabase
        .from('contacts')
        .select('id')
        .eq('user_id', userId)
        .ilike('first_name', contactName.split(' ')[0] || '')
        .ilike('last_name', contactName.split(' ').slice(1).join(' ') || '')
        .limit(1)
        .maybeSingle();
      contactId = nameMatch?.id || null;
    }

    // Before inserting, try to find a recent inquiry from form submission for the same contact
    const recentCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    let mergedExisting = null;

    if (contactId) {
      const { data: formMatch } = await supabase.from('inquiries')
        .select('id')
        .eq('user_id', userId)
        .eq('contact_id', contactId)
        .is('ghl_opportunity_id', null)
        .gt('created_at', recentCutoff)
        .limit(1)
        .maybeSingle();
      mergedExisting = formMatch;
    }
    if (!mergedExisting && contactName && contactName !== 'Onbekend') {
      const { data: nameMatch } = await supabase.from('inquiries')
        .select('id')
        .eq('user_id', userId)
        .ilike('contact_name', contactName)
        .is('ghl_opportunity_id', null)
        .gt('created_at', recentCutoff)
        .limit(1)
        .maybeSingle();
      mergedExisting = nameMatch;
    }

    if (mergedExisting) {
      // Merge: link existing form inquiry to this GHL opportunity
      await supabase.from('inquiries').update({
        ghl_opportunity_id: ghlOppId, status, budget: monetaryValue,
        event_type: eventType, contact_id: contactId,
      }).eq('id', mergedExisting.id);
      console.log(`Webhook: Merged form inquiry ${mergedExisting.id} with GHL opp ${ghlOppId}`);
    } else {
      const { data: newInq } = await supabase.from('inquiries').insert({
        user_id: userId, ghl_opportunity_id: ghlOppId, contact_name: contactName,
        event_type: eventType, status, guest_count: 0,
        budget: monetaryValue, source: 'GHL', contact_id: contactId,
        is_read: false,
      }).select('id').single();
      console.log(`Webhook: Inserted new opp ${ghlOppId} -> ${status}`);
      mergedExisting = newInq; // use for auto-enrich below
    }

    // Auto-enrich: fetch custom fields from GHL opportunity
    const enrichTargetId = mergedExisting?.id;
    if (enrichTargetId && ghlOppId) {
      try {
        const oppRes = await fetch(`${GHL_API_BASE}/opportunities/${ghlOppId}`, { headers: ghlHeaders });
        if (oppRes.ok) {
          const oppData = await oppRes.json();
          const opp = oppData.opportunity || oppData;
          const customFields = opp.customFields || opp.custom_fields || [];
          const fieldMap: Record<string, string> = {};
          for (const cf of customFields) {
            const name = (cf.name || cf.fieldName || cf.key || '').toLowerCase();
            const value = cf.value || cf.fieldValue || '';
            if (value) fieldMap[name] = String(value);
          }

          const guestCount = parseInt(fieldMap['aantal gasten'] || fieldMap['guest_count'] || '0', 10) || 0;
          const preferredDate = fieldMap['selecteer de gewenste datum'] || fieldMap['preferred_date'] || fieldMap['datum'] || null;
          const roomPreference = fieldMap['gewenste zaalopstelling'] || fieldMap['room_preference'] || null;
          const enrichedBudget = fieldMap['budget'] ? Number(fieldMap['budget']) : (opp.monetaryValue ? Number(opp.monetaryValue) : monetaryValue);
          const enrichedEventType = fieldMap['type evenement'] || fieldMap['soort evenement'] || eventType;

          const messageParts = [
            fieldMap['kies je dagdeel'] ? `Dagdeel: ${fieldMap['kies je dagdeel']}` : '',
            fieldMap['gewenste catering'] ? `Catering: ${fieldMap['gewenste catering']}` : '',
            fieldMap['speciale benodigdheden'] ? `Speciale benodigdheden: ${fieldMap['speciale benodigdheden']}` : '',
            fieldMap['na-zit gewenst?'] ? `Na-zit: ${fieldMap['na-zit gewenst?']}` : '',
            fieldMap['extra informatie'] ? `Extra: ${fieldMap['extra informatie']}` : '',
            fieldMap['opmerkingen'] ? `Opmerkingen: ${fieldMap['opmerkingen']}` : '',
          ].filter(Boolean);

          // Add any extra custom fields
          const knownKeys = new Set(['aantal gasten', 'guest_count', 'selecteer de gewenste datum', 'preferred_date', 'datum', 'gewenste zaalopstelling', 'room_preference', 'budget', 'kies je dagdeel', 'gewenste catering', 'speciale benodigdheden', 'na-zit gewenst?', 'extra informatie', 'opmerkingen', 'type evenement', 'soort evenement', 'service type']);
          for (const [key, value] of Object.entries(fieldMap)) {
            if (!knownKeys.has(key) && value) messageParts.push(`${key}: ${value}`);
          }

          if (guestCount || preferredDate || roomPreference || messageParts.length > 0) {
            await supabase.from('inquiries').update({
              event_type: enrichedEventType,
              guest_count: guestCount || 0,
              preferred_date: preferredDate,
              room_preference: roomPreference,
              budget: enrichedBudget,
              message: messageParts.join('\n') || null,
            }).eq('id', enrichTargetId);
            console.log(`Webhook: Auto-enriched opp ${ghlOppId} with ${Object.keys(fieldMap).length} custom fields`);
          }
        }
      } catch (enrichErr) {
        console.error('Webhook: Auto-enrich failed (non-fatal):', enrichErr);
      }
    }
  }
}

async function handleContactWebhook(supabase: any, userId: string, payload: any) {
  const contactId = payload.id || payload.contactId || payload.data?.id;
  if (!contactId) return;

  const firstName = payload.firstName || payload.first_name || payload.name?.split(' ')[0] || 'Onbekend';
  const lastName = payload.lastName || payload.last_name || payload.name?.split(' ').slice(1).join(' ') || '';

  const { data: existing } = await supabase.from('contacts').select('id').eq('user_id', userId).eq('ghl_contact_id', contactId).maybeSingle();

  if (existing) {
    await supabase.from('contacts').update({
      first_name: firstName, last_name: lastName,
      email: payload.email || null, phone: payload.phone || null,
      company: payload.companyName || payload.company || null,
    }).eq('id', existing.id);
  } else {
    await supabase.from('contacts').insert({
      user_id: userId, ghl_contact_id: contactId,
      first_name: firstName, last_name: lastName,
      email: payload.email || null, phone: payload.phone || null,
      company: payload.companyName || payload.company || null, status: 'lead',
    });
  }
  // Retroactively link orphaned inquiries to this contact by name match
  const contactFullName = `${firstName} ${lastName}`.trim();
  if (contactFullName && contactFullName !== 'Onbekend') {
    const resolvedContactId = existing?.id || (await supabase.from('contacts').select('id').eq('ghl_contact_id', contactId).maybeSingle())?.data?.id;
    if (resolvedContactId) {
      const { data: orphanedInquiries } = await supabase
        .from('inquiries')
        .select('id')
        .eq('user_id', userId)
        .is('contact_id', null)
        .ilike('contact_name', contactFullName);
      if (orphanedInquiries && orphanedInquiries.length > 0) {
        await supabase
          .from('inquiries')
          .update({ contact_id: resolvedContactId })
          .eq('user_id', userId)
          .is('contact_id', null)
          .ilike('contact_name', contactFullName);
        console.log(`Webhook: Retroactively linked ${orphanedInquiries.length} orphaned inquiries to contact ${resolvedContactId}`);
      }
    }
  }

  console.log(`Webhook: Contact ${contactId} synced`);
}

async function handleAppointmentWebhook(supabase: any, userId: string, payload: any) {
  const eventId = payload.id || payload.appointmentId || payload.data?.id;
  if (!eventId) return;

  const startTime = new Date(payload.startTime || payload.start || payload.data?.startTime);
  const endTime = new Date(payload.endTime || payload.end || payload.data?.endTime);
  if (isNaN(startTime.getTime())) return;

  const startLocal = toAmsterdam(startTime);
  const endLocal = isNaN(endTime.getTime()) ? null : toAmsterdam(endTime);
  const dateStr = startLocal.dateStr;
  const startHour = startLocal.hours;
  const startMinute = startLocal.minutes;
  // Preserve exact end time from GHL — never override
  const endHour = endLocal ? endLocal.hours : Math.min(startHour + 1, 23);
  const endMinute = endLocal ? endLocal.minutes : 0;

  const title = payload.title || payload.name || 'GHL Afspraak';
  const contactName = payload.contact?.name || title;
  const status = (payload.status === 'confirmed' || payload.appointmentStatus === 'confirmed') ? 'confirmed' : 'option';

  const { data: existing } = await supabase.from('bookings').select('id').eq('user_id', userId).eq('ghl_event_id', eventId).maybeSingle();

  if (existing) {
    await supabase.from('bookings').update({
      date: dateStr, start_hour: startHour, start_minute: startMinute,
      end_hour: endHour, end_minute: endMinute,
      title, contact_name: contactName, status,
    }).eq('id', existing.id);
  } else {
    await supabase.from('bookings').insert({
      user_id: userId, ghl_event_id: eventId, room_name: 'Ontmoeten Aan de Donge',
      date: dateStr, start_hour: startHour, start_minute: startMinute,
      end_hour: endHour, end_minute: endMinute,
      title, contact_name: contactName, status,
    });
  }
  console.log(`Webhook: Appointment ${eventId} synced (${startHour}:${String(startMinute).padStart(2,'0')}-${endHour}:${String(endMinute).padStart(2,'0')})`);
}

function stageToStatus(s: string): string {
  const l = s.toLowerCase();
  if (l.includes('nieuwe aanvraag') || l.includes('new')) return 'new';
  if (l.includes('lopend contact') || l.includes('contact')) return 'contacted';
  if (l.includes('optie')) return 'option';
  if (l.includes('aangepaste offerte')) return 'quote_revised';
  if (l.includes('offerte verzonden') || l.includes('offerte')) return 'quoted';
  if (l.includes('definitieve reservering') || l.includes('definitief')) return 'confirmed';
  if (l.includes('reservering')) return 'reserved';
  if (l.includes('draaiboek')) return 'script';
  if (l.includes('facturatie') || l.includes('invoice')) return 'invoiced';
  if (l.includes('vervallen') || l.includes('verloren') || l.includes('lost')) return 'lost';
  if (l.includes('after sales') || l.includes('aftersales')) return 'after_sales';
  if (l.includes('evenement')) return 'confirmed';
  return 'new';
}

async function handleInboundMessage(supabase: any, ghlHeaders: any, userId: string, payload: any) {
  const conversationId = payload.conversationId || payload.conversation_id || payload.data?.conversationId;
  const messageBody = payload.body || payload.message || payload.text || '';
  const messageId = payload.messageId || payload.id || payload.data?.id;
  const contactId = payload.contactId || payload.contact_id || payload.data?.contactId;
  const contactName = payload.contactName || payload.contact_name || payload.full_name || payload.name || 'Onbekend';
  const direction = payload.direction === 'outbound' || payload.direction === 1 ? 'outbound' : 'inbound';
  const messageType = payload.type || payload.messageType || 'TYPE_SMS';
  const phone = payload.phone || null;
  const email = payload.email || null;

  if (!conversationId) {
    console.log('Inbound message: no conversationId, skipping');
    return;
  }

  // Link to local contact if possible
  let localContactId: string | null = null;
  if (contactId) {
    const { data: contactMatch } = await supabase.from('contacts').select('id').eq('ghl_contact_id', contactId).maybeSingle();
    localContactId = contactMatch?.id || null;
  }

  // Upsert conversation (create or update)
  const { data: dbConv } = await supabase.from('conversations').upsert({
    user_id: userId,
    ghl_conversation_id: conversationId,
    contact_id: localContactId,
    contact_name: contactName,
    phone, email,
    last_message_body: messageBody,
    last_message_date: new Date().toISOString(),
    last_message_direction: direction,
    unread: direction === 'inbound',
    channel: messageType.toLowerCase().includes('email') ? 'email' : 'chat',
  }, { onConflict: 'ghl_conversation_id' }).select('id').single();

  if (!dbConv) {
    console.error('Inbound message: failed to upsert conversation');
    return;
  }

  // Insert message
  if (messageId) {
    await supabase.from('messages').upsert({
      user_id: userId,
      conversation_id: dbConv.id,
      ghl_message_id: messageId,
      body: messageBody,
      direction,
      message_type: messageType,
      status: 'delivered',
      date_added: new Date().toISOString(),
    }, { onConflict: 'ghl_message_id' });
  }

  console.log(`Webhook: Inbound message in conv ${conversationId} from ${contactName}: "${messageBody.substring(0, 50)}"`);
}

// === DOCUMENT / PROPOSAL WEBHOOK ===
async function handleDocumentWebhook(supabase: any, ghlHeaders: any, userId: string, payload: any, type: string) {
  const docId = payload.documentId || payload.proposalId || payload.estimateId || payload.invoiceId || payload.id || payload.data?.id;
  const title = payload.title || payload.name || payload.documentName || payload.proposalName || payload.data?.title || 'Document';
  const contactId = payload.contact_id || payload.contactId || payload.data?.contactId;
  const contactName = payload.contact_name || payload.full_name || payload.contactName || payload.data?.contactName || 'Onbekend';
  const amount = payload.amount || payload.total || payload.monetaryValue || payload.data?.amount ? Number(payload.amount || payload.total || payload.monetaryValue || payload.data?.amount) : null;
  const externalUrl = payload.url || payload.documentUrl || payload.link || payload.data?.url || null;

  // Determine document type from webhook event type
  let documentType = 'proposal';
  const typeLower = type.toLowerCase();
  if (typeLower.includes('invoice')) documentType = 'invoice';
  else if (typeLower.includes('estimate')) documentType = 'estimate';
  else if (typeLower.includes('contract')) documentType = 'contract';
  else if (typeLower.includes('document')) documentType = 'document';

  // Determine status from event
  let status = 'sent';
  if (typeLower.includes('signed') || typeLower.includes('accepted') || typeLower.includes('completed')) status = 'signed';
  else if (typeLower.includes('viewed') || typeLower.includes('opened')) status = 'viewed';
  else if (typeLower.includes('declined') || typeLower.includes('rejected')) status = 'declined';
  else if (typeLower.includes('paid')) status = 'paid';

  // Try to find matching contact in DB
  let dbContactId: string | null = null;
  let dbInquiryId: string | null = null;

  if (contactId) {
    const { data: contactMatch } = await supabase.from('contacts').select('id, company_id').eq('ghl_contact_id', contactId).maybeSingle();
    if (contactMatch) {
      dbContactId = contactMatch.id;

      // Try to find related inquiry for this contact
      const { data: inqMatch } = await supabase.from('inquiries')
        .select('id')
        .eq('contact_id', contactMatch.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      dbInquiryId = inqMatch?.id || null;
    }
  }

  const now = new Date().toISOString();
  const upsertData: any = {
    user_id: userId,
    ghl_document_id: docId,
    title,
    document_type: documentType,
    status,
    contact_name: contactName,
    contact_id: dbContactId,
    inquiry_id: dbInquiryId,
    amount,
    external_url: externalUrl,
  };

  // Set timestamp fields based on status
  if (status === 'sent') upsertData.sent_at = now;
  if (status === 'viewed') upsertData.viewed_at = now;
  if (status === 'signed') upsertData.signed_at = now;

  if (docId) {
    // Upsert: if document already exists, update status
    const { data: existing } = await supabase.from('documents').select('id, status').eq('ghl_document_id', docId).maybeSingle();
    if (existing) {
      // Only update if status progresses (sent -> viewed -> signed)
      const statusOrder: Record<string, number> = { sent: 0, viewed: 1, signed: 2, paid: 3, declined: -1 };
      const currentOrder = statusOrder[existing.status] ?? 0;
      const newOrder = statusOrder[status] ?? 0;
      if (newOrder > currentOrder || status === 'declined') {
        const updatePayload: any = { status };
        if (status === 'viewed') updatePayload.viewed_at = now;
        if (status === 'signed') updatePayload.signed_at = now;
        if (amount) updatePayload.amount = amount;
        await supabase.from('documents').update(updatePayload).eq('id', existing.id);
        console.log(`Webhook: Updated document ${docId} status to ${status}`);
      }
    } else {
      await supabase.from('documents').insert(upsertData);
      console.log(`Webhook: Created document ${docId} (${documentType}) for ${contactName}`);
    }
  } else {
    // No docId, just insert
    await supabase.from('documents').insert(upsertData);
    console.log(`Webhook: Created document without GHL ID for ${contactName}`);
  }
}

