import {
  Euro,
  InboxIcon,
  CalendarCheck,
  Users,
  Clock,
} from 'lucide-react';
import KpiCard from '@/components/KpiCard';
import { mockBookings, mockInquiries, mockContacts } from '@/data/mockData';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const revenueData = [
  { month: 'Sep', revenue: 12400 },
  { month: 'Okt', revenue: 18200 },
  { month: 'Nov', revenue: 15800 },
  { month: 'Dec', revenue: 22100 },
  { month: 'Jan', revenue: 19500 },
  { month: 'Feb', revenue: 24800 },
];

const todayBookings = mockBookings.filter((b) => b.date === new Date().toISOString().split('T')[0]);

export default function Dashboard() {
  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Overzicht van je locatie — {new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Maandomzet"
          value="€24.800"
          icon={<Euro size={20} />}
          trend={{ value: '12% vs vorige maand', positive: true }}
        />
        <KpiCard
          title="Open Aanvragen"
          value={String(mockInquiries.filter((i) => i.status === 'new').length)}
          icon={<InboxIcon size={20} />}
          subtitle="Wacht op reactie"
        />
        <KpiCard
          title="Boekingen Vandaag"
          value={String(todayBookings.length)}
          icon={<CalendarCheck size={20} />}
          subtitle={`${todayBookings.filter((b) => b.status === 'confirmed').length} bevestigd`}
        />
        <KpiCard
          title="Totaal Contacten"
          value={String(mockContacts.length)}
          icon={<Users size={20} />}
          trend={{ value: '3 nieuw deze week', positive: true }}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Revenue Chart */}
        <div className="col-span-2 rounded-xl bg-card p-5 card-shadow animate-fade-in">
          <h2 className="mb-4 text-sm font-semibold text-card-foreground">Omzet Overzicht</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={revenueData} barSize={32}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 15% 90%)" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: 'hsl(220 10% 46%)' }} />
              <YAxis tick={{ fontSize: 12, fill: 'hsl(220 10% 46%)' }} tickFormatter={(v) => `€${v / 1000}k`} />
              <Tooltip
                formatter={(value: number) => [`€${value.toLocaleString('nl-NL')}`, 'Omzet']}
                contentStyle={{ borderRadius: 8, border: '1px solid hsl(220 15% 90%)', fontSize: 13 }}
              />
              <Bar dataKey="revenue" fill="hsl(220 60% 18%)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Today Schedule */}
        <div className="rounded-xl bg-card p-5 card-shadow animate-fade-in">
          <h2 className="mb-4 text-sm font-semibold text-card-foreground">Vandaag Agenda</h2>
          <div className="space-y-3">
            {todayBookings.length === 0 && (
              <p className="text-sm text-muted-foreground">Geen boekingen vandaag</p>
            )}
            {todayBookings.map((booking) => (
              <div
                key={booking.id}
                className={cn(
                  'rounded-lg p-3 text-sm',
                  booking.status === 'confirmed' ? 'booking-confirmed' : 'booking-option'
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{booking.title}</span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs opacity-75">
                  <Clock size={12} />
                  <span>{booking.startHour}:00 – {booking.endHour}:00</span>
                  <span>·</span>
                  <span>{booking.roomName}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}
