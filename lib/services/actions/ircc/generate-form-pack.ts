/**
 * Action: generate_form_pack
 *
 * Generates a draft form pack (DRAFT watermarked PDF) for a matter.
 * Routes through the Action Executor for idempotency, audit trail, and observability.
 *
 * Permission: form_packs:create
 * Surfaces: dashboard, command_centre
 */

import type { ActionDefinition } from '../types'
import { generateFormPackSchema, type GenerateFormPackInput } from '@/lib/schemas/workflow-actions'
import { generateFormPack } from '@/lib/ircc/generation-service'
import type { GenerationResult } from '@/lib/types/form-packs'

export const generateFormPackAction: ActionDefinition<GenerateFormPackInput, GenerationResult> = {
  type: 'generate_form_pack',
  label: 'Generate IRCC Form Pack Draft',
  inputSchema: generateFormPackSchema,
  permission: { entity: 'form_packs', action: 'create' },
  allowedSources: ['dashboard', 'command_centre'],
  entityType: 'form_pack_version',
  getEntityId: (input) => input.matterId,

  async snapshotBefore({ input, supabase, tenantId }) {
    // Snapshot existing versions for this matter + pack type
    const { data: versions } = await supabase
      .from('form_pack_versions')
      .select('id, version_number, status, created_at')
      .eq('matter_id', input.matterId)
      .eq('tenant_id', tenantId)
      .eq('pack_type', input.packType)
      .order('version_number', { ascending: false })
      .limit(5)

    return {
      existing_versions: versions ?? [],
      pack_type: input.packType,
    }
  },

  async execute({ input, tenantId, userId, supabase, source }) {
    // Generate idempotency key from source context
    const idempotencyKey = `gen_${input.matterId}_${input.packType}_${userId}_${Date.now()}`

    const result = await generateFormPack(
      {
        tenantId,
        matterId: input.matterId,
        userId: userId!,
        packType: input.packType,
        idempotencyKey,
      },
      supabase,
    )

    return {
      data: result,
      newState: {
        version_id: result.versionId,
        version_number: result.versionNumber,
        status: 'draft',
        checksum: result.checksum,
        idempotent_hit: result.idempotentHit,
      },
      activity: {
        activityType: 'form_pack_generated',
        title: `${input.packType} draft v${result.versionNumber} generated`,
        description: result.idempotentHit
          ? `Idempotent hit — returned existing draft v${result.versionNumber}`
          : `Generated new draft v${result.versionNumber} (${result.validationResult.filled_count} fields filled)`,
        metadata: {
          pack_type: input.packType,
          version_number: result.versionNumber,
          version_id: result.versionId,
          filled_count: result.validationResult.filled_count,
          skipped_count: result.validationResult.skipped_count,
          warning_count: result.validationResult.warnings.length,
          source,
        },
        matterId: input.matterId,
      },
    }
  },

  getMatterId: (input) => input.matterId,
}
