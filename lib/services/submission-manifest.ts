/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Submission Manifest Generator  -  Directive 082 / Target 11
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Generates a `submission_manifest.json` that accompanies every final
 * IRCC submission package. The manifest provides:
 *
 *   1. SHA-256 hash of every PDF in the package (forms + documents)
 *   2. Timestamp of generation
 *   3. Clerk user ID (who assembled)
 *   4. Principal's approval ID (who authorised submission)
 *   5. Matter metadata (number, applicant, programme)
 *   6. Readiness score at time of generation
 *
 * Designed to be called from:
 *   - `assembleSubmissionPackage()` (final step, after PDF merge)
 *   - The "Generate Final Package" button in the IRCC Workspace
 *
 * The manifest is stored alongside the form_pack_artifacts record in
 * Supabase Storage and referenced by the Sentinel audit trail.
 *
 * Pure function module  -  the SHA-256 hashing uses the Web Crypto API
 * (available in Node 18+ and all modern browsers).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { PacketItem } from '@/lib/services/packet-assembler'

// ── Types ────────────────────────────────────────────────────────────────────

export interface ManifestArtifact {
  /** Display label (e.g. "IMM5257 - Application for Temporary Resident Visa") */
  label: string
  /** Type: ircc_form or document */
  type: 'ircc_form' | 'document'
  /** IRCC form code if applicable (e.g. "IMM5257") */
  formCode?: string
  /** SHA-256 hash of the individual PDF bytes (hex string) */
  sha256: string
  /** File size in bytes */
  sizeBytes: number
  /** Page count in the merged package */
  pageCount: number
  /** Start page in the merged package */
  startPage: number
}

export interface SubmissionManifest {
  /** Manifest schema version */
  schemaVersion: '1.0.0'
  /** Matter UUID */
  matterId: string
  /** Matter reference number */
  matterNumber: string
  /** Primary applicant name */
  applicantName: string
  /** Programme / form set (e.g. "Visitor Visa (TRV)") */
  programme: string
  /** Tenant UUID */
  tenantId: string
  /** User who assembled the package (clerk) */
  assembledByUserId: string
  /** User who authorised submission (principal / supervising lawyer) */
  approvedByUserId: string | null
  /** Approval timestamp (null if not yet approved) */
  approvedAt: string | null
  /** ISO 8601 timestamp of manifest generation */
  generatedAt: string
  /** SHA-256 of the merged final PDF package */
  packageSha256: string
  /** Total size of the merged PDF in bytes */
  packageSizeBytes: number
  /** Total pages in the merged PDF */
  totalPages: number
  /** Readiness score at time of generation (0-100) */
  readinessScore: number
  /** Per-artifact hashes and metadata */
  artifacts: ManifestArtifact[]
  /** Number of IRCC forms in the package */
  formsCount: number
  /** Number of supporting documents in the package */
  documentsCount: number
  /** Representative name (if applicable) */
  representativeName?: string
  /** Barcode embedded in forms */
  barcodeEmbedded: boolean
}

export interface GenerateManifestInput {
  matterId: string
  tenantId: string
  /** The merged PDF bytes (for package-level hash) */
  packageBytes: Uint8Array
  /** Items from PacketResult (for per-item metadata) */
  items: PacketItem[]
  /** Individual PDF bytes for each artifact (parallel to items) */
  artifactBytes: Uint8Array[]
  /** User who assembled the package */
  assembledByUserId: string
  /** User who approved (null if auto-approved or pending) */
  approvedByUserId?: string | null
  /** Approval timestamp */
  approvedAt?: string | null
  /** Readiness score at generation time */
  readinessScore: number
  /** Representative name */
  representativeName?: string
  /** Whether barcodes were embedded */
  barcodeEmbedded?: boolean
}

// ── Main Function ────────────────────────────────────────────────────────────

/**
 * Generate a submission manifest for a final IRCC package.
 *
 * Computes SHA-256 hashes for the full package and each individual artifact.
 * Fetches matter metadata from the database for the manifest header.
 */
