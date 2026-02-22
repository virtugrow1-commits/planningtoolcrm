import { useState } from 'react';
import { Booking } from '@/types/crm';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { X, Plus, Copy } from 'lucide-react';

interface CopyBookingDialogProps {
  booking: Booking | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCopy: (booking: Booking, dates: string[]) => Promise<void>;
  getRoomDisplayName?: (room: string) => string;
}

export default function CopyBookingDialog({ booking, open, onOpenChange, onCopy, getRoomDisplayName }: CopyBookingDialogProps) {
  const [dates, setDates] = useState<string[]>([]);
  const [currentDate, setCurrentDate] = useState('');
  const [copying, setCopying] = useState(false);

  if (!booking) return null;

  const addDate = () => {
    if (currentDate && !dates.includes(currentDate)) {
      setDates([...dates, currentDate].sort());
      setCurrentDate('');
    }
  };

  const removeDate = (date: string) => {
    setDates(dates.filter((d) => d !== date));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addDate();
    }
  };

  const handleCopy = async () => {
    if (dates.length === 0 || !booking) return;
    setCopying(true);
    try {
      await onCopy(booking, dates);
      setDates([]);
      onOpenChange(false);
    } finally {
      setCopying(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatTime = (h: number, m?: number) =>
    `${String(h).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;

  const displayRoom = (room: string) => getRoomDisplayName ? getRoomDisplayName(room) : room;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setDates([]); setCurrentDate(''); } onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy size={18} />
            Reservering kopiëren
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Source booking info */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-1 text-sm">
            <p className="font-medium">{booking.title}</p>
            <p className="text-muted-foreground">{displayRoom(booking.roomName)}</p>
            <p className="text-muted-foreground">
              {formatTime(booking.startHour, booking.startMinute)} – {formatTime(booking.endHour, booking.endMinute)}
            </p>
            <p className="text-muted-foreground">{booking.contactName}</p>
          </div>

          {/* Add dates */}
          <div className="grid gap-1.5">
            <Label>Datums toevoegen</Label>
            <div className="flex gap-2">
              <Input
                type="date"
                value={currentDate}
                onChange={(e) => setCurrentDate(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1"
              />
              <Button variant="outline" size="icon" onClick={addDate} disabled={!currentDate}>
                <Plus size={16} />
              </Button>
            </div>
          </div>

          {/* Selected dates */}
          {dates.length > 0 && (
            <div className="grid gap-1.5">
              <Label>Geselecteerde datums ({dates.length})</Label>
              <div className="flex flex-wrap gap-2">
                {dates.map((date) => (
                  <Badge key={date} variant="secondary" className="gap-1 pr-1">
                    {formatDate(date)}
                    <button
                      onClick={() => removeDate(date)}
                      className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20 transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuleren</Button>
          <Button onClick={handleCopy} disabled={dates.length === 0 || copying}>
            <Copy size={14} className="mr-1.5" />
            {copying ? 'Kopiëren...' : `Kopiëren naar ${dates.length} datum${dates.length !== 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
