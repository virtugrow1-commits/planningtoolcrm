
-- Add unique constraint to prevent duplicate contacts
CREATE UNIQUE INDEX idx_contacts_unique_person 
ON public.contacts (user_id, first_name, last_name, COALESCE(email, ''));
