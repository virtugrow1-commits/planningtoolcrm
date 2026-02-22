import { Booking } from '@/types/crm';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { AlertTriangle, CalendarDays, Clock, MapPin, User } from 'lucide-react';

interface ConflictAlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conflicts: Booking[];
  getRoomDisplayName?: (room: string) => string;
}

const STATUS_LABELS: Record<string, string> = {
  confirmed: 'Bevestigd',
  option: 'In Optie',
};

export default function ConflictAlertDialog({
  open,
  onOpenChange,
  conflicts,
  getRoomDisplayName,
}: ConflictAlertDialogProps) {
  const formatTime = (h: number, m?: number) =>
    `${String(h).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;

  const displayRoom = (room: string) =>
    getRoomDisplayName ? getRoomDisplayName(room) : room;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle size={20} />
            Dubbele boeking gedetecteerd
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Er {conflicts.length === 1 ? 'is al een boeking' : `zijn al ${conflicts.length} boekingen`} op dit tijdslot. Dubbele boekingen zijn niet toegestaan.
              </p>
              <div className="space-y-2">
                {conflicts.map((b) => (
                  <div
                    key={b.id}
                    className={`rounded-lg border p-3 space-y-1 ${
                      b.status === 'confirmed'
                        ? 'border-success/50 bg-success/5'
                        : 'border-warning/50 bg-warning/5'
                    }`}
                  >
                    <p className="text-sm font-semibold text-foreground">{b.title}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <MapPin size={12} /> {displayRoom(b.roomName)}
                      </span>
                      <span className="flex items-center gap-1">
                        <CalendarDays size={12} /> {b.date}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={12} /> {formatTime(b.startHour, b.startMinute)} – {formatTime(b.endHour, b.endMinute)}
                      </span>
                      <span className="flex items-center gap-1">
                        <User size={12} /> {b.contactName}
                      </span>
                    </div>
                    <span
                      className={`inline-block mt-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        b.status === 'confirmed'
                          ? 'bg-success/20 text-success'
                          : 'bg-warning/20 text-warning'
                      }`}
                    >
                      {STATUS_LABELS[b.status] || b.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Begrepen</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
