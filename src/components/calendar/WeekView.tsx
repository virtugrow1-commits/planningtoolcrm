import { useMemo } from 'react';
import { Booking, ROOMS, RoomName } from '@/types/crm';
import { cn } from '@/lib/utils';

interface WeekViewProps {
  currentDate: Date;
  bookings: Booking[];
  onDayClick: (date: Date) => void;
  onBookingClick: (booking: Booking) => void;
  getRoomDisplayName: (room: RoomName) => string;
}

function formatDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const DAY_NAMES = ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za'];
const HOURS = [...Array.from({ length: 17 }, (_, i) => i + 7), 0, 1];

export default function WeekView({ currentDate, bookings, onDayClick, onBookingClick, getRoomDisplayName }: WeekViewProps) {
  const weekDays = useMemo(() => {
    const start = new Date(currentDate);
    const day = start.getDay();
    const diff = day === 0 ? -6 : 1 - day; // Start on Monday
    start.setDate(start.getDate() + diff);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [currentDate]);

  const today = formatDate(new Date());

  const bookingsByDay = useMemo(() => {
    const map: Record<string, Booking[]> = {};
    weekDays.forEach((d) => {
      const ds = formatDate(d);
      map[ds] = bookings.filter((b) => b.date === ds);
    });
    return map;
  }, [bookings, weekDays]);

  return (
    <div className="overflow-x-auto rounded-xl border bg-card card-shadow">
      <table className="w-full min-w-[900px] border-collapse">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 w-16 border-b border-r bg-muted px-2 py-2.5 text-left text-xs font-semibold text-muted-foreground">Tijd</th>
            {weekDays.map((d) => {
              const ds = formatDate(d);
              const isToday = ds === today;
              return (
                <th
                  key={ds}
                  className={cn(
                    'border-b border-r bg-muted px-2 py-2.5 text-center last:border-r-0 cursor-pointer hover:bg-accent/10 transition-colors',
                    isToday && 'bg-primary/10'
                  )}
                  onClick={() => onDayClick(d)}
                >
                  <div className={cn('text-[11px] font-semibold', isToday ? 'text-primary' : 'text-muted-foreground')}>
                    {DAY_NAMES[d.getDay()]}
                  </div>
                  <div className={cn('text-sm font-bold', isToday ? 'text-primary' : 'text-foreground')}>
                    {d.getDate()}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {HOURS.map((hour) => (
            <tr key={hour} className="group">
              <td className="sticky left-0 z-10 border-b border-r bg-card px-2 py-0 text-xs font-medium text-muted-foreground h-8">
                {String(hour).padStart(2, '0')}:00
              </td>
              {weekDays.map((d) => {
                const ds = formatDate(d);
                const dayBookings = bookingsByDay[ds] || [];
                const cellBookings = dayBookings.filter((b) => b.startHour === hour);

                return (
                  <td
                    key={ds}
                    className="border-b border-r px-0.5 py-0 last:border-r-0 h-8 align-top cursor-pointer hover:bg-accent/5"
                    onClick={() => onDayClick(d)}
                  >
                    {cellBookings.map((b) => (
                      <div
                        key={b.id}
                        className={cn(
                          'text-[9px] leading-tight px-1 py-0.5 rounded truncate cursor-pointer mb-0.5',
                          b.status === 'confirmed'
                            ? 'bg-success/20 text-success-foreground border-l-2 border-success'
                            : 'bg-warning/20 text-warning-foreground border-l-2 border-warning'
                        )}
                        onClick={(e) => { e.stopPropagation(); onBookingClick(b); }}
                        title={`${b.title} (${getRoomDisplayName(b.roomName)})`}
                      >
                        {b.title}
                      </div>
                    ))}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
