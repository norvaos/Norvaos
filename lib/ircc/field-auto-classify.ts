// ============================================================================
// Field Auto-Classification  -  shared server-compatible module
// ============================================================================
// Extracts classification logic from client-field-config-panel.tsx into a
// reusable module for: upload pipeline, rescan, backfill, admin UI, and
// questionnaire engine fallback.
// ============================================================================

import { humanizeSegment } from '@/lib/ircc/xfa-label-utils'
import type { IrccFieldType } from '@/lib/types/ircc-forms'

// ── System / Junk Field Detection ───────────────────────────────────────────

/** Top-level XFA prefixes that are pure page layout (never contain content) */
export const JUNK_TOP_PREFIXES = ['Overflow', 'OverFlowPage', 'master', 'Barcodes']

/**
 * Page-layout prefixes (Page1, Page2, etc.) that wrap real content sections.
 * These are "transparent"  -  we look through them at the second segment.
 */
const PAGE_PREFIX_PATTERN = /^Page\d+$/

/** Second-level segments that are form metadata (under any parent) */
export const JUNK_SECOND_SEGMENTS = [
  'Header', 'ButtonsHeader', 'ButtonsFooter', 'titleSF', 'Buttons',
  'CurrentPage', 'PageCount', 'TextField', 'Button2', 'TextField1',
]

/** Label patterns for system/meta fields */
export const JUNK_LABEL_PATTERNS = /^(Text Field|Current Page|Page Count|Form Version|Reader Info|crc ?Num|btn |Barcode|Application Validated|DateLastValidated|PrevSpouseAge)$/i

/** XFA path endings for system fields (validators, buttons, flags, barcodes) */
export const JUNK_PATH_PATTERNS = /(?:ValidatedFlag|FlagMirror|btnValidate|btnClearAll|btnClear|crcNum|ReaderInfo|FormVersion|DateLastValidated|PrintButton\d*|SaveButton\d*|ResetButton\d*|FormNumber|totPage|PaperFormsBarcode\d*|ApplicationValidatedFlag|AdultFlag|PrevAge|OfficeUse|ClearBkgButton)$/i

/**
 * Determine if a field is system junk that should never appear to clients.
 *
 * Some IRCC forms (IMM1344) use Part1.SponsorDetails.Field structure,
 * while others (IMM5710E) use Page1.PersonalDetails.Field structure.
 * Page* prefixes are transparent  -  we look at the second segment.
 */
export function isSystemField(xfaPath: string, suggestedLabel: string | null): boolean {
  const parts = xfaPath.split('.')
  const topLevel = parts[0] || ''

  // Pure junk top-level containers (Overflow, master, Barcodes)
  if (JUNK_TOP_PREFIXES.includes(topLevel)) return true

  // Page* prefix is transparent  -  check second segment
  if (PAGE_PREFIX_PATTERN.test(topLevel)) {
    // Single-segment under page (e.g. Page1.CurrentPage) → meta
    if (parts.length <= 2) {
      const secondSeg = parts[1] || ''
      return JUNK_SECOND_SEGMENTS.includes(secondSeg) || secondSeg === ''
    }
    // Multi-segment: check if the second segment is a junk container
    if (JUNK_SECOND_SEGMENTS.includes(parts[1])) return true
    // Otherwise it's real content (e.g. Page1.PersonalDetails.Name.FamilyName)
  } else {
    // Non-page top-level: check second segment for metadata
    if (parts.length >= 2 && JUNK_SECOND_SEGMENTS.includes(parts[1])) return true
  }

  // Specific path endings that are system fields
  if (JUNK_PATH_PATTERNS.test(xfaPath)) return true

  // Known junk labels
  if (suggestedLabel && JUNK_LABEL_PATTERNS.test(suggestedLabel)) return true

  return false
}

// ── Section Derivation ──────────────────────────────────────────────────────

