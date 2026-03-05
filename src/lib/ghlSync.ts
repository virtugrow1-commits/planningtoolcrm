import { supabase } from '@/integrations/supabase/client';

/**
 * Push to VirtuGrow via edge function.
 * Awaits the response so GHL is always updated BEFORE the local CRM.
 * Returns the response data or null on failure.
 */
export async function pushToGHL(action: string, data: Record<string, any>): Promise<any | null> {
  try {
    const { data: result, error } = await supabase.functions.invoke('ghl-sync', {
      body: { action, ...data },
    });
    if (error) {
      console.warn(`[VGW Sync] ${action} failed:`, error);
      return null;
    }
    return result;
  } catch (err) {
    console.warn(`[VGW Sync] ${action} failed:`, err);
    return null;
  }
}
