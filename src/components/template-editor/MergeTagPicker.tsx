import { useState, useRef, useEffect } from 'react';
import { Braces, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface MergeTag {
  tag: string;
  label: string;
  category: string;
}

const MERGE_TAGS: MergeTag[] = [
  // Contact
  { tag: '{{contact.name}}', label: 'Volledige naam', category: 'Contact' },
  { tag: '{{contact.first_name}}', label: 'Voornaam', category: 'Contact' },
  { tag: '{{contact.last_name}}', label: 'Achternaam', category: 'Contact' },
  { tag: '{{contact.email}}', label: 'E-mail', category: 'Contact' },
  { tag: '{{contact.phone}}', label: 'Telefoon', category: 'Contact' },
  { tag: '{{contact.job_title}}', label: 'Functie', category: 'Contact' },
  { tag: '{{contact.department}}', label: 'Afdeling', category: 'Contact' },

  // Bedrijf
  { tag: '{{company.name}}', label: 'Bedrijfsnaam', category: 'Bedrijf' },
  { tag: '{{company.email}}', label: 'Bedrijfs e-mail', category: 'Bedrijf' },
  { tag: '{{company.phone}}', label: 'Bedrijfs telefoon', category: 'Bedrijf' },
  { tag: '{{company.address}}', label: 'Adres', category: 'Bedrijf' },
  { tag: '{{company.postcode}}', label: 'Postcode', category: 'Bedrijf' },
  { tag: '{{company.city}}', label: 'Plaats', category: 'Bedrijf' },
  { tag: '{{company.country}}', label: 'Land', category: 'Bedrijf' },
  { tag: '{{company.kvk}}', label: 'KvK-nummer', category: 'Bedrijf' },
  { tag: '{{company.btw_number}}', label: 'BTW-nummer', category: 'Bedrijf' },
  { tag: '{{company.website}}', label: 'Website', category: 'Bedrijf' },

  // Aanvraag
  { tag: '{{inquiry.display_number}}', label: 'Aanvraagnummer', category: 'Aanvraag' },
  { tag: '{{inquiry.event_type}}', label: 'Type evenement', category: 'Aanvraag' },
  { tag: '{{inquiry.guest_count}}', label: 'Aantal gasten', category: 'Aanvraag' },
  { tag: '{{inquiry.preferred_date}}', label: 'Gewenste datum', category: 'Aanvraag' },
  { tag: '{{inquiry.preferred_start_time}}', label: 'Gewenste starttijd', category: 'Aanvraag' },
  { tag: '{{inquiry.preferred_end_time}}', label: 'Gewenste eindtijd', category: 'Aanvraag' },
  { tag: '{{inquiry.room_preference}}', label: 'Gewenste zaal', category: 'Aanvraag' },
  { tag: '{{inquiry.budget}}', label: 'Budget', category: 'Aanvraag' },
  { tag: '{{inquiry.status}}', label: 'Status', category: 'Aanvraag' },

  // Reservering
  { tag: '{{booking.reservation_number}}', label: 'Reserveringsnummer', category: 'Reservering' },
  { tag: '{{booking.title}}', label: 'Titel', category: 'Reservering' },
  { tag: '{{booking.date}}', label: 'Datum', category: 'Reservering' },
  { tag: '{{booking.start_time}}', label: 'Starttijd', category: 'Reservering' },
  { tag: '{{booking.end_time}}', label: 'Eindtijd', category: 'Reservering' },
  { tag: '{{booking.room_name}}', label: 'Zaalnaam', category: 'Reservering' },
  { tag: '{{booking.guest_count}}', label: 'Aantal gasten', category: 'Reservering' },
  { tag: '{{booking.room_setup}}', label: 'Zaalopstelling', category: 'Reservering' },
  { tag: '{{booking.status}}', label: 'Status', category: 'Reservering' },

  // Offerte
  { tag: '{{quote.display_number}}', label: 'Offertenummer', category: 'Offerte' },
  { tag: '{{quote.title}}', label: 'Titel', category: 'Offerte' },
  { tag: '{{quote.subtotal}}', label: 'Subtotaal', category: 'Offerte' },
  { tag: '{{quote.vat_amount}}', label: 'BTW bedrag', category: 'Offerte' },
  { tag: '{{quote.total}}', label: 'Totaal', category: 'Offerte' },
  { tag: '{{quote.valid_until}}', label: 'Geldig tot', category: 'Offerte' },

  // Algemeen
  { tag: '{{date.today}}', label: 'Datum vandaag', category: 'Algemeen' },
  { tag: '{{date.today_long}}', label: 'Datum vandaag (lang)', category: 'Algemeen' },
  { tag: '{{user.name}}', label: 'Jouw naam', category: 'Algemeen' },
];

interface MergeTagPickerProps {
  onInsert: (tag: string) => void;
}

export default function MergeTagPicker({ onInsert }: MergeTagPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = MERGE_TAGS.filter(t =>
    t.label.toLowerCase().includes(search.toLowerCase()) ||
    t.tag.toLowerCase().includes(search.toLowerCase()) ||
    t.category.toLowerCase().includes(search.toLowerCase())
  );

  const categories = [...new Set(filtered.map(t => t.category))];

  return (
    <div className="relative" ref={panelRef}>
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs gap-1.5"
        onClick={() => setOpen(!open)}
        title="Merge tag invoegen"
      >
        <Braces size={12} />
        Variabelen
      </Button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 w-[320px] bg-popover border border-border rounded-lg shadow-lg">
          <div className="p-2 border-b">
            <div className="relative">
              <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Zoek variabelen..."
                className="h-7 text-xs pl-7"
                autoFocus
              />
            </div>
          </div>

          <div className="max-h-[300px] overflow-y-auto p-1">
            {categories.map(cat => (
              <div key={cat}>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1.5">
                  {cat}
                </p>
                {filtered.filter(t => t.category === cat).map(tag => (
                  <button
                    key={tag.tag}
                    className="w-full flex items-center justify-between px-2 py-1.5 text-xs rounded hover:bg-accent transition-colors"
                    onClick={() => { onInsert(tag.tag); setOpen(false); setSearch(''); }}
                  >
                    <span className="text-foreground">{tag.label}</span>
                    <code className="text-[10px] text-muted-foreground bg-muted px-1 py-0.5 rounded font-mono">
                      {tag.tag}
                    </code>
                  </button>
                ))}
              </div>
            ))}
            {categories.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">Geen variabelen gevonden</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export { MERGE_TAGS };
