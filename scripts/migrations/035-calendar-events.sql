-- Migration 035: Calendar Events
-- Adds standalone calendar events (meetings, consultations, court dates)
-- and attendee tracking. Integrates with the existing calendar view.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Calendar Events
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS calendar_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  description       TEXT,
  location          TEXT,
  start_at          TIMESTAMPTZ NOT NULL,
  end_at            TIMESTAMPTZ NOT NULL,
  all_day           BOOLEAN NOT NULL DEFAULT false,
  color             TEXT DEFAULT '#3b82f6',
  event_type        TEXT NOT NULL DEFAULT 'meeting',

  -- Linked entities
  matter_id         UUID REFERENCES matters(id) ON DELETE SET NULL,
  contact_id        UUID REFERENCES contacts(id) ON DELETE SET NULL,

  -- Creator / owner
  created_by        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Recurrence (RFC 5545 RRULE)
  recurrence_rule   TEXT,           -- e.g. 'FREQ=WEEKLY;BYDAY=MO,WE,FR'
  recurrence_parent_id UUID REFERENCES calendar_events(id) ON DELETE CASCADE,
  recurrence_exception_dates TIMESTAMPTZ[],

  -- Status
  status            TEXT NOT NULL DEFAULT 'confirmed',
  is_active         BOOLEAN NOT NULL DEFAULT true,

  -- External sync metadata (for future Google/Outlook integration)
  external_id       TEXT,
  external_provider TEXT,           -- 'google', 'outlook'
  external_sync_token TEXT,
  last_synced_at    TIMESTAMPTZ,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT calendar_events_type_check CHECK (
    event_type IN ('meeting','consultation','court_date','personal','other')
  ),
  CONSTRAINT calendar_events_status_check CHECK (
    status IN ('confirmed','tentative','cancelled')
  ),
  CONSTRAINT calendar_events_end_after_start CHECK (end_at >= start_at)
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_tenant
  ON calendar_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_date_range
  ON calendar_events(tenant_id, start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_calendar_events_matter
  ON calendar_events(matter_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_created_by
  ON calendar_events(created_by);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Calendar Event Attendees
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS calendar_event_attendees (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_id        UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  contact_id      UUID REFERENCES contacts(id) ON DELETE CASCADE,
  email           TEXT,
  response_status TEXT NOT NULL DEFAULT 'needs_action',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT attendee_has_entity CHECK (
    user_id IS NOT NULL OR contact_id IS NOT NULL OR email IS NOT NULL
  ),
  CONSTRAINT attendee_response_check CHECK (
    response_status IN ('needs_action','accepted','declined','tentative')
  )
);

CREATE INDEX IF NOT EXISTS idx_calendar_attendees_event
  ON calendar_event_attendees(event_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. RLS Policies
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_event_attendees ENABLE ROW LEVEL SECURITY;

CREATE POLICY calendar_events_tenant_isolation
  ON calendar_events
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE POLICY calendar_attendees_tenant_isolation
  ON calendar_event_attendees
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

COMMIT;
