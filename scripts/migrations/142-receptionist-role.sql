-- Migration 142: Add Receptionist system role for Front Desk routing
--
-- Creates a "Receptionist" role (if it does not already exist) for every
-- existing tenant with the exact permission set required to trigger the
-- middleware's front-desk-only routing:
--
--   front_desk.view  = true   → user sees /front-desk on login
--   matters.view     = false  → no matters access (what makes it front-desk-only)
--   contacts.view    = true   → needed to look up clients at the desk
--   leads.view       = true   → needed to register new inquiries
--   leads.create     = true
--   tasks.view       = true   → needed to see assigned tasks
--   check_ins.view   = true   → kiosk check-in management
--   check_ins.create = true
--
-- The middleware classifies a user as front_desk_only when:
--   perms.front_desk.view = true  AND  perms.matters.view ≠ true  AND  role ≠ 'Admin'
--
-- Run this in the Supabase SQL editor.

DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN SELECT id FROM tenants LOOP
    -- Only insert if no role called "Receptionist" already exists for this tenant
    IF NOT EXISTS (
      SELECT 1 FROM roles WHERE tenant_id = t.id AND name = 'Receptionist'
    ) THEN
      INSERT INTO roles (tenant_id, name, description, is_system, permissions)
      VALUES (
        t.id,
        'Receptionist',
        'Front Desk staff. Routes to the Front Desk console on login. Cannot access Matters, Billing, or Settings.',
        true,
        '{
          "contacts":   { "view": true,  "create": true,  "edit": true,  "delete": false },
          "matters":    { "view": false, "create": false, "edit": false, "delete": false },
          "leads":      { "view": true,  "create": true,  "edit": true,  "delete": false },
          "tasks":      { "view": true,  "create": true,  "edit": true,  "delete": false },
          "billing":    { "view": false, "create": false, "edit": false, "delete": false },
          "reports":    { "view": false, "export": false },
          "settings":   { "view": false, "edit": false },
          "front_desk": { "view": true,  "create": true,  "edit": true  },
          "check_ins":  { "view": true,  "create": true  }
        }'::jsonb
      );
    END IF;
  END LOOP;
END $$;
