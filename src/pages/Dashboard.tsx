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
  CheckCircle2,
  CalendarIcon,
  Search,
} from 'lucide-react';
import KpiCard from '@/components/KpiCard';
import KpiDetailDialog from '@/components/dashboard/KpiDetailDialog';
import { useBookings } from '@/contexts/BookingsContext';
import { useInquiriesContext } from '@/contexts/InquiriesContext';
import { useTasksContext } from '@/contexts/TasksContext';
import { useContactsContext } from '@/contexts/ContactsContext';
import { useCompaniesContext } from '@/contexts/CompaniesContext';
import { useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Task, TASK_STATUSES, TASK_PRIORITIES } from '@/types/task';
import { cn } from '@/lib/utils';

export default function Dashboard() {
  const { bookings, loading: bookingsLoading } = useBookings();
  const { inquiries, loading: inquiriesLoading } = useInquiriesContext();
  const { contacts } = useContactsContext();
  const { companies } = useCompaniesContext();
  const { tasks, loading: tasksLoading, addTask, updateTask, deleteTask, deleteTasks } = useTasksContext();
  const { user } = useAuth();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newOpen, setNewOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    status: 'open' as Task['status'],
    priority: 'normal' as Task['priority'],
    dueDate: '',
    companyId: '',
    contactId: '',
    report: '',
  });
  const [filter, setFilter] = useState<'all' | 'open' | 'in_progress' | 'completed'>('all');
  const [kpiDialog, setKpiDialog] = useState<{ open: boolean; type: 'tasks' | 'inquiries' | 'bookings' }>({ open: false, type: 'tasks' });

  // Searchable selectors
  const [companySearch, setCompanySearch] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [companyPopoverOpen, setCompanyPopoverOpen] = useState(false);
  const [contactPopoverOpen, setContactPopoverOpen] = useState(false);

  // Follow-up dialog
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [completedTaskTitle, setCompletedTaskTitle] = useState('');
  const [completedTaskContactId, setCompletedTaskContactId] = useState<string | undefined>();
  const [followTitle, setFollowTitle] = useState('');
  const [followPriority, setFollowPriority] = useState<Task['priority']>('normal');
  const [followDueDate, setFollowDueDate] = useState('');
  const [followReport, setFollowReport] = useState('');
  const [followAdding, setFollowAdding] = useState(false);
  const [followDefaults, setFollowDefaults] = useState<Record<string, string | undefined>>({});

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

  const filteredCompanies = useMemo(() => {
    if (!companySearch.trim()) return companies.slice(0, 50);
    const q = companySearch.toLowerCase();
    return companies.filter(c => c.name.toLowerCase().includes(q)).slice(0, 50);
  }, [companies, companySearch]);

  const filteredContacts = useMemo(() => {
    let pool = form.companyId ? contacts.filter(c => c.companyId === form.companyId) : contacts;
    if (contactSearch.trim()) {
      const q = contactSearch.toLowerCase();
      pool = pool.filter(c => `${c.firstName} ${c.lastName}`.toLowerCase().includes(q));
    }
    return pool.slice(0, 50);
  }, [contacts, form.companyId, contactSearch]);

  const selectedCompanyName = useMemo(() => {
    if (!form.companyId) return '';
    return companies.find(c => c.id === form.companyId)?.name || '';
  }, [form.companyId, companies]);

  const selectedContactName = useMemo(() => {
    if (!form.contactId) return '';
    const c = contacts.find(c => c.id === form.contactId);
    return c ? `${c.firstName} ${c.lastName}` : '';
  }, [form.contactId, contacts]);

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
    setForm({ title: '', description: '', status: 'open', priority: 'normal', dueDate: '', companyId: '', contactId: '', report: '' });
    setCompanySearch('');
    setContactSearch('');
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
      companyId: task.companyId || '',
      contactId: task.contactId || '',
      report: '',
    });
    setEditTask(task);
    setNewOpen(true);
  };

  const saveReport = async (report: string, contactId: string) => {
    if (!report.trim() || !user || !contactId) return;
    await (supabase as any).from('contact_activities').insert({
      user_id: user.id,
      contact_id: contactId,
      type: 'note',
      subject: 'Gesprekverslag',
      body: report.trim(),
    });
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
        companyId: form.companyId || undefined,
        contactId: form.contactId || undefined,
      });
      toast({ title: 'Taak bijgewerkt' });
    } else {
      await addTask({
        title: form.title,
        description: form.description || undefined,
        status: form.status,
        priority: form.priority,
        dueDate: form.dueDate || undefined,
        companyId: form.companyId || undefined,
        contactId: form.contactId || undefined,
      });
      if (form.report.trim() && form.contactId) {
        await saveReport(form.report, form.contactId);
      }
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

  const handleStatusChange = async (task: Task, newStatus: Task['status']) => {
    await updateTask({ ...task, status: newStatus });
    if (newStatus === 'completed') {
      setCompletedTaskTitle(task.title);
      setCompletedTaskContactId(task.contactId);
      setFollowTitle('');
      setFollowPriority('normal');
      setFollowDueDate('');
      setFollowReport('');
      setFollowDefaults({
        companyId: task.companyId,
        contactId: task.contactId,
        inquiryId: task.inquiryId,
        bookingId: task.bookingId,
      });
      setShowFollowUp(true);
    }
  };

  const handleFollowUp = async () => {
    setFollowAdding(true);
    if (followTitle.trim()) {
      await addTask({
        title: followTitle.trim(),
        status: 'open',
        priority: followPriority,
        dueDate: followDueDate || undefined,
        companyId: followDefaults.companyId || undefined,
        contactId: followDefaults.contactId || undefined,
        inquiryId: followDefaults.inquiryId || undefined,
        bookingId: followDefaults.bookingId || undefined,
      });
    }
    if (followReport.trim() && completedTaskContactId) {
      await saveReport(followReport, completedTaskContactId);
    }
    setFollowAdding(false);
    setShowFollowUp(false);
    if (followTitle.trim()) {
      toast({ title: 'Vervolgtaak aangemaakt' });
    } else if (followReport.trim()) {
      toast({ title: 'Gesprekverslag opgeslagen' });
    }
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
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="animate-fade-in">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          title="Openstaande Taken"
          value={String(openTaskCount)}
          icon={<CheckSquare size={20} />}
          subtitle={`${tasks.filter((t) => t.status === 'open').length} open · ${tasks.filter((t) => t.status === 'in_progress').length} in behandeling`}
          onClick={() => setKpiDialog({ open: true, type: 'tasks' })}
        />
        <KpiCard
          title="Aanvragen"
          value={String(openInquiries.length)}
          icon={<InboxIcon size={20} />}
          subtitle="Nieuw & gecontacteerd"
          onClick={() => setKpiDialog({ open: true, type: 'inquiries' })}
        />
        <KpiCard
          title="Reserveringen Vandaag"
          value={String(todayBookings.length)}
          icon={<CalendarCheck size={20} />}
          subtitle={`${todayBookings.filter((b) => b.status === 'confirmed').length} bevestigd · ${todayBookings.filter((b) => b.status === 'option').length} in optie`}
          onClick={() => setKpiDialog({ open: true, type: 'bookings' })}
        />
      </div>

      {/* Taken */}
      <div className="rounded-xl bg-card card-shadow animate-fade-in-up overflow-hidden">
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
                    onValueChange={(v) => handleStatusChange(task, v as Task['status'])}
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
      <div className="rounded-xl bg-card p-5 card-shadow animate-fade-in-up overflow-hidden">
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

      {/* KPI Detail Dialog */}
      <KpiDetailDialog
        open={kpiDialog.open}
        onOpenChange={(open) => setKpiDialog((prev) => ({ ...prev, open }))}
        type={kpiDialog.type}
        title={
          kpiDialog.type === 'tasks' ? 'Openstaande Taken' :
          kpiDialog.type === 'inquiries' ? 'Openstaande Aanvragen' :
          'Reserveringen Vandaag'
        }
        tasks={tasks.filter((t) => t.status !== 'completed')}
        inquiries={openInquiries}
        bookings={todayBookings}
        onEditTask={(task) => { setKpiDialog({ open: false, type: 'tasks' }); openEdit(task); }}
      />

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
            <div className="grid grid-cols-2 gap-3">
              {/* Searchable Company selector */}
              <div className="grid gap-1.5">
                <Label>Bedrijf</Label>
                <Popover open={companyPopoverOpen} onOpenChange={setCompanyPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start font-normal h-10 text-sm">
                      {form.companyId ? (
                        <span className="truncate">{selectedCompanyName}</span>
                      ) : (
                        <span className="text-muted-foreground">Selecteer...</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[220px] p-0" align="start">
                    <div className="p-2 border-b">
                      <div className="flex items-center gap-2 px-2">
                        <Search size={14} className="text-muted-foreground shrink-0" />
                        <input
                          className="w-full text-sm bg-transparent outline-none placeholder:text-muted-foreground"
                          placeholder="Zoek bedrijf..."
                          value={companySearch}
                          onChange={(e) => setCompanySearch(e.target.value)}
                          autoFocus
                        />
                      </div>
                    </div>
                    <div className="max-h-48 overflow-y-auto p-1">
                      <button
                        className="w-full text-left text-sm px-3 py-1.5 rounded hover:bg-muted/50 text-muted-foreground"
                        onClick={() => { setForm({ ...form, companyId: '', contactId: '' }); setCompanyPopoverOpen(false); setCompanySearch(''); }}
                      >
                        — Geen —
                      </button>
                      {filteredCompanies.map((c) => (
                        <button
                          key={c.id}
                          className={cn("w-full text-left text-sm px-3 py-1.5 rounded hover:bg-muted/50", form.companyId === c.id && "bg-primary/10 text-primary")}
                          onClick={() => { setForm({ ...form, companyId: c.id, contactId: '' }); setCompanyPopoverOpen(false); setCompanySearch(''); }}
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              {/* Searchable Contact selector */}
              <div className="grid gap-1.5">
                <Label>Contactpersoon</Label>
                <Popover open={contactPopoverOpen} onOpenChange={setContactPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start font-normal h-10 text-sm">
                      {form.contactId ? (
                        <span className="truncate">{selectedContactName}</span>
                      ) : (
                        <span className="text-muted-foreground">Selecteer...</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[220px] p-0" align="start">
                    <div className="p-2 border-b">
                      <div className="flex items-center gap-2 px-2">
                        <Search size={14} className="text-muted-foreground shrink-0" />
                        <input
                          className="w-full text-sm bg-transparent outline-none placeholder:text-muted-foreground"
                          placeholder="Zoek contact..."
                          value={contactSearch}
                          onChange={(e) => setContactSearch(e.target.value)}
                          autoFocus
                        />
                      </div>
                    </div>
                    <div className="max-h-48 overflow-y-auto p-1">
                      <button
                        className="w-full text-left text-sm px-3 py-1.5 rounded hover:bg-muted/50 text-muted-foreground"
                        onClick={() => { setForm({ ...form, contactId: '' }); setContactPopoverOpen(false); setContactSearch(''); }}
                      >
                        — Geen —
                      </button>
                      {filteredContacts.map((c) => (
                        <button
                          key={c.id}
                          className={cn("w-full text-left text-sm px-3 py-1.5 rounded hover:bg-muted/50", form.contactId === c.id && "bg-primary/10 text-primary")}
                          onClick={() => { setForm({ ...form, contactId: c.id }); setContactPopoverOpen(false); setContactSearch(''); }}
                        >
                          {c.firstName} {c.lastName}
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Datum</Label>
              <Input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              />
            </div>
            {/* Gesprekverslag - only for new tasks with a contact */}
            {!editTask && form.contactId && (
              <div className="grid gap-1.5">
                <Label>Gesprekverslag</Label>
                <Textarea
                  value={form.report}
                  onChange={(e) => setForm({ ...form, report: e.target.value })}
                  placeholder="Wordt opgeslagen bij de contactpersoon..."
                  rows={3}
                  className="text-xs"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>Annuleren</Button>
            <Button onClick={handleSave}>{editTask ? 'Opslaan' : 'Aanmaken'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                <Input
                  type="date"
                  value={followDueDate}
                  onChange={(e) => setFollowDueDate(e.target.value)}
                  className="h-8 w-auto text-xs"
                />
              </div>
            )}
            {completedTaskContactId && (
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
    </div>
  );
}
