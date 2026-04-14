import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Booking } from '@/types/crm';

interface OptionStatusChangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (newStatus: Booking['status'], reason: string) => void;
}

export default function OptionStatusChangeDialog({ open, onOpenChange, onConfirm }: OptionStatusChangeDialogProps) {
  const [newStatus, setNewStatus] = useState<Booking['status'] | ''>('');
  const [reason, setReason] = useState('');

  const handleConfirm = () => {
    if (!newStatus || !reason.trim()) return;
    onConfirm(newStatus, reason.trim());
    setNewStatus('');
    setReason('');
  };

  const handleClose = (v: boolean) => {
    if (!v) {
      setNewStatus('');
      setReason('');
    }
    onOpenChange(v);
  };

  const isValid = !!newStatus && reason.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Optie wijzigen</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid gap-1.5">
            <Label>Nieuw stadium <span className="text-destructive">*</span></Label>
            <Select value={newStatus} onValueChange={(v) => setNewStatus(v as Booking['status'])}>
              <SelectTrigger>
                <SelectValue placeholder="Selecteer stadium..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="confirmed">Bevestigd</SelectItem>
                <SelectItem value="expired">Vervallen</SelectItem>
                <SelectItem value="cancelled">Geannuleerd</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Reden / toelichting <span className="text-destructive">*</span></Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Geef een reden op waarom de optie wordt gewijzigd..."
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>Annuleren</Button>
          <Button onClick={handleConfirm} disabled={!isValid}>Bevestigen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
