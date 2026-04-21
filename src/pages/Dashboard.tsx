import {
  InboxIcon,
  CalendarCheck,
  CheckSquare,
  Clock,
  Plus,
  Trash2,
  Check,
  AlertTriangle,
  Flag,
  CheckCircle2,
  CalendarIcon,
  FileText,
  Receipt,
} from 'lucide-react';
import KpiCard from '@/components/KpiCard';
import KpiDetailDialog from '@/components/dashboard/KpiDetailDialog';
import DashboardSection from '@/components/dashboard/DashboardSection';
import { useBookings } from '@/contexts/BookingsContext';
import { useInquiriesContext } from '@/contexts/InquiriesContext';
import { useTasksContext } from '@/contexts/TasksContext';
import { useContactsContext } from '@/contexts/ContactsContext';
import { useCompaniesContext } from '@/contexts/CompaniesContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useLanguage } from '@/contexts/LanguageContext';
import { useQuotes } from '@/hooks/useQuotes';
import { useInvoices } from '@/hooks/useInvoices';
import { useMemo, useState } from 'react';
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

const QUOTE_STATUS_LABEL: Record<string, string> = {
  draft: 'Concept', sent: 'Verzonden', viewed: 'Bekeken', accepted: 'Geaccepteerd', declined: 'Afgewezen',
};
const QUOTE_STATUS_COLOR: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  sent: 'bg-primary/15 text-primary',
  viewed: 'bg-warning/15 text-warning',
  accepted: 'bg-success/15 text-success',
  declined: 'bg-destructive/15 text-destructive',
};
const INVOICE_STATUS_LABEL: Record<string, string> = {
  draft: 'Concept', sent: 'Verzonden', overdue: 'Verlopen', paid: 'Betaald',
};
const INVOICE_STATUS_COLOR: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  sent: 'bg-primary/15 text-primary',
  overdue: 'bg-destructive/15 text-destructive',
  paid: 'bg-success/15 text-success',
};

