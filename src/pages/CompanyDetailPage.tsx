import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, ChevronRight, Mail, Phone, Globe, MapPin, Plus, Pencil, Check, X, Search, UserPlus, Download, CheckSquare, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCompaniesContext, Company } from '@/contexts/CompaniesContext';
import { useContactsContext } from '@/contexts/ContactsContext';
import { useBookings } from '@/contexts/BookingsContext';
import { useInquiriesContext } from '@/contexts/InquiriesContext';
import { useTasksContext } from '@/contexts/TasksContext';
import { useContactCompanies } from '@/hooks/useContactCompanies';
import { useToast } from '@/hooks/use-toast';
import { mockQuotations } from '@/data/mockData';

import CompanyActivityTimeline from '@/components/company/CompanyActivityTimeline';
import { SectionCard } from '@/components/detail/DetailPageComponents';

const STATUS_LABELS: Record<string, string> = {
  lead: 'Lead',
  prospect: 'Prospect',
  client: 'Klant',
  inactive: 'Inactief',
  do_not_contact: 'Niet benaderen',
};

const BOOKING_STATUS: Record<string, string> = {
  confirmed: 'Bevestigd',
  option: 'Optie',
};

const INQUIRY_STATUS: Record<string, string> = {
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

interface EditableFieldProps {
  label: string;
  value?: string;
  fieldKey: string;
  editing: string | null;
  editValues: Record<string, string>;
  onStartEdit: (key: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onChange: (key: string, val: string) => void;
  multiline?: boolean;
}

function EditableField({ label, value, fieldKey, editing, editValues, onStartEdit, onSave, onCancel, onChange, multiline }: EditableFieldProps) {
  const isEditing = editing === fieldKey;
  return (
    <div className="group">
      <p className="text-xs font-semibold text-muted-foreground mb-0.5">{label}</p>
      {isEditing ? (
        <div className="flex items-start gap-1">
          {multiline ? (
            <Textarea
              className="text-sm min-h-[60px]"
              value={editValues[fieldKey] ?? ''}
              onChange={(e) => onChange(fieldKey, e.target.value)}
              autoFocus
            />
          ) : (
            <Input
              className="text-sm h-7"
              value={editValues[fieldKey] ?? ''}
              onChange={(e) => onChange(fieldKey, e.target.value)}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel(); }}
            />
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onSave}><Check size={14} /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onCancel}><X size={14} /></Button>
        </div>
      ) : (
        <button
          onClick={() => onStartEdit(fieldKey)}
          className="w-full text-left flex items-center gap-1 group/edit hover:bg-muted/50 rounded px-1 -mx-1 py-0.5 transition-colors"
        >
          <span className="text-sm text-foreground">{value || '—'}</span>
          <Pencil size={12} className="text-muted-foreground opacity-0 group-hover/edit:opacity-100 transition-opacity shrink-0" />
        </button>
      )}
    </div>
  );
}

