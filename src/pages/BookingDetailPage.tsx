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
import { ArrowLeft, ChevronRight, Pencil, Check, X, MapPin, Calendar as CalendarIcon, Clock, Users, ClipboardList, Package, User, Building2, FileText, CheckSquare, Trash2, History, Send, Eye, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InfoRow, SectionCard } from '@/components/detail/DetailPageComponents';
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

  const current = editing ? form! : booking;

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <button onClick={() => navigate('/reserveringen')} className="hover:text-foreground transition-colors">Reserveringen</button>
        <ChevronRight size={14} />
        <span className="text-foreground font-medium">
          {booking.reservationNumber && <span className="font-mono text-xs text-muted-foreground mr-2">{booking.reservationNumber}</span>}
          {booking.title}
        </span>
      </div>

      {/* Header with status badges */}
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-foreground">{current.title}</h1>
        <Badge variant="secondary" className={cn('text-[11px] font-medium', booking.status === 'confirmed' ? 'bg-success/10 text-success border-success/20' : 'bg-warning/10 text-warning border-warning/20')}>
          {booking.status === 'confirmed' ? 'Bevestigd' : 'Optie'}
        </Badge>
        <Badge variant="secondary" className={cn('text-[11px] font-medium', prepStatusColor(booking.preparationStatus))}>
          {prepStatusLabel(booking.preparationStatus)}
        </Badge>
        {!editing ? (
          <Button variant="ghost" size="icon" onClick={startEdit} className="h-8 w-8 ml-auto"><Pencil size={14} /></Button>
        ) : (
          <div className="flex gap-1 ml-auto">
            <Button variant="ghost" size="icon" onClick={cancelEdit} className="h-8 w-8 text-muted-foreground"><X size={14} /></Button>
            <Button variant="ghost" size="icon" onClick={saveEdit} className="h-8 w-8 text-success"><Check size={14} /></Button>
          </div>
        )}
      </div>

      {/* Details Section - like InquiryDetailsTab */}
      <div className="rounded-xl bg-card p-5 card-shadow">
        {editing ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            </div>
            <div className="space-y-3">
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
              <Button variant="destructive" size="sm" className="w-full mt-2" onClick={handleDelete}><Trash2 size={14} className="mr-1" /> Reservering verwijderen</Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
            <InfoRow icon={<User size={14} />} label="Contact" value={booking.contactName} onClick={contact ? () => navigate(`/crm/${contact.id}`) : undefined} />
            {company && <InfoRow icon={<Building2 size={14} />} label="Bedrijf" value={company.name} onClick={() => navigate(`/companies/${company.id}`)} />}
            <InfoRow icon={<MapPin size={14} />} label="Ruimte" value={booking.roomName} />
            <InfoRow icon={<CalendarIcon size={14} />} label="Datum" value={formatDate(booking.date)} />
            <InfoRow icon={<Clock size={14} />} label="Tijd" value={`${formatTime(booking.startHour, booking.startMinute)} – ${formatTime(booking.endHour, booking.endMinute)}`} />
            {(booking.guestCount ?? 0) > 0 && <InfoRow icon={<Users size={14} />} label="Gasten" value={`${booking.guestCount}`} />}
            {booking.roomSetup && <InfoRow icon={<ClipboardList size={14} />} label="Opstelling" value={booking.roomSetup} />}
            {booking.requirements && (
              <div className="col-span-2">
                <p className="text-xs font-semibold text-muted-foreground mb-0.5 flex items-center gap-1.5"><Package size={14} /> Benodigdheden</p>
                <p className="text-sm text-foreground whitespace-pre-wrap">{booking.requirements}</p>
              </div>
            )}
            {booking.notes && (
              <div className="col-span-2">
                <p className="text-xs font-semibold text-muted-foreground mb-0.5">Notities</p>
                <p className="text-sm text-foreground whitespace-pre-wrap">{booking.notes}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Historie */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <History size={16} /> Historie
          {(contactBookings.length + contactInquiries.length) > 0 && (
            <Badge variant="secondary" className="text-[10px] h-4 px-1">{contactBookings.length + contactInquiries.length}</Badge>
          )}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Related bookings */}
          <div className="rounded-xl bg-card p-5 card-shadow space-y-2">
            <h3 className="text-sm font-bold text-foreground">Andere Reserveringen</h3>
            {contactBookings.length === 0 ? (
              <p className="text-xs text-muted-foreground">Geen andere reserveringen</p>
            ) : (
              <div className="space-y-1">
                {contactBookings.slice(0, 8).map(b => (
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

          {/* Related inquiries */}
          <div className="rounded-xl bg-card p-5 card-shadow space-y-2">
            <h3 className="text-sm font-bold text-foreground">Aanvragen</h3>
            {contactInquiries.length === 0 ? (
              <p className="text-xs text-muted-foreground">Geen aanvragen</p>
            ) : (
              <div className="space-y-1">
                {contactInquiries.slice(0, 8).map(inq => (
                  <button key={inq.id} onClick={() => navigate(`/inquiries/${inq.id}`)} className="w-full flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors text-left text-xs">
                    <span className="font-medium text-foreground">{inq.eventType}</span>
                    <span className="text-muted-foreground">{inq.createdAt}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Documenten */}
      {bookingDocuments.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <FileText size={16} /> Documenten
            <Badge variant="secondary" className="text-[10px] h-4 px-1">{bookingDocuments.length}</Badge>
          </h2>
          <div className="rounded-xl border bg-card p-4 card-shadow space-y-2">
            {bookingDocuments.map((d) => {
              const statusIcon = d.status === 'signed' ? <CheckCircle2 size={12} className="text-success" /> : d.status === 'viewed' ? <Eye size={12} className="text-warning" /> : <Send size={12} className="text-info" />;
              const statusLabel = d.status === 'signed' ? 'Ondertekend' : d.status === 'viewed' ? 'Bekeken' : d.status === 'declined' ? 'Afgewezen' : 'Verzonden';
              return (
                <div key={d.id} className="flex items-center justify-between py-2 px-3 rounded-lg border border-border/50 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText size={14} className="text-muted-foreground shrink-0" />
                    <span className="font-medium text-foreground">{d.title}</span>
                    {d.amount && <span className="text-muted-foreground text-xs">€{d.amount.toLocaleString('nl-NL')}</span>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {statusIcon}
                    <span className="text-xs text-muted-foreground">{statusLabel}</span>
                    <span className="text-xs text-muted-foreground">{d.sentAt}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
