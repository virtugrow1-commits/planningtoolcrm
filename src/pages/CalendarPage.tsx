import { useState, useMemo, useCallback, DragEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ROOMS, Booking, RoomName } from '@/types/crm';
import { ChevronLeft, ChevronRight, Plus, GripVertical, Settings, Users, CalendarPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useBookings } from '@/contexts/BookingsContext';
import BookingDetailDialog from '@/components/calendar/BookingDetailDialog';
import NewBookingDialog from '@/components/calendar/NewBookingDialog';
import NewReservationDialog, { NewReservationForm } from '@/components/calendar/NewReservationDialog';
import RoomSettingsDialog from '@/components/calendar/RoomSettingsDialog';
import ConflictAlertDialog from '@/components/calendar/ConflictAlertDialog';
import WeekView from '@/components/calendar/WeekView';
import MonthView from '@/components/calendar/MonthView';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useRoomSettings } from '@/hooks/useRoomSettings';
import { useContacts } from '@/hooks/useContacts';

type CalendarViewMode = 'day' | 'week' | 'month';

// 07:00 to 01:00 (next day) = hours 7,8,...,23,0,1
const HOURS = [...Array.from({ length: 17 }, (_, i) => i + 7), 0, 1];

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
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [newBooking, setNewBooking] = useState({ room: '' as RoomName, startHour: 9, endHour: 12, title: '', contactName: '', status: 'confirmed' as 'confirmed' | 'option' });
  const [viewMode, setViewMode] = useState<CalendarViewMode>('day');
  const [conflictAlert, setConflictAlert] = useState<string | null>(null);
  const [detailBooking, setDetailBooking] = useState<Booking | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [dragBookingId, setDragBookingId] = useState<string | null>(null);
  const [dragOverCell, setDragOverCell] = useState<{ room: RoomName; hour: number } | null>(null);
  const [roomSettingsOpen, setRoomSettingsOpen] = useState(false);
  const [reservationDialogOpen, setReservationDialogOpen] = useState(false);
  const [reservationConflict, setReservationConflict] = useState<string | null>(null);
  const [reservationInitial, setReservationInitial] = useState<{ hour?: number; room?: RoomName; date?: string }>({});
  const [conflictPopup, setConflictPopup] = useState<{ conflicts: Booking[]; onProceed: () => void } | null>(null);
  const { toast } = useToast();
  const { settings: roomSettings, displayNames, updateRoomSettings, getMaxGuests, getDisplayName } = useRoomSettings();
  const { contacts, loading: contactsLoading } = useContacts();

  const dateStr = formatDate(currentDate);
  const todayBookings = useMemo(() => bookings.filter((b) => b.date === dateStr), [bookings, dateStr]);

  const getBookingForCell = (room: RoomName, hour: number): Booking | undefined =>
    todayBookings.find((b) => b.roomName === room && hour >= b.startHour && hour < b.endHour);

  const isBookingStart = (room: RoomName, hour: number): boolean =>
    todayBookings.some((b) => b.roomName === room && b.startHour === hour);

  const getBookingSpan = (room: RoomName, hour: number): number => {
    const b = todayBookings.find((b) => b.roomName === room && b.startHour === hour);
    return b ? b.endHour - b.startHour : 1;
  };

  const checkConflict = (room: RoomName, start: number, end: number, excludeId?: string): Booking | undefined =>
    todayBookings.find((b) => b.roomName === room && start < b.endHour && end > b.startHour && b.id !== excludeId);

  const handleCellClick = (room: RoomName, hour: number) => {
    const existing = getBookingForCell(room, hour);
    if (existing) return;
    setReservationConflict(null);
    setReservationInitial({ hour, room, date: dateStr });
    setReservationDialogOpen(true);
  };

  const handleBookingClick = (booking: Booking) => {
    setDetailBooking(booking);
    setDetailOpen(true);
  };

  const handleAddBooking = () => {
    const conflict = checkConflict(newBooking.room, newBooking.startHour, newBooking.endHour);
    if (conflict) {
      const allConflicts = todayBookings.filter((b) => b.roomName === newBooking.room && newBooking.startHour < b.endHour && newBooking.endHour > b.startHour);
      setConflictPopup({
        conflicts: allConflicts,
        onProceed: () => {
          addBooking({
            roomName: newBooking.room,
            date: dateStr,
            startHour: newBooking.startHour,
            startMinute: 0,
            endHour: newBooking.endHour,
            endMinute: 0,
            title: newBooking.title || 'Nieuwe boeking',
            contactName: newBooking.contactName || 'Onbekend',
            status: newBooking.status,
          });
          setNewDialogOpen(false);
          setConflictPopup(null);
          toast({ title: 'Boeking toegevoegd (met overlap)', variant: 'default' });
        },
      });
      return;
    }
    addBooking({
      roomName: newBooking.room,
      date: dateStr,
      startHour: newBooking.startHour,
      startMinute: 0,
      endHour: newBooking.endHour,
      endMinute: 0,
      title: newBooking.title || 'Nieuwe boeking',
      contactName: newBooking.contactName || 'Onbekend',
      status: newBooking.status,
    });
    setNewDialogOpen(false);
    toast({ title: 'Boeking toegevoegd', description: `${newBooking.room} — ${newBooking.startHour}:00 tot ${newBooking.endHour}:00` });
  };

  const handleUpdateBooking = (updated: Booking) => {
    // Check conflicts across all bookings for that date
    const dayBookings = bookings.filter((b) => b.date === updated.date);
    const conflicts = dayBookings.filter((b) => b.roomName === updated.roomName && updated.startHour < b.endHour && updated.endHour > b.startHour && b.id !== updated.id);
    if (conflicts.length > 0) {
      setConflictPopup({
        conflicts,
        onProceed: () => {
          updateBooking(updated);
          setDetailBooking(updated);
          setConflictPopup(null);
          toast({ title: 'Boeking bijgewerkt (met overlap)' });
        },
      });
      return;
    }
    updateBooking(updated);
    setDetailBooking(updated);
    toast({ title: 'Boeking bijgewerkt' });
  };

  const handleDeleteBooking = (bookingId: string) => {
    deleteBooking(bookingId);
    setDetailOpen(false);
    toast({ title: 'Boeking verwijderd' });
  };

  // Drag & Drop handlers
  const isDragging = dragBookingId !== null;
  const draggedBooking = isDragging ? bookings.find((b) => b.id === dragBookingId) : null;
  const dragDuration = draggedBooking ? draggedBooking.endHour - draggedBooking.startHour : 0;

  const getDropPreview = useCallback((room: RoomName, hour: number): 'valid' | 'conflict' | null => {
    if (!dragBookingId || !draggedBooking) return null;
    if (dragOverCell?.room !== room || dragOverCell?.hour !== hour) return null;
    const newEnd = Math.min(hour + dragDuration, 25);
    const conflict = checkConflict(room, hour, newEnd, dragBookingId);
    return conflict ? 'conflict' : 'valid';
  }, [dragBookingId, draggedBooking, dragOverCell, dragDuration]);

  const handleDragStart = useCallback((e: DragEvent, bookingId: string) => {
    setDragBookingId(bookingId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', bookingId);
    // Create a subtle drag image
    const el = e.currentTarget as HTMLElement;
    if (el) {
      e.dataTransfer.setDragImage(el, el.offsetWidth / 2, 16);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent, room: RoomName, hour: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCell((prev) => {
      if (prev?.room === room && prev?.hour === hour) return prev;
      return { room, hour };
    });
  }, []);

  const handleDragLeave = useCallback(() => {
    // Small delay to prevent flickering between cells
    setTimeout(() => setDragOverCell(null), 50);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragBookingId(null);
    setDragOverCell(null);
  }, []);

  const handleDrop = useCallback((e: DragEvent, targetRoom: RoomName, targetHour: number) => {
    e.preventDefault();
    setDragOverCell(null);
    const bookingId = e.dataTransfer.getData('text/plain');
    if (!bookingId) return;

    const booking = bookings.find((b) => b.id === bookingId);
    if (!booking) return;

    const duration = booking.endHour - booking.startHour;
    const newEnd = Math.min(targetHour + duration, 25);
    const newStart = targetHour;

    const conflicts = todayBookings.filter((b) => b.roomName === targetRoom && newStart < b.endHour && newEnd > b.startHour && b.id !== bookingId);
    if (conflicts.length > 0) {
      setConflictPopup({
        conflicts,
        onProceed: () => {
          updateBooking({ ...booking, roomName: targetRoom, startHour: newStart, endHour: newEnd });
          setDragBookingId(null);
          setConflictPopup(null);
          toast({ title: 'Boeking verplaatst (met overlap)', description: `${booking.title} → ${targetRoom} ${newStart}:00–${newEnd}:00` });
        },
      });
      setDragBookingId(null);
      return;
    }

    updateBooking({ ...booking, roomName: targetRoom, startHour: newStart, endHour: newEnd });
    setDragBookingId(null);
    toast({ title: 'Boeking verplaatst', description: `${booking.title} → ${targetRoom} ${newStart}:00–${newEnd}:00` });
  }, [bookings, todayBookings, toast]);

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

    // Check conflicts across all dates
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
      setConflictPopup({
        conflicts: allConflicts,
        onProceed: doAdd,
      });
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
            {currentDate.getFullYear()} — {ROOMS.length} ruimtes · Sleep boekingen om te verplaatsen
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={prevPeriod}><ChevronLeft size={16} /></Button>
          <Button variant="outline" size="sm" onClick={goToday}>Vandaag</Button>
          <Button variant="outline" size="sm" onClick={nextPeriod}><ChevronRight size={16} /></Button>

          {/* Day select */}
          <Select
            value={String(currentDate.getDate())}
            onValueChange={(v) => {
              const d = new Date(currentDate);
              d.setDate(Number(v));
              setCurrentDate(d);
            }}
          >
            <SelectTrigger className="h-8 w-16 text-sm font-semibold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate() }, (_, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>{i + 1}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Month select */}
          <Select
            value={String(currentDate.getMonth())}
            onValueChange={(v) => {
              const d = new Date(currentDate);
              d.setMonth(Number(v));
              setCurrentDate(d);
            }}
          >
            <SelectTrigger className="h-8 w-32 text-sm font-semibold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {['Januari','Februari','Maart','April','Mei','Juni','Juli','Augustus','September','Oktober','November','December'].map((m, i) => (
                <SelectItem key={i} value={String(i)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Year select */}
          <Select
            value={String(currentDate.getFullYear())}
            onValueChange={(v) => {
              const d = new Date(currentDate);
              d.setFullYear(Number(v));
              setCurrentDate(d);
            }}
          >
            <SelectTrigger className="h-8 w-24 text-sm font-semibold">
              <SelectValue />
            </SelectTrigger>
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
        /* Day Grid */
        <div className="overflow-x-auto rounded-xl border bg-card card-shadow">
          <table className="w-full min-w-[900px] border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 w-20 border-b border-r bg-muted px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">Tijd</th>
                {ROOMS.map((room) => {
                  const max = getMaxGuests(room);
                  return (
                    <th key={room} className="border-b border-r bg-muted px-2 py-2.5 text-center last:border-r-0 whitespace-nowrap">
                      <div className="text-[11px] font-semibold text-muted-foreground">{getDisplayName(room)}</div>
                      {max !== undefined && max > 0 && (
                        <div className="flex items-center justify-center gap-0.5 mt-0.5 text-[9px] text-muted-foreground/70">
                          <Users size={9} /> max {max}
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {HOURS.map((hour) => (
                <tr key={hour} className="group">
                  <td className="sticky left-0 z-10 border-b border-r bg-card px-3 py-0 text-xs font-medium text-muted-foreground">
                    {String(hour).padStart(2, '0')}:00
                  </td>
                  {ROOMS.map((room) => {
                    const booking = getBookingForCell(room, hour);
                    const isStart = isBookingStart(room, hour);
                    const span = isStart ? getBookingSpan(room, hour) : 0;

                    if (booking && !isStart) return null;

                    if (booking && isStart) {
                      const isBeingDragged = dragBookingId === booking.id;
                      return (
                        <td
                          key={room}
                          rowSpan={span}
                          className={`border-b border-r px-1.5 py-1 last:border-r-0 cursor-grab active:cursor-grabbing transition-all duration-200 ${
                            booking.status === 'confirmed' ? 'booking-confirmed' : 'booking-option'
                          } ${isBeingDragged ? 'opacity-30 scale-95' : ''}`}
                          draggable
                          onDragStart={(e) => handleDragStart(e, booking.id)}
                          onDragEnd={handleDragEnd}
                          onClick={() => !isDragging && handleBookingClick(booking)}
                        >
                          <div className="flex items-start gap-1">
                            <GripVertical size={12} className="mt-0.5 shrink-0 text-current opacity-40" />
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-medium leading-tight truncate">{booking.title}</div>
                              <div className="mt-0.5 text-[10px] opacity-70">{booking.contactName}</div>
                              <div className="mt-0.5 text-[10px] opacity-60">{String(booking.startHour).padStart(2,'0')}:{String(booking.startMinute || 0).padStart(2,'0')}–{String(booking.endHour).padStart(2,'0')}:{String(booking.endMinute || 0).padStart(2,'0')}</div>
                            </div>
                          </div>
                        </td>
                      );
                    }

                    const dropPreview = getDropPreview(room, hour);

                    return (
                      <td
                        key={room}
                        className={`border-b border-r px-1 py-1 last:border-r-0 transition-all duration-150 ${
                          dropPreview === 'valid'
                            ? 'bg-success/15 ring-2 ring-inset ring-success/40'
                            : dropPreview === 'conflict'
                            ? 'bg-destructive/10 ring-2 ring-inset ring-destructive/40'
                            : isDragging
                            ? 'cursor-copy hover:bg-success/10'
                            : 'cursor-pointer hover:bg-accent/5'
                        }`}
                        onClick={() => !isDragging && handleCellClick(room, hour)}
                        onDragOver={(e) => handleDragOver(e, room, hour)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, room, hour)}
                      >
                        <div className="flex h-8 items-center justify-center">
                          {dropPreview === 'valid' ? (
                            <span className="text-[10px] font-medium text-success animate-fade-in">Drop hier</span>
                          ) : dropPreview === 'conflict' ? (
                            <span className="text-[10px] font-medium text-destructive animate-fade-in">Bezet</span>
                          ) : (
                            <Plus size={12} className={`transition-colors duration-150 ${
                              isDragging ? 'text-muted-foreground/20' : 'text-muted-foreground/30 group-hover:text-muted-foreground/60'
                            }`} />
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialogs */}
      <NewBookingDialog
        open={newDialogOpen}
        onOpenChange={setNewDialogOpen}
        form={newBooking}
        onFormChange={setNewBooking}
        onSubmit={handleAddBooking}
        conflictAlert={conflictAlert}
      />
      <BookingDetailDialog
        booking={detailBooking}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onUpdate={handleUpdateBooking}
        onDelete={handleDeleteBooking}
        getRoomDisplayName={getDisplayName}
      />
      <RoomSettingsDialog
        open={roomSettingsOpen}
        onOpenChange={setRoomSettingsOpen}
        settings={roomSettings}
        displayNames={displayNames}
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
        onProceed={conflictPopup?.onProceed || (() => {})}
        getRoomDisplayName={getDisplayName}
      />
    </div>
  );
}
