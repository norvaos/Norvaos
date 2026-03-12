-- Migration 071: Auto-update contact interaction tracking fields
-- Hooks last_contacted_at, interaction_count, and last_interaction_type
-- to automatically update when activities are created for a contact.

BEGIN;

-- ─── 1. Trigger function: update contact fields on new activity ───────────────

CREATE OR REPLACE FUNCTION update_contact_interaction_on_activity()
RETURNS TRIGGER AS $$
DECLARE
  -- Activity types that count as direct contact interactions
  -- (not system/internal events like workflow_tasks_created, automation, etc.)
  interaction_types TEXT[] := ARRAY[
    -- Phone / Communication
    'phone_inbound',
    'phone_outbound',
    'phone_call',
    'email_sent',
    'email_received',
    'sms_sent',
    'sms_received',
    -- Meetings / Appointments
    'meeting',
    'booking_created',
    'booking_rescheduled',
    'appointment_started',
    'appointment_checked_in',
    'appointment_completed',
    -- Portal / Client-initiated
    'form_submission',
    'portal_questionnaire_submitted',
    'portal_ircc_questionnaire_completed',
    'portal_upload',
    'portal_slot_upload',
    -- Notes / Direct engagement
    'note_added',
    'consultation',
    -- Major lifecycle events that involve direct contact
    'matter_created',
    'lead_converted',
    'document_request_sent'
  ];
BEGIN
  -- Only fire when activity has a contact_id and type is an interaction
  IF NEW.contact_id IS NOT NULL AND NEW.activity_type = ANY(interaction_types) THEN
    UPDATE contacts
    SET
      last_contacted_at = NEW.created_at,
      interaction_count = interaction_count + 1,
      last_interaction_type = NEW.activity_type
    WHERE id = NEW.contact_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── 2. Create trigger on activities table ────────────────────────────────────

DROP TRIGGER IF EXISTS trg_update_contact_interaction ON activities;

CREATE TRIGGER trg_update_contact_interaction
  AFTER INSERT ON activities
  FOR EACH ROW
  EXECUTE FUNCTION update_contact_interaction_on_activity();

-- ─── 3. Backfill existing data from activities ────────────────────────────────
-- Calculate current values from existing activity records so the fields
-- are accurate for contacts that already have logged activities.

WITH contact_interaction_stats AS (
  SELECT
    a.contact_id,
    MAX(a.created_at) AS last_contacted_at,
    COUNT(*) AS interaction_count,
    (
      SELECT a2.activity_type
      FROM activities a2
      WHERE a2.contact_id = a.contact_id
        AND a2.activity_type IN (
          'phone_inbound', 'phone_outbound', 'phone_call',
          'email_sent', 'email_received', 'sms_sent', 'sms_received',
          'meeting', 'booking_created', 'booking_rescheduled',
          'appointment_started', 'appointment_checked_in', 'appointment_completed',
          'form_submission', 'portal_questionnaire_submitted',
          'portal_ircc_questionnaire_completed', 'portal_upload', 'portal_slot_upload',
          'note_added', 'consultation',
          'matter_created', 'lead_converted', 'document_request_sent'
        )
      ORDER BY a2.created_at DESC
      LIMIT 1
    ) AS last_interaction_type
  FROM activities a
  WHERE a.contact_id IS NOT NULL
    AND a.activity_type IN (
      'phone_inbound', 'phone_outbound', 'phone_call',
      'email_sent', 'email_received', 'sms_sent', 'sms_received',
      'meeting', 'booking_created', 'booking_rescheduled',
      'appointment_started', 'appointment_checked_in', 'appointment_completed',
      'form_submission', 'portal_questionnaire_submitted',
      'portal_ircc_questionnaire_completed', 'portal_upload', 'portal_slot_upload',
      'note_added', 'consultation',
      'matter_created', 'lead_converted', 'document_request_sent'
    )
  GROUP BY a.contact_id
)
UPDATE contacts c
SET
  last_contacted_at = cis.last_contacted_at,
  interaction_count = cis.interaction_count,
  last_interaction_type = cis.last_interaction_type
FROM contact_interaction_stats cis
WHERE c.id = cis.contact_id;

COMMIT;
