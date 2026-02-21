import {
  InboxIcon,
  CalendarCheck,
  CheckSquare,
  Clock,
  Plus,
  Trash2,
  ArrowRight,
  Check,
  AlertTriangle,
  Flag,
} from 'lucide-react';
import KpiCard from '@/components/KpiCard';
import { useBookings } from '@/contexts/BookingsContext';
import { useInquiriesContext } from '@/contexts/InquiriesContext';
import { useTasksContext } from '@/contexts/TasksContext';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Task, TASK_STATUSES, TASK_PRIORITIES } from '@/types/task';

export default function Dashboard() {
  const { bookings, loading: bookingsLoading } = useBookings();
  const { inquiries, loading: inquiriesLoading } = useInquiriesContext();
  const { tasks, loading: tasksLoading, addTask, updateTask, deleteTask, deleteTasks } = useTasksContext();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newOpen, setNewOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    status: 'open' as Task['status'],
    priority: 'normal' as Task['priority'],
    dueDate: '',
  });
  const [filter, setFilter] = useState<'all' | 'open' | 'in_progress' | 'completed'>('all');
  const navigate = useNavigate();
  const { toast } = useToast();

  const today = new Date().toISOString().split('T')[0];
  const todayBookings = useMemo(() => bookings.filter((b) => b.date === today), [bookings, today]);
  const openInquiries = useMemo(() => inquiries.filter((i) => i.status === 'new' || i.status === 'contacted'), [inquiries]);

  const filteredTasks = useMemo(() => {
    if (filter === 'all') return tasks;
    return tasks.filter((t) => t.status === filter);
  }, [tasks, filter]);

  const openTaskCount = useMemo(() => tasks.filter((t) => t.status !== 'completed').length, [tasks]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === filteredTasks.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredTasks.map((t) => t.id)));
    }
  };

  const resetForm = () => {
    setForm({ title: '', description: '', status: 'open', priority: 'normal', dueDate: '' });
  };

  const openNew = () => {
    resetForm();
    setEditTask(null);
    setNewOpen(true);
  };

  const openEdit = (task: Task) => {
    setForm({
      title: task.title,
      description: task.description || '',
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate || '',
    });
    setEditTask(task);
    setNewOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast({ title: 'Geef de taak een titel', variant: 'destructive' });
      return;
    }
    if (editTask) {
      await updateTask({
        ...editTask,
        title: form.title,
        description: form.description || undefined,
        status: form.status,
        priority: form.priority,
        dueDate: form.dueDate || undefined,
      });
      toast({ title: 'Taak bijgewerkt' });
    } else {
      await addTask({
        title: form.title,
        description: form.description || undefined,
        status: form.status,
        priority: form.priority,
        dueDate: form.dueDate || undefined,
      });
      toast({ title: 'Taak aangemaakt' });
    }
    setNewOpen(false);
    resetForm();
    setEditTask(null);
  };

  const handleDelete = async (id: string) => {
    await deleteTask(id);
    setSelected((prev) => { const n = new Set(prev); n.delete(id); return n; });
    toast({ title: 'Taak verwijderd' });
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selected);
    await deleteTasks(ids);
    setSelected(new Set());
    toast({ title: `${ids.length} taken verwijderd` });
  };

  const handleBulkStatus = async (newStatus: Task['status']) => {
    const ids = Array.from(selected);
    for (const id of ids) {
      const task = tasks.find((t) => t.id === id);
      if (task) await updateTask({ ...task, status: newStatus });
    }
    setSelected(new Set());
    toast({ title: `${ids.length} taken bijgewerkt` });
  };

  const priorityIcon = (p: Task['priority']) => {
    const cls = TASK_PRIORITIES.find((x) => x.value === p)?.color || '';
    if (p === 'urgent') return <AlertTriangle size={14} className={cls} />;
    if (p === 'high') return <Flag size={14} className={cls} />;
    return null;
  };

  const loading = bookingsLoading || inquiriesLoading || tasksLoading;

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-muted-foreground">Laden...</div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          title="Openstaande Taken"
          value={String(openTaskCount)}
          icon={<CheckSquare size={20} />}
          subtitle={`${tasks.filter((t) => t.status === 'open').length} open · ${tasks.filter((t) => t.status === 'in_progress').length} in behandeling`}
        />
        <KpiCard
          title="Aanvragen"
          value={String(openInquiries.length)}
          icon={<InboxIcon size={20} />}
          subtitle="Nieuw & gecontacteerd"
        />
        <KpiCard
          title="Boekingen Vandaag"
          value={String(todayBookings.length)}
          icon={<CalendarCheck size={20} />}
          subtitle={`${todayBookings.filter((b) => b.status === 'confirmed').length} bevestigd · ${todayBookings.filter((b) => b.status === 'option').length} in optie`}
        />
      </div>

      {/* Taken */}
      <div className="rounded-xl bg-card card-shadow animate-fade-in">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="text-sm font-semibold text-card-foreground flex items-center gap-2">
            <CheckSquare size={16} /> Taken
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{tasks.length}</span>
          </h2>
          <div className="flex items-center gap-2">
            {selected.size > 0 && (
              <>
                <span className="text-xs text-muted-foreground">{selected.size} geselecteerd</span>
                <Select onValueChange={(v) => handleBulkStatus(v as Task['status'])}>
                  <SelectTrigger className="h-8 w-36 text-xs">
                    <SelectValue placeholder="Status wijzigen" />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="destructive" size="sm" className="h-8" onClick={handleBulkDelete}>
                  <Trash2 size={14} className="mr-1" /> Verwijderen
                </Button>
              </>
            )}
            <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle</SelectItem>
                {TASK_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" className="h-8" onClick={openNew}>
              <Plus size={14} className="mr-1" /> Nieuwe Taak
            </Button>
          </div>
        </div>

        {filteredTasks.length === 0 ? (
          <div className="p-8 text-center">
            <Check size={32} className="mx-auto text-success mb-2" />
            <p className="text-sm text-muted-foreground">
              {filter === 'all' ? 'Nog geen taken — maak je eerste taak aan' : 'Geen taken met deze status'}
            </p>
          </div>
        ) : (
          <div className="divide-y">
            <div className="flex items-center gap-3 px-5 py-2 bg-muted/30">
              <Checkbox
                checked={selected.size > 0 && selected.size === filteredTasks.length}
                onCheckedChange={selectAll}
              />
              <span className="text-xs text-muted-foreground">Alles selecteren</span>
            </div>

            {filteredTasks.map((task) => {
              const statusInfo = TASK_STATUSES.find((s) => s.value === task.status);
              return (
                <div key={task.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/20 transition-colors group">
                  <Checkbox
                    checked={selected.has(task.id)}
                    onCheckedChange={() => toggleSelect(task.id)}
                  />
                  {priorityIcon(task.priority)}
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openEdit(task)}>
                    <p className={`text-sm font-medium truncate ${task.status === 'completed' ? 'line-through text-muted-foreground' : 'text-card-foreground'}`}>
                      {task.title}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {task.description && <span className="truncate max-w-[200px]">{task.description}</span>}
                      {task.dueDate && (
                        <span className={task.dueDate < today ? 'text-destructive font-medium' : ''}>
                          📅 {task.dueDate}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusInfo?.color || ''}`}>
                    {statusInfo?.label}
                  </span>
                  <Select
                    value={task.status}
                    onValueChange={(v) => updateTask({ ...task, status: v as Task['status'] })}
                  >
                    <SelectTrigger className="h-7 w-32 text-xs shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TASK_STATUSES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(task.id)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Agenda Vandaag */}
      <div className="rounded-xl bg-card p-5 card-shadow animate-fade-in">
        <h2 className="mb-4 text-sm font-semibold text-card-foreground">Agenda Vandaag</h2>
        <div className="space-y-3">
          {todayBookings.length === 0 && (
            <p className="text-sm text-muted-foreground">Geen boekingen vandaag</p>
          )}
          {todayBookings.map((booking) => (
            <div
              key={booking.id}
              className={`rounded-lg p-3 text-sm ${booking.status === 'confirmed' ? 'booking-confirmed' : 'booking-option'}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{booking.title}</span>
                <span className="text-xs opacity-75">{booking.roomName}</span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs opacity-75">
                <Clock size={12} />
                <span>{booking.startHour}:00 – {booking.endHour}:00</span>
                <span>·</span>
                <span>{booking.contactName}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* New / Edit Task Dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editTask ? 'Taak Bewerken' : 'Nieuwe Taak'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label>Titel *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Bv. Offerte sturen aan klant"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Beschrijving</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Extra details..."
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Task['status'] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TASK_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Prioriteit</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as Task['priority'] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TASK_PRIORITIES.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Deadline</Label>
              <Input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>Annuleren</Button>
            <Button onClick={handleSave}>{editTask ? 'Opslaan' : 'Aanmaken'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
