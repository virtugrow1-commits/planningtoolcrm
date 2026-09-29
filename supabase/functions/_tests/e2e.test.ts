// End-to-end tests: real edge functions + real Postgres/PostgREST + mock GoHighLevel.
// Run via ./run_e2e.sh (starts all services). The database must be freshly built.

import { assert, assertEquals } from "jsr:@std/assert@1";
import { createClient } from "npm:@supabase/supabase-js@2";
import { makeJwt } from "./jwt.ts";

const BASE = 'http://127.0.0.1:9000';
const SERVICE = Deno.env.get('E2E_SERVICE')!;
const db = createClient(BASE, SERVICE, { auth: { persistSession: false } });

const SJORS = 'aaaaaaaa-0000-0000-0000-000000000001';
const IRIS = 'aaaaaaaa-0000-0000-0000-000000000002';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const addDays = (d: string, n: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(new Date());

let USER_JWT = '';

/** "+01:00" or "+02:00": Europe/Amsterdam offset on a given date */
function amsOffset(date: string): string {
  const probe = new Date(`${date}T12:00:00Z`);
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Amsterdam', hour: '2-digit', hour12: false }).format(probe));
  return `+0${h - 12}:00`;
}

async function psql(sql: string): Promise<string> {
  const cmd = new Deno.Command('psql', {
    args: ['-h', '/tmp/pgtest', '-p', '54329', '-U', 'postgres', '-d', 'crm', '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql],
    stdout: 'piped', stderr: 'piped',
  });
  const out = await cmd.output();
  const err = new TextDecoder().decode(out.stderr);
  if (!out.success) throw new Error(`psql failed: ${err}`);
  return new TextDecoder().decode(out.stdout).trim();
}

async function fn(name: string, body: unknown, token = USER_JWT, extraHeaders: Record<string, string> = {}, query = '') {
  const res = await fetch(`${BASE}/functions/v1/${name}${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: Deno.env.get('E2E_ANON')!, ...extraHeaders },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = text;
  try { data = JSON.parse(text); } catch { /* keep text */ }
  return { status: res.status, data };
}

async function ghl(): Promise<any> { return await (await fetch(`${BASE}/__state`)).json(); }
async function seed(patch: Record<string, unknown>) {
  await fetch(`${BASE}/__seed`, { method: 'POST', body: JSON.stringify(patch) });
}
async function one(table: string, id: string, cols = '*') {
  const { data, error } = await db.from(table).select(cols).eq('id', id).single();
  if (error) throw error;
  return data as any;
}
async function insert(table: string, row: Record<string, unknown>) {
  const { data, error } = await db.from(table).insert(row).select('*').single();
  if (error) throw new Error(`${table}: ${error.message}`);
  return data as any;
}
async function setAutomation(key: string, enabled: boolean, config?: Record<string, unknown>) {
  const { data: cur } = await db.from('automation_settings').select('config').eq('key', key).single();
  await db.from('automation_settings').update({ enabled, config: { ...(cur?.config || {}), ...(config || {}) } }).eq('key', key);
}
/** Run ghl-auto-sync (it works in the background) and wait until the run is logged. */
async function autoSync(scope: 'light' | 'full' = 'light') {
  await psql(`delete from sync_log where action in ('auto-sync-run','auto-sync-full')`);
  if (scope === 'light') await psql(`insert into sync_log(user_id, action, entity_type, details, status) values ('${SJORS}','auto-sync-full','system','{}','success')`);
  const r = await fn('ghl-auto-sync', { source: 'test', scope: scope === 'full' ? 'full' : undefined, trigger: 'test' }, Deno.env.get('E2E_ANON')!);
  assertEquals(r.status, 200, JSON.stringify(r.data));
  for (let i = 0; i < 120; i++) {
    const done = await psql(`select count(*) from sync_log where action='auto-sync-run' and details->>'phase' in ('completed','failed')`);
    if (done !== '0') {
      const res = await psql(`select details::text from sync_log where action='auto-sync-run' and details->>'phase' in ('completed','failed') order by created_at desc limit 1`);
      return JSON.parse(res);
    }
    await sleep(250);
  }
  throw new Error('auto-sync did not finish');
}

const PIPELINE = {
  id: 'pl_main', name: 'Aanvragen',
  stages: [
    'Nieuwe Aanvraag', 'Lopend contact', 'Optie', 'Offerte Verzonden', 'Aangepaste offerte verzonden',
    'Reservering', 'Draaiboek maken', 'Definitieve Reservering (2 weken)', 'Facturatie', 'Vervallen / Verloren',
    'After Sales', 'Evenement', 'Condoleance Herinnering',
  ].map((name, i) => ({ id: `st_${i}`, name })),
};
const stageId = (name: string) => PIPELINE.stages.find((s) => s.name === name)!.id;

Deno.test({ name: 'CliqCRM ↔ GoHighLevel end-to-end', sanitizeOps: false, sanitizeResources: false }, async (t) => {
  // ------------------------------------------------------------------ setup
  await psql(`insert into auth.users(id, email, raw_user_meta_data) values
    ('${SJORS}','sjors@example.test','{"full_name":"Sjors Jochems"}'),
    ('${IRIS}','iris@example.test','{"full_name":"Iris Machielse"}') on conflict do nothing`);
  await psql(`update profiles set organization_id = (select organization_id from profiles where id='${SJORS}') where id='${IRIS}'`);
  // seeds of the automations migration need an existing profile → re-run it now (idempotent)
  await psql(Deno.readTextFileSync(new URL('../../migrations/20260929100000_crm_automations.sql', import.meta.url)));
  await psql(`insert into room_settings(user_id, room_name, max_guests, ghl_calendar_id) values ('${SJORS}','Zaal A',80,'cal_a')`);
  USER_JWT = await makeJwt({ role: 'authenticated', sub: SJORS, aud: 'authenticated', email: 'sjors@example.test' });
  await fetch(`${BASE}/__reset`);
  await seed({
    pipelines: [PIPELINE],
    calendars: [{ id: 'cal_a', name: 'Zaal A', isActive: true }],
    customFields: [],
  });

  const contact = await insert('contacts', { user_id: SJORS, first_name: 'Dex', last_name: 'Boers', email: 'dex@example.test', phone: '+31612345688', company: 'Dex BV', status: 'lead' });
  let ghlContactId = '';

  await t.step('push-contact creates the GHL contact and marks it synced', async () => {
    const r = await fn('ghl-sync', { action: 'push-contact', contact });
    assertEquals(r.status, 200, JSON.stringify(r.data));
    const c = await one('contacts', contact.id);
    assert(c.ghl_contact_id, 'ghl_contact_id stored');
    assertEquals(c.pending_outbound_sync, false);
    ghlContactId = c.ghl_contact_id;
    const s = await ghl();
    assertEquals(s.contacts[ghlContactId].email, 'dex@example.test');
  });

  await t.step('push-contact update sends no locationId (GHL rejects it)', async () => {
    const c = await one('contacts', contact.id);
    const r = await fn('ghl-sync', { action: 'push-contact', contact: { ...c, phone: '+31600000000' } });
    assertEquals(r.status, 200, JSON.stringify(r.data));
    assertEquals((await ghl()).contacts[ghlContactId].phone, '+31600000000');
  });

  // Inquiry + option booking used by several steps
  const inquiry = await insert('inquiries', { user_id: SJORS, contact_id: contact.id, contact_name: 'Dex Boers', event_type: 'Zakelijke Bijeenkomst', status: 'new', guest_count: 20, preferred_date: addDays(today, 40), assigned_to: 'Iris Machielse' });
  const optionDate = addDays(today, 30);
  const option = await insert('bookings', { user_id: SJORS, room_name: 'Zaal A', date: optionDate, start_hour: 19, start_minute: 0, end_hour: 1, end_minute: 0, title: 'Borrel', contact_name: 'Dex Boers', contact_id: contact.id, inquiry_id: inquiry.id, status: 'option', guest_count: 45 });

  await t.step('push-booking: option → [OPTIE] title, confirmed status, end after midnight on the next day', async () => {
    const r = await fn('ghl-sync', { action: 'push-booking', booking: option });
    assertEquals(r.status, 200, JSON.stringify(r.data));
    const b = await one('bookings', option.id);
    assert(b.ghl_event_id, 'ghl_event_id stored');
    const a = (await ghl()).appointments[b.ghl_event_id];
    assertEquals(a.title, '[OPTIE] Borrel');
    assertEquals(a.appointmentStatus, 'confirmed');
    assertEquals(a.calendarId, 'cal_a');
    assertEquals(a.contactId, ghlContactId);
    assert(a.startTime.startsWith(`${optionDate}T19:00:00`), a.startTime);
    assert(a.endTime.startsWith(`${addDays(optionDate, 1)}T01:00:00`), a.endTime);
    assert(String(a.notes).startsWith('[OPTIE]'));
  });

  await t.step('pull: a newer GHL change keeps an option an option (was flipped to confirmed)', async () => {
    const b = await one('bookings', option.id);
    const s = await ghl();
    const appt = s.appointments[b.ghl_event_id];
    appt.dateUpdated = new Date(Date.now() + 60_000).toISOString();
    // 18:30 Amsterdam time on that date (winter or summer time)
    appt.startTime = `${optionDate}T18:30:00${amsOffset(optionDate)}`;
    await seed({ appointments: s.appointments });
    const r = await fn('ghl-sync', { action: 'sync-calendars' });
    assertEquals(r.status, 200, JSON.stringify(r.data));
    const after = await one('bookings', option.id);
    assertEquals(after.status, 'option');
    assertEquals(after.start_hour, 18);
    assertEquals(after.start_minute, 30);
    assertEquals(after.title, 'Borrel');
    assertEquals(after.contact_id, contact.id);
  });

  let oppId = '';
  await t.step('push-inquiry creates one opportunity in "Nieuwe Aanvraag"; a second push updates it', async () => {
    let r = await fn('ghl-sync', { action: 'push-inquiry', inquiry_id: inquiry.id, contact_name: 'Dex Boers', event_type: 'Zakelijke Bijeenkomst', status: 'new' });
    assertEquals(r.status, 200, JSON.stringify(r.data));
    oppId = (await one('inquiries', inquiry.id)).ghl_opportunity_id;
    assert(oppId);
    r = await fn('ghl-sync', { action: 'push-inquiry', inquiry_id: inquiry.id, contact_name: 'Dex Boers', event_type: 'Zakelijke Bijeenkomst', status: 'new' });
    assertEquals(r.status, 200, JSON.stringify(r.data));
    const opps = Object.values((await ghl()).opportunities) as any[];
    assertEquals(opps.length, 1, 'no duplicate opportunity');
    assertEquals(opps[0].pipelineStageId, stageId('Nieuwe Aanvraag'));
    assertEquals(opps[0].contactId, ghlContactId);
  });

  await t.step('push-inquiry-status maps every status to the right stage; won only after the event', async () => {
    const expect: [string, string, string][] = [
      ['contacted', 'Lopend contact', 'open'],
      ['option', 'Optie', 'open'],
      ['quoted', 'Offerte Verzonden', 'open'],
      ['quote_revised', 'Aangepaste offerte verzonden', 'open'],
      ['reserved', 'Reservering', 'open'],
      ['script', 'Draaiboek maken', 'open'],
      ['confirmed', 'Definitieve Reservering (2 weken)', 'open'],
      ['invoiced', 'Facturatie', 'won'],
      ['after_sales', 'After Sales', 'won'],
      ['converted', 'Evenement', 'won'],
      ['condolence_reminder', 'Condoleance Herinnering', 'won'],
      ['lost', 'Vervallen / Verloren', 'lost'],
      ['new', 'Nieuwe Aanvraag', 'open'],
    ];
    for (const [status, stage, oppStatus] of expect) {
      const r = await fn('ghl-sync', { action: 'push-inquiry-status', ghl_opportunity_id: oppId, status, name: 'Zakelijke Bijeenkomst', monetary_value: 1500 });
      assertEquals(r.status, 200, `${status}: ${JSON.stringify(r.data)}`);
      const o = (await ghl()).opportunities[oppId];
      assertEquals(o.pipelineStageId, stageId(stage), `stage for ${status}`);
      assertEquals(o.status, oppStatus, `opp status for ${status}`);
    }
  });

  await t.step('auto-sync: a newer stage change in GHL updates the CRM without a 24h lock', async () => {
    await psql(`update inquiries set status='new', local_status_changed_at = null, updated_at = now() - interval '1 hour' where id='${inquiry.id}'`);
    const s = await ghl();
    Object.assign(s.opportunities[oppId], { pipelineStageId: stageId('Offerte Verzonden'), status: 'open', name: 'Zakelijke Bijeenkomst', monetaryValue: 0, dateUpdated: new Date(Date.now() + 60_000).toISOString() });
    await seed({ opportunities: s.opportunities });
    const res = await autoSync('light');
    assertEquals(res.phase, 'completed', JSON.stringify(res));
    const inq = await one('inquiries', inquiry.id);
    assertEquals(inq.status, 'quoted');
    assertEquals(inq.local_status_changed_at, null, 'GHL-origin change must not lock the status');
  });

  await t.step('auto-sync: a status chosen in the CRM wins and is pushed to GHL', async () => {
    await db.from('inquiries').update({ status: 'reserved' }).eq('id', inquiry.id); // CRM change → trigger stamps the lock
    const res = await autoSync('light');
    assertEquals(res.phase, 'completed');
    assertEquals((await one('inquiries', inquiry.id)).status, 'reserved');
    assertEquals((await ghl()).opportunities[oppId].pipelineStageId, stageId('Reservering'));
  });

  await t.step('push-task without a due date still reaches GHL (dueDate is required)', async () => {
    const task = await insert('tasks', { user_id: SJORS, title: 'Bellen', status: 'open', priority: 'normal', contact_id: contact.id });
    const r = await fn('ghl-sync', { action: 'push-task', task });
    assertEquals(r.status, 200, JSON.stringify(r.data));
    assertEquals(r.data.ok, true, JSON.stringify(r.data));
    const t2 = await one('tasks', task.id);
    assert(t2.ghl_task_id);
    assert((await ghl()).tasks[t2.ghl_task_id].dueDate);
  });

  await t.step('push-booking: cancelled reservation cancels the GHL appointment', async () => {
    const b = await insert('bookings', { user_id: SJORS, room_name: 'Zaal A', date: addDays(today, 50), start_hour: 10, end_hour: 12, title: 'Vergadering', contact_name: 'Dex Boers', contact_id: contact.id, status: 'confirmed' });
    await fn('ghl-sync', { action: 'push-booking', booking: b });
    const withId = await one('bookings', b.id);
    await db.from('bookings').update({ status: 'cancelled' }).eq('id', b.id);
    const r = await fn('ghl-sync', { action: 'push-booking', booking: { ...withId, status: 'cancelled' } });
    assertEquals(r.status, 200, JSON.stringify(r.data));
    assertEquals((await ghl()).appointments[withId.ghl_event_id].appointmentStatus, 'cancelled');
  });

  await t.step('stage-offerte fills all nine offerte fields on the GHL contact', async () => {
    const r = await fn('stage-offerte', { inquiry_id: inquiry.id, bump: true });
    assertEquals(r.status, 200, JSON.stringify(r.data));
    assertEquals(r.data.ok, true, JSON.stringify(r.data));
    const fields = Object.fromEntries(((await ghl()).contacts[ghlContactId].customFields as any[]).map((f) => [f.id, f.value]));
    const d = `${optionDate.slice(8, 10)}-${optionDate.slice(5, 7)}-${optionDate.slice(0, 4)}`;
    assertEquals(fields['fIbhsRZEWfzrJaEChHUv'], d, 'datum from the reservation');
    assertEquals(fields['KsWTbojomRjolVt0uX8W'], '18:30', 'starttijd');
    assertEquals(fields['p3Op3sdxwZDeqrTTUBAc'], '01:00', 'eindtijd');
    assertEquals(fields['rHmHn79J8YpqAWGC3cOw'], '45', 'gasten from the reservation');
    assertEquals(fields['L0maTpOnmTs9uUNgNYX1'], 'Dex BV', 'bedrijf');
    assertEquals(fields['ojJr556776arwRPW3bwC'], 'Zakelijke Bijeenkomst', 'type');
    assertEquals(fields['Jjj92MCxxHGtlXQ3uACn'], '01', 'revisie');
    assert(fields['dMjCLFLYajsZG2jX75ku'] && fields['dMjCLFLYajsZG2jX75ku'] !== '—', 'reserveringsnummer');
    assert(fields['JMRAn3VvUCoksUv6qqrj'] && fields['JMRAn3VvUCoksUv6qqrj'] !== '—', 'offertenummer');
    // automatic mode keeps the revision
    const r2 = await fn('stage-offerte', { inquiry_id: inquiry.id, bump: false });
    assertEquals(r2.data.revisie, '01');
    // unauthenticated calls are refused
    const r3 = await fn('stage-offerte', { inquiry_id: inquiry.id }, 'not-a-token');
    assertEquals(r3.status, 401);
  });

  await t.step('crm-automations: templates create one task per colleague, pushed to GHL, idempotent', async () => {
    await psql(`update task_templates set enabled = true where trigger = 'booking_confirmed'`);
    const n = Number(await psql(`select count(*) from task_templates where trigger='booking_confirmed' and enabled`));
    assert(n >= 1);
    const b = await insert('bookings', { user_id: SJORS, room_name: 'Zaal A', date: addDays(today, 30), start_hour: 12, end_hour: 16, title: 'Lunch', contact_name: 'Dex Boers', contact_id: contact.id, inquiry_id: inquiry.id, status: 'confirmed' });
    const r1 = await fn('crm-automations', { source: 'test', booking_id: b.id });
    assertEquals(r1.status, 200, JSON.stringify(r1.data));
    assertEquals(r1.data.errors, [], JSON.stringify(r1.data.errors));
    const rows = JSON.parse(await psql(`select coalesce(json_agg(json_build_object('title',title,'assigned_to',assigned_to,'due',due_date,'ghl',ghl_task_id)),'[]') from tasks where booking_id='${b.id}'`));
    assertEquals(rows.length, n * 2, 'Sjors + Iris per template');
    assert(rows.every((x: any) => x.ghl), 'all pushed to GHL');
    assert(rows.every((x: any) => x.title.endsWith(' - Dex Boers')), 'name suffix');
    assert(rows.every((x: any) => x.due >= today), 'never due in the past');
    const r2 = await fn('crm-automations', { source: 'test', booking_id: b.id });
    assertEquals(r2.data.tasks_created, 0, 'second run creates nothing');
    assertEquals(Number(await psql(`select count(*) from tasks where booking_id='${b.id}'`)), n * 2);
    await psql(`update task_templates set enabled = false`);
  });

  await t.step('option expiry: expired option → "expired", GHL appointment cancelled, survives the next pull', async () => {
    await setAutomation('option_expiry', true);
    await db.from('bookings').update({ option_expires_at: addDays(today, -1) }).eq('id', option.id);
    const r = await fn('crm-automations', { source: 'test', booking_id: option.id });
    assertEquals(r.status, 200, JSON.stringify(r.data));
    assertEquals(r.data.options_expired, 1, JSON.stringify(r.data));
    const b = await one('bookings', option.id);
    assertEquals(b.status, 'expired');
    const s = await ghl();
    assertEquals(s.appointments[b.ghl_event_id].appointmentStatus, 'cancelled');
    s.appointments[b.ghl_event_id].dateUpdated = new Date(Date.now() + 120_000).toISOString();
    await seed({ appointments: s.appointments });
    await autoSync('light');
    assertEquals((await one('bookings', option.id)).status, 'expired', 'expired must not turn into cancelled');
    await setAutomation('option_expiry', false);
  });

  await t.step('documents: a sent GHL offerte is imported, moves the inquiry and bumps the revision; signing confirms', async () => {
    // fresh option linked to the inquiry, to be confirmed on signing
    const opt2 = await insert('bookings', { user_id: SJORS, room_name: 'Zaal A', date: addDays(today, 60), start_hour: 10, end_hour: 14, title: 'Training', contact_name: 'Dex Boers', contact_id: contact.id, inquiry_id: inquiry.id, status: 'option' });
    await fn('ghl-sync', { action: 'push-booking', booking: opt2 });
    await psql(`update inquiries set status='contacted', offerte_revisie = 1 where id='${inquiry.id}'`);
    await setAutomation('quote_documents', true);
    await psql(`update task_templates set enabled = true where trigger = 'quote_sent'`);
    await seed({ documents: [{ _id: 'doc_1', name: 'Offerte_Zakelijke bijeenkomst', status: 'sent', type: 'proposal', grandTotal: 1250.5, recipients: [{ contactId: ghlContactId, name: 'Dex Boers', isPrimary: true }], updatedAt: new Date().toISOString() }] });
    const s1 = await autoSync('light');
    assert(s1.results.documents_synced >= 1, JSON.stringify(s1.results));
    const doc = JSON.parse(await psql(`select row_to_json(d) from documents d where ghl_document_id='doc_1'`));
    assertEquals(doc.contact_id, contact.id);
    assertEquals(doc.inquiry_id, inquiry.id);
    assertEquals(Number(doc.amount), 1250.5);
    assertEquals(doc.status, 'sent');

    const r = await fn('crm-automations', { source: 'test' });
    assertEquals(r.data.errors, [], JSON.stringify(r.data.errors));
    const inq = await one('inquiries', inquiry.id);
    assertEquals(inq.status, 'quoted');
    assertEquals(inq.offerte_revisie, 2, 'revision bumped after sending');
    assert(Number(await psql(`select count(*) from tasks where inquiry_id='${inquiry.id}' and title like 'Offerte nabellen%'`)) >= 1);
    const rev = ((await ghl()).contacts[ghlContactId].customFields as any[]).find((f) => f.id === 'Jjj92MCxxHGtlXQ3uACn');
    assertEquals(rev.value, '02', 'GHL contact now carries revision 02 for the next offer');

    // signed
    await seed({ documents: [{ _id: 'doc_1', name: 'Offerte_Zakelijke bijeenkomst', status: 'completed', type: 'proposal', grandTotal: 1250.5, recipients: [{ contactId: ghlContactId, name: 'Dex Boers', isPrimary: true }] }] });
    await autoSync('light');
    assertEquals(JSON.parse(await psql(`select row_to_json(d) from documents d where ghl_document_id='doc_1'`)).status, 'signed');
    const r2 = await fn('crm-automations', { source: 'test' });
    assertEquals(r2.data.errors, [], JSON.stringify(r2.data.errors));
    assertEquals((await one('inquiries', inquiry.id)).status, 'confirmed');
    const b2 = await one('bookings', opt2.id);
    assertEquals(b2.status, 'confirmed');
    const appt = (await ghl()).appointments[b2.ghl_event_id];
    assertEquals(appt.title, 'Training', 'no [OPTIE] prefix anymore');
    // idempotent
    const r3 = await fn('crm-automations', { source: 'test' });
    assertEquals(r3.data.inquiries_updated, 0);
    await setAutomation('quote_documents', false);
    await psql(`update task_templates set enabled = false`);
  });

  await t.step('webhook: secret required; appointment delete cancels; contact echo never blanks data', async () => {
    const anon = Deno.env.get('E2E_ANON')!;
    let r = await fn('ghl-webhook', { type: 'ContactUpdate', id: ghlContactId, firstName: 'Dex' }, anon);
    assertEquals(r.status, 401);
    r = await fn('ghl-webhook', { type: 'ContactUpdate', id: ghlContactId, firstName: 'Dex' }, anon, {}, '?secret=hook-secret');
    assertEquals(r.status, 200, JSON.stringify(r.data));
    await psql(`update contacts set pending_outbound_sync = false where id='${contact.id}'`);
    r = await fn('ghl-webhook', { type: 'ContactUpdate', id: ghlContactId, firstName: 'Dex' }, anon, { 'x-webhook-secret': 'hook-secret' });
    const c = await one('contacts', contact.id);
    assertEquals(c.email, 'dex@example.test', 'email not blanked');
    assertEquals(c.company, 'Dex BV', 'company not blanked');

    const b = await insert('bookings', { user_id: SJORS, room_name: 'Zaal A', date: addDays(today, 70), start_hour: 9, end_hour: 11, title: 'Overleg', contact_name: 'Dex Boers', contact_id: contact.id, status: 'confirmed', ghl_event_id: 'ap_webhook_1' });
    r = await fn('ghl-webhook', { type: 'AppointmentDelete', id: 'ap_webhook_1' }, anon, {}, '?secret=hook-secret');
    assertEquals(r.status, 200);
    assertEquals((await one('bookings', b.id)).status, 'cancelled');

    // a new appointment from GHL lands in the mapped room with the linked contact
    r = await fn('ghl-webhook', { type: 'AppointmentCreate', id: 'ap_webhook_2', calendarId: 'cal_a', contactId: ghlContactId, title: '[OPTIE] Proeverij', startTime: `${addDays(today, 80)}T17:00:00${amsOffset(addDays(today, 80))}`, endTime: `${addDays(today, 80)}T21:00:00${amsOffset(addDays(today, 80))}`, appointmentStatus: 'confirmed' }, anon, {}, '?secret=hook-secret');
    assertEquals(r.status, 200);
    const nb = JSON.parse(await psql(`select row_to_json(b) from bookings b where ghl_event_id='ap_webhook_2'`));
    assertEquals(nb.room_name, 'Zaal A');
    assertEquals(nb.contact_id, contact.id);
    assertEquals(nb.status, 'option');
    assertEquals(nb.title, 'Proeverij');
    assertEquals(nb.start_hour, 17);
  });

  await t.step('post-event: contact becomes klant and gets GHL tags', async () => {
    await setAutomation('post_event', true);
    await insert('bookings', { user_id: SJORS, room_name: 'Zaal A', date: addDays(today, -1), start_hour: 18, end_hour: 22, title: 'Feest', contact_name: 'Dex Boers', contact_id: contact.id, status: 'confirmed' });
    const r = await fn('crm-automations', { source: 'test' });
    assertEquals(r.data.errors, [], JSON.stringify(r.data.errors));
    assertEquals((await one('contacts', contact.id)).status, 'client');
    const tags: string[] = (await ghl()).contacts[ghlContactId].tags;
    assert(tags.includes('klant') && tags.includes('review-aanvraag'), JSON.stringify(tags));
    await setAutomation('post_event', false);
  });

  await t.step('inbound reply SLA: unanswered message → one high-priority task', async () => {
    await setAutomation('inbound_reply_sla', true, { hours: 4, assignees: ['Sjors Jochems'] });
    await insert('conversations', { user_id: SJORS, ghl_conversation_id: 'cv_1', contact_id: contact.id, contact_name: 'Dex Boers', last_message_body: 'Is 12 okt nog vrij?', last_message_date: new Date(Date.now() - 5 * 3600_000).toISOString(), last_message_direction: 'inbound', unread: true });
    await fn('crm-automations', { source: 'test' });
    await fn('crm-automations', { source: 'test' });
    const rows = JSON.parse(await psql(`select json_agg(json_build_object('p',priority,'a',assigned_to)) from tasks where title like 'Beantwoorden:%'`));
    assertEquals(rows.length, 1);
    assertEquals(rows[0].p, 'high');
    assertEquals(rows[0].a, 'Sjors Jochems');
    await setAutomation('inbound_reply_sla', false);
  });

  await t.step('inquiry_created template: task for the owner of the inquiry', async () => {
    await insert('task_templates', { user_id: SJORS, trigger: 'inquiry_created', title: 'Aanvraag beantwoorden', anchor: 'trigger_date', offset_days: 1, assignees: [], priority: 'high', enabled: true });
    const inq = await insert('inquiries', { user_id: SJORS, contact_id: contact.id, contact_name: 'Dex Boers', event_type: 'Borrel', status: 'new', guest_count: 10, assigned_to: 'Iris Machielse' });
    const r = await fn('crm-automations', { source: 'app', inquiry_id: inq.id });
    assertEquals(r.data.errors, [], JSON.stringify(r.data.errors));
    const t1 = JSON.parse(await psql(`select row_to_json(t) from tasks t where inquiry_id='${inq.id}'`));
    assertEquals(t1.title, 'Aanvraag beantwoorden - Dex Boers');
    assertEquals(t1.assigned_to, 'Iris Machielse');
    assertEquals(t1.due_date, addDays(today, 1));
    await psql(`update task_templates set enabled = false`);
  });

  await t.step('consolidation: old custom rules no longer block inserts', async () => {
    const cnt = await psql(`select count(*) from pg_trigger where tgname='trg_custom_task_automations'`);
    assertEquals(cnt, '0');
  });

  await t.step('send-message: SMS and e-mail reach GHL for the linked contact', async () => {
    const conv = JSON.parse(await psql(`select row_to_json(c) from conversations c where ghl_conversation_id='cv_1'`));
    let r = await fn('ghl-sync', { action: 'send-message', conversationId: conv.id, message: 'Ja, nog vrij!', type: 'SMS' });
    assertEquals(r.data.success, true, JSON.stringify(r.data));
    r = await fn('ghl-sync', { action: 'send-message', conversationId: conv.id, message: 'Zie bijlage', type: 'Email', subject: 'Offerte' });
    assertEquals(r.data.success, true, JSON.stringify(r.data));
    const msgs = (await ghl()).messages;
    assertEquals(msgs.length, 2);
    assertEquals(msgs[0].type, 'SMS');
    assertEquals(msgs[1].type, 'Email');
    assertEquals(msgs[1].contactId, ghlContactId);
  });

  await t.step('no request ever sent locationId on an update', async () => {
    const bad = ((await ghl()).log as any[]).filter((l) => l.method === 'PUT' && l.body && 'locationId' in l.body && !l.path.startsWith('/calendars'));
    assertEquals(bad, []);
  });
});
