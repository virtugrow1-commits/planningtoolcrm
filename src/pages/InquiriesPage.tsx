import { useState, useCallback, useEffect, useMemo, DragEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Inquiry, Booking, ROOMS, RoomName } from '@/types/crm';
import { Calendar as CalendarIcon, Users, Euro, GripVertical, Repeat, Plus, X, Check, LayoutGrid, List, Trash2, ArrowRight, AlertTriangle, Download, MapPin, MessageSquare, StickyNote, CheckSquare, Clock, Building2, FileText, Pencil, Eye } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useBookings } from '@/contexts/BookingsContext';
import { useInquiriesContext } from '@/contexts/InquiriesContext';
import { useContactsContext } from '@/contexts/ContactsContext';
import { useTasksContext } from '@/contexts/TasksContext';
import { useCompaniesContext } from '@/contexts/CompaniesContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { exportToCSV } from '@/lib/csvExport';

const PIPELINE_COLUMNS: { key: Inquiry['status']; label: string; colorClass: string; badgeClass: string }[] = [
  { key: 'new', label: 'Nieuwe Aanvraag', colorClass: 'border-t-info bg-info/5', badgeClass: 'status-new' },
  { key: 'contacted', label: 'Lopend Contact', colorClass: 'border-t-warning bg-warning/5', badgeClass: 'status-contacted' },
  { key: 'option', label: 'Optie', colorClass: 'border-t-accent bg-accent/5', badgeClass: 'status-option' },
  { key: 'quoted', label: 'Offerte Verzonden', colorClass: 'border-t-primary bg-primary/5', badgeClass: 'status-quoted' },
  { key: 'quote_revised', label: 'Aangepaste Offerte', colorClass: 'border-t-primary bg-primary/5', badgeClass: 'status-quoted' },
  { key: 'reserved', label: 'Reservering', colorClass: 'border-t-success bg-success/5', badgeClass: 'status-converted' },
  { key: 'script', label: 'Draaiboek Maken', colorClass: 'border-t-accent bg-accent/5', badgeClass: 'status-option' },
  { key: 'confirmed', label: 'Definitieve Reservering', colorClass: 'border-t-success bg-success/5', badgeClass: 'status-converted' },
  { key: 'invoiced', label: 'Facturatie', colorClass: 'border-t-info bg-info/5', badgeClass: 'status-new' },
  { key: 'lost', label: 'Vervallen / Verloren', colorClass: 'border-t-muted-foreground bg-muted/30', badgeClass: 'status-lost' },
  { key: 'converted', label: 'Omgezet', colorClass: 'border-t-success bg-success/5', badgeClass: 'status-converted' },
  { key: 'after_sales', label: 'After Sales', colorClass: 'border-t-success bg-success/5', badgeClass: 'status-converted' },
];

const HOURS = [...Array.from({ length: 17 }, (_, i) => i + 7), 0, 1];

const RECURRENCE_OPTIONS = [
  { value: 'none', label: 'Eenmalig' },
  { value: 'weekly', label: 'Elke week' },
  { value: 'biweekly', label: 'Om de 2 weken' },
  { value: 'monthly', label: 'Elke maand' },
  { value: 'quarterly', label: 'Elk kwartaal' },
];

const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`;

interface DateOption {
  id: string;
  date: Date | undefined;
  startHour: number;
  endHour: number;
  room: RoomName | '';
  status: 'confirmed' | 'option';
}

const createDateOption = (): DateOption => ({
  id: `opt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  date: undefined,
  startHour: 9,
  endHour: 17,
  room: '',
  status: 'option',
});

