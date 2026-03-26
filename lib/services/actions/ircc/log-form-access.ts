/**
 * Action: log_form_access
 *
 * Lightweight action that records when a user views, downloads, or
 * initiates a print of a form pack artifact. No PDF generation  - 
 * just audit trail.
 *
 * For "print", we log "print initiated" because the actual print
 * happens in Adobe Reader after download, not in-browser.
 *
 * Permission: form_packs:view
 * Surfaces: dashboard, command_centre
 */

import type { ActionDefinition } from '../types'
import { logFormAccessSchema, type LogFormAccessInput } from '@/lib/schemas/workflow-actions'

interface LogFormAccessResult {
  artifactId: string
  accessType: string
  logged: boolean
}

export const logFormAccessAction: ActionDefinition<LogFormAccessInput, LogFormAccessResult> = {
  type: 'log_form_access',
  label: 'Log Form Pack Access',
  inputSchema: logFormAccessSchema,
  permission: { entity: 'form_packs', action: 'view' },
  allowedSources: ['dashboard', 'command_centre'],
  entityType: 'form_pack_artifact',
  getEntityId: (input) => input.matterId,

  async execute({ input, tenantId, supabase }) {
    // Verify the artifact exists and belongs to this tenant
    const { data: artifact, error: artifactError } = await supabase
      .from('form_pack_artifacts')
      .select('id, pack_version_id, form_code, file_name, is_final')
      .eq('id', input.artifactId)
      .eq('tenant_id', tenantId)
      .single()

    if (artifactError || !artifact) {
      throw new Error(`[log_form_access] Artifact not found: ${input.artifactId}`)
    }

    // Get version info for the activity title
    const { data: version } = await supabase
      .from('form_pack_versions')
      .select('version_number, pack_type, status')
      .eq('id', artifact.pack_version_id)
      .single()

    const versionLabel = version
      ? `${version.pack_type} v${version.version_number}`
      : artifact.form_code

    const accessLabel = input.accessType === 'print'
      ? 'print initiated'
      : input.accessType

    return {
      data: {
        artifactId: input.artifactId,
        accessType: input.accessType,
        logged: true,
      },
      activity: {
        activityType: `form_pack_${input.accessType}`,
        title: `${versionLabel} ${accessLabel}`,
        description: input.accessType === 'print'
          ? `Print initiated for ${artifact.file_name}. Actual print happens in Adobe Reader.`
          : `${artifact.file_name} ${input.accessType === 'view' ? 'viewed' : 'downloaded'}`,
        metadata: {
          artifact_id: input.artifactId,
          access_type: input.accessType,
          form_code: artifact.form_code,
          file_name: artifact.file_name,
          is_final: artifact.is_final,
          version_number: version?.version_number,
          pack_type: version?.pack_type,
        },
        matterId: input.matterId,
      },
    }
  },

  getMatterId: (input) => input.matterId,
}
