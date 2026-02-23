
-- Update contacts status check to include 'do_not_contact'
ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_status_check;
ALTER TABLE public.contacts ADD CONSTRAINT contacts_status_check CHECK (status IN ('lead', 'prospect', 'client', 'inactive', 'do_not_contact'));
