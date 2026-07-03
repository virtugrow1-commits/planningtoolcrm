import { formatDate } from '@/lib/formatters';
import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, ChevronRight, Plus, Pencil, Check, X, Search, UserPlus, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DMU_OPTIONS, FUNCTION_GROUP_OPTIONS } from '@/lib/contactOptions';
import { useCompaniesContext, Company } from '@/contexts/CompaniesContext';
import { useContactsContext } from '@/contexts/ContactsContext';
import { useBookings } from '@/contexts/BookingsContext';
import { useInquiriesContext } from '@/contexts/InquiriesContext';
import { useTasksContext } from '@/contexts/TasksContext';
import { useContactCompanies } from '@/hooks/useContactCompanies';
import { useToast } from '@/hooks/use-toast';
import { InfoField, SectionCard } from '@/components/detail/DetailPageComponents';
import CallLogPanel from '@/components/contact/CallLogPanel';
import TasksSection from '@/components/detail/TasksSection';
import HistorySection from '@/components/detail/HistorySection';

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
  condolence_reminder: 'Condoleance Herdenkingen',
};

const STATUS_LABELS: Record<string, string> = {
  lead: 'Lead',
  prospect: 'Prospect',
  client: 'Klant',
  inactive: 'Inactief',
  do_not_contact: 'Niet benaderen',
};

