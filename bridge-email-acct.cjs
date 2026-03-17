const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const vars = {};
env.split('\n').forEach(line => { const m = line.match(/^([^=]+)=(.*)$/); if (m) vars[m[1].trim()] = m[2].trim(); });
const { createClient } = require('@supabase/supabase-js');
const admin = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data: conn } = await admin.from('microsoft_connections')
    .select('id, user_id, tenant_id, microsoft_email, microsoft_display_name, access_token_encrypted, refresh_token_encrypted, token_expires_at')
    .eq('user_id', 'e788663b-9b27-4d24-bd71-eba9e5dff9af')
    .eq('is_active', true)
    .single();
  
  if (!conn) { console.log('No connection found'); return; }
  console.log('Found MS connection:', conn.id, 'email:', conn.microsoft_email);
  
  const { data: acct, error } = await admin.from('email_accounts').upsert({
    tenant_id: conn.tenant_id,
    user_id: conn.user_id,
    account_type: 'personal',
    provider: 'microsoft',
    email_address: conn.microsoft_email,
    display_name: conn.microsoft_display_name || null,
    encrypted_access_token: conn.access_token_encrypted,
    encrypted_refresh_token: conn.refresh_token_encrypted,
    token_expires_at: conn.token_expires_at,
    authorized_user_ids: [conn.user_id],
    sync_enabled: true,
    is_active: true,
    error_count: 0,
    last_error: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'tenant_id,email_address' }).select('id, email_address').single();
  
  if (error) {
    console.log('ERROR creating email_accounts:', error.message);
    return;
  }
  
  console.log('Created email_accounts row:', JSON.stringify(acct));
}
main();