/** Map of XFA section segments to human-readable section names */
export const SECTION_NAME_MAP: Record<string, string> = {
  // IMM1344 / Sponsorship sections
  SponsorDetails: 'Sponsor Details',
  SponsorContactInfo: 'Sponsor Contact Information',
  SponsorResidency: 'Sponsor Residency History',
  SponsorEA: 'Sponsor Employment & Assets',
  CoSigner: 'Co-Signer Information',
  // Generic IRCC sections
  genDetails: 'General Details',
  PersonalDetails: 'Personal Details',
  ContactInfo: 'Contact Information',
  Residency: 'Residency History',
  EmploymentDetails: 'Employment Details',
  Education: 'Education',
  Languages: 'Languages',
  TravelDocuments: 'Travel Documents',
  TravelHistory: 'Travel History',
  Background: 'Background',
  FamilyMembers: 'Family Members',
  Dependants: 'Dependants',
  // Additional common sections
  AppDetails: 'Application Details',
  Declaration: 'Declaration',
  Consent: 'Consent',
  Consent1: 'Consent & Declaration',
  RepInfo: 'Representative Information',
  MaritalStatus: 'Marital Status',
  Passport: 'Passport & Travel Documents',
  DetailsOfVisit: 'Details of Visit',
  // IMM5710E sections
  ContactInformation: 'Contact Information',
  USCard: 'U.S. Green Card',
  natID: 'National Identity Document',
  ComingIntoCda: 'Details of Visit to Canada',
  DetailsOfWork: 'Details of Intended Work',
  Employment: 'Employment History',
  EmpRec2: 'Employment Record 2',
  EmpRec3: 'Employment Record 3',
  BackgroundInfo: 'Background Information',
  Occupation: 'Occupation / Employment History',
}

/** Human descriptions for common sections (used when auto-creating sections) */
export const SECTION_DESCRIPTION_MAP: Record<string, string> = {
  SponsorDetails: 'Personal information about the sponsor.',
  SponsorContactInfo: 'Mailing and residential address of the sponsor.',
  SponsorResidency: 'Countries where the sponsor has lived.',
  SponsorEA: 'Employment history and financial information of the sponsor.',
  CoSigner: 'Information about the co-signer, if applicable.',
  PersonalDetails: 'Basic personal information of the applicant.',
  ContactInfo: 'Phone numbers, email, and mailing address.',
  ContactInformation: 'Phone numbers, email, and mailing address.',
  Residency: 'Countries and addresses where you have lived.',
  EmploymentDetails: 'Current and past employment history.',
  Education: 'Educational background and qualifications.',
  Languages: 'Language abilities.',
  TravelDocuments: 'Passport and travel document details.',
  TravelHistory: 'Previous travel to Canada and other countries.',
  Background: 'Background declarations and questions.',
  FamilyMembers: 'Information about family members.',
  Dependants: 'Information about dependants included in the application.',
  Declaration: 'Declaration and signature.',
  Consent1: 'Your consent and declaration.',
  RepInfo: 'Information about your immigration representative, if any.',
  USCard: 'U.S. Permanent Resident Card details, if applicable.',
  natID: 'National Identity Document details.',
  ComingIntoCda: 'Details about your planned visit to Canada.',
  DetailsOfWork: 'Details about your intended work in Canada.',
  Employment: 'Current and past employment history.',
  EmpRec2: 'Additional employment record.',
  EmpRec3: 'Additional employment record.',
  BackgroundInfo: 'Background declarations and questions.',
  Occupation: 'Current and past occupation or employment history.',
  DetailsOfVisit: 'Details about your planned visit to Canada.',
}

/**
 * Section aliases  -  maps fragmented XFA section names to canonical section keys.
 * IRCC forms sometimes split a logical section across multiple XFA containers
 * (e.g. BackgroundInfo + BackgroundInfo2 + BackgroundInfo_SectionHeader all map to BackgroundInfo).
 */
const SECTION_ALIASES: Record<string, string> = {
  // Background info fragments → BackgroundInfo
  BackgroundInfo2: 'BackgroundInfo',
  BackgroundInfo3: 'BackgroundInfo',
  BackgroundInfo_SectionHeader: 'BackgroundInfo',
  // Contact fragments → ContactInformation
  Contacts_Row2: 'ContactInformation',
  // PageWrapper sub-sections → their real section
  // (handled dynamically in deriveSectionKey when parent is PageWrapper)
  // Military / GovPosition / Illtreatment → BackgroundInfo
  Military: 'BackgroundInfo',
  GovPosition: 'BackgroundInfo',
  Illtreatment: 'BackgroundInfo',
}

