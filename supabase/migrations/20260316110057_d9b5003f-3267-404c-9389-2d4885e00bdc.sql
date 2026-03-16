
-- Step 1: Delete contact_companies links to contacts without email AND phone
DELETE FROM contact_companies
WHERE contact_id IN (
  SELECT id FROM contacts
  WHERE (email IS NULL OR email = '') AND (phone IS NULL OR phone = '')
);

-- Step 2: Delete contact_activities for these orphan contacts  
DELETE FROM contact_activities
WHERE contact_id IN (
  SELECT id FROM contacts
  WHERE (email IS NULL OR email = '') AND (phone IS NULL OR phone = '')
);

-- Step 3: Nullify references in bookings/inquiries/documents
UPDATE bookings SET contact_id = NULL
WHERE contact_id IN (
  SELECT id FROM contacts
  WHERE (email IS NULL OR email = '') AND (phone IS NULL OR phone = '')
);

UPDATE inquiries SET contact_id = NULL
WHERE contact_id IN (
  SELECT id FROM contacts
  WHERE (email IS NULL OR email = '') AND (phone IS NULL OR phone = '')
);

UPDATE documents SET contact_id = NULL
WHERE contact_id IN (
  SELECT id FROM contacts
  WHERE (email IS NULL OR email = '') AND (phone IS NULL OR phone = '')
);

-- Step 4: Delete the incomplete contacts themselves
DELETE FROM contacts
WHERE (email IS NULL OR email = '') AND (phone IS NULL OR phone = '')
