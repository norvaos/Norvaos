import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SelectedSender {
  accountId: string
  emailAddress: string
  displayName: string | null
  reason: string
}

// ─── Sender Selection Priority ──────────────────────────────────────────────
//
// Implements the sender selection priority from the Addendum:
//   1. Reply continuity  -  if replying to a thread, use the account that last
//      sent in the thread (preserves conversation context)
//   2. Matter preference  -  if the matter has a preferred_email_account_id, use it
//   3. Practice area shared mailbox  -  if the matter's practice area has a
//      shared mailbox configured, use it
//   4. User's personal account  -  fall back to the user's personal email account
//
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Select the best email account to send from, based on context.
 *
 * @param supabase - Admin or server Supabase client
 * @param userId - The user initiating the send
 * @param matterId - The matter context (required)
 * @param threadId - Optional thread ID for reply continuity
 */
export async function selectSender(
  supabase: SupabaseClient<Database>,
  userId: string,
  matterId: string,
  threadId?: string
): Promise<SelectedSender | null> {
  // 1. Reply continuity  -  use the account that last sent in the thread
  if (threadId) {
    const { data: thread } = await supabase
      .from('email_threads')
      .select('last_sender_account_id')
      .eq('id', threadId)
      .single()

    if (thread?.last_sender_account_id) {
      const { data: account } = await supabase
        .from('email_accounts')
        .select('id, email_address, display_name')
        .eq('id', thread.last_sender_account_id)
        .eq('is_active', true)
        .single()

      if (account) {
        return {
          accountId: account.id,
          emailAddress: account.email_address,
          displayName: account.display_name,
          reason: 'Reply continuity  -  using same account as last outbound message in thread',
        }
      }
    }
  }

  // 2. Matter preference  -  matter has a preferred_email_account_id
  const { data: matter } = await supabase
    .from('matters')
    .select('preferred_email_account_id, practice_area_id')
    .eq('id', matterId)
    .single()

  if (matter?.preferred_email_account_id) {
    const { data: account } = await supabase
      .from('email_accounts')
      .select('id, email_address, display_name')
      .eq('id', matter.preferred_email_account_id)
      .eq('is_active', true)
      .single()

    if (account) {
      return {
        accountId: account.id,
        emailAddress: account.email_address,
        displayName: account.display_name,
        reason: 'Matter preference  -  using preferred email account for this matter',
      }
    }
  }

  // 3. Practice area shared mailbox
  if (matter?.practice_area_id) {
    const { data: sharedAccount } = await supabase
      .from('email_accounts')
      .select('id, email_address, display_name')
      .eq('practice_area_id', matter.practice_area_id)
      .eq('account_type', 'shared')
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (sharedAccount) {
      return {
        accountId: sharedAccount.id,
        emailAddress: sharedAccount.email_address,
        displayName: sharedAccount.display_name,
        reason: 'Practice area shared mailbox',
      }
    }
  }

  // 4. User's personal email account
  const { data: personalAccount } = await supabase
    .from('email_accounts')
    .select('id, email_address, display_name')
    .eq('user_id', userId)
    .eq('account_type', 'personal')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (personalAccount) {
    return {
      accountId: personalAccount.id,
      emailAddress: personalAccount.email_address,
      displayName: personalAccount.display_name,
      reason: 'User personal email account (fallback)',
    }
  }

  return null
}
