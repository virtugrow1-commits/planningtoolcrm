-- Mark all stuck booking items with "Calendar is inactive" as permanently failed
-- and clean up old completed/failed items
UPDATE public.sync_queue 
SET status = 'failed', 
    last_error = 'GHL kalender is inactief - permanent gestopt'
WHERE entity_type = 'booking' 
  AND status IN ('pending', 'retrying')
  AND (last_error ILIKE '%Calendar is inactive%' OR last_error ILIKE '%kalender is inactief%');

-- Also clean up any booking items that have been retrying > 3 times
UPDATE public.sync_queue
SET status = 'failed'
WHERE entity_type = 'booking'
  AND status IN ('pending', 'retrying')
  AND retry_count >= 3;

-- Remove old completed items (older than 7 days)
DELETE FROM public.sync_queue 
WHERE status = 'completed' 
  AND completed_at < now() - interval '7 days';

-- Remove old failed items (older than 14 days)
DELETE FROM public.sync_queue 
WHERE status = 'failed' 
  AND created_at < now() - interval '14 days';