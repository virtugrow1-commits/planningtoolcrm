
-- Step 1: Remove task references to duplicate inquiries (keep oldest)
UPDATE tasks t SET inquiry_id = keeper.id
FROM inquiries dup
JOIN (
  SELECT DISTINCT ON (ghl_opportunity_id) id, ghl_opportunity_id
  FROM inquiries
  WHERE ghl_opportunity_id IS NOT NULL
  ORDER BY ghl_opportunity_id, created_at ASC
) keeper ON keeper.ghl_opportunity_id = dup.ghl_opportunity_id
WHERE t.inquiry_id = dup.id AND dup.id != keeper.id;

-- Step 2: Delete duplicate inquiries (keep oldest per ghl_opportunity_id)
DELETE FROM inquiries
WHERE id NOT IN (
  SELECT DISTINCT ON (ghl_opportunity_id) id
  FROM inquiries
  WHERE ghl_opportunity_id IS NOT NULL
  ORDER BY ghl_opportunity_id, created_at ASC
)
AND ghl_opportunity_id IS NOT NULL;

-- Also deduplicate any without ghl_opportunity_id (by name+event_type+date)
DELETE FROM inquiries a
USING inquiries b
WHERE a.ghl_opportunity_id IS NULL
  AND b.ghl_opportunity_id IS NULL
  AND a.id > b.id
  AND lower(trim(a.contact_name)) = lower(trim(b.contact_name))
  AND lower(trim(a.event_type)) = lower(trim(b.event_type))
  AND COALESCE(a.preferred_date,'') = COALESCE(b.preferred_date,'');

-- Step 3: Add unique constraint on ghl_opportunity_id to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_inquiries_unique_ghl_opp 
ON inquiries (ghl_opportunity_id) WHERE ghl_opportunity_id IS NOT NULL;
