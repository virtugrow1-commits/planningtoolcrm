import { useState, useEffect } from 'react';
import { ROOMS, RoomName } from '@/types/crm';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, Search, X } from 'lucide-react';
import { ContactOption } from '@/hooks/useContacts';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

export interface NewReservationForm {
  contactId: string;
  contactName: string;
  room: RoomName;
  date: string;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  title: string;
  status: 'confirmed' | 'option';
  repeatType: 'eenmalig' | 'week' | '2weken' | 'maand' | 'kwartaal' | 'specifiek';
  repeatCount: number;
  specificDates: string[];
  guestCount: number;
  roomSetup: string;
  notes: string;
}

export interface ReservationPrefill {
  title?: string;
  contactName?: string;
  contactId?: string;
  date?: string;
  roomName?: string;
  guestCount?: number;
}

interface NewReservationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (form: NewReservationForm) => void;
  contacts: ContactOption[];
  contactsLoading: boolean;
  conflictAlert: string | null;
  getRoomDisplayName: (room: string) => string;
  initialStartHour?: number;
  initialRoom?: RoomName;
  initialDate?: string;
  prefill?: ReservationPrefill;
}

const ROOM_SETUPS = [
  'Theateropstelling',
  'U-vorm',
  'Boardroom',
  'Cabaret',
  'Schoolopstelling',
  'Blokopstelling',
  'Receptie / staand',
  'Diner',
  'Anders',
];

export default function NewReservationDialog({
  open, onOpenChange, onSubmit, contacts, contactsLoading, conflictAlert, getRoomDisplayName,
  initialStartHour, initialRoom, initialDate, prefill
}: NewReservationDialogProps) {
  const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
  const [form, setForm] = useState<NewReservationForm>({
    contactId: '',
    contactName: '',
    room: initialRoom || ROOMS[0],
    date: initialDate || today,
    startHour: initialStartHour ?? 9,
    startMinute: 0,
    endHour: (initialStartHour ?? 9) + 3,
    endMinute: 0,
    title: '',
    status: 'confirmed',
    repeatType: 'eenmalig',
    repeatCount: 1,
    specificDates: [],
    guestCount: 0,
    roomSetup: '',
    notes: '',
  });
  const [contactSearch, setContactSearch] = useState('');

  // Reset form when dialog opens with new initial values
  useEffect(() => {
    if (open) {
      const prefillRoom = prefill?.roomName && ROOMS.includes(prefill.roomName as RoomName) ? prefill.roomName as RoomName : undefined;
      setForm({
        contactId: prefill?.contactId || '',
        contactName: prefill?.contactName || '',
        room: prefillRoom || initialRoom || ROOMS[0],
        date: prefill?.date || initialDate || today,
        startHour: initialStartHour ?? 9,
        startMinute: 0,
        endHour: Math.min((initialStartHour ?? 9) + 3, 25),
        endMinute: 0,
        title: prefill?.title || '',
        status: 'confirmed',
        repeatType: 'eenmalig',
        repeatCount: 1,
        specificDates: [],
        guestCount: prefill?.guestCount || 0,
        roomSetup: '',
        notes: '',
      });
      setContactSearch('');
    }
  }, [open, initialStartHour, initialRoom, initialDate, prefill]);

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

  const formatTimeValue = (h: number, m: number) =>
    `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

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

          {/* Times - manual input */}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Van</Label>
              <Input
                type="time"
                value={formatTimeValue(form.startHour, form.startMinute)}
                onChange={(e) => {
                  const [h, m] = e.target.value.split(':').map(Number);
                  if (!isNaN(h) && !isNaN(m)) {
                    setForm({ ...form, startHour: h, startMinute: m });
                  }
                }}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Tot</Label>
              <Input
                type="time"
                value={formatTimeValue(form.endHour, form.endMinute)}
                onChange={(e) => {
                  const [h, m] = e.target.value.split(':').map(Number);
                  if (!isNaN(h) && !isNaN(m)) {
                    setForm({ ...form, endHour: h, endMinute: m });
                  }
                }}
              />
            </div>
          </div>

          {/* Guest count & Room setup */}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Aantal personen</Label>
              <Input
                type="number"
                min={0}
                placeholder="0"
                value={form.guestCount || ''}
                onChange={(e) => setForm({ ...form, guestCount: Math.max(0, Number(e.target.value)) })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Zaalopstelling</Label>
              <Select value={form.roomSetup} onValueChange={(v) => setForm({ ...form, roomSetup: v })}>
                <SelectTrigger><SelectValue placeholder="Kies opstelling" /></SelectTrigger>
                <SelectContent>
                  {ROOM_SETUPS.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
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
                <SelectItem value="specifiek">Specifieke datums</SelectItem>
                <SelectItem value="week">Elke week</SelectItem>
                <SelectItem value="2weken">Om de 2 weken</SelectItem>
                <SelectItem value="maand">Elke maand</SelectItem>
                <SelectItem value="kwartaal">Elk kwartaal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.repeatType === 'specifiek' && (
            <div className="grid gap-1.5">
              <Label>Selecteer datums</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="justify-start text-left font-normal">
                    {form.specificDates.length > 0
                      ? `${form.specificDates.length} datum(s) geselecteerd`
                      : 'Kies datums...'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="multiple"
                    selected={form.specificDates.map((d) => {
                      const [y, m, day] = d.split('-').map(Number);
                      return new Date(y, m - 1, day);
                    })}
                    onSelect={(dates) => {
                      const formatted = (dates || []).map((d) =>
                        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
                      ).sort();
                      setForm({ ...form, specificDates: formatted });
                    }}
                    locale={nl}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
              {form.specificDates.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {form.specificDates.map((d) => (
                    <span key={d} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs">
                      {format(new Date(d + 'T12:00:00'), 'd MMM yyyy', { locale: nl })}
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, specificDates: form.specificDates.filter((x) => x !== d) })}
                        className="hover:text-destructive"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          {form.repeatType !== 'eenmalig' && form.repeatType !== 'specifiek' && (
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

          {/* Notes */}
          <div className="grid gap-1.5">
            <Label>Toelichting</Label>
            <Textarea
              placeholder="Eventuele opmerkingen..."
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuleren</Button>
          <Button onClick={handleSubmit} disabled={!isValid}>Toevoegen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
