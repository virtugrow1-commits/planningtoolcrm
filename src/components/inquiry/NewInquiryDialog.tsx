import { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import CrmCombobox, { ComboboxOption } from '@/components/CrmCombobox';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { pushToGHL } from '@/lib/ghlSync';
import { capitalizeWords } from '@/lib/utils';
import { Inquiry, ROOMS, Contact } from '@/types/crm';
import { Company } from '@/contexts/CompaniesContext';
import { Plus, Building2, User } from 'lucide-react';

const PIPELINE_COLUMNS: { key: Inquiry['status']; label: string }[] = [
  { key: 'new', label: 'Nieuwe Aanvraag' },
  { key: 'contacted', label: 'Lopend Contact' },
  { key: 'option', label: 'Optie' },
  { key: 'quoted', label: 'Offerte Verzonden' },
  { key: 'quote_revised', label: 'Aangepaste Offerte' },
  { key: 'reserved', label: 'Reservering' },
  { key: 'script', label: 'Draaiboek Maken' },
  { key: 'confirmed', label: 'Definitieve Reservering' },
  { key: 'invoiced', label: 'Facturatie' },
  { key: 'lost', label: 'Vervallen / Verloren' },
  { key: 'converted', label: 'Afgehandeld' },
  { key: 'after_sales', label: 'After Sales' },
  { key: 'condolence_reminder', label: 'Condoleance Herdenkingen' },
];

interface NewInquiryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contacts: Contact[];
  companies: Company[];
  onInquiryAdded: (inquiry: Omit<Inquiry, 'id' | 'createdAt'>) => Promise<void>;
}

interface NewCompanyForm {
  name: string;
  email: string;
  phone: string;
  address: string;
}

interface NewContactForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

const emptyCompanyForm: NewCompanyForm = { name: '', email: '', phone: '', address: '' };
const emptyContactForm: NewContactForm = { firstName: '', lastName: '', email: '', phone: '' };

