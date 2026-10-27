import { describe, it, expect } from 'vitest';
import { computeDocumentStats, periodRange } from './documentStats';
import { documentKind } from './documentKind';
import type { Document } from '@/hooks/useDocuments';

const doc = (o: Partial<Document>): Document => ({
  id: Math.random().toString(36), contactId: null, inquiryId: null, companyId: null, ghlDocumentId: null,
  title: 'Doc', documentType: 'proposal', status: 'sent', sentAt: '2026-10-05', viewedAt: null, signedAt: null,
  amount: null, externalUrl: null, contactName: 'X', createdAt: '2026-10-05',
  ...o, kind: documentKind(o.title ?? 'Doc', o.documentType ?? 'proposal'),
});

describe('computeDocumentStats', () => {
  const oct = periodRange('month', '2026-10-22');
  it('telt offertes en reserveringsbevestigingen los', () => {
    const s = computeDocumentStats([
      doc({ title: 'Offerte A', inquiryId: 'a', status: 'signed', sentAt: '2026-10-01', signedAt: '2026-10-03' }),
      doc({ title: 'Offerte B', inquiryId: 'b', status: 'signed', sentAt: '2026-10-02', signedAt: '2026-10-04' }),
      doc({ title: 'Offerte C', inquiryId: 'c', status: 'viewed', sentAt: '2026-10-10' }),
      doc({ title: 'Reserveringsbevestiging_Zakelijk', inquiryId: 'a', status: 'sent', sentAt: '2026-10-06' }),
      doc({ title: 'Offerte oud', inquiryId: 'd', status: 'signed', sentAt: '2026-08-01', signedAt: '2026-08-02' }),
    ], oct);
    expect(s.offertes).toEqual({ verzonden: 3, getekend: 2, openstaand: 1 });
    expect(s.bevestigingen).toEqual({ verzonden: 1 });
    expect(s.nogTeVersturen.map((p) => p.inquiryId)).toEqual(['d', 'b']);
  });
  it('bevestiging op contact zonder aanvraag dekt de offerte van dat contact', () => {
    const s = computeDocumentStats([
      doc({ title: 'Offerte', inquiryId: 'a', contactId: 'k', status: 'signed', signedAt: '2026-10-03' }),
      // Klikt de klant toch op Accepteren, dan telt de bevestiging gewoon als verzonden
      doc({ title: 'Reserveringsbevestiging', contactId: 'k', status: 'signed', sentAt: '2026-10-06', signedAt: '2026-10-07' }),
    ], oct);
    expect(s.nogTeVersturen).toHaveLength(0);
    expect(s.bevestigingen).toEqual({ verzonden: 1 });
  });
});

describe('periodRange', () => {
  it('vorige maand over de jaargrens', () => {
    expect(periodRange('last_month', '2026-01-15')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(periodRange('month', '2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });
});
