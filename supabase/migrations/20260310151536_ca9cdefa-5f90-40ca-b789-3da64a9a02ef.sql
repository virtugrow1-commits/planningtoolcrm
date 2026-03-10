
-- Step 1: Clear all foreign key references to contacts and companies
UPDATE public.bookings SET contact_id = NULL, company_id = NULL WHERE contact_id IS NOT NULL OR company_id IS NOT NULL;
UPDATE public.inquiries SET contact_id = NULL, company_id = NULL WHERE contact_id IS NOT NULL OR company_id IS NOT NULL;
UPDATE public.documents SET contact_id = NULL, company_id = NULL WHERE contact_id IS NOT NULL OR company_id IS NOT NULL;
UPDATE public.tasks SET contact_id = NULL, company_id = NULL WHERE contact_id IS NOT NULL OR company_id IS NOT NULL;
UPDATE public.conversations SET contact_id = NULL WHERE contact_id IS NOT NULL;
DELETE FROM public.contact_activities;
DELETE FROM public.contact_companies;
TRUNCATE public.contacts CASCADE;
TRUNCATE public.companies CASCADE;
