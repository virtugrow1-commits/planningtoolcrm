import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type { Quote, LineItem } from '@/types/quotation';

function mapRow(r: any): Quote {
  return {
    id: r.id,
    displayNumber: r.display_number,
    userId: r.user_id,
    contactId: r.contact_id,
    companyId: r.company_id,
    templateId: r.template_id,
    contactName: r.contact_name,
    companyName: r.company_name,
    clientEmail: r.client_email,
    clientAddress: r.client_address,
    title: r.title,
    introduction: r.introduction,
    termsAndConditions: r.terms_and_conditions,
    notes: r.notes,
    subtotal: Number(r.subtotal),
    vatAmount: Number(r.vat_amount),
    discountAmount: Number(r.discount_amount),
    total: Number(r.total),
    status: r.status,
    validUntil: r.valid_until,
    sentAt: r.sent_at,
    viewedAt: r.viewed_at,
    acceptedAt: r.accepted_at,
    declinedAt: r.declined_at,
    signatureData: r.signature_data,
    signatureIp: r.signature_ip,
    signedPdfUrl: r.signed_pdf_url,
    publicToken: r.public_token,
    ghlOpportunityId: r.ghl_opportunity_id,
    pdfUrl: r.pdf_url,
    overlayFields: r.overlay_fields || [],
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

export function useQuotes() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchQuotes = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('quotes')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      toast({ title: 'Fout bij laden offertes', description: error.message, variant: 'destructive' });
      return;
    }
    setQuotes((data || []).map(mapRow));
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchQuotes(); }, [fetchQuotes]);

  const createQuote = useCallback(async (
    quoteData: Partial<Quote>,
    lineItems: Omit<LineItem, 'id'>[]
  ) => {
    if (!user) return null;
    const { data, error } = await supabase.from('quotes').insert({
      user_id: user.id,
      contact_id: quoteData.contactId || null,
      company_id: quoteData.companyId || null,
      template_id: quoteData.templateId || null,
      contact_name: quoteData.contactName || 'Onbekend',
      company_name: quoteData.companyName || null,
      client_email: quoteData.clientEmail || null,
      client_address: quoteData.clientAddress || null,
      title: quoteData.title || 'Offerte',
      introduction: quoteData.introduction || null,
      terms_and_conditions: quoteData.termsAndConditions || null,
      notes: quoteData.notes || null,
      subtotal: quoteData.subtotal || 0,
      vat_amount: quoteData.vatAmount || 0,
      discount_amount: quoteData.discountAmount || 0,
      total: quoteData.total || 0,
      status: 'draft',
      valid_until: quoteData.validUntil || null,
    }).select().single();

    if (error) {
      toast({ title: 'Fout bij aanmaken offerte', description: error.message, variant: 'destructive' });
      return null;
    }

    // Insert line items
    if (data && lineItems.length > 0) {
      const { error: liError } = await supabase.from('quote_line_items').insert(
        lineItems.map((li, i) => ({
          quote_id: data.id,
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
      if (liError) {
        toast({ title: 'Fout bij opslaan regelitems', description: liError.message, variant: 'destructive' });
      }
    }

    await fetchQuotes();
    return data ? mapRow(data) : null;
  }, [user, fetchQuotes]);

  const updateQuoteStatus = useCallback(async (id: string, status: string) => {
    const updates: any = { status };
    if (status === 'sent') updates.sent_at = new Date().toISOString();
    if (status === 'accepted') updates.accepted_at = new Date().toISOString();
    if (status === 'declined') updates.declined_at = new Date().toISOString();

    const { error } = await supabase.from('quotes').update(updates).eq('id', id);
    if (error) {
      toast({ title: 'Fout bij updaten status', description: error.message, variant: 'destructive' });
      return;
    }
    await fetchQuotes();
  }, [fetchQuotes]);

  const getQuoteWithItems = useCallback(async (id: string): Promise<Quote | null> => {
    const { data: q, error } = await supabase.from('quotes').select('*').eq('id', id).single();
    if (error || !q) return null;

    const { data: items } = await supabase
      .from('quote_line_items')
      .select('*')
      .eq('quote_id', id)
      .order('sort_order');

    const quote = mapRow(q);
    quote.lineItems = (items || []).map(mapLineItem);
    return quote;
  }, []);

  return { quotes, loading, createQuote, updateQuoteStatus, getQuoteWithItems, refetch: fetchQuotes };
}
