import { useState } from 'react';
import { Inquiry } from '@/types/crm';
import { Task, TASK_PRIORITIES } from '@/types/task';
import { useTasksContext } from '@/contexts/TasksContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Plus, CheckSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface Props {
  inquiry: Inquiry;
  tasks: Task[];
  contactId?: string;
  companyId?: string;
}

export default function InquiryTasksTab({ inquiry, tasks, contactId, companyId }: Props) {
  const { addTask, updateTask } = useTasksContext();
  const { toast } = useToast();
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<Task['priority']>('normal');
  const [adding, setAdding] = useState(false);

  const openTasks = tasks.filter(t => t.status !== 'completed');
  const completedTasks = tasks.filter(t => t.status === 'completed');

  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    setAdding(true);
    await addTask({
      title: newTitle.trim(),
      status: 'open',
      priority: newPriority,
      inquiryId: inquiry.id,
      contactId: contactId || inquiry.contactId || undefined,
      companyId: companyId || undefined,
    });
    setNewTitle('');
    setNewPriority('normal');
    setAdding(false);
    toast({ title: 'Taak aangemaakt' });
  };

  const toggleComplete = async (task: Task) => {
    const newStatus = task.status === 'completed' ? 'open' : 'completed';
    await updateTask({ ...task, status: newStatus });
  };

  return (
    <div className="space-y-6">
      {/* Add task form */}
      <div className="rounded-xl bg-card p-5 card-shadow space-y-3">
        <h3 className="text-base font-bold text-foreground">Nieuwe taak toevoegen</h3>
        <div className="flex gap-2">
          <Input
            placeholder="Taakomschrijving..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            className="flex-1"
          />
          <Select value={newPriority} onValueChange={(v: Task['priority']) => setNewPriority(v)}>
            <SelectTrigger className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TASK_PRIORITIES.map(p => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleAdd} disabled={adding || !newTitle.trim()} size="sm">
            <Plus size={14} className="mr-1" /> Toevoegen
          </Button>
        </div>
      </div>

      {/* Open tasks */}
      <div className="rounded-xl bg-card p-5 card-shadow space-y-3">
        <h3 className="text-base font-bold text-foreground">Openstaande taken ({openTasks.length})</h3>
        {openTasks.length === 0 ? (
          <p className="text-xs text-muted-foreground">Geen openstaande taken voor deze aanvraag.</p>
        ) : (
          <div className="space-y-1">
            {openTasks.map(t => {
              const prio = TASK_PRIORITIES.find(p => p.value === t.priority);
              return (
                <div key={t.id} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors">
                  <Checkbox
                    checked={false}
                    onCheckedChange={() => toggleComplete(t)}
                  />
                  <span className="flex-1 text-sm text-foreground">{t.title}</span>
                  {t.priority !== 'normal' && (
                    <Badge variant="secondary" className={cn('text-[10px]', prio?.color)}>{prio?.label}</Badge>
                  )}
                  {t.dueDate && <span className="text-xs text-muted-foreground">{t.dueDate}</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Completed tasks */}
      {completedTasks.length > 0 && (
        <div className="rounded-xl bg-card p-5 card-shadow space-y-3">
          <h3 className="text-base font-bold text-foreground text-muted-foreground">Afgeronde taken ({completedTasks.length})</h3>
          <div className="space-y-1">
            {completedTasks.map(t => (
              <div key={t.id} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors">
                <Checkbox
                  checked={true}
                  onCheckedChange={() => toggleComplete(t)}
                />
                <span className="flex-1 text-sm text-muted-foreground line-through">{t.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
