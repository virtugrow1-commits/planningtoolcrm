import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { formatDateTime } from '@/lib/formatters';
import { Zap, Plus, Trash2, Play, ChevronDown, ChevronUp, Clock, CheckCircle2, AlertTriangle } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Trigger = 'booking_confirmed' | 'booking_option' | 'booking_cancelled' | 'quote_sent' | 'quote_signed' | 'event_passed' | 'option_expiring';

interface Template {
  id: string;
  trigger: Trigger;
  title: string;
  description: string | null;
  anchor: 'event_date' | 'trigger_date';
  offset_days: number;
  assignees: string[];
  priority: 'low' | 'normal' | 'high' | 'urgent';
  enabled: boolean;
  sort_order: number;
}

interface Setting {
  key: string;
  enabled: boolean;
  config: Record<string, any>;
}

interface RunLog {
  id: string;
  created_at: string;
  status: string;
  details: any;
}

const TRIGGERS: { value: Trigger; label: string; help: string; anchorLabel: string }[] = [
  { value: 'booking_option', label: 'Optie geplaatst', help: 'Zodra een optie in de kalender staat.', anchorLabel: 'dagen na plaatsen van de optie' },
  { value: 'booking_confirmed', label: 'Reservering definitief', help: 'Zodra een reservering bevestigd is.', anchorLabel: 'dagen t.o.v. de reserveringsdatum (negatief = ervoor)' },
  { value: 'quote_sent', label: 'Offerte verzonden', help: 'Zodra een offerte/contract vanuit GoHighLevel verzonden is (vereist "Offertes & contracten").', anchorLabel: 'dagen na verzenden' },
  { value: 'quote_signed', label: 'Offerte getekend', help: 'Zodra een offerte/contract getekend is (vereist "Offertes & contracten").', anchorLabel: 'dagen na tekenen' },
  { value: 'option_expiring', label: 'Optie loopt af', help: 'Een paar dagen voordat een optie verloopt (vereist "Opties laten verlopen").', anchorLabel: 'dagen na de waarschuwing' },
  { value: 'event_passed', label: 'Evenement heeft plaatsgevonden', help: 'De dag na een bevestigde reservering.', anchorLabel: 'dagen na de reserveringsdatum' },
  { value: 'booking_cancelled', label: 'Reservering geannuleerd', help: 'Zodra een reservering op geannuleerd gezet wordt.', anchorLabel: 'dagen na annuleren' },
];

const PRIORITIES: { value: Template['priority']; label: string }[] = [
  { value: 'low', label: 'Laag' }, { value: 'normal', label: 'Normaal' }, { value: 'high', label: 'Hoog' }, { value: 'urgent', label: 'Urgent' },
];

