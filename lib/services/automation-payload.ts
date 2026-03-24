/**
 * Automation Payload Service
 *
 * Assembles a flat JSON payload from a locked matter's intake data,
 * canonical profile, approved documents, and form packs. Designed to
 * be consumed by the Norva-Bridge Chrome Extension for IRCC portal
 * autofill.
 *
 * Phase 5: IRCC Portal Automation & Payload API
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { createAdminClient } from '@/lib/supabase/admin'
import { irccProfilePartialSchema, type IRCCProfilePartial } from '@/lib/schemas/ircc-profile'

// ── Types ────────────────────────────────────────────────────────────────────

export interface AutomationPayloadMeta {
  matterId: string
  matterNumber: string
  generatedAt: string
  payloadVersion: '1.0'
}

export interface AutomationPayloadIntake {
  jurisdiction: string
  processingStream: string | null
  programCategory: string | null
  intakeDelegation: string
}

export interface AutomationPayloadDocument {
  slotSlug: string
  slotName: string
  category: string
  fileName: string
  fileType: string
  signedUrl: string
  portalUploadLabel: string | null
}

export interface AutomationPayloadFormPack {
  packType: string
  versionNumber: number
  fileName: string
  signedUrl: string
}

export interface AutomationPayload {
  meta: AutomationPayloadMeta
  profile: IRCCProfilePartial
  intake: AutomationPayloadIntake
  documents: AutomationPayloadDocument[]
  formPacks: AutomationPayloadFormPack[]
}

// ── Slot-to-portal-label mapping ─────────────────────────────────────────────
// Maps NorvaOS document_slot categories/names to the IRCC portal upload labels.
// This is a best-effort mapping; the Chrome extension field-mapper has the
// authoritative portal DOM selectors.

const SLOT_TO_PORTAL_LABEL: Record<string, string> = {
  passport_bio_page: 'Travel Document',
  photo_id: 'Photograph',
  proof_of_funds: 'Proof of Means of Financial Support',
  letter_of_invitation: 'Letter of Invitation',
  travel_itinerary: 'Travel Itinerary',
  proof_of_employment: 'Employment Letter',
  study_acceptance: 'Letter of Acceptance',
  medical_exam: 'Upfront Medical Exam',
  police_certificate: 'Police Certificates/Clearances',
  marriage_certificate: 'Marriage Certificate/Licence',
  birth_certificate: 'Birth Certificate',
  custody_documents: 'Custody Documents',
  sponsorship_agreement: 'Sponsorship Agreement',
  proof_of_relationship: 'Proof of Relationship',
  digital_photo: 'Digital Photo',
  schedule_1: 'Schedule 1',
}

// ── Service function ─────────────────────────────────────────────────────────

export async function assembleAutomationPayload(
  supabase: SupabaseClient<Database>,
  matterId: string,
  tenantId: string,
): Promise<{ payload: AutomationPayload } | { error: string; status: number; issues?: unknown }> {
  // 1. Fetch matter details
  const { data: matter, error: matterErr } = await supabase
    .from('matters')
    .select('id, title, matter_number, tenant_id')
    .eq('id', matterId)
    .eq('tenant_id', tenantId)
    .single()

  if (matterErr || !matter) {
    return { error: 'Matter not found', status: 404 }
  }

  // 2. Fetch matter_intake — verify locked and complete
  const { data: intake, error: intakeErr } = await supabase
    .from('matter_intake')
    .select(
      'id, intake_status, processing_stream, program_category, jurisdiction, intake_delegation, completion_pct'
    )
    .eq('matter_id', matterId)
    .single()

  if (intakeErr || !intake) {
    return { error: 'No intake record found for this matter', status: 404 }
  }

  if (intake.intake_status !== 'locked') {
    return {
      error: 'Intake must be locked before generating automation payload',
      status: 409,
    }
  }

  if (intake.completion_pct != null && intake.completion_pct < 100) {
    return {
      error: `Intake is incomplete (${intake.completion_pct}% complete). All fields must be filled before submission.`,
      status: 409,
    }
  }

  // 3. Fetch the latest canonical profile snapshot for this matter
  const { data: snapshots } = await supabase
    .from('canonical_profile_snapshots')
    .select('id, snapshot_data')
    .eq('matter_id', matterId)
    .order('created_at', { ascending: false })
    .limit(1)

  let profileData: IRCCProfilePartial = {}

  if (snapshots && snapshots.length > 0) {
    // Validate snapshot data against partial schema
    const parsed = irccProfilePartialSchema.safeParse(snapshots[0].snapshot_data)
    if (parsed.success) {
      profileData = parsed.data
    } else {
      return {
        error: 'Profile data validation failed. Please review and correct the intake data.',
        status: 422,
        issues: parsed.error.issues,
      }
    }
  } else {
    // Fallback: try to assemble profile from form instance answers.
    // matter_form_instances engine columns (answers JSONB) were added in
    // migration 145 but aren't in the generated DB types yet.
    // matter_form_instances engine columns (answers JSONB) added in migration 145
    // aren't in the generated DB types — cast to bypass strict table name checking.
    const adminFallback = createAdminClient() as unknown as {
      from: (table: string) => {
        select: (cols: string) => {
          eq: (col: string, val: string) => {
            not: (col: string, op: string, val: null) => PromiseLike<{
              data: Array<{ id: string; answers: unknown }> | null
            }>
          }
        }
      }
    }
    const { data: formInstances } = await adminFallback
      .from('matter_form_instances')
      .select('id, answers')
      .eq('matter_id', matterId)
      .not('answers', 'is', null)

    const fiRows = formInstances as Array<{ id: string; answers: unknown }> | null
    if (fiRows && fiRows.length > 0) {
      // Merge all form instance answers into a single object
      const merged: Record<string, unknown> = {}
      for (const fi of fiRows) {
        if (fi.answers && typeof fi.answers === 'object') {
          Object.assign(merged, fi.answers as Record<string, unknown>)
        }
      }
      const parsed = irccProfilePartialSchema.safeParse(merged)
      if (parsed.success) {
        profileData = parsed.data
      }
      // If validation fails on fallback, we proceed with empty profile
      // rather than blocking — the extension will show unmapped fields
    }
  }

  // 4. Fetch approved documents with signed URLs
  const adminClient = createAdminClient()

  const { data: slots } = await supabase
    .from('document_slots')
    .select('id, slot_name, category, sort_order, current_document_id, current_version')
    .eq('matter_id', matterId)
    .eq('is_active', true)
    .not('current_document_id', 'is', null)
    .order('sort_order')

  const documents: AutomationPayloadDocument[] = []

  if (slots && slots.length > 0) {
    const slotIds = slots.map((s) => s.id)
    const { data: versions } = await supabase
      .from('document_versions')
      .select('id, slot_id, version_number, storage_path, file_name, file_type, review_status')
      .in('slot_id', slotIds)
      .in('review_status', ['approved', 'reviewed', 'accepted'])
      .order('version_number', { ascending: false })

    if (versions) {
      // Use latest approved version per slot
      const latestBySlot = new Map<string, typeof versions[0]>()
      for (const v of versions) {
        if (!latestBySlot.has(v.slot_id)) {
          latestBySlot.set(v.slot_id, v)
        }
      }

      for (const slot of slots) {
        const version = latestBySlot.get(slot.id)
        if (!version) continue

        // Generate signed URL (1-hour expiry)
        const { data: signedUrlData, error: urlError } = await adminClient.storage
          .from('documents')
          .createSignedUrl(version.storage_path, 3600)

        if (urlError || !signedUrlData) continue

        // Derive slug from slot_name for mapping
        const slotSlug = slot.slot_name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_|_$/g, '')

        documents.push({
          slotSlug,
          slotName: slot.slot_name,
          category: slot.category || 'general',
          fileName: version.file_name,
          fileType: version.file_type || 'application/pdf',
          signedUrl: signedUrlData.signedUrl,
          portalUploadLabel: SLOT_TO_PORTAL_LABEL[slotSlug] || null,
        })
      }
    }
  }

  // 5. Fetch approved form pack artifacts with signed URLs
  const formPacks: AutomationPayloadFormPack[] = []

  const { data: packVersions } = await supabase
    .from('form_pack_versions')
    .select('id, version_number, status, pack_type')
    .eq('matter_id', matterId)
    .eq('tenant_id', tenantId)
    .eq('status', 'approved')
    .order('version_number', { ascending: false })

  if (packVersions && packVersions.length > 0) {
    // Get final artifacts for all approved versions
    const versionIds = packVersions.map((v) => v.id)
    const { data: artifacts } = await supabase
      .from('form_pack_artifacts')
      .select('id, pack_version_id, storage_path, file_name')
      .in('pack_version_id', versionIds)
      .eq('tenant_id', tenantId)
      .eq('is_final', true)

    if (artifacts) {
      const artifactByVersion = new Map<string, typeof artifacts[0]>()
      for (const a of artifacts) {
        artifactByVersion.set(a.pack_version_id, a)
      }

      for (const pv of packVersions) {
        const artifact = artifactByVersion.get(pv.id)
        if (!artifact) continue

        const { data: signedUrlData, error: urlError } = await adminClient.storage
          .from('documents')
          .createSignedUrl(artifact.storage_path, 3600)

        if (urlError || !signedUrlData) continue

        formPacks.push({
          packType: pv.pack_type || 'unknown',
          versionNumber: pv.version_number,
          fileName: artifact.file_name,
          signedUrl: signedUrlData.signedUrl,
        })
      }
    }
  }

  // 6. Assemble the payload
  const payload: AutomationPayload = {
    meta: {
      matterId: matter.id,
      matterNumber: matter.matter_number || matterId,
      generatedAt: new Date().toISOString(),
      payloadVersion: '1.0',
    },
    profile: profileData,
    intake: {
      jurisdiction: intake.jurisdiction || '',
      processingStream: intake.processing_stream || null,
      programCategory: intake.program_category || null,
      intakeDelegation: intake.intake_delegation || 'pa_only',
    },
    documents,
    formPacks,
  }

  return { payload }
}
