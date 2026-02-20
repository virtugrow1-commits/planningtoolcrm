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
  displayNames: Record<string, string>;
  onSave: (roomName: string, maxGuests: number, displayName?: string) => Promise<any>;
}

export default function RoomSettingsDialog({ open, onOpenChange, settings, displayNames, onSave }: RoomSettingsDialogProps) {
  const [localSettings, setLocalSettings] = useState<Record<string, { maxGuests: string; displayName: string }>>({});
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      const map: Record<string, { maxGuests: string; displayName: string }> = {};
      ROOMS.forEach((room) => {
        map[room] = {
          maxGuests: String(settings[room] ?? ''),
          displayName: displayNames[room] ?? '',
        };
      });
      setLocalSettings(map);
    }
  }, [open, settings, displayNames]);

  const handleSave = async () => {
    for (const room of ROOMS) {
      const val = parseInt(localSettings[room]?.maxGuests || '0', 10);
      const name = localSettings[room]?.displayName?.trim() || undefined;
      const currentMax = settings[room] ?? 0;
      const currentName = displayNames[room] || undefined;
      if (val !== currentMax || name !== currentName) {
        await onSave(room, val, name);
      }
    }
    toast({ title: 'Ruimte-instellingen opgeslagen' });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Ruimte-instellingen</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid grid-cols-[1fr_140px_80px] gap-2 text-xs font-semibold text-muted-foreground px-1">
            <span>Standaard naam</span>
            <span>Weergavenaam</span>
            <span>Max gasten</span>
          </div>
          {ROOMS.map((room) => (
            <div key={room} className="grid grid-cols-[1fr_140px_80px] items-center gap-2">
              <Label className="text-sm min-w-0 truncate">{room}</Label>
              <Input
                className="h-8 text-sm"
                placeholder={room}
                value={localSettings[room]?.displayName ?? ''}
                onChange={(e) => setLocalSettings((prev) => ({
                  ...prev,
                  [room]: { ...prev[room], displayName: e.target.value },
                }))}
              />
              <Input
                type="number"
                min={0}
                className="w-full h-8 text-sm"
                placeholder="0"
                value={localSettings[room]?.maxGuests ?? ''}
                onChange={(e) => setLocalSettings((prev) => ({
                  ...prev,
                  [room]: { ...prev[room], maxGuests: e.target.value },
                }))}
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
