import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Pencil, Check, X, Search, ListChecks } from 'lucide-react';

interface Rule {
  id: string;
  match_key: string;
  label: string;
  enabled: boolean;
}

export default function TaskAutomationPanel() {
  const { toast } = useToast();
  const [rules, setRules] = useState<Rule[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [suppressed, setSuppressed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');

  const normalize = (title: string) =>
    (title || '')
      .replace(/\s+[-–—]\s+[^-–—]{2,}$/u, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();

  const load = async () => {
    setLoading(true);
    const [{ data: ruleRows }, { count: supCount }] = await Promise.all([
      supabase.from('task_automation_rules').select('id, match_key, label, enabled').order('label'),
      supabase.from('ghl_task_suppressions').select('ghl_task_id', { count: 'exact', head: true }),
    ]);
    setRules((ruleRows as Rule[]) || []);
    setSuppressed(supCount || 0);

    // Count currently open tasks per task type
    const tally: Record<string, number> = {};
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data } = await supabase
        .from('tasks')
        .select('title')
        .neq('status', 'completed')
        .range(from, from + PAGE - 1);
      if (!data?.length) break;
      for (const t of data) {
        const key = normalize(t.title || '');
        tally[key] = (tally[key] || 0) + 1;
      }
      if (data.length < PAGE) break;
    }
    setCounts(tally);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggle = async (rule: Rule, enabled: boolean) => {
    setRules(prev => prev.map(r => (r.id === rule.id ? { ...r, enabled } : r)));
    const { error } = await supabase.from('task_automation_rules').update({ enabled }).eq('id', rule.id);
    if (error) {
      setRules(prev => prev.map(r => (r.id === rule.id ? { ...r, enabled: !enabled } : r)));
      toast({ title: 'Opslaan mislukt', description: error.message, variant: 'destructive' });
      return;
    }
    toast({
      title: enabled ? `"${rule.label}" staat aan` : `"${rule.label}" staat uit`,
      description: enabled
        ? 'Nieuwe taken van deze soort worden weer aangemaakt.'
        : 'Er worden geen nieuwe taken van deze soort meer aangemaakt. Bestaande taken blijven staan.',
    });
  };

  const saveLabel = async (rule: Rule) => {
    const label = editLabel.trim();
    if (!label) return;
    setRules(prev => prev.map(r => (r.id === rule.id ? { ...r, label } : r)));
    setEditingId(null);
    const { error } = await supabase.from('task_automation_rules').update({ label }).eq('id', rule.id);
    if (error) toast({ title: 'Opslaan mislukt', description: error.message, variant: 'destructive' });
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? rules.filter(r => r.label.toLowerCase().includes(q) || r.match_key.includes(q)) : rules;
    return [...list].sort((a, b) => (counts[b.match_key] || 0) - (counts[a.match_key] || 0) || a.label.localeCompare(b.label));
  }, [rules, counts, search]);

  const offCount = rules.filter(r => !r.enabled).length;

  return (
    <Card>
      <CardContent className="p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <ListChecks size={16} /> Automatische taken
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Deze taaksoorten worden automatisch aangemaakt bij nieuwe reserveringen en aanvragen. Zet een soort uit
              en er komen geen nieuwe taken van die soort meer bij — taken die al in de lijst staan blijven bewaard.
              Dubbele taken (zelfde persoon, soort en datum) worden automatisch samengevoegd.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 text-xs text-muted-foreground">
            <span>{rules.length} soorten · {offCount} uitgezet</span>
            <span>{suppressed} dubbele taken genegeerd</span>
          </div>
        </div>

        <div className="relative max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Zoek taaksoort..." className="pl-9" />
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">Geen taaksoorten gevonden.</p>
        ) : (
          <div className="divide-y rounded-lg border">
            {filtered.map(rule => (
              <div key={rule.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  {editingId === rule.id ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveLabel(rule); if (e.key === 'Escape') setEditingId(null); }}
                        className="h-8 max-w-xs"
                        autoFocus
                      />
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => saveLabel(rule)}>
                        <Check size={14} />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingId(null)}>
                        <X size={14} />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className={`truncate text-sm font-medium ${rule.enabled ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {rule.label}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground"
                        onClick={() => { setEditingId(rule.id); setEditLabel(rule.label); }}
                      >
                        <Pencil size={12} />
                      </Button>
                    </div>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    {counts[rule.match_key] || 0} openstaande taken
                  </p>
                </div>
                {!rule.enabled && <Badge variant="secondary" className="text-[10px]">Uit</Badge>}
                <Switch checked={rule.enabled} onCheckedChange={(v) => toggle(rule, v)} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
