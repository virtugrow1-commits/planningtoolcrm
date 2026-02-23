
-- Step 1: Delete duplicate bookings by ghl_event_id, keep oldest per ghl_event_id
DELETE FROM bookings
WHERE id NOT IN (
  SELECT DISTINCT ON (ghl_event_id) id
  FROM bookings
  WHERE ghl_event_id IS NOT NULL
  ORDER BY ghl_event_id, created_at ASC
)
AND ghl_event_id IS NOT NULL;

-- Step 2: Delete duplicate contacts by ghl_contact_id, keep oldest
DELETE FROM contacts
WHERE id NOT IN (
  SELECT DISTINCT ON (ghl_contact_id) id
  FROM contacts
  WHERE ghl_contact_id IS NOT NULL
  ORDER BY ghl_contact_id, created_at ASC
)
AND ghl_contact_id IS NOT NULL;

-- Step 3: Add unique constraints
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_unique_ghl_event
ON bookings (ghl_event_id) WHERE ghl_event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_unique_ghl_contact
ON contacts (ghl_contact_id) WHERE ghl_contact_id IS NOT NULL;
