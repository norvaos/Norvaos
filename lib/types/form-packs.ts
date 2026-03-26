/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Form Pack Types  -  TypeScript interfaces for the IRCC form generation system.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Maps to the DB tables created in 052-ircc-form-packs.sql:
 *   form_pack_versions   -  one row per generated draft/approved version
 *   form_pack_artifacts  -  one row per PDF file in a version (INSERT-only)
 *
 * These types are the canonical representation used across:
 *   - React Query hooks (lib/queries/form-packs.ts)
 *   - Generation service (lib/ircc/generation-service.ts)
 *   - Action definitions (lib/services/actions/ircc/*.ts)
 *   - IRCC Forms tab UI (app/(dashboard)/matters/[id]/ircc-forms-tab.tsx)
 */

// ── Pack Type ─────────────────────────────────────────────────────────────────

/**
 * Form pack type identifier  -  any IRCC form code (DB-driven, no hardcoded union).
 */
export type PackType = string

/** Version status lifecycle: draft → approved (terminal, immutable) */
export type PackVersionStatus = 'draft' | 'approved' | 'superseded'

// ── Form Pack Version ─────────────────────────────────────────────────────────

/**
 * One generated version of a form pack.
 * Mirrors `form_pack_versions` table from migration 052.
 */
export interface FormPackVersion {
  id: string
  tenant_id: string
  matter_id: string
  pack_type: PackType
  version_number: number
  status: PackVersionStatus

  /** Deep clone of contacts.immigration_data at generation time */
  input_snapshot: Record<string, unknown>

  /** XFA path → final string value map used for PDF filling */
  resolved_fields: Record<string, string>

  /** Mapping registry version identifier (e.g. 'IMM5406-map-v1.0') */
  mapping_version: string

  /** SHA-256 hex of the blank template PDF used for this generation */
  template_checksum: string

  /** Validation result at generation time */
  validation_result: FormPackValidationResult | null

  /** User who triggered generation */
  generated_by: string | null

  /** User who approved this version (null for drafts) */
  approved_by: string | null

  /** When this version was approved */
  approved_at: string | null

  /** Idempotency key for deduplication */
  idempotency_key: string | null

  created_at: string
}

// ── Form Pack Artifact ────────────────────────────────────────────────────────

/**
 * One PDF file within a form pack version.
 * Mirrors `form_pack_artifacts` table from migration 052.
 * INSERT-only  -  no updates or deletes allowed.
 */
export interface FormPackArtifact {
  id: string
  tenant_id: string
  pack_version_id: string

  /** IRCC form code (e.g. 'IMM5406') */
  form_code: string

  /** Supabase Storage path */
  storage_path: string

  /** Human-readable file name (e.g. 'IMM5406_v3_DRAFT.pdf') */
  file_name: string

  /** File size in bytes */
  file_size: number | null

  /** SHA-256 hex of the PDF file content */
  checksum_sha256: string

  /** false = draft (watermarked), true = final approved (no watermark) */
  is_final: boolean

  created_at: string
}

// ── Validation Result ─────────────────────────────────────────────────────────

/**
 * Structured validation result stored with each form pack version.
 * Captures the exact state of field coverage at generation time.
 */
export interface FormPackValidationResult {
  /** Number of XFA fields that received a value */
  filled_count: number
  /** Number of XFA fields that were skipped (empty in profile) */
  skipped_count: number
  /** Non-blocking warnings (e.g. value truncation) */
  warnings: FormPackWarning[]
  /** Field values that were truncated to fit PDF field limits */
  truncations: FormPackTruncation[]
  /** Blocking validation errors (missing required, cross-field conflicts, etc.) */
  hard_errors?: FormValidationError[]
  /** Barcode embedding status for this version */
  barcode_status?: 'embedded' | 'requires_adobe_reader' | 'skipped'
}

export interface FormValidationError {
  /** Machine-readable error code */
  code: 'missing_required' | 'date_out_of_range' | 'value_too_short' | 'value_too_long' | 'pattern_mismatch' | 'cross_field_conflict'
  /** Profile path that failed validation */
  profile_path: string
  /** Human-readable explanation */
  message: string
  /** Whether this error blocks final pack generation (drafts always allow through) */
  blocking: boolean
}

export interface FormPackWarning {
  /** Profile path that triggered the warning */
  profile_path: string
  /** Human-readable warning message */
  message: string
  /** Warning severity */
  severity: 'info' | 'warning'
}

export interface FormPackTruncation {
  /** XFA field path */
  xfa_path: string
  /** Original value length */
  original_length: number
  /** Maximum allowed length */
  max_length: number
  /** The truncated value that was used */
  truncated_value: string
}

// ── Pack Readiness ────────────────────────────────────────────────────────────

/**
 * Result of computing whether a form pack can be generated.
 * Returned by computePackReadiness() in readiness-engine.ts.
 */
export interface PackReadiness {
  /** Overall completion percentage (0-100) */
  overall_pct: number

  /** Field-level readiness breakdown */
  fields: {
    /** Total number of required fields for this pack */
    total: number
    /** Number of required fields that have values */
    filled: number
    /** List of required fields that are missing */
    missing: MissingField[]
  }

  /** Validation gate  -  blocking errors and non-blocking warnings */
  validation: {
    /** Blocking errors that prevent generation */
    errors: ValidationError[]
    /** Non-blocking warnings (e.g. truncation, optional fields empty) */
    warnings: FormPackWarning[]
  }

  /** True only when errors.length === 0 AND missing required fields === 0 */
  can_generate: boolean
}

export interface MissingField {
  /** Dot-notation profile path (e.g. 'personal.family_name') */
  profile_path: string
  /** Human-readable label for the field */
  label: string
  /** Which section this field belongs to */
  section: string
}

export interface ValidationError {
  /** Error code for programmatic handling */
  code: 'missing_required' | 'array_cap_exceeded' | 'field_overflow' | 'cross_field_invalid'
  /** Profile path involved */
  profile_path: string
  /** Human-readable error message */
  message: string
}

// ── Generation Service Types ──────────────────────────────────────────────────

/**
 * Parameters for generating a form pack draft.
 */
export interface GenerateFormPackParams {
  tenantId: string
  matterId: string
  userId: string
  packType: PackType
  idempotencyKey?: string
}

/**
 * Result returned by the generation service.
 */
export interface GenerationResult {
  versionId: string
  versionNumber: number
  artifactId: string
  checksum: string
  fileName: string
  storagePath: string
  validationResult: FormPackValidationResult
  idempotentHit: boolean
}

/**
 * Parameters for generating the final (approved) pack.
 */
export interface GenerateFinalPackParams {
  tenantId: string
  packVersionId: string
  userId: string
}

// ── Pack Definition ───────────────────────────────────────────────────────────

/**
 * Static definition for a form pack type.
 * Stored in pack-constants.ts, not in the database.
 */
export interface PackDefinition {
  /** Pack type key */
  packType: PackType
  /** Human-readable label */
  label: string
  /** IRCC form codes included in this pack */
  formCodes: string[]
  /** Profile paths that are required for generation */
  requiredFields: RequiredField[]
  /** Path to the blank PDF template on disk */
  templatePath: string
  /** Immigration categories this form applies to. Undefined = all categories. */
  categories?: string[]
}

export interface RequiredField {
  /** Dot-notation path into IRCCProfile */
  profile_path: string
  /** Human-readable label */
  label: string
  /** Section grouping for UI display */
  section: string
  /**
   * Optional condition  -  field is only required when this evaluates to true.
   * Used for spouse fields (required only if marital.status is married/common_law).
   */
  condition?: {
    /** Profile path to check */
    when_path: string
    /** Values that make this field required */
    equals: string[]
  }
}

// ── Form Access Logging ───────────────────────────────────────────────────────

export type FormAccessType = 'view' | 'download' | 'print'