export default function NewInquiryDialog({ open, onOpenChange, contacts, companies, onInquiryAdded }: NewInquiryDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();

  const [form, setForm] = useState({
    contactName: '', contactId: '', companyId: '', eventType: '', preferredDate: '',
    guestCount: '', budget: '', message: '', source: 'Handmatig', roomPreference: '', status: 'new' as Inquiry['status'],
  });

  // Inline creation modes
  const [creatingCompany, setCreatingCompany] = useState(false);
  const [companyForm, setCompanyForm] = useState<NewCompanyForm>(emptyCompanyForm);
  const [creatingContact, setCreatingContact] = useState(false);
  const [contactForm, setContactForm] = useState<NewContactForm>(emptyContactForm);
  const [saving, setSaving] = useState(false);

  // Search text for "create new" suggestions
  const [companySearch, setCompanySearch] = useState('');
  const [contactSearch, setContactSearch] = useState('');

  const companyOptions = useMemo((): ComboboxOption[] => {
    const opts: ComboboxOption[] = companies.map(co => ({
      id: co.id,
      label: co.name,
      secondary: co.city || co.email || undefined,
      searchText: `${co.name} ${co.city || ''} ${co.kvk || ''} ${co.email || ''}`,
    }));
    return opts;
  }, [companies]);

  const filteredContacts = useMemo(() =>
    form.companyId ? contacts.filter(c => c.companyId === form.companyId) : contacts,
    [contacts, form.companyId]
  );

  const contactOptions = useMemo((): ComboboxOption[] => {
    return filteredContacts.map(c => ({
      id: c.id,
      label: [c.firstName, c.lastName].filter(n => n && n !== '—').join(' ') || c.email || 'Onbekend',
      secondary: c.company || c.email || undefined,
      searchText: `${c.firstName} ${c.lastName} ${c.email || ''} ${c.company || ''} ${c.phone || ''}`,
    }));
  }, [filteredContacts]);

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

  const resetForm = () => {
    setForm({
      contactName: '', contactId: '', companyId: '', eventType: '', preferredDate: '',
      guestCount: '', budget: '', message: '', source: 'Handmatig', roomPreference: '', status: 'new',
    });
    setCreatingCompany(false);
    setCompanyForm(emptyCompanyForm);
    setCreatingContact(false);
    setContactForm(emptyContactForm);
    setCompanySearch('');
    setContactSearch('');
  };

  const handleClose = (open: boolean) => {
    if (!open) resetForm();
    onOpenChange(open);
  };

  const handleSubmit = async () => {
    if (!user) return;

    // Validate
    const hasContact = form.contactId || (creatingContact && contactForm.firstName && contactForm.lastName);
    const hasCompany = form.companyId || (creatingCompany && companyForm.name);

    if (!hasContact || !form.eventType) {
      toast({ title: 'Vul minimaal contactpersoon en type evenement in', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      let companyId = form.companyId;
      let contactId = form.contactId;
      let contactName = form.contactName;

      // 1. Create new company if needed
      if (creatingCompany && companyForm.name) {
        // Check duplicate
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
          // Push to GHL in background
          pushToGHL('push-company', { company: newCo }, { entityType: 'company', entityId: newCo.id, actionType: 'create' });
          toast({ title: `Bedrijf "${newCo.name}" aangemaakt` });
        }
      }

      // 2. Create new contact if needed
      if (creatingContact && contactForm.firstName && contactForm.lastName) {
        // Check duplicate by email or name
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
          // Push to GHL in background
          pushToGHL('push-contact', { contact: newContact }, { entityType: 'contact', entityId: newContact.id, actionType: 'create' });
          toast({ title: `Contact "${contactName}" aangemaakt` });
        }
      }

      // 3. Create inquiry
      await onInquiryAdded({
        contactId: contactId || '',
        contactName,
        companyId: companyId || undefined,
        eventType: form.eventType,
        preferredDate: form.preferredDate,
        roomPreference: form.roomPreference || undefined,
        guestCount: Number(form.guestCount) || 0,
        budget: Number(form.budget) || undefined,
        message: form.message,
        status: form.status,
        source: form.source || 'Handmatig',
      });

      resetForm();
      onOpenChange(false);
      toast({ title: 'Aanvraag aangemaakt' });
    } catch (err: any) {
      toast({ title: 'Fout', description: err?.message || 'Onbekende fout', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nieuwe Aanvraag</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          {/* Company */}
          <div className="grid gap-1.5">
            <Label className="flex items-center gap-1.5">
              <Building2 size={13} className="text-muted-foreground" /> Bedrijf
            </Label>
            {!creatingCompany ? (
              <div className="space-y-1.5">
                <CrmCombobox
                  options={companyOptions}
                  value={form.companyId}
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

          {/* Contact */}
          <div className="grid gap-1.5">
            <Label className="flex items-center gap-1.5">
              <User size={13} className="text-muted-foreground" /> Contactpersoon *
            </Label>
            {!creatingContact ? (
              <div className="space-y-1.5">
                <CrmCombobox
                  options={contactOptions}
                  value={form.contactId}
                  onSelect={(id, opt) => {
                    const selectedContact = contacts.find(c => c.id === id);
                    const updates: any = { ...form, contactName: opt?.label || '', contactId: id };
                    if (selectedContact?.companyId && !form.companyId && !creatingCompany) {
                      updates.companyId = selectedContact.companyId;
                    }
                    setForm(updates);
                  }}
                  placeholder="Selecteer contactpersoon..."
                  searchPlaceholder="Zoek contactpersoon..."
                  popoverWidth="w-[380px]"
                />
                <button
                  type="button"
                  onClick={() => { setCreatingContact(true); setForm({ ...form, contactId: '', contactName: '' }); }}
                  className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors font-medium"
                >
                  <Plus size={12} /> Nieuwe contactpersoon toevoegen
                </button>
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

          {/* Event type */}
          <div className="grid gap-1.5">
            <Label>Type evenement *</Label>
            <Input placeholder="Bijv. Vergadering, Bruiloft, Workshop" value={form.eventType} onChange={(e) => setForm({ ...form, eventType: e.target.value })} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Voorkeursdatum</Label>
              <Input type="date" value={form.preferredDate} onChange={(e) => setForm({ ...form, preferredDate: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Aantal gasten</Label>
              <Input type="number" min="1" placeholder="0" value={form.guestCount} onChange={(e) => setForm({ ...form, guestCount: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Ruimte voorkeur</Label>
              <Select value={form.roomPreference} onValueChange={(v) => setForm({ ...form, roomPreference: v })}>
                <SelectTrigger className="text-sm"><SelectValue placeholder="Optioneel" /></SelectTrigger>
                <SelectContent>
                  {ROOMS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Budget (€)</Label>
              <Input type="number" min="0" placeholder="0" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Bron</Label>
            <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}>
              <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Handmatig">Handmatig</SelectItem>
                <SelectItem value="Website">Website</SelectItem>
                <SelectItem value="Telefoon">Telefoon</SelectItem>
                <SelectItem value="Email">Email</SelectItem>
                <SelectItem value="GHL">VirtuGrow</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label>Stadium</Label>
            <Select value={form.status} onValueChange={(v: Inquiry['status']) => setForm({ ...form, status: v })}>
              <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PIPELINE_COLUMNS.map((col) => (
                  <SelectItem key={col.key} value={col.key}>{col.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label>Bericht / Notities</Label>
            <Textarea placeholder="Omschrijving van de aanvraag..." value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>Annuleren</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? 'Bezig...' : 'Toevoegen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
