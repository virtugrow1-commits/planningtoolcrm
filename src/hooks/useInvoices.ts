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

  const createInvoiceFromQuote = useCallback(async (quoteId: string) => {
    if (!user) return null;

    // Fetch quote + items
    const { data: q } = await supabase.from('quotes').select('*').eq('id', quoteId).single();
    if (!q) return null;

    const { data: items } = await supabase
      .from('quote_line_items')
      .select('*')
      .eq('quote_id', quoteId)
      .order('sort_order');

    // Create invoice
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

    // Copy line items
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
    toast({ title: 'Factuur aangemaakt', description: `${inv.display_number || 'Factuur'} is aangemaakt.` });
    return mapRow(inv);
  }, [user, fetchInvoices]);

  return { invoices, loading, createInvoiceFromQuote, refetch: fetchInvoices };
}
