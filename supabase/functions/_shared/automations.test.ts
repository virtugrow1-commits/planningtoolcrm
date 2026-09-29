import { assertEquals, assert } from "jsr:@std/assert@1";
import {
  addDays, daysBetween, dueDateFor, fillPlaceholders, planTasks, optionExpiryDate, optionState,
  isForwardStatusChange, inboundOverdue, tagsForContactStatus, isQuoteDocument, withNameSuffix,
  type TaskTemplate,
} from "./automations.ts";

const tpl = (over: Partial<TaskTemplate> = {}): TaskTemplate => ({
  id: 't1', trigger: 'booking_confirmed', title: 'Def. aantal gasten - {naam}', description: null,
  anchor: 'event_date', offset_days: -7, assignees: ['Sjors Jochems', 'Iris Machielse'],
  priority: 'normal', enabled: true, ...over,
});

Deno.test('addDays / daysBetween', () => {
  assertEquals(addDays('2026-10-31', 1), '2026-11-01');
  assertEquals(addDays('2026-03-29', -1), '2026-03-28'); // DST day
  assertEquals(daysBetween('2026-10-01', '2026-10-15'), 14);
});

Deno.test('dueDateFor anchors on event date and never lands in the past', () => {
  assertEquals(dueDateFor(tpl(), { today: '2026-10-01', eventDate: '2026-10-20' }), '2026-10-13');
  assertEquals(dueDateFor(tpl(), { today: '2026-10-18', eventDate: '2026-10-20' }), '2026-10-18');
  assertEquals(dueDateFor(tpl({ anchor: 'trigger_date', offset_days: 3 }), { today: '2026-10-01', triggerDate: '2026-10-05' }), '2026-10-08');
  assertEquals(dueDateFor(tpl({ anchor: 'trigger_date', offset_days: 3 }), { today: '2026-10-01' }), '2026-10-04');
  assertEquals(dueDateFor(tpl(), { today: '2026-10-01' }), null);
});

Deno.test('planTasks creates one task per assignee with stable keys', () => {
  const tasks = planTasks(tpl(), 'booking:b1', { today: '2026-10-01', eventDate: '2026-10-20', placeholders: { naam: 'Jan Jansen' } });
  assertEquals(tasks.length, 2);
  assertEquals(tasks[0].automation_key, 't1:booking:b1:sjors-jochems');
  assertEquals(tasks[0].title, 'Def. aantal gasten - Jan Jansen');
  assertEquals(tasks[0].due_date, '2026-10-13');
  assertEquals(tasks[1].assigned_to, 'Iris Machielse');
  assertEquals(planTasks(tpl({ enabled: false }), 'booking:b1', { today: '2026-10-01', eventDate: '2026-10-20' }), []);
  const unassigned = planTasks(tpl({ assignees: [] }), 'booking:b1', { today: '2026-10-01', eventDate: '2026-10-20' });
  assertEquals(unassigned.length, 1);
  assertEquals(unassigned[0].assigned_to, null);
  const owner = planTasks(tpl({ assignees: [] }), 'booking:b1', { today: '2026-10-01', eventDate: '2026-10-20', fallbackAssignee: 'Iris Machielse' });
  assertEquals(owner[0].assigned_to, 'Iris Machielse');
  assertEquals(owner[0].automation_key, 't1:booking:b1:iris-machielse');
});

Deno.test('fillPlaceholders drops empty suffix', () => {
  assertEquals(fillPlaceholders('Factuur sturen - {naam}', { naam: '' }), 'Factuur sturen');
  assertEquals(fillPlaceholders('Factuur sturen - {naam} ({bedrijf})', { naam: 'Jan', bedrijf: 'Acme' }), 'Factuur sturen - Jan (Acme)');
  assertEquals(withNameSuffix('Optie nabellen', 'Jan'), 'Optie nabellen - Jan');
  assertEquals(withNameSuffix('Optie nabellen - {naam}', 'Jan'), 'Optie nabellen - {naam}');
  assertEquals(withNameSuffix('Optie nabellen - Piet', 'Jan'), 'Optie nabellen - Piet');
});

Deno.test('option expiry', () => {
  const cfg = { default_days_before_event: 14, warn_days_before_expiry: 3, auto_expire: true };
  assertEquals(optionExpiryDate({ date: '2026-10-20' }, cfg), '2026-10-06');
  assertEquals(optionExpiryDate({ date: '2026-10-20', option_expires_at: '2026-10-10' }, cfg), '2026-10-10');
  // option placed 5 days before the event: still 3 days to decide
  assertEquals(optionExpiryDate({ date: '2026-10-20', created_at: '2026-10-15T10:00:00Z' }, cfg), '2026-10-18');
  // never later than the event itself
  assertEquals(optionExpiryDate({ date: '2026-10-20', created_at: '2026-10-19T10:00:00Z' }, cfg), '2026-10-20');
  assertEquals(optionExpiryDate({ date: '2026-10-20', option_expires_at: '2026-10-25' }, cfg), '2026-10-20');
  assertEquals(optionState('2026-10-06', '2026-10-01', cfg), 'active');
  assertEquals(optionState('2026-10-06', '2026-10-03', cfg), 'warn');
  assertEquals(optionState('2026-10-06', '2026-10-07', cfg), 'expired');
});

Deno.test('status only moves forward', () => {
  assert(isForwardStatusChange('new', 'quoted'));
  assert(isForwardStatusChange('option', 'confirmed'));
  assert(!isForwardStatusChange('confirmed', 'quoted'));
  assert(!isForwardStatusChange('lost', 'quoted'));
  assert(!isForwardStatusChange('quoted', 'quoted'));
});

Deno.test('inbound SLA', () => {
  const now = new Date('2026-10-01T12:00:00Z');
  assert(inboundOverdue({ last_message_direction: 'inbound', unread: true, last_message_date: '2026-10-01T07:00:00Z' }, now, 4));
  assert(!inboundOverdue({ last_message_direction: 'inbound', unread: true, last_message_date: '2026-10-01T10:00:00Z' }, now, 4));
  assert(!inboundOverdue({ last_message_direction: 'outbound', unread: true, last_message_date: '2026-10-01T07:00:00Z' }, now, 4));
  assert(!inboundOverdue({ last_message_direction: 'inbound', unread: false, last_message_date: '2026-10-01T07:00:00Z' }, now, 4));
});

Deno.test('contact status tags', () => {
  const mapping = { lead: 'lead', prospect: 'prospect', client: 'klant' };
  assertEquals(tagsForContactStatus(['nieuwsbrief', 'lead'], 'client', mapping), { tags: ['nieuwsbrief', 'klant'], changed: true });
  assertEquals(tagsForContactStatus(['nieuwsbrief', 'klant'], 'client', mapping).changed, false);
  assertEquals(tagsForContactStatus(['Klant'], 'client', mapping).changed, false);
});

Deno.test('quote document detection', () => {
  const cfg = { sent_status: 'quoted', signed_status: 'confirmed', convert_option_to_confirmed: true, title_keywords: ['offerte', 'contract'] };
  assert(isQuoteDocument({ title: 'Offerte_Zakelijk 2026', document_type: 'document' }, cfg));
  assert(isQuoteDocument({ title: 'Voorstel', document_type: 'proposal' }, cfg));
  assert(!isQuoteDocument({ title: 'Factuur 123', document_type: 'invoice' }, cfg));
});
