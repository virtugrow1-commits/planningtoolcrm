import { useState, useMemo } from 'react';
import { ROOMS, Booking, RoomName } from '@/types/crm';
import { mockBookings } from '@/data/mockData';
import { ChevronLeft, ChevronRight, Plus, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

const HOURS = Array.from({ length: 15 }, (_, i) => i + 8); // 8:00 - 22:00

function formatDate(date: Date) {
  return date.toISOString().split('T')[0];
}

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [bookings, setBookings] = useState<Booking[]>(mockBookings);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newBooking, setNewBooking] = useState({ room: '' as RoomName, startHour: 9, endHour: 12, title: '', contactName: '', status: 'confirmed' as 'confirmed' | 'option' });
  const [conflictAlert, setConflictAlert] = useState<string | null>(null);
  const { toast } = useToast();

  const dateStr = formatDate(currentDate);
  const todayBookings = useMemo(() => bookings.filter((b) => b.date === dateStr), [bookings, dateStr]);

  const getBookingForCell = (room: RoomName, hour: number): Booking | undefined => {
    return todayBookings.find((b) => b.roomName === room && hour >= b.startHour && hour < b.endHour);
  };

  const isBookingStart = (room: RoomName, hour: number): boolean => {
    return todayBookings.some((b) => b.roomName === room && b.startHour === hour);
  };

  const getBookingSpan = (room: RoomName, hour: number): number => {
    const b = todayBookings.find((b) => b.roomName === room && b.startHour === hour);
    return b ? b.endHour - b.startHour : 1;
  };

  const checkConflict = (room: RoomName, start: number, end: number): Booking | undefined => {
    return todayBookings.find(
      (b) => b.roomName === room && start < b.endHour && end > b.startHour
    );
  };

  const handleCellClick = (room: RoomName, hour: number) => {
    const existing = getBookingForCell(room, hour);
    if (existing) return;
    setNewBooking({ room, startHour: hour, endHour: Math.min(hour + 2, 22), title: '', contactName: '', status: 'confirmed' });
    setConflictAlert(null);
    setDialogOpen(true);
  };

  const handleAddBooking = () => {
    const conflict = checkConflict(newBooking.room, newBooking.startHour, newBooking.endHour);
    if (conflict) {
      setConflictAlert(`Conflict: "${conflict.title}" is al geboekt van ${conflict.startHour}:00 tot ${conflict.endHour}:00`);
      toast({
        title: '⚠️ Boeking Conflict',
        description: `${newBooking.room} is al bezet in dit tijdslot.`,
        variant: 'destructive',
      });
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
    setDialogOpen(false);
    toast({ title: 'Boeking toegevoegd', description: `${booking.roomName} — ${booking.startHour}:00 tot ${booking.endHour}:00` });
  };

  const prevDay = () => setCurrentDate((d) => { const n = new Date(d); n.setDate(n.getDate() - 1); return n; });
  const nextDay = () => setCurrentDate((d) => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; });
  const goToday = () => setCurrentDate(new Date());

  return (
    <div className="p-6 lg:p-8 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Kalender</h1>
          <p className="text-sm text-muted-foreground">Dagweergave — 9 ruimtes</p>
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
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm bg-warning" /> Optie / Hold</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm bg-muted" /> Beschikbaar</span>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto rounded-xl border bg-card card-shadow">
        <table className="w-full min-w-[900px] border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-20 border-b border-r bg-muted px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">Tijd</th>
              {ROOMS.map((room) => (
                <th key={room} className="border-b border-r bg-muted px-2 py-2.5 text-center text-xs font-semibold text-muted-foreground last:border-r-0">
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

                  // If part of a booking but not the start, skip rendering (handled by rowSpan)
                  if (booking && !isStart) return null;

                  if (booking && isStart) {
                    return (
                      <td
                        key={room}
                        rowSpan={span}
                        className={`border-b border-r px-1.5 py-1 last:border-r-0 ${booking.status === 'confirmed' ? 'booking-confirmed' : 'booking-option'}`}
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

      {/* Booking Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nieuwe Boeking — {newBooking.room}</DialogTitle>
          </DialogHeader>
          {conflictAlert && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle size={16} /> {conflictAlert}
            </div>
          )}
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label>Titel</Label>
              <Input placeholder="Naam evenement" value={newBooking.title} onChange={(e) => setNewBooking((p) => ({ ...p, title: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <Label>Contactpersoon</Label>
              <Input placeholder="Naam" value={newBooking.contactName} onChange={(e) => setNewBooking((p) => ({ ...p, contactName: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Van</Label>
                <Select value={String(newBooking.startHour)} onValueChange={(v) => setNewBooking((p) => ({ ...p, startHour: Number(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{HOURS.map((h) => <SelectItem key={h} value={String(h)}>{h}:00</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Tot</Label>
                <Select value={String(newBooking.endHour)} onValueChange={(v) => setNewBooking((p) => ({ ...p, endHour: Number(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{HOURS.filter((h) => h > newBooking.startHour).map((h) => <SelectItem key={h} value={String(h)}>{h}:00</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Select value={newBooking.status} onValueChange={(v: 'confirmed' | 'option') => setNewBooking((p) => ({ ...p, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="confirmed">Bevestigd</SelectItem>
                  <SelectItem value="option">Optie / Hold</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuleren</Button>
            <Button onClick={handleAddBooking}>Toevoegen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
