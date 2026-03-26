-- Migration 187: Knowledge Anchor Seeds  -  Directive 36.3
-- Seeds three wiki playbooks for the Knowledge Anchor audit:
--   1. H&C Playbook  -  Dependency Factors (linked to Arjun's 58 readiness score)
--   2. Nastaliq Rendering Guide  -  Staff technical wiki (Directive 23.0)
--   3. Trust Reconciler SOP  -  Manual for Form 9A flags in the Readiness Zone
--
-- All entries use tenant_id = 'bb15e3c2-cb50-4cc4-8b89-f7f0dd0b6fc1' (Rana Law Office)
-- and user_id = '6e560ca2-4eac-461b-a939-0b6a4b2804cf'.
--
-- NOTE: search_vector is auto-populated by trg_wiki_playbooks_search_vector trigger
--       (migration 176). Do NOT include it in INSERT or ON CONFLICT.

-- ── Ensure wiki categories exist ────────────────────────────────────────────

INSERT INTO wiki_categories (id, tenant_id, name, slug, description, color, icon, sort_order, is_active)
VALUES (
  'c0000001-0000-4000-a000-000000000001',
  'bb15e3c2-cb50-4cc4-8b89-f7f0dd0b6fc1',
  'Immigration Practice',
  'immigration-practice',
  'Playbooks and SOPs for Canadian immigration law practice',
  '#6366f1',
  'scale',
  1,
  true
),
(
  'c0000002-0000-4000-a000-000000000002',
  'bb15e3c2-cb50-4cc4-8b89-f7f0dd0b6fc1',
  'Technical Guides',
  'technical-guides',
  'Internal technical documentation for NorvaOS staff',
  '#14b8a6',
  'code',
  2,
  true
),
(
  'c0000003-0000-4000-a000-000000000003',
  'bb15e3c2-cb50-4cc4-8b89-f7f0dd0b6fc1',
  'Billing & Trust',
  'billing-trust',
  'Standard operating procedures for trust accounting and billing',
  '#f59e0b',
  'dollar-sign',
  3,
  true
)
ON CONFLICT (id) DO NOTHING;

-- ── 1. H&C Playbook ──────────────────────────────────────────────────────────

INSERT INTO wiki_playbooks (
  id, tenant_id, category_id, title, slug, description, content, status,
  is_pinned, version_number, tags, practice_area_id,
  is_active, created_by, updated_by
)
VALUES (
  'a0000001-0000-4000-a000-000000000001',
  'bb15e3c2-cb50-4cc4-8b89-f7f0dd0b6fc1',
  'c0000001-0000-4000-a000-000000000001',
  'H&C Playbook: Dependency Factors & Readiness Scoring',
  'hc-playbook-dependency-factors',
  'Comprehensive guide to Humanitarian & Compassionate grounds applications. Covers dependency factor analysis, medical evidence requirements, establishment scoring, and the link between Norva readiness scores and IRCC officer expectations. Reference: Arjun Mehta file (readiness 58/100 = Amber). Work permit restoration and H&C overlap guidance included.',
  '{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"H&C Dependency Factor Analysis"}]},{"type":"paragraph","content":[{"type":"text","text":"This playbook covers the five core dependency factors that IRCC officers evaluate in H&C applications: Medical Dependency, Financial Dependency, Caregiver Dependency, Emotional/Psychological Dependency, and Best Interests of the Child (BIOC). Each factor maps directly to evidence categories in the Norva readiness engine."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Readiness Score Interpretation"}]},{"type":"paragraph","content":[{"type":"text","text":"Amber Zone (40-69): The matter has partial evidence. Typical gaps include missing medical documentation, incomplete establishment timeline, or unsigned statutory declarations. The Arjun Mehta file (score: 58) is a canonical example  -  strong medical evidence (AIIMS Delhi records) and establishment (7 years, Mississauga) but missing Form 5669 and certified translations of Hindi medical records."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Work Permit Restoration & H&C Overlap"}]},{"type":"paragraph","content":[{"type":"text","text":"When a work permit has expired or been refused, an H&C application may serve as a restoration pathway. Key considerations: 1) File work permit restoration (R182) concurrently with H&C to maintain implied status. 2) Document establishment during the valid work permit period as evidence of integration. 3) If the applicant has Canadian-born children, invoke BIOC (Best Interests of the Child) to strengthen both the restoration and H&C arguments. 4) Medical inadmissibility waivers under A28 may apply if the H&C grounds include health-related dependency."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Evidence Checklist"}]},{"type":"paragraph","content":[{"type":"text","text":"1. Medical: Specialist letter + diagnosis + prognosis + treatment plan. 2. Dependency: Statutory declaration from applicant + corroborating family members. 3. Establishment: Tax returns (3yr), employment letters, community involvement, children''s school records. 4. Country conditions: Human rights reports, medical access reports for country of origin. 5. Work Permit Restoration: Copy of expired WP, employer support letter, LMIA or LMIA-exempt code, evidence of continued employment."}]}]}'::jsonb,
  'published',
  true,
  1,
  ARRAY['h&c', 'dependency', 'readiness', 'scoring', 'amber', 'medical', 'establishment', 'humanitarian', 'compassionate', 'work permit', 'restoration', 'R182', 'BIOC'],
  NULL,
  true,
  '6e560ca2-4eac-461b-a939-0b6a4b2804cf',
  '6e560ca2-4eac-461b-a939-0b6a4b2804cf'
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  content = EXCLUDED.content,
  tags = EXCLUDED.tags;

-- ── 2. Nastaliq Rendering Guide ──────────────────────────────────────────────

INSERT INTO wiki_playbooks (
  id, tenant_id, category_id, title, slug, description, content, status,
  is_pinned, version_number, tags, practice_area_id,
  is_active, created_by, updated_by
)
VALUES (
  'a0000002-0000-4000-a000-000000000002',
  'bb15e3c2-cb50-4cc4-8b89-f7f0dd0b6fc1',
  'c0000002-0000-4000-a000-000000000002',
  'Nastaliq Rendering Guide (Directive 23.0)',
  'nastaliq-rendering-guide',
  'Technical reference for staff on RTL script rendering in NorvaOS. Covers Nastaliq font stack (Noto Nastaliq Urdu, Jameel Noori Nastaleeq), line-height requirements (2.0 for Urdu/Farsi/Arabic), IronCanvasGuard CSS containment, and the Translation Bridge fact-anchor pipeline for multilingual consultations.',
  '{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Nastaliq Rendering in NorvaOS"}]},{"type":"paragraph","content":[{"type":"text","text":"Nastaliq is the calligraphic script used for Urdu, Farsi, and some Arabic text. It requires special handling in web applications due to its tall ascenders, deep descenders, and contextual letter joining. This guide documents how NorvaOS handles Nastaliq rendering across the portal, intake forms, and the Norva Ear transcript viewer."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Font Stack"}]},{"type":"paragraph","content":[{"type":"text","text":"Primary: Noto Nastaliq Urdu (Google Fonts). Fallback: Jameel Noori Nastaleeq, Nafees Nastaleeq, serif. The font stack is applied via inline style when source_language is ur, fa, or ar."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Line Height & Containment"}]},{"type":"paragraph","content":[{"type":"text","text":"Nastaliq requires lineHeight: 2.0 (vs 1.375 for Latin scripts). Without this, descenders clip into the line below. The IronCanvasGuard pattern (contain: layout style, break-words, line-clamp-4) prevents Nastaliq text from overflowing its container and causing layout drift in adjacent zones."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Translation Bridge"}]},{"type":"paragraph","content":[{"type":"text","text":"The fact-anchor pipeline resolves each extracted_fact individually (per-fact, not per-session). Each fact object contains: translation (English), original (source script), language (ISO code), category, and confidence. The Ghost-Writer uses resolveForLawyerView() to display the English translation with a toggle to reveal the original Nastaliq script."}]}]}'::jsonb,
  'published',
  false,
  1,
  ARRAY['nastaliq', 'rtl', 'rendering', 'urdu', 'farsi', 'arabic', 'font', 'iron-canvas', 'directive-23', 'translation-bridge'],
  NULL,
  true,
  '6e560ca2-4eac-461b-a939-0b6a4b2804cf',
  '6e560ca2-4eac-461b-a939-0b6a4b2804cf'
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  content = EXCLUDED.content,
  tags = EXCLUDED.tags;

-- ── 3. Trust Reconciler SOP ──────────────────────────────────────────────────

INSERT INTO wiki_playbooks (
  id, tenant_id, category_id, title, slug, description, content, status,
  is_pinned, version_number, tags, practice_area_id,
  is_active, created_by, updated_by
)
VALUES (
  'a0000003-0000-4000-a000-000000000003',
  'bb15e3c2-cb50-4cc4-8b89-f7f0dd0b6fc1',
  'c0000003-0000-4000-a000-000000000003',
  'Trust Reconciler SOP: Form 9A Flags & Readiness Zone',
  'trust-reconciler-sop-form-9a',
  'Standard Operating Procedure for trust account reconciliation. Covers Law Society of Ontario Form 9A monthly reconciliation requirements, common red flags shown in the Readiness Zone (uncleared cheques, interest allocation errors, retainer shortfalls), and the Norva Ledger automated flagging system.',
  '{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Trust Reconciler SOP  -  Form 9A"}]},{"type":"paragraph","content":[{"type":"text","text":"The Law Society of Ontario requires all licensees to file Form 9A (Trust Account Reconciliation) annually, but best practice is monthly reconciliation. NorvaOS automates detection of common discrepancies via the Norva Ledger engine and surfaces flags in the Readiness Zone."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Common Form 9A Flags"}]},{"type":"paragraph","content":[{"type":"text","text":"1. Uncleared Cheques > 30 days  -  indicates stale-dated instruments that need follow-up. 2. Interest Allocation Error  -  trust interest must be allocated to the Law Foundation of Ontario unless client consent is on file. 3. Retainer Shortfall  -  disbursements exceed retainer balance, requiring immediate client notification and top-up. 4. Mixed Fund Warning  -  operating funds commingled with trust funds (serious compliance violation). 5. Duplicate Transaction  -  potential double-entry requiring reversal."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Reconciliation Workflow"}]},{"type":"paragraph","content":[{"type":"text","text":"Step 1: Run Norva Ledger monthly sweep (Settings > Trust > Reconcile). Step 2: Review flagged items in the Trust tab Readiness Zone. Step 3: Clear each flag by documenting resolution (client contacted, cheque re-issued, interest allocated). Step 4: Export Form 9A PDF from the Trust tab for filing with the Law Society."}]}]}'::jsonb,
  'published',
  false,
  1,
  ARRAY['trust', 'reconciliation', 'form-9a', 'law-society', 'compliance', 'norva-ledger', 'readiness', 'billing', 'sop'],
  NULL,
  true,
  '6e560ca2-4eac-461b-a939-0b6a4b2804cf',
  '6e560ca2-4eac-461b-a939-0b6a4b2804cf'
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  content = EXCLUDED.content,
  tags = EXCLUDED.tags;
