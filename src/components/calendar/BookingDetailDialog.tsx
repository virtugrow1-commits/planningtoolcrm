import { useState, useEffect } from 'react';
import { Booking } from '@/types/crm';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarDays, Clock, User, MapPin, Pencil } from 'lucide-react';

const HOURS = Array.from({ length: 19 }, (_, i) => (i + 7) % 24); // 7..1

interface BookingDetailDialogProps {
  booking: Booking | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (booking: Booking) => void;
  onDelete: (bookingId: string) => void;
}

export default function BookingDetailDialog({ booking, open, onOpenChange, onUpdate, onDelete }: BookingDetailDialogProps) {
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

  const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
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
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Van</Label>
                <Select value={String(form.startHour)} onValueChange={(v) => setForm({ ...form, startHour: Number(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{HOURS.map((h) => <SelectItem key={h} value={String(h)}>{hourLabel(h)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Tot</Label>
                <Select value={String(form.endHour)} onValueChange={(v) => setForm({ ...form, endHour: Number(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{HOURS.filter((h) => h > form.startHour || (form.startHour >= 7 && h <= 1 && h !== 0 ? false : h > form.startHour)).map((h) => <SelectItem key={h} value={String(h)}>{hourLabel(h)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
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
            <div className="grid gap-1.5">
              <Label>Notities</Label>
              <Textarea value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Eventuele opmerkingen..." />
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <MapPin size={14} className="text-muted-foreground" />
                <span className="font-medium">{booking.roomName}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <CalendarDays size={14} className="text-muted-foreground" />
                <span>{booking.date}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock size={14} className="text-muted-foreground" />
                <span>{hourLabel(booking.startHour)} – {hourLabel(booking.endHour)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <User size={14} className="text-muted-foreground" />
                <span>{booking.contactName}</span>
              </div>
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
                <Label>Notities</Label>
                <p className="text-sm text-muted-foreground">{booking.notes}</p>
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
