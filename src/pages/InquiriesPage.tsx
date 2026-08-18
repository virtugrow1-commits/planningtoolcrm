import { formatDate } from '@/lib/formatters';
import { useState, useCallback, useEffect, useMemo, useRef, DragEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Inquiry, Booking, ROOMS, RoomName } from '@/types/crm';
import { Calendar as CalendarIcon, Users, Euro, GripVertical, Repeat, Plus, X, Check, LayoutGrid, List, Trash2, ArrowRight, AlertTriangle, Download, MapPin, MessageSquare, StickyNote, CheckSquare, Clock, Building2, FileText, Pencil, Eye, Search, ArrowUpDown, ArrowUp, ArrowDown, EyeOff, Archive, ChevronDown, ChevronRight as ChevronRightIcon, FolderX, FolderCheck } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { useRoomSettings } from '@/hooks/useRoomSettings';
import { useBookings } from '@/contexts/BookingsContext';
import { useInquiriesContext } from '@/contexts/InquiriesContext';
import { useContactsContext } from '@/contexts/ContactsContext';
import { useTasksContext } from '@/contexts/TasksContext';
import { useCompaniesContext } from '@/contexts/CompaniesContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import TeamMemberMultiSelect from '@/components/TeamMemberMultiSelect';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import CrmCombobox, { ComboboxOption } from '@/components/CrmCombobox';
import NewInquiryDialog from '@/components/inquiry/NewInquiryDialog';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import ConflictAlertDialog from '@/components/calendar/ConflictAlertDialog';
import { exportToCSV } from '@/lib/csvExport';
import { SortableHeader, useSortState } from '@/components/SortableHeader';

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
  { key: 'converted', label: 'Afgehandeld', colorClass: 'border-t-success bg-success/5', badgeClass: 'status-converted' },
  { key: 'after_sales', label: 'After Sales', colorClass: 'border-t-success bg-success/5', badgeClass: 'status-converted' },
  { key: 'condolence_reminder', label: 'Condoleance Herdenkingen', colorClass: 'border-t-warning bg-warning/5', badgeClass: 'status-contacted' },
];

// Statuses that are archived (shown as drop-zone columns only, no cards rendered inside)
const ARCHIVE_STATUSES = ['lost', 'converted'] as const;
// All columns shown in kanban — archive ones are drop-zones only
const PIPELINE_ACTIVE_COLUMNS = PIPELINE_COLUMNS;
const ARCHIVE_COLUMN_KEYS = ARCHIVE_STATUSES as readonly string[];

const RECURRENCE_OPTIONS = [
  { value: 'none', label: 'Eenmalig' },
  { value: 'weekly', label: 'Elke week' },
  { value: 'biweekly', label: 'Om de 2 weken' },
  { value: 'monthly', label: 'Elke maand' },
  { value: 'quarterly', label: 'Elk kwartaal' },
  { value: 'adrandom', label: 'Ad random (vrije datums)' },
];



interface DateOption {
  id: string;
  date: Date | undefined;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  room: RoomName | '';
  status: 'confirmed' | 'option';
}