export default function Dashboard() {
  const { bookings, loading: bookingsLoading } = useBookings();
  const { inquiries, loading: inquiriesLoading } = useInquiriesContext();
  const { contacts } = useContactsContext();
  const { companies } = useCompaniesContext();
  const { tasks, loading: tasksLoading, addTask, updateTask, deleteTask, deleteTasks } = useTasksContext();
  const { quotes, loading: quotesLoading } = useQuotes();
  const { invoices, loading: invoicesLoading } = useInvoices();
  const { user } = useAuth();
  const { members } = useTeamMembers();
  const { t, language } = useLanguage();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newOpen, setNewOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [form, setForm] = useState({
    title: '', description: '', status: 'open' as Task['status'], priority: 'normal' as Task['priority'],
    dueDate: '', companyId: '', contactId: '', assignedTo: '',
  });
  const [filter, setFilter] = useState<'all' | 'open' | 'completed'>('all');
  const [visibleCount, setVisibleCount] = useState(10);
  const [kpiDialog, setKpiDialog] = useState<{ open: boolean; type: 'tasks' | 'inquiries' | 'bookings' }>({ open: false, type: 'tasks' });

  const currentUserName = useMemo(() => {
    if (!user) return '';
    const profile = members.find(m => m.id === user.id);
    return profile?.displayName || '';
  }, [user, members]);

  const [userFilter, setUserFilter] = useState<string>('__current__');
  const resolvedUserFilter = useMemo(() => {
    if (userFilter === '__current__') return currentUserName || '__all__';
    return userFilter;
  }, [userFilter, currentUserName]);

  const [bulkDate, setBulkDate] = useState<Date | undefined>();
  const [bulkDateOpen, setBulkDateOpen] = useState(false);

  const companyOptions = useMemo<ComboboxOption[]>(() =>
    companies.map(c => ({
      id: c.id, label: c.name,
      secondary: [c.email, c.city].filter(Boolean).join(' · ') || undefined,
      searchText: `${c.name} ${c.email || ''} ${c.phone || ''} ${c.city || ''}`,
    })), [companies]);

  const contactOptions = useMemo<ComboboxOption[]>(() => {
    const pool = form.companyId ? contacts.filter(c => c.companyId === form.companyId) : contacts;
    return pool.map(c => ({
      id: c.id,
      label: [c.firstName, c.lastName].filter(n => n && n !== '—').join(' ') || c.email || 'Onbekend',
      secondary: c.company || c.email || undefined,
      searchText: `${c.firstName} ${c.lastName} ${c.email || ''} ${c.company || ''} ${c.phone || ''}`,
    }));
  }, [contacts, form.companyId]);

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
  const todayBookings = useMemo(() =>
    bookings.filter((b) => b.date === today)
      .sort((a, b) => (a.startHour * 60 + (a.startMinute || 0)) - (b.startHour * 60 + (b.startMinute || 0))),
    [bookings, today]);
  const openInquiries = useMemo(() => inquiries.filter((i) => i.status === 'new' || i.status === 'contacted'), [inquiries]);

  // Quotes that need attention: not yet accepted/declined
  const openQuotes = useMemo(() =>
    quotes
      .filter(q => q.status === 'draft' || q.status === 'sent' || q.status === 'viewed')
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
    [quotes]);

  // Invoices that need attention: not yet paid
  const openInvoices = useMemo(() =>
    invoices
      .filter(i => i.status !== 'paid')
      .sort((a, b) => {
        // Overdue first, then by due date asc
        if (a.status === 'overdue' && b.status !== 'overdue') return -1;
        if (b.status === 'overdue' && a.status !== 'overdue') return 1;
        return (a.dueDate || '9999').localeCompare(b.dueDate || '9999');
      }),
    [invoices]);

  const contactMap = useMemo(() => {
    const m = new Map<string, { name: string; id: string }>();
    contacts.forEach(c => m.set(c.id, {
      name: [c.firstName, c.lastName].filter(n => n && n !== '—').join(' '),
      id: c.id,
    }));
    return m;
  }, [contacts]);

  const companyMap = useMemo(() => {
    const m = new Map<string, { name: string; id: string }>();
    companies.forEach(c => m.set(c.id, { name: c.name, id: c.id }));
    return m;
  }, [companies]);

  const contactCompanyMap = useMemo(() => {
    const m = new Map<string, string>();
    contacts.forEach(c => { if (c.companyId) m.set(c.id, c.companyId); });
    return m;
  }, [contacts]);

  const filteredTasks = useMemo(() => {
    let result = tasks;
    result = result.filter(t => !!t.contactId);
    if (filter !== 'completed') {
      result = result.filter(t => t.status !== 'completed');
    }
    if (resolvedUserFilter && resolvedUserFilter !== '__all__') {
      result = result.filter(t => t.assignedTo === resolvedUserFilter);
    }
    if (filter !== 'all' && filter !== 'completed') {
      result = result.filter((t) => t.status === filter);
    }
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
    if (selected.size === filteredTasks.length) setSelected(new Set());
    else setSelected(new Set(filteredTasks.map((t) => t.id)));
  };

  const resetForm = () => {
    setForm({ title: '', description: '', status: 'open', priority: 'normal', dueDate: '', companyId: '', contactId: '', assignedTo: '' });
  };

  const openNew = () => { resetForm(); setEditTask(null); setNewOpen(true); };
  const openEdit = (task: Task) => navigate(`/tasks/${task.id}`);

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast({ title: t('tasks.giveTitleError'), variant: 'destructive' });
      return;
    }
    if (editTask) {
      await updateTask({
        ...editTask, title: form.title, description: form.description || undefined,
        status: form.status, priority: form.priority, dueDate: form.dueDate || undefined,
        companyId: form.companyId || undefined, contactId: form.contactId || undefined,
      });
      toast({ title: t('tasks.taskUpdated') });
    } else {
      await addTask({
        title: form.title, description: form.description || undefined,
        status: form.status, priority: form.priority, dueDate: form.dueDate || undefined,
        companyId: form.companyId || undefined, contactId: form.contactId || undefined,
        assignedTo: form.assignedTo || undefined,
      });
      toast({ title: t('tasks.taskCreated') });
    }
    setNewOpen(false); resetForm(); setEditTask(null);
  };

  const handleDelete = async (id: string) => {
    await deleteTask(id);
    setSelected((prev) => { const n = new Set(prev); n.delete(id); return n; });
    toast({ title: t('tasks.taskDeleted') });
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selected);
    await deleteTasks(ids);
    setSelected(new Set());
    toast({ title: `${ids.length} ${t('tasks.tasksDeleted')}` });
  };

  const handleBulkStatus = async (newStatus: Task['status']) => {
    const ids = Array.from(selected);
    for (const id of ids) {
      const task = tasks.find((t) => t.id === id);
      if (task) await updateTask({ ...task, status: newStatus });
    }
    setSelected(new Set());
    toast({ title: `${ids.length} ${t('tasks.tasksUpdated')}` });
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
    setSelected(new Set()); setBulkDate(undefined); setBulkDateOpen(false);
    toast({ title: `${count} ${t('tasks.movedToDate')}` });
  };

  const handleStatusChange = async (task: Task, newStatus: Task['status']) => {
    await updateTask({ ...task, status: newStatus });
    if (newStatus === 'completed') {
      setCompletedTaskTitle(task.title); setFollowTitle(''); setFollowPriority('normal'); setFollowDueDate('');
      setFollowDefaults({
        companyId: task.companyId, contactId: task.contactId,
        inquiryId: task.inquiryId, bookingId: task.bookingId,
      });
      setShowFollowUp(true);
    }
  };

  const handleFollowUp = async () => {
    if (!followTitle.trim()) return;
    setFollowAdding(true);
    await addTask({
      title: followTitle.trim(), status: 'open', priority: followPriority,
      dueDate: followDueDate || undefined,
      companyId: followDefaults.companyId || undefined,
      contactId: followDefaults.contactId || undefined,
      inquiryId: followDefaults.inquiryId || undefined,
      bookingId: followDefaults.bookingId || undefined,
    });
    setFollowAdding(false); setShowFollowUp(false);
    toast({ title: t('tasks.followUpCreated') });
  };

  const priorityIcon = (p: Task['priority']) => {
    const cls = TASK_PRIORITIES.find((x) => x.value === p)?.color || '';
    if (p === 'urgent') return <AlertTriangle size={14} className={cls} />;
    if (p === 'high') return <Flag size={14} className={cls} />;
    return null;
  };

  const loading = bookingsLoading || inquiriesLoading || tasksLoading || quotesLoading || invoicesLoading;

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-muted-foreground">{t('common.loading')}</div>
      </div>
    );
  }

  const fmtMoney = (n: number) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n);

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="animate-fade-in">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">{t('dashboard.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {new Date().toLocaleDateString(language === 'en' ? 'en-GB' : 'nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          title={t('dashboard.openTasks')} value={String(openTaskCount)} icon={<CheckSquare size={20} />}
          subtitle={`${tasks.filter((t) => t.status === 'open').length} ${t('dashboard.open')} · ${tasks.filter((t) => t.status === 'completed').length} ${t('dashboard.completed')}`}
          onClick={() => setKpiDialog({ open: true, type: 'tasks' })}
        />
        <KpiCard
          title={t('dashboard.inquiries')} value={String(openInquiries.length)} icon={<InboxIcon size={20} />}
          subtitle={t('dashboard.newAndContacted')}
          onClick={() => setKpiDialog({ open: true, type: 'inquiries' })}
        />
        <KpiCard
          title={t('dashboard.bookingsToday')} value={String(todayBookings.length)} icon={<CalendarCheck size={20} />}
          subtitle={`${todayBookings.filter((b) => b.status === 'confirmed').length} ${t('dashboard.confirmed')} · ${todayBookings.filter((b) => b.status === 'option').length} ${t('dashboard.inOption')}`}
          onClick={() => setKpiDialog({ open: true, type: 'bookings' })}
        />
        <KpiCard
          title="Openstaande offertes" value={String(openQuotes.length)} icon={<FileText size={20} />}
          subtitle={`${quotes.filter((q) => q.status === 'sent' || q.status === 'viewed').length} verzonden · ${quotes.filter((q) => q.status === 'draft').length} concept`}
          onClick={() => navigate('/quotes')}
        />
        <KpiCard
          title="Openstaande facturen" value={String(openInvoices.length)} icon={<Receipt size={20} />}
          subtitle={`${invoices.filter((i) => i.status === 'overdue').length} verlopen · ${fmtMoney(openInvoices.reduce((s, i) => s + (i.total || 0), 0))}`}
          onClick={() => navigate('/quotes')}
        />
      </div>

      {/* Reserveringen vandaag */}
      <DashboardSection
        title="Reserveringen vandaag"
        icon={<CalendarCheck size={16} />}
        count={todayBookings.length}
        viewAllLabel="Alle"
        viewAllHref="/calendar"
        emptyMessage="Geen reserveringen vandaag"
        isEmpty={todayBookings.length === 0}
      >
        {todayBookings.slice(0, 5).map((booking) => (
          <Link
            key={booking.id} to={`/reserveringen/${booking.id}`}
            className="flex items-center gap-3 px-5 py-3 hover:bg-muted/30 transition-colors"
          >
            <div className={cn(
              'shrink-0 h-10 w-1 rounded-full',
              booking.status === 'confirmed' ? 'bg-success' : 'bg-warning',
            )} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-card-foreground truncate">{booking.title}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                <Clock size={12} />
                <span>{String(booking.startHour).padStart(2, '0')}:{String(booking.startMinute || 0).padStart(2, '0')} – {String(booking.endHour).padStart(2, '0')}:{String(booking.endMinute || 0).padStart(2, '0')}</span>
                <span>·</span>
                <span className="truncate max-w-[160px]">{booking.contactName}</span>
                <span>·</span>
                <span className="truncate max-w-[140px]">{booking.roomName}</span>
              </div>
            </div>
            <span className={cn(
              'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
              booking.status === 'confirmed' ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning',
            )}>
              {booking.status === 'confirmed' ? 'Bevestigd' : 'Optie'}
            </span>
          </Link>
        ))}
        {todayBookings.length > 5 && (
          <div className="px-5 py-2 text-center text-xs text-muted-foreground">
            +{todayBookings.length - 5} meer
          </div>
        )}
      </DashboardSection>

      {/* Aanvragen */}
      <DashboardSection
        title="Aanvragen"
        icon={<InboxIcon size={16} />}
        count={openInquiries.length}
        viewAllLabel="Alle"
        viewAllHref="/inquiries"
        emptyMessage="Geen openstaande aanvragen"
        isEmpty={openInquiries.length === 0}
      >
        {openInquiries.slice(0, 5).map((inq) => (
          <Link
            key={inq.id} to={`/inquiries/${inq.id}`}
            className="flex items-center gap-3 px-5 py-3 hover:bg-muted/30 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-card-foreground truncate">{inq.contactName}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                <span className="truncate max-w-[180px]">{inq.eventType}</span>
                {inq.guestCount > 0 && <><span>·</span><span>{inq.guestCount} gasten</span></>}
                {inq.preferredDate && <><span>·</span><span>📅 {inq.preferredDate}</span></>}
              </div>
            </div>
            <span className={cn(
              'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
              inq.status === 'new' ? 'bg-primary/15 text-primary' : 'bg-warning/15 text-warning',
            )}>
              {inq.status === 'new' ? 'Nieuw' : 'Gecontacteerd'}
            </span>
          </Link>
        ))}
        {openInquiries.length > 5 && (
          <div className="px-5 py-2 text-center text-xs text-muted-foreground">
            +{openInquiries.length - 5} meer
          </div>
        )}
      </DashboardSection>

      {/* Taken */}
      <DashboardSection
        title={t('dashboard.tasks')}
        icon={<CheckSquare size={16} />}
        count={filteredTasks.length}
        viewAllLabel="Alle"
        viewAllHref="/tasks"
        emptyMessage={filter === 'all' ? t('dashboard.noTasksYet') : t('common.noResults')}
        isEmpty={filteredTasks.length === 0}
        headerAction={
          <>
            <Select
              value={userFilter === '__current__' ? '__current__' : (resolvedUserFilter === '__all__' ? '__all__' : resolvedUserFilter)}
              onValueChange={(v) => setUserFilter(v)}
            >
              <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t('dashboard.allUsers')}</SelectItem>
                <SelectItem value="Sjors Jochems">Sjors Jochems</SelectItem>
                <SelectItem value="Iris Machielse">Iris Machielse</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
              <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('dashboard.all')}</SelectItem>
                {TASK_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" className="h-8" onClick={openNew}>
              <Plus size={14} className="mr-1" /> {t('dashboard.newTask')}
            </Button>
          </>
        }
      >
        {selected.size > 0 && (
          <div className="flex items-center gap-3 px-5 py-2.5 bg-primary/5 border-b flex-wrap">
            <span className="text-xs font-medium text-foreground">{selected.size} {t('dashboard.selected')}</span>
            <div className="flex items-center gap-2 ml-auto flex-wrap">
              <Select onValueChange={(v) => handleBulkStatus(v as Task['status'])}>
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue placeholder={t('dashboard.changeStatus')} />
                </SelectTrigger>
                <SelectContent>
                  {TASK_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Popover open={bulkDateOpen} onOpenChange={setBulkDateOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn('h-8 text-xs gap-1.5', !bulkDate && 'text-muted-foreground')}>
                    <CalendarIcon size={12} />
                    {bulkDate ? format(bulkDate, 'd MMM yyyy', { locale: nl }) : t('dashboard.moveToDate')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={bulkDate} onSelect={setBulkDate} initialFocus className="p-3 pointer-events-auto" />
                  {bulkDate && (
                    <div className="px-3 pb-3">
                      <Button size="sm" className="w-full text-xs" onClick={handleBulkDateChange}>
                        {t('dashboard.applyTo')} {selected.size} {selected.size === 1 ? t('dashboard.task') : t('dashboard.tasksPlural')}
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
              <Button variant="destructive" size="sm" className="h-8" onClick={handleBulkDelete}>
                <Trash2 size={14} className="mr-1" /> {t('common.delete')}
              </Button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 px-5 py-2 bg-muted/30">
          <Checkbox
            checked={selected.size > 0 && selected.size === filteredTasks.length}
            onCheckedChange={selectAll}
          />
          <span className="text-xs text-muted-foreground">{language === 'en' ? 'Select all' : 'Alles selecteren'}</span>
        </div>

        {filteredTasks.slice(0, visibleCount).map((task) => {
          const statusInfo = TASK_STATUSES.find((s) => s.value === task.status);
          const contact = task.contactId ? contactMap.get(task.contactId) : null;
          const effectiveCompanyId = task.companyId || (task.contactId ? contactCompanyMap.get(task.contactId) : undefined);
          const company = effectiveCompanyId ? companyMap.get(effectiveCompanyId) : null;

          return (
            <div key={task.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/20 transition-colors group">
              <Checkbox checked={selected.has(task.id)} onCheckedChange={() => toggleSelect(task.id)} />
              {priorityIcon(task.priority)}
              <div className="flex-1 min-w-0">
                <div className="cursor-pointer" onClick={() => openEdit(task)}>
                  <p className={`text-sm font-medium truncate ${task.status === 'completed' ? 'line-through text-muted-foreground' : 'text-card-foreground'}`}>
                    {task.title}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                  {contact && (
                    <Link to={`/crm/${contact.id}`} className="truncate max-w-[160px] hover:text-primary hover:underline transition-colors" onClick={(e) => e.stopPropagation()}>
                      👤 {contact.name}
                    </Link>
                  )}
                  {company && (
                    <Link to={`/companies/${company.id}`} className="truncate max-w-[160px] hover:text-primary hover:underline transition-colors" onClick={(e) => e.stopPropagation()}>
                      🏢 {company.name}
                    </Link>
                  )}
                  {task.dueDate && (
                    <span className={task.dueDate < today ? 'text-destructive font-medium' : ''}>📅 {task.dueDate}</span>
                  )}
                  {task.assignedTo && <span className="truncate max-w-[120px]">👤 {task.assignedTo}</span>}
                </div>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusInfo?.color || ''}`}>
                {statusInfo?.label}
              </span>
              <Select value={task.status} onValueChange={(v) => handleStatusChange(task, v as Task['status'])}>
                <SelectTrigger className="h-7 w-32 text-xs shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive" onClick={() => handleDelete(task.id)}>
                <Trash2 size={14} />
              </Button>
            </div>
          );
        })}
        {filteredTasks.length > visibleCount && (
          <div className="px-5 py-3 text-center">
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setVisibleCount(prev => prev + 10)}>
              {t('dashboard.showMore')} ({filteredTasks.length - visibleCount})
            </Button>
          </div>
        )}
      </DashboardSection>

      {/* Offertes */}
      <DashboardSection
        title="Offertes"
        icon={<FileText size={16} />}
        count={openQuotes.length}
        viewAllLabel="Alle"
        viewAllHref="/quotes"
        emptyMessage="Geen openstaande offertes"
        isEmpty={openQuotes.length === 0}
      >
        {openQuotes.slice(0, 5).map((q) => (
          <Link
            key={q.id} to={`/quotes/${q.id}`}
            className="flex items-center gap-3 px-5 py-3 hover:bg-muted/30 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-card-foreground truncate">{q.displayNumber || 'OFF-?'}</p>
                <span className="text-xs text-muted-foreground truncate">· {q.title}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                <span className="truncate max-w-[180px]">{q.companyName || q.contactName}</span>
                {q.validUntil && <><span>·</span><span>geldig tot {q.validUntil}</span></>}
              </div>
            </div>
            <span className="text-sm font-medium tabular-nums text-card-foreground shrink-0">{fmtMoney(q.total)}</span>
            <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium', QUOTE_STATUS_COLOR[q.status] || 'bg-muted')}>
              {QUOTE_STATUS_LABEL[q.status] || q.status}
            </span>
          </Link>
        ))}
        {openQuotes.length > 5 && (
          <div className="px-5 py-2 text-center text-xs text-muted-foreground">
            +{openQuotes.length - 5} meer
          </div>
        )}
      </DashboardSection>

      {/* Facturen */}
      <DashboardSection
        title="Facturen"
        icon={<Receipt size={16} />}
        count={openInvoices.length}
        viewAllLabel="Alle"
        viewAllHref="/quotes"
        emptyMessage="Geen openstaande facturen"
        isEmpty={openInvoices.length === 0}
      >
        {openInvoices.slice(0, 5).map((inv) => (
          <Link
            key={inv.id} to={`/invoices/${inv.id}`}
            className="flex items-center gap-3 px-5 py-3 hover:bg-muted/30 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-card-foreground truncate">{inv.displayNumber || 'FAC-?'}</p>
                <span className="text-xs text-muted-foreground truncate">· {inv.title}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                <span className="truncate max-w-[180px]">{inv.companyName || inv.contactName}</span>
                {inv.dueDate && (
                  <>
                    <span>·</span>
                    <span className={inv.status === 'overdue' ? 'text-destructive font-medium' : ''}>
                      vervalt {inv.dueDate}
                    </span>
                  </>
                )}
              </div>
            </div>
            <span className="text-sm font-medium tabular-nums text-card-foreground shrink-0">{fmtMoney(inv.total)}</span>
            <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium', INVOICE_STATUS_COLOR[inv.status] || 'bg-muted')}>
              {INVOICE_STATUS_LABEL[inv.status] || inv.status}
            </span>
          </Link>
        ))}
        {openInvoices.length > 5 && (
          <div className="px-5 py-2 text-center text-xs text-muted-foreground">
            +{openInvoices.length - 5} meer
          </div>
        )}
      </DashboardSection>

      {/* KPI Detail Dialog */}
      <KpiDetailDialog
        open={kpiDialog.open}
        onOpenChange={(open) => setKpiDialog((prev) => ({ ...prev, open }))}
        type={kpiDialog.type}
        title={
          kpiDialog.type === 'tasks' ? t('dashboard.openTasks') :
          kpiDialog.type === 'inquiries' ? (language === 'en' ? 'Open Inquiries' : 'Openstaande Aanvragen') :
          t('dashboard.bookingsToday')
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
            <DialogTitle>{editTask ? t('tasks.editTask') : t('tasks.newTask')}</DialogTitle>
            <DialogDescription className="sr-only">{language === 'en' ? 'Fill in task details' : 'Vul de taakgegevens in'}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label>{t('common.title')} *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Bv. Offerte sturen aan klant" />
            </div>
            <div className="grid gap-1.5">
              <Label>{t('common.description')}</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Extra details..." rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>{t('common.status')}</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Task['status'] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TASK_STATUSES.map((s) => (<SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>{t('common.priority')}</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as Task['priority'] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TASK_PRIORITIES.map((p) => (<SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>{t('crm.company')}</Label>
                <CrmCombobox options={companyOptions} value={form.companyId}
                  onSelect={(id) => setForm({ ...form, companyId: id, contactId: '' })}
                  placeholder="Selecteer..." searchPlaceholder="Zoek bedrijf..." allowClear clearLabel="— Geen —" popoverWidth="w-[280px]" />
              </div>
              <div className="grid gap-1.5">
                <Label>{t('inquiries.contactPerson')}</Label>
                <CrmCombobox options={contactOptions} value={form.contactId}
                  onSelect={(id) => setForm({ ...form, contactId: id })}
                  placeholder="Selecteer..." searchPlaceholder="Zoek contact..." allowClear clearLabel="— Geen —" popoverWidth="w-[280px]" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>{t('tasks.dueDate')}</Label>
                <Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>{t('tasks.assignedTo')}</Label>
                <Select value={form.assignedTo || '__none__'} onValueChange={(v) => setForm({ ...form, assignedTo: v === '__none__' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder={language === 'en' ? 'Nobody' : 'Niemand'} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{language === 'en' ? 'Nobody' : 'Niemand'}</SelectItem>
                    <SelectItem value="Sjors Jochems">Sjors Jochems</SelectItem>
                    <SelectItem value="Iris Machielse">Iris Machielse</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleSave}>{editTask ? t('common.save') : t('toast.created')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Follow-up dialog */}
      <Dialog open={showFollowUp} onOpenChange={setShowFollowUp}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 size={18} className="text-success" />
              {t('tasks.taskCompleted')}
            </DialogTitle>
            <DialogDescription>
              "{completedTaskTitle}" {language === 'en' ? 'is completed. Would you like to create a follow-up task?' : 'is afgerond. Wil je een vervolgtaak aanmaken?'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input placeholder="Vervolgtaak (optioneel)..." value={followTitle} onChange={(e) => setFollowTitle(e.target.value)} autoFocus />
            {followTitle.trim() && (
              <div className="flex flex-wrap gap-2 items-center">
                <Select value={followPriority} onValueChange={(v: Task['priority']) => setFollowPriority(v)}>
                  <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TASK_PRIORITIES.map(p => (<SelectItem key={p.value} value={p.value} className="text-xs">{p.label}</SelectItem>))}
                  </SelectContent>
                </Select>
                <Input type="date" value={followDueDate} onChange={(e) => setFollowDueDate(e.target.value)} className="h-8 w-auto text-xs" />
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" size="sm" onClick={() => setShowFollowUp(false)}>{t('common.close')}</Button>
            <Button size="sm" onClick={handleFollowUp} disabled={followAdding || !followTitle.trim()}>{t('toast.created')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
