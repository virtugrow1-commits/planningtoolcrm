// Shared GoHighLevel helpers for ghl-sync, ghl-auto-sync and ghl-webhook.
//
// Everything that decides "who wins", "which pipeline stage", or "how does a
// CRM reservation look as a GHL appointment" lives here, so the three entry
// points can never drift apart again.

export const GHL_API_BASE = 'https://services.leadconnectorhq.com';

/** Prefix used on GHL appointment titles for CRM options. */
export const OPTION_TITLE_PREFIX = '[OPTIE]';

// ---------------------------------------------------------------------------
// Timestamps
// ---------------------------------------------------------------------------

/** Parse any ISO-ish timestamp (Postgres "+00:00", GHL "Z" or epoch ms) to ms. */
export function parseTs(value: unknown): number {
  if (value === null || value === undefined || value === '') return NaN;
  if (typeof value === 'number') return value > 1e12 ? value : value * 1000;
  const n = Number(value);
  if (!Number.isNaN(n) && String(value).trim() !== '' && /^\d+$/.test(String(value).trim())) {
    return n > 1e12 ? n : n * 1000;
  }
  return Date.parse(String(value));
}

/**
 * CRM wins when GHL has no usable timestamp, or when the CRM record was
 * updated at the same time or later than the GHL record.
 * Never compare ISO strings lexically: "…+00:00" vs "…Z" sorts wrong.
 */
export function crmIsNewer(crmUpdatedAt: unknown, ghlUpdatedAt: unknown): boolean {
  const ghlMs = parseTs(ghlUpdatedAt);
  if (!Number.isFinite(ghlMs)) return true;
  const crmMs = parseTs(crmUpdatedAt);
  if (!Number.isFinite(crmMs)) return false;
  return crmMs >= ghlMs;
}

/** True when `ts` is within the last `windowMs` milliseconds. */
export function isWithin(ts: unknown, windowMs: number): boolean {
  const ms = parseTs(ts);
  return Number.isFinite(ms) && Date.now() - ms < windowMs;
}

/** yyyy-MM-dd part of any date/time string, or null. */
export function dateOnly(value: unknown): string | null {
  if (!value) return null;
  const s = String(value);
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const ms = parseTs(s);
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : null;
}

// ---------------------------------------------------------------------------
// Europe/Amsterdam conversions
// ---------------------------------------------------------------------------

/** Convert an absolute Date to Europe/Amsterdam local components. */
export function toAmsterdam(date: Date): { dateStr: string; hours: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '00';
  const hours = Number(get('hour')) % 24; // Intl may return "24" at midnight
  return {
    dateStr: `${get('year')}-${get('month')}-${get('day')}`,
    hours,
    minutes: Number(get('minute')),
  };
}

