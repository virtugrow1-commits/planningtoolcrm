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
import { useCompaniesContext } from '@/contexts/CompaniesContext';

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
  const { bookings, addBooking, addBookings, updateBooking, deleteBooking, checkConflicts } = useBookings();
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
  const { settings: roomSettings, displayNames, ghlCalendarIds, enabledRooms, updateRoomSettings, getMaxGuests, getDisplayName, isRoomEnabled } = useRoomSettings();
  const { contacts: fullContacts, loading: contactsLoading } = useContactsContext();
  const contacts = fullContacts.map(c => ({ id: c.id, firstName: c.firstName, lastName: c.lastName, email: c.email || null, company: c.company || null, companyId: c.companyId || null }));
  const { companies } = useCompaniesContext();

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

  const handleUpdateBooking = async (updated: Booking) => {
    const result = await updateBooking(updated);
    if (!result.success) {
      if (result.conflicts) setConflictPopup({ conflicts: result.conflicts });
      return;
    }
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

    let result;
    if (newBookings.length === 1) {
      result = await addBooking(newBookings[0]);
    } else {
      result = await addBookings(newBookings);
    }
    if (!result.success) {
      if (result.conflicts) setConflictPopup({ conflicts: result.conflicts });
      return;
    }
    toast({ title: 'Reserveringen gekopieerd', description: `${dates.length} kopie(ën) aangemaakt` });
  }, [addBooking, addBookings, toast]);

  const handleOpenCopyDialog = useCallback((booking: Booking) => {
    setCopyBooking(booking);
    setCopyDialogOpen(true);
    setDetailOpen(false);
  }, []);

  const [deleteConfirm, setDeleteConfirm] = useState<Booking | null>(null);

  const handleDeleteBooking = (bookingId: string) => {
    // Find the booking to show reschedule prompt
    const bk = bookings.find(b => b.id === bookingId) || detailBooking;
    if (bk) {
      setDeleteConfirm(bk);
      setDetailOpen(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    await deleteBooking(deleteConfirm.id);
    setDeleteConfirm(null);
    toast({ title: 'Boeking verwijderd', description: 'De reservering is verwijderd uit het CRM en de planning.' });
  };

  const handleRescheduleInstead = () => {
    if (!deleteConfirm) return;
    // Open the booking detail for editing
    setDetailBooking(deleteConfirm);
    setDeleteConfirm(null);
    setDetailOpen(true);
  };

  const handleBookingMove = useCallback((booking: Booking, targetRoom: RoomName, startHour: number, startMinute: number, endHour: number, endMinute: number) => {
    const updated = { ...booking, roomName: targetRoom, startHour, startMinute, endHour, endMinute };
    const startMin = startHour * 60 + startMinute;
    const endMin = endHour * 60 + endMinute;
    const conflicts = checkConflicts(booking.date, targetRoom, startMin, endMin, booking.id, booking.status);
    if (conflicts.length > 0) {
      setConflictPopup({ conflicts });
      toast({ title: 'Dubbele boeking niet toegestaan', description: 'Er is al een bevestigde reservering op dit tijdslot.', variant: 'destructive' });
      return;
    }
    const desc = `${booking.title} → ${getDisplayName(targetRoom)}, ${String(startHour).padStart(2,'0')}:${String(startMinute).padStart(2,'0')}–${String(endHour).padStart(2,'0')}:${String(endMinute).padStart(2,'0')}`;
    setMoveConfirm({ booking, updated, description: desc });
  }, [checkConflicts, toast, getDisplayName]);

  const handleNewReservation = async (form: NewReservationForm) => {
    const allDates: string[] = [];
    if (form.repeatType === 'specifiek') {
      allDates.push(...form.specificDates);
    } else {
      allDates.push(form.date);
      if (form.repeatType !== 'eenmalig' && form.repeatCount > 0) {
        const intervalDays = { week: 7, '2weken': 14, maand: 0, kwartaal: 0 }[form.repeatType] ?? 0;
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
    }

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

    let result;
    if (newBookingsList.length === 1) {
      result = await addBooking(newBookingsList[0]);
    } else {
      result = await addBookings(newBookingsList);
    }

    if (!result.success) {
      if (result.conflicts) setConflictPopup({ conflicts: result.conflicts });
      return;
    }

    setReservationDialogOpen(false);
    setReservationConflict(null);
    setConflictPopup(null);
    toast({ title: 'Reservering toegevoegd', description: `${form.title} — ${allDates.length} boeking(en)` });
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
          isRoomEnabled={isRoomEnabled}
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
        enabledRooms={enabledRooms}
        onSave={updateRoomSettings}
      />
      <NewReservationDialog
        open={reservationDialogOpen}
        onOpenChange={setReservationDialogOpen}
        onSubmit={handleNewReservation}
        contacts={contacts}
        contactsLoading={contactsLoading}
        companies={companies}
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

      {/* Delete confirmation dialog with reschedule option */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reservering verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Wil je deze reservering verzetten naar een andere datum/tijd, of definitief verwijderen?
              <br />
              <span className="font-medium text-foreground mt-1 block">
                {deleteConfirm?.title} — {deleteConfirm?.contactName}
                {deleteConfirm?.date && ` (${deleteConfirm.date})`}
              </span>
              <span className="text-xs text-muted-foreground block mt-1">
                Bij verwijderen wordt de boeking ook uit de externe planning verwijderd.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <Button variant="outline" onClick={handleRescheduleInstead}>
              Verzetten
            </Button>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              Definitief verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
            <AlertDialogAction onClick={async () => {
              if (moveConfirm) {
                const result = await updateBooking(moveConfirm.updated);
                if (result.success) {
                  toast({ title: 'Boeking verplaatst' });
                } else if (result.conflicts) {
                  setConflictPopup({ conflicts: result.conflicts });
                }
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
