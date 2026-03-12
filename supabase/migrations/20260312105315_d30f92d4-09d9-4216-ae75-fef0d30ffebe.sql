
-- Step 1: Reassign bookings from empty duplicates to the "better" contact
UPDATE bookings b
SET contact_id = better.id
FROM contacts c1
JOIN LATERAL (
  SELECT c2.id FROM contacts c2
  WHERE lower(c2.first_name) = lower(c1.first_name)
    AND lower(c2.last_name) = lower(c1.last_name)
    AND c2.id != c1.id
    AND (c2.email IS NOT NULL AND c2.email != '' OR c2.phone IS NOT NULL AND c2.phone != '')
  ORDER BY c2.created_at ASC
  LIMIT 1
) better ON true
WHERE b.contact_id = c1.id
  AND (c1.email IS NULL OR c1.email = '')
  AND (c1.phone IS NULL OR c1.phone = '')
  AND EXISTS (
    SELECT 1 FROM contacts c3
    WHERE lower(c3.first_name) = lower(c1.first_name)
      AND lower(c3.last_name) = lower(c1.last_name)
      AND c3.id != c1.id
  );

-- Step 2: Delete contact_activities linked to empty duplicates
DELETE FROM contact_activities
WHERE contact_id IN (
  SELECT c1.id FROM contacts c1
  WHERE EXISTS (
    SELECT 1 FROM contacts c2
    WHERE lower(c2.first_name) = lower(c1.first_name)
      AND lower(c2.last_name) = lower(c1.last_name)
      AND c2.id != c1.id
  )
  AND (c1.email IS NULL OR c1.email = '')
  AND (c1.phone IS NULL OR c1.phone = '')
);

-- Step 3: Delete contact_companies linked to empty duplicates
DELETE FROM contact_companies
WHERE contact_id IN (
  SELECT c1.id FROM contacts c1
  WHERE EXISTS (
    SELECT 1 FROM contacts c2
    WHERE lower(c2.first_name) = lower(c1.first_name)
      AND lower(c2.last_name) = lower(c1.last_name)
      AND c2.id != c1.id
  )
  AND (c1.email IS NULL OR c1.email = '')
  AND (c1.phone IS NULL OR c1.phone = '')
);

-- Step 4: Delete the duplicate contacts without email/phone
DELETE FROM contacts
WHERE id IN (
  SELECT c1.id FROM contacts c1
  WHERE EXISTS (
    SELECT 1 FROM contacts c2
    WHERE lower(c2.first_name) = lower(c1.first_name)
      AND lower(c2.last_name) = lower(c1.last_name)
      AND c2.id != c1.id
  )
  AND (c1.email IS NULL OR c1.email = '')
  AND (c1.phone IS NULL OR c1.phone = '')
)
