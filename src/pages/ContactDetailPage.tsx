import { useParams, useNavigate } from 'react-router-dom';
import { useContactsContext } from '@/contexts/ContactsContext';
import { useInquiriesContext } from '@/contexts/InquiriesContext';
import { useBookings } from '@/contexts/BookingsContext';
import { useCompaniesContext } from '@/contexts/CompaniesContext';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Pencil, Check, X, Plus, ChevronRight, Calendar, FileText, Mail, Phone, Building2, User } from 'lucide-react';
import ActivityTimeline from '@/components/contact/ActivityTimeline';
import { Contact, ROOMS } from '@/types/crm';
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
  const { toast } = useToast();

  const contact = contacts.find((c) => c.id === id);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Contact | null>(null);

  // Inquiry dialog
  const [inquiryOpen, setInquiryOpen] = useState(false);
  const [inquiryForm, setInquiryForm] = useState({ eventType: '', preferredDate: '', guestCount: '', budget: '', message: '', roomPreference: '' });

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

  const contactInquiries = inquiries.filter((i) => i.contactId === contact.id);
  const contactBookings = bookings.filter((b) => b.contactId === contact.id);

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
        <span className="text-foreground font-medium">{contact.firstName} {contact.lastName}</span>
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
            <InfoField icon={<Building2 size={14} />} label="Bedrijf" value={current.company || ''} editing={editing} onChange={(v) => setForm({ ...form!, company: v || undefined })} />

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
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="text-left pb-2 font-medium">Datum</th>
                    <th className="text-left pb-2 font-medium">Type</th>
                    <th className="text-left pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {contactInquiries.slice(0, 5).map((inq) => (
                    <tr key={inq.id} className="border-t border-border/50">
                      <td className="py-1.5">{inq.createdAt}</td>
                      <td className="py-1.5">{inq.eventType}</td>
                      <td className="py-1.5">
                        <span className="inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-medium bg-accent/15 text-accent-foreground border border-accent/30">
                          {statusLabels[inq.status] || inq.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </SectionCard>

          {/* Reserveringen */}
          <SectionCard title="Reserveringen" linkLabel="Bekijk agenda" onLink={() => navigate('/calendar')}>
            {contactBookings.length === 0 ? (
              <p className="text-xs text-muted-foreground">Geen reserveringen</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="text-left pb-2 font-medium">Datum</th>
                    <th className="text-left pb-2 font-medium">Ruimte</th>
                    <th className="text-left pb-2 font-medium">Tijd</th>
                  </tr>
                </thead>
                <tbody>
                  {contactBookings.slice(0, 5).map((b) => (
                    <tr key={b.id} className="border-t border-border/50">
                      <td className="py-1.5">{b.date}</td>
                      <td className="py-1.5">{b.roomName}</td>
                      <td className="py-1.5">{b.startHour}:00 - {b.endHour}:00</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </SectionCard>

          {/* Offertes */}
          <SectionCard title="Offertes" linkLabel="Bekijk offertes" onLink={() => navigate('/quotations')}>
            <p className="text-xs text-muted-foreground">Geen offertes</p>
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
