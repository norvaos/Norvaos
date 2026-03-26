-- ============================================================================
-- Seed: Gold Standard Templates — Initial Seed for Launch
-- ============================================================================
-- Pre-populates Success-Reverb with 3 Gold Standard templates from
-- top-performing mock cases:
--   1. Spousal Sponsorship — 14-day approval
--   2. Study Permit — 21-day approval
--   3. Humanitarian & Compassionate (H&C) — 42-day approval
--
-- These ensure the first Founding 100 firms see the Success-Reverb banner
-- immediately: "Apply the 'High-Speed Approval' template from our recent
-- 14-day victory?"
--
-- Run once per tenant. Replace TENANT_ID placeholder before execution.
-- ============================================================================

-- Usage:
--   1. Replace '__TENANT_ID__' with the actual tenant UUID
--   2. Replace '__MATTER_ID_SPOUSAL__', etc. with real or mock matter UUIDs
--   3. Run in Supabase SQL Editor

DO $$
DECLARE
  v_tenant_id UUID;
  v_matter_spousal UUID;
  v_matter_study UUID;
  v_matter_hc UUID;
BEGIN
  -- ── Resolve tenant (first active tenant if running for demo) ─────────
  -- Replace with specific tenant if needed:
  -- v_tenant_id := '__TENANT_ID__'::uuid;
  SELECT id INTO v_tenant_id FROM tenants WHERE is_active = true LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'No active tenant found. Cannot seed templates.';
  END IF;

  -- ── Resolve or create mock matter references ────────────────────────
  -- Use the 3 most recent approved/closed_won matters if available,
  -- otherwise create placeholder UUIDs
  SELECT id INTO v_matter_spousal
    FROM matters
    WHERE tenant_id = v_tenant_id AND status IN ('closed_won', 'approved')
    ORDER BY created_at DESC LIMIT 1;

  SELECT id INTO v_matter_study
    FROM matters
    WHERE tenant_id = v_tenant_id AND status IN ('closed_won', 'approved')
      AND id != COALESCE(v_matter_spousal, '00000000-0000-0000-0000-000000000000')
    ORDER BY created_at DESC LIMIT 1;

  SELECT id INTO v_matter_hc
    FROM matters
    WHERE tenant_id = v_tenant_id AND status IN ('closed_won', 'approved')
      AND id NOT IN (
        COALESCE(v_matter_spousal, '00000000-0000-0000-0000-000000000000'),
        COALESCE(v_matter_study, '00000000-0000-0000-0000-000000000000')
      )
    ORDER BY created_at DESC LIMIT 1;

  -- Fallback: use any matter if not enough approved ones
  IF v_matter_spousal IS NULL THEN
    SELECT id INTO v_matter_spousal FROM matters WHERE tenant_id = v_tenant_id LIMIT 1;
  END IF;
  IF v_matter_study IS NULL THEN
    v_matter_study := COALESCE(v_matter_spousal, gen_random_uuid());
  END IF;
  IF v_matter_hc IS NULL THEN
    v_matter_hc := COALESCE(v_matter_spousal, gen_random_uuid());
  END IF;

  -- ── 1. Spousal Sponsorship — "High-Speed Approval" (14 days) ───────
  INSERT INTO gold_standard_templates (
    tenant_id, source_matter_id, case_type, matter_type_name,
    readability_score, grade, keyword_density, document_structure,
    zone_coverage, days_to_approval, applicant_redacted, approved_at
  ) VALUES (
    v_tenant_id,
    v_matter_spousal,
    'spousal_sponsorship',
    'Spousal Sponsorship',
    92,
    'A',
    '{
      "genuine_relationship": 4.2,
      "cohabitation": 3.8,
      "financial_interdependence": 2.9,
      "shared_responsibilities": 2.1,
      "mutual_commitment": 1.8,
      "communication_history": 3.5,
      "joint_travel": 1.4,
      "family_knowledge": 2.2
    }'::jsonb,
    '["cover_page", "table_of_contents", "submission_letter", "relationship_timeline", "cohabitation_evidence", "financial_documents", "communication_logs", "photographs", "third_party_declarations", "statutory_declarations", "identity_documents", "annexes"]'::jsonb,
    '{
      "title_page": { "score": 95, "keywords_present": 4 },
      "opening_paragraph": { "score": 90, "keywords_present": 6 },
      "legal_arguments": { "score": 88, "keywords_present": 12 },
      "conclusion": { "score": 85, "keywords_present": 3 },
      "annexes": { "score": 78, "keywords_present": 8 }
    }'::jsonb,
    14,
    'Amara K.',
    now() - interval '14 days'
  )
  ON CONFLICT DO NOTHING;

  -- ── 2. Study Permit — "Academic Fast-Track" (21 days) ──────────────
  INSERT INTO gold_standard_templates (
    tenant_id, source_matter_id, case_type, matter_type_name,
    readability_score, grade, keyword_density, document_structure,
    zone_coverage, days_to_approval, applicant_redacted, approved_at
  ) VALUES (
    v_tenant_id,
    v_matter_study,
    'study_permit',
    'Study Permit',
    87,
    'A',
    '{
      "designated_learning_institution": 3.1,
      "financial_capacity": 4.5,
      "study_plan": 3.8,
      "ties_to_home_country": 2.9,
      "dual_intent": 1.2,
      "academic_history": 2.7,
      "language_proficiency": 2.4,
      "program_relevance": 1.9
    }'::jsonb,
    '["cover_page", "submission_letter", "acceptance_letter", "study_plan", "financial_proof", "language_test_results", "academic_transcripts", "identity_documents", "travel_history", "ties_to_home_country", "annexes"]'::jsonb,
    '{
      "title_page": { "score": 90, "keywords_present": 3 },
      "opening_paragraph": { "score": 88, "keywords_present": 5 },
      "legal_arguments": { "score": 85, "keywords_present": 10 },
      "conclusion": { "score": 82, "keywords_present": 2 },
      "annexes": { "score": 75, "keywords_present": 6 }
    }'::jsonb,
    21,
    'Priya M.',
    now() - interval '21 days'
  )
  ON CONFLICT DO NOTHING;

  -- ── 3. Humanitarian & Compassionate — "Compassion Victory" (42 days) ─
  INSERT INTO gold_standard_templates (
    tenant_id, source_matter_id, case_type, matter_type_name,
    readability_score, grade, keyword_density, document_structure,
    zone_coverage, days_to_approval, applicant_redacted, approved_at
  ) VALUES (
    v_tenant_id,
    v_matter_hc,
    'h_and_c',
    'Humanitarian & Compassionate',
    84,
    'A',
    '{
      "establishment_in_canada": 4.8,
      "best_interests_of_child": 3.9,
      "hardship_if_removed": 4.2,
      "country_conditions": 3.1,
      "risk_assessment": 2.6,
      "community_ties": 2.8,
      "employment_history": 2.3,
      "family_in_canada": 3.4,
      "medical_considerations": 1.7
    }'::jsonb,
    '["cover_page", "table_of_contents", "submission_letter", "personal_narrative", "establishment_evidence", "best_interests_assessment", "country_condition_reports", "employment_records", "community_involvement", "medical_records", "statutory_declarations", "reference_letters", "identity_documents", "annexes"]'::jsonb,
    '{
      "title_page": { "score": 88, "keywords_present": 3 },
      "opening_paragraph": { "score": 92, "keywords_present": 7 },
      "legal_arguments": { "score": 90, "keywords_present": 14 },
      "conclusion": { "score": 86, "keywords_present": 4 },
      "annexes": { "score": 80, "keywords_present": 9 }
    }'::jsonb,
    42,
    'Carlos R.',
    now() - interval '42 days'
  )
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Seeded 3 Gold Standard templates for tenant %', v_tenant_id;
END $$;
