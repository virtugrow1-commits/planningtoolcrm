
-- =========================================================
-- CONSOLIDATE ALL CRM DATA UNDER WILLEM
-- =========================================================

-- ============ CONTACTS ============
-- Migrate references from support/aryan contacts to matching willem contacts

UPDATE bookings b SET contact_id = w.id
FROM contacts dup
JOIN contacts w ON w.user_id = '2bcf6a23-371c-42c7-99f9-dc039159a37f'
  AND lower(trim(w.first_name)) = lower(trim(dup.first_name))
  AND lower(trim(w.last_name)) = lower(trim(dup.last_name))
  AND lower(trim(COALESCE(w.email,''))) = lower(trim(COALESCE(dup.email,'')))
WHERE dup.user_id IN ('74b1a23f-7e85-4c41-b82f-0da3983d6bde','c8bc7a67-6de1-40a1-895d-c9ee86db73e8')
  AND b.contact_id = dup.id;

UPDATE contact_activities ca SET contact_id = w.id
FROM contacts dup
JOIN contacts w ON w.user_id = '2bcf6a23-371c-42c7-99f9-dc039159a37f'
  AND lower(trim(w.first_name)) = lower(trim(dup.first_name))
  AND lower(trim(w.last_name)) = lower(trim(dup.last_name))
  AND lower(trim(COALESCE(w.email,''))) = lower(trim(COALESCE(dup.email,'')))
WHERE dup.user_id IN ('74b1a23f-7e85-4c41-b82f-0da3983d6bde','c8bc7a67-6de1-40a1-895d-c9ee86db73e8')
  AND ca.contact_id = dup.id;

UPDATE inquiries i SET contact_id = w.id
FROM contacts dup
JOIN contacts w ON w.user_id = '2bcf6a23-371c-42c7-99f9-dc039159a37f'
  AND lower(trim(w.first_name)) = lower(trim(dup.first_name))
  AND lower(trim(w.last_name)) = lower(trim(dup.last_name))
  AND lower(trim(COALESCE(w.email,''))) = lower(trim(COALESCE(dup.email,'')))
WHERE dup.user_id IN ('74b1a23f-7e85-4c41-b82f-0da3983d6bde','c8bc7a67-6de1-40a1-895d-c9ee86db73e8')
  AND i.contact_id = dup.id;

UPDATE tasks t SET contact_id = w.id
FROM contacts dup
JOIN contacts w ON w.user_id = '2bcf6a23-371c-42c7-99f9-dc039159a37f'
  AND lower(trim(w.first_name)) = lower(trim(dup.first_name))
  AND lower(trim(w.last_name)) = lower(trim(dup.last_name))
  AND lower(trim(COALESCE(w.email,''))) = lower(trim(COALESCE(dup.email,'')))
WHERE dup.user_id IN ('74b1a23f-7e85-4c41-b82f-0da3983d6bde','c8bc7a67-6de1-40a1-895d-c9ee86db73e8')
  AND t.contact_id = dup.id;

-- Delete duplicate contacts
DELETE FROM contacts 
WHERE user_id IN ('74b1a23f-7e85-4c41-b82f-0da3983d6bde','c8bc7a67-6de1-40a1-895d-c9ee86db73e8');

-- ============ COMPANIES ============
UPDATE contacts c SET company_id = w.id
FROM companies dup
JOIN companies w ON w.user_id = '2bcf6a23-371c-42c7-99f9-dc039159a37f'
  AND lower(trim(w.name)) = lower(trim(dup.name))
WHERE dup.user_id IN ('74b1a23f-7e85-4c41-b82f-0da3983d6bde','c8bc7a67-6de1-40a1-895d-c9ee86db73e8')
  AND c.company_id = dup.id;

DELETE FROM companies 
WHERE user_id IN ('74b1a23f-7e85-4c41-b82f-0da3983d6bde','c8bc7a67-6de1-40a1-895d-c9ee86db73e8');

-- ============ REASSIGN OTHER TABLES ============
UPDATE bookings SET user_id = '2bcf6a23-371c-42c7-99f9-dc039159a37f'
WHERE user_id IN ('74b1a23f-7e85-4c41-b82f-0da3983d6bde','c8bc7a67-6de1-40a1-895d-c9ee86db73e8');

UPDATE inquiries SET user_id = '2bcf6a23-371c-42c7-99f9-dc039159a37f'
WHERE user_id IN ('74b1a23f-7e85-4c41-b82f-0da3983d6bde','c8bc7a67-6de1-40a1-895d-c9ee86db73e8');

UPDATE tasks SET user_id = '2bcf6a23-371c-42c7-99f9-dc039159a37f'
WHERE user_id IN ('74b1a23f-7e85-4c41-b82f-0da3983d6bde','c8bc7a67-6de1-40a1-895d-c9ee86db73e8');

UPDATE contact_activities SET user_id = '2bcf6a23-371c-42c7-99f9-dc039159a37f'
WHERE user_id IN ('74b1a23f-7e85-4c41-b82f-0da3983d6bde','c8bc7a67-6de1-40a1-895d-c9ee86db73e8');

-- Room settings: delete duplicates, then reassign unique ones
DELETE FROM room_settings
WHERE user_id IN ('74b1a23f-7e85-4c41-b82f-0da3983d6bde','c8bc7a67-6de1-40a1-895d-c9ee86db73e8')
  AND room_name IN (SELECT room_name FROM room_settings WHERE user_id = '2bcf6a23-371c-42c7-99f9-dc039159a37f');

UPDATE room_settings SET user_id = '2bcf6a23-371c-42c7-99f9-dc039159a37f'
WHERE user_id IN ('74b1a23f-7e85-4c41-b82f-0da3983d6bde','c8bc7a67-6de1-40a1-895d-c9ee86db73e8');

-- ============ RE-LINK company_id ============
UPDATE contacts c SET company_id = co.id
FROM companies co
WHERE c.company IS NOT NULL AND c.company != ''
  AND lower(trim(c.company)) = lower(trim(co.name))
  AND (c.company_id IS NULL OR c.company_id != co.id);
