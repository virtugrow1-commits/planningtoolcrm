import { useMemo } from 'react';
import { Booking, RoomName } from '@/types/crm';
import { cn } from '@/lib/utils';

interface MonthViewProps {
  currentDate: Date;
  bookings: Booking[];
  onDayClick: (date: Date) => void;
  onBookingClick: (booking: Booking) => void;
  getRoomDisplayName: (room: RoomName) => string;
}

function formatDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const DAY_NAMES = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];
const MAX_VISIBLE = 3;

export default function MonthView({ currentDate, bookings, onDayClick, onBookingClick, getRoomDisplayName }: MonthViewProps) {
  const weeks = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // Find Monday before or on first day
    let start = new Date(firstDay);
    const dow = start.getDay();
    const diff = dow === 0 ? -6 : 1 - dow;
    start.setDate(start.getDate() + diff);

    const result: Date[][] = [];
    let current = new Date(start);
    while (current <= lastDay || result.length < 5) {
      const week: Date[] = [];
      for (let i = 0; i < 7; i++) {
        week.push(new Date(current));
        current.setDate(current.getDate() + 1);
      }
      result.push(week);
      if (result.length >= 6) break;
    }
    return result;
  }, [currentDate]);

  const today = formatDate(new Date());
  const currentMonth = currentDate.getMonth();

  const bookingsByDay = useMemo(() => {
    const map: Record<string, Booking[]> = {};
    bookings.forEach((b) => {
      if (!map[b.date]) map[b.date] = [];
      map[b.date].push(b);
    });
    return map;
  }, [bookings]);

  return (
    <div className="rounded-xl border bg-card card-shadow overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-7 border-b bg-muted">
        {DAY_NAMES.map((name) => (
          <div key={name} className="px-2 py-2 text-center text-xs font-semibold text-muted-foreground border-r last:border-r-0">
            {name}
          </div>
        ))}
      </div>
      {/* Weeks */}
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 border-b last:border-b-0">
          {week.map((day) => {
            const ds = formatDate(day);
            const isToday = ds === today;
            const isCurrentMonth = day.getMonth() === currentMonth;
            const dayBookings = bookingsByDay[ds] || [];
            const confirmed = dayBookings.filter((b) => b.status === 'confirmed').length;
            const option = dayBookings.filter((b) => b.status === 'option').length;

            return (
              <div
                key={ds}
                className={cn(
                  'min-h-[100px] border-r last:border-r-0 p-1.5 cursor-pointer hover:bg-accent/5 transition-colors',
                  !isCurrentMonth && 'opacity-40'
                )}
                onClick={() => onDayClick(day)}
              >
                <div className={cn(
                  'text-sm font-medium mb-1 w-7 h-7 flex items-center justify-center rounded-full',
                  isToday && 'bg-primary text-primary-foreground'
                )}>
                  {day.getDate()}
                </div>
                {dayBookings.slice(0, MAX_VISIBLE).map((b) => (
                  <div
                    key={b.id}
                    className={cn(
                      'text-[10px] leading-tight px-1.5 py-0.5 rounded truncate cursor-pointer mb-0.5',
                      b.status === 'confirmed'
                        ? 'bg-success/20 text-success-foreground'
                        : 'bg-warning/20 text-warning-foreground'
                    )}
                    onClick={(e) => { e.stopPropagation(); onBookingClick(b); }}
                    title={`${b.title} — ${getRoomDisplayName(b.roomName)}`}
                  >
                    {String(b.startHour).padStart(2, '0')}:{String(b.startMinute || 0).padStart(2, '0')} {b.title}
                  </div>
                ))}
                {dayBookings.length > MAX_VISIBLE && (
                  <div className="text-[10px] text-muted-foreground font-medium px-1.5">
                    +{dayBookings.length - MAX_VISIBLE} meer
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
