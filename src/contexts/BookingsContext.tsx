// BookingsContext - centralized booking management with conflict detection
import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { Booking, RoomName } from '@/types/crm';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { pushToGHL } from '@/lib/ghlSync';
import { useToast } from '@/hooks/use-toast';

export interface BookingConflict {
  booking: Booking;
}

interface BookingsContextType {
  bookings: Booking[];
  loading: boolean;
  addBooking: (booking: Omit<Booking, 'id'>) => Promise<{ success: boolean; conflicts?: Booking[] }>;
  addBookings: (bookings: Omit<Booking, 'id'>[]) => Promise<{ success: boolean; conflicts?: Booking[] }>;
  updateBooking: (booking: Booking) => Promise<{ success: boolean; conflicts?: Booking[] }>;
  deleteBooking: (id: string) => Promise<void>;
  refetch: () => Promise<void>;
  checkConflicts: (date: string, room: RoomName, startMin: number, endMin: number, excludeId?: string) => Booking[];
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
      assignedTo: (b as any).assigned_to || undefined,
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

  const checkConflicts = useCallback((date: string, room: RoomName, startMin: number, endMin: number, excludeId?: string): Booking[] => {
    return bookings.filter((b) =>
      b.date === date &&
      b.roomName === room &&
      b.id !== excludeId &&
      startMin < b.endHour * 60 + (b.endMinute || 0) &&
      endMin > b.startHour * 60 + (b.startMinute || 0)
    );
  }, [bookings]);

