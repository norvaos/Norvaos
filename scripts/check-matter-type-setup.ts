import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { resolve } from 'path'
dotenv.config({ path: resolve(process.cwd(), '.env.local') })

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
) as any

async function main() {
  const TENANT = 'da1788a2-8baa-4aa5-9733-97510944afac'

  const { data: pa } = await sb.from('practice_areas').select('id, name, is_enabled').eq('tenant_id', TENANT)
  console.log('Practice areas:')
  for (const p of pa ?? []) console.log(`  [${p.is_enabled ? 'ON' : 'OFF'}] "${p.name}"  id: ${p.id}`)

  const { data: mt } = await sb.from('matter_types').select('id, name, practice_area_id, program_category_key').eq('tenant_id', TENANT)
  console.log('\nMatter types:')
  for (const m of mt ?? []) console.log(`  "${m.name}"  practice_area_id: ${m.practice_area_id ?? 'NULL'}  key: ${m.program_category_key ?? 'null'}`)

  const { data: sf } = await sb.from('ircc_stream_forms').select('form_id, matter_type_id, form:ircc_forms(form_code)').eq('tenant_id', TENANT)
  console.log('\nircc_stream_forms:')
  for (const s of sf ?? []) console.log(`  matter_type: ${s.matter_type_id} → form: ${s.form?.form_code}`)
}
main().catch(e => { console.error(e); process.exit(1) })
