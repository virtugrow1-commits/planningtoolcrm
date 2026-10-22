// Soort GHL-document. Zelfde regels als documentKind() in
// supabase/functions/_shared/automations.ts en de kolom documents.document_kind.
export type DocumentKind = 'offerte' | 'reserveringsbevestiging' | 'overig';

export function documentKind(title?: string | null, documentType?: string | null): DocumentKind {
  const t = String(title || '').toLowerCase();
  const type = String(documentType || '').toLowerCase();
  if (/(reserveringsbevestiging|reservering.*bevestig|bevestig.*reservering)/.test(t)) return 'reserveringsbevestiging';
  if (/(offerte|contract)/.test(t) || ['proposal', 'estimate', 'contract'].includes(type)) return 'offerte';
  return 'overig';
}

export const DOCUMENT_KIND_LABEL: Record<DocumentKind, string> = {
  offerte: 'Offerte',
  reserveringsbevestiging: 'Reserveringsbevestiging',
  overig: 'Document',
};

export const isSignedStatus = (status?: string | null) => status === 'signed' || status === 'paid';
export const isSentStatus = (status?: string | null) => ['sent', 'viewed', 'signed', 'paid'].includes(String(status));
