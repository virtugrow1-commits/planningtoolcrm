-- Capitalize first letter of each word in first_name and last_name for all existing contacts
UPDATE public.contacts
SET 
  first_name = initcap(first_name),
  last_name = initcap(last_name)
WHERE 
  first_name != initcap(first_name) 
  OR last_name != initcap(last_name);
