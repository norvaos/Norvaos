/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * IRCC Form Pack Generation Service
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Core orchestrator that validates, snapshots, fills, watermarks, checksums,
 * and stores IRCC form pack PDFs.
 *
 * Design rules:
 *   - ZERO silent fallbacks — every failure throws a typed error
 *   - Template checksum validated before every fill (hard fail on mismatch)
 *   - Input snapshot frozen at generation time (structuredClone)
 *   - Draft PDFs get DRAFT watermark; final PDFs are regenerated clean
 *   - All storage uploads go to tenant-scoped paths
 *   - Version records created via SECURITY DEFINER RPC for atomic numbering
 *
 * Flow (draft):
 *   1. Fetch profile from contacts.immigration_data
 *   2. Compute readiness — hard fail if can_generate === false
 *   3. Validate template checksum — hard fail on mismatch
 *   4. Snapshot profile + resolve XFA fields
 *   5. Fill XFA via Python/pikepdf — hard fail on null return
 *   6. Apply DRAFT watermark
 *   7. Compute checksum of final PDF
 *   8. Upload to Supabase Storage
 *   9. Create version + artifact records via RPC
 *   10. Return structured result
 *
 * Flow (final/approve):
 *   1. Fetch existing draft version + frozen snapshot
 *   2. Validate template checksum
 *   3. Re-fill XFA from frozen snapshot (no watermark)
 *   4. Upload final PDF
 *   5. Add final artifact
 *   6. Approve version via RPC
 *   7. Return result
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/types/database'
import type {
  PackType,
  GenerateFormPackParams,
  GenerationResult,
  GenerateFinalPackParams,
  FormPackValidationResult,
} from '@/lib/types/form-packs'
import { fillXFAFormFromDB, type BarcodeData } from './xfa-filler-db-server'
import { validateFormData } from './form-validator'
import {
  buildXfaFieldDataFromDB,
  computePackReadinessFromDB,
} from './xfa-filler-db'
import {
  computeFileChecksum,
  validateTemplateBytesChecksum,
  TemplateIntegrityError,
  XFAFillError,
  ReadinessError,
} from './pdf-utils'
import { getPlaybook, compareImmIntakeStatus } from '@/lib/config/immigration-playbooks'
import { IMMIGRATION_INTAKE_STATUSES } from '@/lib/utils/constants'
import { writeFile, readFile, mkdtemp, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

// ── Draft Generation ──────────────────────────────────────────────────────────

/**
 * Generate a draft form pack with DRAFT watermark.
 *
 * This is the primary generation entry point called by the
 * `generate_form_pack` action definition.
 *
 * @throws ReadinessError if required fields are missing or validation fails
 * @throws TemplateIntegrityError if template checksum doesn't match
 * @throws XFAFillError if Python/pikepdf fails to produce output
 * @throws Error for storage, database, or other infrastructure failures
 */
export async function generateFormPack(
  params: GenerateFormPackParams,
  supabase: SupabaseClient<Database>,
): Promise<GenerationResult> {
  const { tenantId, matterId, userId, packType, idempotencyKey } = params

  // ── 1. Resolve DB form ──────────────────────────────────────────────────

  const { formId, formCode, expectedChecksum, storagePath: templateStoragePath } = await resolveFormId(supabase, tenantId, packType)

  // ── 2. Fetch the primary contact's immigration profile ──────────────────

  const profile = await fetchImmigrationProfile(supabase, tenantId, matterId)

  // ── 2b. Fetch matter metadata for representative name + PDF filename ────

  const { data: matter } = await supabase
    .from('matters')
    .select('matter_number, responsible_lawyer_id')
    .eq('id', matterId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  let representativeName: string | undefined
  if (matter?.responsible_lawyer_id) {
    const { data: lawyer } = await supabase
      .from('users')
      .select('first_name, last_name')
      .eq('id', matter.responsible_lawyer_id)
      .maybeSingle()
    if (lawyer) {
      const name = [lawyer.first_name, lawyer.last_name].filter(Boolean).join(' ')
      if (name) representativeName = name
    }
  }

  const { data: principalApplicant } = await supabase
    .from('matter_people')
    .select('first_name, last_name')
    .eq('matter_id', matterId)
    .eq('person_role', 'principal_applicant')
    .eq('is_active', true)
    .maybeSingle()

  // ── 2c. Playbook-level generation guard ────────────────────────────────
  await enforcePlaybookGenerationRules(supabase, matterId, packType)

  // ── 3. Compute readiness from DB — hard fail if not ready ───────────────
  const readiness = await computePackReadinessFromDB(profile, [formId], supabase)
  if (!readiness.isReady) {
    throw new ReadinessError(
      readiness.missingFields.map((f) => f.profile_path),
      readiness.missingFields.map((f) => `Required field missing: ${f.label}`),
    )
  }

  // ── 4. Download template + validate checksum ────────────────────────────

  const { bytes: templateBytes, tmpPath: templatePath, cleanup: cleanupTemplate } =
    await downloadFormTemplate(templateStoragePath, supabase)

  try {
    const checksumResult = validateTemplateBytesChecksum(templateBytes, expectedChecksum)
    if (!checksumResult.valid) {
      throw new TemplateIntegrityError(formCode, checksumResult.actual, checksumResult.expected)
    }
    const templateChecksum = checksumResult.actual

    // ── 5. Create frozen snapshot ─────────────────────────────────────────

    const inputSnapshot = structuredClone(profile)
    const resolvedFields = await resolveXFAFieldsFromDB(formId, profile, supabase)
    const mappingVersion = await getMappingVersionFromDB(formId, supabase)

    // ── 6. Validate form data (draft = non-blocking, collected for record) ─

    const { allErrors: draftErrors } = validateFormData(
      formCode,
      resolvedFields as Record<string, string>,
      { forFinalPack: false },
    )

    // ── 7. Fill XFA via DB-driven Python/pikepdf ──────────────────────────

    const draftBarcodeData: BarcodeData = {
      code: formCode,
      applicant: principalApplicant
        ? `${principalApplicant.last_name ?? ''}, ${principalApplicant.first_name ?? ''}`.trim().replace(/^,\s*/, '')
        : '',
      generated: new Date().toISOString().slice(0, 10),
      version: 'v_draft',
      hash: (expectedChecksum ?? checksumResult.actual).slice(0, 16),
    }

    const fillResult = await fillXFAFormFromDB(
      templatePath,
      formId,
      profile as Record<string, unknown>,
      supabase,
      representativeName,
      draftBarcodeData,
    )

    if (!fillResult) {
      throw new XFAFillError(formCode)
    }

    // ── 8. Skip watermark for XFA PDFs ───────────────────────────────────
    // pdf-lib corrupts XFA XML. Filename includes "DRAFT" + DB status = 'draft'.

    const outputBytes = fillResult.bytes

    // ── 9. Compute checksum of final PDF ────────────────────────────────────

    const checksum = computeFileChecksum(outputBytes)

    // ── 10. Build validation result ─────────────────────────────────────────

    const totalMapped = await countMappedFields(formId, supabase)
    const validationResult: FormPackValidationResult = {
      filled_count: Object.keys(resolvedFields).length,
      skipped_count: Math.max(0, totalMapped - Object.keys(resolvedFields).length),
      warnings: [],
      truncations: [],
      hard_errors: draftErrors.length > 0 ? draftErrors : undefined,
      barcode_status: fillResult.barcodeEmbedded ? 'embedded' : 'requires_adobe_reader',
    }

    // ── 11. Create version + artifact via RPC ───────────────────────────────

    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      'create_form_pack_version',
      {
        p_tenant_id: tenantId,
        p_matter_id: matterId,
        p_pack_type: packType,
        p_input_snapshot: inputSnapshot as unknown as Json,
        p_resolved_fields: resolvedFields as unknown as Json,
        p_mapping_version: mappingVersion,
        p_template_checksum: templateChecksum,
        p_validation_result: validationResult as unknown as Json,
        p_generated_by: userId,
        p_idempotency_key: idempotencyKey ?? null,
        p_form_code: formCode,
        p_storage_path: '', // Updated after upload
        p_file_name: '', // Updated after upload
        p_file_size: outputBytes.length,
        p_checksum_sha256: checksum,
        p_is_final: false,
      },
    )

    if (rpcError) {
      throw new Error(`[generate_form_pack] RPC error: ${rpcError.message}`)
    }

    const result = rpcResult as {
      version_id: string
      version_number: number
      artifact_id: string
      idempotent_hit: boolean
    }

    // Tag version with DB generation source + form_id
    await supabase
      .from('form_pack_versions')
      .update({ generation_source: 'db', form_id: formId })
      .eq('id', result.version_id)

    // Check for idempotent hit — return early without re-uploading
    if (result.idempotent_hit) {
      const { data: existingArtifact } = await supabase
        .from('form_pack_artifacts')
        .select('storage_path, file_name, checksum_sha256')
        .eq('id', result.artifact_id)
        .single()

      return {
        versionId: result.version_id,
        versionNumber: result.version_number,
        artifactId: result.artifact_id,
        checksum: existingArtifact?.checksum_sha256 ?? checksum,
        fileName: existingArtifact?.file_name ?? '',
        storagePath: existingArtifact?.storage_path ?? '',
        validationResult,
        idempotentHit: true,
      }
    }

    // ── 12. Upload to Supabase Storage ──────────────────────────────────────

    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const clientPart = principalApplicant
      ? `${sanitizeFilenamePart(principalApplicant.last_name)}_${sanitizeFilenamePart(principalApplicant.first_name)}_`
      : ''
    const matterPart = matter?.matter_number ? `${sanitizeFilenamePart(matter.matter_number)}_` : ''
    const fileName = `${clientPart}${matterPart}${formCode}_${today}_v${result.version_number}_DRAFT.pdf`
    const outputStoragePath = `${tenantId}/ircc-packs/${matterId}/${result.version_id}/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(outputStoragePath, outputBytes, {
        contentType: 'application/pdf',
        upsert: false,
      })

    if (uploadError) {
      throw new Error(`[generate_form_pack] Storage upload failed: ${uploadError.message}`)
    }

    // ── 13. Update artifact with storage path ───────────────────────────────

    const { error: updateError } = await supabase
      .from('form_pack_artifacts')
      .update({
        storage_path: outputStoragePath,
        file_name: fileName,
      })
      .eq('id', result.artifact_id)

    if (updateError) {
      console.error('[generate_form_pack] Failed to update artifact path:', updateError.message)
    }

    return {
      versionId: result.version_id,
      versionNumber: result.version_number,
      artifactId: result.artifact_id,
      checksum,
      fileName,
      storagePath: outputStoragePath,
      validationResult,
      idempotentHit: false,
    }
  } finally {
    cleanupTemplate()
  }
}

// ── Final (Approved) Generation ───────────────────────────────────────────────

/**
 * Generate the final (non-watermarked) PDF from a frozen snapshot
 * and approve the version.
 *
 * This re-fills the XFA from the version's frozen input_snapshot —
 * NOT from the current profile — ensuring the approved PDF matches
 * exactly what the lawyer reviewed.
 *
 * @throws TemplateIntegrityError if template checksum doesn't match
 * @throws XFAFillError if Python/pikepdf fails
 * @throws Error if version is not in 'draft' status
 */
export async function generateFinalPack(
  params: GenerateFinalPackParams,
  supabase: SupabaseClient<Database>,
): Promise<GenerationResult> {
  const { tenantId, packVersionId, userId } = params

  // ── 1. Fetch the existing draft version ─────────────────────────────────

  const { data: version, error: versionError } = await supabase
    .from('form_pack_versions')
    .select('*')
    .eq('id', packVersionId)
    .eq('tenant_id', tenantId)
    .single()

  if (versionError || !version) {
    throw new Error(`[approve_form_pack] Version not found: ${packVersionId}`)
  }

  if (version.status !== 'draft') {
    throw new Error(
      `[approve_form_pack] Only draft versions can be approved. Current status: ${version.status}`
    )
  }

  const packType = version.pack_type as PackType
  const formCode = packType // form_code === pack_type

  // Resolve form ID from DB (use version.form_id if available, else look up)
  const resolved = await resolveFormId(supabase, tenantId, packType)
  const formId = (version as Record<string, unknown>).form_id as string | null
    ?? resolved.formId

  // Frozen snapshot — re-fill from this, not the current profile
  const frozenProfile = version.input_snapshot as Record<string, unknown>

  // ── 1b. Fetch matter metadata for representative name + PDF filename ────

  const { data: finalMatter } = await supabase
    .from('matters')
    .select('matter_number, responsible_lawyer_id')
    .eq('id', version.matter_id)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  let finalRepName: string | undefined
  if (finalMatter?.responsible_lawyer_id) {
    const { data: lawyer } = await supabase
      .from('users')
      .select('first_name, last_name')
      .eq('id', finalMatter.responsible_lawyer_id)
      .maybeSingle()
    if (lawyer) {
      const name = [lawyer.first_name, lawyer.last_name].filter(Boolean).join(' ')
      if (name) finalRepName = name
    }
  }

  const { data: finalPa } = await supabase
    .from('matter_people')
    .select('first_name, last_name')
    .eq('matter_id', version.matter_id)
    .eq('person_role', 'principal_applicant')
    .eq('is_active', true)
    .maybeSingle()

  // ── 1c. Playbook-level generation guard (same as draft) ────────────────
  await enforcePlaybookGenerationRules(supabase, version.matter_id, packType)

  // ── 1d. Field verification gate — all required fields must be verified ──
  if (formId) {
    await enforceFieldVerificationGate(supabase, tenantId, version.matter_id, formId, frozenProfile)
  }

  // ── 2. Download template + validate checksum ─────────────────────────────

  const { bytes: finalTemplateBytes, tmpPath: finalTemplatePath, cleanup: cleanupFinalTemplate } =
    await downloadFormTemplate(resolved.storagePath, supabase)

  try {
    const checksumResult = validateTemplateBytesChecksum(finalTemplateBytes, resolved.expectedChecksum)
    if (!checksumResult.valid) {
      throw new TemplateIntegrityError(
        formCode,
        checksumResult.actual,
        checksumResult.expected,
      )
    }

    // ── 3. Validate from frozen snapshot — final pack mode (blocking) ───────

    const frozenScalarFields = (frozenProfile.scalar_fields ?? frozenProfile) as Record<string, string>
    const { blockingErrors: finalBlockingErrors, allErrors: finalAllErrors } = validateFormData(
      formCode,
      frozenScalarFields,
      { forFinalPack: true },
    )

    if (finalBlockingErrors.length > 0) {
      throw new ReadinessError(
        finalBlockingErrors.map((e) => e.profile_path),
        finalBlockingErrors.map((e) => e.message),
      )
    }

    // ── 4. Re-fill XFA from frozen snapshot via DB path (NO watermark) ─────

    const finalBarcodeData: BarcodeData = {
      code: formCode,
      applicant: finalPa
        ? `${finalPa.last_name ?? ''}, ${finalPa.first_name ?? ''}`.trim().replace(/^,\s*/, '')
        : '',
      generated: new Date().toISOString().slice(0, 10),
      version: `v${version.version_number}`,
      hash: (resolved.expectedChecksum ?? checksumResult.actual).slice(0, 16),
    }

    const fillResult = await fillXFAFormFromDB(
      finalTemplatePath,
      formId,
      frozenProfile,
      supabase,
      finalRepName,
      finalBarcodeData,
    )

    if (!fillResult) {
      throw new XFAFillError(formCode)
    }

    const filledBytes = fillResult.bytes

    // ── 5. Compute checksum ─────────────────────────────────────────────────

    const checksum = computeFileChecksum(filledBytes)

    // ── 6. Upload final PDF to storage ──────────────────────────────────────

    const finalToday = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const finalClientPart = finalPa
      ? `${sanitizeFilenamePart(finalPa.last_name)}_${sanitizeFilenamePart(finalPa.first_name)}_`
      : ''
    const finalMatterPart = finalMatter?.matter_number ? `${sanitizeFilenamePart(finalMatter.matter_number)}_` : ''
    const fileName = `${finalClientPart}${finalMatterPart}${formCode}_${finalToday}_v${version.version_number}_FINAL.pdf`
    const storagePath = `${tenantId}/ircc-packs/${version.matter_id}/${packVersionId}/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, filledBytes, {
        contentType: 'application/pdf',
        upsert: false,
      })

    if (uploadError) {
      throw new Error(`[approve_form_pack] Storage upload failed: ${uploadError.message}`)
    }

    // ── 7. Add final artifact record ────────────────────────────────────────

    const { data: artifactResult, error: artifactError } = await supabase.rpc(
      'add_form_pack_artifact',
      {
        p_tenant_id: tenantId,
        p_version_id: packVersionId,
        p_form_code: formCode,
        p_storage_path: storagePath,
        p_file_name: fileName,
        p_file_size: filledBytes.length,
        p_checksum_sha256: checksum,
        p_is_final: true,
      },
    )

    if (artifactError) {
      throw new Error(`[approve_form_pack] Artifact creation failed: ${artifactError.message}`)
    }

    // ── 8. Approve the version via RPC ──────────────────────────────────────

    const { data: approveResult, error: approveError } = await supabase.rpc(
      'approve_form_pack_version',
      {
        p_tenant_id: tenantId,
        p_version_id: packVersionId,
        p_approved_by: userId,
      },
    )

    if (approveError) {
      throw new Error(`[approve_form_pack] Approval RPC failed: ${approveError.message}`)
    }

    const approval = approveResult as { success: boolean; error?: string }
    if (!approval.success) {
      throw new Error(`[approve_form_pack] Approval failed: ${approval.error}`)
    }

    const baseValidation = (version.validation_result ?? {}) as Partial<FormPackValidationResult>
    const finalValidationResult: FormPackValidationResult = {
      filled_count: baseValidation.filled_count ?? 0,
      skipped_count: baseValidation.skipped_count ?? 0,
      warnings: baseValidation.warnings ?? [],
      truncations: baseValidation.truncations ?? [],
      hard_errors: finalAllErrors.length > 0 ? finalAllErrors : undefined,
      barcode_status: fillResult.barcodeEmbedded ? 'embedded' : 'requires_adobe_reader',
    }

    return {
      versionId: packVersionId,
      versionNumber: version.version_number,
      artifactId: artifactResult as string,
      checksum,
      fileName,
      storagePath,
      validationResult: finalValidationResult,
      idempotentHit: false,
    }
  } finally {
    cleanupFinalTemplate()
  }
}

