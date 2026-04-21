import { useState, useEffect, useMemo } from 'react';
import { ROOMS, RoomName } from '@/types/crm';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, X, Plus, Building2, User } from 'lucide-react';
import CrmCombobox, { ComboboxOption } from '@/components/CrmCombobox';
import { ContactOption } from '@/hooks/useContacts';
import { Company } from '@/contexts/CompaniesContext';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { pushToGHL } from '@/lib/ghlSync';
import { capitalizeWords } from '@/lib/utils';

export interface NewReservationForm {
  contactId: string;
  contactName: string;
  companyId?: string;
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
  companyId?: string;
  date?: string;
  roomName?: string;
  guestCount?: number;
  startTime?: string;
  endTime?: string;
}

interface NewReservationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (form: NewReservationForm) => void;
  contacts: ContactOption[];
  contactsLoading: boolean;
  companies?: Company[];
  conflictAlert: string | null;
  getRoomDisplayName: (room: string) => string;
  initialStartHour?: number;
  initialRoom?: RoomName;
  initialDate?: string;
  prefill?: ReservationPrefill;
  initialStatus?: 'confirmed' | 'option';
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

interface NewCompanyForm { name: string; email: string; phone: string; address: string; }
interface NewContactForm { firstName: string; lastName: string; email: string; phone: string; }
const emptyCompanyForm: NewCompanyForm = { name: '', email: '', phone: '', address: '' };
const emptyContactForm: NewContactForm = { firstName: '', lastName: '', email: '', phone: '' };

