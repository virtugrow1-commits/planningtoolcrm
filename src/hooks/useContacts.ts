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
    // Fetch all contacts (not filtered by user_id) so all org contacts are searchable.
    // Paginate to avoid the 1000-row limit.
    const PAGE_SIZE = 1000;
    const rows: any[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, email, company, company_id, departed')
        .order('first_name')
        .range(from, from + PAGE_SIZE - 1);
      if (error || !data) break;
      rows.push(...data);
      if (data.length < PAGE_SIZE) break;
    }

    setContacts(rows.map((c) => ({
      id: c.id,
      firstName: c.first_name,
      lastName: c.last_name,
      email: c.email,
      company: c.company,
      companyId: c.company_id ?? null,
      departed: c.departed ?? false,
    })));
    setLoading(false);
  }, [user]);


  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  return { contacts, loading, refetch: fetchContacts };
}
