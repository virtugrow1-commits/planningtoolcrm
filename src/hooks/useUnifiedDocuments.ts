import { useMemo } from 'react';
import { useQuotes } from '@/hooks/useQuotes';
import { useInvoices } from '@/hooks/useInvoices';
import { useDocuments } from '@/hooks/useDocuments';
import { useLanguage } from '@/contexts/LanguageContext';

export type UnifiedDocumentSource = 'quote' | 'invoice' | 'ghl';

export interface UnifiedDocument {
  id: string;
  source: UnifiedDocumentSource;
  displayNumber: string;
  title: string;
  documentType: string;
  contactName: string;
  contactId: string | null;
  companyName: string | null;
  companyId: string | null;
  amount: number | null;
  status: string;
  sentAt: string | null;
  viewedAt: string | null;
  signedAt: string | null;
  paidAt: string | null;
  externalUrl: string | null;
  createdAt: string;
}

export function useUnifiedDocuments() {
  const { quotes, loading: qLoading } = useQuotes();
  const { invoices, loading: iLoading } = useInvoices();
  const { documents: ghlDocs, loading: gLoading } = useDocuments();
  const { t } = useLanguage();

  const loading = qLoading || iLoading || gLoading;

  const unified = useMemo<UnifiedDocument[]>(() => {
    const items: UnifiedDocument[] = [];

    for (const q of quotes) {
      items.push({
        id: q.id,
        source: 'quote',
        displayNumber: q.displayNumber || '',
        title: q.title,
        documentType: t('documents.typeQuote'),
        contactName: q.contactName,
        contactId: q.contactId || null,
        companyName: q.companyName || null,
        companyId: q.companyId || null,
        amount: q.total || null,
        status: q.status,
        sentAt: q.sentAt || null,
        viewedAt: q.viewedAt || null,
        signedAt: q.acceptedAt || null,
        paidAt: null,
        externalUrl: null,
        createdAt: q.createdAt,
      });
    }

    for (const inv of invoices) {
      items.push({
        id: inv.id,
        source: 'invoice',
        displayNumber: inv.displayNumber || '',
        title: inv.title,
        documentType: t('documents.typeInvoice'),
        contactName: inv.contactName,
        contactId: inv.contactId || null,
        companyName: inv.companyName || null,
        companyId: inv.companyId || null,
        amount: inv.total || null,
        status: inv.status,
        sentAt: inv.sentAt || null,
        viewedAt: null,
        signedAt: null,
        paidAt: inv.paidAt || null,
        externalUrl: inv.stripePaymentLink || null,
        createdAt: inv.createdAt,
      });
    }

    const linkedGhlDocIds = new Set<string>();
    for (const q of quotes) {
      if ((q as any).ghlDocumentId) linkedGhlDocIds.add((q as any).ghlDocumentId);
    }
    for (const inv of invoices) {
      if (inv.ghlInvoiceId) linkedGhlDocIds.add(inv.ghlInvoiceId);
    }

    const ghlTypeMap: Record<string, string> = {
      proposal: t('documents.typeProposal'),
      invoice: t('documents.typeInvoice'),
      estimate: t('documents.typeQuote'),
      contract: t('documents.typeContract'),
    };

    for (const doc of ghlDocs) {
      if (doc.ghlDocumentId && linkedGhlDocIds.has(doc.ghlDocumentId)) continue;
      items.push({
        id: doc.id,
        source: 'ghl',
        displayNumber: '',
        title: doc.title,
        documentType: ghlTypeMap[doc.documentType] || t('documents.typeDocument'),
        contactName: doc.contactName,
        contactId: doc.contactId || null,
        companyName: null,
        companyId: doc.companyId || null,
        amount: doc.amount || null,
        status: doc.status,
        sentAt: doc.sentAt || null,
        viewedAt: doc.viewedAt || null,
        signedAt: doc.signedAt || null,
        paidAt: null,
        externalUrl: doc.externalUrl || null,
        createdAt: doc.createdAt,
      });
    }

    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return items;
  }, [quotes, invoices, ghlDocs, t]);

  return { documents: unified, loading };
}