export default function NewReservationDialog({
  open, onOpenChange, onSubmit, contacts, contactsLoading, companies = [], conflictAlert, getRoomDisplayName,
  initialStartHour, initialRoom, initialDate, prefill, initialStatus = 'confirmed',
}: NewReservationDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
  const [form, setForm] = useState<NewReservationForm>({
    contactId: '',
    contactName: '',
    companyId: '',
    room: initialRoom || ROOMS[0],
    date: initialDate || today,
    startHour: initialStartHour ?? 9,
    startMinute: 0,
    endHour: (initialStartHour ?? 9) + 3,
    endMinute: 0,
    title: '',
    status: initialStatus,
    repeatType: 'eenmalig',
    repeatCount: 1,
    specificDates: [],
    guestCount: 0,
    roomSetup: '',
    notes: '',
  });

  // Inline creation state
  const [creatingCompany, setCreatingCompany] = useState(false);
  const [companyForm, setCompanyForm] = useState<NewCompanyForm>(emptyCompanyForm);
  const [creatingContact, setCreatingContact] = useState(false);
  const [contactForm, setContactForm] = useState<NewContactForm>(emptyContactForm);
  const [saving, setSaving] = useState(false);
  const [adRandomDate, setAdRandomDate] = useState('');

  const addAdRandomDate = () => {
    if (adRandomDate && !form.specificDates.includes(adRandomDate)) {
      setForm((prev) => ({ ...prev, specificDates: [...prev.specificDates, adRandomDate].sort() }));
      setAdRandomDate('');
    }
  };

  // Reset form when dialog opens
  const [lastOpen, setLastOpen] = useState(false);
  useEffect(() => {
    if (open && !lastOpen) {
      const prefillRoom = prefill?.roomName && ROOMS.includes(prefill.roomName as RoomName) ? prefill.roomName as RoomName : undefined;
      let sH = initialStartHour ?? 9;
      let sM = 0;
      let eH = Math.min((initialStartHour ?? 9) + 3, 25);
      let eM = 0;
      if (prefill?.startTime) {
        const [h, m] = prefill.startTime.split(':').map(Number);
        if (!isNaN(h)) { sH = h; sM = m || 0; }
      }
      if (prefill?.endTime) {
        const [h, m] = prefill.endTime.split(':').map(Number);
        if (!isNaN(h)) { eH = h; eM = m || 0; }
      } else {
        eH = Math.min(sH + 3, 25);
        eM = sM;
      }
      setForm({
        contactId: prefill?.contactId || '',
        contactName: prefill?.contactName || '',
        companyId: prefill?.companyId || '',
        room: prefillRoom || initialRoom || ROOMS[0],
        date: prefill?.date || initialDate || today,
        startHour: sH,
        startMinute: sM,
        endHour: eH,
        endMinute: eM,
        title: prefill?.title || '',
        status: initialStatus,
        repeatType: 'eenmalig',
        repeatCount: 1,
        specificDates: [],
        guestCount: prefill?.guestCount || 0,
        roomSetup: '',
        notes: '',
      });
      setCreatingCompany(false);
      setCompanyForm(emptyCompanyForm);
      setCreatingContact(false);
      setContactForm(emptyContactForm);
    }
    setLastOpen(open);
  }, [open]);

  const filteredContacts = useMemo(() =>
    form.companyId ? contacts.filter(c => c.companyId === form.companyId) : contacts,
    [contacts, form.companyId]
  );

  const contactOptions = useMemo<ComboboxOption[]>(() =>
    filteredContacts.map(c => ({
      id: c.id,
      label: [c.firstName, c.lastName].filter(n => n && n !== '—').join(' ') || c.email || 'Onbekend',
      secondary: [c.company, c.email].filter(Boolean).join(' · ') || undefined,
      searchText: `${c.firstName} ${c.lastName} ${c.email || ''} ${c.company || ''}`,
    })),
    [filteredContacts]
  );

  const selectedCompany = form.companyId ? companies.find(co => co.id === form.companyId) : null;

  // Auto-reset contact when company changes and current contact doesn't belong
  useEffect(() => {
    if (!form.companyId || !form.contactId) return;
    const selected = contacts.find(c => c.id === form.contactId);
    if (selected && selected.companyId && selected.companyId !== form.companyId) {
      setForm((prev) => ({ ...prev, contactId: '', contactName: '' }));
      toast({ title: 'Contact gewist', description: 'Contact hoort niet bij het gekozen bedrijf.' });
    }
  }, [form.companyId]);

  const companyOptions = useMemo<ComboboxOption[]>(() =>
    companies.map(co => ({
      id: co.id,
      label: co.name,
      secondary: co.city || co.email || undefined,
      searchText: `${co.name} ${co.city || ''} ${co.kvk || ''} ${co.email || ''}`,
    })),
    [companies]
  );

  const selectedContact = contacts.find((c) => c.id === form.contactId);

  const handleSelectContact = (id: string, opt?: ComboboxOption) => {
    const contact = contacts.find(c => c.id === id);
    const updates: any = { ...form, contactId: id, contactName: opt?.label || '' };
    // Auto-suggest company if contact has one
    if (contact?.company && !form.companyId && !creatingCompany) {
      const matchedCompany = companies.find(co => co.name.toLowerCase() === (contact.company || '').toLowerCase());
      if (matchedCompany) updates.companyId = matchedCompany.id;
    }
    setForm(updates);
  };

  const handleSubmit = async () => {
    if (!user) return;

    const hasContact = form.contactId || (creatingContact && contactForm.firstName && contactForm.lastName);
    if (!hasContact || !form.room || !form.date || !form.title) {
      toast({ title: 'Vul minimaal klant, titel, ruimte en datum in', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      let companyId = form.companyId;
      let contactId = form.contactId;
      let contactName = form.contactName;

      // 1. Create new company if needed
      if (creatingCompany && companyForm.name) {
        const { data: existingCo } = await supabase
          .from('companies')
          .select('id, name')
          .ilike('name', companyForm.name.trim())
          .limit(1)
          .maybeSingle();

        if (existingCo) {
          toast({ title: `Bedrijf "${existingCo.name}" bestaat al`, description: 'Het bestaande bedrijf wordt gebruikt.' });
          companyId = existingCo.id;
        } else {
          const { data: newCo, error: coErr } = await (supabase as any).from('companies').insert({
            user_id: user.id,
            name: capitalizeWords(companyForm.name.trim()),
            email: companyForm.email || null,
            phone: companyForm.phone || null,
            address: companyForm.address || null,
          }).select().single();

          if (coErr) {
            toast({ title: 'Fout bij aanmaken bedrijf', description: coErr.message, variant: 'destructive' });
            setSaving(false);
            return;
          }
          companyId = newCo.id;
          pushToGHL('push-company', { company: newCo }, { entityType: 'company', entityId: newCo.id, actionType: 'create' });
          toast({ title: `Bedrijf "${newCo.name}" aangemaakt` });
        }
      }

      // 2. Create new contact if needed
      if (creatingContact && contactForm.firstName && contactForm.lastName) {
        let existingContact = null;
        if (contactForm.email) {
          const { data } = await supabase
            .from('contacts')
            .select('id, first_name, last_name')
            .ilike('email', contactForm.email.trim())
            .limit(1)
            .maybeSingle();
          existingContact = data;
        }
        if (!existingContact) {
          const { data } = await supabase
            .from('contacts')
            .select('id, first_name, last_name')
            .ilike('first_name', capitalizeWords(contactForm.firstName.trim()))
            .ilike('last_name', capitalizeWords(contactForm.lastName.trim()))
            .limit(1)
            .maybeSingle();
          existingContact = data;
        }

        if (existingContact) {
          toast({ title: `Contact "${existingContact.first_name} ${existingContact.last_name}" bestaat al`, description: 'Het bestaande contact wordt gebruikt.' });
          contactId = existingContact.id;
          contactName = `${existingContact.first_name} ${existingContact.last_name}`;
        } else {
          const { data: newContact, error: cErr } = await supabase.from('contacts').insert({
            user_id: user.id,
            first_name: capitalizeWords(contactForm.firstName.trim()),
            last_name: capitalizeWords(contactForm.lastName.trim()),
            email: contactForm.email || null,
            phone: contactForm.phone || null,
            company_id: companyId || null,
            status: 'lead',
          } as any).select().single();

          if (cErr) {
            toast({ title: 'Fout bij aanmaken contact', description: cErr.message, variant: 'destructive' });
            setSaving(false);
            return;
          }
          contactId = newContact.id;
          contactName = `${newContact.first_name} ${newContact.last_name}`;
          pushToGHL('push-contact', { contact: newContact }, { entityType: 'contact', entityId: newContact.id, actionType: 'create' });
          toast({ title: `Contact "${contactName}" aangemaakt` });
        }
      }

      onSubmit({ ...form, contactId: contactId || '', contactName, companyId: companyId || undefined });
    } catch (err: any) {
      toast({ title: 'Fout', description: err?.message || 'Onbekende fout', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const formatTimeValue = (h: number, m: number) =>
    `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

  // Hours 0,1,2 are "next day" so treat them as 24,25,26 for comparison
  const normalizeHour = (h: number) => h < 7 ? h + 24 : h;
  const endAfterStart = (normalizeHour(form.endHour) * 60 + form.endMinute) > (normalizeHour(form.startHour) * 60 + form.startMinute);
  const isValid = (form.contactId || (creatingContact && contactForm.firstName && contactForm.lastName)) && form.room && form.date && form.title && endAfterStart;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.status === 'option' ? 'Nieuwe Optie' : 'Nieuwe Reservering'}</DialogTitle>
        </DialogHeader>

        {conflictAlert && (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle size={16} /> {conflictAlert}
          </div>
        )}

        <div className="grid gap-4 py-2">
          {/* Company selection */}
          <div className="grid gap-1.5">
            <Label className="flex items-center gap-1.5">
              <Building2 size={13} className="text-muted-foreground" /> Bedrijf
            </Label>
            {!creatingCompany ? (
              <div className="space-y-1.5">
                <CrmCombobox
                  options={companyOptions}
                  value={form.companyId || ''}
                  onSelect={(id) => setForm({ ...form, companyId: id })}
                  placeholder="Selecteer bedrijf..."
                  searchPlaceholder="Zoek bedrijf..."
                  popoverWidth="w-[380px]"
                  allowClear
                  clearLabel="— Geen bedrijf —"
                />
                <button
                  type="button"
                  onClick={() => { setCreatingCompany(true); setForm({ ...form, companyId: '' }); }}
                  className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors font-medium"
                >
                  <Plus size={12} /> Nieuw bedrijf toevoegen
                </button>
              </div>
            ) : (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-primary flex items-center gap-1">
                    <Building2 size={12} /> Nieuw bedrijf
                  </span>
                  <button
                    type="button"
                    onClick={() => { setCreatingCompany(false); setCompanyForm(emptyCompanyForm); }}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Annuleren
                  </button>
                </div>
                <div className="grid gap-2">
                  <Input
                    placeholder="Bedrijfsnaam *"
                    value={companyForm.name}
                    onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })}
                    className="text-sm h-8"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="E-mail"
                      type="email"
                      value={companyForm.email}
                      onChange={(e) => setCompanyForm({ ...companyForm, email: e.target.value })}
                      className="text-sm h-8"
                    />
                    <Input
                      placeholder="Telefoon"
                      value={companyForm.phone}
                      onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })}
                      className="text-sm h-8"
                    />
                  </div>
                  <Input
                    placeholder="Adres (optioneel)"
                    value={companyForm.address}
                    onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })}
                    className="text-sm h-8"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Contact selection */}
          <div className="grid gap-1.5">
            <Label className="flex items-center gap-1.5">
              <User size={13} className="text-muted-foreground" /> Klant *
            </Label>
            {!creatingContact ? (
              <div className="space-y-1.5">
                {selectedContact ? (
                  <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
                    <div>
                      <p className="text-sm font-medium">{[selectedContact.firstName, selectedContact.lastName].filter(n => n && n !== '—').join(' ')}</p>
                      {selectedContact.email && <p className="text-xs text-muted-foreground">{selectedContact.email}</p>}
                      {selectedContact.company && <p className="text-xs text-muted-foreground">{selectedContact.company}</p>}
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setForm({ ...form, contactId: '', contactName: '' })}>
                      Wijzigen
                    </Button>
                  </div>
                ) : (
                  <CrmCombobox
                    options={contactOptions}
                    value={form.contactId}
                    onSelect={handleSelectContact}
                    placeholder="Selecteer klant..."
                    searchPlaceholder="Zoek contact..."
                    popoverWidth="w-[340px]"
                  />
                )}
                {!selectedContact && (
                  <button
                    type="button"
                    onClick={() => { setCreatingContact(true); setForm({ ...form, contactId: '', contactName: '' }); }}
                    className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors font-medium"
                  >
                    <Plus size={12} /> Nieuwe contactpersoon toevoegen
                  </button>
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-primary flex items-center gap-1">
                    <User size={12} /> Nieuwe contactpersoon
                  </span>
                  <button
                    type="button"
                    onClick={() => { setCreatingContact(false); setContactForm(emptyContactForm); }}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Annuleren
                  </button>
                </div>
                <div className="grid gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="Voornaam *"
                      value={contactForm.firstName}
                      onChange={(e) => setContactForm({ ...contactForm, firstName: e.target.value })}
                      className="text-sm h-8"
                    />
                    <Input
                      placeholder="Achternaam *"
                      value={contactForm.lastName}
                      onChange={(e) => setContactForm({ ...contactForm, lastName: e.target.value })}
                      className="text-sm h-8"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="E-mail"
                      type="email"
                      value={contactForm.email}
                      onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                      className="text-sm h-8"
                    />
                    <Input
                      placeholder="Telefoon"
                      value={contactForm.phone}
                      onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                      className="text-sm h-8"
                    />
                  </div>
                </div>
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
          <div className="grid gap-1.5">
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
            {!endAfterStart && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle size={12} /> Eindtijd moet na begintijd liggen
              </p>
            )}
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
                <SelectItem value="specifiek">Ad random (vrije datums)</SelectItem>
                <SelectItem value="week">Elke week</SelectItem>
                <SelectItem value="2weken">Om de 2 weken</SelectItem>
                <SelectItem value="maand">Elke maand</SelectItem>
                <SelectItem value="kwartaal">Elk kwartaal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.repeatType === 'specifiek' && (
            <div className="grid gap-1.5">
              <Label>Datums toevoegen</Label>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={adRandomDate}
                  onChange={(e) => setAdRandomDate(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); addAdRandomDate(); }
                  }}
                  className="flex-1"
                />
                <Button variant="outline" size="icon" type="button" onClick={addAdRandomDate} disabled={!adRandomDate}>
                  <Plus size={16} />
                </Button>
              </div>
              {form.specificDates.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {form.specificDates.map((d) => (
                    <span key={d} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
                      {new Date(d + 'T12:00:00').toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, specificDates: form.specificDates.filter((x) => x !== d) })}
                        className="ml-1 hover:text-destructive transition-colors"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {form.specificDates.length === 0 && (
                <p className="text-xs text-muted-foreground">Voeg één of meerdere losse datums toe.</p>
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
          <Button onClick={handleSubmit} disabled={!isValid || saving}>
            {saving ? 'Bezig...' : 'Toevoegen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
