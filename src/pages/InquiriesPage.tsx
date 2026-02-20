import { useState, useCallback, DragEvent } from 'react';
import { mockInquiries } from '@/data/mockData';
import { Inquiry } from '@/types/crm';
import { Calendar, Users, Euro, GripVertical, Repeat, ChevronDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const PIPELINE_COLUMNS: { key: Inquiry['status']; label: string; colorClass: string }[] = [
  { key: 'new', label: 'Nieuw', colorClass: 'border-t-info bg-info/5' },
  { key: 'contacted', label: 'Gecontacteerd', colorClass: 'border-t-warning bg-warning/5' },
  { key: 'quoted', label: 'Offerte Verstuurd', colorClass: 'border-t-accent bg-accent/5' },
  { key: 'converted', label: 'Geconverteerd', colorClass: 'border-t-success bg-success/5' },
  { key: 'lost', label: 'Verloren', colorClass: 'border-t-muted-foreground bg-muted/30' },
];

const RECURRENCE_OPTIONS = [
  { value: 'none', label: 'Eenmalig' },
  { value: 'weekly', label: 'Elke week' },
  { value: 'biweekly', label: 'Om de 2 weken' },
  { value: 'monthly', label: 'Elke maand' },
  { value: 'quarterly', label: 'Elk kwartaal' },
];

export default function InquiriesPage() {
  const [inquiries, setInquiries] = useState<Inquiry[]>(mockInquiries);
  const [dragId, setDragId] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [selectedInquiry, setSelectedInquiry] = useState<Inquiry | null>(null);
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

    setInquiries((prev) =>
      prev.map((inq) => (inq.id === id ? { ...inq, status: newStatus } : inq))
    );
    setDragId(null);

    const col = PIPELINE_COLUMNS.find((c) => c.key === newStatus);
    toast({ title: 'Status gewijzigd', description: `Verplaatst naar "${col?.label}"` });
  }, [toast]);

  const openScheduleDialog = (inq: Inquiry) => {
    setSelectedInquiry(inq);
    setRecurrence('none');
    setRepeatCount('4');
    setScheduleOpen(true);
  };

  const handleSchedule = () => {
    if (!selectedInquiry) return;
    const label = RECURRENCE_OPTIONS.find(r => r.value === recurrence)?.label || 'Eenmalig';
    toast({
      title: 'Ingepland',
      description: `${selectedInquiry.eventType} — ${label}${recurrence !== 'none' ? ` (${repeatCount}x)` : ''}`,
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
                          <span className="flex items-center gap-1"><Calendar size={10} /> {inq.preferredDate}</span>
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
                            <Repeat size={10} className="mr-1" /> Inplannen
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

      {/* Schedule / Recurring Dialog */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aanvraag Inplannen</DialogTitle>
          </DialogHeader>
          {selectedInquiry && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border p-3 text-sm">
                <p className="font-medium">{selectedInquiry.eventType}</p>
                <p className="text-xs text-muted-foreground">{selectedInquiry.contactName} · {selectedInquiry.guestCount} gasten</p>
              </div>
              <div className="grid gap-1.5">
                <Label>Herhaling</Label>
                <Select value={recurrence} onValueChange={setRecurrence}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RECURRENCE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {recurrence !== 'none' && (
                <div className="grid gap-1.5">
                  <Label>Aantal herhalingen</Label>
                  <Input type="number" min="1" max="52" value={repeatCount} onChange={(e) => setRepeatCount(e.target.value)} />
                  <p className="text-xs text-muted-foreground">
                    Er worden {repeatCount} boekingen aangemaakt op basis van de gekozen frequentie
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
