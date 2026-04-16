import { Booking, RoomName } from '@/types/crm';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle } from 'lucide-react';

interface NewBookingForm {
  room: RoomName;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  title: string;
  contactName: string;
  status: 'confirmed' | 'option';
}

interface NewBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: NewBookingForm;
  onFormChange: (form: NewBookingForm) => void;
  onSubmit: () => void;
  conflictAlert: string | null;
}

export default function NewBookingDialog({ open, onOpenChange, form, onFormChange, onSubmit, conflictAlert }: NewBookingDialogProps) {
  const startTime = `${String(form.startHour).padStart(2, '0')}:${String(form.startMinute ?? 0).padStart(2, '0')}`;
  const endTime = `${String(form.endHour).padStart(2, '0')}:${String(form.endMinute ?? 0).padStart(2, '0')}`;

  const handleStartChange = (val: string) => {
    const [h, m] = val.split(':').map(Number);
    onFormChange({ ...form, startHour: h, startMinute: m });
  };

  const handleEndChange = (val: string) => {
    const [h, m] = val.split(':').map(Number);
    onFormChange({ ...form, endHour: h, endMinute: m });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nieuwe Boeking — {form.room}</DialogTitle>
        </DialogHeader>
        {conflictAlert && (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle size={16} /> {conflictAlert}
          </div>
        )}
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label>Titel</Label>
            <Input placeholder="Naam evenement" value={form.title} onChange={(e) => onFormChange({ ...form, title: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label>Contactpersoon</Label>
            <Input placeholder="Naam" value={form.contactName} onChange={(e) => onFormChange({ ...form, contactName: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Van</Label>
              <Input type="time" value={startTime} onChange={(e) => handleStartChange(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Tot</Label>
              <Input type="time" value={endTime} onChange={(e) => handleEndChange(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v: 'confirmed' | 'option') => onFormChange({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="confirmed">Bevestigd</SelectItem>
                <SelectItem value="option">In Optie</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuleren</Button>
          <Button onClick={onSubmit}>Toevoegen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
