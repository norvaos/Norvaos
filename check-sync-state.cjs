const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const vars = {};
env.split('\n').forEach(line => { const m = line.match(/^([^=]+)=(.*)$/); if (m) vars[m[1].trim()] = m[2].trim(); });
const { createClient } = require('@supabase/supabase-js');
const admin = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  // Check email_accounts state after sync
  const { data: acct } = await admin.from('email_accounts')
    .select('id, email_address, sync_enabled, last_sync_at, error_count, last_error, delta_link')
    .eq('id', '9a98d8f0-80a2-430d-9924-75d0d68fea1b')
    .single();
  
  console.log('EMAIL ACCOUNT STATE:');
  console.log('  email:', acct.email_address);
  console.log('  sync_enabled:', acct.sync_enabled);
  console.log('  last_sync_at:', acct.last_sync_at);
  console.log('  error_count:', acct.error_count);
  console.log('  last_error:', acct.last_error);
  console.log('  has_delta_link:', !!acct.delta_link);
  if (acct.delta_link) {
    console.log('  delta_link (truncated):', acct.delta_link.substring(0, 100) + '...');
  }
  
  // Check email_threads
  const { data: threads, count: threadCount } = await admin.from('email_threads')
    .select('id, subject, last_message_at, message_count, matter_id, contact_id, association_method, participant_emails', { count: 'exact' })
    .eq('tenant_id', 'da1788a2-8baa-4aa5-9733-97510944afac')
    .order('last_message_at', { ascending: false })
    .limit(10);
  
  console.log('\nEMAIL THREADS: ' + (threadCount || 0) + ' total');
  if (threads) {
    for (const t of threads) {
      console.log('  Thread:', t.subject, '| msgs:', t.message_count, '| matter:', t.matter_id || 'none', '| method:', t.association_method || 'none', '| participants:', (t.participant_emails || []).join(', '));
    }
  }
  
  // Check email_messages
  const { count: msgCount } = await admin.from('email_messages')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', 'da1788a2-8baa-4aa5-9733-97510944afac');
  
  console.log('\nEMAIL MESSAGES: ' + (msgCount || 0) + ' total');
}
main();
