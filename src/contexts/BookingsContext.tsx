import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { Booking, RoomName } from '@/types/crm';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { pushToGHL } from '@/lib/ghlSync';
import { useToast } from '@/hooks/use-toast';

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
  const { toast } = useToast();

  const fetchBookings = useCallback(async () => {
    if (!user) return;
    let allData: any[] = [];
    let from = 0;
    const PAGE_SIZE = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .order('date', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) {
        toast({ title: 'Fout bij laden boekingen', description: error.message, variant: 'destructive' });
        break;
      }
      if (!data || data.length === 0) break;
      allData = allData.concat(data);
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
    setBookings(allData.map((b) => ({
      id: b.id,
      reservationNumber: (b as any).reservation_number ? (b as any).reservation_number.replace(/^RES-/, '#') : undefined,
      roomName: b.room_name as RoomName,
      date: b.date,
      startHour: b.start_hour,
      startMinute: b.start_minute ?? 0,
      endHour: b.end_hour,
      endMinute: b.end_minute ?? 0,
      title: b.title,
      contactName: b.contact_name,
      contactId: b.contact_id || undefined,
      status: b.status as 'confirmed' | 'option',
      notes: b.notes || undefined,
      guestCount: (b as any).guest_count ?? 0,
      roomSetup: (b as any).room_setup || undefined,
      requirements: (b as any).requirements || undefined,
      preparationStatus: (b as any).preparation_status || 'pending',
    })));
    setLoading(false);
  }, [user, toast]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

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
      start_minute: booking.startMinute ?? 0,
      end_hour: booking.endHour,
      end_minute: booking.endMinute ?? 0,
      title: booking.title,
      contact_name: booking.contactName,
      contact_id: booking.contactId || null,
      status: booking.status,
      notes: booking.notes || null,
      guest_count: booking.guestCount ?? 0,
      room_setup: booking.roomSetup || null,
      requirements: booking.requirements || null,
      preparation_status: booking.preparationStatus || 'pending',
    } as any).select().single();
    if (error) {
      toast({ title: 'Fout bij aanmaken boeking', description: error.message, variant: 'destructive' });
      return;
    }
    if (data) {
      await fetchBookings();
      pushToGHL('push-booking', { booking: data });
    }
  }, [user, fetchBookings, toast]);

  const addBookings = useCallback(async (newBookings: Omit<Booking, 'id'>[]) => {
    if (!user || newBookings.length === 0) return;
    const rows = newBookings.map((b) => ({
      user_id: user.id,
      room_name: b.roomName,
      date: b.date,
      start_hour: b.startHour,
      start_minute: b.startMinute ?? 0,
      end_hour: b.endHour,
      end_minute: b.endMinute ?? 0,
      title: b.title,
      contact_name: b.contactName,
      contact_id: b.contactId || null,
      status: b.status,
      notes: b.notes || null,
      guest_count: b.guestCount ?? 0,
      room_setup: b.roomSetup || null,
      requirements: b.requirements || null,
      preparation_status: b.preparationStatus || 'pending',
    } as any));
    const { data, error } = await supabase.from('bookings').insert(rows).select();
    if (error) {
      toast({ title: 'Fout bij aanmaken boekingen', description: error.message, variant: 'destructive' });
      return;
    }
    if (!error) {
      await fetchBookings();
      for (const booking of data || []) {
        pushToGHL('push-booking', { booking });
      }
    }
  }, [user, fetchBookings, toast]);

  const updateBooking = useCallback(async (updated: Booking) => {
    const { data, error } = await supabase.from('bookings').update({
      room_name: updated.roomName,
      date: updated.date,
      start_hour: updated.startHour,
      start_minute: updated.startMinute ?? 0,
      end_hour: updated.endHour,
      end_minute: updated.endMinute ?? 0,
      title: updated.title,
      contact_name: updated.contactName,
      contact_id: updated.contactId || null,
      status: updated.status,
      notes: updated.notes || null,
      guest_count: updated.guestCount ?? 0,
      room_setup: updated.roomSetup || null,
      requirements: updated.requirements || null,
      preparation_status: updated.preparationStatus || 'pending',
    } as any).eq('id', updated.id).select().single();
    if (error) {
      toast({ title: 'Fout bij bijwerken boeking', description: error.message, variant: 'destructive' });
      return;
    }
    if (data) {
      await fetchBookings();
      pushToGHL('push-booking', { booking: data });
    }
  }, [fetchBookings, toast]);

  const deleteBooking = useCallback(async (id: string) => {
    const { data: existing } = await supabase.from('bookings').select('ghl_event_id').eq('id', id).single();
    const { error } = await supabase.from('bookings').delete().eq('id', id);
    if (error) {
      toast({ title: 'Fout bij verwijderen boeking', description: error.message, variant: 'destructive' });
      return;
    }
    await fetchBookings();
    if ((existing as any)?.ghl_event_id) {
      pushToGHL('delete-booking', { ghl_event_id: (existing as any).ghl_event_id });
    }
  }, [fetchBookings, toast]);

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
