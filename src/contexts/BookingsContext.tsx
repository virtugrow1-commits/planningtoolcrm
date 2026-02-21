import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { Booking, RoomName } from '@/types/crm';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { pushToGHL } from '@/lib/ghlSync';

interface BookingsContextType {
  bookings: Booking[];
  loading: boolean;
  addBooking: (booking: Omit<Booking, 'id'>) => Promise<void>;
  addBookings: (bookings: Omit<Booking, 'id'>[]) => Promise<void>;
  updateBooking: (booking: Booking) => Promise<void>;
  deleteBooking: (id: string) => Promise<void>;
  refetch: () => Promise<void>;
}

const BookingsContext = createContext<BookingsContextType | null>(null);

export function BookingsProvider({ children }: { children: ReactNode }) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const fetchBookings = useCallback(async () => {
    if (!user) return;
    // Fetch ALL bookings using pagination to avoid 1000-row limit
    let allData: any[] = [];
    let from = 0;
    const PAGE_SIZE = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .order('date', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error || !data || data.length === 0) break;
      allData = allData.concat(data);
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
    setBookings(allData.map((b) => ({
      id: b.id,
      roomName: b.room_name as RoomName,
      date: b.date,
      startHour: b.start_hour,
      endHour: b.end_hour,
      title: b.title,
      contactName: b.contact_name,
      contactId: b.contact_id || undefined,
      status: b.status as 'confirmed' | 'option',
      notes: b.notes || undefined,
    })));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  // Realtime subscription
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('bookings-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => {
        fetchBookings();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, fetchBookings]);

  const addBooking = useCallback(async (booking: Omit<Booking, 'id'>) => {
    if (!user) return;
    const { data, error } = await supabase.from('bookings').insert({
      user_id: user.id,
      room_name: booking.roomName,
      date: booking.date,
      start_hour: booking.startHour,
      end_hour: booking.endHour,
      title: booking.title,
      contact_name: booking.contactName,
      contact_id: booking.contactId || null,
      status: booking.status,
      notes: booking.notes || null,
    }).select().single();
    if (!error && data) {
      await fetchBookings();
      pushToGHL('push-booking', { booking: data });
    }
  }, [user, fetchBookings]);

  const addBookings = useCallback(async (newBookings: Omit<Booking, 'id'>[]) => {
    if (!user || newBookings.length === 0) return;
    const rows = newBookings.map((b) => ({
      user_id: user.id,
      room_name: b.roomName,
      date: b.date,
      start_hour: b.startHour,
      end_hour: b.endHour,
      title: b.title,
      contact_name: b.contactName,
      contact_id: b.contactId || null,
      status: b.status,
      notes: b.notes || null,
    }));
    const { data, error } = await supabase.from('bookings').insert(rows).select();
    if (!error) {
      await fetchBookings();
      // Push each booking to GHL
      for (const booking of data || []) {
        pushToGHL('push-booking', { booking });
      }
    }
  }, [user, fetchBookings]);

  const updateBooking = useCallback(async (updated: Booking) => {
    const { data, error } = await supabase.from('bookings').update({
      room_name: updated.roomName,
      date: updated.date,
      start_hour: updated.startHour,
      end_hour: updated.endHour,
      title: updated.title,
      contact_name: updated.contactName,
      status: updated.status,
      notes: updated.notes || null,
    }).eq('id', updated.id).select().single();
    if (!error) {
      await fetchBookings();
      if (data) pushToGHL('push-booking', { booking: data });
    }
  }, [fetchBookings]);

  const deleteBooking = useCallback(async (id: string) => {
    // Get GHL ID before deleting
    const { data: existing } = await supabase.from('bookings').select('ghl_event_id').eq('id', id).single();
    const { error } = await supabase.from('bookings').delete().eq('id', id);
    if (!error) {
      await fetchBookings();
      if ((existing as any)?.ghl_event_id) {
        pushToGHL('delete-booking', { ghl_event_id: (existing as any).ghl_event_id });
      }
    }
  }, [fetchBookings]);

  return (
    <BookingsContext.Provider value={{ bookings, loading, addBooking, addBookings, updateBooking, deleteBooking, refetch: fetchBookings }}>
      {children}
    </BookingsContext.Provider>
  );
}

export function useBookings() {
  const ctx = useContext(BookingsContext);
  if (!ctx) throw new Error('useBookings must be used within BookingsProvider');
  return ctx;
}
