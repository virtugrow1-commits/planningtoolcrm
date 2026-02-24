import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { Inquiry, ROOMS } from '@/types/crm';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarIcon, Users, Euro, User, Building2, FileText, MapPin, Trash2, RefreshCw, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';

const PIPELINE_COLUMNS: { key: Inquiry['status']; label: string; badgeClass: string }[] = [
  { key: 'new', label: 'Nieuwe Aanvraag', badgeClass: 'status-new' },
  { key: 'contacted', label: 'Lopend Contact', badgeClass: 'status-contacted' },
  { key: 'option', label: 'Optie', badgeClass: 'status-option' },
  { key: 'quoted', label: 'Offerte Verzonden', badgeClass: 'status-quoted' },
  { key: 'quote_revised', label: 'Aangepaste Offerte', badgeClass: 'status-quoted' },
  { key: 'reserved', label: 'Reservering', badgeClass: 'status-converted' },
  { key: 'script', label: 'Draaiboek Maken', badgeClass: 'status-option' },
  { key: 'confirmed', label: 'Definitieve Reservering', badgeClass: 'status-converted' },
  { key: 'invoiced', label: 'Facturatie', badgeClass: 'status-new' },
  { key: 'lost', label: 'Vervallen / Verloren', badgeClass: 'status-lost' },
  { key: 'converted', label: 'Omgezet', badgeClass: 'status-converted' },
  { key: 'after_sales', label: 'After Sales', badgeClass: 'status-converted' },
];

export { PIPELINE_COLUMNS };

interface Props {
  inquiry: Inquiry;
  editing: boolean;
  form: Inquiry | null;
  setForm: (f: Inquiry | null) => void;
  contact: any;
  company: any;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onStartEdit: () => void;
  onConvert: () => void;
  refetch: () => Promise<void>;
}

function InfoRow({ icon, label, value, onClick }: { icon: React.ReactNode; label: string; value: string; onClick?: () => void }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground mb-0.5 flex items-center gap-1.5">{icon} {label}</p>
      {onClick ? (
        <button onClick={onClick} className="text-primary hover:underline font-medium text-sm">{value}</button>
      ) : (
        <p className="text-foreground">{value}</p>
      )}
    </div>
  );
}