/** UTC offset string ("+02:00") for Europe/Amsterdam at noon on the given day. */
export function amsterdamOffset(dateStr: string): string {
  const probe = new Date(`${dateStr}T12:00:00Z`);
  const local = toAmsterdam(probe);
  const localAsUtc = Date.UTC(
    Number(local.dateStr.slice(0, 4)), Number(local.dateStr.slice(5, 7)) - 1, Number(local.dateStr.slice(8, 10)),
    local.hours, local.minutes,
  );
  const offsetMin = Math.round((localAsUtc - probe.getTime()) / 60000);
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Pipeline stage <-> CRM inquiry status
// ---------------------------------------------------------------------------

export const INQUIRY_STATUSES = [
  'new', 'contacted', 'option', 'quoted', 'quote_revised', 'reserved', 'confirmed',
  'script', 'invoiced', 'converted', 'lost', 'after_sales', 'condolence_reminder',
] as const;
export type InquiryStatus = typeof INQUIRY_STATUSES[number];

/**
 * Keywords (lowercase) that identify the GHL pipeline stage for a CRM status.
 * Order matters for lookups: the first status whose keyword matches wins, so
 * more specific names ("aangepaste offerte") come before generic ones ("offerte").
 */
export const STATUS_STAGE_KEYWORDS: Array<[InquiryStatus, string[]]> = [
  ['new', ['nieuwe aanvraag']],
  ['contacted', ['lopend contact']],
  ['option', ['optie']],
  ['quote_revised', ['aangepaste offerte']],
  ['quoted', ['offerte verzonden', 'offerte']],
  ['confirmed', ['definitieve reservering', 'definitief']],
  ['reserved', ['reservering']],
  ['script', ['draaiboek']],
  ['invoiced', ['facturatie', 'invoice', 'factuur']],
  ['lost', ['vervallen', 'verloren', 'lost']],
  ['after_sales', ['after sales', 'aftersales']],
  ['condolence_reminder', ['condoleance', 'condolence']],
  ['converted', ['evenement']],
];

/** Map a GHL pipeline stage name to the CRM inquiry status. */
export function stageToStatus(stageName: string | null | undefined): InquiryStatus {
  const l = String(stageName || '').toLowerCase().trim();
  if (!l) return 'new';
  if (l === 'new') return 'new';
  for (const [status, keywords] of STATUS_STAGE_KEYWORDS) {
    if (keywords.some((kw) => l.includes(kw))) return status;
  }
  return 'new';
}

export interface GhlPipelineStage { id: string; name: string }
export interface GhlPipeline { id: string; name?: string; stages?: GhlPipelineStage[] }

/** Find the pipeline + stage ids for a CRM status. */
export function findStageForStatus(
  pipelines: GhlPipeline[] | undefined | null,
  status: string,
): { pipelineId: string; stageId: string } | null {
  const entry = STATUS_STAGE_KEYWORDS.find(([s]) => s === status);
  if (!entry) return null;
  const keywords = entry[1];
  for (const pipeline of pipelines || []) {
    for (const stage of pipeline.stages || []) {
      const name = String(stage.name || '').toLowerCase();
      // A stage must map back to the same status, otherwise "offerte" would
      // also match "aangepaste offerte verzonden".
      if (keywords.some((kw) => name.includes(kw)) && stageToStatus(stage.name) === status) {
        return { pipelineId: pipeline.id, stageId: stage.id };
      }
    }
  }
  return null;
}

/**
 * CRM statuses in which the reservation has actually taken place. Only then is
 * the opportunity "won" in GHL (client rule: won = er is een reservering geweest).
 * A definitive reservation that still has to happen stays "open".
 */
export const WON_STATUSES: ReadonlySet<string> = new Set(['invoiced', 'after_sales', 'converted', 'condolence_reminder']);

/** GHL opportunity status (open/won/lost) for a CRM inquiry status. */
export function ghlOpportunityStatus(status: string): 'open' | 'won' | 'lost' {
  if (status === 'lost') return 'lost';
  if (WON_STATUSES.has(status)) return 'won';
  return 'open';
}

/**
 * Body for PUT /opportunities/{id} that moves the opportunity to the stage
 * belonging to the CRM status. Never resets the stage when no match exists.
 */
export function buildOpportunityUpdate(
  pipelines: GhlPipeline[] | undefined | null,
  inquiry: { status: string; event_type?: string | null; budget?: number | string | null },
): Record<string, unknown> {
  const payload: Record<string, unknown> = { status: ghlOpportunityStatus(inquiry.status) };
  if (inquiry.event_type) payload.name = inquiry.event_type;
  if (inquiry.budget !== undefined && inquiry.budget !== null && inquiry.budget !== '') {
    payload.monetaryValue = Number(inquiry.budget) || 0;
  }
  const stage = findStageForStatus(pipelines, inquiry.status);
  if (stage) {
    payload.pipelineId = stage.pipelineId;
    payload.pipelineStageId = stage.stageId;
  }
  return payload;
}

// ---------------------------------------------------------------------------
// Bookings <-> GHL calendar appointments
// ---------------------------------------------------------------------------

export interface CrmBookingLike {
  id?: string;
  date: string;
  start_hour: number;
  start_minute?: number | null;
  end_hour: number;
  end_minute?: number | null;
  title?: string | null;
  notes?: string | null;
  status?: string | null;
  room_name?: string | null;
}

/** Local (Amsterdam) start/end ISO strings with offset for a CRM booking. */
export function bookingTimes(b: CrmBookingLike): { startTime: string; endTime: string } {
  const tz = amsterdamOffset(b.date);
  const pad = (n: number | null | undefined) => String(n ?? 0).padStart(2, '0');
  const startMin = (b.start_hour || 0) * 60 + (b.start_minute || 0);
  const endMin = (b.end_hour || 0) * 60 + (b.end_minute || 0);
  // Events that run past midnight (end < start, or "1:00" after a 19:00 start)
  // end on the next calendar day.
  const endDate = endMin <= startMin ? addDays(b.date, 1) : b.date;
  return {
    startTime: `${b.date}T${pad(b.start_hour)}:${pad(b.start_minute)}:00${tz}`,
    endTime: `${endDate}T${pad(b.end_hour)}:${pad(b.end_minute)}:00${tz}`,
  };
}

/** Title as it should appear in GHL (options are tagged so staff can see them). */
export function ghlTitleForBooking(b: CrmBookingLike): string {
  const base = (b.title || 'Reservering').replace(/^\s*\[OPTIE\]\s*/i, '').trim() || 'Reservering';
  return b.status === 'option' ? `${OPTION_TITLE_PREFIX} ${base}` : base;
}

/**
 * Appointment status to send to GHL.
 * Options are sent as "confirmed" on purpose: a "new" appointment fires the
 * client's GHL workflows (task creation, pipeline moves); the title prefix
 * still makes the option recognisable. Cancelled/expired reservations are
 * cancelled in GHL so the slot frees up there too.
 */
export function ghlAppointmentStatus(status: string | null | undefined): 'confirmed' | 'cancelled' {
  return status === 'cancelled' || status === 'expired' ? 'cancelled' : 'confirmed';
}

/** Full payload for POST/PUT /calendars/events/appointments. */
export function buildAppointmentPayload(
  b: CrmBookingLike,
  calendarId: string,
  locationId: string,
  ghlContactId: string,
): Record<string, unknown> {
  const { startTime, endTime } = bookingTimes(b);
  const isOption = b.status === 'option';
  const notes = isOption
    ? `${OPTION_TITLE_PREFIX} — geen workflow update${b.notes ? `\n\n${b.notes}` : ''}`
    : (b.notes || null);
  const payload: Record<string, unknown> = {
    calendarId,
    locationId,
    contactId: ghlContactId,
    title: ghlTitleForBooking(b),
    startTime,
    endTime,
    appointmentStatus: ghlAppointmentStatus(b.status),
    ignoreDateRange: true,
    ignoreValidation: true,
    ignoreFreeSlotValidation: true,
    selectedTimezone: 'Europe/Amsterdam',
  };
  if (notes) payload.notes = notes;
  return payload;
}

/**
 * Status to store when a GHL event is pulled over an existing CRM booking.
 * "expired" is a CRM-only state that we send to GHL as "cancelled"; it must
 * survive the round trip instead of turning into "cancelled".
 */
export function mergePulledBookingStatus(existingStatus: string | null | undefined, pulled: 'confirmed' | 'option' | 'cancelled'): string {
  if (existingStatus === 'expired' && pulled === 'cancelled') return 'expired';
  return pulled;
}

export interface ParsedGhlEvent {
  dateStr: string;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  title: string;
  status: 'confirmed' | 'option' | 'cancelled';
  ghlContactId: string | null;
  updatedAt: string | null;
}

/**
 * Read a GHL calendar event / appointment into CRM booking fields.
 * Returns null when the event has no usable start time.
 */
export function parseGhlEvent(evt: any): ParsedGhlEvent | null {
  const start = new Date(evt.startTime || evt.start || evt.startDate);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(evt.endTime || evt.end || evt.endDate);
  const startLocal = toAmsterdam(start);
  const endLocal = Number.isNaN(end.getTime()) ? null : toAmsterdam(end);

  const rawTitle = String(evt.title || evt.name || evt.calendarName || 'GHL Afspraak');
  const isOptionTitle = /^\s*\[OPTIE\]/i.test(rawTitle);
  const title = rawTitle.replace(/^\s*\[OPTIE\]\s*/i, '').trim() || 'GHL Afspraak';

  const rawStatus = String(evt.appointmentStatus || evt.status || '').toLowerCase();
  let status: ParsedGhlEvent['status'];
  if (isOptionTitle) status = 'option';
  else if (rawStatus === 'cancelled' || rawStatus === 'canceled') status = 'cancelled';
  else if (rawStatus === 'confirmed' || rawStatus === 'showed' || rawStatus === 'noshow') status = 'confirmed';
  else status = 'option';

  return {
    dateStr: startLocal.dateStr,
    startHour: startLocal.hours,
    startMinute: startLocal.minutes,
    endHour: endLocal ? endLocal.hours : Math.min(startLocal.hours + 1, 23),
    endMinute: endLocal ? endLocal.minutes : 0,
    title,
    status,
    ghlContactId: evt.contactId || evt.contact?.id || null,
    updatedAt: evt.dateUpdated || evt.updatedAt || evt.dateAdded || null,
  };
}

// ---------------------------------------------------------------------------
// Inquiry status writes from GHL
// ---------------------------------------------------------------------------

/**
 * Apply a GHL-origin patch to an inquiry WITHOUT establishing the 24h local
 * status lock. The DB trigger stamps local_status_changed_at on any status
 * change unless the caller changed that column in the same statement, which
 * is impossible when it is already NULL. So we write in two steps.
 */
export async function applyRemoteInquiryPatch(
  supabase: any,
  inquiryId: string,
  patch: Record<string, unknown>,
): Promise<{ error: any }> {
  const { local_status_changed_at: _ignored, ...fields } = patch;
  const { error } = await supabase.from('inquiries').update(fields).eq('id', inquiryId);
  if (error) return { error };
  if ('status' in fields) {
    const { error: err2 } = await supabase
      .from('inquiries')
      .update({ local_status_changed_at: null })
      .eq('id', inquiryId);
    if (err2) return { error: err2 };
  }
  return { error: null };
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

/**
 * ISO dueDate for the GHL Tasks API (which requires one). Uses the CRM due
 * date + time in Europe/Amsterdam; falls back to tomorrow 09:00 when the CRM
 * task has no date so the push does not fail with a 422.
 */
export function ghlTaskDueDate(dueDate?: string | null, dueTime?: string | null): string {
  let day = dateOnly(dueDate);
  if (!day) day = addDays(new Date().toISOString().slice(0, 10), 1);
  const time = dueTime && /^\d{2}:\d{2}/.test(String(dueTime)) ? String(dueTime).slice(0, 5) : '09:00';
  return `${day}T${time}:00${amsterdamOffset(day)}`;
}

/** Calendar date (Europe/Amsterdam) of a GHL task dueDate, for the CRM date column. */
export function ghlDueDateLocal(dueDate: unknown): string | null {
  const ms = parseTs(dueDate);
  if (!Number.isFinite(ms)) return null;
  return toAmsterdam(new Date(ms)).dateStr;
}

/** Body for POST/PUT /contacts/{id}/tasks/… from a CRM task row. */
export function buildTaskPayload(task: {
  title?: string | null; description?: string | null; status?: string | null;
  due_date?: string | null; due_time?: string | null;
}): Record<string, unknown> {
  return {
    title: task.title || 'Taak',
    body: task.description || '',
    dueDate: ghlTaskDueDate(task.due_date, task.due_time),
    completed: task.status === 'completed',
  };
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

/** JSON response with CORS headers. */
export function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  });
}

/** Read a GHL error body for logging without throwing. */
export async function readError(res: Response): Promise<string> {
  try { return (await res.text()).slice(0, 1000); } catch { return `HTTP ${res.status}`; }
}
