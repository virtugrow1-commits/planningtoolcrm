
-- Drop partial unique indexes and create proper unique constraints
-- PostgreSQL unique constraints naturally allow multiple NULLs

DROP INDEX IF EXISTS idx_bookings_unique_ghl_event;
DROP INDEX IF EXISTS idx_contacts_unique_ghl_contact;
DROP INDEX IF EXISTS idx_inquiries_unique_ghl_opp;

-- Create proper unique constraints (NULLs are excluded automatically)
ALTER TABLE bookings ADD CONSTRAINT uq_bookings_ghl_event_id UNIQUE (ghl_event_id);
ALTER TABLE contacts ADD CONSTRAINT uq_contacts_ghl_contact_id UNIQUE (ghl_contact_id);
ALTER TABLE inquiries ADD CONSTRAINT uq_inquiries_ghl_opportunity_id UNIQUE (ghl_opportunity_id);