/**
 * Derive a section key from an XFA path.
 *
 * For Part-based paths: Part1.SponsorDetails.q1.FamilyName → "SponsorDetails"
 * For Page-based paths: Page1.PersonalDetails.Name.FamilyName → "PersonalDetails"
 *
 * Handles PageWrapper-style transparent containers by looking at the third segment.
 * Applies section aliases to merge fragments (BackgroundInfo2 → BackgroundInfo).
 *
 * Returns null for paths that can't produce a meaningful section.
 */
export function deriveSectionKey(xfaPath: string): string | null {
  const parts = xfaPath.split('.')
  if (parts.length < 2) return null

  let candidate = parts[1]

  // Skip junk second segments
  if (JUNK_SECOND_SEGMENTS.includes(candidate)) return null

  // Skip path-noise segments that aren't real sections
  if (/^(Proceed|Yes|No|Overflow|Barcodes)$/i.test(candidate)) return null

  // Skip question-number segments (q1, q2 used as second level in some forms)
  if (/^q\d+$/i.test(candidate)) return null

  // PageWrapper is a transparent layout container  -  look at the third segment
  if (candidate === 'PageWrapper' && parts.length >= 3) {
    candidate = parts[2]
  }

  // Apply section aliases to merge fragments into canonical sections
  if (SECTION_ALIASES[candidate]) {
    candidate = SECTION_ALIASES[candidate]
  }

  return candidate
}

/**
 * Get a human-readable section title from a section key.
 */
export function deriveSectionTitle(sectionKey: string): string {
  return SECTION_NAME_MAP[sectionKey] || humanizeSegment(sectionKey)
}

/**
 * Get a section description from a section key.
 */
export function deriveSectionDescription(sectionKey: string): string | undefined {
  return SECTION_DESCRIPTION_MAP[sectionKey]
}

// ── Field Type Inference ─────────────────────────────────────────────────────

/** Standard marital status options for IRCC forms */
const MARITAL_STATUS_OPTIONS = [
  { label: 'Single', value: 'Single' },
  { label: 'Married', value: 'Married' },
  { label: 'Common-law', value: 'Common-law' },
  { label: 'Divorced', value: 'Divorced' },
  { label: 'Widowed', value: 'Widowed' },
  { label: 'Separated', value: 'Separated' },
  { label: 'Annulled marriage', value: 'Annulled marriage' },
]

/** Sex/gender options */
const SEX_OPTIONS = [
  { label: 'Male', value: 'Male' },
  { label: 'Female', value: 'Female' },
  { label: 'Another gender', value: 'Another gender' },
]

/** Yes/No options used for IRCC boolean-style dropdowns */
const YES_NO_OPTIONS = [
  { label: 'Yes', value: 'Yes' },
  { label: 'No', value: 'No' },
]

interface InferredFieldMeta {
  field_type: IrccFieldType
  placeholder: string | null
  description: string | null
  options: Array<{ label: string; value: string }> | null
}

/**
 * Infer field metadata (type, placeholder, options) from the XFA path's last segment.
 */
