import { supabase } from '@/integrations/supabase/client';

interface SyncOptions {
  /** Entity type for sync queue (e.g. 'contact', 'company', 'booking', 'inquiry', 'task') */
  entityType?: string;
  /** Entity ID for sync queue */
  entityId?: string;
  /** Action type for sync queue (e.g. 'create', 'update', 'delete') */
  actionType?: string;
}

/**
 * Push to VirtuGrow via edge function.
 * Awaits the response so GHL is always updated BEFORE the local CRM.
 * On failure: queues to sync_queue for automatic retry and logs to sync_log.
 */
export async function pushToGHL(
  action: string,
  data: Record<string, any>,
  options?: SyncOptions
): Promise<any | null> {
  try {
    const { data: result, error } = await supabase.functions.invoke('ghl-sync', {
      body: { action, ...data },
    });
    if (error) {
      console.warn(`[VGW Sync] ${action} failed:`, error);
      await handleSyncFailure(action, data, options, error?.message || 'Edge function error');
      return null;
    }
    // Log success if entity tracking provided
    if (options?.entityType && options?.entityId) {
      logSyncResult(options.entityType, options.entityId, action, data, 'success').catch(() => {});
    }
    return result;
  } catch (err: any) {
    console.warn(`[VGW Sync] ${action} failed:`, err);
    await handleSyncFailure(action, data, options, err?.message || 'Unknown error');
    return null;
  }
}

/** Queue failed sync for automatic retry */
async function handleSyncFailure(
  action: string,
  data: Record<string, any>,
  options: SyncOptions | undefined,
  errorMessage: string
) {
  if (!options?.entityType || !options?.entityId) return;
  
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Queue for retry
    await supabase.from('sync_queue').insert({
      user_id: user.id,
      entity_type: options.entityType,
      entity_id: options.entityId,
      action_type: options.actionType || action,
      payload: { action, ...data } as any,
      status: 'pending',
      last_error: errorMessage,
    } as any);

    // Log failure
    await logSyncResult(options.entityType, options.entityId, action, { error: errorMessage }, 'error');
  } catch (e) {
    console.error('[SyncQueue] Failed to queue:', e);
  }
}

/** Log sync result to sync_log */
async function logSyncResult(
  entityType: string,
  entityId: string,
  action: string,
  details: any,
  status: 'success' | 'error'
) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('sync_log').insert({
      user_id: user.id,
      entity_type: entityType,
      entity_id: entityId,
      action,
      details,
      status,
    } as any);
  } catch (_) { /* intentional */ }
}
