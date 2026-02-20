import { Booking } from '@/types/crm';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarDays, Clock, User, MapPin } from 'lucide-react';

interface BookingDetailDialogProps {
  booking: Booking | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatusChange: (bookingId: string, status: 'confirmed' | 'option') => void;
  onDelete: (bookingId: string) => void;
}

export default function BookingDetailDialog({ booking, open, onOpenChange, onStatusChange, onDelete }: BookingDetailDialogProps) {
  if (!booking) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reserveringsdetails</DialogTitle>
        </DialogHeader>
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
              <span>{booking.startHour}:00 – {booking.endHour}:00</span>
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
            <Select
              value={booking.status}
              onValueChange={(v: 'confirmed' | 'option') => onStatusChange(booking.id, v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="confirmed">Bevestigd</SelectItem>
                <SelectItem value="option">In Optie</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {booking.notes && (
            <div className="grid gap-1.5">
              <Label>Notities</Label>
              <p className="text-sm text-muted-foreground">{booking.notes}</p>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="destructive" size="sm" onClick={() => onDelete(booking.id)}>
            Verwijderen
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Sluiten
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
