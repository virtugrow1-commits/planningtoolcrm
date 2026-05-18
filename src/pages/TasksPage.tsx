import {
  CheckSquare,
  Plus,
  Trash2,
  Search,
  Check,
  CalendarIcon,
} from 'lucide-react';
import { useTasksContext } from '@/contexts/TasksContext';
import { useContactsContext } from '@/contexts/ContactsContext';
import { useCompaniesContext } from '@/contexts/CompaniesContext';
import { useInquiriesContext } from '@/contexts/InquiriesContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
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
import { Task, TASK_STATUSES } from '@/types/task';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

type SortKey = 'dueDate' | 'createdAt' | 'title';

export default function TasksPage() {
  const { tasks, loading, addTask, updateTask, deleteTask, deleteTasks } = useTasksContext();
  const { contacts } = useContactsContext();
  const { companies } = useCompaniesContext();
  const { inquiries } = useInquiriesContext();
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'completed'>('open');
  const [userFilter, setUserFilter] = useState<string>('__all__');
  const userFilterTouched = useRef(false);
  const { user } = useAuth();

  // Default user filter to the logged-in user (if they map to Sjors/Iris)
  useEffect(() => {
    if (!user || userFilterTouched.current) return;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .maybeSingle();
      const name = data?.display_name?.trim();
      if (name === 'Sjors Jochems' || name === 'Iris Machielse') {
        if (!userFilterTouched.current) setUserFilter(name);
      }
    })();
  }, [user]);

  const handleUserFilterChange = (v: string) => {
    userFilterTouched.current = true;
    setUserFilter(v);
  };
  const [sortKey, setSortKey] = useState<SortKey>('dueDate');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDate, setBulkDate] = useState<Date | undefined>();
  const [bulkDateOpen, setBulkDateOpen] = useState(false);

  const [newOpen, setNewOpen] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    status: 'open' as Task['status'],
    priority: 'normal' as Task['priority'],
    dueDate: '',
    companyId: '',
    contactId: '',
    assignedTo: [] as string[],
  });

  const today = new Date().toISOString().split('T')[0];

  const contactMap = useMemo(() => {
    const m = new Map<string, { name: string; id: string }>();
    contacts.forEach(c =>
      m.set(c.id, {
        name: [c.firstName, c.lastName].filter(n => n && n !== '—').join(' ') || c.email || 'Onbekend',
        id: c.id,
      })
    );
    return m;
  }, [contacts]);

  const companyMap = useMemo(() => {
    const m = new Map<string, { name: string; id: string }>();
    companies.forEach(c => m.set(c.id, { name: c.name, id: c.id }));
    return m;
  }, [companies]);

  const inquiryMap = useMemo(() => {
    const m = new Map<string, string>();
    inquiries.forEach(i => m.set(i.id, i.displayNumber || i.eventType || 'Aanvraag'));
    return m;
  }, [inquiries]);

  const contactCompanyMap = useMemo(() => {
    const m = new Map<string, string>();
    contacts.forEach(c => {
      if (c.companyId) m.set(c.id, c.companyId);
    });
    return m;
  }, [contacts]);

  const companyOptions = useMemo<ComboboxOption[]>(
    () =>
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

  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (statusFilter !== 'all') result = result.filter(tk => tk.status === statusFilter);
    if (userFilter !== '__all__') {
      result = result.filter(tk => tk.assignedTo === userFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(tk =>
        tk.title.toLowerCase().includes(q) ||
        (tk.description || '').toLowerCase().includes(q) ||
        (tk.assignedTo || '').toLowerCase().includes(q)
      );
    }
    result = [...result].sort((a, b) => {
      switch (sortKey) {
        case 'createdAt':
          return (b.createdAt || '').localeCompare(a.createdAt || '');
        case 'title':
          return a.title.localeCompare(b.title);
        case 'dueDate':
        default:
          if (!a.dueDate && !b.dueDate) return 0;
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return a.dueDate.localeCompare(b.dueDate);
      }
    });
    return result;
  }, [tasks, statusFilter, userFilter, search, sortKey]);

  const counts = useMemo(() => ({
    open: tasks.filter(tk => tk.status === 'open').length,
    completed: tasks.filter(tk => tk.status === 'completed').length,
    overdue: tasks.filter(tk => tk.status === 'open' && tk.dueDate && tk.dueDate < today).length,
  }), [tasks, today]);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAll = () => {
    if (selected.size === filteredTasks.length) setSelected(new Set());
    else setSelected(new Set(filteredTasks.map(tk => tk.id)));
  };

  const resetForm = () =>
    setForm({ title: '', description: '', status: 'open', priority: 'normal', dueDate: '', companyId: '', contactId: '', assignedTo: [] });

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast({ title: t('tasks.giveTitleError'), variant: 'destructive' });
      return;
    }
    if (!form.assignedTo.length) {
      toast({ title: language === 'en' ? 'Choose a responsible person' : 'Kies een verantwoordelijke', variant: 'destructive' });
      return;
    }
    for (const assignee of form.assignedTo) {
      await addTask({
        title: form.title,
        description: form.description || undefined,
        status: 'open',
        priority: 'normal',
        dueDate: form.dueDate || undefined,
        companyId: form.companyId || undefined,
        contactId: form.contactId || undefined,
        assignedTo: assignee,
      });
    }
    toast({ title: form.assignedTo.length > 1 ? `${form.assignedTo.length} ${language === 'en' ? 'tasks created' : 'taken aangemaakt'}` : t('tasks.taskCreated') });
    setNewOpen(false);
    resetForm();
  };

  const handleDelete = async (id: string) => {
    await deleteTask(id);
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
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
      const tk = tasks.find(x => x.id === id);
      if (tk) await updateTask({ ...tk, status: newStatus });
    }
    setSelected(new Set());
    toast({ title: `${ids.length} ${t('tasks.tasksUpdated')}` });
  };

  const handleBulkDateChange = async () => {
    if (!bulkDate) return;
    const dateStr = `${bulkDate.getFullYear()}-${String(bulkDate.getMonth() + 1).padStart(2, '0')}-${String(bulkDate.getDate()).padStart(2, '0')}`;
    const ids = Array.from(selected);
    for (const id of ids) {
      const tk = tasks.find(x => x.id === id);
      if (tk) await updateTask({ ...tk, dueDate: dateStr });
    }
    const count = ids.length;
    setSelected(new Set());
    setBulkDate(undefined);
    setBulkDateOpen(false);
    toast({ title: `${count} ${t('dashboard.movedToDate')}` });
  };

  const handleStatusChange = async (task: Task, newStatus: Task['status']) => {
    await updateTask({ ...task, status: newStatus });
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-muted-foreground">{t('common.loading')}</div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="animate-fade-in flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <CheckSquare size={22} /> {t('nav.tasks')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {counts.open} {t('dashboard.open')} · {counts.completed} {t('dashboard.completed')}
            {counts.overdue > 0 && (
              <span className="ml-2 text-destructive font-medium">
                · {counts.overdue} {language === 'en' ? 'overdue' : 'achterstallig'}
              </span>
            )}
          </p>
        </div>
        <Button size="sm" onClick={() => { resetForm(); setNewOpen(true); }}>
          <Plus size={14} className="mr-1" /> {t('dashboard.newTask')}
        </Button>
      </div>

      {/* Filters */}
      <div className="rounded-xl bg-card card-shadow p-4 flex flex-wrap items-center gap-3 animate-fade-in-up">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={language === 'en' ? 'Search tasks...' : 'Zoek taken...'}
            className="pl-8 h-9"
          />
        </div>

        <Select value={statusFilter} onValueChange={v => setStatusFilter(v as any)}>
          <SelectTrigger className="h-9 w-36 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('dashboard.all')}</SelectItem>
            {TASK_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={userFilter} onValueChange={handleUserFilterChange}>
          <SelectTrigger className="h-9 w-44 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{t('dashboard.allUsers')}</SelectItem>
            <SelectItem value="Sjors Jochems">Sjors Jochems</SelectItem>
            <SelectItem value="Iris Machielse">Iris Machielse</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sortKey} onValueChange={v => setSortKey(v as SortKey)}>
          <SelectTrigger className="h-9 w-44 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="dueDate">{language === 'en' ? 'Sort: Due date' : 'Sorteer: Vervaldatum'}</SelectItem>
            <SelectItem value="createdAt">{language === 'en' ? 'Sort: Created' : 'Sorteer: Aangemaakt'}</SelectItem>
            <SelectItem value="title">{language === 'en' ? 'Sort: Title' : 'Sorteer: Titel'}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-primary/5 border rounded-lg flex-wrap">
          <span className="text-xs font-medium text-foreground">{selected.size} {t('dashboard.selected')}</span>
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <Select onValueChange={v => handleBulkStatus(v as Task['status'])}>
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue placeholder={t('dashboard.changeStatus')} />
              </SelectTrigger>
              <SelectContent>
                {TASK_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Popover open={bulkDateOpen} onOpenChange={setBulkDateOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn('h-8 text-xs gap-1.5', !bulkDate && 'text-muted-foreground')}>
                  <CalendarIcon size={12} />
                  {bulkDate ? format(bulkDate, 'd MMM yyyy', { locale: nl }) : t('dashboard.moveToDate')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
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

      {/* List */}
      <div className="rounded-xl bg-card card-shadow overflow-hidden animate-fade-in-up">
        {filteredTasks.length === 0 ? (
          <div className="p-10 text-center">
            <Check size={32} className="mx-auto text-success mb-2" />
            <p className="text-sm text-muted-foreground">
              {tasks.length === 0 ? t('dashboard.noTasksYet') : t('common.noResults')}
            </p>
          </div>
        ) : (
          <div className="divide-y">
            <div className="flex items-center gap-3 px-5 py-2 bg-muted/30">
              <Checkbox
                checked={selected.size > 0 && selected.size === filteredTasks.length}
                onCheckedChange={selectAll}
              />
              <span className="text-xs text-muted-foreground">
                {language === 'en' ? 'Select all' : 'Alles selecteren'}
              </span>
            </div>

            {filteredTasks.map(task => {
              const statusInfo = TASK_STATUSES.find(s => s.value === task.status);
              const contact = task.contactId ? contactMap.get(task.contactId) : null;
              const effectiveCompanyId = task.companyId || (task.contactId ? contactCompanyMap.get(task.contactId) : undefined);
              const company = effectiveCompanyId ? companyMap.get(effectiveCompanyId) : null;
              const inquiryLabel = task.inquiryId ? inquiryMap.get(task.inquiryId) : null;
              const overdue = task.status === 'open' && task.dueDate && task.dueDate < today;

              return (
                <div key={task.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/20 transition-colors group">
                  <div onClick={e => e.stopPropagation()}>
                    <Checkbox checked={selected.has(task.id)} onCheckedChange={() => toggleSelect(task.id)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="cursor-pointer" onClick={() => navigate(`/tasks/${task.id}`)}>
                      <p className={`text-sm font-medium truncate ${task.status === 'completed' ? 'line-through text-muted-foreground' : 'text-card-foreground'}`}>
                        {task.title}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap mt-0.5">
                      {contact && (
                        <Link
                          to={`/crm/${contact.id}`}
                          className="truncate max-w-[160px] hover:text-primary hover:underline transition-colors"
                          onClick={e => e.stopPropagation()}
                        >
                          👤 {contact.name}
                        </Link>
                      )}
                      {company && (
                        <Link
                          to={`/companies/${company.id}`}
                          className="truncate max-w-[160px] hover:text-primary hover:underline transition-colors"
                          onClick={e => e.stopPropagation()}
                        >
                          🏢 {company.name}
                        </Link>
                      )}
                      {inquiryLabel && task.inquiryId && (
                        <Link
                          to={`/inquiries/${task.inquiryId}`}
                          className="truncate max-w-[160px] hover:text-primary hover:underline transition-colors"
                          onClick={e => e.stopPropagation()}
                        >
                          📥 {inquiryLabel}
                        </Link>
                      )}
                      {task.dueDate && (
                        <span className={overdue ? 'text-destructive font-medium' : ''}>
                          📅 {task.dueDate}
                        </span>
                      )}
                      {task.assignedTo && (
                        <span className="truncate max-w-[160px] inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                          🧑‍💼 {task.assignedTo}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusInfo?.color || ''}`}>
                    {statusInfo?.label}
                  </span>
                  <Select value={task.status} onValueChange={v => handleStatusChange(task, v as Task['status'])}>
                    <SelectTrigger className="h-7 w-32 text-xs shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TASK_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
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

      {/* New Task dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('tasks.newTask')}</DialogTitle>
            <DialogDescription className="sr-only">
              {language === 'en' ? 'Fill in task details' : 'Vul de taakgegevens in'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label>{t('common.title')} *</Label>
              <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>{t('common.description')}</Label>
              <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>{t('crm.company')}</Label>
                <CrmCombobox
                  options={companyOptions}
                  value={form.companyId}
                  onSelect={id => setForm({ ...form, companyId: id, contactId: '' })}
                  placeholder="Selecteer..."
                  searchPlaceholder="Zoek bedrijf..."
                  allowClear
                  clearLabel="— Geen —"
                  popoverWidth="w-[280px]"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>{t('inquiries.contactPerson')}</Label>
                <CrmCombobox
                  options={contactOptions}
                  value={form.contactId}
                  onSelect={id => setForm({ ...form, contactId: id })}
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
                <Label>{t('tasks.dueDate')}</Label>
                <Input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>{t('tasks.assignedTo')} *</Label>
                <div className="flex flex-col gap-2 rounded-md border bg-background p-2.5">
                  {['Sjors Jochems', 'Iris Machielse'].map((name) => {
                    const checked = form.assignedTo.includes(name);
                    return (
                      <label key={name} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) =>
                            setForm({
                              ...form,
                              assignedTo: v
                                ? [...form.assignedTo, name]
                                : form.assignedTo.filter((a) => a !== name),
                            })
                          }
                        />
                        {name}
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleSave} disabled={!form.title.trim() || !form.assignedTo}>{t('toast.created')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
