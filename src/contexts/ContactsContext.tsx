import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { pushToGHL } from '@/lib/ghlSync';
import { Contact } from '@/types/crm';
import { useToast } from '@/hooks/use-toast';
import { capitalizeWords } from '@/lib/utils';

import type { SyncOutcome } from '@/lib/ghlSync';

interface ContactsContextType {
  contacts: Contact[];
  loading: boolean;
  addContact: (contact: Omit<Contact, 'id' | 'createdAt'>) => Promise<SyncOutcome | null>;
  updateContact: (contact: Contact) => Promise<SyncOutcome>;
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
      displayNumber: c.display_number ? c.display_number.replace(/^CON-/, '#') : undefined,
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
      departed: (c as any).departed || false,
      department: (c as any).department || undefined,
      dmu: (c as any).dmu || undefined,
      functionGroup: (c as any).function_group || undefined,
      jobTitle: (c as any).job_title || undefined,
      address: (c as any).address || undefined,
      postcode: (c as any).postcode || undefined,
      city: (c as any).city || undefined,
      country: (c as any).country || undefined,
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

  const addContact = useCallback(async (contact: Omit<Contact, 'id' | 'createdAt'>): Promise<SyncOutcome | null> => {
    if (!user) return null;
    // Check for existing contact by name + email to prevent duplicates
    const { data: existing } = await supabase
      .from('contacts')
      .select('id')
      .eq('user_id', user.id)
      .ilike('first_name', capitalizeWords(contact.firstName))
      .ilike('last_name', capitalizeWords(contact.lastName))
      .limit(1)
      .maybeSingle();

    if (existing) {
      // Contact already exists — inform user instead of silently ignoring
      toast({ title: 'Contact bestaat al', description: `${capitalizeWords(contact.firstName)} ${capitalizeWords(contact.lastName)} staat al in het systeem.`, variant: 'destructive' });
      return null;
    }

    // Mark new contact as pending outbound sync until GHL confirms
    const { data, error } = await (supabase as any).from('contacts').insert({
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
      department: contact.department || null,
      dmu: contact.dmu || null,
      function_group: contact.functionGroup || null,
      job_title: contact.jobTitle || null,
      address: contact.address || null,
      postcode: contact.postcode || null,
      city: contact.city || null,
      country: contact.country || 'NL',
      pending_outbound_sync: true,
      last_local_edit_at: new Date().toISOString(),
    }).select().single();
    if (error) {
      toast({ title: 'Fout bij aanmaken contact', description: error.message, variant: 'destructive' });
      return null;
    }
    if (data) {
      const result = await pushToGHL('push-contact', { contact: data }, {
        entityType: 'contact', entityId: data.id, actionType: 'create',
      });
      return result.outcome;
    }
    return null;
  }, [user, toast]);

  const updateContact = useCallback(async (contact: Contact): Promise<SyncOutcome> => {
    // Optimistic update: instantly reflect changes in UI
    setContacts(prev => prev.map(c => c.id === contact.id ? contact : c));

    const nowIso = new Date().toISOString();

    // Update local DB first AND mark as pending so background sync can't overwrite
    const { error } = await (supabase as any).from('contacts').update({
      first_name: capitalizeWords(contact.firstName),
      last_name: capitalizeWords(contact.lastName),
      email: contact.email || null,
      phone: contact.phone || null,
      company: contact.company || null,
      company_id: contact.companyId || null,
      status: contact.status,
      notes: contact.notes || null,
      ghl_contact_id: contact.ghlContactId || null,
      departed: contact.departed || false,
      department: contact.department || null,
      dmu: contact.dmu || null,
      function_group: contact.functionGroup || null,
      job_title: contact.jobTitle || null,
      address: contact.address || null,
      postcode: contact.postcode || null,
      city: contact.city || null,
      country: contact.country || 'NL',
      pending_outbound_sync: true,
      last_local_edit_at: nowIso,
      last_sync_error: null,
    }).eq('id', contact.id);
    if (error) {
      toast({ title: 'Fout bij bijwerken contact', description: error.message, variant: 'destructive' });
      fetchContacts(); // Rollback
      return 'error';
    }

    // Await the GHL push so the caller can show an honest result.
    const result = await pushToGHL('push-contact', { contact: {
      id: contact.id,
      first_name: capitalizeWords(contact.firstName),
      last_name: capitalizeWords(contact.lastName),
      email: contact.email || null,
      phone: contact.phone || null,
      company: contact.company || null,
      ghl_contact_id: contact.ghlContactId || null,
    }}, {
      entityType: 'contact', entityId: contact.id, actionType: 'update',
    });
    return result.outcome;
  }, [toast, fetchContacts]);

  const deleteContact = useCallback(async (id: string) => {
    // Optimistic: remove from UI instantly
    setContacts(prev => prev.filter(c => c.id !== id));

    // Get GHL id before deleting from DB
    const { data: existing } = await supabase.from('contacts').select('ghl_contact_id').eq('id', id).single();

    // Delete from local DB immediately (don't wait for GHL)
    const { error } = await supabase.from('contacts').delete().eq('id', id);
    if (error) {
      toast({ title: 'Fout bij verwijderen contact', description: error.message, variant: 'destructive' });
      // Rollback: re-fetch on error
      fetchContacts();
      return;
    }

    // Push GHL delete in background (don't block UI)
    if (existing?.ghl_contact_id) {
      pushToGHL('delete-contact', { ghl_contact_id: existing.ghl_contact_id }, {
        entityType: 'contact', entityId: id, actionType: 'delete',
      }).catch(() => {}); // errors are queued automatically by pushToGHL
    }
  }, [toast, fetchContacts]);

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
