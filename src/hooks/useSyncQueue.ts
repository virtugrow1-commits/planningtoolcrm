import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface SyncQueueItem {
  id: string;
  entity_type: string;
  entity_id: string;
  action_type: string;
  payload: any;
  status: string;
  retry_count: number;
  max_retries: number;
  last_error: string | null;
  last_attempt_at: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface SyncLogItem {
  id: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  details: any;
  status: string;
  created_at: string;
}

export function useSyncQueue() {
  const { user } = useAuth();
  const [queue, setQueue] = useState<SyncQueueItem[]>([]);
  const [logs, setLogs] = useState<SyncLogItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchQueue = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('sync_queue')
      .select('*')
      .in('status', ['pending', 'retrying', 'failed'])
      .order('created_at', { ascending: false })
      .limit(100);
    setQueue((data as any) || []);
  }, [user]);

  const fetchLogs = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('sync_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    setLogs((data as any) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchQueue();
    fetchLogs();
  }, [fetchQueue, fetchLogs]);

  const retryItem = useCallback(async (id: string) => {
    await supabase
      .from('sync_queue')
      .update({ status: 'pending', retry_count: 0 } as any)
      .eq('id', id);
    // Trigger the sync processor
    try {
      await supabase.functions.invoke('ghl-sync', {
        body: { action: 'process-sync-queue' },
      });
    } catch (_) {}
    await fetchQueue();
  }, [fetchQueue]);

  const dismissItem = useCallback(async (id: string) => {
    await supabase.from('sync_queue').delete().eq('id', id);
    await fetchQueue();
  }, [fetchQueue]);

  const retryAll = useCallback(async () => {
    await supabase
      .from('sync_queue')
      .update({ status: 'pending', retry_count: 0 } as any)
      .eq('status', 'failed');
    try {
      await supabase.functions.invoke('ghl-sync', {
        body: { action: 'process-sync-queue' },
      });
    } catch (_) {}
    await fetchQueue();
  }, [fetchQueue]);

  return { queue, logs, loading, retryItem, dismissItem, retryAll, refetch: async () => { await fetchQueue(); await fetchLogs(); } };
}
