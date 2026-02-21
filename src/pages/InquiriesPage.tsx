import { useState, useCallback, useEffect, DragEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Inquiry, Booking, ROOMS, RoomName } from '@/types/crm';
import { Calendar as CalendarIcon, Users, Euro, GripVertical, Repeat, Plus, X, Check, LayoutGrid, List, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useBookings } from '@/contexts/BookingsContext';
import { useInquiriesContext } from '@/contexts/InquiriesContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const PIPELINE_COLUMNS: { key: Inquiry['status']; label: string; colorClass: string; badgeClass: string }[] = [
  { key: 'new', label: 'Nieuwe Aanvraag', colorClass: 'border-t-info bg-info/5', badgeClass: 'status-new' },
  { key: 'contacted', label: 'Lopend Contact', colorClass: 'border-t-warning bg-warning/5', badgeClass: 'status-contacted' },
  { key: 'option', label: 'Optie', colorClass: 'border-t-accent bg-accent/5', badgeClass: 'status-option' },
  { key: 'quoted', label: 'Offerte Verzonden', colorClass: 'border-t-primary bg-primary/5', badgeClass: 'status-quoted' },
  { key: 'quote_revised', label: 'Aangepaste Offerte', colorClass: 'border-t-primary bg-primary/5', badgeClass: 'status-quoted' },
  { key: 'reserved', label: 'Reservering', colorClass: 'border-t-success bg-success/5', badgeClass: 'status-converted' },
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
  const { inquiries, loading: inquiriesLoading, addInquiry, updateInquiry, deleteInquiry: deleteInquiryCtx } = useInquiriesContext();
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
  const { toast } = useToast();
  const { addBookings } = useBookings();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Handle incoming inquiry from CRM
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
    setEditInquiry({ ...inq });
    setDetailOpen(true);
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
          endHour: opt.endHour,
          title: selectedInquiry.eventType,
          contactName: selectedInquiry.contactName,
          status: opt.status,
        });
      }
    }

    addBookings(newBookings);

    // Update inquiry status to converted
    if (selectedInquiry) {
      await updateInquiry({ ...selectedInquiry, status: 'converted' });
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
                {items.map((inq) => (
                  <div
                    key={inq.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, inq.id)}
                    onClick={() => openDetailDialog(inq)}
                    className={`cursor-pointer rounded-lg border bg-card p-3 card-shadow hover:card-shadow-hover transition-all active:cursor-grabbing ${dragId === inq.id ? 'opacity-50 scale-95' : ''}`}
                  >
                    <div className="flex items-start gap-2">
                      <GripVertical size={14} className="mt-0.5 shrink-0 text-muted-foreground/40 cursor-grab" />
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium text-card-foreground truncate">{inq.eventType}</h4>
                        <p className="text-xs text-muted-foreground">{inq.contactName}</p>
                        <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">{inq.message}</p>
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1"><CalendarIcon size={10} /> {inq.preferredDate}</span>
                          <span className="flex items-center gap-1"><Users size={10} /> {inq.guestCount}</span>
                          {inq.budget && <span className="flex items-center gap-1"><Euro size={10} /> €{inq.budget.toLocaleString('nl-NL')}</span>}
                        </div>
                        <div className="mt-1.5 flex items-center justify-between">
                          <span className="text-[10px] text-muted-foreground/50">Bron: {inq.source}</span>
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
                    </div>
                  </div>
                ))}
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
                <tr key={inq.id} onClick={() => openDetailDialog(inq)} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors cursor-pointer">
                  <td className="px-4 py-2.5 font-medium text-card-foreground">{inq.eventType}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{inq.contactName}</td>
                  <td className="px-4 py-2.5 text-muted-foreground hidden md:table-cell">{inq.preferredDate || '—'}</td>
                  <td className="px-4 py-2.5 text-muted-foreground hidden md:table-cell">{inq.guestCount}</td>
                  <td className="px-4 py-2.5 text-muted-foreground hidden lg:table-cell">{inq.budget ? `€${inq.budget.toLocaleString('nl-NL')}` : '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className={cn('inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold', col?.badgeClass)}>{col?.label}</span>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground hidden lg:table-cell">{inq.source}</td>
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
                  <SelectItem value="GHL">GHL</SelectItem>
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

      {/* Detail / Edit Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Aanvraag Bewerken</DialogTitle>
          </DialogHeader>
          {editInquiry && (
            <div className="grid gap-4 py-2">
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
                    <SelectItem value="GHL">GHL</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Bericht / Notities</Label>
                <Textarea value={editInquiry.message || ''} onChange={(e) => setEditInquiry({ ...editInquiry, message: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter className="flex !justify-between">
            <Button variant="destructive" size="sm" onClick={handleDeleteInquiry}>
              <Trash2 size={14} className="mr-1" /> Verwijderen
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDetailOpen(false)}>Annuleren</Button>
              <Button onClick={handleSaveEdit}>Opslaan</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
