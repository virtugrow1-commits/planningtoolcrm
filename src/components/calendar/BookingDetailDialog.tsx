import { useState, useEffect } from 'react';
import { Booking, ROOMS, RoomName } from '@/types/crm';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarDays, Clock, User, MapPin, Pencil, Users } from 'lucide-react';

interface BookingDetailDialogProps {
  booking: Booking | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (booking: Booking) => void;
  onDelete: (bookingId: string) => void;
  getRoomDisplayName?: (room: string) => string;
}

export default function BookingDetailDialog({ booking, open, onOpenChange, onUpdate, onDelete, getRoomDisplayName }: BookingDetailDialogProps) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Booking | null>(null);

  useEffect(() => {
    if (booking) {
      setForm({ ...booking });
      setEditing(false);
    }
  }, [booking]);

  if (!booking || !form) return null;

  const handleSave = () => {
    onUpdate(form);
    setEditing(false);
  };

  const formatTime = (h: number, m?: number) =>
    `${String(h).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;

  const displayRoom = (room: string) => getRoomDisplayName ? getRoomDisplayName(room) : room;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Reserveringsdetails</DialogTitle>
            {!editing && (
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                <Pencil size={14} className="mr-1" /> Bewerken
              </Button>
            )}
          </div>
        </DialogHeader>

        {editing ? (
          <div className="space-y-4 py-2">
            <div className="grid gap-1.5">
              <Label>Titel</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Contactpersoon</Label>
              <Input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
            </div>

            {/* Room selection */}
            <div className="grid gap-1.5">
              <Label>Ruimte</Label>
              <Select value={form.roomName} onValueChange={(v) => setForm({ ...form, roomName: v as RoomName })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROOMS.map((r) => (
                    <SelectItem key={r} value={r}>{displayRoom(r)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date */}
            <div className="grid gap-1.5">
              <Label>Datum</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>

            {/* Free time input */}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Van</Label>
                <Input
                  type="time"
                  value={formatTime(form.startHour, form.startMinute)}
                  onChange={(e) => {
                    const [h, m] = e.target.value.split(':').map(Number);
                    if (!isNaN(h)) setForm({ ...form, startHour: h, startMinute: m || 0 });
                  }}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Tot</Label>
                <Input
                  type="time"
                  value={formatTime(form.endHour, form.endMinute)}
                  onChange={(e) => {
                    const [h, m] = e.target.value.split(':').map(Number);
                    if (!isNaN(h)) setForm({ ...form, endHour: h, endMinute: m || 0 });
                  }}
                />
              </div>
            </div>

            {/* Guest count */}
            <div className="grid gap-1.5">
              <Label>Aantal gasten</Label>
              <Input
                type="number"
                min={0}
                placeholder="0"
                value={(form as any).guestCount || ''}
                onChange={(e) => setForm({ ...form, guestCount: Math.max(0, Number(e.target.value)) } as any)}
              />
            </div>

            {/* Status */}
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v: 'confirmed' | 'option') => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="confirmed">Bevestigd</SelectItem>
                  <SelectItem value="option">In Optie</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Notes / Toelichting */}
            <div className="grid gap-1.5">
              <Label>Toelichting</Label>
              <Textarea
                value={form.notes || ''}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Eventuele opmerkingen, wensen, bijzonderheden..."
                rows={4}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <MapPin size={14} className="text-muted-foreground" />
                <span className="font-medium">{displayRoom(booking.roomName)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <CalendarDays size={14} className="text-muted-foreground" />
                <span>{booking.date}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock size={14} className="text-muted-foreground" />
                <span>{formatTime(booking.startHour, booking.startMinute)} – {formatTime(booking.endHour, booking.endMinute)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <User size={14} className="text-muted-foreground" />
                <span>{booking.contactName}</span>
              </div>
              {(booking as any).guestCount > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <Users size={14} className="text-muted-foreground" />
                  <span>{(booking as any).guestCount} gasten</span>
                </div>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label>Titel</Label>
              <p className="text-sm font-medium">{booking.title}</p>
            </div>
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <p className={`text-sm font-medium ${booking.status === 'confirmed' ? 'text-success' : 'text-warning'}`}>
                {booking.status === 'confirmed' ? 'Bevestigd' : 'In Optie'}
              </p>
            </div>
            {booking.notes && (
              <div className="grid gap-1.5">
                <Label>Toelichting</Label>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{booking.notes}</p>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="destructive" size="sm" onClick={() => onDelete(booking.id)}>
            Verwijderen
          </Button>
          {editing ? (
            <>
              <Button variant="outline" onClick={() => setEditing(false)}>Annuleren</Button>
              <Button onClick={handleSave}>Opslaan</Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)}>Sluiten</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
