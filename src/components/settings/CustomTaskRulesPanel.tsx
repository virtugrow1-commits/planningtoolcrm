import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, Zap } from 'lucide-react';

interface CustomRule {
  id: string;
  label: string;
  enabled: boolean;
  trigger_event: string;
  offset_days: number;
  offset_from: string;
  priority: string;
  assigned_to: string | null;
}

const EVENTS: Record<string, string> = {
  inquiry_created: 'Nieuwe aanvraag',
  booking_created: 'Nieuwe reservering',
  option_created: 'Nieuwe optie',
};
const PRIORITIES: Record<string, string> = { low: 'Laag', normal: 'Normaal', high: 'Hoog', urgent: 'Urgent' };
const ASSIGNEES = ['Sjors Jochems', 'Iris Machielse'];

const empty = { label: '', trigger_event: 'booking_created', offset_days: 0, offset_from: 'created', priority: 'normal', assigned_to: 'auto' };

export default function CustomTaskRulesPanel() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rules, setRules] = useState<CustomRule[]>([]);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const db = supabase as any;

  const load = async () => {
    const { data } = await db
      .from('task_automation_rules')
      .select('id, label, enabled, trigger_event, offset_days, offset_from, priority, assigned_to')
      .eq('source', 'custom')
      .order('created_at');
    setRules(data || []);
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!user || !form.label.trim()) return;
    setSaving(true);
    const label = form.label.trim();
    const { error } = await db.from('task_automation_rules').insert({
      user_id: user.id,
      source: 'custom',
      match_key: `custom:${label.toLowerCase()}:${Date.now()}`,
      label,
      enabled: true,
      trigger_event: form.trigger_event,
      offset_days: Math.max(0, Number(form.offset_days) || 0),
      offset_from: form.offset_from,
      priority: form.priority,
      assigned_to: form.assigned_to === 'auto' ? null : form.assigned_to,
    });
    setSaving(false);
    if (error) { toast({ title: 'Opslaan mislukt', description: error.message, variant: 'destructive' }); return; }
    toast({ title: `"${label}" toegevoegd`, description: 'Deze taak wordt vanaf nu automatisch aangemaakt.' });
    setForm(empty);
    load();
  };

  const update = async (id: string, patch: Partial<CustomRule>) => {
    setRules(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
    const { error } = await db.from('task_automation_rules').update(patch).eq('id', id);
    if (error) { toast({ title: 'Opslaan mislukt', description: error.message, variant: 'destructive' }); load(); }
  };

  const remove = async (rule: CustomRule) => {
    if (!confirm(`"${rule.label}" verwijderen? Bestaande taken blijven staan.`)) return;
    await db.from('task_automation_rules').delete().eq('id', rule.id);
    load();
  };

  const describe = (r: CustomRule) => {
    const when = r.offset_days === 0
      ? (r.offset_from === 'event' ? 'op de eventdatum' : 'direct')
      : r.offset_from === 'event' ? `${r.offset_days} dagen vóór de eventdatum` : `${r.offset_days} dagen na aanmaken`;
    return `${EVENTS[r.trigger_event] || r.trigger_event} · ${when} · ${PRIORITIES[r.priority] || r.priority} · ${r.assigned_to || 'verantwoordelijke van de aanvraag'}`;
  };

  return (
    <Card>
      <CardContent className="p-6 space-y-5">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Zap size={16} /> Eigen automatische taken
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Voeg taken toe die CliqCRM zelf aanmaakt bij een nieuwe aanvraag, reservering of optie. De taak wordt
            gekoppeld aan de klant en aan die aanvraag of reservering.
          </p>
        </div>

        <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1 sm:col-span-2 lg:col-span-3">
            <Label>Naam van de taak</Label>
            <Input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} placeholder="Bijv. Draaiboek sturen" />
          </div>
          <div className="space-y-1">
            <Label>Aanmaken bij</Label>
            <Select value={form.trigger_event} onValueChange={v => setForm({ ...form, trigger_event: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(EVENTS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Datum van de taak</Label>
            <div className="flex gap-2">
              <Input type="number" min={0} className="w-20" value={form.offset_days}
                onChange={e => setForm({ ...form, offset_days: Number(e.target.value) })} />
              <Select value={form.offset_from} onValueChange={v => setForm({ ...form, offset_from: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="created">dagen na aanmaken</SelectItem>
                  <SelectItem value="event">dagen vóór eventdatum</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Prioriteit</Label>
            <Select value={form.priority} onValueChange={v => setForm({ ...form, priority: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(PRIORITIES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Verantwoordelijke</Label>
            <Select value={form.assigned_to} onValueChange={v => setForm({ ...form, assigned_to: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Zelfde als aanvraag</SelectItem>
                {ASSIGNEES.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={add} disabled={saving || !form.label.trim()} className="w-full">
              <Plus size={14} className="mr-1" /> Taak toevoegen
            </Button>
          </div>
        </div>

        {rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nog geen eigen automatische taken.</p>
        ) : (
          <div className="divide-y rounded-lg border">
            {rules.map(r => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-medium ${r.enabled ? 'text-foreground' : 'text-muted-foreground'}`}>{r.label}</p>
                  <p className="text-[11px] text-muted-foreground">{describe(r)}</p>
                </div>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" onClick={() => remove(r)}>
                  <Trash2 size={14} />
                </Button>
                <Switch checked={r.enabled} onCheckedChange={v => update(r.id, { enabled: v })} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
