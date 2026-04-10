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
} from 'lucide-react';
import KpiCard from '@/components/KpiCard';
import KpiDetailDialog from '@/components/dashboard/KpiDetailDialog';
import { useBookings } from '@/contexts/BookingsContext';
import { useInquiriesContext } from '@/contexts/InquiriesContext';
import { useTasksContext } from '@/contexts/TasksContext';
import { useContactsContext } from '@/contexts/ContactsContext';
import { useCompaniesContext } from '@/contexts/CompaniesContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useLanguage } from '@/contexts/LanguageContext';
import { useMemo, useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import CrmCombobox, { ComboboxOption } from '@/components/CrmCombobox';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Task, TASK_STATUSES, TASK_PRIORITIES } from '@/types/task';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
export default function Dashboard() {
  const { bookings, loading: bookingsLoading } = useBookings();
  const { inquiries, loading: inquiriesLoading } = useInquiriesContext();
  const { contacts } = useContactsContext();
  const { companies } = useCompaniesContext();
  const { tasks, loading: tasksLoading, addTask, updateTask, deleteTask, deleteTasks } = useTasksContext();
  const { user } = useAuth();
  const { members } = useTeamMembers();
  
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
    assignedTo: '',
  });
  const [filter, setFilter] = useState<'all' | 'open' | 'completed'>('all');
  const [visibleCount, setVisibleCount] = useState(10);
  const [kpiDialog, setKpiDialog] = useState<{ open: boolean; type: 'tasks' | 'inquiries' | 'bookings' }>({ open: false, type: 'tasks' });

  // User filter — default to current user's display name
  const currentUserName = useMemo(() => {
    if (!user) return '';
    const profile = members.find(m => m.id === user.id);
    return profile?.displayName || '';
  }, [user, members]);

  const [userFilter, setUserFilter] = useState<string>('__all__');

  // Resolve the actual filter value (lazy init for current user)
  const resolvedUserFilter = useMemo(() => {
    if (userFilter === '__current__') return currentUserName;
    return userFilter;
  }, [userFilter, currentUserName]);

  // Bulk date change
  const [bulkDate, setBulkDate] = useState<Date | undefined>();
  const [bulkDateOpen, setBulkDateOpen] = useState(false);

  // Combobox options
  const companyOptions = useMemo<ComboboxOption[]>(() =>
    companies.map(c => ({
      id: c.id,
      label: c.name,
      secondary: [c.email, c.city].filter(Boolean).join(' · ') || undefined,
      searchText: `${c.name} ${c.email || ''} ${c.phone || ''} ${c.city || ''}`,
    })),
    [companies]
  );

  const contactOptions = useMemo<ComboboxOption[]>(() => {
    const pool = form.companyId ? contacts.filter(c => c.companyId === form.companyId) : contacts;
    return pool.map(c => ({
      id: c.id,
      label: [c.firstName, c.lastName].filter(n => n && n !== '—').join(' ') || c.email || 'Onbekend',
      secondary: c.company || c.email || undefined,
      searchText: `${c.firstName} ${c.lastName} ${c.email || ''} ${c.company || ''} ${c.phone || ''}`,
    }));
  }, [contacts, form.companyId]);

  // Follow-up dialog
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [completedTaskTitle, setCompletedTaskTitle] = useState('');
  const [followTitle, setFollowTitle] = useState('');
  const [followPriority, setFollowPriority] = useState<Task['priority']>('normal');
  const [followDueDate, setFollowDueDate] = useState('');
  const [followAdding, setFollowAdding] = useState(false);
  const [followDefaults, setFollowDefaults] = useState<Record<string, string | undefined>>({});

  const navigate = useNavigate();
  const { toast } = useToast();

  const today = new Date().toISOString().split('T')[0];
  const todayBookings = useMemo(() => bookings.filter((b) => b.date === today), [bookings, today]);
  const openInquiries = useMemo(() => inquiries.filter((i) => i.status === 'new' || i.status === 'contacted'), [inquiries]);

  const contactMap = useMemo(() => {
    const m = new Map<string, { name: string; id: string }>();
    contacts.forEach(c => m.set(c.id, {
      name: [c.firstName, c.lastName].filter(n => n && n !== '—').join(' '),
      id: c.id,
    }));
    return m;
  }, [contacts]);

  // Also build a simple name map for backward compat
  const contactNameMap = useMemo(() => {
    const m = new Map<string, string>();
    contacts.forEach(c => m.set(c.id, [c.firstName, c.lastName].filter(n => n && n !== '—').join(' ')));
    return m;
  }, [contacts]);

  const companyMap = useMemo(() => {
    const m = new Map<string, { name: string; id: string }>();
    companies.forEach(c => m.set(c.id, { name: c.name, id: c.id }));
    return m;
  }, [companies]);

  // Contact -> company lookup (for tasks that have contactId but no companyId)
  const contactCompanyMap = useMemo(() => {
    const m = new Map<string, string>();
    contacts.forEach(c => {
      if (c.companyId) m.set(c.id, c.companyId);
    });
    return m;
  }, [contacts]);

  const filteredTasks = useMemo(() => {
    let result = tasks;
    // Only show tasks linked to a contact
    result = result.filter(t => !!t.contactId);
    // Hide completed tasks unless explicitly filtered
    if (filter !== 'completed') {
      result = result.filter(t => t.status !== 'completed');
    }
    // User filter
    if (resolvedUserFilter && resolvedUserFilter !== '__all__') {
      result = result.filter(t => t.assignedTo === resolvedUserFilter);
    }
    // Status filter (only relevant when filter is a specific non-all status)
    if (filter !== 'all' && filter !== 'completed') {
      result = result.filter((t) => t.status === filter);
    }
    // Sort by due date ascending (oldest first), tasks without date at the end
    result = [...result].sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    });
    return result;
  }, [tasks, filter, resolvedUserFilter]);

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
    setForm({ title: '', description: '', status: 'open', priority: 'normal', dueDate: '', companyId: '', contactId: '', assignedTo: '' });
  };

  const openNew = () => {
    resetForm();
    setEditTask(null);
    setNewOpen(true);
  };

  const openEdit = (task: Task) => {
    navigate(`/tasks/${task.id}`);
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
        assignedTo: form.assignedTo || undefined,
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

  const handleBulkDateChange = async () => {
    if (!bulkDate) return;
    const dateStr = `${bulkDate.getFullYear()}-${String(bulkDate.getMonth() + 1).padStart(2, '0')}-${String(bulkDate.getDate()).padStart(2, '0')}`;
    const ids = Array.from(selected);
    for (const id of ids) {
      const task = tasks.find(t => t.id === id);
      if (task) await updateTask({ ...task, dueDate: dateStr });
    }
    const count = ids.length;
    setSelected(new Set());
    setBulkDate(undefined);
    setBulkDateOpen(false);
    toast({ title: `${count} taken verplaatst naar ${format(bulkDate, 'd MMM yyyy', { locale: nl })}` });
  };

  const handleStatusChange = async (task: Task, newStatus: Task['status']) => {
    await updateTask({ ...task, status: newStatus });
    if (newStatus === 'completed') {
      setCompletedTaskTitle(task.title);
      setFollowTitle('');
      setFollowPriority('normal');
      setFollowDueDate('');
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
    if (!followTitle.trim()) return;
    setFollowAdding(true);
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
    setFollowAdding(false);
    setShowFollowUp(false);
    toast({ title: 'Vervolgtaak aangemaakt' });
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
          subtitle={`${tasks.filter((t) => t.status === 'open').length} open · ${tasks.filter((t) => t.status === 'completed').length} afgerond`}
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
        <div className="flex items-center justify-between border-b px-5 py-3 flex-wrap gap-2">
          <h2 className="text-sm font-semibold text-card-foreground flex items-center gap-2">
            <CheckSquare size={16} /> Taken
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{filteredTasks.length}</span>
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            {/* User filter */}
            <Select
              value={userFilter === '__current__' ? '__current__' : (resolvedUserFilter === '__all__' ? '__all__' : resolvedUserFilter)}
              onValueChange={(v) => setUserFilter(v)}
            >
              <SelectTrigger className="h-8 w-40 text-xs">
                <SelectValue placeholder="Gebruiker" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Alle gebruikers</SelectItem>
                <SelectItem value="Sjors Jochems">Sjors Jochems</SelectItem>
                <SelectItem value="Iris Machielse">Iris Machielse</SelectItem>
              </SelectContent>
            </Select>

            {/* Status filter */}
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

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div className="flex items-center gap-3 px-5 py-2.5 bg-primary/5 border-b flex-wrap">
            <span className="text-xs font-medium text-foreground">{selected.size} geselecteerd</span>
            <div className="flex items-center gap-2 ml-auto flex-wrap">
              {/* Bulk status change */}
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

              {/* Bulk date change */}
              <Popover open={bulkDateOpen} onOpenChange={setBulkDateOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn('h-8 text-xs gap-1.5', !bulkDate && 'text-muted-foreground')}>
                    <CalendarIcon size={12} />
                    {bulkDate ? format(bulkDate, 'd MMM yyyy', { locale: nl }) : 'Verplaats naar datum'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={bulkDate}
                    onSelect={setBulkDate}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                  {bulkDate && (
                    <div className="px-3 pb-3">
                      <Button size="sm" className="w-full text-xs" onClick={handleBulkDateChange}>
                        Toepassen op {selected.size} {selected.size === 1 ? 'taak' : 'taken'}
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>

              <Button variant="destructive" size="sm" className="h-8" onClick={handleBulkDelete}>
                <Trash2 size={14} className="mr-1" /> Verwijderen
              </Button>
            </div>
          </div>
        )}

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

            {filteredTasks.slice(0, visibleCount).map((task) => {
              const statusInfo = TASK_STATUSES.find((s) => s.value === task.status);
              const contact = task.contactId ? contactMap.get(task.contactId) : null;
              const effectiveCompanyId = task.companyId || (task.contactId ? contactCompanyMap.get(task.contactId) : undefined);
              const company = effectiveCompanyId ? companyMap.get(effectiveCompanyId) : null;

              return (
                <div key={task.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/20 transition-colors group">
                  <Checkbox
                    checked={selected.has(task.id)}
                    onCheckedChange={() => toggleSelect(task.id)}
                  />
                  {priorityIcon(task.priority)}
                  <div className="flex-1 min-w-0">
                    <div className="cursor-pointer" onClick={() => openEdit(task)}>
                      <p className={`text-sm font-medium truncate ${task.status === 'completed' ? 'line-through text-muted-foreground' : 'text-card-foreground'}`}>
                        {task.title}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                      {contact && (
                        <Link
                          to={`/crm/${contact.id}`}
                          className="truncate max-w-[160px] hover:text-primary hover:underline transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          👤 {contact.name}
                        </Link>
                      )}
                      {company && (
                        <Link
                          to={`/companies/${company.id}`}
                          className="truncate max-w-[160px] hover:text-primary hover:underline transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          🏢 {company.name}
                        </Link>
                      )}
                      {task.dueDate && (
                        <span className={task.dueDate < today ? 'text-destructive font-medium' : ''}>
                          📅 {task.dueDate}
                        </span>
                      )}
                      {task.assignedTo && (
                        <span className="truncate max-w-[120px]">
                          👤 {task.assignedTo}
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
            {filteredTasks.length > visibleCount && (
              <div className="px-5 py-3 text-center">
                <Button variant="outline" size="sm" className="text-xs" onClick={() => setVisibleCount(prev => prev + 10)}>
                  Laat meer taken zien ({filteredTasks.length - visibleCount} resterend)
                </Button>
              </div>
            )}
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
                <span>{String(booking.startHour).padStart(2,'0')}:{String(booking.startMinute || 0).padStart(2,'0')} – {String(booking.endHour).padStart(2,'0')}:{String(booking.endMinute || 0).padStart(2,'0')}</span>
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
            <DialogDescription className="sr-only">Vul de taakgegevens in</DialogDescription>
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
              <div className="grid gap-1.5">
                <Label>Bedrijf</Label>
                <CrmCombobox
                  options={companyOptions}
                  value={form.companyId}
                  onSelect={(id) => setForm({ ...form, companyId: id, contactId: '' })}
                  placeholder="Selecteer..."
                  searchPlaceholder="Zoek bedrijf..."
                  allowClear
                  clearLabel="— Geen —"
                  popoverWidth="w-[280px]"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Contactpersoon</Label>
                <CrmCombobox
                  options={contactOptions}
                  value={form.contactId}
                  onSelect={(id) => setForm({ ...form, contactId: id })}
                  placeholder="Selecteer..."
                  searchPlaceholder="Zoek contact..."
                  allowClear
                  clearLabel="— Geen —"
                  popoverWidth="w-[280px]"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Datum</Label>
                <Input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Verantwoordelijke</Label>
                <Select value={form.assignedTo || '__none__'} onValueChange={(v) => setForm({ ...form, assignedTo: v === '__none__' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="Niemand" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Niemand</SelectItem>
                    <SelectItem value="Sjors Jochems">Sjors Jochems</SelectItem>
                    <SelectItem value="Iris Machielse">Iris Machielse</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
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
              "{completedTaskTitle}" is afgerond. Wil je een vervolgtaak aanmaken?
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
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" size="sm" onClick={() => setShowFollowUp(false)}>
              Sluiten
            </Button>
            <Button
              size="sm"
              onClick={handleFollowUp}
              disabled={followAdding || !followTitle.trim()}
            >
              Aanmaken
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
