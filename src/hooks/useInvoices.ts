import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type { Invoice, LineItem } from '@/types/quotation';

function mapRow(r: any): Invoice {
  return {
    id: r.id,
    displayNumber: r.display_number,
    userId: r.user_id,
    quoteId: r.quote_id,
    contactId: r.contact_id,
    companyId: r.company_id,
    contactName: r.contact_name,
    companyName: r.company_name,
    clientEmail: r.client_email,
    clientAddress: r.client_address,
    title: r.title,
    subtotal: Number(r.subtotal),
    vatAmount: Number(r.vat_amount),
    discountAmount: Number(r.discount_amount),
    total: Number(r.total),
    status: r.status,
    dueDate: r.due_date,
    sentAt: r.sent_at,
    paidAt: r.paid_at,
    paymentMethod: r.payment_method,
    stripePaymentLink: r.stripe_payment_link,
    stripeInvoiceId: r.stripe_invoice_id,
    ghlInvoiceId: r.ghl_invoice_id,
    eboekhoudenMutationId: r.eboekhouden_mutation_id,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapLineItem(r: any): LineItem {
  return {
    id: r.id,
    sortOrder: r.sort_order,
    itemName: r.item_name,
    description: r.description,
    quantity: Number(r.quantity),
    unitPrice: Number(r.unit_price),
    vatRate: Number(r.vat_rate),
    discountPercent: Number(r.discount_percent),
    lineTotal: Number(r.line_total),
  };
}

export function useInvoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchInvoices = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      toast({ title: 'Fout bij laden facturen', description: error.message, variant: 'destructive' });
      return;
    }
    setInvoices((data || []).map(mapRow));
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  const getInvoiceWithItems = useCallback(async (id: string): Promise<Invoice | null> => {
    const { data: inv, error } = await supabase.from('invoices').select('*').eq('id', id).single();
    if (error || !inv) return null;

    const { data: items } = await supabase
      .from('invoice_line_items')
      .select('*')
      .eq('invoice_id', id)
      .order('sort_order');

    const invoice = mapRow(inv);
    invoice.lineItems = (items || []).map(mapLineItem);
    return invoice;
  }, []);

  const createInvoiceFromQuote = useCallback(async (quoteId: string) => {
    if (!user) return null;

    const { data: q } = await supabase.from('quotes').select('*').eq('id', quoteId).single();
    if (!q) return null;

    const { data: items } = await supabase
      .from('quote_line_items')
      .select('*')
      .eq('quote_id', quoteId)
      .order('sort_order');

    const { data: inv, error } = await supabase.from('invoices').insert({
      user_id: user.id,
      quote_id: quoteId,
      contact_id: q.contact_id,
      company_id: q.company_id,
      contact_name: q.contact_name,
      company_name: q.company_name,
      client_email: q.client_email,
      client_address: q.client_address,
      title: `Factuur - ${q.title}`,
      subtotal: q.subtotal,
      vat_amount: q.vat_amount,
      discount_amount: q.discount_amount,
      total: q.total,
      status: 'draft',
      due_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    }).select().single();

    if (error || !inv) {
      toast({ title: 'Fout bij aanmaken factuur', description: error?.message, variant: 'destructive' });
      return null;
    }

    if (items && items.length > 0) {
      await supabase.from('invoice_line_items').insert(
        items.map((li: any) => ({
          invoice_id: inv.id,
          sort_order: li.sort_order,
          item_name: li.item_name,
          description: li.description,
          quantity: li.quantity,
          unit_price: li.unit_price,
          vat_rate: li.vat_rate,
          discount_percent: li.discount_percent,
          line_total: li.line_total,
        }))
      );
    }

    await fetchInvoices();
    toast({ title: 'Factuur aangemaakt', description: `${inv.display_number || 'Factuur'} is aangemaakt als concept.` });
    return mapRow(inv);
  }, [user, fetchInvoices]);

  const updateInvoice = useCallback(async (id: string, updates: Partial<Invoice>) => {
    const dbUpdates: any = {};
    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.contactName !== undefined) dbUpdates.contact_name = updates.contactName;
    if (updates.companyName !== undefined) dbUpdates.company_name = updates.companyName;
    if (updates.clientEmail !== undefined) dbUpdates.client_email = updates.clientEmail;
    if (updates.clientAddress !== undefined) dbUpdates.client_address = updates.clientAddress;
    if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
    if (updates.subtotal !== undefined) dbUpdates.subtotal = updates.subtotal;
    if (updates.vatAmount !== undefined) dbUpdates.vat_amount = updates.vatAmount;
    if (updates.discountAmount !== undefined) dbUpdates.discount_amount = updates.discountAmount;
    if (updates.total !== undefined) dbUpdates.total = updates.total;
    if (updates.dueDate !== undefined) dbUpdates.due_date = updates.dueDate;
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.paymentMethod !== undefined) dbUpdates.payment_method = updates.paymentMethod;

    const { error } = await supabase.from('invoices').update(dbUpdates).eq('id', id);
    if (error) {
      toast({ title: 'Fout bij updaten factuur', description: error.message, variant: 'destructive' });
      return false;
    }
    await fetchInvoices();
    return true;
  }, [fetchInvoices]);

  const updateInvoiceStatus = useCallback(async (id: string, status: string) => {
    const updates: any = { status };
    if (status === 'sent') updates.sent_at = new Date().toISOString();
    if (status === 'paid') updates.paid_at = new Date().toISOString();

    const { error } = await supabase.from('invoices').update(updates).eq('id', id);
    if (error) {
      toast({ title: 'Fout bij updaten status', description: error.message, variant: 'destructive' });
      return false;
    }
    await fetchInvoices();
    return true;
  }, [fetchInvoices]);

  const updateInvoiceLineItems = useCallback(async (invoiceId: string, items: LineItem[]) => {
    // Delete existing
    await supabase.from('invoice_line_items').delete().eq('invoice_id', invoiceId);

    if (items.length > 0) {
      const { error } = await supabase.from('invoice_line_items').insert(
        items.map((li, i) => ({
          invoice_id: invoiceId,
          sort_order: i,
          item_name: li.itemName,
          description: li.description || null,
          quantity: li.quantity,
          unit_price: li.unitPrice,
          vat_rate: li.vatRate,
          discount_percent: li.discountPercent,
          line_total: li.lineTotal,
        }))
      );
      if (error) {
        toast({ title: 'Fout bij opslaan regelitems', description: error.message, variant: 'destructive' });
        return false;
      }
    }
    return true;
  }, []);

  const deleteInvoice = useCallback(async (id: string) => {
    await supabase.from('invoice_line_items').delete().eq('invoice_id', id);
    const { error } = await supabase.from('invoices').delete().eq('id', id);
    if (error) {
      toast({ title: 'Fout bij verwijderen', description: error.message, variant: 'destructive' });
      return false;
    }
    await fetchInvoices();
    return true;
  }, [fetchInvoices]);

  return {
    invoices,
    loading,
    createInvoiceFromQuote,
    getInvoiceWithItems,
    updateInvoice,
    updateInvoiceStatus,
    updateInvoiceLineItems,
    deleteInvoice,
    refetch: fetchInvoices,
  };
}
