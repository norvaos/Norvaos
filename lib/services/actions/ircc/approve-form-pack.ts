/**
 * Action: approve_form_pack
 *
 * Approves a draft form pack version by re-generating the final PDF
 * without watermark from the frozen snapshot, then setting status to 'approved'.
 *
 * Permission: form_packs:approve (Lawyer/Admin only)
 * Surfaces: dashboard
 */

import type { ActionDefinition } from '../types'
import { approveFormPackSchema, type ApproveFormPackInput } from '@/lib/schemas/workflow-actions'
import { generateFinalPack } from '@/lib/ircc/generation-service'
import type { GenerationResult } from '@/lib/types/form-packs'

export const approveFormPackAction: ActionDefinition<ApproveFormPackInput, GenerationResult> = {
  type: 'approve_form_pack',
  label: 'Approve IRCC Form Pack',
  inputSchema: approveFormPackSchema,
  permission: { entity: 'form_packs', action: 'approve' },
  allowedSources: ['dashboard'],
  entityType: 'form_pack_version',
  getEntityId: (input) => input.matterId,

  async snapshotBefore({ input, supabase, tenantId }) {
    // Snapshot the version being approved
    const { data: version } = await supabase
      .from('form_pack_versions')
      .select('id, version_number, status, pack_type, created_at, generated_by')
      .eq('id', input.packVersionId)
      .eq('tenant_id', tenantId)
      .single()

    return version as Record<string, unknown> | null
  },

  async execute({ input, tenantId, userId, supabase }) {
    const result = await generateFinalPack(
      {
        tenantId,
        packVersionId: input.packVersionId,
        userId: userId!,
      },
      supabase,
    )

    // Fetch user name for activity title
    let approverName = 'Unknown'
    if (userId) {
      const { data: user } = await supabase
        .from('users')
        .select('first_name, last_name')
        .eq('id', userId)
        .single()
      approverName = user
        ? [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Unknown'
        : 'Unknown'
    }

    return {
      data: result,
      newState: {
        version_id: result.versionId,
        version_number: result.versionNumber,
        status: 'approved',
        approved_by: userId,
        checksum: result.checksum,
      },
      activity: {
        activityType: 'form_pack_approved',
        title: `IMM5406 v${result.versionNumber} approved by ${approverName}`,
        description: `Final PDF generated without watermark. Version is now immutable.`,
        metadata: {
          version_id: result.versionId,
          version_number: result.versionNumber,
          approved_by: userId,
          final_checksum: result.checksum,
        },
        matterId: input.matterId,
      },
    }
  },

  getMatterId: (input) => input.matterId,
}
