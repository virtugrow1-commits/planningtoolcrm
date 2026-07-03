import { formatDate } from '@/lib/formatters';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Booking, Inquiry } from '@/types/crm';
import { Badge } from '@/components/ui/badge';
import { CalendarIcon, Clock, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const INQUIRY_STATUS: Record<string, { label: string }> = {
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
  condolence_reminder: { label: 'Condoleance Herdenkingen' },
};

const PREVIEW = 3; // items shown before collapsing

interface CollapsibleListProps {
  title: string;
  count: number;
  emptyText: string;
  children: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  hasMore: boolean;
  remaining: number;
}

function CollapsibleList({ title, count, emptyText, children, expanded, onToggle, hasMore, remaining }: CollapsibleListProps) {
  return (
    <div className="rounded-xl bg-card card-shadow overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors text-left"
      >
        <h4 className="text-sm font-bold text-foreground">{title} ({count})</h4>
        {count > 0 && (
          <ChevronDown size={16} className={cn('text-muted-foreground transition-transform duration-200', expanded ? 'rotate-180' : '')} />
        )}
      </button>
      {count === 0 ? (
        <p className="px-5 pb-4 text-xs text-muted-foreground">{emptyText}</p>
      ) : expanded ? (
        <div className="divide-y divide-border/40 border-t border-border/40">
          {children}
          {hasMore && (
            <button
              onClick={onToggle}
              className="w-full text-center py-2.5 text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
            >
              Minder tonen
            </button>
          )}
        </div>
      ) : (
        <div className="divide-y divide-border/40 border-t border-border/40">
          {children}
          {hasMore && (
            <button
              onClick={onToggle}
              className="w-full text-center py-2.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
            >
              + {remaining} meer tonen
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface HistorySectionProps {
  bookings: Booking[];
  inquiries: Inquiry[];
  inquiriesLabel?: string;
  inquiriesEmptyText?: string;
}

export default function HistorySection({
  bookings,
  inquiries,
  inquiriesLabel = 'Andere Aanvragen',
  inquiriesEmptyText = 'Geen andere aanvragen gevonden.',
}: HistorySectionProps) {
  const navigate = useNavigate();
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [expandUpcoming, setExpandUpcoming] = useState(false);
  const [expandPast, setExpandPast] = useState(false);
  const [expandInquiries, setExpandInquiries] = useState(false);

  const upcomingBookings = useMemo(
    () => bookings.filter(b => b.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date)),
    [bookings, todayStr]
  );
  const pastBookings = useMemo(
    () => bookings.filter(b => b.date < todayStr).sort((a, b) => b.date.localeCompare(a.date)),
    [bookings, todayStr]
  );

  const shownUpcoming = expandUpcoming ? upcomingBookings : upcomingBookings.slice(0, PREVIEW);
  const shownPast = expandPast ? pastBookings : pastBookings.slice(0, PREVIEW);
  const shownInquiries = expandInquiries ? inquiries : inquiries.slice(0, PREVIEW);

  const bookingRow = (b: Booking) => (
    <button
      key={b.id}
      onClick={() => navigate(`/reserveringen/${b.id}`)}
      className="w-full flex items-center justify-between py-2.5 px-5 hover:bg-muted/50 transition-colors text-left text-xs"
    >
      <div className="flex items-center gap-3 min-w-0">
        <CalendarIcon size={12} className="text-muted-foreground shrink-0" />
        <div className="min-w-0">
          <span className="text-foreground font-medium block truncate">{b.title}</span>
          <span className="text-muted-foreground">
            {format(new Date(b.date), 'd MMM yyyy', { locale: nl })} ·{' '}
            {String(b.startHour).padStart(2, '0')}:{String(b.startMinute).padStart(2, '0')}–
            {String(b.endHour).padStart(2, '0')}:{String(b.endMinute).padStart(2, '0')}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-muted-foreground hidden sm:block">{b.roomName}</span>
        <Badge
          variant="secondary"
          className={cn('text-[10px]', b.date < todayStr ? 'bg-muted text-muted-foreground' : b.status === 'confirmed' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning')}
        >
          {b.date < todayStr ? 'Afgelopen' : b.status === 'confirmed' ? 'Bevestigd' : 'Optie'}
        </Badge>
      </div>
    </button>
  );

  return (
    <div className="md:col-span-2 space-y-4">
      <h3 className="text-base font-bold text-foreground flex items-center gap-2">
        <Clock size={16} className="text-muted-foreground" />
        Historie
      </h3>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Komende reserveringen */}
        <CollapsibleList
          title="Komende Reserveringen"
          count={upcomingBookings.length}
          emptyText="Geen komende reserveringen gevonden."
          expanded={expandUpcoming}
          onToggle={() => setExpandUpcoming(v => !v)}
          hasMore={upcomingBookings.length > PREVIEW}
          remaining={upcomingBookings.length - PREVIEW}
        >
          {shownUpcoming.map(bookingRow)}
        </CollapsibleList>

        {/* Eerdere reserveringen */}
        <CollapsibleList
          title="Eerdere Reserveringen"
          count={pastBookings.length}
          emptyText="Geen eerdere reserveringen gevonden."
          expanded={expandPast}
          onToggle={() => setExpandPast(v => !v)}
          hasMore={pastBookings.length > PREVIEW}
          remaining={pastBookings.length - PREVIEW}
        >
          {shownPast.map(bookingRow)}
        </CollapsibleList>

        {/* Aanvragen */}
        <CollapsibleList
          title={inquiriesLabel}
          count={inquiries.length}
          emptyText={inquiriesEmptyText}
          expanded={expandInquiries}
          onToggle={() => setExpandInquiries(v => !v)}
          hasMore={inquiries.length > PREVIEW}
          remaining={inquiries.length - PREVIEW}
        >
          {shownInquiries.map(inq => {
            const s = INQUIRY_STATUS[inq.status];
            return (
              <button
                key={inq.id}
                onClick={() => navigate(`/inquiries/${inq.id}`)}
                className="w-full flex items-center justify-between py-2.5 px-5 hover:bg-muted/50 transition-colors text-left text-xs"
              >
                <div className="min-w-0">
                  <span className="font-medium text-foreground block truncate">{inq.eventType}</span>
                  <span className="text-muted-foreground">{inq.createdAt}</span>
                </div>
                <Badge variant="secondary" className="text-[10px] shrink-0">{s?.label || inq.status}</Badge>
              </button>
            );
          })}
        </CollapsibleList>
      </div>
    </div>
  );
}
