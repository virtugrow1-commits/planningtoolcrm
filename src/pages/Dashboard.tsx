import {
  InboxIcon,
  CalendarCheck,
  CheckSquare,
  Clock,
  MoreHorizontal,
  ArrowRight,
  Check,
} from 'lucide-react';
import KpiCard from '@/components/KpiCard';
import { useBookings } from '@/contexts/BookingsContext';
import { useInquiriesContext } from '@/contexts/InquiriesContext';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

interface TaskItem {
  id: string;
  type: 'inquiry' | 'booking';
  title: string;
  subtitle: string;
  date: string;
  currentStatus: string;
}

const INQUIRY_STATUSES = [
  { value: 'new', label: 'Nieuwe Aanvraag' },
  { value: 'contacted', label: 'Lopend Contact' },
  { value: 'option', label: 'Optie' },
  { value: 'quoted', label: 'Offerte Verzonden' },
  { value: 'reserved', label: 'Reservering' },
  { value: 'confirmed', label: 'Definitief' },
  { value: 'lost', label: 'Verloren' },
];

const BOOKING_STATUSES = [
  { value: 'option', label: 'Optie' },
  { value: 'confirmed', label: 'Bevestigd' },
];

export default function Dashboard() {
  const { bookings, loading: bookingsLoading, updateBooking } = useBookings();
  const { inquiries, loading: inquiriesLoading, updateInquiry } = useInquiriesContext();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkType, setBulkType] = useState<'inquiry' | 'booking' | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  const today = new Date().toISOString().split('T')[0];

  const todayBookings = useMemo(() => bookings.filter((b) => b.date === today), [bookings, today]);
  const openInquiries = useMemo(() => inquiries.filter((i) => i.status === 'new' || i.status === 'contacted'), [inquiries]);

  const tasks = useMemo<TaskItem[]>(() => {
    const items: TaskItem[] = [];
    inquiries
      .filter((i) => i.status === 'new')
      .forEach((i) => items.push({
        id: i.id,
        type: 'inquiry',
        title: `${i.contactName} — ${i.eventType}`,
        subtitle: `${i.guestCount} gasten${i.preferredDate ? ` · ${i.preferredDate}` : ''}`,
        date: i.createdAt,
        currentStatus: i.status,
      }));
    bookings
      .filter((b) => b.status === 'option')
      .forEach((b) => items.push({
        id: b.id,
        type: 'booking',
        title: `${b.title} — ${b.roomName}`,
        subtitle: `${b.contactName} · ${b.date} · ${b.startHour}:00–${b.endHour}:00`,
        date: b.date,
        currentStatus: b.status,
      }));
    return items;
  }, [inquiries, bookings]);

  const toggleSelect = (id: string, type: 'inquiry' | 'booking') => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        // Only allow selecting same type for bulk
        if (bulkType && bulkType !== type) {
          toast({ title: 'Selecteer eerst items van hetzelfde type', variant: 'destructive' });
          return prev;
        }
        next.add(id);
      }
      const remaining = tasks.filter((t) => next.has(t.id));
      setBulkType(remaining.length > 0 ? remaining[0].type : null);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === tasks.length) {
      setSelected(new Set());
      setBulkType(null);
    } else {
      // Select all of the dominant type (inquiries first)
      const inquiryTasks = tasks.filter((t) => t.type === 'inquiry');
      const target = inquiryTasks.length > 0 ? inquiryTasks : tasks.filter((t) => t.type === 'booking');
      setSelected(new Set(target.map((t) => t.id)));
      setBulkType(target[0]?.type || null);
    }
  };

  const handleStatusChange = async (task: TaskItem, newStatus: string) => {
    if (task.type === 'inquiry') {
      const inq = inquiries.find((i) => i.id === task.id);
      if (inq) await updateInquiry({ ...inq, status: newStatus as any });
    } else {
      const bk = bookings.find((b) => b.id === task.id);
      if (bk) await updateBooking({ ...bk, status: newStatus as any });
    }
    toast({ title: 'Status bijgewerkt' });
  };

  const handleBulkStatus = async (newStatus: string) => {
    const ids = Array.from(selected);
    for (const id of ids) {
      const task = tasks.find((t) => t.id === id);
      if (task) await handleStatusChange(task, newStatus);
    }
    setSelected(new Set());
    setBulkType(null);
    toast({ title: `${ids.length} items bijgewerkt` });
  };

  if (bookingsLoading || inquiriesLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-muted-foreground">Laden...</div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          title="Openstaande Taken"
          value={String(tasks.length)}
          icon={<CheckSquare size={20} />}
          subtitle={`${inquiries.filter((i) => i.status === 'new').length} nieuwe aanvragen · ${bookings.filter((b) => b.status === 'option').length} opties`}
        />
        <KpiCard
          title="Aanvragen"
          value={String(openInquiries.length)}
          icon={<InboxIcon size={20} />}
          subtitle="Nieuw & gecontacteerd"
        />
        <KpiCard
          title="Boekingen Vandaag"
          value={String(todayBookings.length)}
          icon={<CalendarCheck size={20} />}
          subtitle={`${todayBookings.filter((b) => b.status === 'confirmed').length} bevestigd · ${todayBookings.filter((b) => b.status === 'option').length} in optie`}
        />
      </div>

      {/* Openstaande Taken Detail */}
      <div className="rounded-xl bg-card card-shadow animate-fade-in">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="text-sm font-semibold text-card-foreground flex items-center gap-2">
            <CheckSquare size={16} /> Openstaande Taken
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{tasks.length}</span>
          </h2>
          <div className="flex items-center gap-2">
            {selected.size > 0 && bulkType && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{selected.size} geselecteerd</span>
                <Select onValueChange={handleBulkStatus}>
                  <SelectTrigger className="h-8 w-40 text-xs">
                    <SelectValue placeholder="Bulk status wijzigen" />
                  </SelectTrigger>
                  <SelectContent>
                    {(bulkType === 'inquiry' ? INQUIRY_STATUSES : BOOKING_STATUSES).map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        {tasks.length === 0 ? (
          <div className="p-8 text-center">
            <Check size={32} className="mx-auto text-success mb-2" />
            <p className="text-sm text-muted-foreground">Alle taken zijn afgehandeld 🎉</p>
          </div>
        ) : (
          <div className="divide-y">
            {/* Select all header */}
            <div className="flex items-center gap-3 px-5 py-2 bg-muted/30">
              <Checkbox
                checked={selected.size > 0 && selected.size === tasks.length}
                onCheckedChange={selectAll}
              />
              <span className="text-xs text-muted-foreground">Alles selecteren</span>
            </div>

            {tasks.map((task) => (
              <div key={task.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/20 transition-colors">
                <Checkbox
                  checked={selected.has(task.id)}
                  onCheckedChange={() => toggleSelect(task.id, task.type)}
                />
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  task.type === 'inquiry'
                    ? 'bg-info/15 text-info'
                    : 'bg-warning/15 text-warning'
                }`}>
                  {task.type === 'inquiry' ? 'Aanvraag' : 'Optie'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-card-foreground truncate">{task.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{task.subtitle}</p>
                </div>
                <Select
                  value={task.currentStatus}
                  onValueChange={(v) => handleStatusChange(task, v)}
                >
                  <SelectTrigger className="h-7 w-36 text-xs shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(task.type === 'inquiry' ? INQUIRY_STATUSES : BOOKING_STATUSES).map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => navigate(task.type === 'inquiry' ? '/inquiries' : '/calendar')}
                >
                  <ArrowRight size={14} />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Agenda Vandaag */}
      <div className="rounded-xl bg-card p-5 card-shadow animate-fade-in">
        <h2 className="mb-4 text-sm font-semibold text-card-foreground">Agenda Vandaag</h2>
        <div className="space-y-3">
          {todayBookings.length === 0 && (
            <p className="text-sm text-muted-foreground">Geen boekingen vandaag</p>
          )}
          {todayBookings.map((booking) => (
            <div
              key={booking.id}
              className={`rounded-lg p-3 text-sm ${booking.status === 'confirmed' ? 'booking-confirmed' : 'booking-option'}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{booking.title}</span>
                <span className="text-xs opacity-75">{booking.roomName}</span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs opacity-75">
                <Clock size={12} />
                <span>{booking.startHour}:00 – {booking.endHour}:00</span>
                <span>·</span>
                <span>{booking.contactName}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}