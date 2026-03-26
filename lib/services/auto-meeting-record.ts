/**
 * Auto-Meeting Record Generator — Directive 42.0
 *
 * Regulatory requirement: Every initial consultation must have a
 * meeting record auto-generated in the Norva Vault.
 *
 * Called after a contact + lead are created in the Sovereign Intake.
 */

import { createClient } from '@/lib/supabase/client'

interface AutoMeetingRecordParams {
  tenantId: string
  contactId: string
  leadId: string
  contactName: string
  createdBy: string
}

/**
 * Creates a placeholder meeting record document in the vault.
 * The document is created as a "draft" — the lawyer fills it in during/after consultation.
 */
export async function createAutoMeetingRecord({
  tenantId,
  contactId,
  leadId,
  contactName,
  createdBy,
}: AutoMeetingRecordParams): Promise<{ success: boolean; documentId?: string; error?: string }> {
  try {
    const supabase = createClient()
    const today = new Date().toISOString().split('T')[0]
    const fileName = `${contactName.replace(/[^a-zA-Z0-9]+/g, '_')}_MeetingRecord_${today}_v1`

    const { data, error } = await supabase
      .from('documents')
      .insert({
        tenant_id: tenantId,
        contact_id: contactId,
        lead_id: leadId,
        file_name: `${fileName}.md`,
        file_type: 'text/markdown',
        file_size: 0,
        storage_path: '',
        storage_bucket: 'matter-documents',
        document_type: 'note',
        category: 'correspondence',
        version: 1,
        review_status: 'draft',
        description: `Auto-generated meeting record for initial consultation with ${contactName}. Complete this record during or after the consultation.`,
        uploaded_by: createdBy,
        tags: ['auto-generated', 'meeting-record', 'intake'],
      })
      .select('id')
      .single()

    if (error) {
      console.error('[auto-meeting-record] Failed to create:', error.message)
      return { success: false, error: error.message }
    }

    return { success: true, documentId: data.id }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[auto-meeting-record] Exception:', msg)
    return { success: false, error: msg }
  }
}
