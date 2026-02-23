
-- Drop redundant duplicate unique index on contacts (the other one with lower/trim is better)
DROP INDEX IF EXISTS public.idx_contacts_unique_person;
