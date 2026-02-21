import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { pushToGHL } from '@/lib/ghlSync';
import { Contact } from '@/types/crm';

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

  const fetchContacts = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .order('first_name');

    if (!error && data) {
      setContacts(data.map((c) => ({
        id: c.id,
        firstName: c.first_name,
        lastName: c.last_name,
        email: c.email || '',
        phone: c.phone || '',
        company: c.company || undefined,
        status: c.status as Contact['status'],
        createdAt: c.created_at.split('T')[0],
        notes: c.notes || undefined,
        ghlContactId: c.ghl_contact_id || undefined,
      })));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  // Realtime subscription
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
    const { data } = await supabase.from('contacts').insert({
      user_id: user.id,
      first_name: contact.firstName,
      last_name: contact.lastName,
      email: contact.email || null,
      phone: contact.phone || null,
      company: contact.company || null,
      status: contact.status,
      notes: contact.notes || null,
      ghl_contact_id: contact.ghlContactId || null,
    }).select().single();
    if (data) {
      pushToGHL('push-contact', { contact: data });
    }
  }, [user]);

  const updateContact = useCallback(async (contact: Contact) => {
    const { data } = await supabase.from('contacts').update({
      first_name: contact.firstName,
      last_name: contact.lastName,
      email: contact.email || null,
      phone: contact.phone || null,
      company: contact.company || null,
      status: contact.status,
      notes: contact.notes || null,
      ghl_contact_id: contact.ghlContactId || null,
    }).eq('id', contact.id).select().single();
    if (data) {
      pushToGHL('push-contact', { contact: data });
    }
  }, []);

  const deleteContact = useCallback(async (id: string) => {
    // Get GHL ID before deleting
    const { data: existing } = await supabase.from('contacts').select('ghl_contact_id').eq('id', id).single();
    await supabase.from('contacts').delete().eq('id', id);
    if (existing?.ghl_contact_id) {
      pushToGHL('delete-contact', { ghl_contact_id: existing.ghl_contact_id });
    }
  }, []);

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
