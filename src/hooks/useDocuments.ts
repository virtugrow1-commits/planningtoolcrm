import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface Document {
  id: string;
  contactId: string | null;
  inquiryId: string | null;
  companyId: string | null;
  ghlDocumentId: string | null;
  title: string;
  documentType: string;
  status: string;
  sentAt: string;
  viewedAt: string | null;
  signedAt: string | null;
  amount: number | null;
  externalUrl: string | null;
  contactName: string;
  createdAt: string;
}

export function useDocuments() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const fetchDocuments = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching documents:', error);
      setLoading(false);
      return;
    }
    if (data) {
      setDocuments(data.map((d: any) => ({
        id: d.id,
        contactId: d.contact_id,
        inquiryId: d.inquiry_id,
        companyId: d.company_id,
        ghlDocumentId: d.ghl_document_id,
        title: d.title,
        documentType: d.document_type,
        status: d.status,
        sentAt: d.sent_at?.split('T')[0] || '',
        viewedAt: d.viewed_at?.split('T')[0] || null,
        signedAt: d.signed_at?.split('T')[0] || null,
        amount: d.amount ? Number(d.amount) : null,
        externalUrl: d.external_url,
        contactName: d.contact_name,
        createdAt: d.created_at?.split('T')[0] || '',
      })));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchDocuments(); }, [fetchDocuments]);

  // Realtime subscription
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('documents-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documents' }, () => {
        fetchDocuments();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchDocuments]);

  return { documents, loading, refetch: fetchDocuments };
}