export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { companies, loading: companiesLoading, updateCompany } = useCompaniesContext();
  const { contacts, loading: contactsLoading, updateContact, addContact } = useContactsContext();
  const { bookings, loading: bookingsLoading } = useBookings();
  const { inquiries } = useInquiriesContext();
  const { tasks } = useTasksContext();
  const { getCompanyContacts, linkContact, unlinkContact } = useContactCompanies();
  const { toast } = useToast();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Company | null>(null);
  const [showAllContacts, setShowAllContacts] = useState(false);
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [addContactTab, setAddContactTab] = useState<string>('link');
  const [linkSearch, setLinkSearch] = useState('');
  const [newContactForm, setNewContactForm] = useState({ firstName: '', lastName: '', email: '', phone: '', dmu: '', functionGroup: '' });

  const company = companies.find((c) => c.id === id);

  const companyContacts = useMemo(() => {
    if (!company) return [];
    const junctionContactIds = new Set(getCompanyContacts(company.id).map((l) => l.contactId));
    return contacts.filter((c) => junctionContactIds.has(c.id) || c.companyId === company.id);
  }, [contacts, company, getCompanyContacts]);

  const contactIds = useMemo(() => new Set(companyContacts.map((c) => c.id)), [companyContacts]);

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const confirmedBookings = useMemo(() => bookings.filter((b) => (b.companyId === company?.id || (b.contactId && contactIds.has(b.contactId))) && b.status !== 'option' && b.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date)), [bookings, contactIds, company, todayStr]);
  const optionBookings = useMemo(() => bookings.filter((b) => (b.companyId === company?.id || (b.contactId && contactIds.has(b.contactId))) && b.status === 'option' && b.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date)), [bookings, contactIds, company, todayStr]);
  const companyInquiries = useMemo(() => inquiries.filter((i) => i.companyId === company?.id || (i.contactId && contactIds.has(i.contactId))), [inquiries, contactIds, company]);
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

  const current = editing && form ? form : company;

  const startEdit = () => {
    setForm({ ...company });
    setEditing(true);
  };

  const cancelEdit = () => {
    setForm(null);
    setEditing(false);
  };

  const saveEdit = async () => {
    if (!form) return;
    if (!form.name?.trim()) {
      toast({ title: 'Bedrijfsnaam is verplicht', variant: 'destructive' });
      return;
    }
    const outcome = await updateCompany(form);
    setEditing(false);
    setForm(null);
    if (outcome === 'success' || outcome === 'inactive') {
      toast({ title: 'Bedrijf bijgewerkt', description: 'Wijziging gesynchroniseerd met VirtuGrow.' });
    } else if (outcome === 'queued') {
      toast({ title: 'Bedrijf lokaal opgeslagen', description: 'VirtuGrow is tijdelijk niet bereikbaar — wijziging staat in de wachtrij en wordt automatisch opnieuw verstuurd.' });
    } else if (outcome === 'error') {
      toast({ title: 'Opslaan mislukt', description: 'De wijziging kon niet worden opgeslagen.', variant: 'destructive' });
    } else {
      toast({ title: 'Bedrijf bijgewerkt' });
    }
  };

  const handleLinkContact = async (contactId: string) => {
    const c = contacts.find((ct) => ct.id === contactId);
    if (!c || !company) return;
    await linkContact(contactId, company.id);
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
      dmu: newContactForm.dmu || undefined,
      functionGroup: newContactForm.functionGroup || undefined,
    });
    toast({ title: `${newContactForm.firstName} ${newContactForm.lastName} aangemaakt en gekoppeld` });
    setAddContactOpen(false);
    setNewContactForm({ firstName: '', lastName: '', email: '', phone: '', dmu: '', functionGroup: '' });
  };

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <button onClick={() => navigate('/companies')} className="hover:text-foreground transition-colors">Bedrijven</button>
        <ChevronRight size={14} />
        <span className="text-foreground font-medium">
          {company.displayNumber && <span className="font-mono text-xs text-muted-foreground mr-2">{company.displayNumber}</span>}
          {company.name}
        </span>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* LEFT SIDEBAR — Company Info */}
        <div className="w-full lg:w-80 shrink-0 space-y-4">
          <div className="rounded-xl bg-card p-5 card-shadow space-y-4">
            {/* Header with edit controls */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                  <Building2 size={20} />
                </div>
                <div className="min-w-0">
                  {editing ? (
                    <Input
                      className="h-8 text-sm font-semibold"
                      value={form?.name || ''}
                      onChange={(e) => setForm({ ...form!, name: e.target.value })}
                      autoFocus
                    />
                  ) : (
                    <p className="font-semibold text-foreground leading-tight">{company.name}</p>
                  )}
                  {company.displayNumber && (
                    <p className="text-xs text-muted-foreground font-mono">{company.displayNumber}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {!editing ? (
                  <Button variant="ghost" size="icon" onClick={startEdit} className="h-8 w-8">
                    <Pencil size={14} />
                  </Button>
                ) : (
                  <>
                    <Button variant="ghost" size="icon" onClick={cancelEdit} className="h-8 w-8 text-muted-foreground">
                      <X size={14} />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={saveEdit} className="h-8 w-8 text-green-600">
                      <Check size={14} />
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Fields */}
            <div className="space-y-3">
              <InfoField label="KVK" value={current.kvk} editing={editing} onChange={(v) => setForm({ ...form!, kvk: v })} />
              <InfoField label="BTW nummer" value={current.btwNumber} editing={editing} onChange={(v) => setForm({ ...form!, btwNumber: v })} />
              <InfoField label="Klantnummer" value={current.customerNumber} editing={editing} onChange={(v) => setForm({ ...form!, customerNumber: v })} />
              <InfoField label="CRM Groep / Doelgroep" value={current.crmGroup} editing={editing} onChange={(v) => setForm({ ...form!, crmGroup: v })} />
              <div className="border-t border-border/40 pt-3 space-y-3">
                <InfoField label="Adres" value={current.address} editing={editing} onChange={(v) => setForm({ ...form!, address: v })} />
                <InfoField label="Postcode" value={current.postcode} editing={editing} onChange={(v) => setForm({ ...form!, postcode: v })} />
                <InfoField label="Plaats" value={current.city} editing={editing} onChange={(v) => setForm({ ...form!, city: v })} />
                <InfoField label="Land" value={current.country} editing={editing} onChange={(v) => setForm({ ...form!, country: v })} />
              </div>
              <div className="border-t border-border/40 pt-3 space-y-3">
                <InfoField label="E-mail" value={current.email} editing={editing} type="email" onChange={(v) => setForm({ ...form!, email: v })} />
                <InfoField label="Telefoon" value={current.phone} editing={editing} type="tel" onChange={(v) => setForm({ ...form!, phone: v })} />
                <InfoField label="Website" value={current.website} editing={editing} onChange={(v) => setForm({ ...form!, website: v })} />
              </div>
              <div className="border-t border-border/40 pt-3">
                <InfoField label="Notities" value={current.notes} editing={editing} multiline onChange={(v) => setForm({ ...form!, notes: v })} />
              </div>
            </div>

            <p className="text-xs text-muted-foreground pt-1">Aangemaakt: {formatDate(company.createdAt)}</p>
          </div>
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
                      <span>{formatDate(inq.createdAt)}</span>
                      <span>{inq.contactName}</span>
                      {inq.guestCount > 0 && <span>{inq.guestCount} gasten</span>}
                      {inq.roomPreference && <span>{inq.roomPreference}</span>}
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
          <SectionCard title="Reserveringen" count={confirmedBookings.length} linkLabel="Bekijk agenda" onLink={() => navigate('/calendar')} onAdd={() => navigate('/calendar?new=true')}>
            {confirmedBookings.length === 0 ? (
              <p className="text-xs text-muted-foreground">Geen reserveringen</p>
            ) : (
              <div className="space-y-1">
                {confirmedBookings
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
                        <Badge variant={b.date < new Date().toISOString().split('T')[0] ? 'secondary' : b.status === 'confirmed' ? 'default' : 'outline'} className="text-[10px]">
                          {b.date < new Date().toISOString().split('T')[0] ? 'Afgelopen' : BOOKING_STATUS[b.status] || b.status}
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
          <TasksSection tasks={companyTasks} defaults={{ companyId: company.id }} />

          {/* Historie */}
          <HistorySection
            bookings={bookings.filter((b) => b.contactId && contactIds.has(b.contactId))}
            inquiries={companyInquiries}
            inquiriesLabel="Aanvragen"
            inquiriesEmptyText="Geen aanvragen van dit bedrijf."
          />

          {/* Contactpersonen */}
          <SectionCard
            title="Contactpersonen"
            count={companyContacts.length}
            onAdd={() => { setAddContactOpen(true); setAddContactTab('link'); setLinkSearch(''); setNewContactForm({ firstName: '', lastName: '', email: '', phone: '', dmu: '', functionGroup: '' }); }}
          >
            {companyContacts.length === 0 ? (
              <p className="text-xs text-muted-foreground">Geen contactpersonen gevonden.</p>
            ) : (
              <div className="space-y-1">
                {visibleContacts.map((c) => (
                  <div key={c.id} className="flex items-start justify-between py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors text-xs">
                    <button onClick={() => navigate(`/crm/${c.id}`)} className="flex-1 text-left min-w-0">
                      <div>
                        <span className={`font-medium ${c.departed ? 'text-muted-foreground/50' : 'text-foreground'}`}>{c.firstName} {c.lastName}</span>
                        {c.departed && <span className="text-[10px] text-muted-foreground/50 ml-1.5">(uit dienst)</span>}
                        {c.phone && <span className="text-muted-foreground ml-2">{c.phone}</span>}
                      </div>
                      {(c.dmu || c.functionGroup || c.jobTitle) && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {c.jobTitle && <Badge variant="secondary" className="text-[9px] px-1 py-0 font-normal">{c.jobTitle}</Badge>}
                          {c.functionGroup && <Badge variant="outline" className="text-[9px] px-1 py-0 font-normal" title="Functiegroep">{c.functionGroup}</Badge>}
                          {c.dmu && <Badge variant="outline" className="text-[9px] px-1 py-0 font-normal" title="DMU">{c.dmu}</Badge>}
                        </div>
                      )}
                    </button>
                    <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                      {c.companyId !== company?.id && <Badge variant="outline" className="text-[9px] px-1">Secundair</Badge>}
                      {c.status === 'do_not_contact' && <Badge variant="destructive" className="text-[10px]">{STATUS_LABELS[c.status]}</Badge>}
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
                  <button onClick={() => setShowAllContacts(true)} className="w-full text-center py-2 text-xs text-primary hover:text-primary/80 font-medium transition-colors">
                    {companyContacts.length} contactpersonen — meer tonen
                  </button>
                )}
                {showAllContacts && companyContacts.length > 4 && (
                  <button onClick={() => setShowAllContacts(false)} className="w-full text-center py-2 text-xs text-muted-foreground hover:text-foreground font-medium transition-colors">
                    Minder tonen
                  </button>
                )}
              </div>
            )}
          </SectionCard>

          {/* Gespreksverslagen — aggregeert alle gekoppelde contacten */}
          <div className="rounded-xl bg-card p-5 card-shadow">
            <CallLogPanel
              contactIds={companyContacts.map((c) => c.id)}
              contactNames={Object.fromEntries(companyContacts.map((c) => [c.id, `${c.firstName} ${c.lastName}`]))}
              requireContactSelection
              defaultContactId={companyContacts.length === 1 ? companyContacts[0].id : undefined}
              emptyHint={
                companyContacts.length === 0
                  ? 'Koppel eerst een contactpersoon om gesprekken vast te leggen.'
                  : 'Nog geen gespreksverslagen — leg het eerste gesprek vast.'
              }
              readOnly={companyContacts.length === 0}
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
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>DMU</Label>
                  <Select value={newContactForm.dmu} onValueChange={(v) => setNewContactForm({ ...newContactForm, dmu: v })}>
                    <SelectTrigger><SelectValue placeholder="Kies DMU..." /></SelectTrigger>
                    <SelectContent>
                      {DMU_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Functiegroep</Label>
                  <Select value={newContactForm.functionGroup} onValueChange={(v) => setNewContactForm({ ...newContactForm, functionGroup: v })}>
                    <SelectTrigger><SelectValue placeholder="Kies functiegroep..." /></SelectTrigger>
                    <SelectContent>
                      {FUNCTION_GROUP_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button className="w-full" onClick={handleCreateContact}>Aanmaken & koppelen</Button>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
