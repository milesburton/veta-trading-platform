-- 0008_viewer_role_and_oauth.sql
--
-- Add "viewer" role for read-only market data access without trading permission.
-- Viewers can see prices, analytics, and charts but cannot submit orders.

ALTER TABLE users.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('trader', 'admin', 'compliance', 'external-client', 'sales', 'viewer'));

-- Add user_preferences row default for new registrations (if table exists)
INSERT INTO users.user_preferences (user_id, data)
SELECT id, '{}'::jsonb FROM users.users
WHERE id NOT IN (SELECT user_id FROM users.user_preferences)
ON CONFLICT DO NOTHING;
