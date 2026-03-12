/**
 * Quick check: are IRCC forms already seeded in the DB?
 * Usage: npx tsx scripts/check-seed-status.ts
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

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

const supabase = createClient(url, key, { auth: { persistSession: false } })

async function main() {
  // Check existing forms
  const { data: forms, error } = await supabase
    .from('ircc_forms')
    .select('form_code, id')
    .order('form_code')

  if (error) {
    console.log('DB error:', error.message)
    process.exit(1)
  }

  if (!forms || forms.length === 0) {
    console.log('No forms in DB — seed has NOT been run')
    return
  }

  console.log(`Found ${forms.length} forms:`)

  for (const form of forms) {
    const { count: totalCount } = await supabase
      .from('ircc_form_fields')
      .select('id', { count: 'exact', head: true })
      .eq('form_id', form.id)

    const { count: mappedCount } = await supabase
      .from('ircc_form_fields')
      .select('id', { count: 'exact', head: true })
      .eq('form_id', form.id)
      .eq('is_mapped', true)

    const { count: clientVisibleCount } = await supabase
      .from('ircc_form_fields')
      .select('id', { count: 'exact', head: true })
      .eq('form_id', form.id)
      .eq('is_client_visible', true)

    const { count: arrayMapCount } = await supabase
      .from('ircc_form_array_maps')
      .select('id', { count: 'exact', head: true })
      .eq('form_id', form.id)

    console.log(`  ${form.form_code}: total=${totalCount}, mapped=${mappedCount}, client_visible=${clientVisibleCount}, array_maps=${arrayMapCount}`)
  }

  // Check stream form assignments
  const { data: streamForms } = await supabase
    .from('ircc_stream_forms')
    .select('form_id, case_type_id, ircc_forms(form_code)')
    .order('sort_order')

  if (streamForms && streamForms.length > 0) {
    console.log(`\nStream form assignments: ${streamForms.length}`)
    for (const sf of streamForms as any[]) {
      console.log(`  ${sf.ircc_forms?.form_code ?? 'unknown'} → case_type ${sf.case_type_id}`)
    }
  } else {
    console.log('\nNo stream form assignments')
  }
}

main().catch((e) => {
  console.error('Fatal:', e.message)
  process.exit(1)
})
