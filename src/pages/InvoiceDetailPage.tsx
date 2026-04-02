import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Save, Trash2, CheckCircle, CreditCard, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useInvoices } from '@/hooks/useInvoices';
import QuoteStatusBadge from '@/components/quotation/QuoteStatusBadge';
import LineItemsEditor from '@/components/quotation/LineItemsEditor';
import type { Invoice, LineItem } from '@/types/quotation';
import { calcFinancials } from '@/types/quotation';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    getInvoiceWithItems,
    updateInvoice,
    updateInvoiceStatus,
    updateInvoiceLineItems,
    deleteInvoice,
  } = useInvoices();
  const { toast } = useToast();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [title, setTitle] = useState('');
  const [contactName, setContactName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([]);

  const loadInvoice = useCallback(async () => {
    if (!id) return;
    const inv = await getInvoiceWithItems(id);
    if (inv) {
      setInvoice(inv);
      setTitle(inv.title);
      setContactName(inv.contactName);
      setCompanyName(inv.companyName || '');
      setClientEmail(inv.clientEmail || '');
      setClientAddress(inv.clientAddress || '');
      setDueDate(inv.dueDate || '');
      setNotes(inv.notes || '');
      setLineItems(inv.lineItems || []);
    }
    setLoading(false);
  }, [id, getInvoiceWithItems]);

  useEffect(() => { loadInvoice(); }, [loadInvoice]);

  const isDraft = invoice?.status === 'draft';

  const handleSave = async () => {
    if (!invoice) return;
    setSaving(true);
    const fin = calcFinancials(lineItems);

    const ok1 = await updateInvoice(invoice.id, {
      title,
      contactName,
      companyName: companyName || undefined,
      clientEmail: clientEmail || undefined,
      clientAddress: clientAddress || undefined,
      dueDate: dueDate || undefined,
      notes: notes || undefined,
      subtotal: fin.subtotal,
      vatAmount: fin.vatAmount,
      discountAmount: fin.discountAmount,
      total: fin.total,
    });

    const ok2 = await updateInvoiceLineItems(invoice.id, lineItems);

    setSaving(false);
    if (ok1 && ok2) {
      toast({ title: 'Factuur opgeslagen' });
      setEditing(false);
      await loadInvoice();
    }
  };

  const handleSend = async () => {
    if (!invoice) return;
    const ok = await updateInvoiceStatus(invoice.id, 'sent');
    if (ok) {
      toast({ title: 'Factuur verzonden', description: 'Status bijgewerkt naar Verzonden.' });
      await loadInvoice();
    }
  };

  const handleMarkPaid = async () => {
    if (!invoice) return;
    const ok = await updateInvoiceStatus(invoice.id, 'paid');
    if (ok) {
      toast({ title: 'Factuur betaald', description: 'Status bijgewerkt naar Betaald.' });
      await loadInvoice();
    }
  };

  const handleDelete = async () => {
    if (!invoice) return;
    const ok = await deleteInvoice(invoice.id);
    if (ok) {
      toast({ title: 'Factuur verwijderd' });
      navigate('/quotes');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-muted-foreground">Laden...</p>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-muted-foreground">Factuur niet gevonden</p>
      </div>
    );
  }

  const isEditable = isDraft || editing;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/quotes')}>
          <ArrowLeft size={18} />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-foreground">{invoice.displayNumber}</h1>
            <QuoteStatusBadge status={invoice.status} />
          </div>
          <p className="text-sm text-muted-foreground">{invoice.title}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isDraft && !editing && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="gap-1.5">
              <Pencil size={14} /> Bewerken
            </Button>
          )}
          {isEditable && (
            <Button variant="outline" size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
              <Save size={14} /> {saving ? 'Opslaan...' : 'Opslaan'}
            </Button>
          )}
          {isDraft && (
            <Button size="sm" onClick={handleSend} className="gap-1.5">
              <Send size={14} /> Verzenden
            </Button>
          )}
          {(invoice.status === 'sent' || invoice.status === 'overdue') && (
            <Button size="sm" variant="default" onClick={handleMarkPaid} className="gap-1.5">
              <CheckCircle size={14} /> Markeer als betaald
            </Button>
          )}
          {isDraft && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive">
                  <Trash2 size={14} /> Verwijderen
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Factuur verwijderen?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Dit kan niet ongedaan worden gemaakt.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuleren</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
                    Verwijderen
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Client info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Klantgegevens</CardTitle>
        </CardHeader>
        <CardContent>
          {isEditable ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Titel</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Vervaldatum</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Contactpersoon</Label>
                <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <Input value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Bedrijf</Label>
                <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Adres</Label>
                <Input value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground font-semibold mb-0.5">Contactpersoon</p>
                <p>{invoice.contactName}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-semibold mb-0.5">E-mail</p>
                <p>{invoice.clientEmail || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-semibold mb-0.5">Bedrijf</p>
                <p>{invoice.companyName || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-semibold mb-0.5">Adres</p>
                <p>{invoice.clientAddress || '—'}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Line items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Producten & Diensten</CardTitle>
        </CardHeader>
        <CardContent>
          <LineItemsEditor
            items={lineItems}
            onChange={isEditable ? setLineItems : () => {}}
            readOnly={!isEditable}
          />
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notities</CardTitle>
        </CardHeader>
        <CardContent>
          {isEditable ? (
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Interne notities..."
              className="min-h-[80px]"
            />
          ) : (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {invoice.notes || 'Geen notities'}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Linked quote */}
      {invoice.quoteId && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Gekoppeld aan offerte
              </p>
              <Button variant="link" size="sm" onClick={() => navigate(`/quotes/${invoice.quoteId}`)}>
                Bekijk offerte →
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Metadata */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs text-muted-foreground">
            <div>
              <p className="font-semibold mb-0.5">Aangemaakt</p>
              <p>{format(new Date(invoice.createdAt), 'dd MMM yyyy HH:mm', { locale: nl })}</p>
            </div>
            {invoice.dueDate && (
              <div>
                <p className="font-semibold mb-0.5">Vervaldatum</p>
                <p>{format(new Date(invoice.dueDate), 'dd MMM yyyy', { locale: nl })}</p>
              </div>
            )}
            {invoice.sentAt && (
              <div>
                <p className="font-semibold mb-0.5">Verzonden</p>
                <p>{format(new Date(invoice.sentAt), 'dd MMM yyyy HH:mm', { locale: nl })}</p>
              </div>
            )}
            {invoice.paidAt && (
              <div>
                <p className="font-semibold mb-0.5">Betaald</p>
                <p>{format(new Date(invoice.paidAt), 'dd MMM yyyy HH:mm', { locale: nl })}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