export default function InquiryDetailsTab({ inquiry, editing, form, setForm, contact, company, onSave, onCancel, onDelete, onStartEdit, onConvert, refetch }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [enriching, setEnriching] = useState(false);
  const col = PIPELINE_COLUMNS.find(c => c.key === inquiry.status);

  // Parse message field for structured display
  // Map cryptic GHL field IDs to readable labels
  const FIELD_LABEL_MAP: Record<string, string> = {
    'Saalh7jouh8kpkx4ntx9': 'Extra informatie over',
  };

  const messageLines = inquiry.message ? inquiry.message.split('\n').filter(l => l.trim()) : [];
  const structuredFields: { label: string; value: string }[] = [];
  const freeText: string[] = [];

  for (const line of messageLines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0 && colonIdx < 40) {
      const rawLabel = line.substring(0, colonIdx).trim();
      const label = FIELD_LABEL_MAP[rawLabel] || rawLabel;
      structuredFields.push({ label, value: line.substring(colonIdx + 1).trim() });
    } else {
      freeText.push(line);
    }
  }

  const current = editing ? form! : inquiry;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: Core details */}
      <div className="space-y-5">
        <div className="rounded-xl bg-card p-5 card-shadow space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-foreground">Aanvraaggegevens</h3>
            <Badge variant="secondary" className={cn('text-[11px] font-medium', col?.badgeClass)}>{col?.label}</Badge>
          </div>

          {editing ? (
            <div className="space-y-3">
              <div><Label>Contactpersoon</Label><Input value={form!.contactName} onChange={(e) => setForm({ ...form!, contactName: e.target.value })} /></div>
              <div><Label>Type evenement</Label><Input value={form!.eventType} onChange={(e) => setForm({ ...form!, eventType: e.target.value })} /></div>
              <div><Label>Voorkeursdatum</Label><Input type="date" value={form!.preferredDate} onChange={(e) => setForm({ ...form!, preferredDate: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Gasten</Label><Input type="number" min={0} value={form!.guestCount || ''} onChange={(e) => setForm({ ...form!, guestCount: Number(e.target.value) })} /></div>
                <div><Label>Budget (€)</Label><Input type="number" min={0} value={form!.budget || ''} onChange={(e) => setForm({ ...form!, budget: Number(e.target.value) || undefined })} /></div>
              </div>
              <div>
                <Label>Ruimte voorkeur</Label>
                <Select value={form!.roomPreference || ''} onValueChange={(v) => setForm({ ...form!, roomPreference: v })}>
                  <SelectTrigger><SelectValue placeholder="Optioneel" /></SelectTrigger>
                  <SelectContent>{ROOMS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form!.status} onValueChange={(v: Inquiry['status']) => setForm({ ...form!, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PIPELINE_COLUMNS.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Bron</Label>
                <Select value={form!.source} onValueChange={(v) => setForm({ ...form!, source: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Handmatig">Handmatig</SelectItem>
                    <SelectItem value="Website">Website</SelectItem>
                    <SelectItem value="Telefoon">Telefoon</SelectItem>
                    <SelectItem value="Email">Email</SelectItem>
                    <SelectItem value="GHL">VirtuGrow</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Notities</Label><Textarea value={form!.message} onChange={(e) => setForm({ ...form!, message: e.target.value })} rows={4} /></div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={onCancel}>Annuleren</Button>
                <Button size="sm" className="flex-1" onClick={onSave}>Opslaan</Button>
              </div>
              <Button variant="destructive" size="sm" className="w-full" onClick={onDelete}><Trash2 size={14} className="mr-1" /> Aanvraag verwijderen</Button>
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <InfoRow icon={<User size={14} />} label="Contactpersoon" value={inquiry.contactName} onClick={contact ? () => navigate(`/crm/${contact.id}`) : undefined} />
              {company && <InfoRow icon={<Building2 size={14} />} label="Bedrijf" value={company.name} onClick={() => navigate(`/companies/${company.id}`)} />}
              <InfoRow icon={<CalendarIcon size={14} />} label="Voorkeursdatum" value={inquiry.preferredDate || '—'} />
              <InfoRow icon={<Users size={14} />} label="Gasten" value={`${inquiry.guestCount}`} />
              <InfoRow icon={<Euro size={14} />} label="Budget" value={inquiry.budget ? `€${inquiry.budget.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}` : '—'} />
              {inquiry.roomPreference && <InfoRow icon={<MapPin size={14} />} label="Ruimte voorkeur" value={inquiry.roomPreference} />}
              <InfoRow icon={<FileText size={14} />} label="Bron" value={inquiry.source === 'GHL' ? 'VirtuGrow' : inquiry.source} />
              <p className="text-xs text-muted-foreground pt-2">Aangemaakt: {inquiry.createdAt}</p>

              <div className="flex gap-2 pt-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={onStartEdit}>Bewerken</Button>
                <Button size="sm" className="flex-1" onClick={onConvert}>
                  <ArrowRight size={14} className="mr-1" /> Omzetten naar Reservering
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* GHL Enrich button */}
        {inquiry.ghlOpportunityId && !editing && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={enriching}
            onClick={async () => {
              setEnriching(true);
              try {
                const { data, error } = await supabase.functions.invoke('ghl-enrich-inquiry', {
                  body: { inquiry_id: inquiry.id },
                });
                if (error) throw error;
                await refetch();
                toast({ title: 'Formuliergegevens opgehaald', description: `${(data?.fieldsFound || []).length} velden gevonden` });
              } catch (e: any) {
                toast({ title: 'Fout bij ophalen', description: e.message, variant: 'destructive' });
              } finally {
                setEnriching(false);
              }
            }}
          >
            <RefreshCw size={14} className={cn("mr-1", enriching && "animate-spin")} />
            {enriching ? 'Ophalen...' : 'Formuliergegevens ophalen uit VirtuGrow'}
          </Button>
        )}

        {/* Contact card */}
        {contact && !editing && (
          <div className="rounded-xl bg-card p-5 card-shadow space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-foreground">Contactpersoon</h3>
              <button onClick={() => navigate(`/crm/${contact.id}`)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Bekijk profiel →</button>
            </div>
            <p className="text-sm font-medium text-foreground">{contact.firstName} {contact.lastName}</p>
            {contact.email && <p className="text-xs text-muted-foreground">{contact.email}</p>}
            {contact.phone && <p className="text-xs text-muted-foreground">{contact.phone}</p>}
          </div>
        )}
      </div>

      {/* Right: Klantinvoer / formulierdata */}
      <div className="space-y-5">
        <div className="rounded-xl bg-card p-5 card-shadow space-y-3">
          <h3 className="text-base font-bold text-foreground">Klantinvoer (Formuliergegevens)</h3>
          
          {/* Show dedicated fields that might not be in message */}
          <div className="space-y-2">
            {inquiry.preferredDate && (
              <div className="flex items-start gap-2 text-sm">
                <span className="font-semibold text-muted-foreground min-w-[120px] shrink-0">Gewenste datum:</span>
                <span className="text-foreground">{inquiry.preferredDate}</span>
              </div>
            )}
            {inquiry.guestCount > 0 && (
              <div className="flex items-start gap-2 text-sm">
                <span className="font-semibold text-muted-foreground min-w-[120px] shrink-0">Aantal gasten:</span>
                <span className="text-foreground">{inquiry.guestCount}</span>
              </div>
            )}
            {inquiry.roomPreference && (
              <div className="flex items-start gap-2 text-sm">
                <span className="font-semibold text-muted-foreground min-w-[120px] shrink-0">Ruimte voorkeur:</span>
                <span className="text-foreground">{inquiry.roomPreference}</span>
              </div>
            )}
            {inquiry.budget && (
              <div className="flex items-start gap-2 text-sm">
                <span className="font-semibold text-muted-foreground min-w-[120px] shrink-0">Budget:</span>
                <span className="text-foreground">€{inquiry.budget.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}</span>
              </div>
            )}
          </div>

          {/* Structured fields from message */}
          {structuredFields.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-border">
              {structuredFields.map((f, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <span className="font-semibold text-muted-foreground min-w-[120px] shrink-0">{f.label}:</span>
                  <span className="text-foreground">{f.value}</span>
                </div>
              ))}
            </div>
          )}
          {structuredFields.length === 0 && !inquiry.preferredDate && !inquiry.roomPreference && (
            <p className="text-xs text-muted-foreground">Geen gestructureerde formulierdata beschikbaar.</p>
          )}
          {freeText.length > 0 && (
            <div className="pt-2 border-t border-border">
              <p className="text-xs font-semibold text-muted-foreground mb-1">Opmerkingen</p>
              <p className="text-sm text-foreground whitespace-pre-wrap">{freeText.join('\n')}</p>
            </div>
          )}
          {!inquiry.message && !inquiry.preferredDate && !inquiry.roomPreference && (
            <p className="text-xs text-muted-foreground italic">Nog geen formuliergegevens beschikbaar. {inquiry.ghlOpportunityId ? 'Gebruik de knop hiernaast om data op te halen.' : ''}</p>
          )}
        </div>

        {/* Company card */}
        {company && !editing && (
          <div className="rounded-xl bg-card p-5 card-shadow space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-foreground">Bedrijf</h3>
              <button onClick={() => navigate(`/companies/${company.id}`)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Bekijk bedrijf →</button>
            </div>
            <p className="text-sm font-medium text-foreground">{company.name}</p>
          </div>
        )}
      </div>
    </div>
  );
}