// ── Playbook Generation Guard ─────────────────────────────────────────────────

/**
 * Enforce playbook-level rules before form pack generation.
 * Checks immigration intake status, questionnaire completion, document
 * acceptance, and contradiction state. Throws ReadinessError with specific
 * reasons if any check fails.
 *
 * This is the "hard lock" that prevents generating form packs before the
 * matter has reached the required stage in the immigration intake workflow.
 */
async function enforcePlaybookGenerationRules(
  supabase: SupabaseClient<Database>,
  matterId: string,
  packType: PackType,
): Promise<void> {
  // Fetch matter intake data
  const { data: intake } = await supabase
    .from('matter_intake')
    .select('tenant_id, program_category, immigration_intake_status, completion_pct, contradiction_flags, contradiction_override_at')
    .eq('matter_id', matterId)
    .maybeSingle()

  if (!intake) return // No intake record — let downstream checks handle

  const playbook = getPlaybook(intake.program_category)
  if (!playbook) return // Not an immigration matter type — skip playbook guard

  const blocks: string[] = []
  const genRules = playbook.formGenerationRules

  // Check 1: Immigration intake status must be >= drafting_enabled
  const currentStatus = intake.immigration_intake_status ?? 'not_issued'
  if (compareImmIntakeStatus(currentStatus, 'drafting_enabled') < 0) {
    const statusLabel = IMMIGRATION_INTAKE_STATUSES.find((s) => s.value === currentStatus)?.label ?? currentStatus
    const targetLabel = IMMIGRATION_INTAKE_STATUSES.find((s) => s.value === 'drafting_enabled')?.label ?? 'Drafting Enabled'
    blocks.push(
      `Immigration intake status is "${statusLabel}" — must reach "${targetLabel}" before form generation is allowed.`
    )
  }

  // Check 2: Questionnaire completion must meet minimum percentage
  if (intake.completion_pct < genRules.minQuestionnairePct) {
    blocks.push(
      `Questionnaire completion is ${intake.completion_pct}% (minimum required: ${genRules.minQuestionnairePct}%).`
    )
  }

  // Check 3: Required documents must be accepted
  if (genRules.requiredDocumentSlugs.length > 0) {
    // Also select slot_slug directly — on-demand PUT slots have slot_template_id = null,
    // so the template-lookup gives '' for them. Fall back to the direct column.
    const { data: slots } = await supabase
      .from('document_slots')
      .select('slot_template_id, slot_slug, status, is_active')
      .eq('matter_id', matterId)
      .eq('is_active', true)

    if (slots && slots.length > 0) {
      // Resolve slot slugs (template-backed slots only; on-demand fallback handled below)
      const templateIds = slots
        .map((s) => s.slot_template_id)
        .filter((id): id is string => !!id)

      let slugMap: Record<string, string> = {}
      const nameMap: Record<string, string> = {}
      if (templateIds.length > 0) {
        const { data: templates } = await supabase
          .from('document_slot_templates')
          .select('id, slot_slug, slot_name')
          .in('id', templateIds)
        if (templates) {
          slugMap = Object.fromEntries(templates.map((t) => [t.id, t.slot_slug]))
          for (const t of templates) nameMap[t.slot_slug] = t.slot_name
        }
      }

      const unaccepted = genRules.requiredDocumentSlugs.filter((slug) => {
        const slot = slots.find((s) => (slugMap[s.slot_template_id ?? ''] || s.slot_slug || '') === slug)
        return !slot || slot.status !== 'accepted'
      })

      if (unaccepted.length > 0) {
        const unacceptedNames = unaccepted.map((slug) => nameMap[slug] ?? slug.replace(/_/g, ' '))
        blocks.push(
          `${unaccepted.length} required document(s) not yet accepted: ${unacceptedNames.join(', ')}.`
        )
      }
    }
  }

  // Check 4: No unresolved blocking contradictions (unless overridden)
  if (genRules.requireNoUnresolvedContradictions) {
    const flags = Array.isArray(intake.contradiction_flags) ? intake.contradiction_flags : []
    const blockingFlags = flags.filter(
      (f: unknown) =>
        typeof f === 'object' && f !== null && (f as Record<string, unknown>).severity === 'blocking'
    )

    if (blockingFlags.length > 0 && !intake.contradiction_override_at) {
      blocks.push(
        `${blockingFlags.length} unresolved blocking contradiction(s). Resolve the underlying data or use the Override button in the Readiness Hub.`
      )
    }
  }

  // Check 5: Readiness matrix drafting blockers + threshold (if matrix rules defined)
  // FAIL-CLOSED: if the matrix engine throws, generation is blocked.
  // For legal immigration workflow, a bug must surface immediately, not silently
  // allow potentially incomplete form packs.
  if (playbook.questionnaireFieldRules && playbook.questionnaireFieldRules.length > 0) {
    const profile = await fetchImmigrationProfile(supabase, intake.tenant_id, matterId)

    const { data: people } = await supabase
      .from('matter_people')
      .select('id, person_role, first_name, last_name, criminal_charges, inadmissibility_flag, is_active')
      .eq('matter_id', matterId)
      .eq('is_active', true)

    const { data: immRow } = await supabase
      .from('matter_immigration')
      .select('prior_refusals, has_criminal_record, spouse_included')
      .eq('matter_id', matterId)
      .maybeSingle()

    const { data: matrixSlotData } = await supabase
      .from('document_slots')
      .select('slot_template_id, slot_slug, status, is_required, is_active, person_id, person_role')
      .eq('matter_id', matterId)
      .eq('is_active', true)

    const matrixTemplateIds = (matrixSlotData ?? [])
      .map((s) => s.slot_template_id)
      .filter((id): id is string => !!id)

    let matrixSlugMap: Record<string, string> = {}
    if (matrixTemplateIds.length > 0) {
      const { data: tmpl } = await supabase
        .from('document_slot_templates')
        .select('id, slot_slug')
        .in('id', matrixTemplateIds)
      if (tmpl) {
        matrixSlugMap = Object.fromEntries(tmpl.map((t) => [t.id, t.slot_slug]))
      }
    }

    const { computeReadinessMatrix } = await import('@/lib/services/readiness-matrix-engine')

    const matrix = computeReadinessMatrix({
      playbook,
      profile,
      people: (people ?? []).map((p) => ({
        id: p.id as string,
        person_role: p.person_role as string,
        first_name: p.first_name as string | null,
        last_name: p.last_name as string | null,
        criminal_charges: (p.criminal_charges ?? false) as boolean,
        inadmissibility_flag: (p.inadmissibility_flag ?? false) as boolean,
        is_active: p.is_active as boolean,
      })),
      documentSlots: (matrixSlotData ?? []).map((s) => ({
        slot_slug: matrixSlugMap[s.slot_template_id ?? ''] || s.slot_slug || '',
        status: s.status as string,
        is_required: s.is_required as boolean,
        is_active: s.is_active as boolean,
        person_id: (s.person_id ?? null) as string | null,
        person_role: (s.person_role ?? null) as string | null,
      })),
      immigration: immRow ? {
        prior_refusals: immRow.prior_refusals,
        has_criminal_record: immRow.has_criminal_record,
        spouse_included: immRow.spouse_included,
      } : null,
    })

    if (matrix) {
      if (matrix.draftingBlockers.length > 0) {
        const labels = matrix.draftingBlockers.map((b) => b.label)
        blocks.push(
          `${matrix.draftingBlockers.length} readiness matrix drafting blocker(s): ${labels.slice(0, 3).join(', ')}${labels.length > 3 ? '…' : ''}`
        )
      }

      if (!matrix.meetsThreshold) {
        blocks.push(
          `Overall readiness is ${matrix.overallPct}% — minimum threshold is ${playbook.readinessThreshold ?? 85}%. Complete missing fields and documents before generating form packs.`
        )
      }
    }
  }

  // Check 6: Portal form completion gate
  // If portal forms are configured and tracked in session.progress.forms,
  // block generation until ALL forms have status='completed'.
  {
    const { data: irccSession } = await supabase
      .from('ircc_questionnaire_sessions')
      .select('progress')
      .eq('matter_id', matterId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formsProgress = (irccSession?.progress as any)?.forms as Record<string, any> | undefined
    if (formsProgress && Object.keys(formsProgress).length > 0) {
      const incompleteEntries = Object.entries(formsProgress).filter(
        ([, entry]) => entry.status !== 'completed'
      )

      if (incompleteEntries.length > 0) {
        // Resolve form names for the blocker message
        const incompleteIds = incompleteEntries.map(([fId]) => fId)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: formInfos } = await (supabase as any)
          .from('ircc_forms')
          .select('id, form_code, form_name')
          .in('id', incompleteIds)

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const nameMap = new Map<string, string>()
        if (formInfos) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const fi of formInfos as any[]) {
            nameMap.set(fi.id, `${fi.form_code} — ${fi.form_name}`)
          }
        }

        const names = incompleteIds
          .map((id) => nameMap.get(id) ?? id.slice(0, 8))
          .slice(0, 3)
        const suffix = incompleteIds.length > 3 ? '...' : ''

        blocks.push(
          `${incompleteEntries.length} portal form(s) incomplete: ${names.join(', ')}${suffix}. Client must complete all forms before package generation.`
        )
      }
    }
  }

  if (blocks.length > 0) {
    throw new ReadinessError([], blocks)
  }
}

