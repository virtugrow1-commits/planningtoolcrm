import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Save, CheckCircle, Pencil, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useInvoices } from '@/hooks/useInvoices';
import QuoteStatusBadge from '@/components/quotation/QuoteStatusBadge';
import LineItemsEditor from '@/components/quotation/LineItemsEditor';
import ClientInfoCard from '@/components/quotation/ClientInfoCard';
import DeleteConfirmDialog from '@/components/quotation/DeleteConfirmDialog';
import DocumentMetadata, { formatDate } from '@/components/quotation/DocumentMetadata';
import type { Invoice, LineItem } from '@/types/quotation';
import { calcFinancials } from '@/types/quotation';
import { useToast } from '@/hooks/use-toast';

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getInvoiceWithItems, updateInvoice, updateInvoiceStatus, updateInvoiceLineItems, deleteInvoice } = useInvoices();
  const { toast } = useToast();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

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
  const isEditable = isDraft && editing;

  const handleSave = async () => {
    if (!invoice) return;
    setSaving(true);
    const fin = calcFinancials(lineItems);

    const ok1 = await updateInvoice(invoice.id, {
      title, contactName,
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
      toast({ title: 'Factuur verzonden' });
      await loadInvoice();
    }
  };

  const handleMarkPaid = async () => {
    if (!invoice) return;
    const ok = await updateInvoiceStatus(invoice.id, 'paid');
    if (ok) {
      toast({ title: 'Factuur als betaald gemarkeerd' });
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

  if (loading) return <div className="flex items-center justify-center min-h-[50vh]"><p className="text-muted-foreground">Laden...</p></div>;
  if (!invoice) return <div className="flex items-center justify-center min-h-[50vh]"><p className="text-muted-foreground">Factuur niet gevonden</p></div>;

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
            <Button size="sm" onClick={handleMarkPaid} className="gap-1.5">
              <CheckCircle size={14} /> Markeer als betaald
            </Button>
          )}
          {isDraft && <DeleteConfirmDialog title="Factuur verwijderen?" onConfirm={handleDelete} />}
        </div>
      </div>

      {/* Client info */}
      {isEditable ? (
        <Card>
          <CardHeader><CardTitle className="text-base">Klant & Factuurgegevens</CardTitle></CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      ) : (
        <ClientInfoCard
          data={{
            contactId: '', contactName: invoice.contactName, companyId: '', companyName: invoice.companyName || '',
            clientEmail: invoice.clientEmail || '', clientAddress: invoice.clientAddress || '',
          }}
          readOnly
        />
      )}

      {/* Line items */}
      <Card>
        <CardHeader><CardTitle className="text-base">Producten & Diensten</CardTitle></CardHeader>
        <CardContent>
          <LineItemsEditor items={lineItems} onChange={isEditable ? setLineItems : () => {}} readOnly={!isEditable} />
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader><CardTitle className="text-base">Notities</CardTitle></CardHeader>
        <CardContent>
          {isEditable ? (
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Interne notities..." className="min-h-[80px]" />
          ) : (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{invoice.notes || 'Geen notities'}</p>
          )}
        </CardContent>
      </Card>

      {/* Linked quote */}
      {invoice.quoteId && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Gekoppeld aan offerte</p>
              <Button variant="link" size="sm" onClick={() => navigate(`/quotes/${invoice.quoteId}`)} className="gap-1.5">
                <ExternalLink size={14} /> Bekijk offerte
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Metadata */}
      <DocumentMetadata
        items={[
          { label: 'Aangemaakt', value: formatDate(invoice.createdAt) },
          { label: 'Vervaldatum', value: invoice.dueDate ? formatDate(invoice.dueDate, false) : undefined },
          { label: 'Verzonden', value: invoice.sentAt ? formatDate(invoice.sentAt) : undefined },
          { label: 'Betaald', value: invoice.paidAt ? formatDate(invoice.paidAt) : undefined },
        ]}
      />
    </div>
  );
}
