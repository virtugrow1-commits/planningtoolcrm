import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Booking, Inquiry } from '@/types/crm';
import { Badge } from '@/components/ui/badge';
import { CalendarIcon, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

const INQUIRY_STATUS: Record<string, { label: string; badgeClass?: string }> = {
  new: { label: 'Nieuw' },
  contacted: { label: 'Contactgelegd' },
  option: { label: 'Optie' },
  quoted: { label: 'Offerte' },
  quote_revised: { label: 'Offerte herzien' },
  reserved: { label: 'Gereserveerd' },
  confirmed: { label: 'Bevestigd' },
  script: { label: 'Script' },
  invoiced: { label: 'Gefactureerd' },
  converted: { label: 'Definitief' },
  lost: { label: 'Verloren' },
  after_sales: { label: 'Aftersales' },
};

interface HistorySectionProps {
  bookings: Booking[];
  inquiries: Inquiry[];
  /** Label for the inquiries card, defaults to "Andere Aanvragen" */
  inquiriesLabel?: string;
  /** Empty state text for inquiries */
  inquiriesEmptyText?: string;
}

export default function HistorySection({ bookings, inquiries, inquiriesLabel = 'Andere Aanvragen', inquiriesEmptyText = 'Geen andere aanvragen gevonden.' }: HistorySectionProps) {
  const navigate = useNavigate();
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  const upcomingBookings = useMemo(() => bookings.filter(b => b.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date)), [bookings, todayStr]);
  const pastBookings = useMemo(() => bookings.filter(b => b.date < todayStr).sort((a, b) => b.date.localeCompare(a.date)), [bookings, todayStr]);

  return (
    <div className="md:col-span-2 space-y-4">
      <h3 className="text-base font-bold text-foreground flex items-center gap-2">
        <Clock size={16} className="text-muted-foreground" />
        Historie
      </h3>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Komende reserveringen */}
        <div className="rounded-xl bg-card p-5 card-shadow space-y-3">
          <h4 className="text-sm font-bold text-foreground">Komende Reserveringen ({upcomingBookings.length})</h4>
          {upcomingBookings.length === 0 ? (
            <p className="text-xs text-muted-foreground">Geen komende reserveringen gevonden.</p>
          ) : (
            <div className="space-y-1 max-h-[400px] overflow-y-auto">
              {upcomingBookings.map(b => (
                <button
                  key={b.id}
                  onClick={() => navigate(`/reserveringen/${b.id}`)}
                  className="w-full flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors text-left text-xs"
                >
                  <div className="flex items-center gap-3">
                    <CalendarIcon size={12} className="text-muted-foreground shrink-0" />
                    <div>
                      <span className="text-foreground font-medium">{b.title}</span>
                      <span className="text-muted-foreground ml-2">
                        {format(new Date(b.date), 'd MMM yyyy', { locale: nl })}
                      </span>
                    </div>
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
        </div>

        {/* Eerdere reserveringen */}
        <div className="rounded-xl bg-card p-5 card-shadow space-y-3">
          <h4 className="text-sm font-bold text-foreground">Eerdere Reserveringen ({pastBookings.length})</h4>
          {pastBookings.length === 0 ? (
            <p className="text-xs text-muted-foreground">Geen eerdere reserveringen gevonden.</p>
          ) : (
            <div className="space-y-1 max-h-[400px] overflow-y-auto">
              {pastBookings.map(b => (
                <button
                  key={b.id}
                  onClick={() => navigate(`/reserveringen/${b.id}`)}
                  className="w-full flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors text-left text-xs"
                >
                  <div className="flex items-center gap-3">
                    <CalendarIcon size={12} className="text-muted-foreground shrink-0" />
                    <div>
                      <span className="text-foreground font-medium">{b.title}</span>
                      <span className="text-muted-foreground ml-2">
                        {format(new Date(b.date), 'd MMM yyyy', { locale: nl })}
                      </span>
                    </div>
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
        </div>

        {/* Aanvragen */}
        <div className="rounded-xl bg-card p-5 card-shadow space-y-3">
          <h4 className="text-sm font-bold text-foreground">{inquiriesLabel} ({inquiries.length})</h4>
          {inquiries.length === 0 ? (
            <p className="text-xs text-muted-foreground">{inquiriesEmptyText}</p>
          ) : (
            <div className="space-y-1 max-h-[400px] overflow-y-auto">
              {inquiries.map(inq => {
                const s = INQUIRY_STATUS[inq.status];
                return (
                  <button
                    key={inq.id}
                    onClick={() => navigate(`/inquiries/${inq.id}`)}
                    className="w-full flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors text-left text-xs"
                  >
                    <div>
                      <span className="font-medium text-foreground">{inq.eventType}</span>
                      <span className="text-muted-foreground ml-2">{inq.createdAt}</span>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">{s?.label || inq.status}</Badge>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
