import { useParams, useNavigate } from 'react-router-dom';
import { useState, useMemo, useEffect } from 'react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { useInquiriesContext } from '@/contexts/InquiriesContext';
import { useContactsContext } from '@/contexts/ContactsContext';
import { useCompaniesContext } from '@/contexts/CompaniesContext';
import { useBookings } from '@/contexts/BookingsContext';
import { useTasksContext } from '@/contexts/TasksContext';
import { Inquiry, ROOMS } from '@/types/crm';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, ChevronRight, Pencil, Check, X, Calendar as CalendarIcon, Users, Euro, User, Building2, FileText, CheckSquare, MapPin, Clock, Trash2, RefreshCw } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const PIPELINE_COLUMNS: { key: Inquiry['status']; label: string; badgeClass: string }[] = [
  { key: 'new', label: 'Nieuwe Aanvraag', badgeClass: 'status-new' },
  { key: 'contacted', label: 'Lopend Contact', badgeClass: 'status-contacted' },
  { key: 'option', label: 'Optie', badgeClass: 'status-option' },
  { key: 'quoted', label: 'Offerte Verzonden', badgeClass: 'status-quoted' },
  { key: 'quote_revised', label: 'Aangepaste Offerte', badgeClass: 'status-quoted' },
  { key: 'reserved', label: 'Reservering', badgeClass: 'status-converted' },
  { key: 'script', label: 'Draaiboek Maken', badgeClass: 'status-option' },
  { key: 'confirmed', label: 'Definitieve Reservering', badgeClass: 'status-converted' },
  { key: 'invoiced', label: 'Facturatie', badgeClass: 'status-new' },
  { key: 'lost', label: 'Vervallen / Verloren', badgeClass: 'status-lost' },
  { key: 'converted', label: 'Omgezet', badgeClass: 'status-converted' },
  { key: 'after_sales', label: 'After Sales', badgeClass: 'status-converted' },
];

