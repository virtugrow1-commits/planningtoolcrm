import { useState, useMemo, useCallback, DragEvent } from 'react';
import { ROOMS, Booking, RoomName } from '@/types/crm';
import { mockBookings } from '@/data/mockData';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import BookingDetailDialog from '@/components/calendar/BookingDetailDialog';
import NewBookingDialog from '@/components/calendar/NewBookingDialog';

const HOURS = Array.from({ length: 15 }, (_, i) => i + 8);

function formatDate(date: Date) {
  return date.toISOString().split('T')[0];
}

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [bookings, setBookings] = useState<Booking[]>(mockBookings);
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [newBooking, setNewBooking] = useState({ room: '' as RoomName, startHour: 9, endHour: 12, title: '', contactName: '', status: 'confirmed' as 'confirmed' | 'option' });
  const [conflictAlert, setConflictAlert] = useState<string | null>(null);
  const [detailBooking, setDetailBooking] = useState<Booking | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [dragBookingId, setDragBookingId] = useState<string | null>(null);
  const { toast } = useToast();

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
    setNewBooking({ room, startHour: hour, endHour: Math.min(hour + 2, 22), title: '', contactName: '', status: 'confirmed' });
    setConflictAlert(null);
    setNewDialogOpen(true);
  };

  const handleBookingClick = (booking: Booking) => {
    setDetailBooking(booking);
    setDetailOpen(true);
  };

  const handleAddBooking = () => {
    const conflict = checkConflict(newBooking.room, newBooking.startHour, newBooking.endHour);
    if (conflict) {
      setConflictAlert(`Conflict: "${conflict.title}" is al geboekt van ${conflict.startHour}:00 tot ${conflict.endHour}:00`);
      toast({ title: '⚠️ Boeking Conflict', description: `${newBooking.room} is al bezet in dit tijdslot.`, variant: 'destructive' });
      return;
    }
    const booking: Booking = {
      id: `b-${Date.now()}`,
      roomName: newBooking.room,
      date: dateStr,
      startHour: newBooking.startHour,
      endHour: newBooking.endHour,
      title: newBooking.title || 'Nieuwe boeking',
      contactName: newBooking.contactName || 'Onbekend',
      status: newBooking.status,
    };
    setBookings((prev) => [...prev, booking]);
    setNewDialogOpen(false);
    toast({ title: 'Boeking toegevoegd', description: `${booking.roomName} — ${booking.startHour}:00 tot ${booking.endHour}:00` });
  };

  const handleStatusChange = (bookingId: string, status: 'confirmed' | 'option') => {
    setBookings((prev) => prev.map((b) => b.id === bookingId ? { ...b, status } : b));
    setDetailBooking((prev) => prev && prev.id === bookingId ? { ...prev, status } : prev);
    toast({ title: 'Status gewijzigd', description: status === 'confirmed' ? 'Bevestigd' : 'In Optie' });
  };

  const handleDeleteBooking = (bookingId: string) => {
    setBookings((prev) => prev.filter((b) => b.id !== bookingId));
    setDetailOpen(false);
    toast({ title: 'Boeking verwijderd' });
  };

  // Drag & Drop handlers
  const handleDragStart = useCallback((e: DragEvent, bookingId: string) => {
    setDragBookingId(bookingId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', bookingId);
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback((e: DragEvent, targetRoom: RoomName, targetHour: number) => {
    e.preventDefault();
    const bookingId = e.dataTransfer.getData('text/plain');
    if (!bookingId) return;

    const booking = bookings.find((b) => b.id === bookingId);
    if (!booking) return;

    const duration = booking.endHour - booking.startHour;
    const newEnd = Math.min(targetHour + duration, 22);
    const newStart = targetHour;

    const conflict = checkConflict(targetRoom, newStart, newEnd, bookingId);
    if (conflict) {
      toast({ title: '⚠️ Conflict', description: `${targetRoom} is bezet van ${conflict.startHour}:00 tot ${conflict.endHour}:00`, variant: 'destructive' });
      setDragBookingId(null);
      return;
    }

    setBookings((prev) => prev.map((b) =>
      b.id === bookingId ? { ...b, roomName: targetRoom, startHour: newStart, endHour: newEnd } : b
    ));
    setDragBookingId(null);
    toast({ title: 'Boeking verplaatst', description: `${booking.title} → ${targetRoom} ${newStart}:00–${newEnd}:00` });
  }, [bookings, toast]);

  const prevDay = () => setCurrentDate((d) => { const n = new Date(d); n.setDate(n.getDate() - 1); return n; });
  const nextDay = () => setCurrentDate((d) => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; });
  const goToday = () => setCurrentDate(new Date());

  return (
    <div className="p-6 lg:p-8 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Kalender</h1>
          <p className="text-sm text-muted-foreground">Dagweergave — {ROOMS.length} ruimtes · Sleep boekingen om te verplaatsen</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={prevDay}><ChevronLeft size={16} /></Button>
          <Button variant="outline" size="sm" onClick={goToday}>Vandaag</Button>
          <Button variant="outline" size="sm" onClick={nextDay}><ChevronRight size={16} /></Button>
          <span className="ml-2 text-sm font-semibold text-foreground">
            {currentDate.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm bg-success" /> Bevestigd</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm bg-warning" /> In Optie</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm bg-muted" /> Beschikbaar</span>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto rounded-xl border bg-card card-shadow">
        <table className="w-full min-w-[900px] border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-20 border-b border-r bg-muted px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">Tijd</th>
              {ROOMS.map((room) => (
                <th key={room} className="border-b border-r bg-muted px-2 py-2.5 text-center text-[11px] font-semibold text-muted-foreground last:border-r-0 whitespace-nowrap">
                  {room}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HOURS.map((hour) => (
              <tr key={hour} className="group">
                <td className="sticky left-0 z-10 border-b border-r bg-card px-3 py-0 text-xs font-medium text-muted-foreground">
                  {hour}:00
                </td>
                {ROOMS.map((room) => {
                  const booking = getBookingForCell(room, hour);
                  const isStart = isBookingStart(room, hour);
                  const span = isStart ? getBookingSpan(room, hour) : 0;

                  if (booking && !isStart) return null;

                  if (booking && isStart) {
                    return (
                      <td
                        key={room}
                        rowSpan={span}
                        className={`border-b border-r px-1.5 py-1 last:border-r-0 cursor-grab active:cursor-grabbing ${booking.status === 'confirmed' ? 'booking-confirmed' : 'booking-option'}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, booking.id)}
                        onClick={() => handleBookingClick(booking)}
                      >
                        <div className="text-xs font-medium leading-tight">{booking.title}</div>
                        <div className="mt-0.5 text-[10px] opacity-70">{booking.contactName}</div>
                        <div className="mt-0.5 text-[10px] opacity-60">{booking.startHour}:00–{booking.endHour}:00</div>
                      </td>
                    );
                  }

                  return (
                    <td
                      key={room}
                      className="border-b border-r px-1 py-1 last:border-r-0 cursor-pointer transition-colors hover:bg-accent/5"
                      onClick={() => handleCellClick(room, hour)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, room, hour)}
                    >
                      <div className="flex h-8 items-center justify-center">
                        <Plus size={12} className="text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors" />
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
        onStatusChange={handleStatusChange}
        onDelete={handleDeleteBooking}
      />
    </div>
  );
}
