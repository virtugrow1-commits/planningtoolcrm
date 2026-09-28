// Pure, testable logic for the CRM automations. No I/O in this file; the
// edge function `crm-automations` loads data, calls these helpers and writes.

export type TemplateTrigger =
  | 'booking_confirmed'
  | 'booking_option'
  | 'booking_cancelled'
  | 'quote_sent'
  | 'quote_signed'
  | 'event_passed'
  | 'option_expiring';

export interface TaskTemplate {
  id: string;
  trigger: TemplateTrigger;
  title: string;
  description?: string | null;
  anchor: 'event_date' | 'trigger_date';
  offset_days: number;
  assignees: string[];
  priority: 'low' | 'normal' | 'high' | 'urgent';
  enabled: boolean;
}

export interface AutomationContext {
  /** Local calendar date (yyyy-MM-dd) considered "today". */
  today: string;
  /** Reservation date (yyyy-MM-dd), when the entity is a booking. */
  eventDate?: string | null;
  /** Date (yyyy-MM-dd) the trigger fired (document sent, option placed, …). */
  triggerDate?: string | null;
  /** Free-text placeholders for titles: {naam}, {bedrijf}, {titel}, {datum}. */
  placeholders?: Record<string, string | null | undefined>;
}

export interface PlannedTask {
  automation_key: string;
  title: string;
  description: string | null;
  due_date: string;
  priority: TaskTemplate['priority'];
  assigned_to: string | null;
  template_id: string;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  const ta = Date.parse(`${a}T00:00:00Z`);
  const tb = Date.parse(`${b}T00:00:00Z`);
  return Math.round((tb - ta) / 86400000);
}

export function maxDate(a: string, b: string): string {
  return a >= b ? a : b;
}

export function minDate(a: string, b: string): string {
  return a <= b ? a : b;
}

