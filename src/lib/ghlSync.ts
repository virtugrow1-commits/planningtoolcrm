import { supabase } from '@/integrations/supabase/client';

interface SyncOptions {
  /** Entity type for sync queue (e.g. 'contact', 'company', 'booking', 'inquiry', 'task') */
  entityType?: string;
  /** Entity ID for sync queue */
  entityId?: string;
  /** Action type for sync queue (e.g. 'create', 'update', 'delete') */
  actionType?: string;
}

export type SyncOutcome = 'success' | 'queued' | 'inactive' | 'skipped' | 'error';

export interface SyncResult {
  outcome: SyncOutcome;
  /** Raw response from the edge function (if any) */
  data?: any;
  /** Human-readable error message when outcome is 'error' or 'queued' */
  error?: string;
}

/**
 * Push to VirtuGrow via edge function.
 * Awaits the response so GHL is always updated BEFORE the local CRM marks itself as synced.
 * On failure: queues to sync_queue for automatic retry, logs to sync_log,
 * AND updates the originating record's sync-status fields when entity tracking is provided.
 */
export async function pushToGHL(
  action: string,
  data: Record<string, any>,
  options?: SyncOptions
): Promise<SyncResult> {
  try {
    const { data: result, error } = await supabase.functions.invoke('ghl-sync', {
      body: { action, ...data },
    });
    if (error) {
      const msg = error?.message || 'Edge function error';
      if (isCalendarInactive(msg)) {
        console.info(`[VGW Sync] ${action} skipped: calendar inactive`);
        if (options?.entityType && options?.entityId) {
          logSyncResult(options.entityType, options.entityId, action, { info: 'calendar_inactive' }, 'success').catch(() => {});
          markEntitySynced(options.entityType, options.entityId).catch(() => {});
        }
        return { outcome: 'inactive' };
      }
      console.warn(`[VGW Sync] ${action} failed:`, error);
      await handleSyncFailure(action, data, options, msg);
      return { outcome: 'queued', error: msg };
    }
    // Detect inactive-calendar response wrapped in a 200
    if (result && typeof result === 'object' && (result.error || result.status === 'inactive')) {
      const text = JSON.stringify(result);
      if (isCalendarInactive(text)) {
        console.info(`[VGW Sync] ${action} skipped: calendar inactive (response)`);
        if (options?.entityType && options?.entityId) {
          logSyncResult(options.entityType, options.entityId, action, { info: 'calendar_inactive' }, 'success').catch(() => {});
          markEntitySynced(options.entityType, options.entityId).catch(() => {});
        }
        return { outcome: 'inactive', data: result };
      }
      // Edge function returned a 200 but with an error payload
      if (result.error) {
        const msg = String(result.error);
        await handleSyncFailure(action, data, options, msg);
        return { outcome: 'queued', data: result, error: msg };
      }
    }
    // Success path
    if (options?.entityType && options?.entityId) {
      logSyncResult(options.entityType, options.entityId, action, data, 'success').catch(() => {});
      markEntitySynced(options.entityType, options.entityId).catch(() => {});
    }
    return { outcome: 'success', data: result };
  } catch (err: any) {
    const msg = err?.message || 'Unknown error';
    if (isCalendarInactive(msg)) {
      console.info(`[VGW Sync] ${action} skipped: calendar inactive`);
      if (options?.entityType && options?.entityId) {
        markEntitySynced(options.entityType, options.entityId).catch(() => {});
      }
      return { outcome: 'inactive' };
    }
    console.warn(`[VGW Sync] ${action} failed:`, err);
    await handleSyncFailure(action, data, options, msg);
    return { outcome: 'queued', error: msg };
  }
}

/** Detect "calendar inactive" patterns from various GHL/edge error messages */
function isCalendarInactive(text: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  return t.includes('kalender is inactief')
      || t.includes('calendar is inactive')
      || t.includes('calendar_inactive')
      || t.includes('calendar inactive');
}

/** Queue failed sync for automatic retry AND mark the source record as still pending */
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

    // Mark the originating record as still pending sync, with the latest error
    await markEntitySyncError(options.entityType, options.entityId, errorMessage);
  } catch (e) {
    console.error('[SyncQueue] Failed to queue:', e);
  }
}

/** Update sync-status columns on contacts/companies after a successful push */
async function markEntitySynced(entityType: string, entityId: string) {
  if (entityType !== 'contact' && entityType !== 'company') return;
  const table = entityType === 'contact' ? 'contacts' : 'companies';
  try {
    await (supabase as any).from(table).update({
      pending_outbound_sync: false,
      last_synced_at: new Date().toISOString(),
      last_sync_error: null,
    }).eq('id', entityId);
  } catch (e) {
    console.warn(`[SyncStatus] Could not mark ${entityType} ${entityId} as synced:`, e);
  }
}

/** Update sync-status columns on contacts/companies after a failed push */
async function markEntitySyncError(entityType: string, entityId: string, errorMessage: string) {
  if (entityType !== 'contact' && entityType !== 'company') return;
  const table = entityType === 'contact' ? 'contacts' : 'companies';
  try {
    await (supabase as any).from(table).update({
      pending_outbound_sync: true,
      last_sync_error: errorMessage?.slice(0, 1000) || 'Sync mislukt',
    }).eq('id', entityId);
  } catch (e) {
    console.warn(`[SyncStatus] Could not mark ${entityType} ${entityId} sync error:`, e);
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
