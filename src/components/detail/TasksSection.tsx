import { useState } from 'react';
import { Task, TASK_PRIORITIES } from '@/types/task';
import { useTasksContext } from '@/contexts/TasksContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Plus, CalendarIcon, CheckSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';

interface TasksSectionProps {
  tasks: Task[];
  /** Fields to auto-set when creating a new task */
  defaults: {
    contactId?: string;
    companyId?: string;
    inquiryId?: string;
    bookingId?: string;
  };
}

export default function TasksSection({ tasks, defaults }: TasksSectionProps) {
  const { addTask, updateTask } = useTasksContext();
  const { toast } = useToast();
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<Task['priority']>('normal');
  const [newDueDate, setNewDueDate] = useState<Date | undefined>();
  const [adding, setAdding] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const openTasks = tasks.filter(t => t.status !== 'completed');
  const completedTasks = tasks.filter(t => t.status === 'completed');

  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    setAdding(true);
    const dueDate = newDueDate
      ? `${newDueDate.getFullYear()}-${String(newDueDate.getMonth() + 1).padStart(2, '0')}-${String(newDueDate.getDate()).padStart(2, '0')}`
      : undefined;
    await addTask({
      title: newTitle.trim(),
      status: 'open',
      priority: newPriority,
      dueDate,
      ...defaults,
    });
    setNewTitle('');
    setNewPriority('normal');
    setNewDueDate(undefined);
    setAdding(false);
    setShowForm(false);
    toast({ title: 'Taak aangemaakt' });
  };

  const toggleComplete = async (task: Task) => {
    const newStatus = task.status === 'completed' ? 'open' : 'completed';
    await updateTask({ ...task, status: newStatus });
  };

  const isOverdue = (dueDate?: string) => {
    if (!dueDate) return false;
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return dueDate < todayStr;
  };

  return (
    <div className="rounded-xl bg-card p-5 card-shadow space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-bold text-foreground">Taken</h3>
          {openTasks.length > 0 && (
            <Badge variant="secondary" className="text-[10px] h-4 px-1 bg-warning/15 text-warning">{openTasks.length}</Badge>
          )}
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center justify-center h-5 w-5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
            title="Nieuwe taak toevoegen"
          >
            <Plus size={12} />
          </button>
        </div>
      </div>

      {/* Add task form */}
      {showForm && (
        <div className="space-y-2 p-3 rounded-lg border border-border/50 bg-muted/20">
          <Input
            placeholder="Taakomschrijving..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            autoFocus
          />
          <div className="flex flex-wrap gap-2 items-center">
            <Select value={newPriority} onValueChange={(v: Task['priority']) => setNewPriority(v)}>
              <SelectTrigger className="w-[120px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TASK_PRIORITIES.map(p => (
                  <SelectItem key={p.value} value={p.value} className="text-xs">{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn('h-8 text-xs gap-1.5', !newDueDate && 'text-muted-foreground')}>
                  <CalendarIcon size={12} />
                  {newDueDate ? format(newDueDate, 'd MMM yyyy', { locale: nl }) : 'Deadline'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={newDueDate}
                  onSelect={setNewDueDate}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            <div className="flex gap-1.5 ml-auto">
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setShowForm(false); setNewTitle(''); setNewDueDate(undefined); }}>
                Annuleren
              </Button>
              <Button size="sm" className="h-8 text-xs" onClick={handleAdd} disabled={adding || !newTitle.trim()}>
                <Plus size={12} className="mr-1" /> Toevoegen
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Open tasks */}
      {openTasks.length === 0 && completedTasks.length === 0 && !showForm && (
        <p className="text-xs text-muted-foreground">Geen taken</p>
      )}
      {openTasks.length > 0 && (
        <div className="space-y-0.5">
          {openTasks.map(t => {
            const prio = TASK_PRIORITIES.find(p => p.value === t.priority);
            const overdue = isOverdue(t.dueDate);
            return (
              <div key={t.id} className="flex items-center gap-2.5 py-1.5 px-2 rounded-lg hover:bg-muted/50 transition-colors">
                <Checkbox
                  checked={false}
                  onCheckedChange={() => toggleComplete(t)}
                  className="shrink-0"
                />
                <span className="flex-1 text-sm text-foreground min-w-0 truncate">{t.title}</span>
                {t.priority !== 'normal' && (
                  <Badge variant="secondary" className={cn('text-[10px] shrink-0', prio?.color)}>{prio?.label}</Badge>
                )}
                {t.dueDate && (
                  <span className={cn('text-[11px] shrink-0', overdue ? 'text-destructive font-medium' : 'text-muted-foreground')}>
                    {t.dueDate}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Completed tasks */}
      {completedTasks.length > 0 && (
        <div className="space-y-0.5 pt-1 border-t border-border/30">
          <p className="text-[11px] text-muted-foreground font-medium px-2 pt-1">Afgerond ({completedTasks.length})</p>
          {completedTasks.slice(0, 5).map(t => (
            <div key={t.id} className="flex items-center gap-2.5 py-1.5 px-2 rounded-lg hover:bg-muted/50 transition-colors">
              <Checkbox
                checked={true}
                onCheckedChange={() => toggleComplete(t)}
                className="shrink-0"
              />
              <span className="flex-1 text-sm text-muted-foreground line-through min-w-0 truncate">{t.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
