import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileSignature, BadgeCheck, AlertTriangle, ArrowRight } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useDocuments } from '@/hooks/useDocuments';
import { useContactsContext } from '@/contexts/ContactsContext';
import { useInquiriesContext } from '@/contexts/InquiriesContext';
import { computeDocumentStats, periodRange } from '@/lib/documentStats';
import { formatDate, localToday } from '@/lib/formatters';
import { cn } from '@/lib/utils';

type Period = 'month' | 'last_month' | 'year';
const PERIOD_LABEL: Record<Period, string> = { month: 'Deze maand', last_month: 'Vorige maand', year: 'Dit jaar' };

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: 'success' | 'info' | 'warning' }) {
  return (
    <div className="rounded-lg border border-border/60 px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn(
        'text-2xl font-bold tracking-tight text-card-foreground tabular-nums',
        tone === 'success' && 'text-success',
        tone === 'info' && 'text-info',
        tone === 'warning' && 'text-warning',
      )}>{value}</p>
    </div>
  );
}

/**
 * Offertes en reserveringsbevestigingen apart gemeten. Een offerte wordt
 * getekend (akkoord via het vinkje in het document); een reserveringsbevestiging
 * wordt alleen verzonden, niet getekend.
 */
export default function OfferteBevestigingStats() {
  const { documents, loading } = useDocuments();
  const [period, setPeriod] = useState<Period>('month');
  const range = useMemo(() => periodRange(period, localToday()), [period]);
  const stats = useMemo(() => computeDocumentStats(documents, range), [documents, range]);
  const { contacts } = useContactsContext();
  const { inquiries } = useInquiriesContext();
  // Naam zoals in BUUT (netjes gespeld), niet de ontvangernaam uit het GHL-document
  const displayName = useMemo(() => {
    const byContact = new Map(contacts.map((c) => [c.id, `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim()]));
    const byInquiry = new Map(inquiries.map((i) => [i.id, i.contactName]));
    return (p: { inquiryId: string | null; contactId: string | null; contactName: string }) =>
      (p.contactId && byContact.get(p.contactId)) || (p.inquiryId && byInquiry.get(p.inquiryId)) || p.contactName;
  }, [contacts, inquiries]);

  return (
    <div className="rounded-xl bg-card card-shadow animate-fade-in-up overflow-hidden">
      <div className="flex items-center justify-between border-b px-5 py-3 gap-2">
        <h2 className="text-sm font-semibold text-card-foreground flex items-center gap-2">
          <span className="text-primary"><FileSignature size={16} /></span>
          Offertes &amp; reserveringsbevestigingen
        </h2>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => <SelectItem key={p} value={p}>{PERIOD_LABEL[p]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="p-5 grid grid-cols-2 md:grid-cols-3 gap-3">
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-16" />)}
        </div>
      ) : (
        <div className="p-5 space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <FileSignature size={13} /> Offertes
              </h3>
              <div className="grid grid-cols-3 gap-2">
                <Stat label="Verzonden" value={stats.offertes.verzonden} />
                <Stat label="Getekend" value={stats.offertes.getekend} tone="success" />
                <Stat label="Openstaand" value={stats.offertes.openstaand} tone="info" />
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <BadgeCheck size={13} /> Reserveringsbevestigingen
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Verzonden" value={stats.bevestigingen.verzonden} tone="success" />
                <Stat label="Nog te versturen" value={stats.nogTeVersturen.length} tone={stats.nogTeVersturen.length ? 'warning' : undefined} />
              </div>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground -mt-2">
            Verzonden en getekend (offerte akkoord via vinkje): {PERIOD_LABEL[period].toLowerCase()} ({formatDate(range.from)} t/m {formatDate(range.to)}). Openstaand en nog te versturen: op dit moment.
          </p>

          {stats.nogTeVersturen.length > 0 && (
            <div className="space-y-1.5">
              <h3 className="text-xs font-semibold text-warning flex items-center gap-1.5">
                <AlertTriangle size={13} /> Offerte getekend, reserveringsbevestiging nog niet verstuurd
              </h3>
              <div className="divide-y rounded-lg border border-border/60">
                {stats.nogTeVersturen.slice(0, 8).map((p) => {
                  const href = p.inquiryId ? `/inquiries/${p.inquiryId}` : p.contactId ? `/crm/${p.contactId}` : null;
                  const row = (
                    <div className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">{displayName(p)}</p>
                        <p className="text-xs text-muted-foreground truncate">{p.title}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
                        {p.signedAt && <span>getekend {formatDate(p.signedAt)}</span>}
                        {href && <ArrowRight size={12} />}
                      </div>
                    </div>
                  );
                  return href
                    ? <Link key={p.key} to={href} className="block hover:bg-muted/40 transition-colors">{row}</Link>
                    : <div key={p.key}>{row}</div>;
                })}
              </div>
              {stats.nogTeVersturen.length > 8 && (
                <p className="text-xs text-muted-foreground">+ {stats.nogTeVersturen.length - 8} meer</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
