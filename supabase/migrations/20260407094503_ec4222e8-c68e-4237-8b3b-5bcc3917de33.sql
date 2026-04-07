
-- Clean up stuck sync queue items that keep hitting rate limits
DELETE FROM sync_queue WHERE status = 'pending' AND retry_count >= 2;

-- Clean up test data
DELETE FROM inquiries WHERE contact_name = 'Test Webhook' AND event_type = 'Vergadering';
DELETE FROM contacts WHERE email = 'test-webhook@example.com';