// ── Field Verification Gate ───────────────────────────────────────────────────

/**
 * Enforce that all required DB-mapped fields have a current (non-stale)
 * lawyer verification before a final form pack is approved.
 *
 * Called only for final pack generation when a DB form exists.
 * Silently skips when the form has no mapped required fields.
 */
async function enforceFieldVerificationGate(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  matterId: string,
  formId: string,
  frozenProfile: Record<string, unknown>,
): Promise<void> {
  // Fetch required fields that have a profile_path mapping
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: requiredFields } = await (supabase as any)
    .from('ircc_form_fields')
    .select('profile_path, label')
    .eq('form_id', formId)
    .or('is_required.eq.true,is_client_required.eq.true')
    .not('profile_path', 'is', null)

  if (!requiredFields || requiredFields.length === 0) return

  // Fetch existing verifications for this matter
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: verifications } = await (supabase as any)
    .from('field_verifications')
    .select('profile_path, verified_value')
    .eq('matter_id', matterId)
    .eq('tenant_id', tenantId)

  const verificationMap = new Map<string, unknown>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (verifications ?? []).map((v: any) => [v.profile_path as string, v.verified_value]),
  )

  // Helper: resolve a dot-notation path against the profile
  function getProfileValue(profile: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.')
    let cur: unknown = profile
    for (const p of parts) {
      if (cur === null || cur === undefined || typeof cur !== 'object') return undefined
      cur = (cur as Record<string, unknown>)[p]
    }
    return cur
  }

  // Check each required field
  const unverified: string[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const field of requiredFields as any[]) {
    const path = field.profile_path as string
    const label = (field.label as string | null) ?? path
    const profileValue = getProfileValue(frozenProfile, path)

    // Skip fields with no value — they're either optional in practice or
    // will be caught by the readiness matrix
    if (profileValue === null || profileValue === undefined || profileValue === '') continue

    const verifiedValue = verificationMap.get(path)
    if (verifiedValue === undefined) {
      // No verification at all
      unverified.push(label)
    } else if (JSON.stringify(verifiedValue) !== JSON.stringify(profileValue)) {
      // Verification exists but is stale (profile changed after verification)
      unverified.push(`${label} (stale — re-verify after recent changes)`)
    }
  }

  if (unverified.length > 0) {
    throw new ReadinessError(
      [],
      [
        `${unverified.length} required field(s) need lawyer verification before final approval: ${unverified.slice(0, 5).join(', ')}${unverified.length > 5 ? '…' : ''}`,
      ],
    )
  }
}