function inferFieldMeta(xfaPath: string): InferredFieldMeta {
  const parts = xfaPath.split('.')
  const last = parts[parts.length - 1] || ''

  // Country fields → country picker
  if (/^(Country|CountryOfBirth|CountryOfIssue|CountryOfCitizenship|Citizenship|CurrentCountry|SponsorCountry|SponsorCitizenship|SpouseCountryOfBirth)$/i.test(last)) {
    return { field_type: 'country', placeholder: null, description: null, options: null }
  }

  // Email
  if (/^(Email|EmailAddress)$/i.test(last)) {
    return { field_type: 'email', placeholder: 'name@example.com', description: null, options: null }
  }

  // Phone / Fax
  if (/^(Telephone|TelephoneNum|CellphoneNum|FaxNum|SponsorTelephone|RepTelephone|RepFax)$/i.test(last)) {
    return { field_type: 'phone', placeholder: null, description: null, options: null }
  }

  // Marital status → select
  if (/^(MaritalStatus)$/i.test(last)) {
    return { field_type: 'select', placeholder: 'Select your marital status', description: null, options: MARITAL_STATUS_OPTIONS }
  }

  // Sex → select
  if (/^(Sex)$/i.test(last)) {
    return { field_type: 'select', placeholder: 'Select', description: null, options: SEX_OPTIONS }
  }

  // Boolean questions → boolean (Yes/No radio)
  if (/^(CoSignerInd|PrevRefusalQ1|PrevRefusalQ2|CriminalQ|MedicalQ|ableToCommunicate|EverRefused|PreviouslyMarried|PaidRep|CompensationReceived)$/i.test(last)) {
    return { field_type: 'boolean', placeholder: null, description: null, options: YES_NO_OPTIONS }
  }

  // Background boolean questions (may end with various names)
  if (/Background/i.test(xfaPath) && /^(tuberculosis|disorder|criminal|refused|deported|military|overstay|warcrimes)$/i.test(last)) {
    return { field_type: 'boolean', placeholder: null, description: null, options: YES_NO_OPTIONS }
  }

  // EnglishFrench ability → select
  if (/^(EnglishFrench)$/i.test(last)) {
    return {
      field_type: 'select',
      placeholder: 'Select',
      description: null,
      options: [
        { label: 'English', value: 'English' },
        { label: 'French', value: 'French' },
        { label: 'Both', value: 'Both' },
        { label: 'Neither', value: 'Neither' },
      ],
    }
  }

  // Date fields (non-split single dates)
  if (/^(DOB|DateOfBirth|IssueDate|ExpiryDate|DateSigned|DateOfMarriage|DateLastValidated)$/i.test(last)) {
    return { field_type: 'date', placeholder: null, description: null, options: null }
  }

  // Numeric fields
  if (/^(Height|NumOfYears|Income|Funds|FundsAvailable|IntendedDuration)$/i.test(last)) {
    return { field_type: 'number', placeholder: null, description: null, options: null }
  }

  // Postal code
  if (/^(PostalCode|SponsorPostalCode)$/i.test(last)) {
    return { field_type: 'text', placeholder: 'A1A 1A1', description: null, options: null }
  }

  // Address fields
  if (/^(StreetAddress|SponsorAddress|RepAddress|Address)$/i.test(last)) {
    return { field_type: 'text', placeholder: '123 Main Street', description: null, options: null }
  }

  // Eye colour → select
  if (/^(EyeColour)$/i.test(last)) {
    return {
      field_type: 'select',
      placeholder: 'Select',
      description: null,
      options: [
        { label: 'Black', value: 'Black' },
        { label: 'Blue', value: 'Blue' },
        { label: 'Brown', value: 'Brown' },
        { label: 'Green', value: 'Green' },
        { label: 'Grey', value: 'Grey' },
        { label: 'Hazel', value: 'Hazel' },
        { label: 'Other', value: 'Other' },
      ],
    }
  }

  // Education level → select
  if (/^(HighestEd)$/i.test(last)) {
    return {
      field_type: 'select',
      placeholder: 'Select your highest level of education',
      description: null,
      options: [
        { label: 'None', value: 'None' },
        { label: 'Secondary or less', value: 'Secondary or less' },
        { label: 'Trade / Apprenticeship', value: 'Trade / Apprenticeship' },
        { label: 'Non-university diploma/certificate', value: 'Non-university diploma/certificate' },
        { label: "Bachelor's degree", value: "Bachelor's degree" },
        { label: "Master's degree", value: "Master's degree" },
        { label: 'Doctorate (PhD)', value: 'Doctorate (PhD)' },
      ],
    }
  }

  // Immigration status → select
  if (/^(ResidenceStatus|ImmigrationStatus|Status)$/i.test(last)) {
    return {
      field_type: 'select',
      placeholder: 'Select your status',
      description: null,
      options: [
        { label: 'Citizen', value: 'Citizen' },
        { label: 'Permanent Resident', value: 'Permanent Resident' },
        { label: 'Visitor', value: 'Visitor' },
        { label: 'Worker', value: 'Worker' },
        { label: 'Student', value: 'Student' },
        { label: 'Refugee', value: 'Refugee' },
        { label: 'Other', value: 'Other' },
      ],
    }
  }

  // Default: text
  return { field_type: 'text', placeholder: null, description: null, options: null }
}

// ── Full Field Classification ───────────────────────────────────────────────