  const addBooking = useCallback(async (booking: Omit<Booking, 'id'>): Promise<{ success: boolean; conflicts?: Booking[] }> => {
    if (!user) return { success: false };
    // Local conflict check first
    const startMin = booking.startHour * 60 + (booking.startMinute ?? 0);
    const endMin = booking.endHour * 60 + (booking.endMinute ?? 0);
    const localConflicts = checkConflicts(booking.date, booking.roomName, startMin, endMin);
    if (localConflicts.length > 0) {
      toast({ title: 'Dubbele boeking niet toegestaan', description: 'Er is al een reservering of optie op dit tijdslot in deze ruimte.', variant: 'destructive' });
      return { success: false, conflicts: localConflicts };
    }
    // Server-side conflict check to catch stale data
    const { data: dbConflicts } = await supabase
      .from('bookings')
      .select('id, room_name, date, start_hour, start_minute, end_hour, end_minute, title, contact_name, status')
      .eq('date', booking.date)
      .eq('room_name', booking.roomName);
    const serverConflicts = (dbConflicts || []).filter((b: any) => {
      const bStart = b.start_hour * 60 + (b.start_minute ?? 0);
      const bEnd = b.end_hour * 60 + (b.end_minute ?? 0);
      return startMin < bEnd && endMin > bStart;
    });
    if (serverConflicts.length > 0) {
      toast({ title: 'Dubbele boeking niet toegestaan', description: `Er is al een reservering in ${booking.roomName} op dit tijdslot.`, variant: 'destructive' });
      await fetchBookings();
      // Map server conflicts directly to Booking objects (don't rely on stale local state)
      const conflictBookings: Booking[] = serverConflicts.map((sc: any) => ({
        id: sc.id,
        roomName: sc.room_name as RoomName,
        date: sc.date,
        startHour: sc.start_hour,
        startMinute: sc.start_minute ?? 0,
        endHour: sc.end_hour,
        endMinute: sc.end_minute ?? 0,
        title: sc.title || '',
        contactName: sc.contact_name || '',
        status: sc.status as 'confirmed' | 'option',
      }));
      return { success: false, conflicts: conflictBookings };
    }

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
      return { success: false };
    }
    if (data) {
      await fetchBookings();
      pushToGHL('push-booking', { booking: data });
    }
    return { success: true };
  }, [user, fetchBookings, toast, checkConflicts]);

  const addBookings = useCallback(async (newBookings: Omit<Booking, 'id'>[]): Promise<{ success: boolean; conflicts?: Booking[] }> => {
    if (!user || newBookings.length === 0) return { success: false };
    // Local + server-side conflict check for all bookings
    for (const b of newBookings) {
      const startMin = b.startHour * 60 + (b.startMinute ?? 0);
      const endMin = b.endHour * 60 + (b.endMinute ?? 0);
      const { data: dbConflicts } = await supabase
        .from('bookings')
        .select('id, start_hour, start_minute, end_hour, end_minute')
        .eq('date', b.date)
        .eq('room_name', b.roomName);
      const serverConflicts = (dbConflicts || []).filter((x: any) => {
        const bStart = x.start_hour * 60 + (x.start_minute ?? 0);
        const bEnd = x.end_hour * 60 + (x.end_minute ?? 0);
        return startMin < bEnd && endMin > bStart;
      });
      if (serverConflicts.length > 0) {
        toast({ title: 'Dubbele boeking niet toegestaan', description: `Er is al een boeking in ${b.roomName} op ${b.date}.`, variant: 'destructive' });
        await fetchBookings();
        const conflictBookings: Booking[] = serverConflicts.map((sc: any) => ({
          id: sc.id,
          roomName: b.roomName,
          date: b.date,
          startHour: sc.start_hour,
          startMinute: sc.start_minute ?? 0,
          endHour: sc.end_hour,
          endMinute: sc.end_minute ?? 0,
          title: '',
          contactName: '',
          status: 'confirmed' as const,
        }));
        return { success: false, conflicts: conflictBookings };
      }
    }

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
      return { success: false };
    }
    await fetchBookings();
    for (const booking of data || []) {
      pushToGHL('push-booking', { booking });
    }
    return { success: true };
  }, [user, fetchBookings, toast, checkConflicts]);

  const updateBooking = useCallback(async (updated: Booking): Promise<{ success: boolean; conflicts?: Booking[] }> => {
    // Local + server-side conflict check
    const startMin = updated.startHour * 60 + (updated.startMinute ?? 0);
    const endMin = updated.endHour * 60 + (updated.endMinute ?? 0);
    const { data: dbConflicts } = await supabase
      .from('bookings')
      .select('id, start_hour, start_minute, end_hour, end_minute')
      .eq('date', updated.date)
      .eq('room_name', updated.roomName)
      .neq('id', updated.id);
    const serverConflicts = (dbConflicts || []).filter((b: any) => {
      const bStart = b.start_hour * 60 + (b.start_minute ?? 0);
      const bEnd = b.end_hour * 60 + (b.end_minute ?? 0);
      return startMin < bEnd && endMin > bStart;
    });
    if (serverConflicts.length > 0) {
      toast({ title: 'Dubbele boeking niet toegestaan', description: 'Er is al een reservering of optie op dit tijdslot in deze ruimte.', variant: 'destructive' });
      await fetchBookings();
      const conflictBookings: Booking[] = serverConflicts.map((sc: any) => ({
        id: sc.id,
        roomName: updated.roomName,
        date: updated.date,
        startHour: sc.start_hour,
        startMinute: sc.start_minute ?? 0,
        endHour: sc.end_hour,
        endMinute: sc.end_minute ?? 0,
        title: '',
        contactName: '',
        status: 'confirmed' as const,
      }));
      return { success: false, conflicts: conflictBookings };
    }

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
      assigned_to: updated.assignedTo || null,
    } as any).eq('id', updated.id).select().single();
    if (error) {
      toast({ title: 'Fout bij bijwerken boeking', description: error.message, variant: 'destructive' });
      return { success: false };
    }
    if (data) {
      await fetchBookings();
      pushToGHL('push-booking', { booking: data });
    }
    return { success: true };
  }, [fetchBookings, toast, checkConflicts]);

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
    <BookingsContext.Provider value={{ bookings, loading, addBooking, addBookings, updateBooking, deleteBooking, refetch: fetchBookings, checkConflicts }}>
      {children}
    </BookingsContext.Provider>
  );
}

export function useBookings() {
  const ctx = useContext(BookingsContext);
  if (!ctx) throw new Error('useBookings must be used within BookingsProvider');
  return ctx;
}
