
-- Prevent duplicate contacts: unique on lowercase first_name + last_name + email per user
CREATE UNIQUE INDEX IF NOT EXISTS contacts_unique_name_email 
ON public.contacts (user_id, lower(trim(first_name)), lower(trim(last_name)), lower(trim(COALESCE(email, ''))));

-- Prevent duplicate companies: unique on lowercase name per user
CREATE UNIQUE INDEX IF NOT EXISTS companies_unique_name 
ON public.companies (user_id, lower(trim(name)));
