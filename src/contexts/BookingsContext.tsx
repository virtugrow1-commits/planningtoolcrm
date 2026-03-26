// BookingsContext - centralized booking management with conflict detection + combined room logic
import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { Booking, RoomName } from '@/types/crm';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useRoomConflicts } from '@/hooks/useRoomConflicts';
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
  checkConflicts: (date: string, room: RoomName, startMin: number, endMin: number, excludeId?: string, newStatus?: string) => Booking[];
}

const BookingsContext = createContext<BookingsContextType | null>(null);

export function BookingsProvider({ children }: { children: ReactNode }) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();
  const { getConflictRooms } = useRoomConflicts();

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
      companyId: (b as any).company_id || undefined,
      status: b.status as 'confirmed' | 'option',
      notes: b.notes || undefined,
      guestCount: (b as any).guest_count ?? 0,
      roomSetup: (b as any).room_setup || undefined,
      requirements: (b as any).requirements || undefined,
      preparationStatus: (b as any).preparation_status || 'pending',
      assignedTo: (b as any).assigned_to || undefined,
      ghlEventId: (b as any).ghl_event_id || undefined,
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

  // Check conflicts including combined room rules
  // Options may overlap with other options; confirmed bookings block everything
  const checkConflicts = useCallback((date: string, room: RoomName, startMin: number, endMin: number, excludeId?: string, newStatus?: string): Booking[] => {
    const roomsToCheck = getConflictRooms(room);
    return bookings.filter((b) => {
      if (b.id === excludeId) return false;
      if (b.date !== date) return false;
      if (!roomsToCheck.includes(b.roomName)) return false;
      const bStart = b.startHour * 60 + (b.startMinute || 0);
      const bEnd = b.endHour * 60 + (b.endMinute || 0);
      if (startMin >= bEnd || endMin <= bStart) return false;
      // Both are options → no conflict
      if (newStatus === 'option' && b.status === 'option') return false;
      return true;
    });
  }, [bookings, getConflictRooms]);

  // Server-side conflict check including combined room rules
  const serverConflictCheck = useCallback(async (
    date: string, roomName: string, startMin: number, endMin: number, excludeId?: string, newStatus?: string
  ): Promise<Booking[]> => {
    const roomsToCheck = getConflictRooms(roomName);
    const { data: dbConflicts } = await supabase
      .from('bookings')
      .select('id, room_name, date, start_hour, start_minute, end_hour, end_minute, title, contact_name, status')
      .eq('date', date)
      .in('room_name', roomsToCheck);
    return (dbConflicts || []).filter((b: any) => {
      if (excludeId && b.id === excludeId) return false;
      const bStart = b.start_hour * 60 + (b.start_minute ?? 0);
      const bEnd = b.end_hour * 60 + (b.end_minute ?? 0);
      if (startMin >= bEnd || endMin <= bStart) return false;
      // Both are options → no conflict
      if (newStatus === 'option' && b.status === 'option') return false;
      return true;
    }).map((sc: any) => ({
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
  }, [getConflictRooms]);

  // Queue failed sync to sync_queue table
  const queueFailedSync = useCallback(async (
    entityId: string, actionType: string, payload: any, error: string
  ) => {
    if (!user) return;
    try {
      await supabase.from('sync_queue').insert({
        user_id: user.id,
        entity_type: 'booking',
        entity_id: entityId,
        action_type: actionType,
        payload,
        status: 'pending',
        last_error: error,
      } as any);
    } catch (e) {
      console.error('[SyncQueue] Failed to queue:', e);
    }
  }, [user]);

  // Log sync action
  const logSync = useCallback(async (
    action: string, entityId: string | null, details: any, status: 'success' | 'error' | 'conflict'
  ) => {
    if (!user) return;
    try {
      await supabase.from('sync_log').insert({
        user_id: user.id,
        entity_type: 'booking',
        entity_id: entityId,
        action,
        details,
        status,
      } as any);
    } catch (_) { /* intentional */ }
  }, [user]);

  const addBooking = useCallback(async (booking: Omit<Booking, 'id'>): Promise<{ success: boolean; conflicts?: Booking[] }> => {
    if (!user) return { success: false };
    const startMin = booking.startHour * 60 + (booking.startMinute ?? 0);
    const endMin = booking.endHour * 60 + (booking.endMinute ?? 0);

    // Local conflict check (includes combined room logic)
    const localConflicts = checkConflicts(booking.date, booking.roomName, startMin, endMin, undefined, booking.status);
    if (localConflicts.length > 0) {
      const conflictRooms = [...new Set(localConflicts.map(c => c.roomName))].join(', ');
      toast({ title: 'Dubbele boeking niet toegestaan', description: `Conflict met: ${conflictRooms}`, variant: 'destructive' });
      await logSync('conflict_detected', null, { room: booking.roomName, conflicts: localConflicts.map(c => ({ id: c.id, room: c.roomName })) }, 'conflict');
      return { success: false, conflicts: localConflicts };
    }

    // Server-side conflict check (includes combined room logic)
    const serverConflicts = await serverConflictCheck(booking.date, booking.roomName, startMin, endMin, undefined, booking.status);
    if (serverConflicts.length > 0) {
      const conflictRooms = [...new Set(serverConflicts.map(c => c.roomName))].join(', ');
      toast({ title: 'Dubbele boeking niet toegestaan', description: `Server conflict met: ${conflictRooms}`, variant: 'destructive' });
      await fetchBookings();
      await logSync('conflict_detected', null, { room: booking.roomName, conflicts: serverConflicts.map(c => ({ id: c.id, room: c.roomName })) }, 'conflict');
      return { success: false, conflicts: serverConflicts };
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
      company_id: booking.companyId || null,
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
      // Optimistic: add to local state immediately
      const newBooking: Booking = {
        id: data.id,
        reservationNumber: (data as any).reservation_number ? (data as any).reservation_number.replace(/^RES-/, '#') : undefined,
        roomName: data.room_name as RoomName,
        date: data.date,
        startHour: data.start_hour,
        startMinute: data.start_minute ?? 0,
        endHour: data.end_hour,
        endMinute: data.end_minute ?? 0,
        title: data.title,
        contactName: data.contact_name,
        contactId: data.contact_id || undefined,
        companyId: (data as any).company_id || undefined,
        status: data.status as 'confirmed' | 'option',
        notes: data.notes || undefined,
        guestCount: (data as any).guest_count ?? 0,
        roomSetup: (data as any).room_setup || undefined,
        requirements: (data as any).requirements || undefined,
        preparationStatus: (data as any).preparation_status || 'pending',
        assignedTo: (data as any).assigned_to || undefined,
        ghlEventId: (data as any).ghl_event_id || undefined,
      };
      setBookings(prev => [...prev, newBooking]);

      // GHL push in background (fire-and-forget)
      (async () => {
        try {
          const { error: syncErr } = await supabase.functions.invoke('ghl-sync', {
            body: { action: 'push-booking', booking: data },
          });
          if (syncErr) throw syncErr;
          await logSync('push_booking', data.id, { room: booking.roomName, ghl_status: 'success' }, 'success');
        } catch (err: any) {
          console.warn('[VGW Sync] push-booking failed, queuing:', err);
          await queueFailedSync(data.id, 'create', data, err?.message || 'Unknown error');
          await logSync('push_booking', data.id, { room: booking.roomName, error: err?.message }, 'error');
        }
      })();
    }
    return { success: true };
  }, [user, fetchBookings, toast, checkConflicts, serverConflictCheck, queueFailedSync, logSync]);

  const addBookings = useCallback(async (newBookings: Omit<Booking, 'id'>[]): Promise<{ success: boolean; conflicts?: Booking[] }> => {
    if (!user || newBookings.length === 0) return { success: false };
    // Check conflicts for each booking (with combined room logic)
    for (const b of newBookings) {
      const startMin = b.startHour * 60 + (b.startMinute ?? 0);
      const endMin = b.endHour * 60 + (b.endMinute ?? 0);
      const serverConflicts = await serverConflictCheck(b.date, b.roomName, startMin, endMin, undefined, b.status);
      if (serverConflicts.length > 0) {
        const conflictRooms = [...new Set(serverConflicts.map(c => c.roomName))].join(', ');
        toast({ title: 'Dubbele boeking niet toegestaan', description: `Conflict met ${conflictRooms} op ${b.date}.`, variant: 'destructive' });
        await fetchBookings();
        return { success: false, conflicts: serverConflicts };
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
      company_id: b.companyId || null,
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
    // GHL push in background (fire-and-forget)
    for (const booking of data || []) {
      (async () => {
        try {
          const { error: syncErr } = await supabase.functions.invoke('ghl-sync', {
            body: { action: 'push-booking', booking },
          });
          if (syncErr) throw syncErr;
          await logSync('push_booking', booking.id, { ghl_status: 'success' }, 'success');
        } catch (err: any) {
          console.warn('[VGW Sync] push-booking failed, queuing:', err);
          await queueFailedSync(booking.id, 'create', booking, err?.message || 'Unknown error');
          await logSync('push_booking', booking.id, { error: err?.message }, 'error');
        }
      })();
    }
    await fetchBookings();
    return { success: true };
  }, [user, fetchBookings, toast, serverConflictCheck, queueFailedSync, logSync]);

  const updateBooking = useCallback(async (updated: Booking): Promise<{ success: boolean; conflicts?: Booking[] }> => {
    const startMin = updated.startHour * 60 + (updated.startMinute ?? 0);
    const endMin = updated.endHour * 60 + (updated.endMinute ?? 0);

    // Server-side conflict check with combined room logic
    const serverConflicts = await serverConflictCheck(updated.date, updated.roomName, startMin, endMin, updated.id, updated.status);
    if (serverConflicts.length > 0) {
      const conflictRooms = [...new Set(serverConflicts.map(c => c.roomName))].join(', ');
      toast({ title: 'Dubbele boeking niet toegestaan', description: `Conflict met: ${conflictRooms}`, variant: 'destructive' });
      await fetchBookings();
      return { success: false, conflicts: serverConflicts };
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
      company_id: updated.companyId || null,
      status: updated.status,
      notes: updated.notes || null,
      guest_count: updated.guestCount ?? 0,
      room_setup: updated.roomSetup || null,
      requirements: updated.requirements || null,
      preparation_status: updated.preparationStatus || 'pending',
      assigned_to: updated.assignedTo || null,
      // Preserve ghl_event_id — never overwrite it during an update
    } as any).eq('id', updated.id).select().single();
    if (error) {
      toast({ title: 'Fout bij bijwerken boeking', description: error.message, variant: 'destructive' });
      return { success: false };
    }
    if (data) {
      // GHL push in background (fire-and-forget)
      (async () => {
        try {
          const { error: syncErr } = await supabase.functions.invoke('ghl-sync', {
            body: { action: 'push-booking', booking: data },
          });
          if (syncErr) throw syncErr;
          await logSync('update_booking', data.id, { ghl_status: 'success' }, 'success');
        } catch (err: any) {
          console.warn('[VGW Sync] push-booking failed, queuing:', err);
          await queueFailedSync(data.id, 'update', data, err?.message || 'Unknown error');
          await logSync('update_booking', data.id, { error: err?.message }, 'error');
        }
      })();
      await fetchBookings();
    }
    return { success: true };
  }, [fetchBookings, toast, serverConflictCheck, queueFailedSync, logSync]);

  const deleteBooking = useCallback(async (id: string) => {
    // Optimistic removal — instantly remove from UI state to prevent "spring back"
    const previousBookings = bookings;
    setBookings((prev) => prev.filter((b) => b.id !== id));

    const { data: existing } = await supabase.from('bookings').select('ghl_event_id').eq('id', id).single();
    const ghlEventId = (existing as any)?.ghl_event_id;
    
    // Delete from GHL FIRST
    if (ghlEventId) {
      try {
        const { error: syncErr } = await supabase.functions.invoke('ghl-sync', {
          body: { action: 'delete-booking', ghl_event_id: ghlEventId },
        });
        if (syncErr) throw syncErr;
        await logSync('delete_booking', id, { ghl_event_id: ghlEventId, ghl_status: 'success' }, 'success');
      } catch (err: any) {
        console.warn('[VGW Sync] delete-booking failed, queuing:', err);
        await queueFailedSync(id, 'delete', { ghl_event_id: ghlEventId }, err?.message || 'Unknown error');
        await logSync('delete_booking', id, { ghl_event_id: ghlEventId, error: err?.message }, 'error');
      }
    }
    
    const { error } = await supabase.from('bookings').delete().eq('id', id);
    if (error) {
      // Rollback optimistic removal
      setBookings(previousBookings);
      toast({ title: 'Fout bij verwijderen boeking', description: error.message, variant: 'destructive' });
      return;
    }
    // Don't fetchBookings here — optimistic state is already correct
    // Realtime subscription will confirm the deletion
  }, [bookings, toast, queueFailedSync, logSync]);

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
