import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type { QuoteTemplate } from '@/types/quotation';

export interface TemplateWithContent extends QuoteTemplate {
  pdfUrl?: string | null;
  overlayFields?: any[];
}

function mapRow(r: any): TemplateWithContent {
  const contentBlocks = r.content_blocks || {};
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    description: r.description,
    contentBlocks: contentBlocks,
    defaultLineItems: r.default_line_items || [],
    termsAndConditions: r.terms_and_conditions,
    isDefault: r.is_default,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    pdfUrl: contentBlocks?.pdfUrl || null,
    overlayFields: contentBlocks?.overlayFields || [],
  };
}

export function useQuoteTemplates() {
  const [templates, setTemplates] = useState<TemplateWithContent[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchTemplates = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('quote_templates')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      toast({ title: 'Fout bij laden sjablonen', description: error.message, variant: 'destructive' });
      return;
    }
    setTemplates((data || []).map(mapRow));
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const createTemplate = useCallback(async (
    name: string,
    contentBlocks: any,
    termsAndConditions?: string,
    description?: string,
  ) => {
    if (!user) return null;

    const { data, error } = await supabase.from('quote_templates').insert({
      user_id: user.id,
      name,
      description: description || null,
      content_blocks: contentBlocks,
      terms_and_conditions: termsAndConditions || null,
    }).select().single();

    if (error) {
      toast({ title: 'Fout bij opslaan sjabloon', description: error.message, variant: 'destructive' });
      return null;
    }
    await fetchTemplates();
    return data ? mapRow(data) : null;
  }, [user, fetchTemplates]);

  const updateTemplate = useCallback(async (
    id: string,
    updates: {
      name?: string;
      contentBlocks?: any;
      termsAndConditions?: string;
      description?: string;
    }
  ) => {
    const dbUpdates: any = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.termsAndConditions !== undefined) dbUpdates.terms_and_conditions = updates.termsAndConditions;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.contentBlocks !== undefined) dbUpdates.content_blocks = updates.contentBlocks;

    const { error } = await supabase.from('quote_templates').update(dbUpdates).eq('id', id);
    if (error) {
      toast({ title: 'Fout bij updaten sjabloon', description: error.message, variant: 'destructive' });
      return false;
    }
    await fetchTemplates();
    return true;
  }, [fetchTemplates]);

  const deleteTemplate = useCallback(async (id: string) => {
    const { error } = await supabase.from('quote_templates').delete().eq('id', id);
    if (error) {
      toast({ title: 'Fout bij verwijderen sjabloon', description: error.message, variant: 'destructive' });
      return false;
    }
    await fetchTemplates();
    return true;
  }, [fetchTemplates]);

  return { templates, loading, createTemplate, updateTemplate, deleteTemplate, refetch: fetchTemplates };
}
