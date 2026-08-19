import { formatDate } from '@/lib/formatters';
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
import { CalendarIcon, Users, Euro, User, Building2, FileText, MapPin, Trash2, RefreshCw, ArrowRight, UserCheck, Clock, MessageCircle, CalendarPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { InfoRow } from '@/components/detail/DetailPageComponents';
import TeamMemberSelect from '@/components/TeamMemberSelect';
import CrmCombobox from '@/components/CrmCombobox';
import { useCompaniesContext } from '@/contexts/CompaniesContext';

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
  { key: 'converted', label: 'Afgehandeld', badgeClass: 'status-converted' },
  { key: 'after_sales', label: 'After Sales', badgeClass: 'status-converted' },
  { key: 'condolence_reminder', label: 'Condoleance Herdenkingen', badgeClass: 'status-contacted' },
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
  onCreateOption: () => void;
  onStatusChange: () => void;
  refetch: () => Promise<void>;
  existingOption?: { id: string; date: string } | null;
}

/* InfoRow is now imported from @/components/detail/DetailPageComponents */

export default function InquiryDetailsTab({ inquiry, editing, form, setForm, contact, company, onSave, onCancel, onDelete, onStartEdit, onConvert, onCreateOption, onStatusChange, refetch, existingOption }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const { companies } = useCompaniesContext();
  const [enriching, setEnriching] = useState(false);
  const col = PIPELINE_COLUMNS.find(c => c.key === inquiry.status);

  // Parse message field for structured display (velden + vrije tekst, originele volgorde)
  const { fields: structuredFields, freeText } = parseInquiryMessage(inquiry.message);

  const current = editing ? form! : inquiry;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: Core details */}
      <div className="space-y-5">
        <div className="rounded-xl bg-card p-5 card-shadow space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-foreground">{t('detail.inquiryDetails')}</h3>
            <Badge variant="secondary" className={cn('text-[11px] font-medium', col?.badgeClass)}>{t(`status.${inquiry.status}`)}</Badge>
          </div>

          {editing ? (
            <div className="space-y-3">
              <div><Label>{t('inquiries.contactPerson')}</Label><Input value={form!.contactName} onChange={(e) => setForm({ ...form!, contactName: e.target.value })} /></div>
              <div>
                <Label>{t('crm.company')}</Label>
                <CrmCombobox
                  options={companies.map(co => ({
                    id: co.id,
                    label: co.name,
                    secondary: co.city || co.email || undefined,
                    searchText: `${co.name} ${co.city || ''} ${co.kvk || ''} ${co.email || ''}`,
                  }))}
                  value={form!.companyId || ''}
                  onSelect={(id) => setForm({ ...form!, companyId: id || undefined })}
                  placeholder="Selecteer bedrijf..."
                  searchPlaceholder="Zoek bedrijf..."
                  popoverWidth="w-[340px]"
                />
              </div>
              <div><Label>{t('inquiries.eventType')}</Label><Input value={form!.eventType} onChange={(e) => setForm({ ...form!, eventType: e.target.value })} /></div>
              <div><Label>{t('inquiries.preferredDate')}</Label><Input type="date" value={form!.preferredDate} onChange={(e) => setForm({ ...form!, preferredDate: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>{language === 'en' ? 'Preferred time from' : 'Voorkeurstijd van'}</Label><Input type="time" value={form!.preferredStartTime || ''} onChange={(e) => setForm({ ...form!, preferredStartTime: e.target.value })} /></div>
                <div><Label>{language === 'en' ? 'Preferred time to' : 'Voorkeurstijd tot'}</Label><Input type="time" value={form!.preferredEndTime || ''} onChange={(e) => setForm({ ...form!, preferredEndTime: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>{t('inquiries.guestCount')}</Label><Input type="number" min={0} value={form!.guestCount || ''} onChange={(e) => setForm({ ...form!, guestCount: Number(e.target.value) })} /></div>
                <div><Label>{t('inquiries.budget')} (€)</Label><Input type="number" min={0} value={form!.budget || ''} onChange={(e) => setForm({ ...form!, budget: Number(e.target.value) || undefined })} /></div>
              </div>
              <div>
                <Label>{t('inquiries.roomPreference')}</Label>
                <Select value={form!.roomPreference || ''} onValueChange={(v) => setForm({ ...form!, roomPreference: v })}>
                  <SelectTrigger><SelectValue placeholder={t('common.optional')} /></SelectTrigger>
                  <SelectContent>
                    {ROOMS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    <SelectItem value="Condoleance & Herdenkingen">Condoleance & Herdenkingen</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('common.status')}</Label>
                <Select value={form!.status} onValueChange={(v: Inquiry['status']) => setForm({ ...form!, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PIPELINE_COLUMNS.map(c => <SelectItem key={c.key} value={c.key}>{t(`status.${c.key}`)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('common.source')}</Label>
                <Select value={form!.source} onValueChange={(v) => setForm({ ...form!, source: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Handmatig">{t('source.manual')}</SelectItem>
                    <SelectItem value="Website">{t('source.website')}</SelectItem>
                    <SelectItem value="Telefoon">{t('source.phone')}</SelectItem>
                    <SelectItem value="Email">{t('source.email')}</SelectItem>
                    <SelectItem value="GHL">{t('source.ghl')}</SelectItem>
                  </SelectContent>
              </Select>
              </div>
              <div><Label>{t('tasks.assignedTo')}</Label><TeamMemberSelect value={form!.assignedTo} onValueChange={(v) => setForm({ ...form!, assignedTo: v })} /></div>
              <div><Label>{t('common.notes')}</Label><Textarea value={form!.message} onChange={(e) => setForm({ ...form!, message: e.target.value })} rows={4} /></div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={onCancel}>{t('common.cancel')}</Button>
                <Button size="sm" className="flex-1" onClick={onSave}>{t('common.save')}</Button>
              </div>
              <Button variant="destructive" size="sm" className="w-full" onClick={onDelete}><Trash2 size={14} className="mr-1" /> {t('inquiries.deleteInquiry')}</Button>
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <InfoRow icon={<User size={14} />} label={t('inquiries.contactPerson')} value={inquiry.contactName} onClick={contact ? () => navigate(`/crm/${contact.id}`) : undefined} />
              {company && <InfoRow icon={<Building2 size={14} />} label={t('crm.company')} value={company.name} onClick={() => navigate(`/companies/${company.id}`)} />}
              <InfoRow icon={<CalendarIcon size={14} />} label={t('inquiries.preferredDate')} value={formatDate(inquiry.preferredDate)} />
              {(inquiry.preferredStartTime || inquiry.preferredEndTime) && (
                <InfoRow icon={<Clock size={14} />} label={t('inquiries.preferredTime')} value={`${inquiry.preferredStartTime || '—'} – ${inquiry.preferredEndTime || '—'}`} />
              )}
              <InfoRow icon={<Users size={14} />} label={t('inquiries.guestCount')} value={`${inquiry.guestCount}`} />
              <InfoRow icon={<Euro size={14} />} label={t('inquiries.budget')} value={inquiry.budget ? `€${inquiry.budget.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}` : '—'} />
              <InfoRow icon={<MapPin size={14} />} label={t('inquiries.roomPreference')} value={inquiry.roomPreference || '—'} />
              <InfoRow icon={<FileText size={14} />} label={t('common.source')} value={inquiry.source === 'GHL' ? 'VirtuGrow' : inquiry.source} />
              {inquiry.assignedTo && <InfoRow icon={<UserCheck size={14} />} label={t('tasks.assignedTo')} value={inquiry.assignedTo} />}
              
              <p className="text-xs text-muted-foreground pt-2">{t('common.createdAt')}: {formatDate(inquiry.createdAt)}</p>

              <div className="flex gap-2 pt-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={onStartEdit}>{t('common.edit')}</Button>
                <Button size="sm" className="flex-1" onClick={onStatusChange}>
                  <ArrowRight size={14} className="mr-1" /> Stadium wijzigen
                </Button>
              </div>
              {existingOption ? (
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full border border-warning/40 bg-warning/10 text-warning hover:bg-warning/20"
                  onClick={() => navigate(`/reserveringen/${existingOption.id}`)}
                >
                  <CalendarPlus size={14} className="mr-1" /> Optie staat in agenda ({formatDate(existingOption.date)}) — bekijken
                </Button>
              ) : (
                <Button variant="secondary" size="sm" className="w-full" onClick={onCreateOption}>
                  <CalendarPlus size={14} className="mr-1" /> Maak optie
                </Button>
              )}
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
                const fieldsCount = (data?.fieldsFound || []).length;
                if (data?.rateLimited && fieldsCount === 0) {
                  toast({ title: 'VirtuGrow API tijdelijk niet beschikbaar', description: 'De API is even overbelast. Probeer het over een paar minuten opnieuw.', variant: 'destructive' });
                } else {
                  toast({ title: 'Formuliergegevens opgehaald', description: `${fieldsCount} velden gevonden` });
                }
              } catch (e: any) {
                toast({ title: 'Fout bij ophalen', description: e.message, variant: 'destructive' });
              } finally {
                setEnriching(false);
              }
            }}
          >
            <RefreshCw size={14} className={cn("mr-1", enriching && "animate-spin")} />
            {enriching ? (language === 'en' ? 'Fetching...' : 'Ophalen...') : (language === 'en' ? 'Fetch form data from VirtuGrow' : 'Formuliergegevens ophalen uit VirtuGrow')}
          </Button>
        )}

        {/* Contact card */}
        {contact && !editing && (
          <div className="rounded-xl bg-card p-5 card-shadow space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-foreground">{t('detail.contactPerson')}</h3>
              <button onClick={() => navigate(`/crm/${contact.id}`)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">{t('detail.viewProfile')}</button>
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
          <h3 className="text-base font-bold text-foreground">{t('inquiries.customerInput')}</h3>
          
          {/* Show dedicated fields that might not be in message */}
          <div className="space-y-2">
            {inquiry.preferredDate && (
              <div className="flex items-start gap-2 text-sm">
                <span className="font-semibold text-muted-foreground min-w-[120px] shrink-0">Gewenste datum:</span>
                <span className="text-foreground">{formatDate(inquiry.preferredDate)}</span>
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
            <p className="text-xs text-muted-foreground">{t('inquiries.noFormData')}</p>
          )}
          {freeText.length > 0 && (
            <div className="pt-2 border-t border-border">
              <p className="text-xs font-semibold text-muted-foreground mb-1">{t('inquiries.remarks')}</p>
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
              <h3 className="text-base font-bold text-foreground">{t('detail.company')}</h3>
              <button onClick={() => navigate(`/companies/${company.id}`)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">{t('detail.viewCompany')}</button>
            </div>
            <p className="text-sm font-medium text-foreground">{company.name}</p>
          </div>
        )}
      </div>
    </div>
  );
}
