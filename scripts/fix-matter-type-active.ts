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

  const { data, error } = await sb
    .from('matter_types')
    .update({ is_active: true })
    .eq('tenant_id', TENANT)
    .eq('name', 'Visitor / Entry Matters')
    .select('id, name, is_active')

  if (error) {
    console.error('Error:', error)
    process.exit(1)
  }

  console.log('Updated:', data)
}
main().catch(e => { console.error(e); process.exit(1) })
