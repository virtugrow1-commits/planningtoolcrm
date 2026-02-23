
-- =========================================================
-- FULL CRM CLEANUP: deduplicate contacts & companies
-- =========================================================

-- 1) CONTACTS: identify keeper (oldest) per unique combo
-- Migrate all foreign key references to the keeper, then delete duplicates

-- 1a) Migrate bookings.contact_id
UPDATE bookings b
SET contact_id = keeper.id
FROM contacts c
JOIN (
  SELECT DISTINCT ON (user_id, lower(trim(first_name)), lower(trim(last_name)), lower(trim(COALESCE(email,''))))
    id, user_id, first_name, last_name, email
  FROM contacts
  ORDER BY user_id, lower(trim(first_name)), lower(trim(last_name)), lower(trim(COALESCE(email,''))), created_at ASC
) keeper ON keeper.user_id = c.user_id
  AND lower(trim(keeper.first_name)) = lower(trim(c.first_name))
  AND lower(trim(keeper.last_name)) = lower(trim(c.last_name))
  AND lower(trim(COALESCE(keeper.email,''))) = lower(trim(COALESCE(c.email,'')))
  AND keeper.id != c.id
WHERE b.contact_id = c.id;

-- 1b) Migrate contact_activities.contact_id
UPDATE contact_activities ca
SET contact_id = keeper.id
FROM contacts c
JOIN (
  SELECT DISTINCT ON (user_id, lower(trim(first_name)), lower(trim(last_name)), lower(trim(COALESCE(email,''))))
    id, user_id, first_name, last_name, email
  FROM contacts
  ORDER BY user_id, lower(trim(first_name)), lower(trim(last_name)), lower(trim(COALESCE(email,''))), created_at ASC
) keeper ON keeper.user_id = c.user_id
  AND lower(trim(keeper.first_name)) = lower(trim(c.first_name))
  AND lower(trim(keeper.last_name)) = lower(trim(c.last_name))
  AND lower(trim(COALESCE(keeper.email,''))) = lower(trim(COALESCE(c.email,'')))
  AND keeper.id != c.id
WHERE ca.contact_id = c.id;

-- 1c) Migrate inquiries.contact_id
UPDATE inquiries i
SET contact_id = keeper.id
FROM contacts c
JOIN (
  SELECT DISTINCT ON (user_id, lower(trim(first_name)), lower(trim(last_name)), lower(trim(COALESCE(email,''))))
    id, user_id, first_name, last_name, email
  FROM contacts
  ORDER BY user_id, lower(trim(first_name)), lower(trim(last_name)), lower(trim(COALESCE(email,''))), created_at ASC
) keeper ON keeper.user_id = c.user_id
  AND lower(trim(keeper.first_name)) = lower(trim(c.first_name))
  AND lower(trim(keeper.last_name)) = lower(trim(c.last_name))
  AND lower(trim(COALESCE(keeper.email,''))) = lower(trim(COALESCE(c.email,'')))
  AND keeper.id != c.id
WHERE i.contact_id = c.id;

-- 1d) Migrate tasks.contact_id
UPDATE tasks t
SET contact_id = keeper.id
FROM contacts c
JOIN (
  SELECT DISTINCT ON (user_id, lower(trim(first_name)), lower(trim(last_name)), lower(trim(COALESCE(email,''))))
    id, user_id, first_name, last_name, email
  FROM contacts
  ORDER BY user_id, lower(trim(first_name)), lower(trim(last_name)), lower(trim(COALESCE(email,''))), created_at ASC
) keeper ON keeper.user_id = c.user_id
  AND lower(trim(keeper.first_name)) = lower(trim(c.first_name))
  AND lower(trim(keeper.last_name)) = lower(trim(c.last_name))
  AND lower(trim(COALESCE(keeper.email,''))) = lower(trim(COALESCE(c.email,'')))
  AND keeper.id != c.id
WHERE t.contact_id = c.id;

-- 1e) Delete duplicate contacts (keep oldest)
DELETE FROM contacts
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id, lower(trim(first_name)), lower(trim(last_name)), lower(trim(COALESCE(email,''))))
    id
  FROM contacts
  ORDER BY user_id, lower(trim(first_name)), lower(trim(last_name)), lower(trim(COALESCE(email,''))), created_at ASC
);

-- =========================================================
-- 2) COMPANIES: deduplicate
-- =========================================================

-- 2a) Migrate contacts.company_id to keeper company
UPDATE contacts c
SET company_id = keeper.id
FROM companies co
JOIN (
  SELECT DISTINCT ON (user_id, lower(trim(name)))
    id, user_id, name
  FROM companies
  ORDER BY user_id, lower(trim(name)), created_at ASC
) keeper ON keeper.user_id = co.user_id
  AND lower(trim(keeper.name)) = lower(trim(co.name))
  AND keeper.id != co.id
WHERE c.company_id = co.id;

-- 2b) Delete duplicate companies (keep oldest)
DELETE FROM companies
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id, lower(trim(name)))
    id
  FROM companies
  ORDER BY user_id, lower(trim(name)), created_at ASC
);

-- =========================================================
-- 3) Re-link all contacts.company_id based on company name
-- =========================================================
UPDATE contacts c
SET company_id = co.id
FROM companies co
WHERE c.company IS NOT NULL
  AND c.company != ''
  AND lower(trim(c.company)) = lower(trim(co.name))
  AND (c.company_id IS NULL OR c.company_id != co.id);

-- 4) Clear orphaned task contact references
UPDATE tasks t SET contact_id = NULL
WHERE t.contact_id IS NOT NULL 
  AND NOT EXISTS (SELECT 1 FROM contacts c WHERE c.id = t.contact_id);
