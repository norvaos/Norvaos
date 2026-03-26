-- ============================================================================
-- Migration 216: Deterministic Readiness Trigger  -  Directive 050
--
-- Creates a PostgreSQL trigger that automatically recalculates
-- matters.readiness_score and matters.readiness_breakdown whenever
-- document_slots are inserted, updated, or deleted.
--
-- Formula (server-side, without Client Pulse):
--   Score = (D × 0.60) + (F × 0.30)
--   (Client Pulse is added by the API layer since it requires portal data)
--
-- D = Document Completeness: % of required active slots with status
--     'accepted' or 'uploaded', excluding 'not_applicable' from the denominator.
-- F = Forensic Metadata: % of uploaded documents with BOTH expiry_date
--     AND issue_date filled.
-- ============================================================================

-- ── Performance index on document_slots(matter_id) ──────────────────────────
CREATE INDEX IF NOT EXISTS idx_document_slots_matter_id
  ON document_slots (matter_id);

-- ── Trigger function ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_recalculate_readiness()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_matter_id    UUID;
  v_total_req    INT;
  v_completed    INT;
  v_uploaded     INT;
  v_forensic_ok  INT;
  v_doc_score    NUMERIC;
  v_for_score    NUMERIC;
  v_composite    INT;
  v_breakdown    JSONB;
BEGIN
  -- Determine which matter_id was affected
  IF TG_OP = 'DELETE' THEN
    v_matter_id := OLD.matter_id;
  ELSE
    v_matter_id := NEW.matter_id;
  END IF;

  -- ── D: Document Completeness ────────────────────────────────────────────
  -- Count required active slots (excluding not_applicable)
  SELECT COUNT(*)
    INTO v_total_req
    FROM document_slots
   WHERE matter_id = v_matter_id
     AND is_active = TRUE
     AND is_required = TRUE
     AND status <> 'not_applicable';

  -- Count completed required slots
  SELECT COUNT(*)
    INTO v_completed
    FROM document_slots
   WHERE matter_id = v_matter_id
     AND is_active = TRUE
     AND is_required = TRUE
     AND status IN ('accepted', 'uploaded')
     AND status <> 'not_applicable';

  IF v_total_req > 0 THEN
    v_doc_score := (v_completed::NUMERIC / v_total_req::NUMERIC) * 100;
  ELSE
    v_doc_score := 100; -- No required slots = fully satisfied
  END IF;

  -- ── F: Forensic Metadata ────────────────────────────────────────────────
  -- Count uploaded/accepted slots (have a document present)
  SELECT COUNT(*)
    INTO v_uploaded
    FROM document_slots
   WHERE matter_id = v_matter_id
     AND is_active = TRUE
     AND status <> 'not_applicable'
     AND (current_document_id IS NOT NULL OR status IN ('uploaded', 'accepted'));

  -- Count those with both expiry_date and issue_date filled
  SELECT COUNT(*)
    INTO v_forensic_ok
    FROM document_slots
   WHERE matter_id = v_matter_id
     AND is_active = TRUE
     AND status <> 'not_applicable'
     AND (current_document_id IS NOT NULL OR status IN ('uploaded', 'accepted'))
     AND expiry_date IS NOT NULL
     AND issue_date IS NOT NULL;

  IF v_uploaded > 0 THEN
    v_for_score := (v_forensic_ok::NUMERIC / v_uploaded::NUMERIC) * 100;
  ELSE
    v_for_score := 100; -- No uploaded docs = no forensic penalty
  END IF;

  -- ── Composite (without Client Pulse  -  API adds that) ──────────────────
  v_composite := ROUND((v_doc_score * 0.60) + (v_for_score * 0.30));

  -- Build breakdown JSONB
  v_breakdown := jsonb_build_object(
    'documents',    ROUND(v_doc_score),
    'forensic',     ROUND(v_for_score),
    'clientPulse',  0,
    'source',       'trigger',
    'computed_at',  NOW()
  );

  -- ── Persist to matters table ────────────────────────────────────────────
  UPDATE matters
     SET readiness_score     = v_composite,
         readiness_breakdown = v_breakdown
   WHERE id = v_matter_id;

  RETURN NULL; -- AFTER trigger  -  return value is ignored
END;
$$;

-- ── Attach trigger to document_slots ────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_recalculate_readiness ON document_slots;

CREATE TRIGGER trg_recalculate_readiness
  AFTER INSERT OR UPDATE OR DELETE
  ON document_slots
  FOR EACH ROW
  EXECUTE FUNCTION fn_recalculate_readiness();

-- ── Add issue_date column to document_slots if it does not exist ────────────
-- The Forensic Metadata dimension requires both expiry_date and issue_date.
-- expiry_date already exists; issue_date may not yet be present.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_name = 'document_slots'
       AND column_name = 'issue_date'
  ) THEN
    ALTER TABLE document_slots ADD COLUMN issue_date DATE;
    COMMENT ON COLUMN document_slots.issue_date IS 'Date the document was officially issued (Directive 050 Forensic Metadata)';
  END IF;
END;
$$;