const INQUIRY_STATUSES: { value: string; label: string }[] = [
  { value: 'contacted', label: 'Lopend contact' }, { value: 'option', label: 'Optie' }, { value: 'quoted', label: 'Offerte verzonden' },
  { value: 'quote_revised', label: 'Aangepaste offerte verzonden' }, { value: 'reserved', label: 'Reservering' }, { value: 'script', label: 'Draaiboek maken' },
  { value: 'confirmed', label: 'Definitieve reservering' }, { value: 'invoiced', label: 'Facturatie' }, { value: 'after_sales', label: 'After sales' },
  { value: 'converted', label: 'Evenement' },
];

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export default function AutomationsPanel() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { members } = useTeamMembers();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [settings, setSettings] = useState<Record<string, Setting>>({});
  const [runs, setRuns] = useState<RunLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: tpl }, { data: st }, { data: logs }] = await Promise.all([
      (supabase as any).from('task_templates').select('*').order('sort_order').order('created_at'),
      (supabase as any).from('automation_settings').select('key, enabled, config'),
      (supabase as any).from('sync_log').select('id, created_at, status, details').eq('action', 'crm-automations-run').order('created_at', { ascending: false }).limit(8),
    ]);
    setTemplates((tpl as Template[]) || []);
    const map: Record<string, Setting> = {};
    for (const row of (st as Setting[]) || []) map[row.key] = row;
    setSettings(map);
    setRuns((logs as RunLog[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ----------------------------------------------------------------- settings
  const setting = (key: string, defaults: Record<string, any>): Setting => settings[key] || { key, enabled: false, config: defaults };

  const saveSetting = async (key: string, patch: Partial<Setting>, defaults: Record<string, any>) => {
    const current = setting(key, defaults);
    const next: Setting = { key, enabled: patch.enabled ?? current.enabled, config: { ...defaults, ...current.config, ...(patch.config || {}) } };
    setSettings(prev => ({ ...prev, [key]: next }));
    const { error } = await (supabase as any).from('automation_settings').upsert({ key, user_id: user?.id, enabled: next.enabled, config: next.config }, { onConflict: 'key' });
    if (error) toast({ title: 'Opslaan mislukt', description: error.message, variant: 'destructive' });
  };

  // ---------------------------------------------------------------- templates
  const updateTemplate = async (id: string, patch: Partial<Template>) => {
    setTemplates(prev => prev.map(t => (t.id === id ? { ...t, ...patch } : t)));
    const { error } = await (supabase as any).from('task_templates').update(patch).eq('id', id);
    if (error) toast({ title: 'Opslaan mislukt', description: error.message, variant: 'destructive' });
  };

  const addTemplate = async (trigger: Trigger) => {
    if (!user) return;
    const def = TRIGGERS.find(t => t.value === trigger)!;
    const row = {
      user_id: user.id, trigger, title: 'Nieuwe taak', description: null,
      anchor: trigger === 'booking_confirmed' || trigger === 'event_passed' ? 'event_date' : 'trigger_date',
      offset_days: trigger === 'booking_confirmed' ? -7 : 1,
      assignees: members.map(m => m.displayName).filter(Boolean), priority: 'normal', enabled: false,
      sort_order: (templates.filter(t => t.trigger === trigger).length + 1) * 10,
    };
    const { data, error } = await (supabase as any).from('task_templates').insert(row).select('*').single();
    if (error) { toast({ title: 'Toevoegen mislukt', description: error.message, variant: 'destructive' }); return; }
    setTemplates(prev => [...prev, data as Template]);
    setExpanded((data as Template).id);
    toast({ title: `Taak toegevoegd bij "${def.label}"`, description: 'Vul de titel in en zet de taak aan.' });
  };

  const deleteTemplate = async (id: string) => {
    setTemplates(prev => prev.filter(t => t.id !== id));
    const { error } = await (supabase as any).from('task_templates').delete().eq('id', id);
    if (error) toast({ title: 'Verwijderen mislukt', description: error.message, variant: 'destructive' });
  };

  const runNow = async (dryRun: boolean) => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('crm-automations', { body: { source: 'settings', dry_run: dryRun } });
      if (error) throw error;
      const d = data || {};
      toast({
        title: dryRun ? 'Proefdraai (er is niets gewijzigd)' : 'Automatiseringen uitgevoerd',
        description: `${d.tasks_created || 0} taken, ${d.inquiries_updated || 0} aanvragen, ${d.bookings_updated || 0} reserveringen, ${d.contacts_updated || 0} contacten${d.errors?.length ? ` · ${d.errors.length} fouten` : ''}`,
      });
      await load();
    } catch (err: any) {
      toast({ title: 'Uitvoeren mislukt', description: err.message, variant: 'destructive' });
    } finally {
      setRunning(false);
    }
  };

  const grouped = useMemo(() => {
    const map: Record<string, Template[]> = {};
    for (const t of TRIGGERS) map[t.value] = templates.filter(x => x.trigger === t.value);
    return map;
  }, [templates]);

  const memberNames = members.map(m => m.displayName).filter(Boolean);
  const taskTemplatesOn = setting('task_templates', {}).enabled;
  const quoteCfg = setting('quote_documents', { sent_status: 'quoted', signed_status: 'confirmed', convert_option_to_confirmed: true, title_keywords: ['offerte', 'contract'] });
  const optionCfg = setting('option_expiry', { default_days_before_event: 14, warn_days_before_expiry: 3, auto_expire: true });
  const postCfg = setting('post_event', { inquiry_status: 'invoiced', contact_status: 'client', ghl_tags: ['klant', 'review-aanvraag'], lookback_days: 14 });
  const slaCfg = setting('inbound_reply_sla', { hours: 4, assignees: memberNames });
  const tagCfg = setting('contact_tags', { lead: 'lead', prospect: 'prospect', client: 'klant', inactive: 'inactief' });

  if (loading) {
    return <Card><CardContent className="p-6"><div className="h-40 animate-pulse rounded-lg bg-muted" /></CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-2 text-base font-semibold text-foreground"><Zap size={16} /> Automatiseringen CRM ↔ GoHighLevel</h3>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Deze automatiseringen draaien elke 10 minuten op de achtergrond en direct na het opslaan van een reservering.
                Elke actie gebeurt precies één keer per reservering/aanvraag; opnieuw uitvoeren maakt nooit dubbele taken.
                Let op: zet een taaksoort hier pas aan nadat de bijbehorende GoHighLevel-workflow uit staat, anders krijg je die taak dubbel.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => runNow(true)} disabled={running}>Proefdraai</Button>
              <Button size="sm" onClick={() => runNow(false)} disabled={running} className="gap-1"><Play size={14} /> Nu uitvoeren</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 1. Task templates */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <SectionHeader
            title="Taken vanuit de CRM"
            description="De CRM maakt zelf taken aan bij opties, reserveringen, offertes en na afloop van een evenement — relatief aan de datum. Taken worden meteen naar GoHighLevel gepusht. Per taak kun je meerdere collega's kiezen; iedereen krijgt dan een eigen exemplaar."
            enabled={taskTemplatesOn}
            onToggle={(v) => saveSetting('task_templates', { enabled: v }, {})}
          />
          <div className="space-y-4">
            {TRIGGERS.map(trig => (
              <div key={trig.value} className="rounded-lg border">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2">
                  <div>
                    <p className="text-sm font-medium">{trig.label}</p>
                    <p className="text-[11px] text-muted-foreground">{trig.help}</p>
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => addTemplate(trig.value)}><Plus size={12} /> Taak</Button>
                </div>
                {grouped[trig.value].length === 0 ? (
                  <p className="px-4 py-3 text-xs text-muted-foreground">Geen taken.</p>
                ) : (
                  <div className="divide-y">
                    {grouped[trig.value].map(t => (
                      <TemplateRow
                        key={t.id}
                        template={t}
                        anchorLabel={trig.anchorLabel}
                        members={memberNames}
                        expanded={expanded === t.id}
                        onExpand={() => setExpanded(expanded === t.id ? null : t.id)}
                        onChange={(patch) => updateTemplate(t.id, patch)}
                        onDelete={() => deleteTemplate(t.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 2. Quote documents */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <SectionHeader
            title="Offertes & contracten (GoHighLevel Documents)"
            description="Wordt een offerte vanuit GoHighLevel verzonden, dan gaat de aanvraag naar 'Offerte verzonden' en vuren de taken bij 'Offerte verzonden'. Wordt het document getekend, dan wordt de aanvraag definitief en worden opties van die aanvraag omgezet naar een bevestigde reservering (ook in GoHighLevel)."
            enabled={quoteCfg.enabled}
            onToggle={(v) => saveSetting('quote_documents', { enabled: v }, quoteCfg.config)}
          />
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Status na verzenden">
              <StatusSelect value={quoteCfg.config.sent_status} onChange={(v) => saveSetting('quote_documents', { config: { sent_status: v } }, quoteCfg.config)} />
            </Field>
            <Field label="Status na tekenen">
              <StatusSelect value={quoteCfg.config.signed_status} onChange={(v) => saveSetting('quote_documents', { config: { signed_status: v } }, quoteCfg.config)} />
            </Field>
            <Field label="Herken offertes aan (woorden in de documenttitel, komma-gescheiden)">
              <Input
                defaultValue={(quoteCfg.config.title_keywords || []).join(', ')}
                onBlur={(e) => saveSetting('quote_documents', { config: { title_keywords: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } }, quoteCfg.config)}
              />
            </Field>
            <Field label="Optie → bevestigd bij tekenen">
              <div className="flex h-10 items-center"><Switch checked={quoteCfg.config.convert_option_to_confirmed !== false} onCheckedChange={(v) => saveSetting('quote_documents', { config: { convert_option_to_confirmed: v } }, quoteCfg.config)} /></div>
            </Field>
          </div>
        </CardContent>
      </Card>

      {/* 3. Option expiry */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <SectionHeader
            title="Opties laten verlopen"
            description="Elke optie krijgt een vervaldatum (in te vullen op de reservering; leeg = automatisch). Vlak voor de vervaldatum vuren de taken bij 'Optie loopt af'. Daarna wordt de optie automatisch op 'Vervallen' gezet en wordt de afspraak in GoHighLevel geannuleerd, zodat de zaal weer vrij is."
            enabled={optionCfg.enabled}
            onToggle={(v) => saveSetting('option_expiry', { enabled: v }, optionCfg.config)}
          />
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Standaard vervaldatum: dagen vóór de reserveringsdatum">
              <Input type="number" min={0} defaultValue={optionCfg.config.default_days_before_event} onBlur={(e) => saveSetting('option_expiry', { config: { default_days_before_event: Number(e.target.value) || 0 } }, optionCfg.config)} />
            </Field>
            <Field label="Waarschuw (taak) dagen vóór de vervaldatum">
              <Input type="number" min={0} defaultValue={optionCfg.config.warn_days_before_expiry} onBlur={(e) => saveSetting('option_expiry', { config: { warn_days_before_expiry: Number(e.target.value) || 0 } }, optionCfg.config)} />
            </Field>
            <Field label="Automatisch op 'Vervallen' zetten">
              <div className="flex h-10 items-center"><Switch checked={optionCfg.config.auto_expire !== false} onCheckedChange={(v) => saveSetting('option_expiry', { config: { auto_expire: v } }, optionCfg.config)} /></div>
            </Field>
          </div>
        </CardContent>
      </Card>

      {/* 4. Post event */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <SectionHeader
            title="Na het evenement"
            description="De dag na een bevestigde reservering: contact wordt 'Klant', de aanvraag schuift door in de pijplijn (dit is het moment waarop de opportunity in GoHighLevel 'won' wordt) en het contact krijgt GoHighLevel-tags waarmee je daar een workflow start (bijv. reviewverzoek)."
            enabled={postCfg.enabled}
            onToggle={(v) => saveSetting('post_event', { enabled: v }, postCfg.config)}
          />
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Aanvraag naar status">
              <StatusSelect value={postCfg.config.inquiry_status || ''} allowNone onChange={(v) => saveSetting('post_event', { config: { inquiry_status: v || null } }, postCfg.config)} />
            </Field>
            <Field label="Contactstatus">
              <Select value={postCfg.config.contact_status || 'none'} onValueChange={(v) => saveSetting('post_event', { config: { contact_status: v === 'none' ? null : v } }, postCfg.config)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Niet wijzigen</SelectItem>
                  <SelectItem value="client">Klant</SelectItem>
                  <SelectItem value="prospect">Prospect</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="GoHighLevel-tags toevoegen (komma-gescheiden)">
              <Input defaultValue={(postCfg.config.ghl_tags || []).join(', ')} onBlur={(e) => saveSetting('post_event', { config: { ghl_tags: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } }, postCfg.config)} />
            </Field>
          </div>
        </CardContent>
      </Card>

      {/* 5. Inbound SLA */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <SectionHeader
            title="Onbeantwoord bericht"
            description="Blijft een inkomend bericht (SMS/e-mail/chat via GoHighLevel) langer dan het ingestelde aantal uren ongelezen, dan komt er een taak 'Beantwoorden' met hoge prioriteit."
            enabled={slaCfg.enabled}
            onToggle={(v) => saveSetting('inbound_reply_sla', { enabled: v }, slaCfg.config)}
          />
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Na hoeveel uur">
              <Input type="number" min={1} defaultValue={slaCfg.config.hours} onBlur={(e) => saveSetting('inbound_reply_sla', { config: { hours: Number(e.target.value) || 4 } }, slaCfg.config)} />
            </Field>
            <Field label="Taak voor">
              <AssigneePicker value={slaCfg.config.assignees || []} members={memberNames} onChange={(v) => saveSetting('inbound_reply_sla', { config: { assignees: v } }, slaCfg.config)} />
            </Field>
          </div>
        </CardContent>
      </Card>

      {/* 6. Contact tags */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <SectionHeader
            title="Contactstatus als GoHighLevel-tag"
            description="De status van een contact (lead, prospect, klant) wordt als tag op het GoHighLevel-contact gezet, zodat je daar nieuwsbrieven en campagnes per doelgroep kunt sturen. De oude statustag wordt automatisch verwijderd."
            enabled={tagCfg.enabled}
            onToggle={(v) => saveSetting('contact_tags', { enabled: v }, tagCfg.config)}
          />
          <div className="grid gap-4 md:grid-cols-4">
            {(['lead', 'prospect', 'client', 'inactive'] as const).map(status => (
              <Field key={status} label={`Tag voor "${{ lead: 'Lead', prospect: 'Prospect', client: 'Klant', inactive: 'Inactief' }[status]}"`}>
                <Input defaultValue={tagCfg.config[status] || ''} onBlur={(e) => saveSetting('contact_tags', { config: { [status]: e.target.value.trim() } }, tagCfg.config)} />
              </Field>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Runs */}
      <Card>
        <CardContent className="p-6 space-y-3">
          <h4 className="flex items-center gap-2 text-sm font-semibold"><Clock size={14} /> Laatste uitvoeringen</h4>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nog niets uitgevoerd.</p>
          ) : (
            <div className="divide-y rounded-lg border text-sm">
              {runs.map(r => {
                const d = r.details || {};
                return (
                  <div key={r.id} className="px-4 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {r.status === 'error' ? <AlertTriangle size={14} className="text-destructive" /> : <CheckCircle2 size={14} className="text-success" />}
                      <span className="font-medium">{formatDateTime(r.created_at)}</span>
                      <span className="text-muted-foreground">{d.source || 'cron'} · {d.tasks_created || 0} taken · {d.inquiries_updated || 0} aanvragen · {d.bookings_updated || 0} reserveringen · {d.contacts_updated || 0} contacten</span>
                    </div>
                    {Array.isArray(d.details) && d.details.length > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">{d.details.slice(0, 6).join(' · ')}{d.details.length > 6 ? ' · …' : ''}</p>
                    )}
                    {Array.isArray(d.errors) && d.errors.length > 0 && (
                      <p className="mt-1 text-xs text-destructive">{d.errors.slice(0, 3).join(' · ')}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionHeader({ title, description, enabled, onToggle }: { title: string; description: string; enabled: boolean; onToggle: (v: boolean) => void }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={enabled ? 'default' : 'secondary'} className="text-[10px]">{enabled ? 'Aan' : 'Uit'}</Badge>
        <Switch checked={enabled} onCheckedChange={onToggle} />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function StatusSelect({ value, onChange, allowNone }: { value: string; onChange: (v: string) => void; allowNone?: boolean }) {
  return (
    <Select value={value || (allowNone ? 'none' : 'quoted')} onValueChange={(v) => onChange(v === 'none' ? '' : v)}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        {allowNone && <SelectItem value="none">Niet wijzigen</SelectItem>}
        {INQUIRY_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function AssigneePicker({ value, members, onChange }: { value: string[]; members: string[]; onChange: (v: string[]) => void }) {
  const all = Array.from(new Set([...members, ...value]));
  return (
    <div className="flex flex-wrap gap-2">
      {all.length === 0 && <span className="text-xs text-muted-foreground">Geen teamleden gevonden.</span>}
      {all.map(name => {
        const on = value.includes(name);
        return (
          <button
            key={name}
            type="button"
            onClick={() => onChange(on ? value.filter(v => v !== name) : [...value, name])}
            className={`rounded-full border px-3 py-1 text-xs transition ${on ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}
          >
            {name}
          </button>
        );
      })}
    </div>
  );
}

function TemplateRow({ template, anchorLabel, members, expanded, onExpand, onChange, onDelete }: {
  template: Template; anchorLabel: string; members: string[]; expanded: boolean;
  onExpand: () => void; onChange: (patch: Partial<Template>) => void; onDelete: () => void;
}) {
  const offsetText = template.offset_days === 0 ? 'op de dag zelf'
    : template.offset_days < 0 ? `${Math.abs(template.offset_days)} dagen ervoor` : `${template.offset_days} dagen erna`;
  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onExpand} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          {expanded ? <ChevronUp size={14} className="shrink-0 text-muted-foreground" /> : <ChevronDown size={14} className="shrink-0 text-muted-foreground" />}
          <div className="min-w-0">
            <p className={`truncate text-sm font-medium ${template.enabled ? 'text-foreground' : 'text-muted-foreground'}`}>{template.title}</p>
            <p className="text-[11px] text-muted-foreground">
              {offsetText}{template.anchor === 'event_date' ? ' (t.o.v. reserveringsdatum)' : ''} · {template.assignees.length ? template.assignees.join(' + ') : 'niet toegewezen'} · {PRIORITIES.find(p => p.value === template.priority)?.label}
            </p>
          </div>
        </button>
        {!template.enabled && <Badge variant="secondary" className="text-[10px]">Uit</Badge>}
        <Switch checked={template.enabled} onCheckedChange={(v) => onChange({ enabled: v })} />
      </div>
      {expanded && (
        <div className="mt-3 grid gap-3 rounded-lg bg-muted/30 p-3 md:grid-cols-2">
          <Field label="Titel (gebruik {naam}, {bedrijf}, {titel}, {datum}, {zaal})">
            <Input defaultValue={template.title} onBlur={(e) => e.target.value.trim() && onChange({ title: e.target.value.trim() })} />
          </Field>
          <Field label="Prioriteit">
            <Select value={template.priority} onValueChange={(v) => onChange({ priority: v as Template['priority'] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PRIORITIES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label={`Wanneer: ${anchorLabel}`}>
            <div className="flex gap-2">
              <Input type="number" className="w-28" defaultValue={template.offset_days} onBlur={(e) => onChange({ offset_days: Number(e.target.value) || 0 })} />
              <Select value={template.anchor} onValueChange={(v) => onChange({ anchor: v as Template['anchor'] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="event_date">t.o.v. reserveringsdatum</SelectItem>
                  <SelectItem value="trigger_date">t.o.v. moment van de trigger</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Field>
          <Field label="Voor wie (iedereen krijgt een eigen taak)">
            <AssigneePicker value={template.assignees} members={members} onChange={(v) => onChange({ assignees: v })} />
          </Field>
          <div className="md:col-span-2">
            <Field label="Omschrijving">
              <Textarea rows={2} defaultValue={template.description || ''} onBlur={(e) => onChange({ description: e.target.value.trim() || null })} />
            </Field>
          </div>
          <div className="md:col-span-2 flex justify-end">
            <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs text-destructive" onClick={onDelete}><Trash2 size={12} /> Verwijderen</Button>
          </div>
        </div>
      )}
    </div>
  );
}
