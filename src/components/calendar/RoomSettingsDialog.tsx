import { useState, useEffect } from 'react';
import { ROOMS } from '@/types/crm';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2 } from 'lucide-react';

interface RoomSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: Record<string, number>;
  displayNames: Record<string, string>;
  ghlCalendarIds?: Record<string, string>;
  enabledRooms?: Record<string, boolean>;
  onSave: (roomName: string, maxGuests: number, displayName?: string, ghlCalendarId?: string, enabled?: boolean) => Promise<any>;
}

export default function RoomSettingsDialog({ open, onOpenChange, settings, displayNames, ghlCalendarIds = {}, enabledRooms = {}, onSave }: RoomSettingsDialogProps) {
  const [localSettings, setLocalSettings] = useState<Record<string, { maxGuests: string; displayName: string; ghlCalendarId: string; enabled: boolean }>>({});
  const [customRooms, setCustomRooms] = useState<string[]>([]);
  const [newRoomName, setNewRoomName] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      const map: Record<string, { maxGuests: string; displayName: string; ghlCalendarId: string; enabled: boolean }> = {};
      ROOMS.forEach((room) => {
        map[room] = {
          maxGuests: String(settings[room] ?? ''),
          displayName: displayNames[room] ?? '',
          ghlCalendarId: ghlCalendarIds[room] ?? '',
          enabled: enabledRooms[room] !== false,
        };
      });
      const extraRooms: string[] = [];
      Object.keys(settings).forEach((room) => {
        if (!(ROOMS as readonly string[]).includes(room)) {
          map[room] = {
            maxGuests: String(settings[room] ?? ''),
            displayName: displayNames[room] ?? '',
            ghlCalendarId: ghlCalendarIds[room] ?? '',
            enabled: enabledRooms[room] !== false,
          };
          extraRooms.push(room);
        }
      });
      Object.keys(displayNames).forEach((room) => {
        if (!(ROOMS as readonly string[]).includes(room) && !map[room]) {
          map[room] = {
            maxGuests: String(settings[room] ?? ''),
            displayName: displayNames[room] ?? '',
            ghlCalendarId: ghlCalendarIds[room] ?? '',
            enabled: enabledRooms[room] !== false,
          };
          extraRooms.push(room);
        }
      });
      setLocalSettings(map);
      setCustomRooms(extraRooms);
      setNewRoomName('');
    }
  }, [open, settings, displayNames, ghlCalendarIds, enabledRooms]);

  const allRooms = [...ROOMS, ...customRooms.filter((r) => !(ROOMS as readonly string[]).includes(r))];

  const handleAddRoom = () => {
    const name = newRoomName.trim();
    if (!name) return;
    if (allRooms.includes(name as any)) {
      toast({ title: 'Ruimte bestaat al', variant: 'destructive' });
      return;
    }
    setCustomRooms((prev) => [...prev, name]);
    setLocalSettings((prev) => ({
      ...prev,
      [name]: { maxGuests: '', displayName: '', ghlCalendarId: '', enabled: true },
    }));
    setNewRoomName('');
  };

  const handleRemoveRoom = (room: string) => {
    setCustomRooms((prev) => prev.filter((r) => r !== room));
    setLocalSettings((prev) => {
      const next = { ...prev };
      delete next[room];
      return next;
    });
  };

  const handleSave = async () => {
    for (const room of allRooms) {
      const val = parseInt(localSettings[room]?.maxGuests || '0', 10);
      const name = localSettings[room]?.displayName?.trim() || undefined;
      const calId = localSettings[room]?.ghlCalendarId?.trim() || undefined;
      const enabled = localSettings[room]?.enabled ?? true;
      const currentMax = settings[room] ?? 0;
      const currentName = displayNames[room] || undefined;
      const currentCalId = ghlCalendarIds[room] || undefined;
      const currentEnabled = enabledRooms[room] !== false;
      if (val !== currentMax || name !== currentName || calId !== currentCalId || enabled !== currentEnabled || customRooms.includes(room)) {
        await onSave(room, val, name, calId, enabled);
      }
    }
    toast({ title: 'Ruimte-instellingen opgeslagen' });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ruimte-instellingen</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid grid-cols-[40px_1fr_120px_70px_160px_32px] gap-2 text-xs font-semibold text-muted-foreground px-1">
            <span>Aan</span>
            <span>Standaard naam</span>
            <span>Weergavenaam</span>
            <span>Max</span>
            <span>VGW Kalender ID</span>
            <span></span>
          </div>
          {allRooms.map((room) => {
            const isCustom = !(ROOMS as readonly string[]).includes(room as any);
            return (
              <div key={room} className="grid grid-cols-[40px_1fr_120px_70px_160px_32px] items-center gap-2">
                <Switch
                  checked={localSettings[room]?.enabled ?? true}
                  onCheckedChange={(checked) => setLocalSettings((prev) => ({
                    ...prev,
                    [room]: { ...prev[room], enabled: checked },
                  }))}
                />
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
                <Input
                  className="h-8 text-xs font-mono"
                  placeholder="VGW calendar ID"
                  value={localSettings[room]?.ghlCalendarId ?? ''}
                  onChange={(e) => setLocalSettings((prev) => ({
                    ...prev,
                    [room]: { ...prev[room], ghlCalendarId: e.target.value },
                  }))}
                />
                {isCustom ? (
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleRemoveRoom(room)}>
                    <Trash2 size={14} className="text-destructive" />
                  </Button>
                ) : (
                  <div className="h-8 w-8" />
                )}
              </div>
            );
          })}

          {/* Add new room */}
          <div className="grid grid-cols-[1fr_auto] items-center gap-2 pt-2 border-t">
            <Input
              className="h-8 text-sm"
              placeholder="Nieuwe ruimte toevoegen..."
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddRoom()}
            />
            <Button variant="outline" size="sm" className="h-8 gap-1" onClick={handleAddRoom} disabled={!newRoomName.trim()}>
              <Plus size={14} /> Toevoegen
            </Button>
          </div>

          <p className="text-xs text-muted-foreground mt-2">
            💡 Je vindt de VGW Kalender ID in VirtuGrow → Calendars → klik op een kalender → de ID staat in de URL.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuleren</Button>
          <Button onClick={handleSave}>Opslaan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