const createDateOption = (): DateOption => ({
  id: `opt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  date: undefined,
  startHour: 9,
  startMinute: 0,
  endHour: 17,
  endMinute: 0,
  room: '',
  status: 'option',
});

export default function InquiriesPage() {
  const { inquiries, loading: inquiriesLoading, addInquiry, updateInquiry, deleteInquiry: deleteInquiryCtx, markAsRead } = useInquiriesContext();
  const { contacts } = useContactsContext();
  const { bookings, addBookings } = useBookings();
  const { tasks, addTask } = useTasksContext();
  const { companies } = useCompaniesContext();
  const { t, language } = useLanguage();
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
  
  
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [bulkMoveTarget, setBulkMoveTarget] = useState<Inquiry['status'] | null>(null);
  const [noteDialogInquiry, setNoteDialogInquiry] = useState<Inquiry | null>(null);
  const [noteText, setNoteText] = useState('');
  const [taskDialogInquiry, setTaskDialogInquiry] = useState<Inquiry | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskAssignedTo, setTaskAssignedTo] = useState<string[]>([]);
  const { toast } = useToast();
  const { getDisplayName } = useRoomSettings();
  const [conflictPopup, setConflictPopup] = useState<{ conflicts: Booking[] } | null>(null);
  const inquirySort = useSortState<Inquiry>();
  const [searchQuery, setSearchQuery] = useState('');
  const [kanbanSort, setKanbanSort] = useState<'booking-nearest' | 'date-asc' | 'date-desc' | 'alpha-asc' | 'alpha-desc' | 'created-desc' | 'created-asc'>('booking-nearest');
  const [hidePast, setHidePast] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [archivedSection, setArchivedSection] = useState<'verloren' | 'afgerond' | null>(null);
  const [expandedBookings, setExpandedBookings] = useState<Set<string>>(new Set());
  const archiveRef = useRef<HTMLDivElement>(null);
  const toggleBookings = (key: string) => setExpandedBookings(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  
  const navigate = useNavigate();
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [searchParams, setSearchParams] = useSearchParams();

  // Determine which inquiries have only past bookings (all bookings before today)
  const pastOnlyInquiryIds = useMemo(() => {
    const ids = new Set<string>();
    for (const inq of inquiries) {
      const related = bookings.filter(b =>
        (inq.contactId && b.contactId === inq.contactId && b.title === inq.eventType) ||
        (b.contactName === inq.contactName && b.title === inq.eventType)
      );
      // Has bookings and ALL are in the past
      if (related.length > 0 && related.every(b => b.date < todayStr)) {
        ids.add(inq.id);
      }
      // Also check preferredDate if no bookings
      if (related.length === 0 && inq.preferredDate && inq.preferredDate < todayStr) {
        ids.add(inq.id);
      }
    }
    return ids;
  }, [inquiries, bookings, todayStr]);

  // Active inquiries (excluding archive statuses) 
  const activeInquiries = useMemo(() => inquiries.filter(i => !ARCHIVE_STATUSES.includes(i.status as any)), [inquiries]);
  // Archived inquiries split by type
  const lostInquiries = useMemo(() => inquiries.filter(i => i.status === 'lost'), [inquiries]);
  const completedInquiries = useMemo(() => inquiries.filter(i => i.status === 'converted'), [inquiries]);

  // Filtered inquiries based on search + hidePast (only from active)
  const filteredInquiries = useMemo(() => {
    let result = activeInquiries;
    if (hidePast) {
      result = result.filter(inq => !pastOnlyInquiryIds.has(inq.id));
    }
    if (!searchQuery.trim()) return result;
    const q = searchQuery.toLowerCase();
    return result.filter(inq => {
      const contact = inq.contactId ? contacts.find(c => c.id === inq.contactId) : null;
      const company = contact?.companyId ? companies.find(co => co.id === contact.companyId) : null;
      return (
        inq.eventType.toLowerCase().includes(q) ||
        inq.contactName.toLowerCase().includes(q) ||
        (inq.displayNumber || '').toLowerCase().includes(q) ||
        (inq.roomPreference || '').toLowerCase().includes(q) ||
        (inq.source || '').toLowerCase().includes(q) ||
        (company?.name || '').toLowerCase().includes(q) ||
        (contact?.company || '').toLowerCase().includes(q) ||
        (inq.preferredDate || '').includes(q) ||
        (PIPELINE_COLUMNS.find(c => c.key === inq.status)?.label || '').toLowerCase().includes(q)
      );
    });
  }, [activeInquiries, searchQuery, contacts, companies, hidePast, pastOnlyInquiryIds]);

  // Map inquiry -> nearest upcoming booking date
  const nearestBookingByInquiry = useMemo(() => {
    const map: Record<string, string> = {};
    for (const inq of inquiries) {
      const related = bookings.filter(b =>
        (inq.contactId && b.contactId === inq.contactId && b.title === inq.eventType) ||
        (b.contactName === inq.contactName && b.title === inq.eventType)
      );
      // Find nearest upcoming, or fallback to nearest past
      const upcoming = related.filter(b => b.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date));
      const past = related.filter(b => b.date < todayStr).sort((a, b) => b.date.localeCompare(a.date));
      if (upcoming.length > 0) map[inq.id] = upcoming[0].date;
      else if (past.length > 0) map[inq.id] = past[0].date;
    }
    return map;
  }, [inquiries, bookings, todayStr]);

  // Sort function for kanban columns
  const sortKanbanItems = useCallback((items: Inquiry[]) => {
    return [...items].sort((a, b) => {
      switch (kanbanSort) {
        case 'booking-nearest': {
          const aDate = nearestBookingByInquiry[a.id] || '';
          const bDate = nearestBookingByInquiry[b.id] || '';
          // Items with bookings first, sorted by proximity to today
          if (!aDate && !bDate) return 0;
          if (!aDate) return 1;
          if (!bDate) return -1;
          const aDiff = Math.abs(new Date(aDate).getTime() - new Date(todayStr).getTime());
          const bDiff = Math.abs(new Date(bDate).getTime() - new Date(todayStr).getTime());
          return aDiff - bDiff;
        }
        case 'date-asc': return (a.preferredDate || '').localeCompare(b.preferredDate || '');
        case 'date-desc': return (b.preferredDate || '').localeCompare(a.preferredDate || '');
        case 'alpha-asc': return a.eventType.localeCompare(b.eventType);
        case 'alpha-desc': return b.eventType.localeCompare(a.eventType);
        case 'created-asc': return a.createdAt.localeCompare(b.createdAt);
        case 'created-desc': return b.createdAt.localeCompare(a.createdAt);
        default: return 0;
      }
    });
  }, [kanbanSort, nearestBookingByInquiry, todayStr]);
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
    if (selected.size === filteredInquiries.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredInquiries.map((i) => i.id)));
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

  const handleAddInquiry = async (inquiryData: Omit<Inquiry, 'id' | 'createdAt'>) => {
    await addInquiry(inquiryData);
  };

  const handleDragStart = useCallback((e: DragEvent, id: string) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragId(null);
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
    // adrandom: each date option is already a distinct manual choice — no multiplication
    const recCount = (recurrence !== 'none' && recurrence !== 'adrandom') ? Number(repeatCount) || 1 : 1;

    for (const opt of validOptions) {
      if (!opt.date || !opt.room) continue;

      for (let i = 0; i < recCount; i++) {
        const bookingDate = new Date(opt.date);
        if (recurrence === 'weekly') bookingDate.setDate(bookingDate.getDate() + i * 7);
        else if (recurrence === 'biweekly') bookingDate.setDate(bookingDate.getDate() + i * 14);
        else if (recurrence === 'monthly') bookingDate.setMonth(bookingDate.getMonth() + i);
        else if (recurrence === 'quarterly') bookingDate.setMonth(bookingDate.getMonth() + i * 3);

        // Use local date formatting to prevent timezone shift
        const dateStr = `${bookingDate.getFullYear()}-${String(bookingDate.getMonth() + 1).padStart(2, '0')}-${String(bookingDate.getDate()).padStart(2, '0')}`;

        newBookings.push({
          roomName: opt.room as RoomName,
          date: dateStr,
          startHour: opt.startHour,
          startMinute: opt.startMinute,
          endHour: opt.endHour,
          endMinute: opt.endMinute,
          title: selectedInquiry.eventType,
          contactName: selectedInquiry.contactName,
          contactId: selectedInquiry.contactId || undefined,
          companyId: selectedInquiry.companyId || undefined,
          status: opt.status,
        });
      }
    }

    const result = await addBookings(newBookings);
    if (!result.success) {
      if (result.conflicts) setConflictPopup({ conflicts: result.conflicts });
      return;
    }

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
          <p className="text-sm text-muted-foreground">{filteredInquiries.length} van {activeInquiries.length} actief · {lostInquiries.length} verloren · {completedInquiries.length} afgerond · Sleep om status te wijzigen</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setHidePast(!hidePast)}
              className={cn(
                'flex items-center gap-1.5 h-8 px-3 rounded-md border text-xs font-medium transition-colors',
                hidePast ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:text-foreground'
              )}
              title={hidePast ? 'Verlopen aanvragen zijn verborgen' : 'Verlopen aanvragen verbergen'}
            >
              <EyeOff size={12} />
              Verlopen
            </button>
            <button
              onClick={() => {
                const next = archivedSection === 'verloren' ? null : 'verloren';
                setArchivedSection(next);
                if (next) setTimeout(() => archiveRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
              }}
              className={cn(
                'flex items-center gap-1.5 h-8 px-3 rounded-md border text-xs font-medium transition-colors',
                archivedSection === 'verloren' ? 'bg-destructive/10 text-destructive border-destructive/30' : 'bg-background text-muted-foreground border-border hover:text-foreground'
              )}
            >
              <FolderX size={12} />
              Verloren ({lostInquiries.length})
            </button>
            <button
              onClick={() => {
                const next = archivedSection === 'afgerond' ? null : 'afgerond';
                setArchivedSection(next);
                if (next) setTimeout(() => archiveRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
              }}
              className={cn(
                'flex items-center gap-1.5 h-8 px-3 rounded-md border text-xs font-medium transition-colors',
                archivedSection === 'afgerond' ? 'bg-success/10 text-success border-success/30' : 'bg-background text-muted-foreground border-border hover:text-foreground'
              )}
            >
              <FolderCheck size={12} />
              Afgerond ({completedInquiries.length})
            </button>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Zoeken..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 w-[200px] text-xs"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X size={12} />
              </button>
            )}
          </div>
          {viewMode === 'cards' && (
            <Select value={kanbanSort} onValueChange={(v: any) => setKanbanSort(v)}>
              <SelectTrigger className="h-8 w-[160px] text-xs">
                <ArrowUpDown size={12} className="mr-1" />
                <SelectValue placeholder="Sorteren" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="booking-nearest" className="text-xs">Reservering dichtbij</SelectItem>
                <SelectItem value="created-desc" className="text-xs">Nieuwste eerst</SelectItem>
                <SelectItem value="created-asc" className="text-xs">Oudste eerst</SelectItem>
                <SelectItem value="date-asc" className="text-xs">Datum ↑</SelectItem>
                <SelectItem value="date-desc" className="text-xs">Datum ↓</SelectItem>
                <SelectItem value="alpha-asc" className="text-xs">A → Z</SelectItem>
                <SelectItem value="alpha-desc" className="text-xs">Z → A</SelectItem>
              </SelectContent>
            </Select>
          )}
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
              <List size={14} /> {t('inquiries.listView')}
            </button>
          </div>
          <Button onClick={() => setNewOpen(true)} size="sm"><Plus size={14} className="mr-1" /> {t('inquiries.newInquiry')}</Button>
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border bg-card p-3 card-shadow">
          <span className="text-sm font-medium text-foreground">{selected.size} {t('dashboard.selected')}</span>
          <div className="flex items-center gap-2 ml-auto">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <ArrowRight size={14} className="mr-1" /> {language === 'en' ? 'Move' : 'Verplaatsen'}
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
                      {t(`status.${col.key}`)}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <Button variant="destructive" size="sm" onClick={() => setBulkDeleteConfirmOpen(true)}>
              <Trash2 size={14} className="mr-1" /> {t('common.delete')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              <X size={14} />
            </Button>
          </div>
        </div>
      )}

      {viewMode === 'cards' ? (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {PIPELINE_ACTIVE_COLUMNS.map((col) => {
          const isArchiveCol = ARCHIVE_COLUMN_KEYS.includes(col.key);
          const items = isArchiveCol ? [] : sortKanbanItems(filteredInquiries.filter((inq) => inq.status === col.key));
          const archiveCount = isArchiveCol
            ? (col.key === 'lost' ? lostInquiries.length : completedInquiries.length)
            : 0;
          return (
            <div
              key={col.key}
              className={`min-w-[260px] flex-1 rounded-xl border border-t-4 ${col.colorClass} p-3 transition-colors`}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, col.key)}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {isArchiveCol && <Archive size={13} className="text-muted-foreground" />}
                  <h3 className="text-sm font-semibold text-foreground">{t(`status.${col.key}`)}</h3>
                </div>
                <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {isArchiveCol ? archiveCount : items.length}
                </span>
              </div>
              {isArchiveCol ? (
                <div
                  className="flex flex-col items-center justify-center min-h-[80px] rounded-lg border-2 border-dashed border-border/60 text-muted-foreground text-xs gap-1.5 cursor-default select-none"
                  title="Sleep een aanvraag hiernaartoe om te archiveren"
                >
                  <Archive size={18} className="opacity-40" />
                  <span className="opacity-60">Sleep hier om te archiveren</span>
                  {archiveCount > 0 && (
                    <button
                      onClick={() => setArchivedSection(col.key === 'lost' ? 'verloren' : 'afgerond')}
                      className="mt-1 text-primary hover:text-primary/80 font-medium underline underline-offset-2"
                    >
                      {archiveCount} bekijken →
                    </button>
                  )}
                </div>
              ) : null}
              <div className="space-y-2">
                {items.map((inq) => {
                  const relatedBookings = bookings.filter(b =>
                    (inq.contactId && b.contactId === inq.contactId) ||
                    (!inq.contactId && b.contactName === inq.contactName)
                  ).sort((a, b) => a.date.localeCompare(b.date));
                  const firstBooking = relatedBookings.length > 0 ? relatedBookings[0] : null;
                  const inquiryTaskCount = taskCountByInquiry[inq.id] || 0;
                  const hasMessage = inq.message && inq.message.trim().length > 0;

                  return (
                  <div
                    key={inq.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, inq.id)}
                    onDragEnd={handleDragEnd}
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
                            onClick={(e) => { e.stopPropagation(); const c = resolveContact(contacts, inq.contactId, inq.contactName); if (c) navigate(`/crm/${c.id}`); else openDetailDialog(inq); }}

                          >
                            {inq.contactName}
                          </button>
                        </div>
                      </div>
                      {inq.assignedTo && (
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0" title={inq.assignedTo}>
                          {inq.assignedTo.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                      )}
                    </div>

                    <div className="mt-2.5 space-y-1 text-xs">
                      
                      {(() => { const contact = resolveContact(contacts, inq.contactId, inq.contactName); const company = contact?.companyId ? companies.find(co => co.id === contact.companyId) : null; return contact?.company ? (
                        <div className="flex gap-2"><span className="text-muted-foreground w-[100px] shrink-0">Bedrijf:</span>{company ? (
                          <button className="text-card-foreground font-medium truncate hover:text-primary transition-colors text-left" onClick={(e) => { e.stopPropagation(); navigate(`/companies/${company.id}`); }}>{contact.company}</button>
                        ) : (<span className="text-card-foreground font-medium truncate">{contact.company}</span>)}</div>
                      ) : null; })()}
                      <div className="flex gap-2"><span className="text-muted-foreground w-[100px] shrink-0">Bron:</span><span className="text-card-foreground truncate">{inq.source === 'GHL' ? 'VirtuGrow' : inq.source}</span></div>
                      {inq.guestCount > 0 && <div className="flex gap-2"><span className="text-muted-foreground w-[100px] shrink-0">Personen:</span><span className="text-card-foreground">{inq.guestCount}</span></div>}
                      {inq.roomPreference && <div className="flex gap-2"><span className="text-muted-foreground w-[100px] shrink-0">Ruimte:</span><span className="text-card-foreground truncate">{inq.roomPreference}</span></div>}
                      {inq.preferredDate && <div className="flex gap-2"><span className="text-muted-foreground w-[100px] shrink-0">Datum:</span><span className="text-card-foreground">{formatDate(inq.preferredDate)}</span></div>}
                      {(inq.budget ?? 0) > 0 && <div className="flex gap-2"><span className="text-muted-foreground w-[100px] shrink-0">Waarde:</span><span className="text-card-foreground font-medium">€{inq.budget!.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}</span></div>}
                      
                      {relatedBookings.length > 0 && (() => {
                        const shown = relatedBookings.slice(0, 2);
                        const rest = relatedBookings.length - 2;
                        return (
                          <div className="mt-1.5 pt-1.5 border-t border-border/50 space-y-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleBookings(inq.id); }}
                              className="flex items-center justify-between w-full text-muted-foreground text-[10px] uppercase tracking-wide font-semibold hover:text-foreground transition-colors"
                            >
                              <span>Reserveringen ({relatedBookings.length})</span>
                              <ChevronDown size={12} className={cn('transition-transform', expandedBookings.has(inq.id) ? 'rotate-180' : '')} />
                            </button>
                            {(expandedBookings.has(inq.id) ? relatedBookings : shown).map((rb) => (
                              <div key={rb.id} className="flex flex-col gap-0.5 py-1 px-2 rounded-md bg-muted/30">
                                <div className="flex items-center justify-between gap-1">
                                  <span className="text-card-foreground font-medium">
                                    {format(new Date(rb.date), 'd MMM yyyy', { locale: nl })}
                                  </span>
                                  <span className={cn('text-[9px] font-semibold px-1.5 py-0.5 rounded-full', rb.date < todayStr ? 'bg-destructive/15 text-destructive' : rb.status === 'confirmed' ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning')}>
                                    {rb.date < todayStr ? 'Afgelopen' : rb.status === 'confirmed' ? 'Reservering' : 'Optie'}
                                  </span>
                                </div>
                                <span className="text-muted-foreground">
                                  {String(rb.startHour).padStart(2, '0')}:{String(rb.startMinute).padStart(2, '0')}–{String(rb.endHour).padStart(2, '0')}:{String(rb.endMinute).padStart(2, '0')} · {rb.roomName}
                                </span>
                                {rb.reservationNumber && <span className="text-muted-foreground font-mono text-[10px]">{rb.reservationNumber}</span>}
                                {(rb.guestCount ?? 0) > 0 && <span className="text-muted-foreground">{rb.guestCount} gasten</span>}
                              </div>
                            ))}
                            {!expandedBookings.has(inq.id) && rest > 0 && (
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleBookings(inq.id); }}
                                className="w-full text-center text-[10px] text-primary hover:text-primary/80 font-medium py-0.5 transition-colors"
                              >
                                + {rest} meer tonen
                              </button>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Icon row + Inplannen */}
                    <div className="mt-3 flex items-center justify-between border-t pt-2">
                      <div className="flex items-center gap-1.5">
                        
                        <button
                          onClick={(e) => { e.stopPropagation(); setNoteDialogInquiry(inq); setNoteText(''); }}
                          className="p-1 rounded hover:bg-muted transition-colors"
                          title="Notitie toevoegen"
                        >
                          <StickyNote size={13} className="text-muted-foreground" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setTaskDialogInquiry(inq); setTaskTitle(''); setTaskDueDate(''); setTaskAssignedTo([]); }}
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
                  checked={filteredInquiries.length > 0 && selected.size === filteredInquiries.length}
                  onCheckedChange={toggleSelectAll}
                />
              </th>
              <th className="px-4 py-2.5 w-[110px]"><SortableHeader label="ID" sortKey="id" currentSort={inquirySort.sortKey} currentDirection={inquirySort.sortDir} onSort={inquirySort.handleSort} /></th>
              <th className="px-4 py-2.5"><SortableHeader label="Type" sortKey="type" currentSort={inquirySort.sortKey} currentDirection={inquirySort.sortDir} onSort={inquirySort.handleSort} /></th>
              <th className="px-4 py-2.5"><SortableHeader label="Contact" sortKey="contact" currentSort={inquirySort.sortKey} currentDirection={inquirySort.sortDir} onSort={inquirySort.handleSort} /></th>
              <th className="px-4 py-2.5 hidden md:table-cell"><SortableHeader label="Bedrijf" sortKey="company" currentSort={inquirySort.sortKey} currentDirection={inquirySort.sortDir} onSort={inquirySort.handleSort} /></th>
              <th className="px-4 py-2.5 hidden md:table-cell"><SortableHeader label="Datum" sortKey="date" currentSort={inquirySort.sortKey} currentDirection={inquirySort.sortDir} onSort={inquirySort.handleSort} /></th>
              <th className="px-4 py-2.5 hidden md:table-cell"><SortableHeader label="Gasten" sortKey="guests" currentSort={inquirySort.sortKey} currentDirection={inquirySort.sortDir} onSort={inquirySort.handleSort} /></th>
              <th className="px-4 py-2.5 hidden lg:table-cell"><SortableHeader label="Budget" sortKey="budget" currentSort={inquirySort.sortKey} currentDirection={inquirySort.sortDir} onSort={inquirySort.handleSort} /></th>
              <th className="px-4 py-2.5"><SortableHeader label="Status" sortKey="status" currentSort={inquirySort.sortKey} currentDirection={inquirySort.sortDir} onSort={inquirySort.handleSort} /></th>
              <th className="px-4 py-2.5 hidden lg:table-cell"><SortableHeader label="Bron" sortKey="source" currentSort={inquirySort.sortKey} currentDirection={inquirySort.sortDir} onSort={inquirySort.handleSort} /></th>
              <th className="px-4 py-2.5 text-right font-medium text-muted-foreground"></th>
            </tr>
          </thead>
          <tbody>
            {inquirySort.sortItems(filteredInquiries, (inq, key) => {
              switch (key) {
                case 'id': return inq.displayNumber || '';
                case 'type': return inq.eventType;
                case 'contact': return inq.contactName;
                case 'company': {
                  const contact = inq.contactId ? contacts.find(c => c.id === inq.contactId) : null;
                  const company = contact?.companyId ? companies.find(co => co.id === contact.companyId) : null;
                  return company?.name || (contact as any)?.company || '';
                }
                case 'date': return inq.preferredDate || '';
                case 'guests': return inq.guestCount;
                case 'budget': return inq.budget || 0;
                case 'status': return inq.status;
                case 'source': return inq.source;
                default: return '';
              }
            }).map((inq) => {
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
                  <td className="px-4 py-2.5 hidden md:table-cell">
                    {(() => {
                      const contact = inq.contactId ? contacts.find(c => c.id === inq.contactId) : null;
                      const company = contact?.companyId ? companies.find(co => co.id === contact.companyId) : null;
                      if (company) return <button className="text-primary hover:underline text-left text-xs" onClick={(e) => { e.stopPropagation(); navigate(`/companies/${company.id}`); }}>{company.name}</button>;
                      if (contact?.company) return <span className="text-muted-foreground text-xs">{contact.company}</span>;
                      return <span className="text-muted-foreground">—</span>;
                    })()}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground hidden md:table-cell">{formatDate(inq.preferredDate)}</td>
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

      {/* ─── ARCHIEF MAPPEN ─── */}
      <div ref={archiveRef} className="scroll-mt-4">
      {([
        { key: 'verloren' as const, label: 'Verloren aanvragen', items: lostInquiries, icon: 'lost', colorHeader: 'bg-destructive/5 hover:bg-destructive/10', colorBorder: 'border-destructive/20', exportName: 'verloren-aanvragen' },
        { key: 'afgerond' as const, label: 'Afgeronde aanvragen', items: completedInquiries, icon: 'done', colorHeader: 'bg-success/5 hover:bg-success/10', colorBorder: 'border-success/20', exportName: 'afgeronde-aanvragen' },
      ]).map(({ key, label, items, icon, colorHeader, colorBorder, exportName }) => (
        <div key={key} className={cn("mt-2 rounded-xl border overflow-hidden bg-card card-shadow", colorBorder)}>
          {/* Folder header — always visible, click to expand */}
          <button
            className={cn("w-full flex items-center justify-between px-5 py-3 border-b transition-colors text-left", colorHeader)}
            onClick={() => setArchivedSection(archivedSection === key ? null : key)}
          >
            <div className="flex items-center gap-2">
              {icon === 'lost'
                ? <FolderX size={16} className="text-destructive" />
                : <FolderCheck size={16} className="text-success" />}
              <span className="text-sm font-semibold text-foreground">{label}</span>
              <span className="text-xs text-muted-foreground ml-1">({items.length})</span>
            </div>
            <div className="flex items-center gap-2">
              {items.length > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    exportToCSV(
                      items.map(inq => ({
                        nummer: inq.displayNumber || '',
                        contact: inq.contactName,
                        type_evenement: inq.eventType,
                        datum: inq.preferredDate || '',
                        status: PIPELINE_COLUMNS.find(c => c.key === inq.status)?.label || inq.status,
                        gasten: inq.guestCount,
                        budget: inq.budget ? `€${inq.budget}` : '',
                        bron: inq.source || '',
                        aangemaakt: inq.createdAt,
                        bericht: inq.message || '',
                      })),
                      [
                        { key: 'nummer', label: 'Nummer' },
                        { key: 'contact', label: 'Contact' },
                        { key: 'type_evenement', label: 'Type evenement' },
                        { key: 'datum', label: 'Gewenste datum' },
                        { key: 'status', label: 'Status' },
                        { key: 'gasten', label: 'Gasten' },
                        { key: 'budget', label: 'Budget' },
                        { key: 'bron', label: 'Bron' },
                        { key: 'aangemaakt', label: 'Aangemaakt op' },
                        { key: 'bericht', label: 'Bericht' },
                      ],
                      exportName
                    );
                  }}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border/50 hover:border-border transition-colors bg-background/80"
                  title="Exporteer naar CSV"
                >
                  <Download size={12} /> Exporteer
                </button>
              )}
              {archivedSection === key
                ? <ChevronDown size={16} className="text-muted-foreground" />
                : <ChevronRightIcon size={16} className="text-muted-foreground" />}
            </div>
          </button>

          {/* Folder contents — only shown when open */}
          {archivedSection === key && (
            <div className="divide-y divide-border/40">
              {items.length === 0 ? (
                <p className="px-5 py-8 text-sm text-muted-foreground text-center">Geen aanvragen in deze map</p>
              ) : (
                items
                  .slice()
                  .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                  .map((inq) => {
                    const col = PIPELINE_COLUMNS.find(c => c.key === inq.status);
                    return (
                      <div
                        key={inq.id}
                        className="flex items-center justify-between px-5 py-3 hover:bg-muted/30 transition-colors gap-4 group"
                      >
                        <button
                          onClick={() => navigate(`/inquiries/${inq.id}`)}
                          className="flex items-center gap-3 min-w-0 flex-1 text-left"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{inq.eventType}</p>
                            <p className="text-xs text-muted-foreground">
                              {inq.contactName}
                              {inq.preferredDate && <span> · {formatDate(inq.preferredDate)}</span>}
                              {inq.guestCount > 0 && <span> · {inq.guestCount} gasten</span>}
                            </p>
                          </div>
                        </button>
                        <div className="flex items-center gap-2 shrink-0">
                          {inq.budget && (
                            <span className="text-xs text-muted-foreground">€{inq.budget.toLocaleString('nl-NL')}</span>
                          )}
                          <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold", col?.badgeClass)}>
                            {col?.label || inq.status}
                          </span>
                          <span className="text-xs text-muted-foreground hidden sm:block">{formatDate(inq.createdAt)}</span>
                          <button
                            onClick={() => {
                              updateInquiry({ ...inq, status: 'new' });
                              toast({ title: 'Aanvraag teruggezet naar pipeline', description: inq.eventType });
                            }}
                            className="opacity-0 group-hover:opacity-100 text-xs text-primary hover:text-primary/80 font-medium px-2 py-1 rounded border border-border hover:border-primary/50 transition-all"
                            title="Terug naar pipeline"
                          >
                            ↩ Herstel
                          </button>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          )}
        </div>
      ))}
      </div>

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
                        <Input
                          type="time"
                          className="text-sm"
                          value={`${String(opt.startHour).padStart(2, '0')}:${String(opt.startMinute).padStart(2, '0')}`}
                          onChange={(e) => {
                            const [h, m] = e.target.value.split(':').map(Number);
                            updateDateOption(opt.id, { startHour: h, startMinute: m });
                          }}
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Tot</Label>
                        <Input
                          type="time"
                          className="text-sm"
                          value={`${String(opt.endHour).padStart(2, '0')}:${String(opt.endMinute).padStart(2, '0')}`}
                          onChange={(e) => {
                            const [h, m] = e.target.value.split(':').map(Number);
                            updateDateOption(opt.id, { endHour: h, endMinute: m });
                          }}
                        />
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
              {recurrence !== 'none' && recurrence !== 'adrandom' && (
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
            <Button variant="outline" onClick={() => setScheduleOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleSchedule}>{t('inquiries.schedule')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* New Inquiry Dialog */}
      <NewInquiryDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        contacts={contacts}
        companies={companies}
        onInquiryAdded={handleAddInquiry}
      />

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
            const relatedBookings = bookings.filter(b => (editInquiry.contactId && b.contactId === editInquiry.contactId) || (!editInquiry.contactId && b.contactName === editInquiry.contactName));
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
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary text-lg font-bold shrink-0" title={editInquiry.assignedTo || editInquiry.contactName}>
                      {(editInquiry.assignedTo || editInquiry.contactName).split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
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
                    <div className="flex justify-between"><span className="text-muted-foreground">Voorkeursdatum:</span><span className="font-medium text-foreground">{formatDate(editInquiry.preferredDate)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Aantal gasten:</span><span className="font-medium text-foreground">{editInquiry.guestCount}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Ruimte:</span><span className="font-medium text-foreground">{editInquiry.roomPreference || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Budget:</span><span className="font-medium text-foreground">{editInquiry.budget ? `€${editInquiry.budget.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}` : '—'}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Bron:</span><span className="font-medium text-foreground">{editInquiry.source === 'GHL' ? 'VirtuGrow' : editInquiry.source}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Aangemaakt:</span><span className="font-medium text-foreground">{formatDate(editInquiry.createdAt)}</span></div>
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
                {relatedBookings.length > 0 && (() => {
                  const isOpen = expandedBookings.has(editInquiry!.id + '-detail');
                  const shown = isOpen ? relatedBookings : relatedBookings.slice(0, 3);
                  return (
                    <div className="rounded-lg border bg-muted/20 overflow-hidden">
                      <button
                        onClick={() => toggleBookings(editInquiry!.id + '-detail')}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
                      >
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Reserveringen ({relatedBookings.length})
                        </span>
                        <ChevronDown size={14} className={cn('text-muted-foreground transition-transform', isOpen ? 'rotate-180' : '')} />
                      </button>
                      <div className="divide-y divide-border/50">
                        {shown.map(b => (
                          <div key={b.id} className="flex items-center justify-between text-sm px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <CalendarIcon size={13} className="text-muted-foreground" />
                              <span className="text-foreground">{format(new Date(b.date), 'd MMM yyyy', { locale: nl })}</span>
                              <span className="text-muted-foreground text-xs">{String(b.startHour).padStart(2, '0')}:{String(b.startMinute).padStart(2, '0')} – {String(b.endHour).padStart(2, '0')}:{String(b.endMinute).padStart(2, '0')}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">{b.roomName}</span>
                              <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', b.date < todayStr ? 'bg-destructive/15 text-destructive' : b.status === 'option' ? 'bg-warning/15 text-warning' : 'bg-success/15 text-success')}>
                                {b.date < todayStr ? 'Afgelopen' : b.status === 'option' ? 'Optie' : 'Reservering'}
                              </span>
                            </div>
                          </div>
                        ))}
                        {!isOpen && relatedBookings.length > 3 && (
                          <button
                            onClick={() => toggleBookings(editInquiry!.id + '-detail')}
                            className="w-full text-center text-xs text-primary hover:text-primary/80 font-medium py-2 transition-colors"
                          >
                            + {relatedBookings.length - 3} meer tonen
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()}

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
                        <SelectItem key={col.key} value={col.key}>{t(`status.${col.key}`)}</SelectItem>
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
                    <Trash2 size={14} className="mr-1" /> {t('common.delete')}
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setDetailOpen(false)}>{t('common.cancel')}</Button>
                    <Button onClick={handleSaveEdit}>{t('common.save')}</Button>
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
            <AlertDialogTitle>{t('common.areYouSure')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('inquiries.bulkDeleteConfirm')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleBulkDelete}>
              {t('common.delete')} ({selected.size})
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Move Confirm */}
      <AlertDialog open={!!bulkMoveTarget} onOpenChange={(open) => { if (!open) setBulkMoveTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{language === 'en' ? 'Confirm move' : 'Verplaatsen bevestigen'}</AlertDialogTitle>
            <AlertDialogDescription>
              {language === 'en' 
                ? `Are you sure you want to move ${selected.size} inquir${selected.size !== 1 ? 'ies' : 'y'} to "${t(`status.${bulkMoveTarget}`)}"?`
                : `Weet je zeker dat je ${selected.size} aanvra${selected.size !== 1 ? 'gen' : 'ag'} wilt verplaatsen naar "${t(`status.${bulkMoveTarget}`)}"?`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
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
          <div className="grid gap-1.5">
            <Label>Datum *</Label>
            <Input type="date" value={taskDueDate} onChange={(e) => setTaskDueDate(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Verantwoordelijke *</Label>
            <TeamMemberMultiSelect value={taskAssignedTo} onChange={setTaskAssignedTo} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTaskDialogInquiry(null)}>Annuleren</Button>
            <Button
              disabled={!taskTitle.trim() || !taskDueDate.trim() || !taskAssignedTo.length}
              onClick={async () => {
                if (!taskDialogInquiry || !taskTitle.trim() || !taskDueDate.trim() || !taskAssignedTo.length) return;
                for (const assignee of taskAssignedTo) {
                  await addTask({
                    title: taskTitle.trim(),
                    status: 'open',
                    priority: 'normal',
                    dueDate: taskDueDate,
                    assignedTo: assignee,
                    inquiryId: taskDialogInquiry.id,
                    contactId: taskDialogInquiry.contactId || undefined,
                  });
                }
                toast({ title: taskAssignedTo.length > 1 ? `${taskAssignedTo.length} taken aangemaakt` : 'Taak aangemaakt' });
                setTaskDialogInquiry(null);
              }}
            >Opslaan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Conflict Alert Dialog */}
      <ConflictAlertDialog
        open={!!conflictPopup}
        onOpenChange={(open) => !open && setConflictPopup(null)}
        conflicts={conflictPopup?.conflicts || []}
        getRoomDisplayName={getDisplayName}
      />
    </div>
  );
}