export interface FieldClassification {
  is_meta_field: boolean
  is_client_visible: boolean
  section_key: string | null
  section_title: string | null
  section_description: string | undefined
  /** Inferred field type */
  inferred_field_type: IrccFieldType | null
  /** Inferred placeholder text */
  inferred_placeholder: string | null
  /** Inferred help/description text */
  inferred_description: string | null
  /** Inferred options for select/boolean fields */
  inferred_options: Array<{ label: string; value: string }> | null
}

/**
 * Detect if a field is the ".No" half of a Yes/No radio pair.
 * In IRCC XFA forms, boolean questions are split into two fields:
 *   e.g. Part1.SponsorEA.q3.SpouseCLInd.Yes + Part1.SponsorEA.q3.SpouseCLInd.No
 * The ".No" variant is hidden; the ".Yes" variant becomes the boolean question.
 */
function isRadioNoSubfield(xfaPath: string): boolean {
  const parts = xfaPath.split('.')
  const last = parts[parts.length - 1] || ''
  return last === 'No' && parts.length >= 3
}

/**
 * Detect if a field is the ".Yes" half of a Yes/No radio pair.
 * Returns the parent indicator name (e.g. "CoSignerInd") or null.
 */
function getRadioYesParent(xfaPath: string): string | null {
  const parts = xfaPath.split('.')
  const last = parts[parts.length - 1] || ''
  if (last !== 'Yes' || parts.length < 3) return null
  return parts[parts.length - 2]
}

/**
 * Classify an XFA field for auto-configuration on upload.
 * Returns metadata, visibility, section assignment, and inferred field metadata.
 */
export function classifyField(
  xfaPath: string,
  suggestedLabel: string | null,
): FieldClassification {
  const isMeta = isSystemField(xfaPath, suggestedLabel)

  if (isMeta) {
    return {
      is_meta_field: true,
      is_client_visible: false,
      section_key: null,
      section_title: null,
      section_description: undefined,
      inferred_field_type: null,
      inferred_placeholder: null,
      inferred_description: null,
      inferred_options: null,
    }
  }

  // ── Radio Sub-Field Handling ─────────────────────────────────────────────
  // ".No" variant of a Yes/No radio pair → hidden (the ".Yes" variant represents the question)
  if (isRadioNoSubfield(xfaPath)) {
    const sectionKey = deriveSectionKey(xfaPath)
    return {
      is_meta_field: false,
      is_client_visible: false,
      section_key: sectionKey,
      section_title: sectionKey ? deriveSectionTitle(sectionKey) : null,
      section_description: sectionKey ? deriveSectionDescription(sectionKey) : undefined,
      inferred_field_type: null,
      inferred_placeholder: null,
      inferred_description: null,
      inferred_options: null,
    }
  }

  // ".Yes" variant of a Yes/No radio pair → boolean question
  const radioParent = getRadioYesParent(xfaPath)
  if (radioParent) {
    const sectionKey = deriveSectionKey(xfaPath)
    // Derive field type from the parent indicator name (e.g. "CoSignerInd")
    const parentPath = xfaPath.replace(/\.Yes$/, '')
    const parentMeta = inferFieldMeta(parentPath)
    // Default to boolean if parent wasn't specifically matched
    const fieldType = parentMeta.field_type === 'text' ? 'boolean' as IrccFieldType : parentMeta.field_type
    return {
      is_meta_field: false,
      is_client_visible: true,
      section_key: sectionKey,
      section_title: sectionKey ? deriveSectionTitle(sectionKey) : null,
      section_description: sectionKey ? deriveSectionDescription(sectionKey) : undefined,
      inferred_field_type: fieldType,
      inferred_placeholder: null,
      inferred_description: null,
      inferred_options: YES_NO_OPTIONS,
    }
  }

  const sectionKey = deriveSectionKey(xfaPath)
  const meta = inferFieldMeta(xfaPath)

  return {
    is_meta_field: false,
    is_client_visible: true,
    section_key: sectionKey,
    section_title: sectionKey ? deriveSectionTitle(sectionKey) : null,
    section_description: sectionKey ? deriveSectionDescription(sectionKey) : undefined,
    inferred_field_type: meta.field_type,
    inferred_placeholder: meta.placeholder,
    inferred_description: meta.description,
    inferred_options: meta.options,
  }
}
