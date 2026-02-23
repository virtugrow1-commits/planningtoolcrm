export interface Contact {
  id: string;
  displayNumber?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company?: string;
  companyId?: string;
  status: 'lead' | 'prospect' | 'client' | 'inactive' | 'do_not_contact';
  createdAt: string;
  notes?: string;
  ghlContactId?: string;
}

export interface Inquiry {
  id: string;
  displayNumber?: string;
  contactId: string;
  contactName: string;
  eventType: string;
  preferredDate: string;
  roomPreference?: string;
  guestCount: number;
  budget?: number;
  message: string;
  status: 'new' | 'contacted' | 'option' | 'quoted' | 'quote_revised' | 'reserved' | 'confirmed' | 'script' | 'invoiced' | 'converted' | 'lost' | 'after_sales';
  createdAt: string;
  source: string;
  ghlOpportunityId?: string;
}

export interface Quotation {
  id: string;
  inquiryId?: string;
  contactId: string;
  contactName: string;
  title: string;
  items: QuotationItem[];
  totalAmount: number;
  status: 'draft' | 'sent' | 'accepted' | 'declined' | 'expired';
  validUntil: string;
  createdAt: string;
}

export interface QuotationItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export const ROOMS = [
  'Vergaderzaal 100',
  'Vergaderzaal 1.03',
  'Vergaderzaal 1.04',
  'Vergaderzaal 1.03+1.04',
  'Coachingruimte 2.05',
  'Keuken / Kookstudio',
  'Petit Café / Horeca',
  'BBQ- en Borrelterras',
] as const;

export type RoomName = typeof ROOMS[number];

export interface Booking {
  id: string;
  reservationNumber?: string;
  roomName: RoomName;
  date: string;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  title: string;
  contactName: string;
  contactId?: string;
  status: 'confirmed' | 'option';
  notes?: string;
  color?: string;
  guestCount?: number;
  roomSetup?: string;
  requirements?: string;
  preparationStatus?: 'pending' | 'info_waiting' | 'in_progress' | 'ready';
}

export interface DaySchedule {
  date: string;
  bookings: Booking[];
}