// ── Internal Helpers ──────────────────────────────────────────────────────────

/**
 * Fetch the primary contact's immigration_data for a matter.
 */
async function fetchImmigrationProfile(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  matterId: string,
): Promise<Record<string, unknown>> {
  // Get primary contact via the matter_contacts junction table
  const { data: matterContact, error: mcError } = await supabase
    .from('matter_contacts')
    .select('contact_id')
    .eq('matter_id', matterId)
    .eq('tenant_id', tenantId)
    .eq('is_primary', true)
    .limit(1)
    .maybeSingle()

  if (mcError || !matterContact?.contact_id) {
    throw new Error(`[generate_form_pack] No primary contact found for matter: ${matterId}`)
  }

  const contactId = matterContact.contact_id

  // Fetch the contact's immigration data
  const { data: contact, error: contactError } = await supabase
    .from('contacts')
    .select('immigration_data')
    .eq('id', contactId)
    .eq('tenant_id', tenantId)
    .single()

  if (contactError || !contact) {
    throw new Error(
      `[generate_form_pack] Contact not found: ${contactId}`
    )
  }

  const profile = contact.immigration_data as Record<string, unknown> | null
  if (!profile || Object.keys(profile).length === 0) {
    throw new Error(
      `[generate_form_pack] No immigration data found for contact ${contactId}. ` +
      `Complete the IRCC intake questionnaire first.`
    )
  }

  return profile
}

