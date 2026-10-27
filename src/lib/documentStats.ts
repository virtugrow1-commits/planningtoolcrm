import type { Document } from '@/hooks/useDocuments';
import { isSentStatus, isSignedStatus } from '@/lib/documentKind';

export interface PeriodRange { from: string; to: string } // yyyy-mm-dd, inclusief

const inRange = (d: string | null | undefined, r: PeriodRange) => Boolean(d) && d! >= r.from && d! <= r.to;

/** Eén evenement = aanvraag, anders contact (documenten zonder aanvraag-koppeling). */
const eventKey = (d: Pick<Document, 'inquiryId' | 'contactId' | 'id'>) => d.inquiryId || (d.contactId ? `c:${d.contactId}` : `d:${d.id}`);

export interface PendingConfirmation {
  key: string;
  inquiryId: string | null;
  contactId: string | null;
  contactName: string;
  title: string;
  signedAt: string | null;
}

export interface DocumentStats {
  offertes: { verzonden: number; getekend: number; openstaand: number };
  /** Reserveringsbevestigingen worden niet getekend: alleen verzonden tellen. */
  bevestigingen: { verzonden: number };
  /** Getekende offertes waarvoor nog geen reserveringsbevestiging is verstuurd (alle periodes). */
  nogTeVersturen: PendingConfirmation[];
}

export function computeDocumentStats(documents: Document[], range: PeriodRange): DocumentStats {
  const offertes = documents.filter((d) => d.kind === 'offerte');
  const bevestigingen = documents.filter((d) => d.kind === 'reserveringsbevestiging');

  const count = (list: Document[]) => ({
    verzonden: list.filter((d) => isSentStatus(d.status) && inRange(d.sentAt, range)).length,
    getekend: list.filter((d) => isSignedStatus(d.status) && inRange(d.signedAt || d.sentAt, range)).length,
    openstaand: list.filter((d) => d.status === 'sent' || d.status === 'viewed').length,
  });

  const confirmedKeys = new Set<string>();
  for (const b of bevestigingen) {
    if (!isSentStatus(b.status)) continue;
    if (b.inquiryId) confirmedKeys.add(b.inquiryId);
    if (b.contactId) confirmedKeys.add(`c:${b.contactId}`);
  }

  const pending = new Map<string, PendingConfirmation>();
  for (const o of offertes) {
    if (!isSignedStatus(o.status)) continue;
    const key = eventKey(o);
    const covered = confirmedKeys.has(key) || (o.contactId && confirmedKeys.has(`c:${o.contactId}`));
    if (covered || pending.has(key)) continue;
    pending.set(key, { key, inquiryId: o.inquiryId, contactId: o.contactId, contactName: o.contactName, title: o.title, signedAt: o.signedAt });
  }

  return {
    offertes: count(offertes),
    bevestigingen: { verzonden: count(bevestigingen).verzonden },
    nogTeVersturen: [...pending.values()].sort((a, b) => String(a.signedAt).localeCompare(String(b.signedAt))),
  };
}

/** Periodes voor het dashboard (lokale datum). */
export function periodRange(kind: 'month' | 'last_month' | 'year', today: string): PeriodRange {
  const [y, m] = today.split('-').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');
  const lastDay = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  if (kind === 'year') return { from: `${y}-01-01`, to: `${y}-12-31` };
  if (kind === 'last_month') {
    const yy = m === 1 ? y - 1 : y;
    const mm = m === 1 ? 12 : m - 1;
    return { from: `${yy}-${pad(mm)}-01`, to: `${yy}-${pad(mm)}-${pad(lastDay(yy, mm))}` };
  }
  return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(lastDay(y, m))}` };
}
