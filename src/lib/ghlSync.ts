import { supabase } from '@/integrations/supabase/client';

/**
 * Fire-and-forget push to GHL via edge function.
 * Errors are logged but never block the UI.
 */
export async function pushToGHL(action: string, data: Record<string, any>) {
  try {
    await supabase.functions.invoke('ghl-sync', {
      body: { action, ...data },
    });
  } catch (err) {
    console.warn(`[GHL Sync] ${action} failed:`, err);
  }
}
