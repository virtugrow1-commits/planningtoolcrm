export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company?: string;
  status: 'lead' | 'prospect' | 'client' | 'inactive';
  createdAt: string;
  notes?: string;
  ghlContactId?: string;
}

export interface Inquiry {
  id: string;
  contactId: string;
  contactName: string;
  eventType: string;
  preferredDate: string;
  roomPreference?: string;
  guestCount: number;
  budget?: number;
  message: string;
  status: 'new' | 'contacted' | 'option' | 'quoted' | 'quote_revised' | 'reserved' | 'confirmed' | 'invoiced' | 'converted' | 'lost' | 'after_sales';
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
  roomName: RoomName;
  date: string;
  startHour: number;
  endHour: number;
  title: string;
  contactName: string;
  contactId?: string;
  status: 'confirmed' | 'option';
  notes?: string;
  color?: string;
}

export interface DaySchedule {
  date: string;
  bookings: Booking[];
}
