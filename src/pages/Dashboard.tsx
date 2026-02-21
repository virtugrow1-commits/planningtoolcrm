import {
  InboxIcon,
  CalendarCheck,
  CheckSquare,
  Clock,
} from 'lucide-react';
import KpiCard from '@/components/KpiCard';
import { useBookings } from '@/contexts/BookingsContext';
import { useInquiriesContext } from '@/contexts/InquiriesContext';
import { useMemo } from 'react';

export default function Dashboard() {
  const { bookings, loading: bookingsLoading } = useBookings();
  const { inquiries, loading: inquiriesLoading } = useInquiriesContext();

  const today = new Date().toISOString().split('T')[0];

  const todayBookings = useMemo(() => bookings.filter((b) => b.date === today), [bookings, today]);
  const openInquiries = useMemo(() => inquiries.filter((i) => i.status === 'new' || i.status === 'contacted'), [inquiries]);
  const openTasks = useMemo(() => {
    const newInquiries = inquiries.filter((i) => i.status === 'new').length;
    const optionBookings = todayBookings.filter((b) => b.status === 'option').length;
    return newInquiries + optionBookings;
  }, [inquiries, todayBookings]);

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
          value={String(openTasks)}
          icon={<CheckSquare size={20} />}
          subtitle={`${inquiries.filter((i) => i.status === 'new').length} nieuwe aanvragen · ${todayBookings.filter((b) => b.status === 'option').length} opties`}
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
