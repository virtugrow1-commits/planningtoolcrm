import { Plus, Trash2, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { LineItem } from '@/types/quotation';
import { calcLineTotal, calcFinancials, VAT_RATES } from '@/types/quotation';

interface LineItemsEditorProps {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  readOnly?: boolean;
}

export default function LineItemsEditor({ items, onChange, readOnly }: LineItemsEditorProps) {
  const addItem = () => {
    const newItem: LineItem = {
      id: crypto.randomUUID(),
      sortOrder: items.length,
      itemName: '',
      description: '',
      quantity: 1,
      unitPrice: 0,
      vatRate: 21,
      discountPercent: 0,
      lineTotal: 0,
    };
    onChange([...items, newItem]);
  };

  const updateItem = (index: number, field: keyof LineItem, value: any) => {
    const updated = [...items];
    (updated[index] as any)[field] = value;
    // Recalculate line total
    const item = updated[index];
    item.lineTotal = calcLineTotal(item.quantity, item.unitPrice, item.discountPercent);
    onChange(updated);
  };

  const removeItem = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  const financials = calcFinancials(items);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-8"></TableHead>
              <TableHead className="min-w-[200px]">Item</TableHead>
              <TableHead className="w-20 text-right">Aantal</TableHead>
              <TableHead className="w-28 text-right">Prijs (€)</TableHead>
              <TableHead className="w-24">BTW %</TableHead>
              <TableHead className="w-24 text-right">Korting %</TableHead>
              <TableHead className="w-28 text-right">Totaal</TableHead>
              {!readOnly && <TableHead className="w-10"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={readOnly ? 7 : 8} className="text-center py-8 text-muted-foreground">
                  Nog geen items toegevoegd
                </TableCell>
              </TableRow>
            )}
            {items.map((item, i) => (
              <TableRow key={item.id}>
                <TableCell className="px-2">
                  <GripVertical size={14} className="text-muted-foreground" />
                </TableCell>
                <TableCell>
                  {readOnly ? (
                    <div>
                      <p className="font-medium text-sm">{item.itemName}</p>
                      {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <Input
                        placeholder="Itemnaam"
                        value={item.itemName}
                        onChange={(e) => updateItem(i, 'itemName', e.target.value)}
                        className="h-8 text-sm"
                      />
                      <Input
                        placeholder="Omschrijving (optioneel)"
                        value={item.description || ''}
                        onChange={(e) => updateItem(i, 'description', e.target.value)}
                        className="h-7 text-xs"
                      />
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {readOnly ? (
                    <span className="text-sm">{item.quantity}</span>
                  ) : (
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={item.quantity}
                      onChange={(e) => updateItem(i, 'quantity', Number(e.target.value))}
                      className="h-8 text-sm text-right w-20"
                    />
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {readOnly ? (
                    <span className="text-sm">€ {item.unitPrice.toFixed(2)}</span>
                  ) : (
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={item.unitPrice}
                      onChange={(e) => updateItem(i, 'unitPrice', Number(e.target.value))}
                      className="h-8 text-sm text-right w-28"
                    />
                  )}
                </TableCell>
                <TableCell>
                  {readOnly ? (
                    <span className="text-sm">{item.vatRate}%</span>
                  ) : (
                    <Select
                      value={String(item.vatRate)}
                      onValueChange={(v) => updateItem(i, 'vatRate', Number(v))}
                    >
                      <SelectTrigger className="h-8 text-sm w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VAT_RATES.map((r) => (
                          <SelectItem key={r} value={String(r)}>{r}%</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {readOnly ? (
                    <span className="text-sm">{item.discountPercent > 0 ? `${item.discountPercent}%` : '—'}</span>
                  ) : (
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={item.discountPercent}
                      onChange={(e) => updateItem(i, 'discountPercent', Number(e.target.value))}
                      className="h-8 text-sm text-right w-20"
                    />
                  )}
                </TableCell>
                <TableCell className="text-right font-medium text-sm">
                  € {item.lineTotal.toFixed(2)}
                </TableCell>
                {!readOnly && (
                  <TableCell className="px-2">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeItem(i)}>
                      <Trash2 size={14} className="text-destructive" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {!readOnly && (
        <Button variant="outline" size="sm" onClick={addItem} className="gap-1.5">
          <Plus size={14} /> Item toevoegen
        </Button>
      )}

      {/* Financial summary */}
      <div className="flex justify-end">
        <div className="w-72 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotaal</span>
            <span>€ {financials.subtotal.toFixed(2)}</span>
          </div>
          {financials.discountAmount > 0 && (
            <div className="flex justify-between text-destructive">
              <span>Korting</span>
              <span>-€ {financials.discountAmount.toFixed(2)}</span>
            </div>
          )}
          {financials.vatBuckets.map((b) => (
            <div key={b.rate} className="flex justify-between">
              <span className="text-muted-foreground">BTW {b.rate}%</span>
              <span>€ {b.amount.toFixed(2)}</span>
            </div>
          ))}
          <div className="flex justify-between font-bold text-base border-t pt-2 mt-2">
            <span>Totaal</span>
            <span>€ {financials.total.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
