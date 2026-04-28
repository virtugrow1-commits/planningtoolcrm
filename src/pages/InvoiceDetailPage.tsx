import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Save, CheckCircle, Pencil, ExternalLink, BookOpen, AlertTriangle, Clock } from 'lucide-react';
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
import { pushInvoiceToEboekhouden } from '@/lib/eboekhouden';
import { format, differenceInDays } from 'date-fns';
import { nl } from 'date-fns/locale';

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getInvoiceWithItems, updateInvoice, updateInvoiceStatus, updateInvoiceLineItems, deleteInvoice } = useInvoices();
  const { toast } = useToast();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pushingEboekhouden, setPushingEboekhouden] = useState(false);
  const hasUnsaved = useRef(false);

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

  useEffect(() => {
    if (editing) hasUnsaved.current = true;
  }, [title, contactName, clientEmail, clientAddress, dueDate, notes, lineItems]);

  const isDraft = invoice?.status === 'draft';
  const isEditable = isDraft && editing;
  const isOverdue = invoice?.status === 'sent' && invoice.dueDate &&
    new Date(invoice.dueDate) < new Date();

  const daysOverdue = invoice?.dueDate
    ? differenceInDays(new Date(), new Date(invoice.dueDate))
    : 0;

  const handleSave = async () => {
    if (!invoice || saving) return;
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
      hasUnsaved.current = false;
      toast({ title: 'Factuur opgeslagen' });
      setEditing(false);
      await loadInvoice();
    }
  };

  const handleSend = async () => {
    if (!invoice) return;
    if (editing) await handleSave();
    const ok = await updateInvoiceStatus(invoice.id, 'sent');
    if (ok) {
      toast({ title: 'Factuur gemarkeerd als verzonden' });
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

  const handleMarkOverdue = async () => {
    if (!invoice) return;
    const ok = await updateInvoiceStatus(invoice.id, 'overdue');
    if (ok) {
      toast({ title: 'Factuur gemarkeerd als verlopen' });
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

  const handlePushEboekhouden = async () => {
    if (!invoice) return;
    setPushingEboekhouden(true);
    const result = await pushInvoiceToEboekhouden(invoice.id);
    setPushingEboekhouden(false);
    if (result.success) {
      toast({
        title: 'Doorgestuurd naar e-Boekhouden',
        description: result.mutationId ? `Mutatienummer: ${result.mutationId}` : undefined,
      });
      await loadInvoice();
    } else {
      toast({ title: 'Fout bij e-Boekhouden', description: result.error, variant: 'destructive' });
    }
  };

  const handleBackClick = () => {
    if (editing && hasUnsaved.current) {
      if (window.confirm('Je hebt niet-opgeslagen wijzigingen. Toch weg?')) navigate('/quotes');
    } else {
      navigate('/quotes');
    }
  };

  if (loading) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] flex-col gap-3">
        <AlertTriangle size={32} className="text-muted-foreground" />
        <p className="text-muted-foreground">Factuur niet gevonden</p>
        <Button variant="outline" onClick={() => navigate('/quotes')}>Terug naar overzicht</Button>
      </div>
    );
  }

  return (
    <div className="pb-10 max-w-5xl mx-auto">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-background/85 backdrop-blur-md border-b border-border/60">
        <div className="px-4 md:px-6 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <Button variant="ghost" size="icon" onClick={handleBackClick} className="shrink-0">
            <ArrowLeft size={18} />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-lg md:text-xl font-bold text-foreground tracking-tight">{invoice.displayNumber}</h1>
              <QuoteStatusBadge status={isOverdue ? 'overdue' : invoice.status} />
              {isOverdue && daysOverdue > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-destructive bg-destructive/10 border border-destructive/25 px-2 py-0.5 rounded-full">
                  <Clock size={10} /> {daysOverdue} dag{daysOverdue !== 1 ? 'en' : ''} te laat
                </span>
              )}
              {editing && hasUnsaved.current && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-accent-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
                  Niet-opgeslagen wijzigingen
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate mt-0.5">{invoice.title}</p>
          </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* e-Boekhouden */}
          {invoice.eboekhoudenMutationId ? (
            <span className="text-xs text-green-600 flex items-center gap-1 px-2 py-1 bg-green-50 border border-green-200 rounded">
              <BookOpen size={12} /> e-Boekhouden ✓
            </span>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={handlePushEboekhouden}
              disabled={pushingEboekhouden || invoice.status === 'draft'}
              className="gap-1.5"
              title={invoice.status === 'draft' ? 'Verzend de factuur eerst' : 'Doorsturen naar e-Boekhouden'}
            >
              <BookOpen size={14} />
              {pushingEboekhouden ? 'Bezig...' : 'e-Boekhouden'}
            </Button>
          )}

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
              <Send size={14} /> Markeer verzonden
            </Button>
          )}

          {(invoice.status === 'sent' || invoice.status === 'overdue' || isOverdue) && (
            <>
              {isOverdue && invoice.status === 'sent' && (
                <Button variant="outline" size="sm" onClick={handleMarkOverdue} className="gap-1.5 text-amber-600 border-amber-300">
                  Markeer verlopen
                </Button>
              )}
              <Button size="sm" onClick={handleMarkPaid} className="gap-1.5 bg-green-600 hover:bg-green-700">
                <CheckCircle size={14} /> Betaald
              </Button>
            </>
          )}

          {isDraft && <DeleteConfirmDialog title="Factuur verwijderen?" onConfirm={handleDelete} />}
        </div>
        </div>
      </div>

      <div className="px-4 md:px-6 pt-6 space-y-6">
      {/* Overdue warning */}
      {(invoice.status === 'overdue' || isOverdue) && (
        <Card className="border-destructive/30 bg-destructive/10">
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <AlertTriangle size={16} className="text-destructive shrink-0" />
            <p className="text-sm text-destructive">
              Deze factuur is verlopen op {invoice.dueDate ? format(new Date(invoice.dueDate), 'dd MMMM yyyy', { locale: nl }) : '—'}.
              {daysOverdue > 0 && ` (${daysOverdue} dag${daysOverdue !== 1 ? 'en' : ''} geleden)`}
            </p>
          </CardContent>
        </Card>
      )}

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
                <Input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
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
            contactId: '',
            contactName: invoice.contactName,
            companyId: '',
            companyName: invoice.companyName || '',
            clientEmail: invoice.clientEmail || '',
            clientAddress: invoice.clientAddress || '',
          }}
          readOnly
        />
      )}

      {/* Line items */}
      <Card>
        <CardHeader><CardTitle className="text-base">Producten & Diensten</CardTitle></CardHeader>
        <CardContent>
          <LineItemsEditor
            items={lineItems}
            onChange={isEditable ? setLineItems : () => {}}
            readOnly={!isEditable}
          />
        </CardContent>
      </Card>

      {/* Notes */}
      {(isEditable || invoice.notes) && (
        <Card>
          <CardHeader><CardTitle className="text-base">Notities</CardTitle></CardHeader>
          <CardContent>
            {isEditable ? (
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Interne notities (niet zichtbaar voor klant)..."
                className="min-h-[80px]"
              />
            ) : (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{invoice.notes}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Linked quote */}
      {invoice.quoteId && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Afkomstig van offerte</p>
              <Button
                variant="link"
                size="sm"
                onClick={() => navigate(`/quotes/${invoice.quoteId}`)}
                className="gap-1.5"
              >
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
