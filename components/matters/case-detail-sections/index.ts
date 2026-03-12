/**
 * Section Registry — Maps section_key to React component definitions
 *
 * Each entry defines:
 *   - key: matches the section_key in matter_type_section_config
 *   - label: default display label
 *   - source: where the section data comes from
 *
 * The actual rendering is done by the UnifiedCaseDetailsTab, which uses
 * the section key to decide which existing component to render.
 */

export const SECTION_DEFINITIONS = [
  { key: 'processing_info', label: 'Processing Information', source: 'Core Data' },
  { key: 'people_dependents', label: 'People & Dependents', source: 'Core Data' },
  { key: 'risk_assessment', label: 'Risk Assessment', source: 'Core Data' },
  { key: 'visa_details', label: 'Visa & Immigration Status', source: 'Immigration' },
  { key: 'application_dates', label: 'Application Dates', source: 'Immigration' },
  { key: 'language_education', label: 'Language & Education', source: 'Immigration' },
  { key: 'employment_work', label: 'Employment & Work', source: 'Immigration' },
  { key: 'family_sponsorship', label: 'Family & Sponsorship', source: 'Immigration' },
  { key: 'case_insights', label: 'Case Insights & Readiness', source: 'Immigration' },
  { key: 'document_checklist', label: 'Document Status', source: 'Immigration' },
  { key: 'ircc_questionnaire', label: 'IRCC Application Questionnaire', source: 'IRCC Intake' },
  { key: 'ircc_forms_generation', label: 'IRCC Form Generation & Download', source: 'IRCC Forms' },
] as const

export type SectionKey = (typeof SECTION_DEFINITIONS)[number]['key']

export function getSectionLabel(key: string): string {
  const def = SECTION_DEFINITIONS.find((s) => s.key === key)
  return def?.label ?? key
}
