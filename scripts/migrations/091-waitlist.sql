-- Waitlist for early access registrations
CREATE TABLE IF NOT EXISTS waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_name TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  firm_size TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | invited | onboarded
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  invited_at TIMESTAMPTZ,
  onboarded_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS waitlist_email_idx ON waitlist(email);
CREATE INDEX IF NOT EXISTS waitlist_status_idx ON waitlist(status);
CREATE INDEX IF NOT EXISTS waitlist_created_at_idx ON waitlist(created_at DESC);