export default function InquiriesPage() {
  const { inquiries, loading: inquiriesLoading, addInquiry, updateInquiry, deleteInquiry: deleteInquiryCtx, markAsRead } = useInquiriesContext();
  const { contacts } = useContactsContext();
  const { bookings, addBookings } = useBookings();
  const { tasks, addTask } = useTasksContext();
  const { companies } = useCompaniesContext();
  const [dragId, setDragId] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [selectedInquiry, setSelectedInquiry] = useState<Inquiry | null>(null);
  const [dateOptions, setDateOptions] = useState<DateOption[]>([]);
  const [recurrence, setRecurrence] = useState('none');
  const [repeatCount, setRepeatCount] = useState('4');
  const [newOpen, setNewOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');
  const [detailOpen, setDetailOpen] = useState(false);
  const [editInquiry, setEditInquiry] = useState<Inquiry | null>(null);
  const [newForm, setNewForm] = useState({ contactName: '', eventType: '', preferredDate: '', guestCount: '', budget: '', message: '', source: 'Handmatig', roomPreference: '', status: 'new' as Inquiry['status'] });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [bulkMoveTarget, setBulkMoveTarget] = useState<Inquiry['status'] | null>(null);
  const [noteDialogInquiry, setNoteDialogInquiry] = useState<Inquiry | null>(null);
  const [noteText, setNoteText] = useState('');
  const [taskDialogInquiry, setTaskDialogInquiry] = useState<Inquiry | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const { toast } = useToast();
  
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Count tasks per inquiry
  const taskCountByInquiry = useMemo(() => {
    const map: Record<string, number> = {};
    tasks.forEach(t => { if (t.inquiryId) map[t.inquiryId] = (map[t.inquiryId] || 0) + 1; });
    return map;
  }, [tasks]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === inquiries.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(inquiries.map((i) => i.id)));
    }
  };

  const handleBulkDelete = async () => {
    const count = selected.size;
    for (const id of selected) {
      await deleteInquiryCtx(id);
    }
    setSelected(new Set());
    setBulkDeleteConfirmOpen(false);
    toast({ title: `${count} aanvra${count === 1 ? 'ag' : 'gen'} verwijderd` });
  };

  const handleBulkMove = async (newStatus: Inquiry['status']) => {
    const count = selected.size;
    for (const id of selected) {
      const inq = inquiries.find((i) => i.id === id);
      if (inq) await updateInquiry({ ...inq, status: newStatus });
    }
    setSelected(new Set());
    setBulkMoveTarget(null);
    const col = PIPELINE_COLUMNS.find((c) => c.key === newStatus);
    toast({ title: `${count} aanvra${count === 1 ? 'ag' : 'gen'} verplaatst`, description: `Naar "${col?.label}"` });
  };


  useEffect(() => {
    const newInquiryParam = searchParams.get('newInquiry');
    if (newInquiryParam) {
      const params = new URLSearchParams(decodeURIComponent(newInquiryParam));
      addInquiry({
        contactId: params.get('contactId') || '',
        contactName: params.get('contactName') || '',
        eventType: params.get('eventType') || '',
        preferredDate: params.get('preferredDate') || '',
        roomPreference: params.get('roomPreference') || undefined,
        guestCount: Number(params.get('guestCount')) || 0,
        budget: Number(params.get('budget')) || undefined,
        message: params.get('message') || '',
        status: 'new',
        source: 'CRM',
      });
      toast({ title: '✅ Aanvraag ontvangen vanuit CRM', description: `${params.get('eventType')} — ${params.get('contactName')}` });
      setSearchParams({}, { replace: true });
    }
  }, []);

  const openDetailDialog = (inq: Inquiry) => {
    if (!inq.isRead) markAsRead(inq.id);
    navigate(`/inquiries/${inq.id}`);
  };

  const handleSaveEdit = async () => {
    if (!editInquiry) return;
    if (!editInquiry.contactName || !editInquiry.eventType) {
      toast({ title: 'Vul minimaal naam en type in', variant: 'destructive' });
      return;
    }
    await updateInquiry(editInquiry);
    setDetailOpen(false);
    toast({ title: 'Aanvraag bijgewerkt' });
  };

  const handleDeleteInquiry = async () => {
    if (!editInquiry) return;
    await deleteInquiryCtx(editInquiry.id);
    setDetailOpen(false);
    toast({ title: 'Aanvraag verwijderd', description: editInquiry.eventType });
  };

  const handleAddInquiry = async () => {
    if (!newForm.contactName || !newForm.eventType) {
      toast({ title: 'Vul minimaal naam en type in', variant: 'destructive' });
      return;
    }
    await addInquiry({
      contactId: '',
      contactName: newForm.contactName,
      eventType: newForm.eventType,
      preferredDate: newForm.preferredDate,
      roomPreference: newForm.roomPreference || undefined,
      guestCount: Number(newForm.guestCount) || 0,
      budget: Number(newForm.budget) || undefined,
      message: newForm.message,
      status: newForm.status,
      source: newForm.source || 'Handmatig',
    });
    setNewOpen(false);
    setNewForm({ contactName: '', eventType: '', preferredDate: '', guestCount: '', budget: '', message: '', source: 'Handmatig', roomPreference: '', status: 'new' });
    toast({ title: 'Aanvraag aangemaakt' });
  };

  const handleDragStart = useCallback((e: DragEvent, id: string) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(async (e: DragEvent, newStatus: Inquiry['status']) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (!id) return;
    const inq = inquiries.find((i) => i.id === id);
    if (inq) {
      if (!inq.isRead) markAsRead(inq.id);
      await updateInquiry({ ...inq, status: newStatus });
    }
    setDragId(null);
    const col = PIPELINE_COLUMNS.find((c) => c.key === newStatus);
    toast({ title: 'Status gewijzigd', description: `Verplaatst naar "${col?.label}"` });
  }, [toast, inquiries, updateInquiry]);

  const openScheduleDialog = (inq: Inquiry) => {
    setSelectedInquiry(inq);
    setDateOptions([createDateOption()]);
    setRecurrence('none');
    setRepeatCount('4');
    setScheduleOpen(true);
  };

  const addDateOption = () => {
    if (dateOptions.length >= 3) return;
    setDateOptions((prev) => [...prev, createDateOption()]);
  };

  const removeDateOption = (id: string) => {
    if (dateOptions.length <= 1) return;
    setDateOptions((prev) => prev.filter((o) => o.id !== id));
  };

  const updateDateOption = (id: string, updates: Partial<DateOption>) => {
    setDateOptions((prev) => prev.map((o) => o.id === id ? { ...o, ...updates } : o));
  };

  const handleSchedule = async () => {
    if (!selectedInquiry) return;
    const validOptions = dateOptions.filter((o) => o.date && o.room);
    if (validOptions.length === 0) {
      toast({ title: 'Selecteer minimaal één datum en ruimte', variant: 'destructive' });
      return;
    }

    // Create actual bookings from date options
    const newBookings: Omit<Booking, 'id'>[] = [];
    const recCount = recurrence !== 'none' ? Number(repeatCount) || 1 : 1;

    for (const opt of validOptions) {
      if (!opt.date || !opt.room) continue;

      for (let i = 0; i < recCount; i++) {
        const bookingDate = new Date(opt.date);
        if (recurrence === 'weekly') bookingDate.setDate(bookingDate.getDate() + i * 7);
        else if (recurrence === 'biweekly') bookingDate.setDate(bookingDate.getDate() + i * 14);
        else if (recurrence === 'monthly') bookingDate.setMonth(bookingDate.getMonth() + i);
        else if (recurrence === 'quarterly') bookingDate.setMonth(bookingDate.getMonth() + i * 3);

        newBookings.push({
          roomName: opt.room as RoomName,
          date: bookingDate.toISOString().split('T')[0],
          startHour: opt.startHour,
          startMinute: 0,
          endHour: opt.endHour,
          endMinute: 0,
          title: selectedInquiry.eventType,
          contactName: selectedInquiry.contactName,
          status: opt.status,
        });
      }
    }

    addBookings(newBookings);

    // Update inquiry status based on booking status
    if (selectedInquiry) {
      const hasConfirmed = validOptions.some(o => o.status === 'confirmed');
      const newStatus: Inquiry['status'] = hasConfirmed ? 'reserved' : 'option';
      await updateInquiry({ ...selectedInquiry, status: newStatus });
    }

    const descriptions = validOptions.map((o) => {
      const dateStr = o.date ? format(o.date, 'd MMM', { locale: nl }) : '';
      return `${dateStr} · ${o.room}`;
    });
    toast({
      title: `✅ ${newBookings.length} boeking(en) aangemaakt`,
      description: descriptions.join(' | '),
    });
    setScheduleOpen(false);

    // Navigate to calendar with the first booked date
    const firstDate = validOptions[0]?.date;
    if (firstDate) {
      navigate(`/calendar?date=${firstDate.toISOString().split('T')[0]}`);
    }
  };

  return (
    <div className="p-6 lg:p-8 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Aanvragen Pipeline</h1>
          <p className="text-sm text-muted-foreground">{inquiries.length} aanvragen · Sleep kaarten om de status te wijzigen</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setViewMode('cards')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
                viewMode === 'cards' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'
              )}
            >
              <LayoutGrid size={14} /> Cards
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
                viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'
              )}
            >
              <List size={14} /> Lijst
            </button>
          </div>
          <Button onClick={() => setNewOpen(true)} size="sm"><Plus size={14} className="mr-1" /> Nieuwe Aanvraag</Button>
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border bg-card p-3 card-shadow">
          <span className="text-sm font-medium text-foreground">{selected.size} geselecteerd</span>
          <div className="flex items-center gap-2 ml-auto">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <ArrowRight size={14} className="mr-1" /> Verplaatsen
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2" align="end">
                <div className="space-y-0.5">
                  {PIPELINE_COLUMNS.map((col) => (
                    <button
                      key={col.key}
                      onClick={() => setBulkMoveTarget(col.key)}
                      className="w-full rounded-md px-3 py-1.5 text-left text-sm hover:bg-muted transition-colors"
                    >
                      {col.label}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <Button variant="destructive" size="sm" onClick={() => setBulkDeleteConfirmOpen(true)}>
              <Trash2 size={14} className="mr-1" /> Verwijderen
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              <X size={14} />
            </Button>
          </div>
        </div>
      )}

      {viewMode === 'cards' ? (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {PIPELINE_COLUMNS.map((col) => {
          const items = inquiries.filter((inq) => inq.status === col.key);
          return (
            <div
              key={col.key}
              className={`min-w-[260px] flex-1 rounded-xl border border-t-4 ${col.colorClass} p-3 transition-colors`}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, col.key)}
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">{col.label}</h3>
                <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map((inq) => {
                  const relatedBookings = bookings.filter(b => b.contactName === inq.contactName && b.title === inq.eventType);
                  const firstBooking = relatedBookings.length > 0 ? relatedBookings[0] : null;
                  const inquiryTaskCount = taskCountByInquiry[inq.id] || 0;
                  const hasMessage = inq.message && inq.message.trim().length > 0;

                  return (
                  <div
                    key={inq.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, inq.id)}
                    onClick={() => openDetailDialog(inq)}
                    className={`relative cursor-pointer rounded-lg border bg-card p-3 card-shadow hover:card-shadow-hover transition-all active:cursor-grabbing ${dragId === inq.id ? 'opacity-50 scale-95' : ''} ${selected.has(inq.id) ? 'ring-2 ring-primary' : ''} ${!inq.isRead ? 'border-l-4 border-l-destructive' : ''}`}
                  >
                    {!inq.isRead && (
                      <span className="absolute -top-2 -right-2 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold px-1.5 py-0.5 shadow-sm z-10">
                        New
                      </span>
                    )}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 flex-1 min-w-0">
                        <Checkbox
                          checked={selected.has(inq.id)}
                          onCheckedChange={() => toggleSelect(inq.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-card-foreground truncate">{inq.eventType}</p>
                          <button
                            className="text-xs text-muted-foreground hover:text-primary transition-colors text-left truncate block w-full"
                            onClick={(e) => { e.stopPropagation(); if (inq.contactId) navigate(`/crm/${inq.contactId}`); else openDetailDialog(inq); }}
                          >
                            {inq.contactName}
                          </button>
                        </div>
                      </div>
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                        {inq.contactName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                    </div>

                    <div className="mt-2.5 space-y-1 text-xs">
                      {(() => { const contact = inq.contactId ? contacts.find(c => c.id === inq.contactId) : null; const company = contact?.companyId ? companies.find(co => co.id === contact.companyId) : null; return contact?.company ? (
                        <div className="flex gap-2"><span className="text-muted-foreground w-[100px] shrink-0">Bedrijfsnaam:</span>{company ? (
                          <button className="text-card-foreground font-medium truncate hover:text-primary transition-colors text-left" onClick={(e) => { e.stopPropagation(); navigate(`/companies/${company.id}`); }}>{contact.company}</button>
                        ) : (<span className="text-card-foreground font-medium truncate">{contact.company}</span>)}</div>
                      ) : null; })()}
                      {inq.source && inq.source !== 'Handmatig' && inq.source !== 'CRM' && <div className="flex gap-2"><span className="text-muted-foreground w-[100px] shrink-0">Bron gelegenheid:</span><span className="text-card-foreground truncate">{inq.source === 'GHL' ? 'VirtuGrow' : inq.source}</span></div>}
                      {inq.roomPreference && <div className="flex gap-2"><span className="text-muted-foreground w-[100px] shrink-0">Ruimte:</span><span className="text-card-foreground truncate">{inq.roomPreference}</span></div>}
                      {inq.preferredDate && <div className="flex gap-2"><span className="text-muted-foreground w-[100px] shrink-0">Datum:</span><span className="text-card-foreground">{inq.preferredDate}</span></div>}
                      <div className="flex gap-2"><span className="text-muted-foreground w-[100px] shrink-0">Personen:</span><span className="text-card-foreground">{inq.guestCount}</span></div>
                      <div className="flex gap-2"><span className="text-muted-foreground w-[100px] shrink-0">Waarde:</span><span className="text-card-foreground">€{(inq.budget || 0).toLocaleString('nl-NL', { minimumFractionDigits: 2 })}</span></div>
                      
                      {firstBooking && (
                        <>
                          <div className="flex gap-2">
                            <span className="text-muted-foreground w-[100px] shrink-0">Ingepland:</span>
                            <span className="text-card-foreground">
                              {format(new Date(firstBooking.date), 'd MMM yyyy', { locale: nl })} · {String(firstBooking.startHour).padStart(2, '0')}:{String(firstBooking.startMinute).padStart(2, '0')} - {String(firstBooking.endHour).padStart(2, '0')}:{String(firstBooking.endMinute).padStart(2, '0')}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-muted-foreground w-[100px] shrink-0">Zaal:</span>
                            <span className="text-card-foreground truncate">{firstBooking.roomName}</span>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Icon row + Inplannen */}
                    <div className="mt-3 flex items-center justify-between border-t pt-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate('/conversations'); }}
                          className="relative p-1 rounded hover:bg-muted transition-colors"
                          title="Gesprekken"
                        >
                          <MessageSquare size={13} className="text-muted-foreground" />
                          {hasMessage && (
                            <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-success text-[8px] font-bold text-primary-foreground flex items-center justify-center">1</span>
                          )}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setNoteDialogInquiry(inq); setNoteText(''); }}
                          className="p-1 rounded hover:bg-muted transition-colors"
                          title="Notitie toevoegen"
                        >
                          <StickyNote size={13} className="text-muted-foreground" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setTaskDialogInquiry(inq); setTaskTitle(''); }}
                          className="relative p-1 rounded hover:bg-muted transition-colors"
                          title="Taak toevoegen"
                        >
                          <CheckSquare size={13} className="text-muted-foreground" />
                          {inquiryTaskCount > 0 && (
                            <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-info text-[8px] font-bold text-primary-foreground flex items-center justify-center">{inquiryTaskCount}</span>
                          )}
                        </button>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[10px]"
                        onClick={(e) => { e.stopPropagation(); openScheduleDialog(inq); }}
                      >
                        <CalendarIcon size={10} className="mr-1" /> Inplannen
                      </Button>
                    </div>
                  </div>
                  );
                })}
                {items.length === 0 && (
                  <div className="rounded-lg border-2 border-dashed border-border/50 p-4 text-center text-xs text-muted-foreground/50">
                    Sleep een aanvraag hierheen
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      ) : (
      /* List view */
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-2.5 w-10">
                <Checkbox
                  checked={inquiries.length > 0 && selected.size === inquiries.length}
                  onCheckedChange={toggleSelectAll}
                />
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground w-[110px]">ID</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Type</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Contact</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground hidden md:table-cell">Datum</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground hidden md:table-cell">Gasten</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground hidden lg:table-cell">Budget</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground hidden lg:table-cell">Bron</th>
              <th className="px-4 py-2.5 text-right font-medium text-muted-foreground"></th>
            </tr>
          </thead>
          <tbody>
            {inquiries.map((inq) => {
              const col = PIPELINE_COLUMNS.find((c) => c.key === inq.status);
              return (
                <tr key={inq.id} onClick={() => openDetailDialog(inq)} className={cn("border-b border-border last:border-0 hover:bg-muted/20 transition-colors cursor-pointer", selected.has(inq.id) && "bg-primary/5")}>
                  <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={selected.has(inq.id)} onCheckedChange={() => toggleSelect(inq.id)} />
                  </td>
                  <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">{inq.displayNumber || '—'}</td>
                  <td className="px-4 py-2.5 font-medium text-card-foreground">
                    <span className="flex items-center gap-1.5">
                      {inq.eventType}
                      {!inq.isRead && <span className="rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold px-1.5 py-0.5">New</span>}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      className="text-primary hover:underline text-left"
                      onClick={(e) => { e.stopPropagation(); if (inq.contactId) navigate(`/crm/${inq.contactId}`); else openDetailDialog(inq); }}
                    >
                      {inq.contactName}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground hidden md:table-cell">{inq.preferredDate || '—'}</td>
                  <td className="px-4 py-2.5 text-muted-foreground hidden md:table-cell">{inq.guestCount}</td>
                  <td className="px-4 py-2.5 text-muted-foreground hidden lg:table-cell">{inq.budget ? `€${inq.budget.toLocaleString('nl-NL')}` : '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className={cn('inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold', col?.badgeClass)}>{col?.label}</span>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground hidden lg:table-cell">{inq.source === 'GHL' ? 'VirtuGrow' : inq.source}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={(e) => { e.stopPropagation(); openScheduleDialog(inq); }}
                    >
                      <CalendarIcon size={12} className="mr-1" /> Inplannen
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {inquiries.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">Geen aanvragen gevonden</div>
        )}
      </div>
      )}

      {/* Schedule Dialog */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Aanvraag Inplannen</DialogTitle>
          </DialogHeader>
          {selectedInquiry && (
            <div className="space-y-4 py-2">
              {/* Inquiry summary */}
              <div className="rounded-lg border p-3 text-sm">
                <p className="font-medium">{selectedInquiry.eventType}</p>
                <p className="text-xs text-muted-foreground">{selectedInquiry.contactName} · {selectedInquiry.guestCount} gasten</p>
              </div>

              {/* Date options */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Datum opties</Label>
                  {dateOptions.length < 3 && (
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addDateOption}>
                      <Plus size={12} className="mr-1" /> Datum toevoegen
                    </Button>
                  )}
                </div>

                {dateOptions.map((opt, idx) => (
                  <div key={opt.id} className="rounded-lg border p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">Optie {idx + 1}</span>
                      {dateOptions.length > 1 && (
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeDateOption(opt.id)}>
                          <X size={12} />
                        </Button>
                      )}
                    </div>

                    {/* Date picker */}
                    <div className="grid gap-1.5">
                      <Label className="text-xs">Datum</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn("w-full justify-start text-left font-normal text-sm", !opt.date && "text-muted-foreground")}
                          >
                            <CalendarIcon size={14} className="mr-2" />
                            {opt.date ? format(opt.date, 'd MMMM yyyy', { locale: nl }) : 'Kies datum'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={opt.date}
                            onSelect={(d) => updateDateOption(opt.id, { date: d })}
                            initialFocus
                            className={cn("p-3 pointer-events-auto")}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    {/* Room */}
                    <div className="grid gap-1.5">
                      <Label className="text-xs">Ruimte</Label>
                      <Select value={opt.room} onValueChange={(v) => updateDateOption(opt.id, { room: v as RoomName })}>
                        <SelectTrigger className="text-sm"><SelectValue placeholder="Selecteer ruimte" /></SelectTrigger>
                        <SelectContent>
                          {ROOMS.map((room) => (
                            <SelectItem key={room} value={room}>{room}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Times */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Van</Label>
                        <Select value={String(opt.startHour)} onValueChange={(v) => updateDateOption(opt.id, { startHour: Number(v) })}>
                          <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>{HOURS.map((h) => <SelectItem key={h} value={String(h)}>{hourLabel(h)}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Tot</Label>
                        <Select value={String(opt.endHour)} onValueChange={(v) => updateDateOption(opt.id, { endHour: Number(v) })}>
                          <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>{HOURS.filter((h) => h > opt.startHour).map((h) => <SelectItem key={h} value={String(h)}>{hourLabel(h)}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Status */}
                    <div className="grid gap-1.5">
                      <Label className="text-xs">Boekingsstatus</Label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => updateDateOption(opt.id, { status: 'option' })}
                          className={cn(
                            'flex-1 rounded-lg border-2 px-3 py-2 text-xs font-semibold transition-all',
                            opt.status === 'option'
                              ? 'border-warning bg-warning/15 text-warning'
                              : 'border-border bg-card text-muted-foreground hover:border-warning/50'
                          )}
                        >
                          ○ In Optie
                        </button>
                        <button
                          type="button"
                          onClick={() => updateDateOption(opt.id, { status: 'confirmed' })}
                          className={cn(
                            'flex-1 rounded-lg border-2 px-3 py-2 text-xs font-semibold transition-all',
                            opt.status === 'confirmed'
                              ? 'border-success bg-success/15 text-success'
                              : 'border-border bg-card text-muted-foreground hover:border-success/50'
                          )}
                        >
                          ✓ Bevestigd
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Recurrence */}
              <div className="grid gap-1.5">
                <Label className="flex items-center gap-1.5"><Repeat size={12} /> Herhaling</Label>
                <Select value={recurrence} onValueChange={setRecurrence}>
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RECURRENCE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {recurrence !== 'none' && (
                <div className="grid gap-1.5">
                  <Label className="text-xs">Aantal herhalingen</Label>
                  <Input type="number" min="1" max="52" value={repeatCount} onChange={(e) => setRepeatCount(e.target.value)} className="text-sm" />
                  <p className="text-xs text-muted-foreground">
                    Elke datum-optie wordt {repeatCount}x herhaald
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleOpen(false)}>Annuleren</Button>
            <Button onClick={handleSchedule}>Inplannen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Inquiry Dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nieuwe Aanvraag</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label>Contactpersoon *</Label>
              <Input placeholder="Naam" value={newForm.contactName} onChange={(e) => setNewForm({ ...newForm, contactName: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Type evenement *</Label>
              <Input placeholder="Bijv. Vergadering, Bruiloft, Workshop" value={newForm.eventType} onChange={(e) => setNewForm({ ...newForm, eventType: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Voorkeursdatum</Label>
                <Input type="date" value={newForm.preferredDate} onChange={(e) => setNewForm({ ...newForm, preferredDate: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Aantal gasten</Label>
                <Input type="number" min="1" placeholder="0" value={newForm.guestCount} onChange={(e) => setNewForm({ ...newForm, guestCount: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Ruimte voorkeur</Label>
                <Select value={newForm.roomPreference} onValueChange={(v) => setNewForm({ ...newForm, roomPreference: v })}>
                  <SelectTrigger className="text-sm"><SelectValue placeholder="Optioneel" /></SelectTrigger>
                  <SelectContent>
                    {ROOMS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Budget (€)</Label>
                <Input type="number" min="0" placeholder="0" value={newForm.budget} onChange={(e) => setNewForm({ ...newForm, budget: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Bron</Label>
              <Select value={newForm.source} onValueChange={(v) => setNewForm({ ...newForm, source: v })}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Handmatig">Handmatig</SelectItem>
                  <SelectItem value="Website">Website</SelectItem>
                  <SelectItem value="Telefoon">Telefoon</SelectItem>
                  <SelectItem value="Email">Email</SelectItem>
                  <SelectItem value="GHL">VirtuGrow</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Stadium</Label>
              <Select value={newForm.status} onValueChange={(v: Inquiry['status']) => setNewForm({ ...newForm, status: v })}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PIPELINE_COLUMNS.map((col) => (
                    <SelectItem key={col.key} value={col.key}>{col.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Bericht / Notities</Label>
              <Textarea placeholder="Omschrijving van de aanvraag..." value={newForm.message} onChange={(e) => setNewForm({ ...newForm, message: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>Annuleren</Button>
            <Button onClick={handleAddInquiry}>Toevoegen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail / Edit Dialog - Comprehensive Inquiry Card */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText size={18} className="text-primary" />
              Aanvraag{editInquiry?.displayNumber ? ` ${editInquiry.displayNumber}` : ''}
            </DialogTitle>
          </DialogHeader>
          {editInquiry && (() => {
            const contact = editInquiry.contactId ? contacts.find(c => c.id === editInquiry.contactId) : null;
            const company = contact?.companyId ? companies.find(co => co.id === contact.companyId) : null;
            const contactInquiries = editInquiry.contactId ? inquiries.filter(i => i.contactId === editInquiry.contactId) : [];
            const contactBookings = editInquiry.contactId ? bookings.filter(b => b.contactId === editInquiry.contactId) : [];
            const companyContacts = company ? contacts.filter(c => c.companyId === company.id) : [];
            const companyContactIds = companyContacts.map(c => c.id);
            const companyInquiries = company ? inquiries.filter(i => i.contactId && companyContactIds.includes(i.contactId)) : [];
            const companyBookings = company ? bookings.filter(b => b.contactId && companyContactIds.includes(b.contactId)) : [];
            const relatedBookings = bookings.filter(b => b.contactName === editInquiry.contactName && b.title === editInquiry.eventType);
            const inquiryTasks = tasks.filter(t => t.inquiryId === editInquiry.id);
            const col = PIPELINE_COLUMNS.find(c => c.key === editInquiry.status);

            return (
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="w-full mb-4">
                <TabsTrigger value="overview" className="flex-1 gap-1.5"><Eye size={14} /> Overzicht</TabsTrigger>
                <TabsTrigger value="edit" className="flex-1 gap-1.5"><Pencil size={14} /> Bewerken</TabsTrigger>
              </TabsList>

              {/* OVERVIEW TAB */}
              <TabsContent value="overview" className="space-y-4">
                {/* Header with status */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary text-lg font-bold shrink-0">
                      {editInquiry.contactName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">{editInquiry.eventType}</h3>
                      <button
                        onClick={() => { setDetailOpen(false); if (editInquiry.contactId) navigate(`/crm/${editInquiry.contactId}`); }}
                        className="text-sm text-primary hover:underline"
                      >
                        {editInquiry.contactName}
                      </button>
                    </div>
                  </div>
                  <span className={cn('rounded-full px-3 py-1 text-xs font-semibold', col?.badgeClass)}>{col?.label}</span>
                </div>

                {/* Aanvraag details grid */}
                <div className="rounded-lg border bg-muted/20 p-4">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Aanvraaggegevens</h4>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Type:</span><span className="font-medium text-foreground">{editInquiry.eventType}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Status:</span><span className="font-medium text-foreground">{col?.label}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Voorkeursdatum:</span><span className="font-medium text-foreground">{editInquiry.preferredDate || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Aantal gasten:</span><span className="font-medium text-foreground">{editInquiry.guestCount}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Ruimte:</span><span className="font-medium text-foreground">{editInquiry.roomPreference || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Budget:</span><span className="font-medium text-foreground">{editInquiry.budget ? `€${editInquiry.budget.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}` : '—'}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Bron:</span><span className="font-medium text-foreground">{editInquiry.source === 'GHL' ? 'VirtuGrow' : editInquiry.source}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Aangemaakt:</span><span className="font-medium text-foreground">{editInquiry.createdAt}</span></div>
                  </div>
                </div>

                {/* Notities */}
                {editInquiry.message && (
                  <div className="rounded-lg border bg-muted/20 p-4">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Notities</h4>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{editInquiry.message}</p>
                  </div>
                )}

                {/* Ingeplande reserveringen */}
                {relatedBookings.length > 0 && (
                  <div className="rounded-lg border bg-muted/20 p-4">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Ingeplande Reserveringen ({relatedBookings.length})</h4>
                    <div className="space-y-1.5">
                      {relatedBookings.slice(0, 5).map(b => (
                        <div key={b.id} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <CalendarIcon size={13} className="text-muted-foreground" />
                            <span className="text-foreground">{format(new Date(b.date), 'd MMM yyyy', { locale: nl })}</span>
                            <span className="text-muted-foreground">{String(b.startHour).padStart(2, '0')}:{String(b.startMinute).padStart(2, '0')} - {String(b.endHour).padStart(2, '0')}:{String(b.endMinute).padStart(2, '0')}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{b.roomName}</span>
                            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', b.status === 'option' ? 'bg-warning/15 text-warning' : 'bg-success/15 text-success')}>
                              {b.status === 'option' ? 'Optie' : 'Bevestigd'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Taken */}
                {inquiryTasks.length > 0 && (
                  <div className="rounded-lg border bg-muted/20 p-4">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Taken ({inquiryTasks.length})</h4>
                    <div className="space-y-1">
                      {inquiryTasks.map(t => (
                        <div key={t.id} className="flex items-center gap-2 text-sm">
                          <CheckSquare size={13} className={t.status === 'completed' ? 'text-success' : 'text-muted-foreground'} />
                          <span className={t.status === 'completed' ? 'line-through text-muted-foreground' : 'text-foreground'}>{t.title}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Contact & Bedrijf context */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Contact tile */}
                  {contact && (
                    <button
                      onClick={() => { setDetailOpen(false); navigate(`/crm/${contact.id}`); }}
                      className="rounded-lg border bg-muted/20 p-4 text-left hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Users size={14} className="text-primary" />
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contactpersoon</h4>
                      </div>
                      <p className="text-sm font-medium text-foreground">{contact.firstName} {contact.lastName}</p>
                      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><FileText size={11} /> {contactInquiries.length} aanvragen</span>
                        <span className="flex items-center gap-1"><CalendarIcon size={11} /> {contactBookings.length} reserveringen</span>
                      </div>
                      <p className="text-xs text-primary mt-1">Bekijk klantkaart →</p>
                    </button>
                  )}

                  {/* Company tile */}
                  {company && (
                    <button
                      onClick={() => { setDetailOpen(false); navigate(`/companies/${company.id}`); }}
                      className="rounded-lg border bg-muted/20 p-4 text-left hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Building2 size={14} className="text-primary" />
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Bedrijf</h4>
                      </div>
                      <p className="text-sm font-medium text-foreground">{company.name}</p>
                      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Users size={11} /> {companyContacts.length} contacten</span>
                        <span className="flex items-center gap-1"><FileText size={11} /> {companyInquiries.length} aanvragen</span>
                        <span className="flex items-center gap-1"><CalendarIcon size={11} /> {companyBookings.length} reserveringen</span>
                      </div>
                      <p className="text-xs text-primary mt-1">Bekijk bedrijf →</p>
                    </button>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex items-center justify-between pt-2 border-t">
                  <Button variant="destructive" size="sm" onClick={handleDeleteInquiry}>
                    <Trash2 size={14} className="mr-1" /> Verwijderen
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={(e) => { openScheduleDialog(editInquiry); setDetailOpen(false); }}>
                      <CalendarIcon size={14} className="mr-1" /> Inplannen
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setDetailOpen(false)}>Sluiten</Button>
                  </div>
                </div>
              </TabsContent>

              {/* EDIT TAB */}
              <TabsContent value="edit" className="space-y-4">
                {editInquiry.contactId && (
                  <button
                    onClick={() => { setDetailOpen(false); navigate(`/crm/${editInquiry.contactId}`); }}
                    className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3 text-left hover:bg-muted/50 transition-colors w-full"
                  >
                    <Users size={16} className="text-primary shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{editInquiry.contactName}</p>
                      <p className="text-xs text-primary">Bekijk klantkaart →</p>
                    </div>
                  </button>
                )}
                <div className="grid gap-1.5">
                  <Label>Contactpersoon *</Label>
                  <Input value={editInquiry.contactName} onChange={(e) => setEditInquiry({ ...editInquiry, contactName: e.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Type evenement *</Label>
                  <Input value={editInquiry.eventType} onChange={(e) => setEditInquiry({ ...editInquiry, eventType: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label>Voorkeursdatum</Label>
                    <Input type="date" value={editInquiry.preferredDate || ''} onChange={(e) => setEditInquiry({ ...editInquiry, preferredDate: e.target.value })} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Aantal gasten</Label>
                    <Input type="number" min="1" value={editInquiry.guestCount} onChange={(e) => setEditInquiry({ ...editInquiry, guestCount: Number(e.target.value) || 0 })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label>Ruimte voorkeur</Label>
                    <Select value={editInquiry.roomPreference || ''} onValueChange={(v) => setEditInquiry({ ...editInquiry, roomPreference: v || undefined })}>
                      <SelectTrigger className="text-sm"><SelectValue placeholder="Optioneel" /></SelectTrigger>
                      <SelectContent>
                        {ROOMS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Budget (€)</Label>
                    <Input type="number" min="0" value={editInquiry.budget || ''} onChange={(e) => setEditInquiry({ ...editInquiry, budget: Number(e.target.value) || undefined })} />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label>Status</Label>
                  <Select value={editInquiry.status} onValueChange={(v: Inquiry['status']) => setEditInquiry({ ...editInquiry, status: v })}>
                    <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PIPELINE_COLUMNS.map((col) => (
                        <SelectItem key={col.key} value={col.key}>{col.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Bron</Label>
                  <Select value={editInquiry.source} onValueChange={(v) => setEditInquiry({ ...editInquiry, source: v })}>
                    <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Handmatig">Handmatig</SelectItem>
                      <SelectItem value="Website">Website</SelectItem>
                      <SelectItem value="Telefoon">Telefoon</SelectItem>
                      <SelectItem value="Email">Email</SelectItem>
                      <SelectItem value="GHL">VirtuGrow</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Bericht / Notities</Label>
                  <Textarea value={editInquiry.message || ''} onChange={(e) => setEditInquiry({ ...editInquiry, message: e.target.value })} />
                </div>
                <DialogFooter className="flex !justify-between">
                  <Button variant="destructive" size="sm" onClick={handleDeleteInquiry}>
                    <Trash2 size={14} className="mr-1" /> Verwijderen
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setDetailOpen(false)}>Annuleren</Button>
                    <Button onClick={handleSaveEdit}>Opslaan</Button>
                  </div>
                </DialogFooter>
              </TabsContent>
            </Tabs>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirm */}
      <AlertDialog open={bulkDeleteConfirmOpen} onOpenChange={setBulkDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Weet je het zeker?</AlertDialogTitle>
            <AlertDialogDescription>
              Je staat op het punt om {selected.size} aanvra{selected.size !== 1 ? 'gen' : 'ag'} te verwijderen. Deze actie kan niet ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleBulkDelete}>
              Verwijderen ({selected.size})
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Move Confirm */}
      <AlertDialog open={!!bulkMoveTarget} onOpenChange={(open) => { if (!open) setBulkMoveTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Verplaatsen bevestigen</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je {selected.size} aanvra{selected.size !== 1 ? 'gen' : 'ag'} wilt verplaatsen naar "{PIPELINE_COLUMNS.find(c => c.key === bulkMoveTarget)?.label}"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={() => bulkMoveTarget && handleBulkMove(bulkMoveTarget)}>Bevestigen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Note Dialog */}
      <Dialog open={!!noteDialogInquiry} onOpenChange={(open) => { if (!open) setNoteDialogInquiry(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Notitie toevoegen</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{noteDialogInquiry?.eventType} — {noteDialogInquiry?.contactName}</p>
          <Textarea
            placeholder="Schrijf een notitie..."
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            className="min-h-[100px]"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteDialogInquiry(null)}>Annuleren</Button>
            <Button onClick={async () => {
              if (!noteDialogInquiry || !noteText.trim()) return;
              const currentMsg = noteDialogInquiry.message || '';
              const timestamp = format(new Date(), 'd MMM yyyy HH:mm', { locale: nl });
              const newMessage = currentMsg ? `${currentMsg}\n\n[${timestamp}] ${noteText.trim()}` : `[${timestamp}] ${noteText.trim()}`;
              await updateInquiry({ ...noteDialogInquiry, message: newMessage });
              toast({ title: 'Notitie toegevoegd' });
              setNoteDialogInquiry(null);
            }}>Opslaan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Task Dialog */}
      <Dialog open={!!taskDialogInquiry} onOpenChange={(open) => { if (!open) setTaskDialogInquiry(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Taak toevoegen</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{taskDialogInquiry?.eventType} — {taskDialogInquiry?.contactName}</p>
          <Input
            placeholder="Taakomschrijving..."
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setTaskDialogInquiry(null)}>Annuleren</Button>
            <Button onClick={async () => {
              if (!taskDialogInquiry || !taskTitle.trim()) return;
              await addTask({
                title: taskTitle.trim(),
                status: 'open',
                priority: 'normal',
                inquiryId: taskDialogInquiry.id,
                contactId: taskDialogInquiry.contactId || undefined,
              });
              toast({ title: 'Taak aangemaakt' });
              setTaskDialogInquiry(null);
            }}>Opslaan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
