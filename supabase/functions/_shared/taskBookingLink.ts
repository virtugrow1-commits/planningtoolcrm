// Shared helper: attribute a synced task to the reservation (booking) it most
// likely belongs to. GoHighLevel tasks only carry a contact reference, so we
// match on the smallest distance between the task due date and a booking date.

export interface LinkableBooking {
  id: string;
  date: string; // yyyy-MM-dd
  contact_id?: string | null;
  company_id?: string | null;
  inquiry_id?: string | null;
}

export interface TaskLink {
  booking_id: string | null;
  inquiry_id: string | null;
}

const EMPTY: TaskLink = { booking_id: null, inquiry_id: null };

// Maximum distance (days) between task due date and booking date.
export const MAX_LINK_WINDOW_DAYS = 45;

function dayDiff(a: string, b: string): number | null {
  const ta = Date.parse(`${a}T00:00:00Z`);
  const tb = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return null;
  return Math.abs(ta - tb) / 86400000;
}

/**
 * Pick the booking a task belongs to.
 * - Prefers bookings of the same contact; falls back to the same company.
 * - Chooses the smallest date distance within MAX_LINK_WINDOW_DAYS.
 * - Returns nulls when there is no candidate or when two candidates tie.
 */
export function pickBookingForTask(
  bookings: LinkableBooking[],
  task: { contactId?: string | null; companyId?: string | null; dueDate?: string | null },
): TaskLink {
  if (!task.dueDate || !bookings?.length) return EMPTY;
  const due = task.dueDate.split('T')[0];

  const byContact = task.contactId
    ? bookings.filter((b) => b.contact_id && b.contact_id === task.contactId)
    : [];
  const candidates = byContact.length
    ? byContact
    : task.companyId
      ? bookings.filter((b) => b.company_id && b.company_id === task.companyId)
      : [];

  if (!candidates.length) return EMPTY;

  let best: LinkableBooking | null = null;
  let bestDiff = Number.POSITIVE_INFINITY;
  let tied = false;

  for (const b of candidates) {
    const diff = dayDiff(due, b.date);
    if (diff === null || diff > MAX_LINK_WINDOW_DAYS) continue;
    if (diff < bestDiff) {
      best = b;
      bestDiff = diff;
      tied = false;
    } else if (diff === bestDiff && best && b.id !== best.id) {
      tied = true;
    }
  }

  if (!best || tied) return EMPTY;
  return { booking_id: best.id, inquiry_id: best.inquiry_id || null };
}
