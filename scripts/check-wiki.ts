import { createClient } from '@supabase/supabase-js'

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data, error } = await supabase.from('wiki_playbooks').select('id').limit(1)
  console.log('wiki_playbooks:', JSON.stringify({ exists: !error, error: error?.message }))
}
main()
