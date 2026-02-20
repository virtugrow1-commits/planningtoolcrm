import { Contact, Inquiry, Quotation, Booking } from '@/types/crm';

const today = new Date().toISOString().split('T')[0];

export const mockContacts: Contact[] = [
  { id: '1', firstName: 'Jan', lastName: 'de Vries', email: 'jan@devries.nl', phone: '+31 6 1234 5678', company: 'De Vries Events', status: 'client', createdAt: '2024-11-15' },
  { id: '2', firstName: 'Maria', lastName: 'Jansen', email: 'maria@jansen.nl', phone: '+31 6 2345 6789', status: 'prospect', createdAt: '2024-12-01' },
  { id: '3', firstName: 'Pieter', lastName: 'Bakker', email: 'pieter@bakker.com', phone: '+31 6 3456 7890', company: 'Bakker & Co', status: 'lead', createdAt: '2025-01-10' },
  { id: '4', firstName: 'Sophie', lastName: 'Mulder', email: 'sophie@mulder.nl', phone: '+31 6 4567 8901', status: 'client', createdAt: '2024-09-20' },
  { id: '5', firstName: 'Thomas', lastName: 'Visser', email: 'thomas@visser.nl', phone: '+31 6 5678 9012', company: 'Visser Group', status: 'lead', createdAt: '2025-02-01' },
  { id: '6', firstName: 'Emma', lastName: 'de Groot', email: 'emma@degroot.nl', phone: '+31 6 6789 0123', status: 'prospect', createdAt: '2025-01-25' },
];

export const mockInquiries: Inquiry[] = [
  { id: 'inq-1', contactId: '3', contactName: 'Pieter Bakker', eventType: 'Bedrijfsfeest', preferredDate: '2025-03-15', roomPreference: 'Grote Zaal', guestCount: 80, budget: 5000, message: 'We zoeken een locatie voor ons jaarlijkse bedrijfsfeest.', status: 'new', createdAt: '2025-02-18', source: 'Website' },
  { id: 'inq-2', contactId: '5', contactName: 'Thomas Visser', eventType: 'Vergadering', preferredDate: '2025-02-25', roomPreference: 'Boardroom', guestCount: 12, budget: 800, message: 'Boardroom nodig voor dagvergadering met lunch.', status: 'contacted', createdAt: '2025-02-17', source: 'Telefoon' },
  { id: 'inq-3', contactId: '6', contactName: 'Emma de Groot', eventType: 'Bruiloft', preferredDate: '2025-06-21', roomPreference: 'Grote Zaal', guestCount: 120, budget: 15000, message: 'Op zoek naar een mooie locatie voor onze bruiloft.', status: 'quoted', createdAt: '2025-02-15', source: 'Website' },
  { id: 'inq-4', contactId: '2', contactName: 'Maria Jansen', eventType: 'Workshop', preferredDate: '2025-03-05', guestCount: 25, message: 'Workshop fotografie, ruimte met veel daglicht gewenst.', status: 'new', createdAt: '2025-02-19', source: 'Email' },
];

export const mockQuotations: Quotation[] = [
  { id: 'off-1', inquiryId: 'inq-3', contactId: '6', contactName: 'Emma de Groot', title: 'Bruiloft - Grote Zaal - 21 juni', items: [{ description: 'Zaalhuur Grote Zaal (hele dag)', quantity: 1, unitPrice: 3500, total: 3500 }, { description: 'Catering 120 personen', quantity: 120, unitPrice: 75, total: 9000 }, { description: 'Decoratie pakket Premium', quantity: 1, unitPrice: 1500, total: 1500 }], totalAmount: 14000, status: 'sent', validUntil: '2025-03-15', createdAt: '2025-02-16' },
  { id: 'off-2', contactId: '1', contactName: 'Jan de Vries', title: 'Teambuilding - Atelier', items: [{ description: 'Zaalhuur Atelier (ochtend)', quantity: 1, unitPrice: 600, total: 600 }, { description: 'Koffie & lunch arrangement', quantity: 30, unitPrice: 25, total: 750 }], totalAmount: 1350, status: 'accepted', validUntil: '2025-02-28', createdAt: '2025-02-10' },
];

export const mockBookings: Booking[] = [
  { id: 'b-1', roomName: 'Vergaderzaal 100', date: today, startHour: 9, endHour: 17, title: 'Bedrijfsevent Van Dam', contactName: 'R. van Dam', status: 'confirmed' },
  { id: 'b-2', roomName: 'Vergaderzaal 1.03', date: today, startHour: 10, endHour: 12, title: 'Vergadering Visser Group', contactName: 'Thomas Visser', contactId: '5', status: 'confirmed' },
  { id: 'b-3', roomName: 'Coachingruimte 2.05', date: today, startHour: 13, endHour: 17, title: 'Fotoshoot Studio', contactName: 'L. Smit', status: 'option' },
  { id: 'b-4', roomName: 'Keuken / Kookstudio', date: today, startHour: 14, endHour: 18, title: 'Verjaardag feest', contactName: 'Maria Jansen', contactId: '2', status: 'confirmed' },
  { id: 'b-5', roomName: 'Vergaderzaal 1.04', date: today, startHour: 9, endHour: 12, title: 'Workshop Schilderen', contactName: 'A. Kunst', status: 'option' },
  { id: 'b-6', roomName: 'Petit Café / Horeca', date: today, startHour: 18, endHour: 22, title: 'Diner privé', contactName: 'Sophie Mulder', contactId: '4', status: 'confirmed' },
  { id: 'b-7', roomName: 'BBQ- en Borrelterras', date: today, startHour: 15, endHour: 20, title: 'Cocktailparty', contactName: 'J. Berg', status: 'option' },
];
