/**
 * IRCC Form Pack Constants
 *
 * Form data is now managed entirely via the DB (ircc_forms, ircc_form_sections,
 * ircc_form_fields tables). No forms are hardcoded here.
 *
 * SUPPORTED_PACK_TYPES and PACK_DEFINITIONS are intentionally empty until
 * forms are configured through the IRCC Form Library settings.
 */

import type { PackDefinition, PackType } from '@/lib/types/form-packs'

export const MAPPING_VERSIONS: Record<string, string> = {}

export const EXPECTED_TEMPLATE_CHECKSUMS: Record<string, string> = {}

export const IMM5406_FIELD_MAX_LENGTHS: Record<string, number> = {}
export const IMM5406_ARRAY_CAPS: Record<string, number> = {}
export const IMM5476E_FIELD_MAX_LENGTHS: Record<string, number> = {}
export const IMM5257E_FIELD_MAX_LENGTHS: Record<string, number> = {}

export const SPOUSE_REQUIRED_STATUSES = [] as const

export const PACK_DEFINITIONS: Record<string, PackDefinition> = {}

export const SUPPORTED_PACK_TYPES: PackType[] = []

export function getPackDefinition(packType: string): PackDefinition {
  const def = PACK_DEFINITIONS[packType]
  if (!def) {
    throw new Error(`No pack definition found for: ${packType}`)
  }
  return def
}

export function getExpectedChecksum(formCode: string): string {
  const checksum = EXPECTED_TEMPLATE_CHECKSUMS[formCode]
  if (!checksum) {
    throw new Error(`No template checksum registered for form code: ${formCode}`)
  }
  return checksum
}

export function getMappingVersion(packType: string): string {
  return MAPPING_VERSIONS[packType] ?? ''
}
