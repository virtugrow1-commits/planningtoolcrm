import { useParams, useNavigate } from 'react-router-dom';
import { useContactsContext } from '@/contexts/ContactsContext';
import { useInquiriesContext } from '@/contexts/InquiriesContext';
import { useBookings } from '@/contexts/BookingsContext';
import { useCompaniesContext } from '@/contexts/CompaniesContext';
import { useTasksContext } from '@/contexts/TasksContext';
import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Pencil, Check, X, Plus, ChevronRight, Calendar, FileText, Mail, Phone, Building2, User, CheckSquare } from 'lucide-react';
import ActivityTimeline from '@/components/contact/ActivityTimeline';
import { Contact, ROOMS } from '@/types/crm';
import { mockQuotations } from '@/data/mockData';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { contacts, updateContact, deleteContact } = useContactsContext();
  const { inquiries } = useInquiriesContext();
  const { companies } = useCompaniesContext();
  const { bookings } = useBookings();
  const { tasks } = useTasksContext();
  const { toast } = useToast();

  const contact = contacts.find((c) => c.id === id);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Contact | null>(null);

  // Inquiry dialog
  const [inquiryOpen, setInquiryOpen] = useState(false);
  const [inquiryForm, setInquiryForm] = useState({ eventType: '', preferredDate: '', guestCount: '', budget: '', message: '', roomPreference: '' });

  const contactInquiries = useMemo(() => contact ? inquiries.filter((i) => i.contactId === contact.id) : [], [inquiries, contact]);
  const contactBookings = useMemo(() => contact ? bookings.filter((b) => b.contactId === contact.id) : [], [bookings, contact]);
  const confirmedBookings = useMemo(() => contactBookings.filter((b) => b.status !== 'option'), [contactBookings]);
  const optionBookings = useMemo(() => contactBookings.filter((b) => b.status === 'option'), [contactBookings]);
  const contactQuotations = useMemo(() => contact ? mockQuotations.filter((q) => q.contactId === contact.id) : [], [contact]);
  const contactTasks = useMemo(() => contact ? tasks.filter((t) => t.contactId === contact.id) : [], [tasks, contact]);

  if (!contact) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-muted-foreground">Contact niet gevonden</p>
          <Button variant="outline" onClick={() => navigate('/crm')}>
            <ArrowLeft size={14} className="mr-1" /> Terug naar CRM
          </Button>
        </div>
      </div>
    );
  }

  const startEdit = () => {
    setForm({ ...contact });
    setEditing(true);
  };

  const cancelEdit = () => {
    setForm(null);
    setEditing(false);
  };

  const saveEdit = async () => {
    if (!form) return;
    if (!form.firstName || !form.lastName) {
      toast({ title: 'Vul minimaal voor- en achternaam in', variant: 'destructive' });
      return;
    }
    // Auto-link company_id if company name matches
    let companyId = form.companyId;
    if (form.company) {
      const match = companies.find((c) => c.name.toLowerCase() === form.company!.toLowerCase());
      if (match) companyId = match.id;
      else companyId = undefined;
    } else {
      companyId = undefined;
    }
    await updateContact({ ...form, companyId });
    setEditing(false);
    setForm(null);
    toast({ title: 'Contact bijgewerkt' });
  };

  const handleDelete = async () => {
    await deleteContact(contact.id);
    toast({ title: 'Contact verwijderd' });
    navigate('/crm');
  };

  const handleSubmitInquiry = () => {
    if (!inquiryForm.eventType) {
      toast({ title: 'Vul minimaal een type evenement in', variant: 'destructive' });
      return;
    }
    const params = new URLSearchParams({
      contactId: contact.id,
      contactName: `${contact.firstName} ${contact.lastName}`,
      eventType: inquiryForm.eventType,
      preferredDate: inquiryForm.preferredDate,
      guestCount: inquiryForm.guestCount,
      budget: inquiryForm.budget,
      message: inquiryForm.message,
      roomPreference: inquiryForm.roomPreference,
    });
    setInquiryOpen(false);
    navigate(`/inquiries?newInquiry=${encodeURIComponent(params.toString())}`);
  };

  const current = editing ? form! : contact;

  const statusLabels: Record<string, string> = {
    new: 'Nieuw',
    contacted: 'Contactgelegd',
    option: 'Optie',
    quoted: 'Offerte',
    quote_revised: 'Offerte herzien',
    reserved: 'Gereserveerd',
    confirmed: 'Bevestigd',
    invoiced: 'Gefactureerd',
    converted: 'Definitief',
    lost: 'Verloren',
    after_sales: 'Aftersales',
  };

  return (
    <div className="p-6 lg:p-8 space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <button onClick={() => navigate('/crm')} className="hover:text-foreground transition-colors">CRM</button>
        <ChevronRight size={14} />
        <span className="text-foreground font-medium">{contact.displayNumber && <span className="font-mono text-xs text-muted-foreground mr-2">{contact.displayNumber}</span>}{contact.firstName} {contact.lastName}</span>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* LEFT SIDEBAR — Contact Info */}
        <div className="w-full lg:w-80 shrink-0 space-y-5">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-foreground">
              {current.firstName} {current.lastName}
            </h1>
            {!editing ? (
              <Button variant="ghost" size="icon" onClick={startEdit} className="h-8 w-8">
                <Pencil size={14} />
              </Button>
            ) : (
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={cancelEdit} className="h-8 w-8 text-muted-foreground">
                  <X size={14} />
                </Button>
                <Button variant="ghost" size="icon" onClick={saveEdit} className="h-8 w-8 text-success">
                  <Check size={14} />
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-4 text-sm">
            <InfoField icon={<User size={14} />} label="Voornaam" value={current.firstName} editing={editing} onChange={(v) => setForm({ ...form!, firstName: v })} />
            <InfoField icon={<User size={14} />} label="Achternaam" value={current.lastName} editing={editing} onChange={(v) => setForm({ ...form!, lastName: v })} />
            <InfoField icon={<Mail size={14} />} label="Email" value={current.email} editing={editing} type="email" onChange={(v) => setForm({ ...form!, email: v })} />
            <InfoField icon={<Phone size={14} />} label="Telefoon" value={current.phone} editing={editing} onChange={(v) => setForm({ ...form!, phone: v })} />
            <CompanyField
              current={current}
              editing={editing}
              companies={companies}
              form={form}
              setForm={setForm}
              navigate={navigate}
            />

            {editing && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Status</p>
                <Select value={form!.status} onValueChange={(v: Contact['status']) => setForm({ ...form!, status: v })}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lead">Lead</SelectItem>
                    <SelectItem value="prospect">Prospect</SelectItem>
                    <SelectItem value="client">Klant</SelectItem>
                    <SelectItem value="inactive">Inactief</SelectItem>
                    <SelectItem value="do_not_contact">Niet benaderen</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">Notities</p>
              {editing ? (
                <Textarea className="text-sm min-h-[80px]" value={form!.notes || ''} onChange={(e) => setForm({ ...form!, notes: e.target.value || undefined })} placeholder="Eventuele notities..." />
              ) : (
                <p className="text-muted-foreground">{current.notes || '—'}</p>
              )}
            </div>

            <p className="text-xs text-muted-foreground pt-2">Aangemaakt: {current.createdAt}</p>

            {editing && (
              <Button variant="destructive" size="sm" className="w-full mt-2" onClick={handleDelete}>
                Contact verwijderen
              </Button>
            )}
          </div>
        </div>

        {/* RIGHT CONTENT — Sections */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Aanvragen */}
          <SectionCard title="Aanvragen" actionLabel="Nieuwe aanvraag" onAction={() => {
            setInquiryForm({ eventType: '', preferredDate: '', guestCount: '', budget: '', message: '', roomPreference: '' });
            setInquiryOpen(true);
          }} linkLabel="Bekijk alle aanvragen" onLink={() => navigate('/inquiries')}>
            {contactInquiries.length === 0 ? (
              <p className="text-xs text-muted-foreground">Geen aanvragen</p>
            ) : (
              <div className="space-y-3">
                {contactInquiries.slice(0, 5).map((inq) => (
                  <button
                    key={inq.id}
                    onClick={() => navigate(`/inquiries/${inq.id}`)}
                    className="w-full text-left rounded-lg border border-border/50 p-3 hover:bg-muted/30 transition-colors space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-foreground">{inq.eventType}</span>
                      <div className="flex items-center gap-2">
                        {!inq.isRead && <span className="inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-bold bg-destructive text-destructive-foreground">New</span>}
                        <span className="inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-medium bg-accent/15 text-accent-foreground border border-accent/30">
                          {statusLabels[inq.status] || inq.status}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground">
                      <span>{inq.createdAt}</span>
                      {inq.guestCount > 0 && <span>{inq.guestCount} gasten</span>}
                      {inq.roomPreference && <span>{inq.roomPreference}</span>}
                      {inq.source && inq.source !== 'Handmatig' && inq.source !== 'CRM' && (
                        <span className="text-primary">Bron: {inq.source === 'GHL' ? 'VirtuGrow' : inq.source}</span>
                      )}
                    </div>
                    {inq.message && (
                      <p className="text-[11px] text-muted-foreground line-clamp-2 whitespace-pre-wrap">{inq.message}</p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Reserveringen */}
          <SectionCard title="Reserveringen" linkLabel="Bekijk agenda" onLink={() => navigate('/calendar')}>
            {confirmedBookings.length === 0 ? (
              <p className="text-xs text-muted-foreground">Geen reserveringen</p>
            ) : (
              <div className="space-y-1">
                {confirmedBookings.slice(0, 8).map((b) => (
                  <button
                    key={b.id}
                    onClick={() => navigate(`/reserveringen/${b.id}`)}
                    className="w-full flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors text-left text-xs"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-foreground">{b.title}</span>
                      <span className="text-muted-foreground ml-2">{b.roomName}</span>
                    </div>
                    <span className="text-muted-foreground shrink-0">{b.date} · {String(b.startHour).padStart(2, '0')}:{String(b.startMinute || 0).padStart(2, '0')}–{String(b.endHour).padStart(2, '0')}:{String(b.endMinute || 0).padStart(2, '0')}</span>
                  </button>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Opties */}
          <SectionCard title="Opties" linkLabel="Bekijk agenda" onLink={() => navigate('/calendar')}>
            {optionBookings.length === 0 ? (
              <p className="text-xs text-muted-foreground">Geen opties</p>
            ) : (
              <div className="space-y-1">
                {optionBookings.slice(0, 8).map((b) => (
                  <button
                    key={b.id}
                    onClick={() => navigate(`/reserveringen/${b.id}`)}
                    className="w-full flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors text-left text-xs"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-foreground">{b.title}</span>
                      <span className="text-muted-foreground ml-2">{b.roomName}</span>
                    </div>
                    <span className="text-muted-foreground shrink-0">{b.date} · {String(b.startHour).padStart(2, '0')}:{String(b.startMinute || 0).padStart(2, '0')} – {String(b.endHour).padStart(2, '0')}:{String(b.endMinute || 0).padStart(2, '0')}</span>
                  </button>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Offertes */}
          <SectionCard title="Offertes" linkLabel="Bekijk offertes" onLink={() => navigate('/quotations')}>
            {contactQuotations.length === 0 ? (
              <p className="text-xs text-muted-foreground">Geen offertes</p>
            ) : (
              <div className="space-y-1">
                {contactQuotations.slice(0, 8).map((q) => (
                  <button
                    key={q.id}
                    onClick={() => navigate('/quotations')}
                    className="w-full flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors text-left text-xs"
                  >
                    <div>
                      <span className="font-medium text-foreground">{q.title}</span>
                      <span className="text-muted-foreground ml-2">€{q.totalAmount.toLocaleString()}</span>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {q.status === 'draft' ? 'Concept' : q.status === 'sent' ? 'Verzonden' : q.status === 'accepted' ? 'Geaccepteerd' : q.status === 'declined' ? 'Afgewezen' : 'Verlopen'}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Taken */}
          <SectionCard title="Taken">
            {contactTasks.length === 0 ? (
              <p className="text-xs text-muted-foreground">Geen taken</p>
            ) : (
              <div className="space-y-1">
                {contactTasks.slice(0, 8).map((t) => (
                  <div key={t.id} className="flex items-center gap-2 text-xs py-1.5 px-2">
                    <CheckSquare size={12} className={t.status === 'completed' ? 'text-success' : 'text-muted-foreground'} />
                    <span className={t.status === 'completed' ? 'line-through text-muted-foreground' : 'text-foreground'}>{t.title}</span>
                    {t.dueDate && <span className="text-muted-foreground ml-auto">{t.dueDate}</span>}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Gesprekken */}
          <div className="rounded-xl bg-card p-5 card-shadow">
            <ActivityTimeline contactId={contact.id} />
          </div>
        </div>
      </div>

      {/* Inquiry Dialog */}
      <Dialog open={inquiryOpen} onOpenChange={setInquiryOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Aanvraag indienen</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-sm font-medium text-foreground">{contact.firstName} {contact.lastName}</p>
              <p className="text-xs text-muted-foreground">Contact gekoppeld aan deze aanvraag</p>
            </div>
            <div className="grid gap-1.5">
              <Label>Type evenement *</Label>
              <Input placeholder="Bijv. Vergadering, Bruiloft, Workshop" value={inquiryForm.eventType} onChange={(e) => setInquiryForm({ ...inquiryForm, eventType: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Voorkeursdatum</Label>
                <Input type="date" value={inquiryForm.preferredDate} onChange={(e) => setInquiryForm({ ...inquiryForm, preferredDate: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Aantal gasten</Label>
                <Input type="number" min="1" placeholder="0" value={inquiryForm.guestCount} onChange={(e) => setInquiryForm({ ...inquiryForm, guestCount: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Ruimte voorkeur</Label>
                <Select value={inquiryForm.roomPreference} onValueChange={(v) => setInquiryForm({ ...inquiryForm, roomPreference: v })}>
                  <SelectTrigger className="text-sm"><SelectValue placeholder="Optioneel" /></SelectTrigger>
                  <SelectContent>
                    {ROOMS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Budget (€)</Label>
                <Input type="number" min="0" placeholder="0" value={inquiryForm.budget} onChange={(e) => setInquiryForm({ ...inquiryForm, budget: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Bericht / Notities</Label>
              <Textarea placeholder="Omschrijving van de aanvraag..." value={inquiryForm.message} onChange={(e) => setInquiryForm({ ...inquiryForm, message: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInquiryOpen(false)}>Annuleren</Button>
            <Button onClick={handleSubmitInquiry}>Aanvraag Indienen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoField({ icon, label, value, editing, type, onChange }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  editing: boolean;
  type?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground mb-0.5 flex items-center gap-1.5">{icon} {label}</p>
      {editing ? (
        <Input className="h-8 text-sm" type={type} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <p className="text-foreground">{value || '—'}</p>
      )}
    </div>
  );
}

function CompanyField({ current, editing, companies, form, setForm, navigate }: {
  current: Contact;
  editing: boolean;
  companies: { id: string; name: string }[];
  form: Contact | null;
  setForm: (f: Contact) => void;
  navigate: (path: string) => void;
}) {
  const [companySearch, setCompanySearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  if (!editing) {
    return (
      <div>
        <p className="text-xs font-semibold text-muted-foreground mb-0.5 flex items-center gap-1.5"><Building2 size={14} /> Bedrijf</p>
        {current.company ? (
          <button
            onClick={() => {
              const match = companies.find((c) => c.name.toLowerCase() === current.company!.toLowerCase());
              if (match) navigate(`/companies/${match.id}`);
              else if (current.companyId) navigate(`/companies/${current.companyId}`);
            }}
            className="text-primary hover:underline font-medium text-sm"
          >
            {current.company}
          </button>
        ) : (
          <p className="text-sm text-foreground">—</p>
        )}
      </div>
    );
  }

  const searchValue = companySearch || form?.company || '';
  const filtered = searchValue.trim()
    ? companies.filter((c) => c.name.toLowerCase().includes(searchValue.toLowerCase())).slice(0, 8)
    : [];

  return (
    <div className="relative">
      <p className="text-xs font-semibold text-muted-foreground mb-0.5 flex items-center gap-1.5"><Building2 size={14} /> Bedrijf</p>
      <Input
        className="h-8 text-sm"
        value={searchValue}
        placeholder="Zoek of typ bedrijfsnaam..."
        onChange={(e) => {
          setCompanySearch(e.target.value);
          setForm({ ...form!, company: e.target.value || undefined, companyId: undefined });
          setShowDropdown(true);
        }}
        onFocus={() => setShowDropdown(true)}
        onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
      />
      {showDropdown && filtered.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-md max-h-40 overflow-y-auto">
          {filtered.map((c) => (
            <button
              key={c.id}
              type="button"
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted/50 transition-colors"
              onMouseDown={(e) => {
                e.preventDefault();
                setForm({ ...form!, company: c.name, companyId: c.id });
                setCompanySearch('');
                setShowDropdown(false);
              }}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      {form?.company && (
        <button
          type="button"
          className="absolute right-2 top-7 text-muted-foreground hover:text-foreground"
          onClick={() => { setForm({ ...form!, company: undefined, companyId: undefined }); setCompanySearch(''); }}
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

function SectionCard({ title, children, actionLabel, onAction, linkLabel, onLink }: {
  title: string;
  children: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  linkLabel?: string;
  onLink?: () => void;
}) {
  return (
    <div className="rounded-xl bg-card p-5 card-shadow space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-bold text-foreground">{title}</h3>
          {onAction && (
            <button onClick={onAction} className="text-muted-foreground hover:text-foreground transition-colors">
              <Plus size={16} />
            </button>
          )}
        </div>
        {linkLabel && onLink && (
          <button onClick={onLink} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors">
            {linkLabel} <ChevronRight size={12} />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}
