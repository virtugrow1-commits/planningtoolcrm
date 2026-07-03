import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface ContactOption {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  company: string | null;
  companyId: string | null;
  departed: boolean;
}

export function useContacts() {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchContacts = useCallback(async () => {
    if (!user) return;
    // Fetch all contacts (not filtered by user_id) so all org contacts are searchable
    const { data } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, email, company, company_id, departed')
      .order('first_name');

    if (data) {
      setContacts(data.map((c) => ({
        id: c.id,
        firstName: c.first_name,
        lastName: c.last_name,
        email: c.email,
        company: c.company,
        companyId: (c as any).company_id ?? null,
        departed: (c as any).departed ?? false,
      })));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  return { contacts, loading, refetch: fetchContacts };
}
