-- ============================================================================
-- Migration 012: Immigration Automation Engine — Seed Data
-- ============================================================================
-- Populates auto_tasks on case_stage_definitions, checklist_templates,
-- and automation_rules for the immigration practice. These provide
-- out-of-the-box automation when cases move through stages.
-- ============================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- Helper: Get the tenant ID (assumes single-tenant or run per tenant)
-- --------------------------------------------------------------------------
-- We use a CTE to reference the tenant for all inserts
-- Adjust the WHERE clause if you have multiple tenants

-- --------------------------------------------------------------------------
-- 1. Update case_stage_definitions with auto_tasks per stage
-- --------------------------------------------------------------------------
-- For EACH immigration case type, populate the auto_tasks JSON array.
-- These tasks are automatically created (idempotent) when a case enters
-- the corresponding stage.

-- Express Entry stages (identified by slug pattern)
UPDATE case_stage_definitions
SET auto_tasks = '[
  {"title": "Schedule initial consultation", "description": "Book intake meeting with client to discuss eligibility and pathway options", "priority": "high", "due_days_offset": 2},
  {"title": "Run preliminary eligibility assessment", "description": "Review client qualifications against Express Entry criteria (CRS score, language, education, work experience)", "priority": "high", "due_days_offset": 3},
  {"title": "Prepare retainer agreement", "description": "Draft and send retainer agreement for client signature", "priority": "medium", "due_days_offset": 5},
  {"title": "Send welcome package to client", "description": "Email welcome package with document requirements and process overview", "priority": "medium", "due_days_offset": 1}
]'::jsonb
WHERE slug LIKE '%intake%' OR slug LIKE '%assessment%' OR slug LIKE '%consultation%'
  AND auto_tasks = '[]'::jsonb;

UPDATE case_stage_definitions
SET auto_tasks = '[
  {"title": "Send document checklist to client", "description": "Provide complete list of required documents with instructions", "priority": "high", "due_days_offset": 1},
  {"title": "Request language test results", "description": "Client to provide IELTS/CELPIP/TEF scores", "priority": "high", "due_days_offset": 3},
  {"title": "Request ECA report", "description": "Client to provide Educational Credential Assessment from designated organization", "priority": "high", "due_days_offset": 3},
  {"title": "Verify identity documents", "description": "Review passport, birth certificate, and other identity documents for completeness", "priority": "medium", "due_days_offset": 7},
  {"title": "Collect employment reference letters", "description": "Gather reference letters from all relevant employers", "priority": "medium", "due_days_offset": 14}
]'::jsonb
WHERE slug LIKE '%document%collection%' OR slug LIKE '%document%gather%'
  AND auto_tasks = '[]'::jsonb;

UPDATE case_stage_definitions
SET auto_tasks = '[
  {"title": "Create Express Entry profile", "description": "Set up client profile in IRCC Express Entry system", "priority": "high", "due_days_offset": 3},
  {"title": "Calculate and verify CRS score", "description": "Calculate Comprehensive Ranking System score and verify all point claims", "priority": "high", "due_days_offset": 2},
  {"title": "Prepare application forms", "description": "Complete all required IRCC application forms", "priority": "high", "due_days_offset": 5},
  {"title": "Draft personal statement / LOE", "description": "Draft letter of explanation if applicable", "priority": "medium", "due_days_offset": 7},
  {"title": "Quality review — internal check", "description": "Senior review of complete application package before submission", "priority": "high", "due_days_offset": 10}
]'::jsonb
WHERE slug LIKE '%application%prep%' OR slug LIKE '%preparation%'
  AND auto_tasks = '[]'::jsonb;

UPDATE case_stage_definitions
SET auto_tasks = '[
  {"title": "Submit application to IRCC", "description": "Upload and submit complete application package", "priority": "high", "due_days_offset": 1},
  {"title": "Confirm application receipt", "description": "Verify IRCC acknowledgment of receipt and note application number", "priority": "high", "due_days_offset": 3},
  {"title": "Send client confirmation", "description": "Notify client that application has been submitted with confirmation details", "priority": "medium", "due_days_offset": 1},
  {"title": "Set follow-up reminder", "description": "Create calendar reminder to check application status", "priority": "low", "due_days_offset": 30}
]'::jsonb
WHERE slug LIKE '%submit%' OR slug LIKE '%filed%'
  AND auto_tasks = '[]'::jsonb;

