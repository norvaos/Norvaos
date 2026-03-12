/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * IRCC Form Management Platform — Type Definitions
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Database-driven form management types. These map to the tables created in
 * migration 057-ircc-form-management.sql.
 */

// ── Form Template ────────────────────────────────────────────────────────────

export type ScanStatus = 'pending' | 'scanning' | 'scanned' | 'error'

export interface IrccForm {
  id: string
  tenant_id: string
  form_code: string
  form_name: string
  description: string | null
  description_translations: Record<string, string> | null
  storage_path: string
  file_name: string
  file_size: number | null
  checksum_sha256: string
  xfa_root_element: string | null
  is_xfa: boolean
  scan_status: ScanStatus
  scan_error: string | null
  scan_result: XfaScanResult | null
  mapping_version: string
  is_active: boolean
  current_version: number
  form_date: string | null
  created_at: string
  updated_at: string
}

export interface IrccFormInsert {
  tenant_id: string
  form_code: string
  form_name: string
  description?: string | null
  description_translations?: Record<string, string> | null
  storage_path: string
  file_name: string
  file_size?: number | null
  checksum_sha256: string
  xfa_root_element?: string | null
  is_xfa?: boolean
  scan_status?: ScanStatus
  scan_error?: string | null
  scan_result?: XfaScanResult | null
  mapping_version?: string
  is_active?: boolean
  form_date?: string | null
}

export interface IrccFormUpdate {
  form_code?: string
  form_name?: string
  description?: string | null
  description_translations?: Record<string, string> | null
  storage_path?: string
  file_name?: string
  file_size?: number | null
  checksum_sha256?: string
  xfa_root_element?: string | null
  is_xfa?: boolean
  scan_status?: ScanStatus
  scan_error?: string | null
  scan_result?: XfaScanResult | null
  mapping_version?: string
  is_active?: boolean
  current_version?: number
  form_date?: string | null
}

// ── Form Section ─────────────────────────────────────────────────────────────

export interface IrccFormSection {
  id: string
  tenant_id: string
  form_id: string
  section_key: string
  title: string
  description: string | null
  sort_order: number
  merge_into: string | null
  created_at: string
}

export interface IrccFormSectionInsert {
  tenant_id: string
  form_id: string
  section_key: string
  title: string
  description?: string | null
  sort_order?: number
  merge_into?: string | null
}

// ── Form Field ───────────────────────────────────────────────────────────────

export type IrccFieldType =
  | 'text'
  | 'select'
  | 'date'
  | 'number'
  | 'boolean'
  | 'country'
  | 'repeater'
  | 'email'
  | 'phone'
  | 'textarea'

export type DateSplitPart = 'year' | 'month' | 'day'

export interface FieldShowWhen {
  profile_path: string
  operator: 'equals' | 'is_truthy' | 'is_falsy'
  value?: string | number | boolean
}

export interface FieldRequiredCondition {
  when_path: string
  equals: string[]
}

export interface FieldValueFormat {
  boolean_true?: string   // e.g. '1' for IMM5257E
  boolean_false?: string  // e.g. '2' for IMM5257E
}

export interface FieldOption {
  label: string
  value: string
}

export interface IrccFormField {
  id: string
  tenant_id: string
  form_id: string

  // Scanner-extracted
  xfa_path: string
  xfa_field_type: string | null
  suggested_label: string | null

  // Admin-mapped
  profile_path: string | null
  label: string | null
  field_type: IrccFieldType | null
  options: FieldOption[] | null
  is_required: boolean
  placeholder: string | null
  description: string | null
  section_id: string | null
  sort_order: number
  max_length: number | null

  // Value transformation
  date_split: DateSplitPart | null
  value_format: FieldValueFormat | null

  // Conditional
  show_when: FieldShowWhen | null

  // Array
  is_array_field: boolean
  array_config: Record<string, unknown> | null

  // Readiness
  required_condition: FieldRequiredCondition | null
  readiness_section: string | null

  // Status
  is_mapped: boolean
  is_meta_field: boolean
  meta_field_key: string | null

  // Client portal visibility
  is_client_visible: boolean
  is_client_required: boolean

  created_at: string
  updated_at: string
}

export interface IrccFormFieldInsert {
  tenant_id: string
  form_id: string
  xfa_path: string
  xfa_field_type?: string | null
  suggested_label?: string | null
  profile_path?: string | null
  label?: string | null
  field_type?: IrccFieldType | null
  options?: FieldOption[] | null
  is_required?: boolean
  placeholder?: string | null
  description?: string | null
  section_id?: string | null
  sort_order?: number
  max_length?: number | null
  date_split?: DateSplitPart | null
  value_format?: FieldValueFormat | null
  show_when?: FieldShowWhen | null
  is_array_field?: boolean
  array_config?: Record<string, unknown> | null
  required_condition?: FieldRequiredCondition | null
  readiness_section?: string | null
  is_mapped?: boolean
  is_meta_field?: boolean
  meta_field_key?: string | null
  is_client_visible?: boolean
  is_client_required?: boolean
}

