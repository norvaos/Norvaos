-- Staff locale preference persistence
-- Stores the admin's preferred UI locale (en/fr) so it syncs across devices
ALTER TABLE users ADD COLUMN IF NOT EXISTS locale_preference VARCHAR(5) DEFAULT 'en';
COMMENT ON COLUMN users.locale_preference IS 'Staff UI locale preference (en/fr). Synced from client on language change.';
