import { useState, useEffect } from 'react';
import { ROOMS } from '@/types/crm';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

interface RoomSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: Record<string, number>;
  onSave: (roomName: string, maxGuests: number) => Promise<any>;
}

export default function RoomSettingsDialog({ open, onOpenChange, settings, onSave }: RoomSettingsDialogProps) {
  const [localSettings, setLocalSettings] = useState<Record<string, string>>({});
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      const map: Record<string, string> = {};
      ROOMS.forEach((room) => { map[room] = String(settings[room] ?? ''); });
      setLocalSettings(map);
    }
  }, [open, settings]);

  const handleSave = async () => {
    for (const room of ROOMS) {
      const val = parseInt(localSettings[room] || '0', 10);
      if (val !== (settings[room] ?? 0)) {
        await onSave(room, val);
      }
    }
    toast({ title: 'Ruimte-instellingen opgeslagen' });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Max. gasten per ruimte</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          {ROOMS.map((room) => (
            <div key={room} className="flex items-center justify-between gap-3">
              <Label className="text-sm flex-1 min-w-0 truncate">{room}</Label>
              <Input
                type="number"
                min={0}
                className="w-24 h-8 text-sm"
                placeholder="0"
                value={localSettings[room] ?? ''}
                onChange={(e) => setLocalSettings((prev) => ({ ...prev, [room]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuleren</Button>
          <Button onClick={handleSave}>Opslaan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
