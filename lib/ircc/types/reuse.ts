/**
 * IRCC Forms Engine  -  Reuse Types
 *
 * Cross-form and cross-matter reuse event tracking and categorization.
 */

import type { FieldCondition } from './conditions'

/** Type of reuse event */
export type ReuseType = 'cross_form' | 'cross_matter' | 'canonical_prefill'

/** Reuse stability categories for cross-matter import */
export type ReuseCategory = 'stable' | 'semi_stable' | 'matter_specific'

/** A single reuse event record */
export interface ReuseEvent {
  id: string
  tenant_id: string
  reuse_type: ReuseType
  target_instance_id: string
  target_profile_path: string
  source_instance_id?: string
  source_matter_id?: string
  source_canonical_field_id?: string
  value: unknown
  accepted?: boolean
  accepted_by?: string
  accepted_at?: string
  created_at: string
}

/** Classification of canonical fields for cross-matter reuse */
export const REUSE_CATEGORY_MAP: Record<string, ReuseCategory> = {
  // Stable  -  auto-accept unless unverified (17 paths)
  'personal.family_name': 'stable',
  'personal.given_name': 'stable',
  'personal.date_of_birth': 'stable',
  'personal.place_of_birth_city': 'stable',
  'personal.place_of_birth_country': 'stable',
  'personal.citizenship': 'stable',
  'personal.sex': 'stable',
  'personal.eye_colour': 'stable',
  'personal.height_cm': 'stable',
  'personal.uci_number': 'stable',
  'family.mother_full_name': 'stable',
  'family.father_full_name': 'stable',
  'family.mother_date_of_birth': 'stable',
  'family.father_date_of_birth': 'stable',
  'family.mother_place_of_birth': 'stable',
  'family.father_place_of_birth': 'stable',
  'language.native_language': 'stable',

  // Semi-stable  -  require confirmation (26 paths)
  'marital.status': 'semi_stable',
  'marital.spouse_family_name': 'semi_stable',
  'marital.spouse_given_name': 'semi_stable',
  'marital.previous_marriages': 'semi_stable',
  'contact_info.mailing_address': 'semi_stable',
  'contact_info.mailing_address.street_number': 'semi_stable',
  'contact_info.mailing_address.street_name': 'semi_stable',
  'contact_info.mailing_address.city': 'semi_stable',
  'contact_info.mailing_address.province_state': 'semi_stable',
  'contact_info.mailing_address.postal_code': 'semi_stable',
  'contact_info.mailing_address.country': 'semi_stable',
  'contact_info.residential_same_as_mailing': 'semi_stable',
  'contact_info.telephone': 'semi_stable',
  'contact_info.email': 'semi_stable',
  'passport.number': 'semi_stable',
  'passport.country_of_issue': 'semi_stable',
  'passport.issue_date': 'semi_stable',
  'passport.expiry_date': 'semi_stable',
  'occupation.current_title': 'semi_stable',
  'occupation.current_employer': 'semi_stable',
  'employment.current_occupation': 'semi_stable',
  'education.highest_level': 'semi_stable',
  'background.refused_visa': 'semi_stable',
  'background.criminal_record': 'semi_stable',
  'personal.current_country_of_residence': 'semi_stable',
  'personal.residence_status': 'semi_stable',

  // Everything else defaults to matter_specific via getFieldReuseCategory()
}

/**
 * Get the reuse category for a profile_path.
 * Defaults to 'matter_specific' for unclassified paths.
 */
export function getFieldReuseCategory(profilePath: string): ReuseCategory {
  return REUSE_CATEGORY_MAP[profilePath] ?? 'matter_specific'
}

/** Summary of reusable data found for a returning client */
export interface ReuseSummary {
  /** Total canonical fields available */
  total_fields: number
  /** Breakdown by category */
  stable: ReuseCategoryDetail
  semi_stable: ReuseCategoryDetail
  matter_specific: ReuseCategoryDetail
  /** Overall reuse percentage (stable + semi_stable / total_fields) */
  reuse_pct: number
}

export interface ReuseCategoryDetail {
  count: number
  fields: ReusableField[]
}

export interface ReusableField {
  profile_path: string
  label: string
  current_value: unknown
  source: string
  last_verified_at?: string
  effective_from: string
  /** Age of this value in days */
  age_days: number
  /** Whether this field needs re-verification (older than threshold) */
  needs_reverification: boolean
}

/** Composite validation rule (maps to composite_validation_rules table) */
export interface CompositeValidationRule {
  id: string
  tenant_id: string
  form_id: string | null
  rule_key: string
  description: string
  severity: 'blocking' | 'warning'
  scope: 'form' | 'matter' | 'entity'
  condition: FieldCondition
  field_paths: string[]
  error_message: string
  error_message_staff?: string
  is_active: boolean
  sort_order: number
}

/** Result of evaluating a composite validation rule */
export interface CompositeValidationResult {
  rule: CompositeValidationRule
  passed: boolean
  /** If failed, which fields triggered the failure */
  failing_fields?: string[]
}
