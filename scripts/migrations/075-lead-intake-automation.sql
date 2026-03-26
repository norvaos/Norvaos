-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 075: Lead Intake Automation  -  NorvaOS Phase 1
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Creates the lead-to-retainer intake automation foundation:
--   1.  lead_stage_history           -  relational audit trail (not JSONB)
--   2.  lead_intake_profiles         -  structured intake data
--   3.  lead_qualification_decisions  -  qualification outcomes
--   4.  lead_consultations           -  consultation lifecycle
--   5.  lead_retainer_packages       -  retainer status tracking
--   6.  lead_milestone_groups        -  workflow milestone groups
--   7.  lead_milestone_tasks         -  tasks within milestone groups
--   8.  lead_communication_events    -  first-class communication objects
--   9.  lead_closure_records         -  closure audit
--   10. lead_reopen_records          -  reopen audit
--   11. workspace_workflow_config    -  workspace-level workflow configuration
--   12. lead_ai_insights             -  AI analysis results (assistive only)
--   13. lead_workflow_executions     -  idempotency ledger
--
-- Plus: leads table extensions, matters table extension, 3 reporting views.
-- All tables include tenant_id with RLS policies.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 0. Extend leads table (derived summary fields  -  recalculator only) ──────

ALTER TABLE leads ADD COLUMN IF NOT EXISTS current_stage text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_intake_staff_id uuid REFERENCES users(id);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS responsible_lawyer_id uuid REFERENCES users(id);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_source text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS campaign_source text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS referral_source text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sub_practice_area text;

-- Derived summary fields (written ONLY by lead-summary-recalculator service)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS qualification_status text DEFAULT 'pending';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS conflict_status text DEFAULT 'not_run';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS consultation_status text DEFAULT 'not_booked';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS retainer_status text DEFAULT 'not_sent';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'not_requested';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_required_action text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_required_action_due_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS overdue_task_count int DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_automated_action_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_inbound_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_outbound_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS is_closed boolean DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS closure_record_id uuid;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS intake_profile_id uuid;

-- Indexes on leads for filtering/reporting
CREATE INDEX IF NOT EXISTS idx_leads_current_stage ON leads(current_stage);
CREATE INDEX IF NOT EXISTS idx_leads_is_closed ON leads(is_closed);
CREATE INDEX IF NOT EXISTS idx_leads_qualification_status ON leads(qualification_status);
CREATE INDEX IF NOT EXISTS idx_leads_consultation_status ON leads(consultation_status);
CREATE INDEX IF NOT EXISTS idx_leads_retainer_status ON leads(retainer_status);
CREATE INDEX IF NOT EXISTS idx_leads_lead_source ON leads(lead_source);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_intake_staff ON leads(assigned_intake_staff_id);
CREATE INDEX IF NOT EXISTS idx_leads_responsible_lawyer ON leads(responsible_lawyer_id);

-- ─── 0b. Extend matters table ────────────────────────────────────────────────

