/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Verify IRCC Form Migration  -  Compare DB data against hardcoded constants
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Runs after `seed-ircc-forms.ts` to verify that the DB-seeded data matches
 * the hardcoded constants. Reports any discrepancies.
 *
 * Usage:  npx tsx scripts/verify-ircc-migration.ts
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// ── Env Setup ────────────────────────────────────────────────────────────────

const envPath = resolve(__dirname, '../.env.local')
const envContent = readFileSync(envPath, 'utf-8')
const envVars: Record<string, string> = {}
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/)
  if (match) envVars[match[1].trim()] = match[2].trim()
}

const url = envVars['NEXT_PUBLIC_SUPABASE_URL']
const key = envVars['SUPABASE_SERVICE_ROLE_KEY']

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase: any = createClient(url, key, { auth: { persistSession: false } })

// ── Expected Values (from hardcoded constants) ───────────────────────────────

const EXPECTED = {
  forms: [
    {
      form_code: 'IMM5257E',
      form_name: 'IMM 5257E  -  Application for Temporary Resident Visa',
      xfa_root_element: 'form1',
      checksum: '18f5185fb088fdab8be2b52ac76f0bb8500b3c0cc19e4ac2792c73e0a7ea423a',
      mapping_version: 'IMM5257E-map-v1.0',
    },
    {
      form_code: 'IMM5406',
      form_name: 'IMM 5406  -  Additional Family Information',
      xfa_root_element: 'IMM_5406',
      checksum: '94fbb23db198a1382c3b2fd6aefb147b2bea4d309c9d80e5e4b2a66c812a824e',
      mapping_version: 'IMM5406-map-v1.0',
    },
    {
      form_code: 'IMM5476E',
      form_name: 'IMM 5476E  -  Use of a Representative',
      xfa_root_element: 'IMM_5476',
      checksum: 'aca5c476b93d1c496b1afbc2cfe843499e852e31dcf0c192153bd01f8d6c56c4',
      mapping_version: 'IMM5476E-map-v1.0',
    },
  ],
  // Key profile paths that MUST exist in the DB for each form
  requiredMappings: {
    IMM5257E: [
      'personal.family_name',
      'personal.given_name',
      'personal.date_of_birth',
      'personal.sex',
      'personal.place_of_birth_city',
      'personal.place_of_birth_country',
      'personal.citizenship',
      'personal.current_country_of_residence',
      'marital.status',
      'passport.number',
      'passport.country_of_issue',
      'passport.issue_date',
      'passport.expiry_date',
      'contact_info.email',
      'visit.purpose',
      'visit.from_date',
      'visit.to_date',
      'language.native_language',
      'background.tuberculosis_contact',
      'background.overstayed_visa',
      'background.refused_visa',
      'background.criminal_record',
      'background.deported',
      'background.military_service',
      'background.government_position',
      'background.organization_involvement',
    ],
    IMM5406: [
      'personal.family_name',
      'personal.given_name',
      'personal.date_of_birth',
      'personal.place_of_birth_country',
      'marital.status',
      'marital.spouse_family_name',
      'marital.spouse_given_name',
      'marital.spouse_date_of_birth',
      'family.mother.family_name',
      'family.mother.given_name',
      'family.mother.date_of_birth',
      'family.father.family_name',
      'family.father.given_name',
      'family.father.date_of_birth',
    ],
    IMM5476E: [
      'personal.family_name',
      'personal.given_name',
      'personal.date_of_birth',
      'contact_info.email',
      'contact_info.telephone',
    ],
  },
  // Array maps that must exist
  arrayMaps: {
    IMM5406: ['family.children', 'family.siblings'],
  },
  // Section merge rules
  sectionMerges: {
    IMM5406: {
      applicant: 'personal_details',
      spouse: 'marital_status',
    },
  },
}

// ═══════════════════════════════════════════════════════════════════════════════
// VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════════

