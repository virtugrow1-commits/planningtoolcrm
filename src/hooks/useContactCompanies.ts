import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface ContactCompanyLink {
  id: string;
  contactId: string;
  companyId: string;
  isPrimary: boolean;
}

export function useContactCompanies() {
  const [links, setLinks] = useState<ContactCompanyLink[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const fetchLinks = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('contact_companies' as any)
      .select('id, contact_id, company_id, is_primary')
      .order('is_primary', { ascending: false });

    if (data) {
      setLinks((data as any[]).map((r) => ({
        id: r.id,
        contactId: r.contact_id,
        companyId: r.company_id,
        isPrimary: r.is_primary,
      })));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchLinks(); }, [fetchLinks]);

  // Realtime
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('contact-companies-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contact_companies' }, () => {
        fetchLinks();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchLinks]);

  const linkContact = useCallback(async (contactId: string, companyId: string, isPrimary = false) => {
    if (!user) return;
    await supabase.from('contact_companies' as any).upsert({
      contact_id: contactId,
      company_id: companyId,
      is_primary: isPrimary,
      user_id: user.id,
    } as any, { onConflict: 'contact_id,company_id' } as any);
    await fetchLinks();
  }, [user, fetchLinks]);

  const unlinkContact = useCallback(async (contactId: string, companyId: string) => {
    await supabase.from('contact_companies' as any).delete().eq('contact_id', contactId).eq('company_id', companyId);
    await fetchLinks();
  }, [fetchLinks]);

  const getCompanyContacts = useCallback((companyId: string) => {
    return links.filter((l) => l.companyId === companyId);
  }, [links]);

  const getContactCompanies = useCallback((contactId: string) => {
    return links.filter((l) => l.contactId === contactId);
  }, [links]);

  return { links, loading, linkContact, unlinkContact, getCompanyContacts, getContactCompanies, refetch: fetchLinks };
}