export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { companies, loading: companiesLoading, updateCompany } = useCompaniesContext();
  const { contacts, loading: contactsLoading, updateContact, addContact } = useContactsContext();
  const { bookings, loading: bookingsLoading } = useBookings();
  const { inquiries } = useInquiriesContext();
  const { tasks } = useTasksContext();
  const { getCompanyContacts, linkContact, unlinkContact, loading: linksLoading } = useContactCompanies();
  const { toast } = useToast();

  const [editing, setEditing] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [showAllContacts, setShowAllContacts] = useState(false);
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [addContactTab, setAddContactTab] = useState<string>('link');
  const [linkSearch, setLinkSearch] = useState('');
  const [newContactForm, setNewContactForm] = useState({ firstName: '', lastName: '', email: '', phone: '' });

  const company = companies.find((c) => c.id === id);

  // Get contacts from junction table + legacy company_id
  const companyContacts = useMemo(() => {
    if (!company) return [];
    const junctionContactIds = new Set(getCompanyContacts(company.id).map((l) => l.contactId));
    return contacts.filter(
      (c) => junctionContactIds.has(c.id) || c.companyId === company.id || (!c.companyId && c.company && c.company.toLowerCase() === company.name.toLowerCase())
    );
  }, [contacts, company, getCompanyContacts]);

  const contactIds = useMemo(() => new Set(companyContacts.map((c) => c.id)), [companyContacts]);

  const confirmedBookings = useMemo(() => bookings.filter((b) => b.contactId && contactIds.has(b.contactId) && b.status !== 'option'), [bookings, contactIds]);
  const optionBookings = useMemo(() => bookings.filter((b) => b.contactId && contactIds.has(b.contactId) && b.status === 'option'), [bookings, contactIds]);
  const companyInquiries = useMemo(() => inquiries.filter((i) => i.contactId && contactIds.has(i.contactId)), [inquiries, contactIds]);
  const companyTasks = useMemo(() => tasks.filter((t) => (t.contactId && contactIds.has(t.contactId)) || (t.companyId === company?.id)), [tasks, contactIds, company]);

  const visibleContacts = showAllContacts ? companyContacts : companyContacts.slice(0, 4);

  const linkableContacts = useMemo(() => {
    const idSet = new Set(companyContacts.map((c) => c.id));
    return contacts.filter((c) => !idSet.has(c.id));
  }, [contacts, companyContacts]);

  const filteredLinkable = useMemo(() => {
    if (!linkSearch.trim()) return [];
    const terms = linkSearch.toLowerCase().split(/\s+/);
    return linkableContacts.filter((c) => {
      const haystack = `${c.firstName} ${c.lastName} ${c.email} ${c.phone} ${c.company || ''}`.toLowerCase();
      return terms.every((t) => haystack.includes(t));
    }).slice(0, 10);
  }, [linkableContacts, linkSearch]);

  if (companiesLoading || contactsLoading || bookingsLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-muted-foreground">Laden...</div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="p-6 lg:p-8 space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/companies')}>
          <ArrowLeft size={14} className="mr-1" /> Terug
        </Button>
        <p className="text-muted-foreground">Bedrijf niet gevonden.</p>
      </div>
    );
  }

  const startEdit = (key: string) => {
    setEditing(key);
    setEditValues({ [key]: (company as any)[key] || '' });
  };

  const cancelEdit = () => { setEditing(null); setEditValues({}); };

  const saveEdit = async () => {
    if (!editing) return;
    const updated = { ...company, [editing]: editValues[editing]?.trim() || undefined } as Company;
    await updateCompany(updated);
    setEditing(null);
    setEditValues({});
  };

  const changeVal = (key: string, val: string) => setEditValues((prev) => ({ ...prev, [key]: val }));

  const fieldProps = {
    editing, editValues, onStartEdit: startEdit, onSave: saveEdit, onCancel: cancelEdit, onChange: changeVal,
  };

  const handleLinkContact = async (contactId: string) => {
    const c = contacts.find((ct) => ct.id === contactId);
    if (!c || !company) return;
    // Add to junction table
    await linkContact(contactId, company.id);
    // Also set primary company_id if contact has none
    if (!c.companyId) {
      await updateContact({ ...c, company: company.name, companyId: company.id });
    }
    toast({ title: `${c.firstName} ${c.lastName} gekoppeld aan ${company.name}` });
    setAddContactOpen(false);
    setLinkSearch('');
  };

  const handleUnlinkContact = async (contactId: string) => {
    const c = contacts.find((ct) => ct.id === contactId);
    if (!c || !company) return;
    await unlinkContact(contactId, company.id);
    // If this was the primary company, clear it
    if (c.companyId === company.id) {
      await updateContact({ ...c, company: undefined, companyId: undefined });
    }
    toast({ title: `${c.firstName} ${c.lastName} ontkoppeld van ${company.name}` });
  };

  const handleCreateContact = async () => {
    if (!newContactForm.firstName || !newContactForm.lastName) {
      toast({ title: 'Vul minimaal voor- en achternaam in', variant: 'destructive' });
      return;
    }
    await addContact({
      firstName: newContactForm.firstName,
      lastName: newContactForm.lastName,
      email: newContactForm.email,
      phone: newContactForm.phone,
      company: company.name,
      companyId: company.id,
      status: 'lead',
    });
    // The addContact sets company_id, the auto_link trigger + junction table seed will handle it
    // But also add to junction table explicitly
    // We need the new contact ID - refetch will handle it via realtime
    toast({ title: `${newContactForm.firstName} ${newContactForm.lastName} aangemaakt en gekoppeld` });
    setAddContactOpen(false);
    setNewContactForm({ firstName: '', lastName: '', email: '', phone: '' });
  };

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <button onClick={() => navigate('/companies')} className="hover:text-foreground transition-colors">Bedrijven</button>
        <ChevronRight size={14} />
        <span className="text-foreground font-medium">{company.displayNumber && <span className="font-mono text-xs text-muted-foreground mr-2">{company.displayNumber}</span>}{company.name}</span>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* LEFT SIDEBAR — Company Info */}
        <div className="w-full lg:w-80 shrink-0 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Building2 size={24} />
            </div>
            <EditableField label="" value={company.name} fieldKey="name" {...fieldProps} />
          </div>

          <div className="space-y-3">
            <EditableField label="KVK" value={company.kvk} fieldKey="kvk" {...fieldProps} />
            <EditableField label="Adres" value={company.address} fieldKey="address" {...fieldProps} />
            <EditableField label="Plaats" value={company.city} fieldKey="city" {...fieldProps} />
            <EditableField label="Postcode" value={company.postcode} fieldKey="postcode" {...fieldProps} />
            <EditableField label="Land" value={company.country} fieldKey="country" {...fieldProps} />
            <EditableField label="Klantnummer" value={company.customerNumber} fieldKey="customerNumber" {...fieldProps} />
            <EditableField label="E-mail Bedrijf" value={company.email} fieldKey="email" {...fieldProps} />
            <EditableField label="Telefoon" value={company.phone} fieldKey="phone" {...fieldProps} />
            <EditableField label="Website" value={company.website} fieldKey="website" {...fieldProps} />
            <EditableField label="CRM Groep | Doelgroep" value={company.crmGroup} fieldKey="crmGroup" {...fieldProps} />
            <EditableField label="BTW nummer" value={company.btwNumber} fieldKey="btwNumber" {...fieldProps} />
            <EditableField label="Notities" value={company.notes} fieldKey="notes" {...fieldProps} multiline />
          </div>

          <p className="text-xs text-muted-foreground">Aangemaakt: {company.createdAt}</p>
        </div>

        {/* RIGHT CONTENT */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Aanvragen */}
          <SectionCard title="Aanvragen" count={companyInquiries.length} linkLabel="Bekijk alle aanvragen" onLink={() => navigate('/inquiries')} onAdd={() => navigate('/inquiries?new=true')}>
            {companyInquiries.length === 0 ? (
              <p className="text-xs text-muted-foreground">Geen aanvragen</p>
            ) : (
              <div className="space-y-3">
                {companyInquiries.slice(0, 8).map((inq) => (
                  <button
                    key={inq.id}
                    onClick={() => navigate(`/inquiries/${inq.id}`)}
                    className="w-full text-left rounded-lg border border-border/50 p-3 hover:bg-muted/30 transition-colors space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-foreground">{inq.eventType}</span>
                      <div className="flex items-center gap-2">
                        {!inq.isRead && <span className="inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-bold bg-destructive text-destructive-foreground">New</span>}
                        <Badge variant="outline" className="text-[10px]">{INQUIRY_STATUS[inq.status] || inq.status}</Badge>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground">
                      <span>{inq.createdAt}</span>
                      <span>{inq.contactName}</span>
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
          <SectionCard title="Reserveringen" count={companyBookings.length} linkLabel="Bekijk agenda" onLink={() => navigate('/calendar')} onAdd={() => navigate('/calendar?new=true')}>
            {companyBookings.length === 0 ? (
              <p className="text-xs text-muted-foreground">Geen reserveringen</p>
            ) : (
              <div className="space-y-1">
                {companyBookings
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .slice(0, 8)
                  .map((b) => (
                    <button
                      key={b.id}
                      onClick={() => navigate(`/reserveringen/${b.id}`)}
                      className="w-full flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors text-left text-xs"
                    >
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-foreground">{b.title}</span>
                        <span className="text-muted-foreground ml-2">{b.roomName}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-muted-foreground">{b.date} · {String(b.startHour).padStart(2, '0')}:{String(b.startMinute).padStart(2, '0')}–{String(b.endHour).padStart(2, '0')}:{String(b.endMinute).padStart(2, '0')}</span>
                        <Badge variant={b.status === 'confirmed' ? 'default' : 'outline'} className="text-[10px]">
                          {BOOKING_STATUS[b.status] || b.status}
                        </Badge>
                      </div>
                    </button>
                  ))}
              </div>
            )}
          </SectionCard>

          {/* Opties */}
          <SectionCard title="Opties" count={optionBookings.length} linkLabel="Bekijk agenda" onLink={() => navigate('/calendar')} onAdd={() => navigate('/calendar?new=true')}>
            {optionBookings.length === 0 ? (
              <p className="text-xs text-muted-foreground">Geen opties</p>
            ) : (
              <div className="space-y-1">
                {optionBookings
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .slice(0, 8)
                  .map((b) => (
                    <button
                      key={b.id}
                      onClick={() => navigate(`/reserveringen/${b.id}`)}
                      className="w-full flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors text-left text-xs"
                    >
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-foreground">{b.title}</span>
                        <span className="text-muted-foreground ml-2">{b.roomName}</span>
                      </div>
                      <span className="text-muted-foreground shrink-0">{b.date} · {String(b.startHour).padStart(2, '0')}:{String(b.startMinute).padStart(2, '0')} – {String(b.endHour).padStart(2, '0')}:{String(b.endMinute).padStart(2, '0')}</span>
                    </button>
                  ))}
              </div>
            )}
          </SectionCard>

          {/* Taken */}
          <SectionCard title="Taken" count={companyTasks.length}>
            {companyTasks.length === 0 ? (
              <p className="text-xs text-muted-foreground">Geen taken</p>
            ) : (
              <div className="space-y-1">
                {companyTasks.slice(0, 8).map((t) => (
                  <div key={t.id} className="flex items-center gap-2 text-xs py-1.5 px-2">
                    <CheckSquare size={12} className={t.status === 'completed' ? 'text-success' : 'text-muted-foreground'} />
                    <span className={t.status === 'completed' ? 'line-through text-muted-foreground' : 'text-foreground'}>{t.title}</span>
                    {t.dueDate && <span className="text-muted-foreground ml-auto">{t.dueDate}</span>}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Offertes */}
          <OffertesSection contactIds={contactIds} navigate={navigate} />

          {/* Contactpersonen */}
          <SectionCard title="Contactpersonen" count={companyContacts.length} onAdd={() => { setAddContactOpen(true); setAddContactTab('link'); setLinkSearch(''); setNewContactForm({ firstName: '', lastName: '', email: '', phone: '' }); }}>
            {companyContacts.length === 0 ? (
              <p className="text-xs text-muted-foreground">Geen contactpersonen gevonden.</p>
            ) : (
              <div className="space-y-1">
                {visibleContacts.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors text-xs"
                  >
                    <button
                      onClick={() => navigate(`/crm/${c.id}`)}
                      className="flex-1 text-left min-w-0"
                    >
                      <span className={`font-medium ${c.departed ? 'text-muted-foreground/50' : 'text-foreground'}`}>{c.firstName} {c.lastName}</span>
                      {c.departed && <span className="text-[10px] text-muted-foreground/50 ml-1.5">(uit dienst)</span>}
                      {c.phone && <span className="text-muted-foreground ml-2">{c.phone}</span>}
                    </button>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {c.companyId !== company?.id && (
                        <Badge variant="outline" className="text-[9px] px-1">Secundair</Badge>
                      )}
                      <Badge variant={c.status === 'do_not_contact' ? 'destructive' : 'outline'} className="text-[10px]">{STATUS_LABELS[c.status] || c.status}</Badge>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleUnlinkContact(c.id); }}
                        className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        title="Ontkoppelen"
                      >
                        <Unlink size={11} />
                      </button>
                      <ChevronRight size={12} className="text-muted-foreground" />
                    </div>
                  </div>
                ))}
                {companyContacts.length > 4 && !showAllContacts && (
                  <button
                    onClick={() => setShowAllContacts(true)}
                    className="w-full text-center py-2 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
                  >
                    {companyContacts.length} contactpersonen (meer)
                  </button>
                )}
                {showAllContacts && companyContacts.length > 4 && (
                  <button
                    onClick={() => setShowAllContacts(false)}
                    className="w-full text-center py-2 text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
                  >
                    Minder tonen
                  </button>
                )}
              </div>
            )}
          </SectionCard>

          {/* Gesprekken van alle contactpersonen */}
          <div className="rounded-xl bg-card p-5 card-shadow space-y-3">
            <h3 className="text-base font-bold text-foreground">Gesprekken</h3>
            <CompanyActivityTimeline
              contactIds={companyContacts.map((c) => c.id)}
              contactNames={Object.fromEntries(companyContacts.map((c) => [c.id, `${c.firstName} ${c.lastName}`]))}
            />
          </div>
        </div>
      </div>

      {/* Add/Link Contact Dialog */}
      <Dialog open={addContactOpen} onOpenChange={setAddContactOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
           <DialogTitle>Contactpersoon toevoegen aan {company.name}</DialogTitle>
            <DialogDescription>Koppel een bestaand contact of maak een nieuw contact aan.</DialogDescription>
          </DialogHeader>
          <Tabs value={addContactTab} onValueChange={setAddContactTab}>
            <TabsList className="w-full">
              <TabsTrigger value="link" className="flex-1">Bestaand contact koppelen</TabsTrigger>
              <TabsTrigger value="new" className="flex-1">Nieuw contact aanmaken</TabsTrigger>
            </TabsList>
            <TabsContent value="link" className="space-y-3 pt-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Zoek op naam, email of telefoon..."
                  className="pl-9"
                  value={linkSearch}
                  onChange={(e) => setLinkSearch(e.target.value)}
                  autoFocus
                />
              </div>
              {linkSearch.trim() && filteredLinkable.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-3">Geen contacten gevonden</p>
              )}
              <div className="max-h-60 overflow-y-auto space-y-1">
                {filteredLinkable.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleLinkContact(c.id)}
                    className="w-full flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted/50 transition-colors text-left text-sm"
                  >
                    <div>
                      <span className="font-medium text-foreground">{c.firstName} {c.lastName}</span>
                      {c.company && <span className="text-muted-foreground ml-2 text-xs">({c.company})</span>}
                      <div className="text-xs text-muted-foreground">
                        {c.email && <span>{c.email}</span>}
                        {c.email && c.phone && <span> · </span>}
                        {c.phone && <span>{c.phone}</span>}
                      </div>
                    </div>
                    <UserPlus size={14} className="text-primary shrink-0" />
                  </button>
                ))}
              </div>
              {!linkSearch.trim() && (
                <p className="text-xs text-muted-foreground text-center py-2">Typ om te zoeken in bestaande contacten</p>
              )}
            </TabsContent>
            <TabsContent value="new" className="space-y-3 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Voornaam *</Label>
                  <Input value={newContactForm.firstName} onChange={(e) => setNewContactForm({ ...newContactForm, firstName: e.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Achternaam *</Label>
                  <Input value={newContactForm.lastName} onChange={(e) => setNewContactForm({ ...newContactForm, lastName: e.target.value })} />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label>Email</Label>
                <Input type="email" value={newContactForm.email} onChange={(e) => setNewContactForm({ ...newContactForm, email: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Telefoon</Label>
                <Input value={newContactForm.phone} onChange={(e) => setNewContactForm({ ...newContactForm, phone: e.target.value })} />
              </div>
              <Button className="w-full" onClick={handleCreateContact}>Aanmaken & koppelen</Button>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OffertesSection({ contactIds, navigate }: { contactIds: Set<string>; navigate: (path: string) => void }) {
  const quotations = useMemo(() => mockQuotations.filter((q) => contactIds.has(q.contactId)), [contactIds]);

  return (
    <SectionCard title="Offertes" count={quotations.length} linkLabel="Bekijk offertes" onLink={() => navigate('/quotations')}>
      {quotations.length === 0 ? (
        <p className="text-xs text-muted-foreground">Geen offertes</p>
      ) : (
        <div className="space-y-1">
          {quotations.slice(0, 8).map((q) => (
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
  );
}

/* SectionCard is now imported from @/components/detail/DetailPageComponents */