async function verify() {
  console.log('🔍 IRCC Migration Verifier  -  Starting...\n')

  let totalChecks = 0
  let passedChecks = 0
  let failedChecks = 0
  const failures: string[] = []

  function check(name: string, passed: boolean, detail?: string) {
    totalChecks++
    if (passed) {
      passedChecks++
      console.log(`  ✅ ${name}`)
    } else {
      failedChecks++
      const msg = detail ? `${name}: ${detail}` : name
      failures.push(msg)
      console.log(`  ❌ ${name}${detail ? `  -  ${detail}` : ''}`)
    }
  }

  // 1. Get tenant
  const { data: tenants } = await supabase
    .from('tenants')
    .select('id')
    .limit(1)

  if (!tenants?.length) {
    console.error('❌ No tenants found')
    process.exit(1)
  }
  const tenantId = tenants[0].id

  // 2. Verify forms exist
  console.log('━━━ Form Records ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  const { data: dbForms } = await supabase
    .from('ircc_forms')
    .select('*')
    .eq('tenant_id', tenantId)

  const formMap = new Map<string, Record<string, unknown>>()
  for (const f of (dbForms ?? [])) {
    formMap.set(f.form_code, f)
  }

  for (const expected of EXPECTED.forms) {
    const dbForm = formMap.get(expected.form_code)
    check(
      `Form ${expected.form_code} exists`,
      !!dbForm,
    )
    if (dbForm) {
      check(
        `  form_name matches`,
        dbForm.form_name === expected.form_name,
        `expected "${expected.form_name}", got "${dbForm.form_name}"`,
      )
      check(
        `  xfa_root_element matches`,
        dbForm.xfa_root_element === expected.xfa_root_element,
        `expected "${expected.xfa_root_element}", got "${dbForm.xfa_root_element}"`,
      )
      check(
        `  checksum_sha256 matches`,
        dbForm.checksum_sha256 === expected.checksum,
        `expected "${expected.checksum.slice(0, 16)}...", got "${String(dbForm.checksum_sha256).slice(0, 16)}..."`,
      )
      check(
        `  mapping_version matches`,
        dbForm.mapping_version === expected.mapping_version,
        `expected "${expected.mapping_version}", got "${dbForm.mapping_version}"`,
      )
    }
  }

  // 3. Verify sections
  console.log('\n━━━ Form Sections ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  for (const expected of EXPECTED.forms) {
    const dbForm = formMap.get(expected.form_code)
    if (!dbForm) continue

    const { data: sections } = await supabase
      .from('ircc_form_sections')
      .select('*')
      .eq('form_id', dbForm.id)
      .order('sort_order', { ascending: true })

    const sectionCount = sections?.length ?? 0
    check(
      `${expected.form_code} has sections`,
      sectionCount > 0,
      `found ${sectionCount} sections`,
    )

    // Check merge rules
    const mergeRules = (EXPECTED.sectionMerges as Record<string, Record<string, string>>)[expected.form_code]
    if (mergeRules && sections) {
      for (const [sectionKey, mergeInto] of Object.entries(mergeRules)) {
        const section = sections.find((s: Record<string, unknown>) => s.section_key === sectionKey)
        if (section) {
          check(
            `  ${expected.form_code}.${sectionKey} merge_into = "${mergeInto}"`,
            section.merge_into === mergeInto,
            `got "${section.merge_into}"`,
          )
        }
      }
    }
  }

  // 4. Verify field mappings
  console.log('\n━━━ Field Mappings ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  for (const [formCode, expectedPaths] of Object.entries(EXPECTED.requiredMappings)) {
    const dbForm = formMap.get(formCode)
    if (!dbForm) continue

    const { data: fields } = await supabase
      .from('ircc_form_fields')
      .select('profile_path, is_mapped, xfa_path, date_split')
      .eq('form_id', dbForm.id)
      .eq('is_mapped', true)

    const dbPaths = new Set(
      (fields ?? [])
        .filter((f: Record<string, unknown>) => f.profile_path)
        .map((f: Record<string, unknown>) => f.profile_path),
    )

    const totalFields = fields?.length ?? 0
    console.log(`  ${formCode}: ${totalFields} mapped fields in DB`)

    for (const path of expectedPaths) {
      check(
        `  ${formCode} has mapping: ${path}`,
        dbPaths.has(path),
      )
    }

    // Verify date-split fields exist for IMM5257E
    if (formCode === 'IMM5257E') {
      const dateSplitFields = (fields ?? []).filter((f: Record<string, unknown>) => f.date_split !== null)
      check(
        `  ${formCode} has date_split fields`,
        dateSplitFields.length > 0,
        `found ${dateSplitFields.length} date_split fields`,
      )
    }
  }

  // 5. Verify array maps
  console.log('\n━━━ Array Maps ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  for (const [formCode, expectedArrayPaths] of Object.entries(EXPECTED.arrayMaps)) {
    const dbForm = formMap.get(formCode)
    if (!dbForm) continue

    const { data: arrayMaps } = await supabase
      .from('ircc_form_array_maps')
      .select('*')
      .eq('form_id', dbForm.id)

    const dbArrayPaths = new Set(
      (arrayMaps ?? []).map((m: Record<string, unknown>) => m.profile_path),
    )

    for (const path of expectedArrayPaths) {
      check(
        `${formCode} has array map: ${path}`,
        dbArrayPaths.has(path),
      )
    }

    // Verify sub_fields are not empty
    for (const am of (arrayMaps ?? [])) {
      const subFieldCount = Object.keys(am.sub_fields ?? {}).length
      check(
        `  ${formCode}.${am.profile_path} has sub_fields`,
        subFieldCount > 0,
        `found ${subFieldCount} sub-fields`,
      )
      check(
        `  ${formCode}.${am.profile_path} max_entries = 6`,
        am.max_entries === 6,
        `got ${am.max_entries}`,
      )
    }
  }

  // 6. Verify meta fields
  console.log('\n━━━ Meta Fields ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  for (const expected of EXPECTED.forms) {
    const dbForm = formMap.get(expected.form_code)
    if (!dbForm) continue

    const { data: metaFields } = await supabase
      .from('ircc_form_fields')
      .select('meta_field_key, xfa_path')
      .eq('form_id', dbForm.id)
      .eq('is_meta_field', true)

    const metaCount = metaFields?.length ?? 0
    if (expected.form_code === 'IMM5476E') {
      check(
        `${expected.form_code} has meta fields (rep fields)`,
        metaCount >= 8,
        `found ${metaCount}`,
      )
    } else {
      check(
        `${expected.form_code} has meta fields (signature)`,
        metaCount >= 2,
        `found ${metaCount}`,
      )
    }
  }

  // 7. Verify value_format for IMM5257E booleans
  console.log('\n━━━ Value Formats ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  const imm5257eForm = formMap.get('IMM5257E')
  if (imm5257eForm) {
    const { data: boolFields } = await supabase
      .from('ircc_form_fields')
      .select('profile_path, value_format')
      .eq('form_id', imm5257eForm.id)
      .eq('field_type', 'boolean')
      .not('value_format', 'is', null)

    const boolWithFormat = boolFields?.length ?? 0
    check(
      `IMM5257E boolean fields have value_format`,
      boolWithFormat > 0,
      `found ${boolWithFormat} boolean fields with value_format`,
    )

    // Verify specific 1/2 format
    if (boolFields?.length) {
      const sample = boolFields[0]
      check(
        `  value_format.boolean_true = "1"`,
        sample.value_format?.boolean_true === '1',
        `got "${sample.value_format?.boolean_true}"`,
      )
      check(
        `  value_format.boolean_false = "2"`,
        sample.value_format?.boolean_false === '2',
        `got "${sample.value_format?.boolean_false}"`,
      )
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60))
  console.log(`🔍 Verification Complete!`)
  console.log(`   Total checks:  ${totalChecks}`)
  console.log(`   Passed:        ${passedChecks} ✅`)
  console.log(`   Failed:        ${failedChecks} ❌`)

  if (failures.length > 0) {
    console.log(`\n⚠️  Failures:`)
    for (const f of failures) {
      console.log(`   - ${f}`)
    }
  }

  console.log('═'.repeat(60))
  process.exit(failedChecks > 0 ? 1 : 0)
}

// ── Run ──────────────────────────────────────────────────────────────────────

verify().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
