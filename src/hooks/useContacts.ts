import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface ContactOption {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  company: string | null;
}

export function useContacts() {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchContacts = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, email, company')
      .eq('user_id', user.id)
      .order('first_name');

    if (data) {
      setContacts(data.map((c) => ({
        id: c.id,
        firstName: c.first_name,
        lastName: c.last_name,
        email: c.email,
        company: c.company,
      })));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  return { contacts, loading, refetch: fetchContacts };
}
