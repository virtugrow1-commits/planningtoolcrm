import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { pushToGHL } from '@/lib/ghlSync';
import { Contact } from '@/types/crm';
import { useToast } from '@/hooks/use-toast';
import { capitalizeWords } from '@/lib/utils';

interface ContactsContextType {
  contacts: Contact[];
  loading: boolean;
  addContact: (contact: Omit<Contact, 'id' | 'createdAt'>) => Promise<void>;
  updateContact: (contact: Contact) => Promise<void>;
  deleteContact: (id: string) => Promise<void>;
  refetch: () => Promise<void>;
}

const ContactsContext = createContext<ContactsContextType | null>(null);

export function ContactsProvider({ children }: { children: ReactNode }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchContacts = useCallback(async () => {
    if (!user) return;
    // Fetch all contacts with pagination to avoid 1000-row limit
    const allRows: any[] = [];
    const PAGE_SIZE = 1000;
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .order('first_name')
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        toast({ title: 'Fout bij laden contacten', description: error.message, variant: 'destructive' });
        setLoading(false);
        return;
      }
      if (data) {
        allRows.push(...data);
        hasMore = data.length === PAGE_SIZE;
        from += PAGE_SIZE;
      } else {
        hasMore = false;
      }
    }

    setContacts(allRows.map((c) => ({
      id: c.id,
      displayNumber: c.display_number || undefined,
      firstName: c.first_name,
      lastName: c.last_name,
      email: c.email || '',
      phone: c.phone || '',
      company: c.company || undefined,
      companyId: (c as any).company_id || undefined,
      status: c.status as Contact['status'],
      createdAt: c.created_at.split('T')[0],
      notes: c.notes || undefined,
      ghlContactId: c.ghl_contact_id || undefined,
    })));
    setLoading(false);
  }, [user, toast]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('contacts-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts' }, () => {
        fetchContacts();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchContacts]);

  const addContact = useCallback(async (contact: Omit<Contact, 'id' | 'createdAt'>) => {
    if (!user) return;
    const { data, error } = await supabase.from('contacts').insert({
      user_id: user.id,
      first_name: capitalizeWords(contact.firstName),
      last_name: capitalizeWords(contact.lastName),
      email: contact.email || null,
      phone: contact.phone || null,
      company: contact.company || null,
      company_id: contact.companyId || null,
      status: contact.status,
      notes: contact.notes || null,
      ghl_contact_id: contact.ghlContactId || null,
    } as any).select().single();
    if (error) {
      toast({ title: 'Fout bij aanmaken contact', description: error.message, variant: 'destructive' });
      return;
    }
    if (data) {
      pushToGHL('push-contact', { contact: data });
    }
  }, [user, toast]);

  const updateContact = useCallback(async (contact: Contact) => {
    const { data, error } = await supabase.from('contacts').update({
      first_name: capitalizeWords(contact.firstName),
      last_name: capitalizeWords(contact.lastName),
      email: contact.email || null,
      phone: contact.phone || null,
      company: contact.company || null,
      company_id: contact.companyId || null,
      status: contact.status,
      notes: contact.notes || null,
      ghl_contact_id: contact.ghlContactId || null,
    } as any).eq('id', contact.id).select().single();
    if (error) {
      toast({ title: 'Fout bij bijwerken contact', description: error.message, variant: 'destructive' });
      return;
    }
    if (data) {
      pushToGHL('push-contact', { contact: data });
    }
  }, [toast]);

  const deleteContact = useCallback(async (id: string) => {
    const { data: existing } = await supabase.from('contacts').select('ghl_contact_id').eq('id', id).single();
    const { error } = await supabase.from('contacts').delete().eq('id', id);
    if (error) {
      toast({ title: 'Fout bij verwijderen contact', description: error.message, variant: 'destructive' });
      return;
    }
    if (existing?.ghl_contact_id) {
      pushToGHL('delete-contact', { ghl_contact_id: existing.ghl_contact_id });
    }
  }, [toast]);

  return (
    <ContactsContext.Provider value={{ contacts, loading, addContact, updateContact, deleteContact, refetch: fetchContacts }}>
      {children}
    </ContactsContext.Provider>
  );
}

export function useContactsContext() {
  const ctx = useContext(ContactsContext);
  if (!ctx) throw new Error('useContactsContext must be used within ContactsProvider');
  return ctx;
}