// ── DB-Driven Helpers ─────────────────────────────────────────────────────────

/**
 * Resolve the DB form record for a given pack type (form_code).
 * Throws if no DB form is found — there is no legacy fallback.
 */
async function resolveFormId(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  packType: PackType,
): Promise<{ formId: string; formCode: string; expectedChecksum: string | null; storagePath: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: form } = await (supabase as any)
    .from('ircc_forms')
    .select('id, form_code, checksum_sha256, storage_path')
    .eq('form_code', packType)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!form) {
    throw new Error(
      `[generation-service] No DB form found for ${packType}. ` +
      `Upload and seed the form via Settings → IRCC Forms.`
    )
  }

  return {
    formId: form.id,
    formCode: form.form_code,
    expectedChecksum: form.checksum_sha256 ?? null,
    storagePath: form.storage_path,
  }
}

/** Download a form template PDF from Supabase Storage to a temp file. Returns cleanup fn. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function downloadFormTemplate(storagePath: string, supabase: any) {
  // storagePath is like "ircc-forms/IMM5257E.pdf" — extract the form code for local lookup
  const formCode = storagePath.split('/').pop()?.replace('.pdf', '') ?? ''
  const localPath = join(process.cwd(), 'public', 'ircc-forms', `${formCode}.pdf`)

  let bytes: Uint8Array
  try {
    bytes = await readFile(localPath)
  } catch {
    // Local file missing — fall back to Supabase Storage
    const { data, error } = await supabase.storage.from('documents').download(storagePath)
    if (error || !data) {
      throw new Error(`[generation-service] Failed to download template from storage: ${storagePath}`)
    }
    bytes = new Uint8Array(await (data as Blob).arrayBuffer())
  }

  const tmpDir = await mkdtemp(join(tmpdir(), 'ircc-tpl-'))
  const tmpPath = join(tmpDir, 'template.pdf')
  await writeFile(tmpPath, bytes)
  return {
    bytes,
    tmpPath,
    cleanup: () => rm(tmpDir, { recursive: true, force: true }).catch(() => {}),
  }
}

/**
 * Resolve all XFA field values from DB mappings + profile.
 * Returns a flat map of xfa_path → string value for the resolved_fields snapshot.
 */
