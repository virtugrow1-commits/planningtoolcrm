-- Staging table for one-time address import from legacy CSV
CREATE TABLE IF NOT EXISTS public.tmp_address_import (
  first_name text,
  last_name text,
  email text,
  phone text,
  job_title text,
  company_name text,
  address text,
  postcode text,
  city text,
  country text
);
ALTER TABLE public.tmp_address_import ENABLE ROW LEVEL SECURITY;
-- No policies = no access for anyone except service role / migrations