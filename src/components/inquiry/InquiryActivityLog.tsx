import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { SectionCard } from '@/components/detail/DetailPageComponents';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { PIPELINE_COLUMNS } from '@/components/inquiry/InquiryDetailsTab';
import { format } from 'date-fns';

interface Entry { id: string; action: string; actor_name: string | null; details: any; created_at: string }

const statusLabel = (s?: string) => PIPELINE_COLUMNS.find((c) => c.key === s)?.label || s || '';

function describe(e: Entry): string {
  const d = e.details || {};
  switch (e.action) {
    case 'Status gewijzigd': return `Status gewijzigd van "${statusLabel(d.from)}" naar "${statusLabel(d.to)}"`;
    case 'Contactpersoon toegevoegd':
    case 'Contactpersoon verwijderd': return `${e.action}: ${d.contact || 'onbekend'}`;
    case 'Taak aangemaakt':
    case 'Taak afgerond': return `${e.action}: ${d.title || ''}`;
    case 'Reservering aangemaakt':
    case 'Reservering gewijzigd': return `${e.action}: ${[d.date, d.room].filter(Boolean).join(' · ')}`;
    case 'Notitie toegevoegd': return `Notitie: ${d.text || ''}`;
    default: return e.action;
  }
}

export default function InquiryActivityLog({ inquiryId }: { inquiryId: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<Entry[] | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await (supabase as any).from('inquiry_history').select('id, action, actor_name, details, created_at').eq('inquiry_id', inquiryId).order('created_at', { ascending: false }).limit(200);
    if (error) { toast({ title: 'Fout bij laden geschiedenis', description: error.message, variant: 'destructive' }); setItems([]); return; }
    setItems(data || []);
  }, [inquiryId, toast]);
  useEffect(() => { load(); }, [load]);

  const addNote = async () => {
    if (!note.trim() || !user) return;
    setSaving(true);
    const { data: prof } = await supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle();
    const { error } = await (supabase as any).from('inquiry_history').insert({
      inquiry_id: inquiryId, user_id: user.id, actor_id: user.id,
      actor_name: prof?.display_name || user.email, action: 'Notitie toegevoegd', details: { text: note.trim() },
    });
    setSaving(false);
    if (error) { toast({ title: 'Notitie opslaan mislukt', description: error.message, variant: 'destructive' }); return; }
    setNote(''); toast({ title: 'Notitie toegevoegd' }); load();
  };

  return (
    <SectionCard title="Notities & geschiedenis" count={items?.length}>
      <div className="space-y-2 mb-4">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Notitie bij deze aanvraag..." className="min-h-[60px] text-sm" />
        <div className="flex justify-end"><Button size="sm" onClick={addNote} disabled={saving || !note.trim()}>{saving ? 'Bezig…' : 'Notitie toevoegen'}</Button></div>
      </div>
      {items === null ? (
        <div className="space-y-2"><Skeleton className="h-8" /><Skeleton className="h-8" /></div>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nog geen geschiedenis</p>
      ) : (
        <ul className="space-y-1.5 max-h-96 overflow-y-auto">
          {items.map((e) => (
            <li key={e.id} className="grid grid-cols-[110px_110px_1fr] gap-2 text-xs py-1 border-b border-border/40 last:border-0">
              <span className="text-muted-foreground">{format(new Date(e.created_at), 'dd-MM-yyyy HH:mm')}</span>
              <span className="text-foreground font-medium truncate">{e.actor_name || 'Systeem'}</span>
              <span className="text-foreground whitespace-pre-wrap">{describe(e)}</span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
