-- ============================================================================
-- Migration 042: Controlled Workflow System
-- Tables: workflow_actions, check_in_sessions, meeting_outcomes, booking_appointments
-- Schema changes: portal_links.link_type, portal_links.matter_id nullable
-- Immutability: workflow_actions blocks UPDATE and DELETE
-- ============================================================================

-- ─── 1. Workflow Actions (Immutable Action Log) ─────────────────────────────
-- Every action across kiosk, front desk, command centre, and dashboard is
-- recorded here. Immutable: prevents both UPDATE and DELETE at DB layer.

CREATE TABLE IF NOT EXISTS workflow_actions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),

  -- What action was taken
  action_type     TEXT NOT NULL,
  action_config   JSONB NOT NULL DEFAULT '{}',

  -- On what entity
  entity_type     TEXT NOT NULL,
  entity_id       UUID NOT NULL,

  -- Who did it (null for kiosk/anonymous actions)
  performed_by    UUID REFERENCES users(id),

  -- Outcome
  status          TEXT NOT NULL DEFAULT 'completed'
    CHECK (status IN ('completed', 'failed', 'rolled_back')),
  error_message   TEXT,

  -- State snapshots for auditability (Rule #5)
  previous_state  JSONB,
  new_state       JSONB,

  -- Source surface (Rule #1: all changes tracked by source)
  source          TEXT NOT NULL DEFAULT 'dashboard'
    CHECK (source IN ('kiosk', 'front_desk', 'command_centre', 'dashboard', 'api')),

  -- Idempotency key (Rule #15: guard against double submission)
  idempotency_key TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_workflow_actions_tenant ON workflow_actions(tenant_id);
CREATE INDEX idx_workflow_actions_entity ON workflow_actions(entity_type, entity_id);
CREATE INDEX idx_workflow_actions_user ON workflow_actions(performed_by);
CREATE INDEX idx_workflow_actions_type ON workflow_actions(tenant_id, action_type);
CREATE INDEX idx_workflow_actions_idempotency ON workflow_actions(idempotency_key) WHERE idempotency_key IS NOT NULL;

ALTER TABLE workflow_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY workflow_actions_tenant_policy ON workflow_actions
  USING (tenant_id = public.get_user_tenant_id());

-- Rule #4: Immutability  -  block both UPDATE and DELETE
CREATE OR REPLACE FUNCTION prevent_workflow_action_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'UPDATE of workflow_actions records is not permitted. Create a compensating action instead.';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION prevent_workflow_action_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'DELETE of workflow_actions records is not permitted.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_update_workflow_actions
  BEFORE UPDATE ON workflow_actions
  FOR EACH ROW EXECUTE FUNCTION prevent_workflow_action_update();

CREATE TRIGGER no_delete_workflow_actions
  BEFORE DELETE ON workflow_actions
  FOR EACH ROW EXECUTE FUNCTION prevent_workflow_action_delete();


-- ─── 2. Booking Appointments ────────────────────────────────────────────────
-- Actual appointment instances booked through booking pages.

CREATE TABLE IF NOT EXISTS booking_appointments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  booking_page_id UUID REFERENCES booking_pages(id),
  contact_id      UUID REFERENCES contacts(id),
  matter_id       UUID REFERENCES matters(id),

  -- Appointment details
  start_time      TIMESTAMPTZ NOT NULL,
  end_time        TIMESTAMPTZ NOT NULL,
  status          TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed', 'checked_in', 'in_progress', 'completed', 'no_show', 'cancelled')),

  -- Booker info (captured during booking)
  booker_name     TEXT,
  booker_email    TEXT,
  booker_phone    TEXT,
  answers         JSONB DEFAULT '[]',

  -- Check-in tracking
  check_in_session_id UUID,  -- FK added after check_in_sessions is created
  checked_in_at   TIMESTAMPTZ,

  -- Assignment
  assigned_to     UUID REFERENCES users(id),

  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_booking_appts_tenant ON booking_appointments(tenant_id);
CREATE INDEX idx_booking_appts_date ON booking_appointments(tenant_id, start_time);
CREATE INDEX idx_booking_appts_status ON booking_appointments(tenant_id, status)
  WHERE status NOT IN ('cancelled', 'completed');
CREATE INDEX idx_booking_appts_contact ON booking_appointments(contact_id)
  WHERE contact_id IS NOT NULL;

ALTER TABLE booking_appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY booking_appts_tenant_policy ON booking_appointments
  USING (tenant_id = public.get_user_tenant_id());


-- ─── 3. Check-In Sessions (Kiosk) ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS check_in_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  booking_appointment_id UUID REFERENCES booking_appointments(id),
  contact_id      UUID REFERENCES contacts(id),
  matter_id       UUID REFERENCES matters(id),
  kiosk_token     TEXT NOT NULL,

  -- Step tracking (wizard state)
  status          TEXT NOT NULL DEFAULT 'started'
    CHECK (status IN ('started', 'identity_verified', 'completed', 'abandoned')),
  current_step    TEXT NOT NULL DEFAULT 'appointment_lookup',

  -- Identity verification (Rule #8)
  dob_verified    BOOLEAN DEFAULT false,
  id_scan_path    TEXT,
  id_scan_uploaded_at TIMESTAMPTZ,
  data_safety_acknowledged BOOLEAN DEFAULT false,

  -- Client info captured at kiosk
  client_name     TEXT,
  client_email    TEXT,
  client_phone    TEXT,

  -- Metadata
  device_info     JSONB DEFAULT '{}',
  metadata        JSONB DEFAULT '{}',

  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add FK from booking_appointments to check_in_sessions now that both exist
ALTER TABLE booking_appointments
  ADD CONSTRAINT fk_booking_appts_check_in
  FOREIGN KEY (check_in_session_id) REFERENCES check_in_sessions(id);

CREATE INDEX idx_check_in_sessions_tenant ON check_in_sessions(tenant_id);
CREATE INDEX idx_check_in_sessions_status ON check_in_sessions(tenant_id, status)
  WHERE status NOT IN ('abandoned');
CREATE INDEX idx_check_in_sessions_contact ON check_in_sessions(contact_id)
  WHERE contact_id IS NOT NULL;
CREATE INDEX idx_check_in_sessions_token ON check_in_sessions(kiosk_token);

ALTER TABLE check_in_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY check_in_sessions_tenant_policy ON check_in_sessions
  USING (tenant_id = public.get_user_tenant_id());


-- ─── 4. Meeting Outcomes (Command Centre) ───────────────────────────────────

CREATE TABLE IF NOT EXISTS meeting_outcomes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  matter_id       UUID NOT NULL REFERENCES matters(id),
  lead_id         UUID REFERENCES leads(id),
  contact_id      UUID REFERENCES contacts(id),

  outcome_type    TEXT NOT NULL
    CHECK (outcome_type IN (
      'retainer_sent', 'retainer_signed', 'follow_up_required',
      'declined', 'consultation_complete', 'additional_docs_needed',
      'referred_out', 'no_show'
    )),

  -- Structured data per outcome type
  outcome_data    JSONB NOT NULL DEFAULT '{}',

  -- Linked action for traceability (Rule #5)
  workflow_action_id UUID REFERENCES workflow_actions(id),

  -- Who and when
  recorded_by     UUID NOT NULL REFERENCES users(id),
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes           TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_meeting_outcomes_matter ON meeting_outcomes(tenant_id, matter_id);
CREATE INDEX idx_meeting_outcomes_type ON meeting_outcomes(tenant_id, outcome_type);

ALTER TABLE meeting_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY meeting_outcomes_tenant_policy ON meeting_outcomes
  USING (tenant_id = public.get_user_tenant_id());


-- ─── 5. Portal Links: Add link_type + nullable matter_id ───────────────────
-- Kiosk tokens are tenant-level (no matter_id). We need to allow null.

ALTER TABLE portal_links ADD COLUMN IF NOT EXISTS
  link_type TEXT NOT NULL DEFAULT 'document_portal';

-- Add CHECK constraint for link_type values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'portal_links_link_type_check'
  ) THEN
    ALTER TABLE portal_links ADD CONSTRAINT portal_links_link_type_check
      CHECK (link_type IN ('document_portal', 'kiosk', 'questionnaire'));
  END IF;
END $$;

-- Make matter_id nullable for kiosk tokens
ALTER TABLE portal_links ALTER COLUMN matter_id DROP NOT NULL;

-- Add permissions JSONB for kiosk scope control
ALTER TABLE portal_links ADD COLUMN IF NOT EXISTS
  permissions JSONB DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_portal_links_link_type ON portal_links(link_type)
  WHERE link_type = 'kiosk';


-- ─── 6. Performance: ensure get_user_tenant_id() is used everywhere ────────
-- (Already done by migration 011, but verify RLS policies exist for new tables)
-- The policies above use inline subqueries as a fallback; replace with function
-- if get_user_tenant_id() exists.

DO $$
BEGIN
  -- Update RLS policies to use the cached function if it exists
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'get_user_tenant_id'
  ) THEN
    DROP POLICY IF EXISTS workflow_actions_tenant_policy ON workflow_actions;
    CREATE POLICY workflow_actions_tenant_policy ON workflow_actions
      USING (tenant_id = public.get_user_tenant_id());

    DROP POLICY IF EXISTS booking_appts_tenant_policy ON booking_appointments;
    CREATE POLICY booking_appts_tenant_policy ON booking_appointments
      USING (tenant_id = public.get_user_tenant_id());

    DROP POLICY IF EXISTS check_in_sessions_tenant_policy ON check_in_sessions;
    CREATE POLICY check_in_sessions_tenant_policy ON check_in_sessions
      USING (tenant_id = public.get_user_tenant_id());

    DROP POLICY IF EXISTS meeting_outcomes_tenant_policy ON meeting_outcomes;
    CREATE POLICY meeting_outcomes_tenant_policy ON meeting_outcomes
      USING (tenant_id = public.get_user_tenant_id());
  END IF;
END $$;
