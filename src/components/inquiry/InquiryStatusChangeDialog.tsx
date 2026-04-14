import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Inquiry } from '@/types/crm';
import { PIPELINE_COLUMNS } from '@/components/inquiry/InquiryDetailsTab';

interface InquiryStatusChangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentStatus: Inquiry['status'];
  onConfirm: (newStatus: Inquiry['status'], reason: string) => void;
}

export default function InquiryStatusChangeDialog({ open, onOpenChange, currentStatus, onConfirm }: InquiryStatusChangeDialogProps) {
  const [newStatus, setNewStatus] = useState<Inquiry['status'] | ''>('');
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
          <DialogTitle>Stadium wijzigen</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid gap-1.5">
            <Label>Nieuw stadium <span className="text-destructive">*</span></Label>
            <Select value={newStatus} onValueChange={(v) => setNewStatus(v as Inquiry['status'])}>
              <SelectTrigger>
                <SelectValue placeholder="Selecteer stadium..." />
              </SelectTrigger>
              <SelectContent>
                {PIPELINE_COLUMNS.filter(c => c.key !== currentStatus).map(c => (
                  <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Reden / toelichting <span className="text-destructive">*</span></Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Geef een reden op waarom het stadium wordt gewijzigd..."
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
