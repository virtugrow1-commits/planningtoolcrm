import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Inquiry } from '@/types/crm';
import { pushToGHL } from '@/lib/ghlSync';

interface InquiriesContextType {
  inquiries: Inquiry[];
  loading: boolean;
  addInquiry: (inquiry: Omit<Inquiry, 'id' | 'createdAt'>) => Promise<void>;
  updateInquiry: (inquiry: Inquiry) => Promise<void>;
  deleteInquiry: (id: string) => Promise<void>;
  refetch: () => Promise<void>;
}

const InquiriesContext = createContext<InquiriesContextType | null>(null);

export function InquiriesProvider({ children }: { children: ReactNode }) {
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const fetchInquiries = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('inquiries')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setInquiries(data.map((i) => ({
        id: i.id,
        contactId: i.contact_id || '',
        contactName: i.contact_name,
        eventType: i.event_type,
        preferredDate: i.preferred_date || '',
        roomPreference: i.room_preference || undefined,
        guestCount: i.guest_count,
        budget: i.budget ? Number(i.budget) : undefined,
        message: i.message || '',
        status: i.status as Inquiry['status'],
        createdAt: i.created_at.split('T')[0],
        source: i.source,
        ghlOpportunityId: (i as any).ghl_opportunity_id || undefined,
      })));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchInquiries();
  }, [fetchInquiries]);

  // Realtime subscription
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('inquiries-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inquiries' }, () => {
        fetchInquiries();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, fetchInquiries]);

  const addInquiry = useCallback(async (inquiry: Omit<Inquiry, 'id' | 'createdAt'>) => {
    if (!user) return;
    await supabase.from('inquiries').insert({
      user_id: user.id,
      contact_id: inquiry.contactId || null,
      contact_name: inquiry.contactName,
      event_type: inquiry.eventType,
      preferred_date: inquiry.preferredDate || null,
      room_preference: inquiry.roomPreference || null,
      guest_count: inquiry.guestCount,
      budget: inquiry.budget || null,
      message: inquiry.message || null,
      status: inquiry.status,
      source: inquiry.source,
    });
    // New inquiries without ghlOpportunityId don't need to push yet
  }, [user]);

  const updateInquiry = useCallback(async (inquiry: Inquiry) => {
    await supabase.from('inquiries').update({
      contact_id: inquiry.contactId || null,
      contact_name: inquiry.contactName,
      event_type: inquiry.eventType,
      preferred_date: inquiry.preferredDate || null,
      room_preference: inquiry.roomPreference || null,
      guest_count: inquiry.guestCount,
      budget: inquiry.budget || null,
      message: inquiry.message || null,
      status: inquiry.status,
      source: inquiry.source,
    }).eq('id', inquiry.id);
    // Push status change to GHL if linked
    if (inquiry.ghlOpportunityId) {
      pushToGHL('push-inquiry-status', {
        ghl_opportunity_id: inquiry.ghlOpportunityId,
        status: inquiry.status,
        name: inquiry.eventType,
        monetary_value: inquiry.budget,
      });
    }
  }, []);

  const deleteInquiry = useCallback(async (id: string) => {
    await supabase.from('inquiries').delete().eq('id', id);
  }, []);

  return (
    <InquiriesContext.Provider value={{ inquiries, loading, addInquiry, updateInquiry, deleteInquiry, refetch: fetchInquiries }}>
      {children}
    </InquiriesContext.Provider>
  );
}

export function useInquiriesContext() {
  const ctx = useContext(InquiriesContext);
  if (!ctx) throw new Error('useInquiriesContext must be used within InquiriesProvider');
  return ctx;
}
