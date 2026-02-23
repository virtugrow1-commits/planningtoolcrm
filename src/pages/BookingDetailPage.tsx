import { useParams, useNavigate } from 'react-router-dom';
import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { useBookings } from '@/contexts/BookingsContext';
import { useContactsContext } from '@/contexts/ContactsContext';
import { useCompaniesContext } from '@/contexts/CompaniesContext';
import { useInquiriesContext } from '@/contexts/InquiriesContext';
import { useTasksContext } from '@/contexts/TasksContext';
import { Booking, RoomName, ROOMS } from '@/types/crm';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, ChevronRight, Pencil, Check, X, MapPin, Calendar as CalendarIcon, Clock, Users, ClipboardList, Package, User, Building2, FileText, CheckSquare, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { bookings, updateBooking, deleteBooking } = useBookings();
  const { contacts } = useContactsContext();
  const { companies } = useCompaniesContext();
  const { inquiries } = useInquiriesContext();
  const { tasks } = useTasksContext();
  const { toast } = useToast();

  const booking = bookings.find((b) => b.id === id);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Booking | null>(null);

  const contact = useMemo(() => booking?.contactId ? contacts.find(c => c.id === booking.contactId) : null, [booking, contacts]);
  const company = useMemo(() => contact?.companyId ? companies.find(co => co.id === contact.companyId) : null, [contact, companies]);

  const contactBookings = useMemo(() => contact ? bookings.filter(b => b.contactId === contact.id && b.id !== id) : [], [bookings, contact, id]);
  const contactInquiries = useMemo(() => contact ? inquiries.filter(i => i.contactId === contact.id) : [], [inquiries, contact]);
  const bookingTasks = useMemo(() => booking ? tasks.filter(t => t.bookingId === booking.id) : [], [tasks, booking]);

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
    <div className="p-6 lg:p-8 space-y-4 animate-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <button onClick={() => navigate('/reserveringen')} className="hover:text-foreground transition-colors">Reserveringen</button>
        <ChevronRight size={14} />
        <span className="text-foreground font-medium">
          {booking.reservationNumber && <span className="font-mono text-xs text-muted-foreground mr-2">{booking.reservationNumber}</span>}
          {booking.title}
        </span>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* LEFT SIDEBAR */}
        <div className="w-full lg:w-80 shrink-0 space-y-5">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-foreground">{current.title}</h1>
            {!editing ? (
              <Button variant="ghost" size="icon" onClick={startEdit} className="h-8 w-8"><Pencil size={14} /></Button>
            ) : (
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={cancelEdit} className="h-8 w-8 text-muted-foreground"><X size={14} /></Button>
                <Button variant="ghost" size="icon" onClick={saveEdit} className="h-8 w-8 text-success"><Check size={14} /></Button>
              </div>
            )}
          </div>

          {/* Status badges */}
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className={cn('text-[11px] font-medium', booking.status === 'confirmed' ? 'bg-success/10 text-success border-success/20' : 'bg-warning/10 text-warning border-warning/20')}>
              {booking.status === 'confirmed' ? 'Bevestigd' : 'Optie'}
            </Badge>
            <Badge variant="secondary" className={cn('text-[11px] font-medium', prepStatusColor(booking.preparationStatus))}>
              {prepStatusLabel(booking.preparationStatus)}
            </Badge>
          </div>

          <div className="space-y-4 text-sm">
            {/* Editable fields */}
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
                <Button variant="destructive" size="sm" className="w-full mt-2" onClick={handleDelete}><Trash2 size={14} className="mr-1" /> Reservering verwijderen</Button>
              </div>
            ) : (
              <div className="space-y-3">
                <InfoRow icon={<MapPin size={14} />} label="Ruimte" value={booking.roomName} />
                <InfoRow icon={<CalendarIcon size={14} />} label="Datum" value={formatDate(booking.date)} />
                <InfoRow icon={<Clock size={14} />} label="Tijd" value={`${formatTime(booking.startHour, booking.startMinute)} – ${formatTime(booking.endHour, booking.endMinute)}`} />
                <InfoRow icon={<User size={14} />} label="Contact" value={booking.contactName} onClick={contact ? () => navigate(`/crm/${contact.id}`) : undefined} />
                {company && <InfoRow icon={<Building2 size={14} />} label="Bedrijf" value={company.name} onClick={() => navigate(`/companies/${company.id}`)} />}
                {(booking.guestCount ?? 0) > 0 && <InfoRow icon={<Users size={14} />} label="Gasten" value={`${booking.guestCount}`} />}
                {booking.roomSetup && <InfoRow icon={<ClipboardList size={14} />} label="Opstelling" value={booking.roomSetup} />}
                {booking.requirements && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-0.5 flex items-center gap-1.5"><Package size={14} /> Benodigdheden</p>
                    <p className="text-foreground whitespace-pre-wrap">{booking.requirements}</p>
                  </div>
                )}
                {booking.notes && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-0.5">Notities</p>
                    <p className="text-foreground whitespace-pre-wrap">{booking.notes}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT CONTENT */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Contact info */}
          {contact && (
            <SectionCard title="Contactpersoon" linkLabel="Bekijk profiel" onLink={() => navigate(`/crm/${contact.id}`)}>
              <div className="space-y-1 text-xs">
                <p className="font-medium text-foreground">{contact.firstName} {contact.lastName}</p>
                {contact.email && <p className="text-muted-foreground">{contact.email}</p>}
                {contact.phone && <p className="text-muted-foreground">{contact.phone}</p>}
              </div>
            </SectionCard>
          )}

          {/* Company info */}
          {company && (
            <SectionCard title="Bedrijf" linkLabel="Bekijk bedrijf" onLink={() => navigate(`/companies/${company.id}`)}>
              <p className="text-xs font-medium text-foreground">{company.name}</p>
            </SectionCard>
          )}

          {/* Related inquiries */}
          <SectionCard title="Aanvragen" linkLabel="Alle aanvragen" onLink={() => navigate('/inquiries')}>
            {contactInquiries.length === 0 ? (
              <p className="text-xs text-muted-foreground">Geen aanvragen</p>
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
          </SectionCard>

          {/* Other bookings */}
          <SectionCard title="Andere Reserveringen" linkLabel="Bekijk agenda" onLink={() => navigate(`/calendar?date=${booking.date}`)}>
            {contactBookings.length === 0 ? (
              <p className="text-xs text-muted-foreground">Geen andere reserveringen</p>
            ) : (
              <div className="space-y-1">
                {contactBookings.slice(0, 5).map(b => (
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
          </SectionCard>

          {/* Tasks */}
          <SectionCard title="Taken">
            {bookingTasks.length === 0 ? (
              <p className="text-xs text-muted-foreground">Geen gekoppelde taken</p>
            ) : (
              <div className="space-y-1">
                {bookingTasks.map(t => (
                  <div key={t.id} className="flex items-center gap-2 text-xs py-1">
                    <CheckSquare size={12} className={t.status === 'completed' ? 'text-success' : 'text-muted-foreground'} />
                    <span className={cn('text-foreground', t.status === 'completed' && 'line-through text-muted-foreground')}>{t.title}</span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
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
