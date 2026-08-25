import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildFieldMap,
  buildInquiryUpdate,
  extractInquiryFields,
  linkContactToCompany,
  loadFieldDefs,
  parseFormDate,
  parseFormTime,
  resolveCompanyId,
} from "../_shared/inquiryFields.ts";

const GHL_API_BASE = 'https://services.leadconnectorhq.com';


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const delayMs = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Rate-limit-aware fetch for GHL API calls within the webhook */
async function ghlFetch(url: string, opts: RequestInit = {}): Promise<Response> {
  const MAX_RETRIES = 2;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const backoff = 2000 + Math.floor(Math.random() * 1000);
      console.warn(`ghl-webhook: retry ${attempt}/${MAX_RETRIES} for ${url}`);
      await delayMs(backoff);
    }
    const res = await fetch(url, opts);
    if (res.status !== 429) return res;
    await res.text();
  }
  console.error(`ghl-webhook: rate limit after ${MAX_RETRIES} retries: ${url}`);
  return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429 });
}

/** Map GHL pipeline stage name to CRM status */
function stageToStatus(stageName: string): string {
  const l = stageName.toLowerCase();
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
    // CRITICAL: Detect REAL form submissions vs contact-sync payloads with custom field values.
    // GHL contact updates include stored custom field values (e.g., "Aantal gasten": "60"),
    // these are NOT new form submissions. A real form submission must have an explicit indicator.
    const hasFormFields = !!(
      (payload['Type Evenement'] && payload['Type Evenement'].trim()) ||
      (payload['Aantal gasten'] && String(payload['Aantal gasten']).trim()) ||
      (payload['Selecteer de gewenste datum'] && payload['Selecteer de gewenste datum'].trim()) ||
      (payload['Kies je dagdeel'] && payload['Kies je dagdeel'].trim())
    );
    const hasFormIndicator = !!(
      payload.form_name || payload.formName || payload.formId || payload.form_id ||
      payload.workflow_name || payload.workflowName || payload.workflow_id ||
      payload['Form Name'] ||
      type.toLowerCase().includes('form') || type.toLowerCase().includes('workflow')
    );
    // Only treat as form if we have BOTH form fields AND a form submission indicator.
    const hasFormData = hasFormFields && hasFormIndicator;
    
    // Contact with custom fields but no form indicator = contact sync, not form
    const isContactWithCustomFields = !!(payload.contact_id && hasFormFields && !hasFormIndicator);
    
    const hasMessageData = type.includes('InboundMessage') || type.includes('inbound') || type.includes('message') || (payload.body && payload.conversationId);
    const hasDocumentData = type.includes('Document') || type.includes('document') || type.includes('Proposal') || type.includes('proposal') || type.includes('Invoice') || type.includes('invoice') || type.includes('Estimate') || type.includes('estimate') || payload.documentId || payload.proposalId || payload.estimateId;

    // Detect contact sync echo
    const isContactSyncEcho = (
      isContactWithCustomFields ||
      ((type.includes('contact') || type.includes('Contact') || hasContactData) &&
       !hasFormData && !hasPipelineData && !hasAppointmentData && !hasMessageData && !hasDocumentData)
    );

    // Handle different webhook types
    const isOpportunityDelete = type.includes('OpportunityDelete') || type.includes('opportunity.deleted') || 
                                 (type.includes('opportunity') && (type.includes('delete') || type.includes('Delete')));
    const isContactDelete = type.includes('ContactDelete') || type.includes('contact.delete') ||
                             (type.includes('contact') && (type.includes('delete') || type.includes('Delete')));

    if (isContactDelete) {
      await handleContactDelete(supabase, userId, payload);
    } else if (isOpportunityDelete) {
      await handleOpportunityDelete(supabase, userId, payload);
    } else if (hasDocumentData) {
      await handleDocumentWebhook(supabase, ghlHeaders, userId, payload, type);
    } else if (hasMessageData) {
      await handleInboundMessage(supabase, ghlHeaders, userId, payload);
    } else if (hasFormData) {
      await handleFormSubmission(supabase, userId, payload);
    } else if (type.includes('opportunity') || type.includes('OpportunityStatus') || type.includes('pipeline') || (hasPipelineData && !hasAppointmentData)) {
      // Pass form fields from payload so we don't need extra API calls
      await handleOpportunityFromWebhookPayload(supabase, ghlHeaders, GHL_LOCATION_ID, userId, payload, hasFormFields ? payload : null);
    } else if (isContactSyncEcho || type.includes('contact') || type.includes('Contact') || (hasContactData && !hasPipelineData && !hasAppointmentData)) {
      await handleContactWebhook(supabase, userId, payload);
    } else if (type.includes('appointment') || type.includes('calendar') || type.includes('event') || hasAppointmentData) {
      await handleAppointmentWebhook(supabase, userId, payload);
    } else {
      // IMPORTANT: Do NOT fall back to form handler for unknown types.
      console.log('Unknown webhook type, skipping:', type, 'Keys:', Object.keys(payload).join(', '));
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('Webhook error:', e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});

function normalizeCompanyName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\bb\.?\s*v\.?\b/g, 'bv')
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function handleFormSubmission(supabase: any, userId: string, payload: any) {
  // Extract contact info from GHL form payload
  const email = payload.email || payload.Email || payload['E-mail'] || payload['E-mailadres'] || null;
  const phone = payload.phone || payload.Phone || payload.Telefoon || payload.Telefoonnummer || null;
  const fullName = payload.full_name || payload.contact_name || payload.name || payload.Naam || payload['Volledige naam'] || '';
  const firstName = payload.first_name || payload.firstName || fullName.split(' ')[0] || 'Onbekend';
  const lastName = payload.last_name || payload.lastName || fullName.split(' ').slice(1).join(' ') || '';
  const companyNameRaw = payload.company || payload.companyName || payload.Bedrijf || payload.Bedrijfsnaam || payload['Naam bedrijf'] || null;
  const companyName = companyNameRaw ? String(companyNameRaw).trim() : null;

  // Extract inquiry data from Dutch form fields (shared mapping = same result as sync)
  const formFieldMap = buildFieldMap([payload]);
  const extracted = extractInquiryFields(formFieldMap);

  const eventType = payload['Type Evenement'] || payload.event_type || payload['Soort evenement'] || extracted.eventType || 'Aanvraag via formulier';
  const guestCount = extracted.guestCount ?? (parseInt(payload['Aantal gasten'] || payload.guest_count || '0', 10) || 0);
  const preferredDate = parseFormDate(payload['Selecteer de gewenste datum'] || payload.preferred_date || null) || extracted.preferredDate;
  const preferredStartTime = extracted.preferredStartTime || parseFormTime(payload['Starttijd'] || payload.start_time || null);
  const preferredEndTime = extracted.preferredEndTime || parseFormTime(payload['Eindtijd'] || payload.end_time || null);
  const dagdeel = payload['Kies je dagdeel'] || '';
  const roomPreference = payload['Gewenste zaalopstelling'] || payload.room_preference || extracted.roomPreference || null;
  const message = payload['Extra informatie'] || payload.message || payload.Opmerkingen || '';
  const budget = payload.budget || payload.Budget ? Number(payload.budget || payload.Budget) : extracted.budget;
  const ghlContactId = payload.contact_id || payload.contactId || null;
  const formSource = payload.form_name || payload.formName || payload.workflow_name || payload.workflowName || payload['Form Name'] || payload.source || null;


  const fullMessage = [
    message,
    dagdeel ? `Dagdeel: ${dagdeel}` : '',
    payload['Gewenste catering'] ? `Catering: ${payload['Gewenste catering']}` : '',
    payload['Speciale Benodigdheden'] ? `Speciale benodigdheden: ${payload['Speciale Benodigdheden']}` : '',
    payload['Na-zit gewenst?'] ? `Na-zit: ${payload['Na-zit gewenst?']}` : '',
    payload['Service Type'] ? `Service: ${payload['Service Type']}` : '',
  ].filter(Boolean).join('\n');

  const contactName = `${firstName} ${lastName}`.trim() || 'Onbekend';

  console.log('[FORM] incoming', JSON.stringify({ email, companyName, fullName: contactName, formSource, ghlContactId }));

  // ============================================================
  // Step 1: Resolve SUBMITTED company FIRST (independent of contact)
  // ============================================================
  let submittedCompanyId: string | null = null;
  let companyMatchedExisting = false;
  let companyCreatedNew = false;

  if (companyName) {
    const normalized = normalizeCompanyName(companyName);
    // Fetch candidate companies and match on normalized name
    const { data: candidates } = await supabase
      .from('companies')
      .select('id, name')
      .ilike('name', `%${companyName.split(' ')[0]}%`)
      .limit(50);

    const match = (candidates || []).find((c: any) => normalizeCompanyName(c.name || '') === normalized);
    if (match) {
      submittedCompanyId = match.id;
      companyMatchedExisting = true;
    } else {
      const { data: newCompany, error: coErr } = await supabase
        .from('companies')
        .insert({
          user_id: userId,
          name: companyName,
          kvk: payload['KVK'] || null,
          btw_number: payload['BTW'] || null,
        })
        .select('id')
        .single();
      if (coErr) console.error('[FORM] company.insert error', coErr.message);
      if (newCompany) {
        submittedCompanyId = newCompany.id;
        companyCreatedNew = true;
      }
    }
  }
  console.log('[FORM] company.resolved', JSON.stringify({ submittedCompanyId, companyMatchedExisting, companyCreatedNew }));

  // ============================================================
  // Step 2: Resolve contact — never let contact's old company override submission
  // ============================================================
  let contactId: string | null = null;
  let matchedBy: 'ghl' | 'email+company' | 'created' | 'email-nocompany' = 'created';

  // 2a: hardest identity — GHL contact ID
  if (ghlContactId) {
    const { data: ghlMatch } = await supabase
      .from('contacts')
      .select('id, company_id')
      .eq('ghl_contact_id', ghlContactId)
      .maybeSingle();
    if (ghlMatch) {
      contactId = ghlMatch.id;
      matchedBy = 'ghl';
    }
  }

  // 2b: email match, but ONLY if submitted company matches or contact has no company
  if (!contactId && email) {
    const { data: emailMatches } = await supabase
      .from('contacts')
      .select('id, company_id')
      .eq('email', email)
      .limit(10);
    const safeMatch = (emailMatches || []).find((c: any) =>
      submittedCompanyId ? (c.company_id === submittedCompanyId || c.company_id === null) : c.company_id === null,
    );
    if (safeMatch) {
      contactId = safeMatch.id;
      matchedBy = safeMatch.company_id ? 'email+company' : 'email-nocompany';
    }
  }

  // 2c: create new contact — even if email exists under a DIFFERENT company
  if (!contactId) {
    const { data: newContact, error: cErr } = await supabase
      .from('contacts')
      .insert({
        user_id: userId,
        first_name: firstName,
        last_name: lastName || '',
        email: email,
        phone: phone,
        company: companyName,
        company_id: submittedCompanyId,
        ghl_contact_id: ghlContactId,
        status: 'lead',
      })
      .select('id')
      .single();
    if (cErr) console.error('[FORM] contact.insert error', cErr.message);
    if (newContact) {
      contactId = newContact.id;
      matchedBy = 'created';
    }
  }
  console.log('[FORM] contact.resolved', JSON.stringify({ contactId, matchedBy }));

  // ============================================================
  // Step 3: Link contact ↔ submitted company (non-primary if contact already has one)
  // ============================================================
  if (contactId && submittedCompanyId) {
    const { data: contactRow } = await supabase
      .from('contacts')
      .select('company_id')
      .eq('id', contactId)
      .maybeSingle();

    const isPrimary = !contactRow?.company_id;
    if (isPrimary) {
      // Contact had no primary company yet — safe to set it
      await supabase
        .from('contacts')
        .update({ company_id: submittedCompanyId, company: companyName })
        .eq('id', contactId)
        .is('company_id', null);
    }
    // Always ensure a link exists (junction table)
    await supabase
      .from('contact_companies')
      .upsert(
        { contact_id: contactId, company_id: submittedCompanyId, is_primary: isPrimary, user_id: userId },
        { onConflict: 'contact_id,company_id' },
      );
    console.log('[FORM] contact_companies.linked', JSON.stringify({ contactId, companyId: submittedCompanyId, isPrimary }));
  }

  // ============================================================
  // Step 4: Upsert inquiry — always pin company_id to SUBMITTED company
  // ============================================================
  let duplicateFound = false;
  let inquiryAction: string = 'insert';
  let inquiryId: string | null = null;

  // 4a: same contact + event_type + same submitted company
  if (contactId) {
    const q = supabase
      .from('inquiries')
      .select('id')
      .eq('contact_id', contactId)
      .eq('event_type', eventType);
    const q2 = submittedCompanyId ? q.eq('company_id', submittedCompanyId) : q.is('company_id', null);
    const { data: existingByContact } = await q2.order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (existingByContact) {
      await supabase.from('inquiries').update({
        preferred_date: preferredDate, room_preference: roomPreference,
        preferred_start_time: preferredStartTime, preferred_end_time: preferredEndTime,
        guest_count: guestCount, budget: budget,
        message: fullMessage || null,
        company_id: submittedCompanyId,
      }).eq('id', existingByContact.id);

      duplicateFound = true;
      inquiryAction = 'update-4a';
      inquiryId = existingByContact.id;
    }
  }

  // 4b: fallback — contact_name + event_type + submitted company
  if (!duplicateFound) {
    const q = supabase
      .from('inquiries')
      .select('id')
      .ilike('contact_name', contactName)
      .eq('event_type', eventType);
    const q2 = submittedCompanyId ? q.eq('company_id', submittedCompanyId) : q.is('company_id', null);
    const { data: existingByName } = await q2.order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (existingByName) {
      await supabase.from('inquiries').update({
        contact_id: contactId, preferred_date: preferredDate, room_preference: roomPreference,
        preferred_start_time: preferredStartTime, preferred_end_time: preferredEndTime,
        guest_count: guestCount, budget: budget,
        message: fullMessage || null,
        company_id: submittedCompanyId,
      }).eq('id', existingByName.id);

      duplicateFound = true;
      inquiryAction = 'update-4b';
      inquiryId = existingByName.id;
    }
  }

  if (!duplicateFound) {
    const { data: newInquiry, error } = await supabase
      .from('inquiries')
      .insert({
        user_id: userId,
        contact_id: contactId,
        contact_name: contactName,
        company_id: submittedCompanyId,
        event_type: eventType,
        preferred_date: preferredDate,
        preferred_start_time: preferredStartTime,
        preferred_end_time: preferredEndTime,
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
      console.error('[FORM] inquiry.insert error', error.message);
    } else {
      inquiryId = newInquiry.id;
    }
  }

  console.log('[FORM] inquiry.upserted', JSON.stringify({
    inquiryId, action: inquiryAction, company_id: submittedCompanyId, contact_id: contactId,
  }));
}

async function handleContactDelete(supabase: any, userId: string, payload: any) {
  const ghlContactId = payload.id || payload.contactId || payload.contact_id || payload.data?.id;
  if (!ghlContactId) {
    console.log('Webhook: ContactDelete but no ID found in payload');
    return;
  }

  const { data: existing } = await supabase
    .from('contacts')
    .select('id, first_name, last_name')
    .eq('ghl_contact_id', ghlContactId)
    .maybeSingle();

  if (existing) {
    // Log before deleting
    await supabase.from('sync_log').insert({
      user_id: userId,
      action: 'delete_contact',
      entity_type: 'contact',
      entity_id: existing.id,
      details: { ghl_contact_id: ghlContactId, name: `${existing.first_name} ${existing.last_name}`, source: 'webhook' },
      status: 'success',
    });

    const { error } = await supabase.from('contacts').delete().eq('id', existing.id);
    if (!error) {
      console.log(`Webhook: Deleted contact ${existing.id} (${existing.first_name} ${existing.last_name}, GHL ${ghlContactId})`);
    } else {
      console.error(`Webhook: Failed to delete contact ${existing.id}:`, error.message);
    }
  } else {
    console.log(`Webhook: ContactDelete for GHL ${ghlContactId} but no matching CRM contact found`);
  }
}

async function handleOpportunityDelete(supabase: any, userId: string, payload: any) {
  const oppId = payload.id || payload.opportunityId || payload.data?.id;
  if (!oppId) {
    console.log('Webhook: OpportunityDelete but no ID found in payload');
    return;
  }

  const { data: existing } = await supabase
    .from('inquiries')
    .select('id, contact_name')
    .not('id', 'is', null)
    .eq('ghl_opportunity_id', oppId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from('inquiries').delete().eq('id', existing.id);
    if (!error) {
      console.log(`Webhook: Deleted inquiry ${existing.id} (GHL opp ${oppId} deleted, was: ${existing.contact_name})`);
    } else {
      console.error(`Webhook: Failed to delete inquiry ${existing.id}:`, error.message);
    }
  } else {
    console.log(`Webhook: OpportunityDelete for ${oppId} but no matching CRM inquiry found`);
  }
}

async function handleOpportunityFromWebhookPayload(supabase: any, ghlHeaders: any, locationId: string, userId: string, payload: any, formFieldsPayload?: any) {
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
    const rawJson = await res.json();
    const opp = rawJson.opportunity || rawJson;

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

  const { data: existing } = await supabase.from('inquiries').select('id, updated_at, status').not('id', 'is', null).eq('ghl_opportunity_id', ghlOppId).maybeSingle();

  if (existing) {
    // CRM wins if its updated_at is newer than GHL's dateUpdated.
    // This prevents webhooks (triggered by our own CRM→GHL push) from reverting CRM changes.
    const ghlUpdatedAt = payload.dateUpdated || payload.date_updated || null;
    const crmIsNewer = !ghlUpdatedAt || existing.updated_at >= ghlUpdatedAt;

    if (crmIsNewer) {
      // CRM was changed more recently than GHL → ignore this webhook (echo prevention)
      console.log(`Webhook: Skipped opp ${ghlOppId} — CRM is newer (CRM: ${existing.updated_at}, GHL: ${ghlUpdatedAt})`);
    } else {
      // GHL change is genuinely newer → update CRM
      await supabase.from('inquiries').update({
        contact_name: contactName, status, budget: monetaryValue, event_type: eventType,
      }).eq('id', existing.id);
      console.log(`Webhook: GHL -> CRM opp ${ghlOppId} -> ${status} (GHL: ${ghlUpdatedAt})`);
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
      const parts = contactName.trim().split(/\s+/);
      const first = parts[0] || '';
      const rest = parts.slice(1).join(' ');
      const { data: nameMatch } = await supabase
        .from('contacts')
        .select('id')
        .not('id', 'is', null)
        .ilike('first_name', first)
        .ilike('last_name', rest)
        .limit(1)
        .maybeSingle();
      contactId = nameMatch?.id || null;

      // Fallback: Dutch tussenvoegsels may be stored on either name part
      if (!contactId && parts.length > 2) {
        const lastWord = parts[parts.length - 1];
        const { data: looseMatch } = await supabase
          .from('contacts')
          .select('id')
          .not('id', 'is', null)
          .ilike('first_name', first)
          .ilike('last_name', `%${lastWord}`)
          .limit(1)
          .maybeSingle();
        contactId = looseMatch?.id || null;
      }
    }


    // Before inserting, try to find a recent inquiry from form submission for the same contact
    const recentCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    let mergedExisting = null;

    if (contactId) {
      const { data: formMatch } = await supabase.from('inquiries')
        .select('id')
        .not('id', 'is', null)
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
        .not('id', 'is', null)
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

    // Auto-enrich: extract custom fields from webhook payload directly (no API call needed)
    const enrichTargetId = mergedExisting?.id;
    if (enrichTargetId) {
      try {
        const fieldMap: Record<string, string> = {};
        
        // 1. Extract form fields directly from the webhook payload (top-level keys)
        const knownFormKeys = [
          'Type Evenement', 'Type gelegenheid', 'Soort evenement',
          'Aantal gasten', 'Selecteer de gewenste datum', 'Gewenste datum',
          'Kies je dagdeel', 'Gewenste zaalopstelling', 'Gewenste catering',
          'Extra informatie', 'Speciale Benodigdheden', 'Na-zit gewenst?',
          'Service Type', 'Bedrijfsnaam', 'Budget', 'Opmerkingen',
          'Selecteer dagdeel',
        ];
        
        // Check both direct payload and formFieldsPayload
        const sources = [payload, formFieldsPayload].filter(Boolean);
        for (const src of sources) {
          for (const key of knownFormKeys) {
            const val = src[key];
            if (val && String(val).trim()) {
              fieldMap[key.toLowerCase()] = String(val).trim();
            }
          }
          // Also check customFields array if present
          const customFields = src.customFields || src.custom_fields || [];
          for (const cf of customFields) {
            const name = (cf.name || cf.fieldName || cf.key || '').toLowerCase();
            const value = cf.value || cf.fieldValue || '';
            if (value && name) fieldMap[name] = String(value);
          }
        }

        if (Object.keys(fieldMap).length > 0) {
          const fuzzyFind = (...terms: string[]): string => {
            for (const term of terms) { if (fieldMap[term]) return fieldMap[term]; }
            for (const term of terms) { for (const [key, value] of Object.entries(fieldMap)) { if (key.includes(term) && value) return value; } }
            return '';
          };

          const guestCount = parseInt(fuzzyFind('aantal gasten', 'guest_count', 'guests', 'gasten') || '0', 10) || 0;
          const preferredDate = fuzzyFind('gewenste datum', 'selecteer de gewenste datum', 'preferred_date', 'datum') || null;
          const roomPreference = fuzzyFind('gewenste zaalopstelling', 'zaalopstelling', 'room_preference', 'zaal') || null;
          const enrichedBudget = fuzzyFind('budget') ? Number(fuzzyFind('budget')) : (monetaryValue || null);
          const enrichedEventType = fuzzyFind('type evenement', 'type gelegenheid', 'soort evenement') || eventType;

          const messageParts: string[] = [];
          const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
          for (const [key, value] of Object.entries(fieldMap)) {
            if (value) messageParts.push(`${capitalize(key)}: ${value}`);
          }

          await supabase.from('inquiries').update({
            event_type: enrichedEventType,
            guest_count: guestCount || 0,
            preferred_date: preferredDate,
            room_preference: roomPreference,
            budget: enrichedBudget,
            message: messageParts.join('\n') || null,
          }).eq('id', enrichTargetId);
          console.log(`Webhook: Auto-enriched opp ${ghlOppId} with ${Object.keys(fieldMap).length} fields from payload (no API call)`);
        } else {
          console.log(`Webhook: No form fields found in payload for opp ${ghlOppId}`);
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

  const { data: existing } = await supabase.from('contacts').select('id').not('id', 'is', null).eq('ghl_contact_id', contactId).maybeSingle();

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
        .not('id', 'is', null)
        .is('contact_id', null)
        .ilike('contact_name', contactFullName);
      if (orphanedInquiries && orphanedInquiries.length > 0) {
        await supabase
          .from('inquiries')
          .update({ contact_id: resolvedContactId })
          .not('id', 'is', null)
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

  const { data: existing } = await supabase.from('bookings').select('id').not('id', 'is', null).eq('ghl_event_id', eventId).maybeSingle();

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

// stageToStatus is now defined at the top of the file

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
      date_added: payload.dateAdded || payload.date_added || payload.createdAt || payload.created_at || new Date().toISOString(),
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

