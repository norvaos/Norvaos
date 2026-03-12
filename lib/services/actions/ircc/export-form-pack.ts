/**
 * Action: export_form_pack
 *
 * Generates a signed download URL for an approved form pack version.
 * Only approved versions can be exported (draft versions use the
 * regular view/download flow with watermark).
 *
 * Permission: form_packs:export (Lawyer/Admin only)
 * Surfaces: dashboard
 */

import type { ActionDefinition } from '../types'
import { exportFormPackSchema, type ExportFormPackInput } from '@/lib/schemas/workflow-actions'

interface ExportFormPackResult {
  signedUrl: string
  fileName: string
  versionNumber: number
  packType: string
}

export const exportFormPackAction: ActionDefinition<ExportFormPackInput, ExportFormPackResult> = {
  type: 'export_form_pack',
  label: 'Export IRCC Form Pack',
  inputSchema: exportFormPackSchema,
  permission: { entity: 'form_packs', action: 'export' },
  allowedSources: ['dashboard'],
  entityType: 'form_pack_version',
  getEntityId: (input) => input.matterId,

  async execute({ input, tenantId, supabase }) {
    // 1. Verify the version exists and is approved
    const { data: version, error: versionError } = await supabase
      .from('form_pack_versions')
      .select('id, version_number, status, pack_type')
      .eq('id', input.packVersionId)
      .eq('tenant_id', tenantId)
      .single()

    if (versionError || !version) {
      throw new Error(`[export_form_pack] Version not found: ${input.packVersionId}`)
    }

    if (version.status !== 'approved') {
      throw new Error(
        `[export_form_pack] Only approved versions can be exported. ` +
        `Current status: ${version.status}. Approve the version first.`
      )
    }

    // 2. Get the final artifact (is_final = true)
    const { data: artifact, error: artifactError } = await supabase
      .from('form_pack_artifacts')
      .select('id, storage_path, file_name')
      .eq('pack_version_id', input.packVersionId)
      .eq('tenant_id', tenantId)
      .eq('is_final', true)
      .single()

    if (artifactError || !artifact) {
      throw new Error(
        `[export_form_pack] No final artifact found for version ${input.packVersionId}. ` +
        `The approval process may have failed to generate the final PDF.`
      )
    }

    // 3. Generate a signed URL (1-hour expiry)
    const { data: signedUrlData, error: urlError } = await supabase.storage
      .from('documents')
      .createSignedUrl(artifact.storage_path, 3600)

    if (urlError || !signedUrlData) {
      throw new Error(`[export_form_pack] Failed to create signed URL: ${urlError?.message}`)
    }

    return {
      data: {
        signedUrl: signedUrlData.signedUrl,
        fileName: artifact.file_name,
        versionNumber: version.version_number,
        packType: version.pack_type,
      },
      newState: {
        version_id: version.id,
        exported: true,
      },
      activity: {
        activityType: 'form_pack_exported',
        title: `${version.pack_type} v${version.version_number} exported`,
        description: `Signed download URL generated for final approved PDF.`,
        metadata: {
          version_id: version.id,
          version_number: version.version_number,
          artifact_id: artifact.id,
          pack_type: version.pack_type,
        },
        matterId: input.matterId,
      },
    }
  },

  getMatterId: (input) => input.matterId,
}
