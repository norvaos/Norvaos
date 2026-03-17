/**
 * Document Rejection Handler
 *
 * Checks if a document slot has been rejected 3+ times and,
 * if so, raises a DOCUMENT_AUTHENTICITY risk flag on the matter.
 *
 * Call this after every 'reject' action in the document review route.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

export async function checkAndFlagRepeatedRejections(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  matterId: string,
  slotId: string,
): Promise<void> {
  // Count rejected versions for this slot
  const { count } = await supabase
    .from('document_versions')
    .select('id', { count: 'exact', head: true })
    .eq('slot_id', slotId)
    .eq('review_status', 'rejected')

  if ((count ?? 0) >= 3) {
    // Check if an elevated DOCUMENT_AUTHENTICITY flag already exists for this slot
    // We check at the matter level (no slot_id FK on matter_risk_flags)
    const { data: existing } = await supabase
      .from('matter_risk_flags')
      .select('id')
      .eq('matter_id', matterId)
      .eq('flag_type', 'DOCUMENT_AUTHENTICITY')
      .eq('status', 'open')
      .maybeSingle()

    if (!existing) {
      await supabase.from('matter_risk_flags').insert({
        tenant_id: tenantId,
        matter_id: matterId,
        flag_type: 'DOCUMENT_AUTHENTICITY',
        severity: 'elevated',
        detected_at: new Date().toISOString(),
        status: 'open',
      })
    }
  }
}
