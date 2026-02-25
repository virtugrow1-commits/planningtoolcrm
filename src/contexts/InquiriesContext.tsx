import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Inquiry } from '@/types/crm';
import { pushToGHL } from '@/lib/ghlSync';
import { useToast } from '@/hooks/use-toast';

interface InquiriesContextType {
  inquiries: Inquiry[];
  loading: boolean;
  unreadCount: number;
  addInquiry: (inquiry: Omit<Inquiry, 'id' | 'createdAt'>) => Promise<void>;
  updateInquiry: (inquiry: Inquiry) => Promise<void>;
  deleteInquiry: (id: string) => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  refetch: () => Promise<void>;
}

const InquiriesContext = createContext<InquiriesContextType | null>(null);

export function InquiriesProvider({ children }: { children: ReactNode }) {
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchInquiries = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('inquiries')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: 'Fout bij laden aanvragen', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }
    if (data) {
      setInquiries(data.map((i) => ({
        id: i.id,
        displayNumber: (i as any).display_number ? (i as any).display_number.replace(/^ANV-/, '#') : undefined,
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
        isRead: (i as any).is_read ?? true,
      })));
    }
    setLoading(false);
  }, [user, toast]);

  useEffect(() => {
    fetchInquiries();
  }, [fetchInquiries]);

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
    const { data: inserted, error } = await supabase.from('inquiries').upsert({
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
    }, { onConflict: 'ghl_opportunity_id', ignoreDuplicates: true }).select('id').single();
    if (error) {
      toast({ title: 'Fout bij aanmaken aanvraag', description: error.message, variant: 'destructive' });
      return;
    }
    if (inserted?.id) {
      pushToGHL('push-inquiry', {
        inquiry_id: inserted.id,
        contact_name: inquiry.contactName,
        event_type: inquiry.eventType,
        budget: inquiry.budget,
        status: inquiry.status,
        message: inquiry.message,
      });
    }
  }, [user, toast]);

  const updateInquiry = useCallback(async (inquiry: Inquiry) => {
    const { error } = await supabase.from('inquiries').update({
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
    if (error) {
      toast({ title: 'Fout bij bijwerken aanvraag', description: error.message, variant: 'destructive' });
      return;
    }
    if (inquiry.ghlOpportunityId) {
      pushToGHL('push-inquiry-status', {
        ghl_opportunity_id: inquiry.ghlOpportunityId,
        status: inquiry.status,
        name: inquiry.eventType,
        monetary_value: inquiry.budget,
      });
    }
  }, [toast]);

  const deleteInquiry = useCallback(async (id: string) => {
    // Find the inquiry first to get ghlOpportunityId before deleting
    const target = inquiries.find(i => i.id === id);
    const { error } = await supabase.from('inquiries').delete().eq('id', id);
    if (error) {
      toast({ title: 'Fout bij verwijderen aanvraag', description: error.message, variant: 'destructive' });
      return;
    }
    // Also delete from GHL if linked
    if (target?.ghlOpportunityId) {
      pushToGHL('delete-inquiry', { ghl_opportunity_id: target.ghlOpportunityId });
    }
  }, [toast, inquiries]);

  const markAsRead = useCallback(async (id: string) => {
    await supabase.from('inquiries').update({ is_read: true } as any).eq('id', id);
    setInquiries(prev => prev.map(i => i.id === id ? { ...i, isRead: true } : i));
  }, []);

  const unreadCount = inquiries.filter(i => !i.isRead).length;

  return (
    <InquiriesContext.Provider value={{ inquiries, loading, unreadCount, addInquiry, updateInquiry, deleteInquiry, markAsRead, refetch: fetchInquiries }}>
      {children}
    </InquiriesContext.Provider>
  );
}

export function useInquiriesContext() {
  const ctx = useContext(InquiriesContext);
  if (!ctx) throw new Error('useInquiriesContext must be used within InquiriesProvider');
  return ctx;
}
