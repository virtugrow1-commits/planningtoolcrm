import { useState } from 'react';
import { ROOMS, RoomName } from '@/types/crm';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Search } from 'lucide-react';
import { ContactOption } from '@/hooks/useContacts';
import { ScrollArea } from '@/components/ui/scroll-area';

const START_HOURS = [...Array.from({ length: 17 }, (_, i) => i + 7), 0]; // 7-23, 0
const END_HOURS = [...Array.from({ length: 16 }, (_, i) => i + 9), 0, 1]; // 9-24(0), 1

export interface NewReservationForm {
  contactId: string;
  contactName: string;
  room: RoomName;
  date: string;
  startHour: number;
  endHour: number;
  title: string;
  status: 'confirmed' | 'option';
  repeatType: 'eenmalig' | 'week' | '2weken' | 'maand' | 'kwartaal';
  repeatCount: number;
}

interface NewReservationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (form: NewReservationForm) => void;
  contacts: ContactOption[];
  contactsLoading: boolean;
  conflictAlert: string | null;
  getRoomDisplayName: (room: string) => string;
}

export default function NewReservationDialog({
  open, onOpenChange, onSubmit, contacts, contactsLoading, conflictAlert, getRoomDisplayName
}: NewReservationDialogProps) {
  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState<NewReservationForm>({
    contactId: '',
    contactName: '',
    room: ROOMS[0],
    date: today,
    startHour: 9,
    endHour: 12,
    title: '',
    status: 'confirmed',
    repeatType: 'eenmalig',
    repeatCount: 1,
  });
  const [contactSearch, setContactSearch] = useState('');

  const filteredContacts = contacts.filter((c) =>
    `${c.firstName} ${c.lastName} ${c.email || ''} ${c.company || ''}`.toLowerCase().includes(contactSearch.toLowerCase())
  );

  const selectedContact = contacts.find((c) => c.id === form.contactId);

  const handleSelectContact = (contact: ContactOption) => {
    setForm({
      ...form,
      contactId: contact.id,
      contactName: `${contact.firstName} ${contact.lastName}`,
    });
    setContactSearch('');
  };

  const handleSubmit = () => {
    onSubmit(form);
  };

  const isValid = form.contactId && form.room && form.date && form.title;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nieuwe Reservering</DialogTitle>
        </DialogHeader>

        {conflictAlert && (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle size={16} /> {conflictAlert}
          </div>
        )}

        <div className="grid gap-4 py-2">
          {/* Contact selection */}
          <div className="grid gap-1.5">
            <Label>Klant *</Label>
            {selectedContact ? (
              <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
                <div>
                  <p className="text-sm font-medium">{selectedContact.firstName} {selectedContact.lastName}</p>
                  {selectedContact.email && <p className="text-xs text-muted-foreground">{selectedContact.email}</p>}
                  {selectedContact.company && <p className="text-xs text-muted-foreground">{selectedContact.company}</p>}
                </div>
                <Button variant="ghost" size="sm" onClick={() => setForm({ ...form, contactId: '', contactName: '' })}>
                  Wijzigen
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Zoek contact..."
                    className="pl-9"
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                  />
                </div>
                <ScrollArea className="h-36 rounded-lg border">
                  {contactsLoading ? (
                    <p className="p-3 text-sm text-muted-foreground">Laden...</p>
                  ) : filteredContacts.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground">Geen contacten gevonden</p>
                  ) : (
                    filteredContacts.map((c) => (
                      <button
                        key={c.id}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent/10 transition-colors"
                        onClick={() => handleSelectContact(c)}
                      >
                        <div>
                          <span className="font-medium">{c.firstName} {c.lastName}</span>
                          {c.company && <span className="ml-2 text-xs text-muted-foreground">({c.company})</span>}
                        </div>
                      </button>
                    ))
                  )}
                </ScrollArea>
              </div>
            )}
          </div>

          {/* Title */}
          <div className="grid gap-1.5">
            <Label>Titel *</Label>
            <Input placeholder="Naam evenement" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>

          {/* Room */}
          <div className="grid gap-1.5">
            <Label>Ruimte *</Label>
            <Select value={form.room} onValueChange={(v) => setForm({ ...form, room: v as RoomName })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROOMS.map((r) => (
                  <SelectItem key={r} value={r}>{getRoomDisplayName(r)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date */}
          <div className="grid gap-1.5">
            <Label>Datum *</Label>
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>

          {/* Times */}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Van</Label>
              <Select value={String(form.startHour)} onValueChange={(v) => setForm({ ...form, startHour: Number(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{START_HOURS.map((h) => <SelectItem key={h} value={String(h)}>{String(h).padStart(2, '0')}:00</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Tot</Label>
              <Select value={String(form.endHour)} onValueChange={(v) => setForm({ ...form, endHour: Number(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{END_HOURS.filter((h) => h > form.startHour || h <= 1).map((h) => <SelectItem key={h} value={String(h)}>{String(h).padStart(2, '0')}:00</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {/* Status */}
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

          {/* Repeat */}
          <div className="grid gap-1.5">
            <Label>Herhaling</Label>
            <Select value={form.repeatType} onValueChange={(v: NewReservationForm['repeatType']) => setForm({ ...form, repeatType: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="eenmalig">Eenmalig</SelectItem>
                <SelectItem value="week">Elke week</SelectItem>
                <SelectItem value="2weken">Om de 2 weken</SelectItem>
                <SelectItem value="maand">Elke maand</SelectItem>
                <SelectItem value="kwartaal">Elk kwartaal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.repeatType !== 'eenmalig' && (
            <div className="grid gap-1.5">
              <Label>Aantal herhalingen</Label>
              <Input
                type="number"
                min={1}
                max={52}
                value={form.repeatCount}
                onChange={(e) => setForm({ ...form, repeatCount: Math.max(1, Math.min(52, Number(e.target.value))) })}
                className="w-24"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuleren</Button>
          <Button onClick={handleSubmit} disabled={!isValid}>Toevoegen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