export async function generateSubmissionManifest(
  supabase: SupabaseClient,
  input: GenerateManifestInput,
): Promise<SubmissionManifest> {
  const now = new Date().toISOString()

  // ── Fetch matter metadata ──────────────────────────────────────────────

  const { data: matter } = await supabase
    .from('matters')
    .select('id, title, matter_number, practice_area_id')
    .eq('id', input.matterId)
    .single()

  // Fetch primary applicant
  const { data: people } = await supabase
    .from('matter_people')
    .select('first_name, last_name')
    .eq('matter_id', input.matterId)
    .eq('is_active', true)
    .order('sort_order')
    .limit(1)

  const applicantName = people?.[0]
    ? `${people[0].first_name} ${people[0].last_name}`
    : 'Unknown Applicant'

  // Fetch programme label from the matter type
  let programme = 'Immigration Application'
  if (matter?.practice_area_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: matterType } = await (supabase as any)
      .from('matter_form_instances')
      .select('form_name')
      .eq('matter_id', input.matterId)
      .limit(1)
      .maybeSingle()

    if (matterType?.form_name) {
      programme = matterType.form_name
    }
  }

  // ── Compute SHA-256 hashes ─────────────────────────────────────────────

  const packageSha256 = await sha256Hex(input.packageBytes)

  const artifacts: ManifestArtifact[] = await Promise.all(
    input.items.map(async (item, i) => {
      const bytes = input.artifactBytes[i]
      const hash = bytes ? await sha256Hex(bytes) : 'no-bytes-available'

      return {
        label: item.label,
        type: item.type,
        formCode: item.formCode,
        sha256: hash,
        sizeBytes: bytes?.byteLength ?? 0,
        pageCount: item.pageCount,
        startPage: item.startPage,
      }
    }),
  )

  // ── Build manifest ─────────────────────────────────────────────────────

  const manifest: SubmissionManifest = {
    schemaVersion: '1.0.0',
    matterId: input.matterId,
    matterNumber: matter?.matter_number ?? 'N/A',
    applicantName,
    programme,
    tenantId: input.tenantId,
    assembledByUserId: input.assembledByUserId,
    approvedByUserId: input.approvedByUserId ?? null,
    approvedAt: input.approvedAt ?? null,
    generatedAt: now,
    packageSha256,
    packageSizeBytes: input.packageBytes.byteLength,
    totalPages: input.items.reduce((sum, it) => sum + it.pageCount, 0),
    readinessScore: input.readinessScore,
    artifacts,
    formsCount: input.items.filter((it) => it.type === 'ircc_form').length,
    documentsCount: input.items.filter((it) => it.type === 'document').length,
    representativeName: input.representativeName,
    barcodeEmbedded: input.barcodeEmbedded ?? false,
  }

  return manifest
}

// ── Storage ──────────────────────────────────────────────────────────────────

/**
 * Store the manifest as JSON alongside the form pack artifact in Supabase Storage.
 * Returns the storage path.
 */
export async function storeManifest(
  supabase: SupabaseClient,
  manifest: SubmissionManifest,
  storageBucket: string = 'form-packs',
): Promise<string> {
  const fileName = `${manifest.matterId}/manifest_${Date.now()}.json`
  const jsonBytes = new TextEncoder().encode(
    JSON.stringify(manifest, null, 2),
  )

  const { error } = await supabase.storage
    .from(storageBucket)
    .upload(fileName, jsonBytes, {
      contentType: 'application/json',
      upsert: false,
    })

  if (error) {
    console.error('[submission-manifest] Storage upload failed:', error)
    throw new Error(`Manifest storage failed: ${error.message}`)
  }

  return fileName
}

// ── Verification ─────────────────────────────────────────────────────────────

/**
 * Verify a previously generated manifest against current package bytes.
 * Returns true if the SHA-256 of the package matches the manifest record.
 *
 * Used by the Sentinel audit system to detect tampering.
 */
export async function verifyManifest(
  manifest: SubmissionManifest,
  packageBytes: Uint8Array,
): Promise<{ valid: boolean; computedHash: string; expectedHash: string }> {
  const computedHash = await sha256Hex(packageBytes)
  return {
    valid: computedHash === manifest.packageSha256,
    computedHash,
    expectedHash: manifest.packageSha256,
  }
}

/**
 * Verify individual artifacts within a package.
 * Returns per-artifact verification results.
 */
export async function verifyArtifacts(
  manifest: SubmissionManifest,
  artifactBytes: Uint8Array[],
): Promise<Array<{ label: string; valid: boolean; expected: string; computed: string }>> {
  return Promise.all(
    manifest.artifacts.map(async (artifact, i) => {
      const bytes = artifactBytes[i]
      const computed = bytes ? await sha256Hex(bytes) : 'no-bytes'
      return {
        label: artifact.label,
        valid: computed === artifact.sha256,
        expected: artifact.sha256,
        computed,
      }
    }),
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Compute SHA-256 hash of a Uint8Array and return as lowercase hex string.
 * Uses Web Crypto API (available in Node 18+ and all modern browsers).
 */
async function sha256Hex(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data as ArrayBufferView<ArrayBuffer>)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Create a summary string from a manifest (for display in UI).
 */
export function formatManifestSummary(manifest: SubmissionManifest): string {
  const lines = [
    `Package: ${manifest.matterNumber} - ${manifest.applicantName}`,
    `Programme: ${manifest.programme}`,
    `Generated: ${new Date(manifest.generatedAt).toLocaleString('en-CA')}`,
    `SHA-256: ${manifest.packageSha256.slice(0, 16)}...`,
    `Size: ${(manifest.packageSizeBytes / 1024).toFixed(1)} KB`,
    `Pages: ${manifest.totalPages}`,
    `Forms: ${manifest.formsCount} | Documents: ${manifest.documentsCount}`,
    `Readiness: ${manifest.readinessScore}%`,
    manifest.approvedByUserId
      ? `Approved: ${manifest.approvedAt ?? 'Yes'}`
      : 'Approval: Pending',
  ]
  return lines.join('\n')
}