/** Local calendar date in Europe/Amsterdam for an instant. */
export function amsterdamDate(instant: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '01';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

// ---------------------------------------------------------------------------
// Templates → tasks
// ---------------------------------------------------------------------------

/** "Optie nabellen - {naam}" → "Optie nabellen - Jan Jansen"; unknown placeholders are removed. */
export function fillPlaceholders(text: string, placeholders: Record<string, string | null | undefined> = {}): string {
  return text
    .replace(/\{(\w+)\}/g, (_, key) => (placeholders[key] ?? '').toString())
    .replace(/\s+[-–—]\s*$/u, '') // trailing " - " when the placeholder was empty
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Due date for a template: anchored on the event date or the trigger date,
 * never before today (a task for an event in 5 days with offset -14 is due today).
 */
export function dueDateFor(template: TaskTemplate, ctx: AutomationContext): string | null {
  const anchor = template.anchor === 'event_date' ? ctx.eventDate : (ctx.triggerDate || ctx.today);
  if (!anchor) return null;
  return maxDate(addDays(anchor, template.offset_days), ctx.today);
}

/**
 * Expand one template into concrete tasks for an entity. One task per assignee
 * (the client wants every task both on Sjors and on Iris); no assignees → one
 * unassigned task. The automation_key makes every task idempotent.
 */
export function planTasks(
  template: TaskTemplate,
  entityKey: string,
  ctx: AutomationContext,
): PlannedTask[] {
  if (!template.enabled) return [];
  const dueDate = dueDateFor(template, ctx);
  if (!dueDate) return [];
  const assignees = template.assignees.length ? template.assignees : [null];
  const title = fillPlaceholders(template.title, ctx.placeholders);
  const description = template.description ? fillPlaceholders(template.description, ctx.placeholders) : null;
  return assignees.map((assignee) => ({
    automation_key: `${template.id}:${entityKey}:${assignee ? slug(assignee) : 'unassigned'}`,
    title,
    description,
    due_date: dueDate,
    priority: template.priority,
    assigned_to: assignee,
    template_id: template.id,
  }));
}

export function slug(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Default "{naam} - {titel}" style title suffix used by GHL tasks ("Factuur sturen - Jan Jansen"). */
export function withNameSuffix(title: string, name?: string | null): string {
  const t = title.trim();
  // Placeholder present, or the title already carries a " - …" suffix → leave it alone
  if (!name || /\{naam\}/.test(t) || /\s[-–—]\s/.test(t)) return t;
  return `${t} - ${name}`;
}

// ---------------------------------------------------------------------------
// Option expiry
// ---------------------------------------------------------------------------

export interface OptionExpiryConfig {
  default_days_before_event: number;
  warn_days_before_expiry: number;
  auto_expire: boolean;
}

/** Expiry date of an option: explicit date, otherwise N days before the event. */
export function optionExpiryDate(
  booking: { date: string; option_expires_at?: string | null; created_at?: string | null },
  cfg: OptionExpiryConfig,
): string {
  const eventDate = String(booking.date).slice(0, 10);
  if (booking.option_expires_at) return minDate(String(booking.option_expires_at).slice(0, 10), eventDate);
  const byEvent = addDays(eventDate, -Math.max(0, cfg.default_days_before_event));
  // An option placed later than "N days before" still gets a few days to decide,
  // but never longer than the event date itself.
  const created = booking.created_at ? String(booking.created_at).slice(0, 10) : null;
  if (created && byEvent < created) return minDate(addDays(created, Math.min(3, Math.max(0, cfg.warn_days_before_expiry))), eventDate);
  return byEvent;
}

export type OptionState = 'active' | 'warn' | 'expired';

export function optionState(expiresAt: string, today: string, cfg: OptionExpiryConfig): OptionState {
  if (today > expiresAt) return 'expired';
  if (daysBetween(today, expiresAt) <= Math.max(0, cfg.warn_days_before_expiry)) return 'warn';
  return 'active';
}

// ---------------------------------------------------------------------------
// Quote documents
// ---------------------------------------------------------------------------

export interface QuoteDocumentsConfig {
  sent_status: string;
  signed_status: string;
  convert_option_to_confirmed: boolean;
  title_keywords: string[];
}

/** Is this GHL document an offerte/contract this automation should act on? */
export function isQuoteDocument(doc: { title?: string | null; document_type?: string | null }, cfg: QuoteDocumentsConfig): boolean {
  const title = String(doc.title || '').toLowerCase();
  const type = String(doc.document_type || '').toLowerCase();
  const keywords = (cfg.title_keywords || []).map((k) => k.toLowerCase()).filter(Boolean);
  if (keywords.length === 0) return type === 'proposal' || type === 'estimate' || type === 'contract';
  return keywords.some((k) => title.includes(k)) || type === 'proposal' || type === 'estimate';
}

/** Pipeline order used to decide whether a status change is a step forward. */
export const STATUS_ORDER: string[] = [
  'new', 'contacted', 'option', 'quoted', 'quote_revised', 'reserved', 'script',
  'confirmed', 'invoiced', 'after_sales', 'converted', 'condolence_reminder',
];

/** Only move an inquiry forward in the pipeline, never backwards (and never out of "lost"). */
export function isForwardStatusChange(current: string, next: string): boolean {
  if (current === next || current === 'lost') return false;
  const ci = STATUS_ORDER.indexOf(current);
  const ni = STATUS_ORDER.indexOf(next);
  if (ni < 0) return false;
  return ci < 0 || ni > ci;
}

// ---------------------------------------------------------------------------
// Inbound reply SLA
// ---------------------------------------------------------------------------

export function inboundOverdue(
  conv: { last_message_direction?: string | null; last_message_date?: string | null; unread?: boolean | null },
  now: Date,
  hours: number,
): boolean {
  if (conv.last_message_direction !== 'inbound' || !conv.unread || !conv.last_message_date) return false;
  const ms = Date.parse(conv.last_message_date);
  if (!Number.isFinite(ms)) return false;
  return now.getTime() - ms >= Math.max(0, hours) * 3600000;
}

// ---------------------------------------------------------------------------
// Contact tags
// ---------------------------------------------------------------------------

/**
 * Tags a contact should carry for its CRM status: adds the tag for the current
 * status and removes the tags of the other statuses in the mapping.
 */
export function tagsForContactStatus(
  currentTags: string[],
  status: string | null | undefined,
  mapping: Record<string, string>,
): { tags: string[]; changed: boolean } {
  const statusTags = new Set(Object.values(mapping).map((t) => t.toLowerCase()));
  const wanted = status ? mapping[status] : undefined;
  const kept = currentTags.filter((t) => !statusTags.has(t.toLowerCase()) || (wanted && t.toLowerCase() === wanted.toLowerCase()));
  const tags = wanted && !kept.some((t) => t.toLowerCase() === wanted.toLowerCase()) ? [...kept, wanted] : kept;
  const changed = tags.length !== currentTags.length || tags.some((t, i) => t !== currentTags[i]);
  return { tags, changed };
}