export default function InquiryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { inquiries, loading: inquiriesLoading, updateInquiry, deleteInquiry, markAsRead, refetch } = useInquiriesContext();
  const { contacts } = useContactsContext();
  const { companies } = useCompaniesContext();
  const { bookings } = useBookings();
  const { tasks } = useTasksContext();
  const { toast } = useToast();

  const inquiry = inquiries.find((i) => i.id === id);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Inquiry | null>(null);
  const [enriching, setEnriching] = useState(false);

  // Mark as read when opening
  useEffect(() => {
    if (inquiry && !inquiry.isRead) {
      markAsRead(inquiry.id);
    }
  }, [inquiry?.id]);

  const contact = useMemo(() => inquiry?.contactId ? contacts.find(c => c.id === inquiry.contactId) : null, [inquiry, contacts]);
  const company = useMemo(() => contact?.companyId ? companies.find(co => co.id === contact.companyId) : null, [contact, companies]);
  const relatedBookings = useMemo(() => inquiry ? bookings.filter(b => b.contactName === inquiry.contactName && b.title === inquiry.eventType) : [], [bookings, inquiry]);
  const contactInquiries = useMemo(() => inquiry?.contactId ? inquiries.filter(i => i.contactId === inquiry.contactId && i.id !== id) : [], [inquiries, inquiry, id]);
  const contactBookings = useMemo(() => inquiry?.contactId ? bookings.filter(b => b.contactId === inquiry.contactId) : [], [bookings, inquiry]);
  const inquiryTasks = useMemo(() => inquiry ? tasks.filter(t => t.inquiryId === inquiry.id) : [], [tasks, inquiry]);
  const col = useMemo(() => inquiry ? PIPELINE_COLUMNS.find(c => c.key === inquiry.status) : null, [inquiry]);

  if (inquiriesLoading) {
    return (
      <div className="p-6 lg:p-8 space-y-4 animate-fade-in">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Skeleton className="h-4 w-20" />
          <ChevronRight size={14} />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="w-full lg:w-80 shrink-0 space-y-5">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-5 w-24" />
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          </div>
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
          </div>
        </div>
      </div>
    );
  }

  if (!inquiry) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-muted-foreground">Aanvraag niet gevonden</p>
          <Button variant="outline" onClick={() => navigate('/inquiries')}>
            <ArrowLeft size={14} className="mr-1" /> Terug naar Aanvragen
          </Button>
        </div>
      </div>
    );
  }

  const startEdit = () => { setForm({ ...inquiry }); setEditing(true); };
  const cancelEdit = () => { setForm(null); setEditing(false); };
  const saveEdit = async () => {
    if (!form) return;
    if (!form.contactName || !form.eventType) {
      toast({ title: 'Vul minimaal naam en type in', variant: 'destructive' });
      return;
    }
    await updateInquiry(form);
    setEditing(false);
    setForm(null);
    toast({ title: 'Aanvraag bijgewerkt' });
  };
  const handleDelete = async () => {
    await deleteInquiry(inquiry.id);
    toast({ title: 'Aanvraag verwijderd' });
    navigate('/inquiries');
  };

  const current = editing ? form! : inquiry;

  return (
    <div className="p-6 lg:p-8 space-y-4 animate-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <button onClick={() => navigate('/inquiries')} className="hover:text-foreground transition-colors">Aanvragen</button>
        <ChevronRight size={14} />
        <span className="text-foreground font-medium">
          {inquiry.displayNumber && <span className="font-mono text-xs text-muted-foreground mr-2">{inquiry.displayNumber}</span>}
          {inquiry.eventType}
        </span>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* LEFT SIDEBAR */}
        <div className="w-full lg:w-80 shrink-0 space-y-5">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-foreground">{current.eventType}</h1>
            {!editing ? (
              <Button variant="ghost" size="icon" onClick={startEdit} className="h-8 w-8"><Pencil size={14} /></Button>
            ) : (
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={cancelEdit} className="h-8 w-8 text-muted-foreground"><X size={14} /></Button>
                <Button variant="ghost" size="icon" onClick={saveEdit} className="h-8 w-8 text-success"><Check size={14} /></Button>
              </div>
            )}
          </div>

          {/* Status */}
          <Badge variant="secondary" className={cn('text-[11px] font-medium', col?.badgeClass)}>{col?.label}</Badge>

          <div className="space-y-4 text-sm">
            {editing ? (
              <div className="space-y-3">
                <div><Label>Contactpersoon</Label><Input value={form!.contactName} onChange={(e) => setForm({ ...form!, contactName: e.target.value })} /></div>
                <div><Label>Type evenement</Label><Input value={form!.eventType} onChange={(e) => setForm({ ...form!, eventType: e.target.value })} /></div>
                <div><Label>Voorkeursdatum</Label><Input type="date" value={form!.preferredDate} onChange={(e) => setForm({ ...form!, preferredDate: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label>Gasten</Label><Input type="number" min={0} value={form!.guestCount || ''} onChange={(e) => setForm({ ...form!, guestCount: Number(e.target.value) })} /></div>
                  <div><Label>Budget (€)</Label><Input type="number" min={0} value={form!.budget || ''} onChange={(e) => setForm({ ...form!, budget: Number(e.target.value) || undefined })} /></div>
                </div>
                <div>
                  <Label>Ruimte voorkeur</Label>
                  <Select value={form!.roomPreference || ''} onValueChange={(v) => setForm({ ...form!, roomPreference: v })}>
                    <SelectTrigger><SelectValue placeholder="Optioneel" /></SelectTrigger>
                    <SelectContent>{ROOMS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={form!.status} onValueChange={(v: Inquiry['status']) => setForm({ ...form!, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{PIPELINE_COLUMNS.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Bron</Label>
                  <Select value={form!.source} onValueChange={(v) => setForm({ ...form!, source: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Handmatig">Handmatig</SelectItem>
                      <SelectItem value="Website">Website</SelectItem>
                      <SelectItem value="Telefoon">Telefoon</SelectItem>
                      <SelectItem value="Email">Email</SelectItem>
                      <SelectItem value="GHL">VirtuGrow</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Notities</Label><Textarea value={form!.message} onChange={(e) => setForm({ ...form!, message: e.target.value })} rows={4} /></div>
                <Button variant="destructive" size="sm" className="w-full mt-2" onClick={handleDelete}><Trash2 size={14} className="mr-1" /> Aanvraag verwijderen</Button>
              </div>
            ) : (
              <div className="space-y-3">
                <InfoRow icon={<User size={14} />} label="Contactpersoon" value={inquiry.contactName} onClick={contact ? () => navigate(`/crm/${contact.id}`) : undefined} />
                {company && <InfoRow icon={<Building2 size={14} />} label="Bedrijf" value={company.name} onClick={() => navigate(`/companies/${company.id}`)} />}
                <InfoRow icon={<CalendarIcon size={14} />} label="Voorkeursdatum" value={inquiry.preferredDate || '—'} />
                <InfoRow icon={<Users size={14} />} label="Gasten" value={`${inquiry.guestCount}`} />
                <InfoRow icon={<Euro size={14} />} label="Budget" value={inquiry.budget ? `€${inquiry.budget.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}` : '—'} />
                {inquiry.roomPreference && <InfoRow icon={<MapPin size={14} />} label="Ruimte voorkeur" value={inquiry.roomPreference} />}
                <InfoRow icon={<FileText size={14} />} label="Bron" value={inquiry.source === 'GHL' ? 'VirtuGrow' : inquiry.source} />
                <p className="text-xs text-muted-foreground pt-2">Aangemaakt: {inquiry.createdAt}</p>
                {inquiry.ghlOpportunityId && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-2"
                    disabled={enriching}
                    onClick={async () => {
                      setEnriching(true);
                      try {
                        const { data, error } = await supabase.functions.invoke('ghl-enrich-inquiry', {
                          body: { inquiry_id: inquiry.id },
                        });
                        if (error) throw error;
                        await refetch();
                        toast({ title: 'Formuliergegevens opgehaald', description: `${(data?.fieldsFound || []).length} velden gevonden` });
                      } catch (e: any) {
                        toast({ title: 'Fout bij ophalen', description: e.message, variant: 'destructive' });
                      } finally {
                        setEnriching(false);
                      }
                    }}
                  >
                    <RefreshCw size={14} className={cn("mr-1", enriching && "animate-spin")} />
                    {enriching ? 'Ophalen...' : 'Formuliergegevens ophalen uit VirtuGrow'}
                  </Button>
                )}
                {inquiry.message && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-0.5">Formuliergegevens / Notities</p>
                    <p className="text-foreground whitespace-pre-wrap">{inquiry.message}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT CONTENT */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Ingeplande reserveringen */}
          <SectionCard title={`Ingepland (${relatedBookings.length})`} linkLabel="Bekijk agenda" onLink={() => navigate('/calendar')}>
            {relatedBookings.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nog niet ingepland</p>
            ) : (
              <div className="space-y-1">
                {relatedBookings.map(b => (
                  <button key={b.id} onClick={() => navigate(`/reserveringen/${b.id}`)} className="w-full flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors text-left text-xs">
                    <div className="flex items-center gap-2">
                      <CalendarIcon size={12} className="text-muted-foreground" />
                      <span className="text-foreground">{format(new Date(b.date), 'd MMM yyyy', { locale: nl })}</span>
                      <span className="text-muted-foreground">{String(b.startHour).padStart(2, '0')}:{String(b.startMinute || 0).padStart(2, '0')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{b.roomName}</span>
                      <Badge variant="secondary" className={cn('text-[10px]', b.status === 'confirmed' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning')}>
                        {b.status === 'confirmed' ? 'Bevestigd' : 'Optie'}
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Contact info */}
          {contact && (
            <SectionCard title="Contactpersoon" linkLabel="Bekijk profiel" onLink={() => navigate(`/crm/${contact.id}`)}>
              <div className="space-y-1 text-xs">
                <p className="font-medium text-foreground">{contact.firstName} {contact.lastName}</p>
                {contact.email && <p className="text-muted-foreground">{contact.email}</p>}
                {contact.phone && <p className="text-muted-foreground">{contact.phone}</p>}
                <p className="text-muted-foreground mt-2">{contactInquiries.length + 1} aanvragen · {contactBookings.length} reserveringen</p>
              </div>
            </SectionCard>
          )}

          {/* Company */}
          {company && (
            <SectionCard title="Bedrijf" linkLabel="Bekijk bedrijf" onLink={() => navigate(`/companies/${company.id}`)}>
              <p className="text-xs font-medium text-foreground">{company.name}</p>
            </SectionCard>
          )}

          {/* Taken */}
          <SectionCard title={`Taken (${inquiryTasks.length})`}>
            {inquiryTasks.length === 0 ? (
              <p className="text-xs text-muted-foreground">Geen gekoppelde taken</p>
            ) : (
              <div className="space-y-1">
                {inquiryTasks.map(t => (
                  <div key={t.id} className="flex items-center gap-2 text-xs py-1">
                    <CheckSquare size={12} className={t.status === 'completed' ? 'text-success' : 'text-muted-foreground'} />
                    <span className={cn('text-foreground', t.status === 'completed' && 'line-through text-muted-foreground')}>{t.title}</span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Andere aanvragen van dit contact */}
          {contactInquiries.length > 0 && (
            <SectionCard title="Andere Aanvragen" linkLabel="Pipeline" onLink={() => navigate('/inquiries')}>
              <div className="space-y-1">
                {contactInquiries.slice(0, 5).map(inq => {
                  const c = PIPELINE_COLUMNS.find(col => col.key === inq.status);
                  return (
                    <button key={inq.id} onClick={() => navigate(`/inquiries/${inq.id}`)} className="w-full flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors text-left text-xs">
                      <span className="font-medium text-foreground">{inq.eventType}</span>
                      <Badge variant="secondary" className={cn('text-[10px]', c?.badgeClass)}>{c?.label}</Badge>
                    </button>
                  );
                })}
              </div>
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value, onClick }: { icon: React.ReactNode; label: string; value: string; onClick?: () => void }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground mb-0.5 flex items-center gap-1.5">{icon} {label}</p>
      {onClick ? (
        <button onClick={onClick} className="text-primary hover:underline font-medium text-sm">{value}</button>
      ) : (
        <p className="text-foreground">{value}</p>
      )}
    </div>
  );
}

function SectionCard({ title, children, linkLabel, onLink }: { title: string; children: React.ReactNode; linkLabel?: string; onLink?: () => void }) {
  return (
    <div className="rounded-xl bg-card p-5 card-shadow space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-foreground">{title}</h3>
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
