import { useState, useCallback, DragEvent } from 'react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { mockInquiries } from '@/data/mockData';
import { Inquiry, ROOMS, RoomName } from '@/types/crm';
import { Calendar as CalendarIcon, Users, Euro, GripVertical, Repeat, Plus, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const PIPELINE_COLUMNS: { key: Inquiry['status']; label: string; colorClass: string }[] = [
  { key: 'new', label: 'Nieuw', colorClass: 'border-t-info bg-info/5' },
  { key: 'contacted', label: 'Gecontacteerd', colorClass: 'border-t-warning bg-warning/5' },
  { key: 'quoted', label: 'Offerte Verstuurd', colorClass: 'border-t-accent bg-accent/5' },
  { key: 'converted', label: 'Geconverteerd', colorClass: 'border-t-success bg-success/5' },
  { key: 'lost', label: 'Verloren', colorClass: 'border-t-muted-foreground bg-muted/30' },
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
  const [inquiries, setInquiries] = useState<Inquiry[]>(mockInquiries);
  const [dragId, setDragId] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [selectedInquiry, setSelectedInquiry] = useState<Inquiry | null>(null);
  const [dateOptions, setDateOptions] = useState<DateOption[]>([]);
  const [recurrence, setRecurrence] = useState('none');
  const [repeatCount, setRepeatCount] = useState('4');
  const { toast } = useToast();

  const handleDragStart = useCallback((e: DragEvent, id: string) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback((e: DragEvent, newStatus: Inquiry['status']) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (!id) return;
    setInquiries((prev) => prev.map((inq) => (inq.id === id ? { ...inq, status: newStatus } : inq)));
    setDragId(null);
    const col = PIPELINE_COLUMNS.find((c) => c.key === newStatus);
    toast({ title: 'Status gewijzigd', description: `Verplaatst naar "${col?.label}"` });
  }, [toast]);

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

  const handleSchedule = () => {
    if (!selectedInquiry) return;
    const validOptions = dateOptions.filter((o) => o.date && o.room);
    if (validOptions.length === 0) {
      toast({ title: 'Selecteer minimaal één datum en ruimte', variant: 'destructive' });
      return;
    }
    const descriptions = validOptions.map((o) => {
      const dateStr = o.date ? format(o.date, 'd MMM', { locale: nl }) : '';
      const statusLabel = o.status === 'confirmed' ? 'Bevestigd' : 'In Optie';
      return `${dateStr} ${hourLabel(o.startHour)}–${hourLabel(o.endHour)} · ${o.room} (${statusLabel})`;
    });
    const recLabel = RECURRENCE_OPTIONS.find((r) => r.value === recurrence)?.label || '';
    toast({
      title: `${validOptions.length} datum(s) ingepland`,
      description: descriptions.join(' | ') + (recurrence !== 'none' ? ` · ${recLabel} (${repeatCount}x)` : ''),
    });
    setScheduleOpen(false);
  };

  return (
    <div className="p-6 lg:p-8 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Aanvragen Pipeline</h1>
        <p className="text-sm text-muted-foreground">{inquiries.length} aanvragen · Sleep kaarten om de status te wijzigen</p>
      </div>

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
                    className={`cursor-grab rounded-lg border bg-card p-3 card-shadow hover:card-shadow-hover transition-all active:cursor-grabbing ${dragId === inq.id ? 'opacity-50 scale-95' : ''}`}
                  >
                    <div className="flex items-start gap-2">
                      <GripVertical size={14} className="mt-0.5 shrink-0 text-muted-foreground/40" />
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
                      <Label className="text-xs">Status</Label>
                      <Select value={opt.status} onValueChange={(v: 'confirmed' | 'option') => updateDateOption(opt.id, { status: v })}>
                        <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="option">In Optie</SelectItem>
                          <SelectItem value="confirmed">Bevestigd</SelectItem>
                        </SelectContent>
                      </Select>
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
    </div>
  );
}
