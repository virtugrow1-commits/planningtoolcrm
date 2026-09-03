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
    const allRows: any[] = [];
    const PAGE_SIZE = 1000;
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('inquiries')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        toast({ title: 'Fout bij laden aanvragen', description: error.message, variant: 'destructive' });
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

    setInquiries(allRows.map((i) => ({
        id: i.id,
        displayNumber: (i as any).display_number ? (i as any).display_number.replace(/^ANV-/, '#') : undefined,
        contactId: i.contact_id || '',
        contactName: i.contact_name,
        companyId: (i as any).company_id || undefined,
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
        assignedTo: (i as any).assigned_to || undefined,
        preferredStartTime: (i as any).preferred_start_time || undefined,
        preferredEndTime: (i as any).preferred_end_time || undefined,
        statusReason: (i as any).status_reason || undefined,
        offerteRevisie: (i as any).offerte_revisie ?? 0,
        offerteGestagedOp: (i as any).offerte_gestaged_op || undefined,
      })));
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
    const { data: inserted, error } = await supabase.from('inquiries').insert({
      user_id: user.id,
      contact_id: inquiry.contactId || null,
      contact_name: inquiry.contactName,
      company_id: inquiry.companyId || null,
      event_type: inquiry.eventType,
      preferred_date: inquiry.preferredDate || null,
      room_preference: inquiry.roomPreference || null,
      guest_count: inquiry.guestCount,
      budget: inquiry.budget || null,
      message: inquiry.message || null,
      status: inquiry.status,
      source: inquiry.source,
      assigned_to: inquiry.assignedTo || null,
      is_read: false,
    } as any).select('id').single();
    if (error) {
      toast({ title: 'Fout bij aanmaken aanvraag', description: error.message, variant: 'destructive' });
      return;
    }
    if (inserted?.id) {
      // Fire-and-forget: don't block UI waiting for GHL sync
      pushToGHL('push-inquiry', {
        inquiry_id: inserted.id,
        contact_name: inquiry.contactName,
        event_type: inquiry.eventType,
        budget: inquiry.budget,
        status: inquiry.status,
        message: inquiry.message,
      }, {
        entityType: 'inquiry', entityId: inserted.id, actionType: 'create',
      });
    }
  }, [user, toast]);

  const updateInquiry = useCallback(async (inquiry: Inquiry) => {
    // Optimistic local update — move card immediately
    setInquiries(prev => prev.map(i => i.id === inquiry.id ? inquiry : i));

    // Update local DB
    const { error } = await supabase.from('inquiries').update({
      contact_id: inquiry.contactId || null,
      contact_name: inquiry.contactName,
      company_id: inquiry.companyId || null,
      event_type: inquiry.eventType,
      preferred_date: inquiry.preferredDate || null,
      room_preference: inquiry.roomPreference || null,
      guest_count: inquiry.guestCount,
      budget: inquiry.budget || null,
      message: inquiry.message || null,
      status: inquiry.status,
      source: inquiry.source,
      assigned_to: inquiry.assignedTo || null,
      preferred_start_time: inquiry.preferredStartTime || null,
      preferred_end_time: inquiry.preferredEndTime || null,
      status_reason: inquiry.statusReason || null,
    } as any).eq('id', inquiry.id);
    if (error) {
      toast({ title: 'Fout bij bijwerken aanvraag', description: error.message, variant: 'destructive' });
      // Revert on error
      fetchInquiries();
      return;
    }

    // Fire-and-forget: push to GHL without blocking the UI
    if (inquiry.ghlOpportunityId) {
      // Update existing GHL opportunity with correct stage
      pushToGHL('push-inquiry-status', {
        ghl_opportunity_id: inquiry.ghlOpportunityId,
        status: inquiry.status,
        name: inquiry.eventType,
        monetary_value: inquiry.budget,
        contact_name: inquiry.contactName,
        guest_count: inquiry.guestCount,
      }, {
        entityType: 'inquiry', entityId: inquiry.id, actionType: 'update',
      });
    } else {
      // No GHL opportunity yet — create one with the correct stage
      pushToGHL('push-inquiry', {
        inquiry_id: inquiry.id,
        contact_name: inquiry.contactName,
        event_type: inquiry.eventType,
        budget: inquiry.budget,
        status: inquiry.status,
        message: inquiry.message,
      }, {
        entityType: 'inquiry', entityId: inquiry.id, actionType: 'create',
      });
    }
  }, [toast]);

  const deleteInquiry = useCallback(async (id: string) => {
    // Fetch GHL ID from DB to avoid stale closure
    const { data: existing } = await supabase.from('inquiries').select('ghl_opportunity_id').eq('id', id).single();
    // Fire-and-forget: push delete to GHL without blocking
    if (existing?.ghl_opportunity_id) {
      pushToGHL('delete-inquiry', { ghl_opportunity_id: existing.ghl_opportunity_id }, {
        entityType: 'inquiry', entityId: id, actionType: 'delete',
      });
    }
    const { error } = await supabase.from('inquiries').delete().eq('id', id);
    if (error) {
      toast({ title: 'Fout bij verwijderen aanvraag', description: error.message, variant: 'destructive' });
    }
  }, [toast]);

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
