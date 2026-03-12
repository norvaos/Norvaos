/**
 * Seed script: Populate auto_tasks on case_stage_definitions
 * and checklist_templates for immigration case types.
 *
 * Run: node scripts/seed-automation.mjs
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// ─── Auto-tasks per stage slug pattern ──────────────────────────────────────

const STAGE_AUTO_TASKS = {
  intake: [
    { title: 'Schedule initial consultation', description: 'Book intake meeting with client to discuss eligibility and pathway options', priority: 'high', due_days_offset: 2 },
    { title: 'Run preliminary eligibility assessment', description: 'Review client qualifications against criteria (CRS score, language, education, work experience)', priority: 'high', due_days_offset: 3 },
    { title: 'Prepare retainer agreement', description: 'Draft and send retainer agreement for client signature', priority: 'medium', due_days_offset: 5 },
    { title: 'Send welcome package to client', description: 'Email welcome package with document requirements and process overview', priority: 'medium', due_days_offset: 1 },
  ],
  document_collection: [
    { title: 'Send document checklist to client', description: 'Provide complete list of required documents with instructions', priority: 'high', due_days_offset: 1 },
    { title: 'Request language test results', description: 'Client to provide IELTS/CELPIP/TEF scores', priority: 'high', due_days_offset: 3 },
    { title: 'Request ECA report', description: 'Client to provide Educational Credential Assessment', priority: 'high', due_days_offset: 3 },
    { title: 'Verify identity documents', description: 'Review passport, birth certificate, and other identity documents', priority: 'medium', due_days_offset: 7 },
    { title: 'Collect employment reference letters', description: 'Gather reference letters from all relevant employers', priority: 'medium', due_days_offset: 14 },
  ],
  application_prep: [
    { title: 'Create application profile', description: 'Set up client profile in the immigration system', priority: 'high', due_days_offset: 3 },
    { title: 'Calculate and verify scores', description: 'Calculate ranking scores and verify all point claims', priority: 'high', due_days_offset: 2 },
    { title: 'Prepare application forms', description: 'Complete all required application forms', priority: 'high', due_days_offset: 5 },
    { title: 'Draft personal statement / LOE', description: 'Draft letter of explanation if applicable', priority: 'medium', due_days_offset: 7 },
    { title: 'Quality review — internal check', description: 'Senior review of complete application package before submission', priority: 'high', due_days_offset: 10 },
  ],
  submitted: [
    { title: 'Submit application', description: 'Upload and submit complete application package', priority: 'high', due_days_offset: 1 },
    { title: 'Confirm application receipt', description: 'Verify acknowledgment of receipt and note application number', priority: 'high', due_days_offset: 3 },
    { title: 'Send client confirmation', description: 'Notify client that application has been submitted', priority: 'medium', due_days_offset: 1 },
    { title: 'Set follow-up reminder', description: 'Create calendar reminder to check application status', priority: 'low', due_days_offset: 30 },
  ],
  under_review: [
    { title: 'Monitor application status', description: 'Check portal for status updates', priority: 'medium', due_days_offset: 7 },
    { title: 'Schedule biometrics appointment', description: 'Book biometrics collection if requested', priority: 'high', due_days_offset: 3 },
    { title: 'Respond to additional document requests', description: 'Prepare and submit any additional documents requested', priority: 'high', due_days_offset: 5 },
  ],
  approved: [
    { title: 'Review decision letter', description: 'Analyze decision and any conditions', priority: 'high', due_days_offset: 1 },
    { title: 'Send decision notification to client', description: 'Inform client of the decision with next steps', priority: 'high', due_days_offset: 1 },
    { title: 'Process landing / confirmation documents', description: 'Assist with confirmation of status process', priority: 'high', due_days_offset: 5 },
    { title: 'Close matter and final billing', description: 'Complete final billing, archive documents, close file', priority: 'medium', due_days_offset: 14 },
  ],
}

// Slug patterns that match each category
const SLUG_PATTERNS = {
  intake: ['intake', 'assessment', 'consultation'],
  document_collection: ['document_collection', 'document_gather', 'documents'],
  application_prep: ['application_prep', 'preparation', 'app_prep'],
  submitted: ['submitted', 'filed', 'submission'],
  under_review: ['under_review', 'review', 'processing'],
  approved: ['approved', 'decision', 'complete', 'landing'],
}

// ─── Checklist templates ────────────────────────────────────────────────────

const CHECKLIST_DOCUMENTS = [
  { document_name: 'Valid Passport (all pages)', description: 'Clear colour scans of all pages including blank pages', is_required: true, sort_order: 1, category: 'identity' },
  { document_name: 'Birth Certificate', description: 'Original or certified true copy with English/French translation if applicable', is_required: true, sort_order: 2, category: 'identity' },
  { document_name: 'National ID Card', description: 'Front and back copy', is_required: false, sort_order: 3, category: 'identity' },
  { document_name: 'Passport-Size Photos', description: 'Two recent photos meeting specifications (35mm x 45mm)', is_required: true, sort_order: 4, category: 'identity' },
  { document_name: 'Marriage Certificate', description: 'If applicable — certified copy with translation', is_required: false, sort_order: 5, category: 'identity' },
  { document_name: 'Divorce Certificate', description: 'If applicable — certified copy with translation', is_required: false, sort_order: 6, category: 'identity' },
  { document_name: 'Language Test Results (IELTS/CELPIP/TEF)', description: 'Official test results less than 2 years old', is_required: true, sort_order: 10, category: 'language' },
  { document_name: 'Educational Credential Assessment (ECA)', description: 'WES or equivalent designated organization report', is_required: true, sort_order: 11, category: 'education' },
  { document_name: 'Degree/Diploma Certificates', description: 'Certified copies of all post-secondary credentials', is_required: true, sort_order: 12, category: 'education' },
  { document_name: 'Academic Transcripts', description: 'Official transcripts from all post-secondary institutions', is_required: true, sort_order: 13, category: 'education' },
  { document_name: 'Employment Reference Letters', description: 'Detailed reference letters from all relevant employers (duties, hours, dates)', is_required: true, sort_order: 20, category: 'employment' },
  { document_name: 'Resume / CV', description: 'Current and comprehensive resume', is_required: true, sort_order: 21, category: 'employment' },
  { document_name: 'Job Offer Letter (if applicable)', description: 'Valid job offer from Canadian employer', is_required: false, sort_order: 22, category: 'employment' },
  { document_name: 'LMIA (if applicable)', description: 'Labour Market Impact Assessment approval', is_required: false, sort_order: 23, category: 'employment' },
  { document_name: 'Police Clearance Certificate', description: 'From each country lived in 6+ months since age 18', is_required: true, sort_order: 30, category: 'security' },
  { document_name: 'Medical Examination Results', description: 'From designated panel physician', is_required: true, sort_order: 31, category: 'medical' },
  { document_name: 'Proof of Funds', description: 'Bank statements, investment statements showing settlement funds', is_required: true, sort_order: 40, category: 'financial' },
  { document_name: 'Proof of Fee Payment', description: 'Receipt of processing fees and Right of PR fee', is_required: true, sort_order: 41, category: 'financial' },
  { document_name: 'Signed Retainer Agreement', description: 'Executed retainer agreement with the firm', is_required: true, sort_order: 50, category: 'legal' },
  { document_name: 'Signed Consent Forms', description: 'Use of Representative form', is_required: true, sort_order: 51, category: 'legal' },
]

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Starting Immigration Automation Seed...\n')

  // 1. Fetch all case_stage_definitions
  const { data: stages, error: stagesErr } = await supabase
    .from('case_stage_definitions')
    .select('id, slug, name, case_type_id, tenant_id, auto_tasks')
    .order('sort_order')

  if (stagesErr) {
    console.error('Failed to fetch stages:', stagesErr.message)
    process.exit(1)
  }

  console.log(`Found ${stages.length} stage definitions\n`)

  // 2. Update auto_tasks for each stage
  let updatedCount = 0
  for (const stage of stages) {
    // Check if auto_tasks is already populated
    const existingTasks = Array.isArray(stage.auto_tasks) ? stage.auto_tasks : []
    if (existingTasks.length > 0) {
      console.log(`  ⏭️  ${stage.name} (${stage.slug}) — already has ${existingTasks.length} auto-tasks, skipping`)
      continue
    }

    // Find matching pattern
    let matchedTasks = null
    for (const [category, patterns] of Object.entries(SLUG_PATTERNS)) {
      if (patterns.some(p => stage.slug.includes(p))) {
        matchedTasks = STAGE_AUTO_TASKS[category]
        break
      }
    }

    if (!matchedTasks) {
      console.log(`  ⚠️  ${stage.name} (${stage.slug}) — no matching auto-task pattern`)
      continue
    }

    const { error: updateErr } = await supabase
      .from('case_stage_definitions')
      .update({ auto_tasks: matchedTasks })
      .eq('id', stage.id)

    if (updateErr) {
      console.error(`  ❌ Failed to update ${stage.name}:`, updateErr.message)
    } else {
      console.log(`  ✅ ${stage.name} (${stage.slug}) — added ${matchedTasks.length} auto-tasks`)
      updatedCount++
    }
  }

  console.log(`\n📋 Updated ${updatedCount} stages with auto-tasks\n`)

  // 3. Seed checklist templates for each case type (if none exist yet)
  const { data: caseTypes, error: ctErr } = await supabase
    .from('immigration_case_types')
    .select('id, name, tenant_id')
    .eq('is_active', true)

  if (ctErr) {
    console.error('Failed to fetch case types:', ctErr.message)
    process.exit(1)
  }

  console.log(`Found ${caseTypes.length} case types\n`)

  let checklistCount = 0
  for (const ct of caseTypes) {
    // Check if templates already exist
    const { count } = await supabase
      .from('checklist_templates')
      .select('*', { count: 'exact', head: true })
      .eq('case_type_id', ct.id)

    if (count && count > 0) {
      console.log(`  ⏭️  ${ct.name} — already has ${count} checklist templates, skipping`)
      continue
    }

    // Insert checklist templates
    const templates = CHECKLIST_DOCUMENTS.map(doc => ({
      tenant_id: ct.tenant_id,
      case_type_id: ct.id,
      ...doc,
    }))

    const { error: insertErr } = await supabase
      .from('checklist_templates')
      .insert(templates)

    if (insertErr) {
      console.error(`  ❌ Failed to seed ${ct.name}:`, insertErr.message)
    } else {
      console.log(`  ✅ ${ct.name} — added ${templates.length} checklist templates`)
      checklistCount++
    }
  }

  console.log(`\n📄 Seeded checklist templates for ${checklistCount} case types\n`)
  console.log('✨ Seed complete!')
}

main().catch(console.error)
