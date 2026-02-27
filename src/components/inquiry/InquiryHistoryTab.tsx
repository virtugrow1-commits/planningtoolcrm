import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Inquiry, Booking } from '@/types/crm';
import { Badge } from '@/components/ui/badge';
import { CalendarIcon, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PIPELINE_COLUMNS } from './InquiryDetailsTab';

interface Props {
  inquiry: Inquiry;
  contactBookings: Booking[];
  companyBookings: Booking[];
  contactInquiries: Inquiry[];
}

export default function InquiryHistoryTab({ inquiry, contactBookings, companyBookings, contactInquiries }: Props) {
  const navigate = useNavigate();

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  // Merge contact + company bookings, deduplicate
  const allBookings = useMemo(() => {
    const map = new Map<string, Booking>();
    for (const b of [...contactBookings, ...companyBookings]) {
      map.set(b.id, b);
    }
    return Array.from(map.values());
  }, [contactBookings, companyBookings]);

  const upcomingBookings = useMemo(() => allBookings.filter(b => b.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date)), [allBookings, todayStr]);
  const pastBookings = useMemo(() => allBookings.filter(b => b.date < todayStr).sort((a, b) => b.date.localeCompare(a.date)), [allBookings, todayStr]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Komende reserveringen */}
      <div className="rounded-xl bg-card p-5 card-shadow space-y-3">
        <h3 className="text-base font-bold text-foreground">Komende Reserveringen ({upcomingBookings.length})</h3>
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
        <h3 className="text-base font-bold text-foreground">Eerdere Reserveringen ({pastBookings.length})</h3>
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

      {/* Andere aanvragen van dit contact */}
      <div className="rounded-xl bg-card p-5 card-shadow space-y-3">
        <h3 className="text-base font-bold text-foreground">Andere Aanvragen ({contactInquiries.length})</h3>
        {contactInquiries.length === 0 ? (
          <p className="text-xs text-muted-foreground">Geen andere aanvragen van deze contactpersoon.</p>
        ) : (
          <div className="space-y-1 max-h-[400px] overflow-y-auto">
            {contactInquiries.map(inq => {
              const c = PIPELINE_COLUMNS.find(col => col.key === inq.status);
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
                  <Badge variant="secondary" className={cn('text-[10px]', c?.badgeClass)}>{c?.label}</Badge>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
