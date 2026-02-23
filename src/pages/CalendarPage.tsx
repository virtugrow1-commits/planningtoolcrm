import { useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ROOMS, Booking, RoomName } from '@/types/crm';
import { ChevronLeft, ChevronRight, Settings, CalendarPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useBookings } from '@/contexts/BookingsContext';
import BookingDetailDialog from '@/components/calendar/BookingDetailDialog';
import CopyBookingDialog from '@/components/calendar/CopyBookingDialog';
import NewReservationDialog, { NewReservationForm } from '@/components/calendar/NewReservationDialog';
import RoomSettingsDialog from '@/components/calendar/RoomSettingsDialog';
import ConflictAlertDialog from '@/components/calendar/ConflictAlertDialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import WeekView from '@/components/calendar/WeekView';
import MonthView from '@/components/calendar/MonthView';
import DayGridView from '@/components/calendar/DayGridView';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useRoomSettings } from '@/hooks/useRoomSettings';
import { useContactsContext } from '@/contexts/ContactsContext';

type CalendarViewMode = 'day' | 'week' | 'month';

function formatDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function CalendarPage() {
  const [searchParams] = useSearchParams();
  const [currentDate, setCurrentDate] = useState(() => {
    const dateParam = searchParams.get('date');
    if (dateParam) {
      const parsed = new Date(dateParam + 'T12:00:00');
      if (!isNaN(parsed.getTime())) return parsed;
    }
    return new Date();
  });
  const { bookings, addBooking, addBookings, updateBooking, deleteBooking } = useBookings();
  const [viewMode, setViewMode] = useState<CalendarViewMode>('day');
  const [detailBooking, setDetailBooking] = useState<Booking | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [roomSettingsOpen, setRoomSettingsOpen] = useState(false);
  const [reservationDialogOpen, setReservationDialogOpen] = useState(false);
  const [reservationConflict, setReservationConflict] = useState<string | null>(null);
  const [reservationInitial, setReservationInitial] = useState<{ hour?: number; room?: RoomName; date?: string }>({});
  const [conflictPopup, setConflictPopup] = useState<{ conflicts: Booking[] } | null>(null);
  const [moveConfirm, setMoveConfirm] = useState<{ booking: Booking; updated: Booking; description: string } | null>(null);
  const [copyBooking, setCopyBooking] = useState<Booking | null>(null);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const { toast } = useToast();
  const { settings: roomSettings, displayNames, ghlCalendarIds, updateRoomSettings, getMaxGuests, getDisplayName } = useRoomSettings();
  const { contacts: fullContacts, loading: contactsLoading } = useContactsContext();
  const contacts = fullContacts.map(c => ({ id: c.id, firstName: c.firstName, lastName: c.lastName, email: c.email || null, company: c.company || null }));

  const dateStr = formatDate(currentDate);

  const handleCellClick = (room: RoomName, hour: number) => {
    setReservationConflict(null);
    setReservationInitial({ hour, room, date: dateStr });
    setReservationDialogOpen(true);
  };

  const handleBookingClick = (booking: Booking) => {
    setDetailBooking(booking);
    setDetailOpen(true);
  };

  const handleUpdateBooking = (updated: Booking) => {
    const dayBookings = bookings.filter((b) => b.date === updated.date);
    const conflicts = dayBookings.filter((b) =>
      b.roomName === updated.roomName &&
      updated.startHour * 60 + (updated.startMinute || 0) < b.endHour * 60 + (b.endMinute || 0) &&
      updated.endHour * 60 + (updated.endMinute || 0) > b.startHour * 60 + (b.startMinute || 0) &&
      b.id !== updated.id
    );
    if (conflicts.length > 0) {
      setConflictPopup({ conflicts });
      toast({ title: 'Dubbele boeking niet toegestaan', description: 'Er is al een reservering op dit tijdslot.', variant: 'destructive' });
      return;
    }
    updateBooking(updated);
    setDetailBooking(updated);
    toast({ title: 'Boeking bijgewerkt' });
  };

  const handleCopyBooking = useCallback(async (booking: Booking, dates: string[]) => {
    const newBookings = dates.map((date) => ({
      roomName: booking.roomName,
      date,
      startHour: booking.startHour,
      startMinute: booking.startMinute,
      endHour: booking.endHour,
      endMinute: booking.endMinute,
      title: booking.title,
      contactName: booking.contactName,
      contactId: booking.contactId,
      status: booking.status,
      notes: booking.notes,
      guestCount: booking.guestCount ?? 0,
      roomSetup: booking.roomSetup,
      requirements: booking.requirements,
      preparationStatus: booking.preparationStatus || 'pending' as const,
    }));

    // Check conflicts
    const allConflicts: Booking[] = [];
    for (const nb of newBookings) {
      const dayBookings = bookings.filter((b) => b.date === nb.date);
      const conflicts = dayBookings.filter((b) =>
        b.roomName === nb.roomName &&
        nb.startHour * 60 + (nb.startMinute || 0) < b.endHour * 60 + (b.endMinute || 0) &&
        nb.endHour * 60 + (nb.endMinute || 0) > b.startHour * 60 + (b.startMinute || 0)
      );
      allConflicts.push(...conflicts);
    }

    if (allConflicts.length > 0) {
      setConflictPopup({ conflicts: allConflicts });
      toast({ title: 'Dubbele boeking niet toegestaan', description: 'Er is al een reservering op een van de gekozen datums.', variant: 'destructive' });
      return;
    }

    if (newBookings.length === 1) {
      await addBooking(newBookings[0]);
    } else {
      await addBookings(newBookings);
    }
    toast({ title: 'Reserveringen gekopieerd', description: `${dates.length} kopie(ën) aangemaakt` });
  }, [bookings, addBooking, addBookings, toast]);

  const handleOpenCopyDialog = useCallback((booking: Booking) => {
    setCopyBooking(booking);
    setCopyDialogOpen(true);
    setDetailOpen(false);
  }, []);

  const handleDeleteBooking = (bookingId: string) => {
    deleteBooking(bookingId);
    setDetailOpen(false);
    toast({ title: 'Boeking verwijderd' });
  };

  const handleBookingMove = useCallback((booking: Booking, targetRoom: RoomName, startHour: number, startMinute: number, endHour: number, endMinute: number) => {
    const updated = { ...booking, roomName: targetRoom, startHour, startMinute, endHour, endMinute };
    const dayBookings = bookings.filter((b) => b.date === booking.date);
    const startMin = startHour * 60 + startMinute;
    const endMin = endHour * 60 + endMinute;
    const conflicts = dayBookings.filter((b) =>
      b.roomName === targetRoom &&
      startMin < b.endHour * 60 + (b.endMinute || 0) &&
      endMin > b.startHour * 60 + (b.startMinute || 0) &&
      b.id !== booking.id
    );
    if (conflicts.length > 0) {
      setConflictPopup({ conflicts });
      toast({ title: 'Dubbele boeking niet toegestaan', description: 'Er is al een reservering op dit tijdslot.', variant: 'destructive' });
      return;
    }
    // Show confirmation dialog
    const desc = `${booking.title} → ${getDisplayName(targetRoom)}, ${String(startHour).padStart(2,'0')}:${String(startMinute).padStart(2,'0')}–${String(endHour).padStart(2,'0')}:${String(endMinute).padStart(2,'0')}`;
    setMoveConfirm({ booking, updated, description: desc });
  }, [bookings, toast, getDisplayName]);

  const handleNewReservation = async (form: NewReservationForm) => {
    const allDates: string[] = [form.date];
    if (form.repeatType !== 'eenmalig' && form.repeatCount > 0) {
      const intervalDays = { week: 7, '2weken': 14, maand: 0, kwartaal: 0 }[form.repeatType];
      for (let i = 1; i <= form.repeatCount; i++) {
        const d = new Date(form.date + 'T12:00:00');
        if (form.repeatType === 'maand') {
          d.setMonth(d.getMonth() + i);
        } else if (form.repeatType === 'kwartaal') {
          d.setMonth(d.getMonth() + i * 3);
        } else {
          d.setDate(d.getDate() + i * intervalDays);
        }
        allDates.push(formatDate(d));
      }
    }

    const allConflicts: Booking[] = [];
    for (const date of allDates) {
      const dayBookings = bookings.filter((b) => b.date === date);
      const dateConflicts = dayBookings.filter((b) => b.roomName === form.room && form.startHour < b.endHour && form.endHour > b.startHour);
      allConflicts.push(...dateConflicts);
    }

    const doAdd = async () => {
      const newBookingsList = allDates.map((date) => ({
        roomName: form.room,
        date,
        startHour: form.startHour,
        startMinute: form.startMinute ?? 0,
        endHour: form.endHour,
        endMinute: form.endMinute ?? 0,
        title: form.title,
        contactName: form.contactName,
        contactId: form.contactId,
        status: form.status,
        guestCount: form.guestCount ?? 0,
        roomSetup: form.roomSetup || undefined,
        requirements: form.notes || undefined,
        preparationStatus: 'pending' as const,
      }));

      if (newBookingsList.length === 1) {
        await addBooking(newBookingsList[0]);
      } else {
        await addBookings(newBookingsList);
      }

      setReservationDialogOpen(false);
      setReservationConflict(null);
      setConflictPopup(null);
      toast({ title: 'Reservering toegevoegd', description: `${form.title} — ${allDates.length} boeking(en)` });
    };

    if (allConflicts.length > 0) {
      setConflictPopup({ conflicts: allConflicts });
      toast({ title: 'Dubbele boeking niet toegestaan', description: 'Er is al een reservering op dit tijdslot.', variant: 'destructive' });
      return;
    }

    await doAdd();
  };

  const prevPeriod = () => setCurrentDate((d) => {
    const n = new Date(d);
    if (viewMode === 'day') n.setDate(n.getDate() - 1);
    else if (viewMode === 'week') n.setDate(n.getDate() - 7);
    else n.setMonth(n.getMonth() - 1);
    return n;
  });
  const nextPeriod = () => setCurrentDate((d) => {
    const n = new Date(d);
    if (viewMode === 'day') n.setDate(n.getDate() + 1);
    else if (viewMode === 'week') n.setDate(n.getDate() + 7);
    else n.setMonth(n.getMonth() + 1);
    return n;
  });
  const goToday = () => setCurrentDate(new Date());

  const handleDayClickFromView = (date: Date) => {
    setCurrentDate(date);
    setViewMode('day');
  };

  return (
    <div className="p-6 lg:p-8 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Kalender</h1>
          <p className="text-sm text-muted-foreground">
            {['Zondag','Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag','Zaterdag'][currentDate.getDay()]} {currentDate.getDate()}{' '}
            {['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'][currentDate.getMonth()]}{' '}
            {currentDate.getFullYear()}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={prevPeriod}><ChevronLeft size={16} /></Button>
          <Button variant="outline" size="sm" onClick={goToday}>Vandaag</Button>
          <Button variant="outline" size="sm" onClick={nextPeriod}><ChevronRight size={16} /></Button>

          <Select
            value={String(currentDate.getDate())}
            onValueChange={(v) => { const d = new Date(currentDate); d.setDate(Number(v)); setCurrentDate(d); }}
          >
            <SelectTrigger className="h-8 w-16 text-sm font-semibold"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate() }, (_, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>{i + 1}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={String(currentDate.getMonth())}
            onValueChange={(v) => { const d = new Date(currentDate); d.setMonth(Number(v)); setCurrentDate(d); }}
          >
            <SelectTrigger className="h-8 w-32 text-sm font-semibold"><SelectValue /></SelectTrigger>
            <SelectContent>
              {['Januari','Februari','Maart','April','Mei','Juni','Juli','Augustus','September','Oktober','November','December'].map((m, i) => (
                <SelectItem key={i} value={String(i)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={String(currentDate.getFullYear())}
            onValueChange={(v) => { const d = new Date(currentDate); d.setFullYear(Number(v)); setCurrentDate(d); }}
          >
            <SelectTrigger className="h-8 w-24 text-sm font-semibold"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 + i).map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <ToggleGroup type="single" value={viewMode} onValueChange={(v) => v && setViewMode(v as CalendarViewMode)} size="sm" className="border rounded-md">
            <ToggleGroupItem value="day" className="text-xs px-3">Dag</ToggleGroupItem>
            <ToggleGroupItem value="week" className="text-xs px-3">Week</ToggleGroupItem>
            <ToggleGroupItem value="month" className="text-xs px-3">Maand</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm bg-success" /> Bevestigd</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm bg-warning" /> In Optie</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm bg-muted" /> Beschikbaar</span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" className="gap-1.5 text-xs" onClick={() => { setReservationConflict(null); setReservationInitial({ date: dateStr }); setReservationDialogOpen(true); }}>
            <CalendarPlus size={14} /> Nieuwe Reservering
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setRoomSettingsOpen(true)}>
            <Settings size={14} /> Ruimte-instellingen
          </Button>
        </div>
      </div>

      {/* Views */}
      {viewMode === 'week' ? (
        <WeekView
          currentDate={currentDate}
          bookings={bookings}
          onDayClick={handleDayClickFromView}
          onBookingClick={(b) => { setDetailBooking(b); setDetailOpen(true); }}
          getRoomDisplayName={getDisplayName}
        />
      ) : viewMode === 'month' ? (
        <MonthView
          currentDate={currentDate}
          bookings={bookings}
          onDayClick={handleDayClickFromView}
          onBookingClick={(b) => { setDetailBooking(b); setDetailOpen(true); }}
          getRoomDisplayName={getDisplayName}
        />
      ) : (
        <DayGridView
          dateStr={dateStr}
          bookings={bookings}
          onBookingClick={handleBookingClick}
          onCellClick={handleCellClick}
          onBookingMove={handleBookingMove}
          getDisplayName={getDisplayName}
          getMaxGuests={getMaxGuests}
        />
      )}

      {/* Dialogs */}
      <BookingDetailDialog
        booking={detailBooking}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onUpdate={handleUpdateBooking}
        onDelete={handleDeleteBooking}
        onCopy={handleOpenCopyDialog}
        getRoomDisplayName={getDisplayName}
      />
      <CopyBookingDialog
        booking={copyBooking}
        open={copyDialogOpen}
        onOpenChange={setCopyDialogOpen}
        onCopy={handleCopyBooking}
        getRoomDisplayName={getDisplayName}
      />
      <RoomSettingsDialog
        open={roomSettingsOpen}
        onOpenChange={setRoomSettingsOpen}
        settings={roomSettings}
        displayNames={displayNames}
        ghlCalendarIds={ghlCalendarIds}
        onSave={updateRoomSettings}
      />
      <NewReservationDialog
        open={reservationDialogOpen}
        onOpenChange={setReservationDialogOpen}
        onSubmit={handleNewReservation}
        contacts={contacts}
        contactsLoading={contactsLoading}
        conflictAlert={reservationConflict}
        getRoomDisplayName={getDisplayName}
        initialStartHour={reservationInitial.hour}
        initialRoom={reservationInitial.room}
        initialDate={reservationInitial.date}
      />
      <ConflictAlertDialog
        open={!!conflictPopup}
        onOpenChange={(open) => { if (!open) setConflictPopup(null); }}
        conflicts={conflictPopup?.conflicts || []}
        getRoomDisplayName={getDisplayName}
      />

      {/* Move confirmation dialog */}
      <AlertDialog open={!!moveConfirm} onOpenChange={(open) => { if (!open) setMoveConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reservering verzetten?</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je deze reservering wilt verplaatsen?
              <br />
              <span className="font-medium text-foreground mt-1 block">{moveConfirm?.description}</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (moveConfirm) {
                updateBooking(moveConfirm.updated);
                toast({ title: 'Boeking verplaatst' });
              }
              setMoveConfirm(null);
            }}>
              Ja, verzetten
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
