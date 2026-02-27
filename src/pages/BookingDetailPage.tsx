import { useParams, useNavigate } from 'react-router-dom';
import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { useBookings } from '@/contexts/BookingsContext';
import { useContactsContext } from '@/contexts/ContactsContext';
import { useCompaniesContext } from '@/contexts/CompaniesContext';
import { useInquiriesContext } from '@/contexts/InquiriesContext';
import { useTasksContext } from '@/contexts/TasksContext';
import { useDocuments } from '@/hooks/useDocuments';
import { Booking, RoomName, ROOMS } from '@/types/crm';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, ChevronRight, Pencil, MapPin, Calendar as CalendarIcon, Clock, Users, ClipboardList, Package, User, Building2, FileText, CheckSquare, Trash2, History, Send, Eye, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InfoRow } from '@/components/detail/DetailPageComponents';
import TasksSection from '@/components/detail/TasksSection';

export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { bookings, loading: bookingsLoading, updateBooking, deleteBooking } = useBookings();
  const { contacts } = useContactsContext();
  const { companies } = useCompaniesContext();
  const { inquiries } = useInquiriesContext();
  const { tasks } = useTasksContext();
  const { documents } = useDocuments();
  const { toast } = useToast();

  const booking = bookings.find((b) => b.id === id);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Booking | null>(null);

  const contact = useMemo(() => booking?.contactId ? contacts.find(c => c.id === booking.contactId) : null, [booking, contacts]);
  const company = useMemo(() => contact?.companyId ? companies.find(co => co.id === contact.companyId) : null, [contact, companies]);

  const contactBookings = useMemo(() => contact ? bookings.filter(b => b.contactId === contact.id && b.id !== id) : [], [bookings, contact, id]);
  const contactInquiries = useMemo(() => contact ? inquiries.filter(i => i.contactId === contact.id) : [], [inquiries, contact]);
  const bookingTasks = useMemo(() => booking ? tasks.filter(t => t.bookingId === booking.id) : [], [tasks, booking]);
  const bookingDocuments = useMemo(() => booking ? documents.filter(d => (d.contactId && d.contactId === booking.contactId)) : [], [documents, booking]);

  const openTaskCount = bookingTasks.filter(t => t.status !== 'completed').length;

  if (bookingsLoading) {
    return (
      <div className="p-6 lg:p-8 space-y-4 animate-fade-in">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Skeleton className="h-4 w-20" />
          <ChevronRight size={14} />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-muted-foreground">Reservering niet gevonden</p>
          <Button variant="outline" onClick={() => navigate('/reserveringen')}>
            <ArrowLeft size={14} className="mr-1" /> Terug naar Reserveringen
          </Button>
        </div>
      </div>
    );
  }

  const startEdit = () => { setForm({ ...booking }); setEditing(true); };
  const cancelEdit = () => { setForm(null); setEditing(false); };
  const saveEdit = async () => {
    if (!form) return;
    await updateBooking(form);
    setEditing(false);
    setForm(null);
    toast({ title: 'Reservering bijgewerkt' });
  };
  const handleDelete = async () => {
    await deleteBooking(booking.id);
    toast({ title: 'Reservering verwijderd' });
    navigate('/reserveringen');
  };

  const formatTime = (h: number, m?: number) => `${String(h).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;
  const formatDate = (dateStr: string) => {
    try { return format(new Date(dateStr + 'T00:00:00'), 'EEEE d MMMM yyyy', { locale: nl }); } catch { return dateStr; }
  };

  const prepStatusLabel = (s?: string) => {
    switch (s) {
      case 'info_waiting': return 'Wacht op info';
      case 'in_progress': return 'In voorbereiding';
      case 'ready': return 'Gereed';
      default: return 'Open';
    }
  };
  const prepStatusColor = (s?: string) => {
    switch (s) {
      case 'info_waiting': return 'bg-warning/10 text-warning border-warning/20';
      case 'in_progress': return 'bg-primary/10 text-primary border-primary/20';
      case 'ready': return 'bg-success/10 text-success border-success/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const statusBadgeClass = booking.status === 'confirmed' ? 'bg-success/10 text-success border-success/20' : 'bg-warning/10 text-warning border-warning/20';
  const statusLabel = booking.status === 'confirmed' ? 'Bevestigd' : 'Optie';

  const current = editing ? form! : booking;

  // Split bookings into upcoming and past
  const today = new Date().toISOString().split('T')[0];
  const upcomingBookings = contactBookings.filter(b => b.date >= today);
  const pastBookings = contactBookings.filter(b => b.date < today);

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <button onClick={() => navigate('/reserveringen')} className="hover:text-foreground transition-colors">Reserveringen</button>
        <ChevronRight size={14} />
        <span className="text-foreground font-medium">
          {booking.reservationNumber && <span className="font-mono text-xs text-muted-foreground mr-2">{booking.reservationNumber}</span>}
          {booking.contactName}
        </span>
      </div>

      {/* Header - like InquiryDetailPage */}
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-foreground">{booking.contactName}</h1>
        <Select
          value={booking.status}
          onValueChange={async (v: 'confirmed' | 'option') => {
            await updateBooking({ ...booking, status: v });
            toast({ title: 'Status gewijzigd' });
          }}
        >
          <SelectTrigger className={cn('w-auto h-7 text-[11px] font-medium rounded-full px-3 border-0', statusBadgeClass)}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="confirmed">Bevestigd</SelectItem>
            <SelectItem value="option">Optie</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Two-column layout like InquiryDetailsTab */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Core details */}
        <div className="space-y-5">
          <div className="rounded-xl bg-card p-5 card-shadow space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-foreground">Reserveringsgegevens</h3>
              <Badge variant="secondary" className={cn('text-[11px] font-medium', statusBadgeClass)}>
                {statusLabel}
              </Badge>
            </div>

            {editing ? (
              <div className="space-y-3">
                <div><Label>Titel</Label><Input value={form!.title} onChange={(e) => setForm({ ...form!, title: e.target.value })} /></div>
                <div><Label>Contactpersoon</Label><Input value={form!.contactName} onChange={(e) => setForm({ ...form!, contactName: e.target.value })} /></div>
                <div>
                  <Label>Ruimte</Label>
                  <Select value={form!.roomName} onValueChange={(v) => setForm({ ...form!, roomName: v as RoomName })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{ROOMS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Datum</Label><Input type="date" value={form!.date} onChange={(e) => setForm({ ...form!, date: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label>Van</Label><Input type="time" value={formatTime(form!.startHour, form!.startMinute)} onChange={(e) => { const [h, m] = e.target.value.split(':').map(Number); if (!isNaN(h)) setForm({ ...form!, startHour: h, startMinute: m || 0 }); }} /></div>
                  <div><Label>Tot</Label><Input type="time" value={formatTime(form!.endHour, form!.endMinute)} onChange={(e) => { const [h, m] = e.target.value.split(':').map(Number); if (!isNaN(h)) setForm({ ...form!, endHour: h, endMinute: m || 0 }); }} /></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label>Gasten</Label><Input type="number" min={0} value={form!.guestCount || ''} onChange={(e) => setForm({ ...form!, guestCount: Math.max(0, Number(e.target.value)) })} /></div>
                  <div><Label>Opstelling</Label><Input value={form!.roomSetup || ''} onChange={(e) => setForm({ ...form!, roomSetup: e.target.value })} placeholder="U-vorm, Theater" /></div>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={form!.status} onValueChange={(v: 'confirmed' | 'option') => setForm({ ...form!, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="confirmed">Bevestigd</SelectItem>
                      <SelectItem value="option">Optie</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Voorbereiding</Label>
                  <Select value={form!.preparationStatus || 'pending'} onValueChange={(v) => setForm({ ...form!, preparationStatus: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Open</SelectItem>
                      <SelectItem value="info_waiting">Wacht op info</SelectItem>
                      <SelectItem value="in_progress">In voorbereiding</SelectItem>
                      <SelectItem value="ready">Gereed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Benodigdheden</Label><Textarea value={form!.requirements || ''} onChange={(e) => setForm({ ...form!, requirements: e.target.value })} placeholder="Beamer, flipover..." rows={3} /></div>
                <div><Label>Notities</Label><Textarea value={form!.notes || ''} onChange={(e) => setForm({ ...form!, notes: e.target.value })} rows={3} /></div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={cancelEdit}>Annuleren</Button>
                  <Button size="sm" className="flex-1" onClick={saveEdit}>Opslaan</Button>
                </div>
                <Button variant="destructive" size="sm" className="w-full" onClick={handleDelete}><Trash2 size={14} className="mr-1" /> Reservering verwijderen</Button>
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                <InfoRow icon={<User size={14} />} label="Contactpersoon" value={booking.contactName} onClick={contact ? () => navigate(`/crm/${contact.id}`) : undefined} />
                {company && <InfoRow icon={<Building2 size={14} />} label="Bedrijf" value={company.name} onClick={() => navigate(`/companies/${company.id}`)} />}
                <InfoRow icon={<CalendarIcon size={14} />} label="Datum" value={formatDate(booking.date)} />
                <InfoRow icon={<Clock size={14} />} label="Tijd" value={`${formatTime(booking.startHour, booking.startMinute)} – ${formatTime(booking.endHour, booking.endMinute)}`} />
                <InfoRow icon={<MapPin size={14} />} label="Ruimte" value={booking.roomName} />
                <InfoRow icon={<Users size={14} />} label="Gasten" value={`${booking.guestCount}`} />
                {booking.roomSetup && <InfoRow icon={<ClipboardList size={14} />} label="Opstelling" value={booking.roomSetup} />}
                <InfoRow icon={<FileText size={14} />} label="Voorbereiding" value={prepStatusLabel(booking.preparationStatus)} />
                <InfoRow icon={<FileText size={14} />} label="Evenement" value={booking.title} />
                <p className="text-xs text-muted-foreground pt-2">Aangemaakt: {booking.createdAt?.split('T')[0] || '—'}</p>

                <div className="flex gap-2 pt-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={startEdit}>Bewerken</Button>
                  <Button size="sm" className="flex-1" onClick={() => navigate(`/calendar?date=${booking.date}`)}>
                    <CalendarIcon size={14} className="mr-1" /> Bekijk in Agenda
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Contact card */}
          {contact && !editing && (
            <div className="rounded-xl bg-card p-5 card-shadow space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-foreground">Contactpersoon</h3>
                <button onClick={() => navigate(`/crm/${contact.id}`)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Bekijk profiel →</button>
              </div>
              <p className="text-sm font-medium text-foreground">{contact.firstName} {contact.lastName}</p>
              {contact.email && <p className="text-xs text-muted-foreground">{contact.email}</p>}
              {contact.phone && <p className="text-xs text-muted-foreground">{contact.phone}</p>}
            </div>
          )}
        </div>

        {/* Right: Extra info */}
        <div className="space-y-5">
          {/* Benodigdheden & Notities */}
          <div className="rounded-xl bg-card p-5 card-shadow space-y-3">
            <h3 className="text-base font-bold text-foreground">Details & Notities</h3>
            {booking.requirements ? (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-0.5 flex items-center gap-1.5"><Package size={14} /> Benodigdheden</p>
                <p className="text-sm text-foreground whitespace-pre-wrap">{booking.requirements}</p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Geen benodigdheden opgegeven.</p>
            )}
            {booking.notes ? (
              <div className="pt-2 border-t border-border">
                <p className="text-xs font-semibold text-muted-foreground mb-0.5">Notities</p>
                <p className="text-sm text-foreground whitespace-pre-wrap">{booking.notes}</p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">Geen notities.</p>
            )}
          </div>

          {/* Company card */}
          {company && !editing && (
            <div className="rounded-xl bg-card p-5 card-shadow space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-foreground">Bedrijf</h3>
                <button onClick={() => navigate(`/companies/${company.id}`)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Bekijk bedrijf →</button>
              </div>
              <p className="text-sm font-medium text-foreground">{company.name}</p>
            </div>
          )}

          {/* Documenten */}
          {bookingDocuments.length > 0 && (
            <div className="rounded-xl bg-card p-5 card-shadow space-y-3">
              <h3 className="text-base font-bold text-foreground">Documenten ({bookingDocuments.length})</h3>
              <div className="space-y-2">
                {bookingDocuments.map((d) => {
                  const statusIcon = d.status === 'signed' ? <CheckCircle2 size={12} className="text-success" /> : d.status === 'viewed' ? <Eye size={12} className="text-warning" /> : <Send size={12} className="text-info" />;
                  const dStatusLabel = d.status === 'signed' ? 'Ondertekend' : d.status === 'viewed' ? 'Bekeken' : d.status === 'declined' ? 'Afgewezen' : 'Verzonden';
                  return (
                    <div key={d.id} className="flex items-center justify-between py-2 px-3 rounded-lg border border-border/50 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText size={14} className="text-muted-foreground shrink-0" />
                        <span className="font-medium text-foreground">{d.title}</span>
                        {d.amount && <span className="text-muted-foreground text-xs">€{d.amount.toLocaleString('nl-NL')}</span>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {statusIcon}
                        <span className="text-xs text-muted-foreground">{dStatusLabel}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Historie - same layout as InquiryDetailPage */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <History size={16} /> Historie
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Komende Reserveringen */}
          <div className="rounded-xl bg-card p-5 card-shadow space-y-2">
            <h3 className="text-sm font-bold text-foreground">Komende Reserveringen ({upcomingBookings.length})</h3>
            {upcomingBookings.length === 0 ? (
              <p className="text-xs text-muted-foreground">Geen komende reserveringen gevonden.</p>
            ) : (
              <div className="space-y-1">
                {upcomingBookings.slice(0, 8).map(b => (
                  <button key={b.id} onClick={() => navigate(`/reserveringen/${b.id}`)} className="w-full flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors text-left text-xs">
                    <div>
                      <span className="font-medium text-foreground">{b.title}</span>
                      <span className="text-muted-foreground ml-2">{b.roomName}</span>
                    </div>
                    <span className="text-muted-foreground shrink-0">{b.date}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Eerdere Reserveringen */}
          <div className="rounded-xl bg-card p-5 card-shadow space-y-2">
            <h3 className="text-sm font-bold text-foreground">Eerdere Reserveringen ({pastBookings.length})</h3>
            {pastBookings.length === 0 ? (
              <p className="text-xs text-muted-foreground">Geen eerdere reserveringen gevonden.</p>
            ) : (
              <div className="space-y-1">
                {pastBookings.slice(0, 8).map(b => (
                  <button key={b.id} onClick={() => navigate(`/reserveringen/${b.id}`)} className="w-full flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors text-left text-xs">
                    <div>
                      <span className="font-medium text-foreground">{b.title}</span>
                      <span className="text-muted-foreground ml-2">{b.roomName}</span>
                    </div>
                    <span className="text-muted-foreground shrink-0">{b.date}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Aanvragen */}
        <div className="rounded-xl bg-card p-5 card-shadow space-y-2 max-w-[50%]">
          <h3 className="text-sm font-bold text-foreground">Andere Aanvragen ({contactInquiries.length})</h3>
          {contactInquiries.length === 0 ? (
            <p className="text-xs text-muted-foreground">Geen andere aanvragen van deze contactpersoon.</p>
          ) : (
            <div className="space-y-1">
              {contactInquiries.slice(0, 5).map(inq => (
                <button key={inq.id} onClick={() => navigate(`/inquiries/${inq.id}`)} className="w-full flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors text-left text-xs">
                  <span className="font-medium text-foreground">{inq.eventType}</span>
                  <span className="text-muted-foreground">{inq.createdAt}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Taken */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <CheckSquare size={16} /> Taken
          {openTaskCount > 0 && (
            <Badge variant="secondary" className="text-[10px] h-4 px-1 bg-warning/15 text-warning">{openTaskCount}</Badge>
          )}
        </h2>
        <TasksSection
          tasks={bookingTasks}
          defaults={{ bookingId: booking.id, contactId: contact?.id, companyId: company?.id }}
        />
      </div>
    </div>
  );
}