async function resolveXFAFieldsFromDB(
  formId: string,
  profile: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<Record<string, string>> {
  const xfaData = await buildXfaFieldDataFromDB(formId, profile, supabase)
  if (!xfaData) return {}
  // scalar_fields already contains xfa_path → value
  return { ...xfaData.scalar_fields }
}

/**
 * Get a mapping version string for a DB-driven form.
 * Uses the form's updated_at timestamp as the version identifier.
 */
async function getMappingVersionFromDB(
  formId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<string> {
  const { data } = await supabase
    .from('ircc_forms')
    .select('updated_at')
    .eq('id', formId)
    .single()

  if (data?.updated_at) {
    return `db:${data.updated_at.split('T')[0]}`
  }
  return 'db:unknown'
}

/**
 * Sanitise a string for use as a filename segment.
 * Keeps alphanumerics, collapses everything else to underscores, trims edges.
 */
function sanitizeFilenamePart(s: string | null | undefined): string {
  if (!s) return ''
  return s.trim().replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
}

/**
 * Count total mapped (non-meta) fields for a form.
 */
async function countMappedFields(
  formId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<number> {
  const { count } = await supabase
    .from('ircc_form_fields')
    .select('id', { count: 'exact', head: true })
    .eq('form_id', formId)
    .eq('is_mapped', true)
    .eq('is_meta_field', false)

  return count ?? 0
}
