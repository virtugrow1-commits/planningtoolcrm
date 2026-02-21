import { useState } from 'react';
import { ContactActivity, useContactActivities } from '@/hooks/useContactActivities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Phone, Mail, Users, StickyNote, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

const typeConfig: Record<string, { label: string; icon: typeof Phone; color: string }> = {
  call: { label: 'Telefoongesprek', icon: Phone, color: 'text-blue-500' },
  email: { label: 'E-mail', icon: Mail, color: 'text-amber-500' },
  meeting: { label: 'Vergadering', icon: Users, color: 'text-green-500' },
  note: { label: 'Notitie', icon: StickyNote, color: 'text-muted-foreground' },
};

interface Props {
  contactId: string;
}

export default function ActivityTimeline({ contactId }: Props) {
  const { activities, loading, addActivity, deleteActivity } = useContactActivities(contactId);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ type: 'note', subject: '', body: '' });

  const handleSubmit = async () => {
    if (!form.subject && !form.body) return;
    await addActivity(form);
    setForm({ type: 'note', subject: '', body: '' });
    setOpen(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-foreground">Gesprekken</h3>
        <button onClick={() => setOpen(true)} className="text-muted-foreground hover:text-foreground transition-colors">
          <Plus size={16} />
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Laden...</p>
      ) : activities.length === 0 ? (
        <p className="text-xs text-muted-foreground">Geen gesprekken vastgelegd</p>
      ) : (
        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
          {activities.map((a) => {
            const cfg = typeConfig[a.type] || typeConfig.note;
            const Icon = cfg.icon;
            return (
              <div key={a.id} className="group flex gap-3 text-sm">
                <div className={`mt-0.5 shrink-0 ${cfg.color}`}>
                  <Icon size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-medium text-foreground">{a.subject || cfg.label}</span>
                      <span className="text-[10px] text-muted-foreground ml-2">
                        {format(new Date(a.createdAt), 'd MMM yyyy HH:mm', { locale: nl })}
                      </span>
                    </div>
                    <button
                      onClick={() => deleteActivity(a.id)}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all shrink-0"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  {a.body && <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{a.body}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Activiteit toevoegen</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="call">Telefoongesprek</SelectItem>
                  <SelectItem value="email">E-mail</SelectItem>
                  <SelectItem value="meeting">Vergadering</SelectItem>
                  <SelectItem value="note">Notitie</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Onderwerp</Label>
              <Input placeholder="Korte omschrijving" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Details</Label>
              <Textarea placeholder="Notities over het gesprek..." className="min-h-[80px]" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuleren</Button>
            <Button onClick={handleSubmit}>Opslaan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
