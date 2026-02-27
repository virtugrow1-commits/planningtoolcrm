import { useState } from 'react';
import { Task, TASK_PRIORITIES } from '@/types/task';
import { useTasksContext } from '@/contexts/TasksContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Plus, CalendarIcon, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

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
  const { user } = useAuth();
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<Task['priority']>('normal');
  const [newDueDate, setNewDueDate] = useState<Date | undefined>();
  const [newReport, setNewReport] = useState('');
  const [adding, setAdding] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Follow-up dialog state
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [completedTaskTitle, setCompletedTaskTitle] = useState('');
  const [followTitle, setFollowTitle] = useState('');
  const [followPriority, setFollowPriority] = useState<Task['priority']>('normal');
  const [followDueDate, setFollowDueDate] = useState<Date | undefined>();
  const [followReport, setFollowReport] = useState('');
  const [followAdding, setFollowAdding] = useState(false);

  const openTasks = tasks.filter(t => t.status !== 'completed');
  const completedTasks = tasks.filter(t => t.status === 'completed');

  const saveReport = async (report: string) => {
    if (!report.trim() || !user || !defaults.contactId) return;
    await (supabase as any).from('contact_activities').insert({
      user_id: user.id,
      contact_id: defaults.contactId,
      type: 'note',
      subject: 'Gesprekverslag',
      body: report.trim(),
    });
  };

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
    if (newReport.trim()) {
      await saveReport(newReport);
    }
    setNewTitle('');
    setNewPriority('normal');
    setNewDueDate(undefined);
    setNewReport('');
    setAdding(false);
    setShowForm(false);
    toast({ title: 'Taak aangemaakt' });
  };

  const toggleComplete = async (task: Task) => {
    const newStatus = task.status === 'completed' ? 'open' : 'completed';
    await updateTask({ ...task, status: newStatus });
    // Show follow-up dialog when completing a task
    if (newStatus === 'completed') {
      setCompletedTaskTitle(task.title);
      setFollowTitle('');
      setFollowPriority('normal');
      setFollowDueDate(undefined);
      setFollowReport('');
      setShowFollowUp(true);
    }
  };

  const handleFollowUp = async () => {
    setFollowAdding(true);
    const dueDate = followDueDate
      ? `${followDueDate.getFullYear()}-${String(followDueDate.getMonth() + 1).padStart(2, '0')}-${String(followDueDate.getDate()).padStart(2, '0')}`
      : undefined;
    if (followTitle.trim()) {
      await addTask({
        title: followTitle.trim(),
        status: 'open',
        priority: followPriority,
        dueDate,
        ...defaults,
      });
    }
    if (followReport.trim()) {
      await saveReport(followReport);
    }
    setFollowAdding(false);
    setShowFollowUp(false);
    if (followTitle.trim()) {
      toast({ title: 'Vervolgtaak aangemaakt' });
    } else if (followReport.trim()) {
      toast({ title: 'Gesprekverslag opgeslagen' });
    }
  };

  const isOverdue = (dueDate?: string) => {
    if (!dueDate) return false;
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return dueDate < todayStr;
  };

  return (
    <>
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
                    {newDueDate ? format(newDueDate, 'd MMM yyyy', { locale: nl }) : 'Datum'}
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
            </div>
            {defaults.contactId && (
              <Textarea
                placeholder="Gesprekverslag (optioneel, wordt opgeslagen bij contactpersoon)..."
                value={newReport}
                onChange={(e) => setNewReport(e.target.value)}
                rows={2}
                className="text-xs"
              />
            )}
            <div className="flex gap-1.5 justify-end">
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setShowForm(false); setNewTitle(''); setNewDueDate(undefined); setNewReport(''); }}>
                Annuleren
              </Button>
              <Button size="sm" className="h-8 text-xs" onClick={handleAdd} disabled={adding || !newTitle.trim()}>
                <Plus size={12} className="mr-1" /> Toevoegen
              </Button>
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

      {/* Follow-up dialog after completing a task */}
      <Dialog open={showFollowUp} onOpenChange={setShowFollowUp}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 size={18} className="text-success" />
              Taak afgerond
            </DialogTitle>
            <DialogDescription>
              "{completedTaskTitle}" is afgerond. Wil je een vervolgtaak aanmaken of een gesprekverslag toevoegen?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input
              placeholder="Vervolgtaak (optioneel)..."
              value={followTitle}
              onChange={(e) => setFollowTitle(e.target.value)}
              autoFocus
            />
            {followTitle.trim() && (
              <div className="flex flex-wrap gap-2 items-center">
                <Select value={followPriority} onValueChange={(v: Task['priority']) => setFollowPriority(v)}>
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
                    <Button variant="outline" size="sm" className={cn('h-8 text-xs gap-1.5', !followDueDate && 'text-muted-foreground')}>
                      <CalendarIcon size={12} />
                      {followDueDate ? format(followDueDate, 'd MMM yyyy', { locale: nl }) : 'Datum'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={followDueDate}
                      onSelect={setFollowDueDate}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            )}
            {defaults.contactId && (
              <Textarea
                placeholder="Gesprekverslag (optioneel, wordt opgeslagen bij contactpersoon)..."
                value={followReport}
                onChange={(e) => setFollowReport(e.target.value)}
                rows={3}
                className="text-xs"
              />
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" size="sm" onClick={() => setShowFollowUp(false)}>
              Sluiten
            </Button>
            <Button
              size="sm"
              onClick={handleFollowUp}
              disabled={followAdding || (!followTitle.trim() && !followReport.trim())}
            >
              Opslaan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