ALTER TABLE matters ADD COLUMN IF NOT EXISTS originating_lead_id uuid REFERENCES leads(id);
CREATE INDEX IF NOT EXISTS idx_matters_originating_lead ON matters(originating_lead_id) WHERE originating_lead_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. lead_stage_history  -  relational stage audit trail
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lead_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  from_stage text,                                    -- null for initial entry
  to_stage text NOT NULL,
  from_stage_id uuid REFERENCES pipeline_stages(id),  -- FK to pipeline_stages
  to_stage_id uuid REFERENCES pipeline_stages(id),    -- FK to pipeline_stages
  changed_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid REFERENCES users(id),
  actor_type text NOT NULL DEFAULT 'user',             -- user/system/integration/ai
  reason text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_stage_history_lead ON lead_stage_history(lead_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_stage_history_tenant ON lead_stage_history(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lead_stage_history_to_stage ON lead_stage_history(to_stage);

ALTER TABLE lead_stage_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lead_stage_history_tenant_isolation ON lead_stage_history;
CREATE POLICY lead_stage_history_tenant_isolation ON lead_stage_history
  USING (tenant_id = get_current_tenant_id());

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. lead_intake_profiles  -  structured intake data per lead
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lead_intake_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  preferred_contact_method text,                       -- phone/email/sms/portal
  opposing_party_names jsonb DEFAULT '[]'::jsonb,      -- [{name, relationship}]
  related_party_names jsonb DEFAULT '[]'::jsonb,       -- [{name, relationship}]
  intake_summary text,
  urgency_level text,                                  -- low/medium/high/critical
  jurisdiction text,
  limitation_risk_flag boolean DEFAULT false,
  capacity_concern_flag boolean DEFAULT false,
  abuse_safety_flag boolean DEFAULT false,
  mandatory_fields_complete boolean DEFAULT false,
  custom_intake_data jsonb,                            -- practice-area-specific fields
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_lead_intake_profiles_lead UNIQUE (lead_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_intake_profiles_tenant ON lead_intake_profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lead_intake_profiles_lead ON lead_intake_profiles(lead_id);

ALTER TABLE lead_intake_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lead_intake_profiles_tenant_isolation ON lead_intake_profiles;
CREATE POLICY lead_intake_profiles_tenant_isolation ON lead_intake_profiles
  USING (tenant_id = get_current_tenant_id());

-- FK from leads.intake_profile_id
ALTER TABLE leads
  DROP CONSTRAINT IF EXISTS fk_leads_intake_profile,
  ADD CONSTRAINT fk_leads_intake_profile FOREIGN KEY (intake_profile_id) REFERENCES lead_intake_profiles(id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. lead_qualification_decisions  -  qualification outcomes
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lead_qualification_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',              -- pending/qualified/needs_lawyer_review/not_qualified
  notes text,
  not_fit_reason_code text,                            -- codified reason
  requires_lawyer_review boolean DEFAULT false,
  decided_at timestamptz,
  decided_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_qualification_decisions_lead ON lead_qualification_decisions(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_qualification_decisions_tenant ON lead_qualification_decisions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lead_qualification_decisions_status ON lead_qualification_decisions(status);

ALTER TABLE lead_qualification_decisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lead_qualification_decisions_tenant_isolation ON lead_qualification_decisions;
CREATE POLICY lead_qualification_decisions_tenant_isolation ON lead_qualification_decisions
  USING (tenant_id = get_current_tenant_id());

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. lead_consultations  -  consultation lifecycle
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lead_consultations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'not_booked',           -- not_booked/booked/completed/no_show/cancelled
  scheduled_at timestamptz,
  duration_minutes int,
  consultation_type text,                              -- in_person/phone/virtual
  fee_required boolean DEFAULT false,
  fee_amount numeric(10,2),
  fee_paid boolean DEFAULT false,
  fee_paid_at timestamptz,
  outcome text,                                        -- send_retainer/follow_up_later/need_more_documents/client_declined/not_a_fit
  outcome_notes text,
  notes_saved boolean DEFAULT false,
  summary_sent boolean DEFAULT false,
  calendar_event_id uuid REFERENCES calendar_events(id),
  booking_appointment_id uuid,                         -- FK to booking_appointments if exists
  conducted_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_consultations_lead ON lead_consultations(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_consultations_tenant ON lead_consultations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lead_consultations_status ON lead_consultations(status);
CREATE INDEX IF NOT EXISTS idx_lead_consultations_scheduled ON lead_consultations(scheduled_at) WHERE scheduled_at IS NOT NULL;

ALTER TABLE lead_consultations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lead_consultations_tenant_isolation ON lead_consultations;
CREATE POLICY lead_consultations_tenant_isolation ON lead_consultations
  USING (tenant_id = get_current_tenant_id());

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. lead_retainer_packages  -  retainer status tracking
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lead_retainer_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'not_sent',             -- not_sent/sent/signed/payment_pending/fully_retained/not_signed
  template_type text,
  sent_at timestamptz,
  signed_at timestamptz,
  amount_requested numeric(10,2),
  payment_status text NOT NULL DEFAULT 'not_requested',-- not_requested/requested/partial/paid/waived
  payment_received_at timestamptz,
  payment_amount numeric(10,2),
  payment_method text,                                 -- stripe/e_transfer/cheque/cash/other
  id_verification_status text DEFAULT 'not_required',  -- not_required/pending/verified/failed
  required_documents_status text DEFAULT 'not_required',-- not_required/pending/complete/incomplete
  stripe_payment_intent_id text,                       -- Stripe integration hook
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_retainer_packages_lead ON lead_retainer_packages(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_retainer_packages_tenant ON lead_retainer_packages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lead_retainer_packages_status ON lead_retainer_packages(status);
CREATE INDEX IF NOT EXISTS idx_lead_retainer_packages_payment ON lead_retainer_packages(payment_status);

ALTER TABLE lead_retainer_packages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lead_retainer_packages_tenant_isolation ON lead_retainer_packages;
CREATE POLICY lead_retainer_packages_tenant_isolation ON lead_retainer_packages
  USING (tenant_id = get_current_tenant_id());

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. lead_milestone_groups  -  workflow milestone groups
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lead_milestone_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  group_type text NOT NULL,                            -- initial_intake/contact_attempts/qualification/
                                                       -- consultation_preparation/consultation_outcome/
                                                       -- retainer_delivery/retainer_signature_followup/
                                                       -- payment_followup/retention_completion/
                                                       -- no_show_recovery/closure_no_response/
                                                       -- closure_retainer_not_signed/closure_client_declined/
                                                       -- closure_not_a_fit
  title text NOT NULL,
  status text NOT NULL DEFAULT 'not_started',          -- not_started/in_progress/completed/skipped/closed
  completion_percent int NOT NULL DEFAULT 0,
  completed_at timestamptz,
  completed_by uuid REFERENCES users(id),
  completion_source text,                              -- manual/system/integration/ai
  created_from_stage text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_milestone_groups_lead ON lead_milestone_groups(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_milestone_groups_tenant ON lead_milestone_groups(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lead_milestone_groups_type ON lead_milestone_groups(group_type);
CREATE INDEX IF NOT EXISTS idx_lead_milestone_groups_status ON lead_milestone_groups(status);

ALTER TABLE lead_milestone_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lead_milestone_groups_tenant_isolation ON lead_milestone_groups;
CREATE POLICY lead_milestone_groups_tenant_isolation ON lead_milestone_groups
  USING (tenant_id = get_current_tenant_id());

-- ═══════════════════════════════════════════════════════════════════════════════
-- 7. lead_milestone_tasks  -  tasks within milestone groups
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lead_milestone_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  milestone_group_id uuid NOT NULL REFERENCES lead_milestone_groups(id) ON DELETE CASCADE,
  title text NOT NULL,
  task_type text NOT NULL,                             -- review_intake/contact_attempt/run_conflict_check/
                                                       -- assign_staff/send_invite/send_reminder/
                                                       -- complete_qualification/record_outcome/
                                                       -- send_retainer/verify_signature/record_payment/
                                                       -- verify_id/complete_onboarding/send_closure_message/
                                                       -- etc.
  status text NOT NULL DEFAULT 'not_started',          -- not_started/pending/in_progress/completed/skipped/closed
  owner_user_id uuid REFERENCES users(id),
  due_at timestamptz,
  completed_at timestamptz,
  completed_by uuid REFERENCES users(id),
  completion_source text,                              -- manual/system/integration/ai
  linked_communication_event_id uuid,                  -- FK added after comm events table
  linked_document_id uuid REFERENCES documents(id),
  linked_payment_event_id uuid,                        -- generic FK for payment evidence
  notes text,
  skip_reason text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_milestone_tasks_lead ON lead_milestone_tasks(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_milestone_tasks_group ON lead_milestone_tasks(milestone_group_id);
CREATE INDEX IF NOT EXISTS idx_lead_milestone_tasks_tenant ON lead_milestone_tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lead_milestone_tasks_status ON lead_milestone_tasks(status);
CREATE INDEX IF NOT EXISTS idx_lead_milestone_tasks_owner ON lead_milestone_tasks(owner_user_id) WHERE owner_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_milestone_tasks_due ON lead_milestone_tasks(due_at) WHERE due_at IS NOT NULL AND status NOT IN ('completed', 'skipped', 'closed');

ALTER TABLE lead_milestone_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lead_milestone_tasks_tenant_isolation ON lead_milestone_tasks;
CREATE POLICY lead_milestone_tasks_tenant_isolation ON lead_milestone_tasks
  USING (tenant_id = get_current_tenant_id());

-- ═══════════════════════════════════════════════════════════════════════════════
-- 8. lead_communication_events  -  first-class communication objects
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lead_communication_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id),
  channel text NOT NULL,                               -- call/email/sms/portal_chat/system_reminder
  direction text NOT NULL,                             -- inbound/outbound/system
  subtype text,                                        -- missed_call_auto_text/consultation_reminder/
                                                       -- retainer_followup/payment_reminder/closure_notice/etc.
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid REFERENCES users(id),
  actor_type text NOT NULL DEFAULT 'user',             -- user/system/integration/ai
  delivery_status text,                                -- pending/delivered/failed/bounced
  read_status text,                                    -- unread/read
  subject text,
  body_preview text,
  metadata jsonb,                                      -- channel-specific data (call duration, email headers, etc.)
  counts_as_contact_attempt boolean NOT NULL DEFAULT false,
  linked_task_id uuid REFERENCES lead_milestone_tasks(id),

  -- Thread support (Correction #6)
  thread_key text,                                     -- app-level thread grouping (e.g., lead:{id}:email:{hash})
  provider_thread_id text,                             -- external provider thread ID (Gmail, Twilio, etc.)
  provider_message_id text,                            -- external provider message ID
  in_reply_to uuid REFERENCES lead_communication_events(id), -- self-reference to parent

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_comm_events_lead ON lead_communication_events(lead_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_comm_events_tenant ON lead_communication_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lead_comm_events_channel ON lead_communication_events(channel);
CREATE INDEX IF NOT EXISTS idx_lead_comm_events_direction ON lead_communication_events(direction);
CREATE INDEX IF NOT EXISTS idx_lead_comm_events_contact_attempt ON lead_communication_events(lead_id) WHERE counts_as_contact_attempt = true;
CREATE INDEX IF NOT EXISTS idx_lead_comm_events_thread ON lead_communication_events(lead_id, thread_key) WHERE thread_key IS NOT NULL;

ALTER TABLE lead_communication_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lead_communication_events_tenant_isolation ON lead_communication_events;
CREATE POLICY lead_communication_events_tenant_isolation ON lead_communication_events
  USING (tenant_id = get_current_tenant_id());

-- Add FK from milestone tasks to communication events (deferred)
ALTER TABLE lead_milestone_tasks
  DROP CONSTRAINT IF EXISTS fk_milestone_task_comm_event,
  ADD CONSTRAINT fk_milestone_task_comm_event
    FOREIGN KEY (linked_communication_event_id) REFERENCES lead_communication_events(id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 9. lead_closure_records  -  closure audit
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lead_closure_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  closed_stage text NOT NULL,                          -- closed_no_response/closed_retainer_not_signed/
                                                       -- closed_client_declined/closed_not_a_fit
  reason_code text NOT NULL,                           -- codified reason
  reason_text text,                                    -- free-text explanation
  closed_at timestamptz NOT NULL DEFAULT now(),
  closed_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_closure_records_lead ON lead_closure_records(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_closure_records_tenant ON lead_closure_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lead_closure_records_stage ON lead_closure_records(closed_stage);
CREATE INDEX IF NOT EXISTS idx_lead_closure_records_reason ON lead_closure_records(reason_code);

ALTER TABLE lead_closure_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lead_closure_records_tenant_isolation ON lead_closure_records;
CREATE POLICY lead_closure_records_tenant_isolation ON lead_closure_records
  USING (tenant_id = get_current_tenant_id());

-- Add FK from leads.closure_record_id
ALTER TABLE leads
  DROP CONSTRAINT IF EXISTS fk_leads_closure_record,
  ADD CONSTRAINT fk_leads_closure_record FOREIGN KEY (closure_record_id) REFERENCES lead_closure_records(id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 10. lead_reopen_records  -  reopen audit
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lead_reopen_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  reopened_from_stage text NOT NULL,
  reopened_to_stage text NOT NULL,
  reopened_at timestamptz NOT NULL DEFAULT now(),
  reopened_by uuid NOT NULL REFERENCES users(id),
  reopen_reason text NOT NULL,
  task_reopen_strategy text NOT NULL DEFAULT 'regenerate', -- restore/reopen/regenerate
  closure_record_id uuid REFERENCES lead_closure_records(id), -- which closure this reverses
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_reopen_records_lead ON lead_reopen_records(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_reopen_records_tenant ON lead_reopen_records(tenant_id);

ALTER TABLE lead_reopen_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lead_reopen_records_tenant_isolation ON lead_reopen_records;
CREATE POLICY lead_reopen_records_tenant_isolation ON lead_reopen_records
  USING (tenant_id = get_current_tenant_id());

-- ═══════════════════════════════════════════════════════════════════════════════
-- 11. workspace_workflow_config  -  workspace-level workflow configuration
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS workspace_workflow_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  -- Contact attempt cadence: business days between each attempt
  contact_attempt_cadence_days jsonb NOT NULL DEFAULT '[1, 2, 3, 5]'::jsonb,
  -- Retainer follow-up cadence: business days between each follow-up
  retainer_followup_cadence_days jsonb NOT NULL DEFAULT '[2, 3, 5, 7]'::jsonb,
  -- Payment follow-up cadence: business days between each follow-up
  payment_followup_cadence_days jsonb NOT NULL DEFAULT '[1, 3, 5]'::jsonb,
  -- No-show recovery cadence: business days between each recovery attempt
  no_show_cadence_days jsonb NOT NULL DEFAULT '[1, 2, 5]'::jsonb,
  -- Enabled communication channels
  enabled_channels jsonb NOT NULL DEFAULT '["call", "email", "sms"]'::jsonb,
  -- Final closure message behaviour
  final_closure_messages_mode text NOT NULL DEFAULT 'auto', -- auto/manual/disabled
  -- Mandatory tasks by stage (stage_name → task_type[])
  mandatory_tasks_by_stage jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Stage reopen permissions (role_id → allowed_closed_stages[])
  stage_reopen_permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Lawyer approval requirements (stage_name → requires_lawyer_approval bool)
  lawyer_approval_requirements jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Active matter conversion gates (gate_type → enabled bool)
  active_matter_conversion_gates jsonb NOT NULL DEFAULT '{
    "conflict_cleared": true,
    "retainer_signed": true,
    "payment_received": true,
    "intake_complete": true,
    "id_verification": false,
    "required_documents": false
  }'::jsonb,
  -- Consultation fee rules
  consultation_fee_rules jsonb NOT NULL DEFAULT '{
    "default_fee_required": false,
    "default_fee_amount": 0,
    "fee_by_practice_area": {}
  }'::jsonb,
  -- Consultation reminder cadence (hours before)
  consultation_reminder_hours jsonb NOT NULL DEFAULT '[24, 2]'::jsonb,
  -- Auto-closure: max business days without response before auto-close
  auto_closure_after_days int DEFAULT 15,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_workspace_workflow_config_tenant UNIQUE (tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_workflow_config_tenant ON workspace_workflow_config(tenant_id);

ALTER TABLE workspace_workflow_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workspace_workflow_config_tenant_isolation ON workspace_workflow_config;
CREATE POLICY workspace_workflow_config_tenant_isolation ON workspace_workflow_config
  USING (tenant_id = get_current_tenant_id());

-- ═══════════════════════════════════════════════════════════════════════════════
-- 12. lead_ai_insights  -  AI analysis results (assistive only)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lead_ai_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  practice_area_suggestion text,
  intake_summary text,
  qualification_suggestion text,                       -- qualified/needs_review/not_qualified
  missing_data_flags jsonb DEFAULT '[]'::jsonb,        -- ["phone_number", "jurisdiction", ...]
  urgency_flags jsonb DEFAULT '[]'::jsonb,             -- ["limitation_approaching", "safety_concern", ...]
  next_action_suggestion text,
  confidence_scores jsonb DEFAULT '{}'::jsonb,         -- {practice_area: 0.85, qualification: 0.72, ...}
  generated_at timestamptz NOT NULL DEFAULT now(),
  model_info text,                                     -- e.g., "claude-sonnet-4-6" or "stubbed"
  -- AI outputs are SUGGESTIONS ONLY. They do not determine final outcomes.
  -- Human acceptance is tracked separately in activity log.
  accepted_by uuid REFERENCES users(id),
  accepted_at timestamptz,
  acceptance_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_ai_insights_lead ON lead_ai_insights(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_ai_insights_tenant ON lead_ai_insights(tenant_id);

ALTER TABLE lead_ai_insights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lead_ai_insights_tenant_isolation ON lead_ai_insights;
CREATE POLICY lead_ai_insights_tenant_isolation ON lead_ai_insights
  USING (tenant_id = get_current_tenant_id());

-- ═══════════════════════════════════════════════════════════════════════════════
-- 13. lead_workflow_executions  -  idempotency ledger
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lead_workflow_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  execution_type text NOT NULL,                        -- stage_advance/milestone_creation/task_completion/
                                                       -- closure/conversion/reminder_sent/
                                                       -- comm_event_processed/reopen
  execution_key text NOT NULL,                         -- deterministic dedup key
  executed_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid REFERENCES users(id),
  metadata jsonb,
  CONSTRAINT uq_lead_workflow_executions_key UNIQUE (tenant_id, execution_key)
);

CREATE INDEX IF NOT EXISTS idx_lead_workflow_executions_lead ON lead_workflow_executions(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_workflow_executions_tenant ON lead_workflow_executions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lead_workflow_executions_type ON lead_workflow_executions(execution_type);

ALTER TABLE lead_workflow_executions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lead_workflow_executions_tenant_isolation ON lead_workflow_executions;
CREATE POLICY lead_workflow_executions_tenant_isolation ON lead_workflow_executions
  USING (tenant_id = get_current_tenant_id());

-- ═══════════════════════════════════════════════════════════════════════════════
-- Reporting Views
-- ═══════════════════════════════════════════════════════════════════════════════

-- View: Lead funnel summary  -  stage counts + conversion rates
CREATE OR REPLACE VIEW v_lead_funnel_summary AS
SELECT
  h.tenant_id,
  h.to_stage AS stage,
  COUNT(DISTINCT h.lead_id) AS leads_entered,
  COUNT(DISTINCT h.lead_id) FILTER (
    WHERE EXISTS (
      SELECT 1 FROM lead_stage_history h2
      WHERE h2.lead_id = h.lead_id
        AND h2.changed_at > h.changed_at
        AND h2.tenant_id = h.tenant_id
    )
  ) AS leads_advanced,
  CASE
    WHEN COUNT(DISTINCT h.lead_id) > 0
    THEN ROUND(
      COUNT(DISTINCT h.lead_id) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM lead_stage_history h2
          WHERE h2.lead_id = h.lead_id
            AND h2.changed_at > h.changed_at
            AND h2.tenant_id = h.tenant_id
        )
      )::numeric / COUNT(DISTINCT h.lead_id) * 100, 1
    )
    ELSE 0
  END AS conversion_rate_pct
FROM lead_stage_history h
GROUP BY h.tenant_id, h.to_stage;

-- View: Lead stage duration  -  average time per stage
CREATE OR REPLACE VIEW v_lead_stage_duration AS
SELECT
  h1.tenant_id,
  h1.to_stage AS stage,
  COUNT(*) AS sample_count,
  ROUND(AVG(
    EXTRACT(EPOCH FROM (
      COALESCE(
        (SELECT MIN(h2.changed_at) FROM lead_stage_history h2
         WHERE h2.lead_id = h1.lead_id AND h2.changed_at > h1.changed_at AND h2.tenant_id = h1.tenant_id),
        now()
      ) - h1.changed_at
    )) / 3600
  )::numeric, 1) AS avg_hours_in_stage,
  ROUND(AVG(
    EXTRACT(EPOCH FROM (
      COALESCE(
        (SELECT MIN(h2.changed_at) FROM lead_stage_history h2
         WHERE h2.lead_id = h1.lead_id AND h2.changed_at > h1.changed_at AND h2.tenant_id = h1.tenant_id),
        now()
      ) - h1.changed_at
    )) / 86400
  )::numeric, 1) AS avg_days_in_stage
FROM lead_stage_history h1
GROUP BY h1.tenant_id, h1.to_stage;

-- View: Lead source attribution  -  leads and conversions by source
CREATE OR REPLACE VIEW v_lead_source_attribution AS
SELECT
  l.tenant_id,
  COALESCE(l.lead_source, l.source, 'unknown') AS source,
  l.campaign_source,
  l.referral_source,
  l.practice_area_id,
  COUNT(*) AS total_leads,
  COUNT(*) FILTER (WHERE l.status = 'converted') AS converted,
  COUNT(*) FILTER (WHERE l.is_closed = true) AS closed,
  COUNT(*) FILTER (WHERE l.status = 'open' AND l.is_closed = false) AS active,
  CASE
    WHEN COUNT(*) > 0
    THEN ROUND(COUNT(*) FILTER (WHERE l.status = 'converted')::numeric / COUNT(*) * 100, 1)
    ELSE 0
  END AS conversion_rate_pct
FROM leads l
GROUP BY l.tenant_id, COALESCE(l.lead_source, l.source, 'unknown'),
         l.campaign_source, l.referral_source, l.practice_area_id;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Track migration
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO migrations_applied (name) VALUES ('075-lead-intake-automation')
ON CONFLICT DO NOTHING;