export interface IrccFormFieldUpdate {
  profile_path?: string | null
  label?: string | null
  field_type?: IrccFieldType | null
  options?: FieldOption[] | null
  is_required?: boolean
  placeholder?: string | null
  description?: string | null
  section_id?: string | null
  sort_order?: number
  max_length?: number | null
  date_split?: DateSplitPart | null
  value_format?: FieldValueFormat | null
  show_when?: FieldShowWhen | null
  is_array_field?: boolean
  array_config?: Record<string, unknown> | null
  required_condition?: FieldRequiredCondition | null
  readiness_section?: string | null
  is_mapped?: boolean
  is_meta_field?: boolean
  meta_field_key?: string | null
  is_client_visible?: boolean
  is_client_required?: boolean
}

// ── Array Map ────────────────────────────────────────────────────────────────

export interface IrccFormArrayMap {
  id: string
  tenant_id: string
  form_id: string
  profile_path: string
  xfa_base_path: string
  xfa_entry_name: string
  max_entries: number
  sub_fields: Record<string, string>
  created_at: string
}

export interface IrccFormArrayMapInsert {
  tenant_id: string
  form_id: string
  profile_path: string
  xfa_base_path: string
  xfa_entry_name: string
  max_entries?: number
  sub_fields: Record<string, string>
}

// ── Stream Forms (Junction) ──────────────────────────────────────────────────

export interface IrccStreamForm {
  id: string
  tenant_id: string
  case_type_id: string | null
  matter_type_id: string | null
  form_id: string
  sort_order: number
  is_required: boolean
  created_at: string
}

export interface IrccStreamFormInsert {
  tenant_id: string
  case_type_id?: string | null
  matter_type_id?: string | null
  form_id: string
  sort_order?: number
  is_required?: boolean
}

// ── Custom Field Definitions ─────────────────────────────────────────────────

export interface CustomFieldDef {
  key: string
  label: string
  type: 'text' | 'date' | 'select' | 'number' | 'checkbox'
  required: boolean
  options?: { label: string; value: string }[]
}

export interface FieldVisibility {
  visible: boolean
}

// ── Matter Type Section Config ──────────────────────────────────────────────

export interface MatterTypeSectionConfig {
  id: string
  tenant_id: string
  matter_type_id: string
  section_key: string
  section_label: string
  is_enabled: boolean
  sort_order: number
  field_config: Record<string, FieldVisibility> | null
  custom_fields: CustomFieldDef[] | null
  created_at: string
}

export interface MatterTypeSectionConfigInsert {
  tenant_id: string
  matter_type_id: string
  section_key: string
  section_label: string
  is_enabled?: boolean
  sort_order?: number
  field_config?: Record<string, FieldVisibility>
  custom_fields?: CustomFieldDef[]
}

export interface MatterTypeSectionConfigUpdate {
  is_enabled?: boolean
  sort_order?: number
  section_label?: string
  field_config?: Record<string, FieldVisibility>
  custom_fields?: CustomFieldDef[]
}

// ── XFA Scanner Output ───────────────────────────────────────────────────────

export interface XfaScanField {
  xfa_path: string
  suggested_type: string
  suggested_label: string
  /** Actual printed label text extracted from a sibling <draw> element in the XFA template.
   *  e.g. "Family name / Nom de famille". Null when unavailable (datasets fallback or no draw). */
  caption_label?: string | null
}

export interface XfaScanResult {
  root_element: string | null
  is_xfa: boolean
  field_count: number
  fields: XfaScanField[]
  error?: string
  note?: string
}

// ── Form Version History ────────────────────────────────────────────────────

export interface IrccFormVersion {
  id: string
  tenant_id: string
  form_id: string
  version_number: number
  storage_path: string
  file_name: string
  file_size: number | null
  checksum_sha256: string
  scan_result: XfaScanResult | null
  field_count: number
  mapped_field_count: number
  is_xfa: boolean
  xfa_root_element: string | null
  form_date: string | null
  archived_at: string
  archived_by: string | null
}

// ── Folder Scan & Sync ─────────────────────────────────────────────────────

export type FolderScanItemStatus = 'new' | 'updated' | 'unchanged' | 'missing'

export interface FolderScanItem {
  fileName: string
  formCode: string
  fileSizeBytes: number
  checksumSha256: string
  status: FolderScanItemStatus
  /** Present only for 'updated' items — the existing form's current data */
  existingForm?: {
    id: string
    form_code: string
    form_name: string
    checksum_sha256: string
    file_size: number | null
    field_count: number
    current_version: number
    form_date: string | null
  }
  /** Present only for 'missing' items — form in DB but not in folder */
  missingForm?: {
    id: string
    form_code: string
    form_name: string
  }
}

export interface FolderScanResult {
  folderPath: string
  scannedAt: string
  items: FolderScanItem[]
  summary: {
    total: number
    new: number
    updated: number
    unchanged: number
    missing: number
  }
}

export interface SyncFormRequest {
  fileName: string
  formCode: string
  formName?: string
  formDate?: string | null
  action: 'add' | 'update'
}

export interface SyncResultItem {
  formCode: string
  action: 'add' | 'update'
  success: boolean
  formId?: string
  error?: string
  fieldCount?: number
  previousVersion?: number
  newVersion?: number
  sectionsCreated?: number
}

export interface SyncResult {
  results: SyncResultItem[]
  summary: {
    added: number
    updated: number
    failed: number
  }
}

// ── Joined Views (for UI) ────────────────────────────────────────────────────

/** Form with its field count and section count */
export interface IrccFormWithStats extends IrccForm {
  field_count: number
  mapped_field_count: number
  section_count: number
}

/** Stream form with its form details */
export interface IrccStreamFormWithDetails extends IrccStreamForm {
  form: IrccForm
}