UPDATE case_stage_definitions
SET auto_tasks = '[
  {"title": "Monitor application status", "description": "Check IRCC portal for status updates", "priority": "medium", "due_days_offset": 7},
  {"title": "Schedule biometrics appointment", "description": "Book biometrics collection if requested by IRCC", "priority": "high", "due_days_offset": 3},
  {"title": "Respond to additional document requests", "description": "Prepare and submit any additional documents requested by IRCC", "priority": "high", "due_days_offset": 5}
]'::jsonb
WHERE (slug LIKE '%review%' OR slug LIKE '%processing%' OR slug LIKE '%under_review%')
  AND auto_tasks = '[]'::jsonb;

UPDATE case_stage_definitions
SET auto_tasks = '[
  {"title": "Review decision letter", "description": "Analyze IRCC decision and any conditions", "priority": "high", "due_days_offset": 1},
  {"title": "Send decision notification to client", "description": "Inform client of the decision with next steps", "priority": "high", "due_days_offset": 1},
  {"title": "Process landing / COPR documents", "description": "If approved, assist with Confirmation of Permanent Residence process", "priority": "high", "due_days_offset": 5},
  {"title": "Close matter and final billing", "description": "Complete final billing, archive documents, and close the file", "priority": "medium", "due_days_offset": 14}
]'::jsonb
WHERE (slug LIKE '%approved%' OR slug LIKE '%decision%' OR slug LIKE '%complete%')
  AND auto_tasks = '[]'::jsonb;

-- --------------------------------------------------------------------------
-- 2. Seed checklist_templates for common immigration case types
-- --------------------------------------------------------------------------
-- Only insert if templates don't already exist for the case type

-- For each case type, insert standard document requirements
-- Identity Documents
INSERT INTO checklist_templates (tenant_id, case_type_id, document_name, description, is_required, sort_order, category)
SELECT
  ct.tenant_id,
  ct.id,
  doc.document_name,
  doc.description,
  doc.is_required,
  doc.sort_order,
  doc.category
FROM immigration_case_types ct
CROSS JOIN (
  VALUES
    ('Valid Passport (all pages)', 'Clear colour scans of all pages including blank pages', true, 1, 'identity'),
    ('Birth Certificate', 'Original or certified true copy with English/French translation if applicable', true, 2, 'identity'),
    ('National ID Card', 'Front and back copy', false, 3, 'identity'),
    ('Passport-Size Photos', 'Two recent photos meeting IRCC specifications (35mm x 45mm)', true, 4, 'identity'),
    ('Marriage Certificate', 'If applicable — certified copy with translation', false, 5, 'identity'),
    ('Divorce Certificate', 'If applicable — certified copy with translation', false, 6, 'identity'),
    ('Language Test Results (IELTS/CELPIP/TEF)', 'Official test results less than 2 years old', true, 10, 'language'),
    ('Educational Credential Assessment (ECA)', 'WES or equivalent designated organization report', true, 11, 'education'),
    ('Degree/Diploma Certificates', 'Certified copies of all post-secondary credentials', true, 12, 'education'),
    ('Academic Transcripts', 'Official transcripts from all post-secondary institutions', true, 13, 'education'),
    ('Employment Reference Letters', 'Detailed reference letters from all relevant employers (duties, hours, dates)', true, 20, 'employment'),
    ('Resume / CV', 'Current and comprehensive resume', true, 21, 'employment'),
    ('Job Offer Letter (if applicable)', 'Valid job offer from Canadian employer', false, 22, 'employment'),
    ('LMIA (if applicable)', 'Labour Market Impact Assessment approval', false, 23, 'employment'),
    ('Police Clearance Certificate', 'From each country lived in 6+ months since age 18', true, 30, 'security'),
    ('Medical Examination Results', 'From IRCC-designated panel physician', true, 31, 'medical'),
    ('Proof of Funds', 'Bank statements, investment statements showing settlement funds', true, 40, 'financial'),
    ('Proof of Fee Payment', 'Receipt of IRCC processing fees and Right of PR fee', true, 41, 'financial'),
    ('Signed Retainer Agreement', 'Executed retainer agreement with the firm', true, 50, 'legal'),
    ('Signed Consent Forms', 'IMM 5476 Use of Representative form', true, 51, 'legal')
) AS doc(document_name, description, is_required, sort_order, category)
WHERE NOT EXISTS (
  SELECT 1 FROM checklist_templates ct2
  WHERE ct2.case_type_id = ct.id
  LIMIT 1
);

-- --------------------------------------------------------------------------
-- 3. Ensure stage_entered_at is properly tracked
-- --------------------------------------------------------------------------
-- The stage_entered_at column already exists on matter_immigration.
-- This is used by the front-end to calculate days-in-stage.
-- No schema changes needed — just ensuring the column is populated
-- on all stage transitions (handled by stage-engine.ts).

COMMIT;
