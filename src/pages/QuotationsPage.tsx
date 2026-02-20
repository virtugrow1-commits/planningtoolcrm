import { useState } from 'react';
import { mockQuotations } from '@/data/mockData';
import { Quotation, QuotationItem } from '@/types/crm';
import { FileText, Plus, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

const statusConfig: Record<string, { label: string; class: string }> = {
  draft: { label: 'Concept', class: 'bg-muted text-muted-foreground border-border' },
  sent: { label: 'Verzonden', class: 'bg-info/15 text-info border-info/30' },
  accepted: { label: 'Geaccepteerd', class: 'bg-success/15 text-success border-success/30' },
  declined: { label: 'Afgewezen', class: 'bg-destructive/15 text-destructive border-destructive/30' },
  expired: { label: 'Verlopen', class: 'bg-muted text-muted-foreground border-border' },
};

export default function QuotationsPage() {
  const [quotations, setQuotations] = useState<Quotation[]>(mockQuotations);
  const [editOpen, setEditOpen] = useState(false);
  const [editQuotation, setEditQuotation] = useState<Quotation | null>(null);
  const { toast } = useToast();

  const openEditDialog = (q: Quotation) => {
    setEditQuotation(JSON.parse(JSON.stringify(q)));
    setEditOpen(true);
  };

  const recalcTotal = (items: QuotationItem[]) =>
    items.reduce((sum, i) => sum + i.total, 0);

  const updateItem = (idx: number, updates: Partial<QuotationItem>) => {
    if (!editQuotation) return;
    const items = [...editQuotation.items];
    items[idx] = { ...items[idx], ...updates };
    items[idx].total = items[idx].quantity * items[idx].unitPrice;
    setEditQuotation({ ...editQuotation, items, totalAmount: recalcTotal(items) });
  };

  const addItem = () => {
    if (!editQuotation) return;
    const items = [...editQuotation.items, { description: '', quantity: 1, unitPrice: 0, total: 0 }];
    setEditQuotation({ ...editQuotation, items });
  };

  const removeItem = (idx: number) => {
    if (!editQuotation || editQuotation.items.length <= 1) return;
    const items = editQuotation.items.filter((_, i) => i !== idx);
    setEditQuotation({ ...editQuotation, items, totalAmount: recalcTotal(items) });
  };

  const handleSave = () => {
    if (!editQuotation) return;
    if (!editQuotation.title) {
      toast({ title: 'Vul een titel in', variant: 'destructive' });
      return;
    }
    setQuotations((prev) => prev.map((q) => q.id === editQuotation.id ? editQuotation : q));
    setEditOpen(false);
    toast({ title: 'Offerte bijgewerkt' });
  };

  const handleDelete = () => {
    if (!editQuotation) return;
    setQuotations((prev) => prev.filter((q) => q.id !== editQuotation.id));
    setEditOpen(false);
    toast({ title: 'Offerte verwijderd', description: editQuotation.title });
  };

  return (
    <div className="p-6 lg:p-8 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Offertes</h1>
        <p className="text-sm text-muted-foreground">{quotations.length} offertes · Klik op een rij om te bewerken</p>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card card-shadow">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Offerte</th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Klant</th>
              <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Bedrag</th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Geldig tot</th>
            </tr>
          </thead>
          <tbody>
            {quotations.map((q) => {
              const sc = statusConfig[q.status];
              return (
                <tr key={q.id} onClick={() => openEditDialog(q)} className="border-b last:border-0 transition-colors hover:bg-muted/30 cursor-pointer">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileText size={14} className="text-muted-foreground" />
                      <span className="font-medium text-foreground">{q.title}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{q.contactName}</td>
                  <td className="px-4 py-3 text-right font-semibold text-foreground">€{q.totalAmount.toLocaleString('nl-NL')}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${sc.class}`}>{sc.label}</span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{q.validUntil}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Edit Quotation Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Offerte Bewerken</DialogTitle>
          </DialogHeader>
          {editQuotation && (
            <div className="grid gap-4 py-2">
              <div className="grid gap-1.5">
                <Label>Titel *</Label>
                <Input value={editQuotation.title} onChange={(e) => setEditQuotation({ ...editQuotation, title: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Klant</Label>
                  <Input value={editQuotation.contactName} onChange={(e) => setEditQuotation({ ...editQuotation, contactName: e.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Geldig tot</Label>
                  <Input type="date" value={editQuotation.validUntil} onChange={(e) => setEditQuotation({ ...editQuotation, validUntil: e.target.value })} />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label>Status</Label>
                <Select value={editQuotation.status} onValueChange={(v: Quotation['status']) => setEditQuotation({ ...editQuotation, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Concept</SelectItem>
                    <SelectItem value="sent">Verzonden</SelectItem>
                    <SelectItem value="accepted">Geaccepteerd</SelectItem>
                    <SelectItem value="declined">Afgewezen</SelectItem>
                    <SelectItem value="expired">Verlopen</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Items */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Regels</Label>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addItem}>
                    <Plus size={12} className="mr-1" /> Regel toevoegen
                  </Button>
                </div>
                {editQuotation.items.map((item, idx) => (
                  <div key={idx} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Regel {idx + 1}</span>
                      {editQuotation.items.length > 1 && (
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => removeItem(idx)}>
                          <Trash2 size={12} />
                        </Button>
                      )}
                    </div>
                    <div className="grid gap-1.5">
                      <Input placeholder="Omschrijving" value={item.description} onChange={(e) => updateItem(idx, { description: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="grid gap-1">
                        <Label className="text-[10px]">Aantal</Label>
                        <Input type="number" min="1" value={item.quantity} onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) || 0 })} />
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-[10px]">Prijs/st (€)</Label>
                        <Input type="number" min="0" value={item.unitPrice} onChange={(e) => updateItem(idx, { unitPrice: Number(e.target.value) || 0 })} />
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-[10px]">Totaal</Label>
                        <div className="flex h-9 items-center rounded-md border bg-muted/30 px-3 text-sm font-medium">
                          €{item.total.toLocaleString('nl-NL')}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                <div className="flex justify-end pt-2 border-t">
                  <span className="text-sm font-semibold">Totaal: €{editQuotation.totalAmount.toLocaleString('nl-NL')}</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="flex !justify-between">
            <Button variant="destructive" size="sm" onClick={handleDelete}>
              Verwijderen
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditOpen(false)}>Annuleren</Button>
              <Button onClick={handleSave}>Opslaan</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
