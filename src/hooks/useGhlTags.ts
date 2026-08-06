import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Reads the fixed list of tags that exist in GoHighLevel.
 * New tags are only created in GHL ("oude omgeving"), never here.
 */
export function useGhlTags() {
  const { user } = useAuth();
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTags = useCallback(async () => {
    if (!user) return;
    const { data } = await (supabase as any)
      .from('ghl_tags')
      .select('name')
      .order('name');

    if (data) {
      setTags((data as { name: string }[]).map((t) => t.name).filter(Boolean));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchTags(); }, [fetchTags]);

  return { tags, loading, refetch: fetchTags };
}
