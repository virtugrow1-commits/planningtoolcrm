import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Start- en eindtijd in de vensters "Offerte klaarzetten" en "Reserveringsbevestiging
 * klaarzetten". De documenten nemen de tijd van de optie/reservering; is er nog
 * geen optie, dan de voorkeurstijd van de aanvraag. Die kan hier direct worden
 * ingevuld, zodat de tijd niet meer los in het document hoeft te worden getypt.
 */
export interface Tijden { start: string; eind: string }

const pad = (n: unknown) => String(Number(n) || 0).padStart(2, '0');
const hhmm = (h: unknown, m: unknown) => `${pad(h)}:${pad(m)}`;

interface Props {
  inquiryId: string;
  value: Tijden;
  onChange: (t: Tijden) => void;
  /** true zodra bekend is dat de tijd uit een optie/reservering komt (dan niet bewerkbaar) */
  onFromBookingChange?: (fromBooking: boolean) => void;
  disabled?: boolean;
}

export default function AanvangTijden({ inquiryId, value, onChange, onFromBookingChange, disabled }: Props) {
  const [booking, setBooking] = useState<{ start: string; eind: string; date: string } | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('bookings')
        .select('date, start_hour, start_minute, end_hour, end_minute, status')
        .eq('inquiry_id', inquiryId)
        .in('status', ['option', 'confirmed'])
        .order('date', { ascending: true });
      if (cancelled) return;
      const rows = (data || []) as any[];
      if (!rows.length) { setBooking(null); onFromBookingChange?.(false); return; }
      const first = rows[0];
      const sameDay = rows.filter((b) => b.date === first.date);
      const mins = (b: any) => Number(b.end_hour) * 60 + Number(b.end_minute ?? 0);
      const last = sameDay.reduce((m, b) => (mins(b) > mins(m) ? b : m), first);
      setBooking({ start: hhmm(first.start_hour, first.start_minute), eind: hhmm(last.end_hour, last.end_minute), date: first.date });
      onFromBookingChange?.(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inquiryId]);

  if (booking === undefined) return null;

  if (booking) {
    return (
      <div className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-sm">
        <span className="text-muted-foreground">Tijd (uit de optie/reservering): </span>
        <span className="font-medium">{booking.start} – {booking.eind}</span>
        <p className="text-xs text-muted-foreground mt-1">Andere tijd nodig? Pas de optie of reservering in de agenda aan.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Starttijd (aanvang)</Label>
          <Input type="time" value={value.start} disabled={disabled} onChange={(e) => onChange({ ...value, start: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">Eindtijd</Label>
          <Input type="time" value={value.eind} disabled={disabled} onChange={(e) => onChange({ ...value, eind: e.target.value })} />
        </div>
      </div>
      {!value.start && (
        <p className="text-xs text-warning">Nog geen starttijd: vul hem hier in, anders staat er "—" in het document.</p>
      )}
    </div>
  );
}

/** Voorkeurstijd op de aanvraag opslaan als die is gewijzigd (alleen zonder optie/reservering). */
export async function saveAanvangTijden(inquiryId: string, t: Tijden, huidig: Tijden): Promise<void> {
  if (t.start === huidig.start && t.eind === huidig.eind) return;
  const { error } = await supabase
    .from('inquiries')
    .update({ preferred_start_time: t.start || null, preferred_end_time: t.eind || null } as any)
    .eq('id', inquiryId);
  if (error) throw new Error(`Tijd opslaan mislukt: ${error.message}`);
}
