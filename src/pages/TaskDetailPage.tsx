import { useParams, useNavigate } from 'react-router-dom';
import { useState, useMemo } from 'react';
import { useTasksContext } from '@/contexts/TasksContext';
import { useContactsContext } from '@/contexts/ContactsContext';
import { useCompaniesContext } from '@/contexts/CompaniesContext';
import { useInquiriesContext } from '@/contexts/InquiriesContext';
import { useBookings } from '@/contexts/BookingsContext';
import { Task, TASK_STATUSES, TASK_PRIORITIES } from '@/types/task';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { InfoRow, SectionCard } from '@/components/detail/DetailPageComponents';
import TeamMemberSelect from '@/components/TeamMemberSelect';
import CrmCombobox from '@/components/CrmCombobox';
import { ArrowLeft, ChevronRight, Pencil, Check, X, CalendarIcon, User, Building2, FileText, Bookmark, CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { tasks, updateTask, deleteTask, addTask, loading } = useTasksContext();
  const { contacts } = useContactsContext();
  const { companies } = useCompaniesContext();
  const { inquiries } = useInquiriesContext();
  const { bookings } = useBookings();
  const { toast } = useToast();

  const task = tasks.find(t => t.id === id);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Task | null>(null);
  const [editDueDate, setEditDueDate] = useState<Date | undefined>();

  // Follow-up dialog
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [followTitle, setFollowTitle] = useState('');
  const [followPriority, setFollowPriority] = useState<Task['priority']>('normal');
  const [followDueDate, setFollowDueDate] = useState<Date | undefined>();
  const [followAssignedTo, setFollowAssignedTo] = useState<string | undefined>();
  const [followAdding, setFollowAdding] = useState(false);
  const [followAttempted, setFollowAttempted] = useState(false);

  const contact = useMemo(() => task?.contactId ? contacts.find(c => c.id === task.contactId) : null, [task, contacts]);
  const company = useMemo(() => task?.companyId ? companies.find(c => c.id === task.companyId) : null, [task, companies]);
  const inquiry = useMemo(() => task?.inquiryId ? inquiries.find(i => i.id === task.inquiryId) : null, [task, inquiries]);
  const booking = useMemo(() => task?.bookingId ? bookings.find(b => b.id === task.bookingId) : null, [task, bookings]);

  if (loading) {
    return (
      <div className="p-6 lg:p-8 space-y-4 animate-fade-in">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-muted-foreground">Taak niet gevonden</p>
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft size={14} className="mr-1" /> Terug
          </Button>
        </div>
      </div>
    );
  }

  const statusInfo = TASK_STATUSES.find(s => s.value === task.status);
  const prioInfo = TASK_PRIORITIES.find(p => p.value === task.priority);

  const startEdit = () => {
    setForm({ ...task });
    setEditDueDate(task.dueDate ? new Date(task.dueDate) : undefined);
    setEditing(true);
  };
  const cancelEdit = () => { setForm(null); setEditing(false); };
  const saveEdit = async () => {
    if (!form) return;
    const dueDate = editDueDate
      ? `${editDueDate.getFullYear()}-${String(editDueDate.getMonth() + 1).padStart(2, '0')}-${String(editDueDate.getDate()).padStart(2, '0')}`
      : undefined;
    await updateTask({ ...form, dueDate });
    setEditing(false);
    setForm(null);
    toast({ title: 'Taak bijgewerkt' });
  };

  const handleToggleComplete = async () => {
    const newStatus = task.status === 'completed' ? 'open' : 'completed';
    await updateTask({ ...task, status: newStatus });
    if (newStatus === 'completed') {
      setFollowTitle('');
      setFollowPriority('normal');
      setFollowDueDate(undefined);
      setFollowAssignedTo(task.assignedTo);
      setFollowAttempted(false);
      setShowFollowUp(true);
    }
    toast({ title: newStatus === 'completed' ? 'Taak afgerond' : 'Taak heropend' });
  };

  const handleDelete = async () => {
    await deleteTask(task.id);
    toast({ title: 'Taak verwijderd' });
    navigate(-1);
  };

  const handleFollowUp = async () => {
    setFollowAttempted(true);
    if (!followTitle.trim() || !followDueDate) return;
    setFollowAdding(true);
    const dueDate = `${followDueDate.getFullYear()}-${String(followDueDate.getMonth() + 1).padStart(2, '0')}-${String(followDueDate.getDate()).padStart(2, '0')}`;
    await addTask({
      title: followTitle.trim(),
      status: 'open',
      priority: followPriority,
      dueDate,
      assignedTo: followAssignedTo,
      contactId: task.contactId,
      companyId: task.companyId,
      inquiryId: task.inquiryId,
      bookingId: task.bookingId,
    });
    setFollowAdding(false);
    setShowFollowUp(false);
    toast({ title: 'Vervolgtaak aangemaakt' });
  };

  const isOverdue = task.dueDate && task.status !== 'completed' && task.dueDate < new Date().toISOString().split('T')[0];

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <button onClick={() => navigate(-1)} className="hover:text-foreground transition-colors">Taken</button>
        <ChevronRight size={14} />
        <span className="text-foreground font-medium truncate">{task.title}</span>
      </div>

      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-foreground flex-1 min-w-0">{task.title}</h1>
        <Badge className={cn('text-[11px]', statusInfo?.color)}>{statusInfo?.label}</Badge>
        {task.priority !== 'normal' && (
          <Badge variant="secondary" className={cn('text-[11px]', prioInfo?.color)}>{prioInfo?.label}</Badge>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* LEFT — Task details */}
        <div className="w-full lg:w-80 shrink-0 space-y-5">
          <div className="rounded-xl bg-card p-5 card-shadow space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-foreground">Taakgegevens</h3>
              {!editing ? (
                <Button variant="ghost" size="icon" onClick={startEdit} className="h-8 w-8">
                  <Pencil size={14} />
                </Button>
              ) : (
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={cancelEdit} className="h-8 w-8 text-muted-foreground">
                    <X size={14} />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={saveEdit} className="h-8 w-8 text-success">
                    <Check size={14} />
                  </Button>
                </div>
              )}
            </div>

            {editing ? (
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Titel</p>
                  <Input value={form!.title} onChange={(e) => setForm({ ...form!, title: e.target.value })} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Omschrijving</p>
                  <Textarea value={form!.description || ''} onChange={(e) => setForm({ ...form!, description: e.target.value || undefined })} rows={3} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Status</p>
                  <Select value={form!.status} onValueChange={(v: Task['status']) => setForm({ ...form!, status: v })}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TASK_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Prioriteit</p>
                  <Select value={form!.priority} onValueChange={(v: Task['priority']) => setForm({ ...form!, priority: v })}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TASK_PRIORITIES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Datum</p>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className={cn('w-full h-8 text-sm justify-start', !editDueDate && 'text-muted-foreground')}>
                        <CalendarIcon size={14} className="mr-2" />
                        {editDueDate ? format(editDueDate, 'd MMM yyyy', { locale: nl }) : 'Geen datum'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={editDueDate} onSelect={setEditDueDate} initialFocus className="p-3 pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Verantwoordelijke</p>
                  <TeamMemberSelect value={form!.assignedTo} onValueChange={(v) => setForm({ ...form!, assignedTo: v })} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Contactpersoon</p>
                  <CrmCombobox
                    options={contacts.map(c => ({ id: c.id, label: `${c.firstName} ${c.lastName}`, secondary: c.email || c.company || undefined }))}
                    value={form!.contactId || ''}
                    onSelect={(id) => setForm({ ...form!, contactId: id || undefined })}
                    placeholder="Selecteer contact..."
                    searchPlaceholder="Zoek contact..."
                    allowClear
                    clearLabel="— Geen contactpersoon —"
                  />
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Bedrijf</p>
                  <CrmCombobox
                    options={companies.map(c => ({ id: c.id, label: c.name, secondary: c.email || undefined }))}
                    value={form!.companyId || ''}
                    onSelect={(id) => setForm({ ...form!, companyId: id || undefined })}
                    placeholder="Selecteer bedrijf..."
                    searchPlaceholder="Zoek bedrijf..."
                    allowClear
                    clearLabel="— Geen bedrijf —"
                  />
                </div>
                <Button variant="destructive" size="sm" className="w-full mt-2" onClick={() => setDeleteConfirmOpen(true)}>
                  <Trash2 size={14} className="mr-1" /> Taak verwijderen
                </Button>
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                {task.description && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-0.5">Omschrijving</p>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{task.description}</p>
                  </div>
                )}
                <InfoRow icon={<CalendarIcon size={14} />} label="Datum" value={task.dueDate ? (
                  <span className={cn(isOverdue && 'text-destructive font-medium')}>{task.dueDate}</span>
                ) as any : '—'} />
                {task.assignedTo && <InfoRow icon={<User size={14} />} label="Verantwoordelijke" value={task.assignedTo} />}
                <p className="text-xs text-muted-foreground pt-2">Aangemaakt: {task.createdAt}</p>
                {task.completedAt && <p className="text-xs text-muted-foreground">Afgerond: {task.completedAt.split('T')[0]}</p>}

                <div className="flex gap-2 pt-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={startEdit}>Bewerken</Button>
                  <Button
                    size="sm"
                    className="flex-1"
                    variant={task.status === 'completed' ? 'outline' : 'default'}
                    onClick={handleToggleComplete}
                  >
                    <CheckCircle2 size={14} className="mr-1" />
                    {task.status === 'completed' ? 'Heropenen' : 'Afronden'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — Linked entities */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Linked contact */}
          {contact && (
            <SectionCard title="Contactpersoon">
              <button
                onClick={() => navigate(`/crm/${contact.id}`)}
                className="w-full text-left rounded-lg border border-border/50 p-3 hover:bg-muted/30 transition-colors"
              >
                <p className="text-sm font-medium text-foreground">{contact.firstName} {contact.lastName}</p>
                {contact.email && <p className="text-xs text-muted-foreground">{contact.email}</p>}
                {contact.phone && <p className="text-xs text-muted-foreground">{contact.phone}</p>}
              </button>
            </SectionCard>
          )}

          {/* Linked company */}
          {company && (
            <SectionCard title="Bedrijf">
              <button
                onClick={() => navigate(`/companies/${company.id}`)}
                className="w-full text-left rounded-lg border border-border/50 p-3 hover:bg-muted/30 transition-colors"
              >
                <p className="text-sm font-medium text-foreground">{company.name}</p>
                {company.email && <p className="text-xs text-muted-foreground">{company.email}</p>}
              </button>
            </SectionCard>
          )}

          {/* Linked inquiry */}
          {inquiry && (
            <SectionCard title="Aanvraag">
              <button
                onClick={() => navigate(`/inquiries/${inquiry.id}`)}
                className="w-full text-left rounded-lg border border-border/50 p-3 hover:bg-muted/30 transition-colors"
              >
                <p className="text-sm font-medium text-foreground">{inquiry.eventType}</p>
                <p className="text-xs text-muted-foreground">{inquiry.contactName} · {inquiry.createdAt}</p>
              </button>
            </SectionCard>
          )}

          {/* Linked booking */}
          {booking && (
            <SectionCard title="Reservering">
              <button
                onClick={() => navigate(`/reserveringen/${booking.id}`)}
                className="w-full text-left rounded-lg border border-border/50 p-3 hover:bg-muted/30 transition-colors"
              >
                <p className="text-sm font-medium text-foreground">{booking.title}</p>
                <p className="text-xs text-muted-foreground">{booking.roomName} · {booking.date}</p>
              </button>
            </SectionCard>
          )}

          {/* Follow-up: create new task */}
          <SectionCard title="Vervolgtaak" actionLabel="Vervolgtaak aanmaken" onAction={() => {
            setFollowTitle('');
            setFollowPriority('normal');
            setFollowDueDate(undefined);
            setFollowAssignedTo(task.assignedTo);
            setFollowAttempted(false);
            setShowFollowUp(true);
          }}>
            <p className="text-xs text-muted-foreground">Maak een vervolgtaak aan met dezelfde koppelingen.</p>
          </SectionCard>
        </div>
      </div>

      {/* Follow-up dialog */}
      <Dialog open={showFollowUp} onOpenChange={setShowFollowUp}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus size={18} className="text-primary" />
              Vervolgtaak aanmaken
            </DialogTitle>
            <DialogDescription>Maak een nieuwe taak aan met dezelfde koppelingen.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input
              placeholder="Taakomschrijving..."
              value={followTitle}
              onChange={(e) => setFollowTitle(e.target.value)}
              autoFocus
            />
            <div className="flex flex-wrap gap-2 items-center">
              <Select value={followPriority} onValueChange={(v: Task['priority']) => setFollowPriority(v)}>
                <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITIES.map(p => (
                    <SelectItem key={p.value} value={p.value} className="text-xs">{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="w-[170px]">
                <TeamMemberSelect
                  value={followAssignedTo}
                  onValueChange={setFollowAssignedTo}
                  placeholder="Verantwoordelijke"
                  className="h-8 text-xs"
                />
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      'h-8 text-xs gap-1.5',
                      !followDueDate && 'text-muted-foreground',
                      followAttempted && !followDueDate && 'border-destructive ring-1 ring-destructive'
                    )}
                  >
                    <CalendarIcon size={12} />
                    {followDueDate ? format(followDueDate, 'd MMM yyyy', { locale: nl }) : 'Datum *'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={followDueDate} onSelect={setFollowDueDate} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            {followAttempted && !followDueDate && (
              <p className="text-xs text-destructive">Datum is verplicht voor een vervolgtaak.</p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" size="sm" onClick={() => setShowFollowUp(false)}>Sluiten</Button>
            <Button size="sm" onClick={handleFollowUp} disabled={followAdding || !followTitle.trim() || !followDueDate}>Aanmaken</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Taak verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je de taak <strong>{task.title}</strong> wilt verwijderen? Dit kan niet ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDelete}>
              Definitief verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
