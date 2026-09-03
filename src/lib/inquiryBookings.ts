import { Booking, Inquiry } from '@/types/crm';

const sortByDate = (list: Booking[]) => [...list].sort((a, b) => a.date.localeCompare(b.date));

/**
 * Bepaalt welke reserveringen bij een aanvraag horen.
 * Is er een echte koppeling (bookings.inquiry_id), dan is die leidend.
 * Zo niet, dan wordt teruggevallen op de bestaande contact-match
 * (alleen voor reserveringen die nog geen eigen aanvraag-koppeling hebben).
 */
export function bookingsForInquiry(
  bookings: Booking[],
  inquiry: Pick<Inquiry, 'id' | 'contactId' | 'contactName'>
): Booking[] {
  const linked = bookings.filter((b) => b.inquiryId && b.inquiryId === inquiry.id);
  if (linked.length > 0) return sortByDate(linked);

  const name = (inquiry.contactName || '').toLowerCase();
  return sortByDate(
    bookings.filter((b) => {
      if (b.inquiryId) return false;
      if (inquiry.contactId) return b.contactId === inquiry.contactId;
      return !!name && (b.contactName || '').toLowerCase() === name;
    })
  );
}
