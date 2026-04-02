/** Line item shared between quotes and invoices */
export interface LineItem {
  id: string;
  sortOrder: number;
  itemName: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  vatRate: number; // 0, 9, or 21
  discountPercent: number;
  lineTotal: number;
}

export interface Quote {
  id: string;
  displayNumber?: string;
  userId: string;
  contactId?: string;
  companyId?: string;
  templateId?: string;
  contactName: string;
  companyName?: string;
  clientEmail?: string;
  clientAddress?: string;
  title: string;
  introduction?: string;
  termsAndConditions?: string;
  notes?: string;
  subtotal: number;
  vatAmount: number;
  discountAmount: number;
  total: number;
  status: 'draft' | 'sent' | 'viewed' | 'accepted' | 'declined';
  validUntil?: string;
  sentAt?: string;
  viewedAt?: string;
  acceptedAt?: string;
  declinedAt?: string;
  signatureData?: string;
  signatureIp?: string;
  signedPdfUrl?: string;
  publicToken?: string;
  ghlOpportunityId?: string;
  pdfUrl?: string;
  overlayFields?: any[];
  createdAt: string;
  updatedAt: string;
  lineItems?: LineItem[];
}

export interface Invoice {
  id: string;
  displayNumber?: string;
  userId: string;
  quoteId?: string;
  contactId?: string;
  companyId?: string;
  contactName: string;
  companyName?: string;
  clientEmail?: string;
  clientAddress?: string;
  title: string;
  subtotal: number;
  vatAmount: number;
  discountAmount: number;
  total: number;
  status: 'draft' | 'sent' | 'overdue' | 'paid';
  dueDate?: string;
  sentAt?: string;
  paidAt?: string;
  paymentMethod?: string;
  stripePaymentLink?: string;
  stripeInvoiceId?: string;
  ghlInvoiceId?: string;
  eboekhoudenMutationId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  lineItems?: LineItem[];
}

export interface QuoteTemplate {
  id: string;
  userId: string;
  name: string;
  description?: string;
  contentBlocks: any[];
  defaultLineItems: any[];
  termsAndConditions?: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export const VAT_RATES = [0, 9, 21] as const;

export const QUOTE_STATUSES = ['draft', 'sent', 'viewed', 'accepted', 'declined'] as const;
export const INVOICE_STATUSES = ['draft', 'sent', 'overdue', 'paid'] as const;

/** Calculate line total: (qty * price) - discount%, then vat is separate */
export function calcLineTotal(qty: number, unitPrice: number, discountPercent: number): number {
  const base = qty * unitPrice;
  const discount = base * (discountPercent / 100);
  return Math.round((base - discount) * 100) / 100;
}

/** Calculate financial summary from line items */
export function calcFinancials(items: LineItem[]) {
  let subtotal = 0;
  let discountAmount = 0;
  const vatBuckets: Record<number, number> = {};

  for (const item of items) {
    const base = item.quantity * item.unitPrice;
    const disc = base * (item.discountPercent / 100);
    const net = base - disc;
    subtotal += net;
    discountAmount += disc;

    const vatKey = item.vatRate;
    if (!vatBuckets[vatKey]) vatBuckets[vatKey] = 0;
    vatBuckets[vatKey] += net * (vatKey / 100);
  }

  const vatAmount = Object.values(vatBuckets).reduce((a, b) => a + b, 0);
  const total = subtotal + vatAmount;

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    discountAmount: Math.round(discountAmount * 100) / 100,
    vatAmount: Math.round(vatAmount * 100) / 100,
    vatBuckets: Object.entries(vatBuckets).map(([rate, amount]) => ({
      rate: Number(rate),
      amount: Math.round(amount * 100) / 100,
    })),
    total: Math.round(total * 100) / 100,
  };
}
