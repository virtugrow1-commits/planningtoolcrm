
-- Step 1: Delete related contact_activities for duplicate contacts
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY first_name, last_name
      ORDER BY 
        CASE WHEN ghl_contact_id IS NOT NULL THEN 0 ELSE 1 END,
        CASE WHEN email IS NOT NULL AND email != '' THEN 0 ELSE 1 END,
        CASE WHEN phone IS NOT NULL AND phone != '' THEN 0 ELSE 1 END,
        created_at ASC
    ) as rn,
    COUNT(*) OVER (PARTITION BY first_name, last_name) as group_size
  FROM contacts
),
to_delete AS (
  SELECT id FROM ranked WHERE rn > 1 AND group_size > 1
)
DELETE FROM contact_activities WHERE contact_id IN (SELECT id FROM to_delete);

-- Step 2: Delete related contact_companies for duplicate contacts
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY first_name, last_name
      ORDER BY 
        CASE WHEN ghl_contact_id IS NOT NULL THEN 0 ELSE 1 END,
        CASE WHEN email IS NOT NULL AND email != '' THEN 0 ELSE 1 END,
        CASE WHEN phone IS NOT NULL AND phone != '' THEN 0 ELSE 1 END,
        created_at ASC
    ) as rn,
    COUNT(*) OVER (PARTITION BY first_name, last_name) as group_size
  FROM contacts
),
to_delete AS (
  SELECT id FROM ranked WHERE rn > 1 AND group_size > 1
)
DELETE FROM contact_companies WHERE contact_id IN (SELECT id FROM to_delete);

-- Step 3: Nullify references in bookings
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY first_name, last_name
      ORDER BY 
        CASE WHEN ghl_contact_id IS NOT NULL THEN 0 ELSE 1 END,
        CASE WHEN email IS NOT NULL AND email != '' THEN 0 ELSE 1 END,
        CASE WHEN phone IS NOT NULL AND phone != '' THEN 0 ELSE 1 END,
        created_at ASC
    ) as rn,
    COUNT(*) OVER (PARTITION BY first_name, last_name) as group_size
  FROM contacts
),
to_delete AS (
  SELECT id FROM ranked WHERE rn > 1 AND group_size > 1
)
UPDATE bookings SET contact_id = NULL WHERE contact_id IN (SELECT id FROM to_delete);

-- Step 4: Nullify references in inquiries
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY first_name, last_name
      ORDER BY 
        CASE WHEN ghl_contact_id IS NOT NULL THEN 0 ELSE 1 END,
        CASE WHEN email IS NOT NULL AND email != '' THEN 0 ELSE 1 END,
        CASE WHEN phone IS NOT NULL AND phone != '' THEN 0 ELSE 1 END,
        created_at ASC
    ) as rn,
    COUNT(*) OVER (PARTITION BY first_name, last_name) as group_size
  FROM contacts
),
to_delete AS (
  SELECT id FROM ranked WHERE rn > 1 AND group_size > 1
)
UPDATE inquiries SET contact_id = NULL WHERE contact_id IN (SELECT id FROM to_delete);

-- Step 5: Nullify references in documents
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY first_name, last_name
      ORDER BY 
        CASE WHEN ghl_contact_id IS NOT NULL THEN 0 ELSE 1 END,
        CASE WHEN email IS NOT NULL AND email != '' THEN 0 ELSE 1 END,
        CASE WHEN phone IS NOT NULL AND phone != '' THEN 0 ELSE 1 END,
        created_at ASC
    ) as rn,
    COUNT(*) OVER (PARTITION BY first_name, last_name) as group_size
  FROM contacts
),
to_delete AS (
  SELECT id FROM ranked WHERE rn > 1 AND group_size > 1
)
UPDATE documents SET contact_id = NULL WHERE contact_id IN (SELECT id FROM to_delete);

-- Step 6: Delete the duplicate contacts
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY first_name, last_name
      ORDER BY 
        CASE WHEN ghl_contact_id IS NOT NULL THEN 0 ELSE 1 END,
        CASE WHEN email IS NOT NULL AND email != '' THEN 0 ELSE 1 END,
        CASE WHEN phone IS NOT NULL AND phone != '' THEN 0 ELSE 1 END,
        created_at ASC
    ) as rn,
    COUNT(*) OVER (PARTITION BY first_name, last_name) as group_size
  FROM contacts
),
to_delete AS (
  SELECT id FROM ranked WHERE rn > 1 AND group_size > 1
)
DELETE FROM contacts WHERE id IN (SELECT id FROM to_delete)
