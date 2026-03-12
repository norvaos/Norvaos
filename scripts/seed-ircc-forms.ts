/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Seed IRCC Forms — Migrate hardcoded data into DB tables
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * One-time migration script that seeds all form definitions from the hardcoded
 * form-field-registry.ts, xfa-filler.ts, and pack-constants.ts into the new
 * ircc_forms / ircc_form_sections / ircc_form_fields / ircc_form_array_maps
 * database tables created by migration 057.
 *
 * Usage:  npx tsx scripts/seed-ircc-forms.ts
 *
 * Prerequisites:
 *   1. Migration 057-ircc-form-management.sql applied
 *   2. .env.local has NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *   3. At least one tenant exists in the DB
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// ── Env Setup ────────────────────────────────────────────────────────────────

const envPath = resolve(__dirname, '../.env.local')
const envContent = readFileSync(envPath, 'utf-8')
const envVars: Record<string, string> = {}
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/)
  if (match) envVars[match[1].trim()] = match[2].trim()
}

const url = envVars['NEXT_PUBLIC_SUPABASE_URL']
const key = envVars['SUPABASE_SERVICE_ROLE_KEY']

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase: any = createClient(url, key, { auth: { persistSession: false } })

// ── Types ────────────────────────────────────────────────────────────────────

interface SeedFieldDef {
  xfa_path: string
  profile_path: string | null
  label: string
  field_type: string
  is_required: boolean
  options?: Array<{ label: string; value: string }> | null
  placeholder?: string | null
  description?: string | null
  sort_order: number
  max_length?: number | null
  date_split?: 'year' | 'month' | 'day' | null
  value_format?: Record<string, string> | null
  show_when?: {
    profile_path: string
    operator: string
    value?: string | number | boolean
  } | null
  required_condition?: {
    when_path: string
    equals: string[]
  } | null
  readiness_section?: string | null
  is_meta_field?: boolean
  meta_field_key?: string | null
  is_client_visible?: boolean
  is_client_required?: boolean
}

interface SeedSectionDef {
  section_key: string
  title: string
  description?: string | null
  sort_order: number
  merge_into?: string | null
  fields: SeedFieldDef[]
}

interface SeedFormDef {
  form_code: string
  form_name: string
  description: string
  storage_path: string
  file_name: string
  checksum_sha256: string
  xfa_root_element: string | null
  is_xfa: boolean
  scan_status: string
  mapping_version: string
  sections: SeedSectionDef[]
  array_maps: Array<{
    profile_path: string
    xfa_base_path: string
    xfa_entry_name: string
    max_entries: number
    sub_fields: Record<string, string>
  }>
}

// ═══════════════════════════════════════════════════════════════════════════════
// FORM DEFINITIONS — All hardcoded data consolidated here
// ═══════════════════════════════════════════════════════════════════════════════

// ── Helper: Marital status options (reused across forms) ────────────────────

const MARITAL_STATUS_OPTIONS = [
  { label: 'Single', value: 'single' },
  { label: 'Married', value: 'married' },
  { label: 'Common-Law', value: 'common_law' },
  { label: 'Divorced', value: 'divorced' },
  { label: 'Widowed', value: 'widowed' },
  { label: 'Separated', value: 'separated' },
  { label: 'Annulled', value: 'annulled' },
]

// ── IMM 5257E — Application for Temporary Resident Visa ─────────────────────
// Combines base IMM5257 sections + IMM5257E extended sections into one form.
// XFA maps from IMM5257E_XFA_MAP in xfa-filler.ts.

const IMM5257E_FORM: SeedFormDef = {
  form_code: 'IMM5257E',
  form_name: 'IMM 5257E — Application for Temporary Resident Visa',
  description: 'Main visitor visa application form covering personal details, passport, contact info, visit details, education, employment, and background.',
  storage_path: 'ircc-forms/IMM5257E.pdf',
  file_name: 'IMM5257E.pdf',
  checksum_sha256: '18f5185fb088fdab8be2b52ac76f0bb8500b3c0cc19e4ac2792c73e0a7ea423a',
  xfa_root_element: 'form1',
  is_xfa: true,
  scan_status: 'scanned',
  mapping_version: 'IMM5257E-map-v1.0',
  sections: [
    // ── Section 1: Visa Type ──────────────────────────────────────────
    {
      section_key: 'visa_type',
      title: 'Visa Type',
      description: 'Select the type of visa being applied for.',
      sort_order: 1,
      fields: [
        {
          xfa_path: 'Page1.PersonalDetails.VisaType.VisaType',
          profile_path: 'visit.visa_type',
          label: 'Type of Visa',
          field_type: 'select',
          is_required: true,
          options: [
            { label: 'Single Entry', value: 'single' },
            { label: 'Multiple Entry', value: 'multiple' },
          ],
          placeholder: 'Select visa type',
          sort_order: 1,
        },
      ],
    },
    // ── Section 2: Personal Details ───────────────────────────────────
    {
      section_key: 'personal_details',
      title: 'Personal Details',
      description: 'Applicant personal information as shown on passport or travel document.',
      sort_order: 2,
      fields: [
        {
          xfa_path: 'Page1.PersonalDetails.Name.FamilyName',
          profile_path: 'personal.family_name',
          label: 'Family Name(s)',
          field_type: 'text',
          is_required: true,
          placeholder: 'As shown on passport',
          sort_order: 1,
          max_length: 60,
          readiness_section: 'Personal Details (Page 1)',
        },
        {
          xfa_path: 'Page1.PersonalDetails.Name.GivenName',
          profile_path: 'personal.given_name',
          label: 'Given Name(s)',
          field_type: 'text',
          is_required: true,
          placeholder: 'As shown on passport',
          sort_order: 2,
          max_length: 60,
          readiness_section: 'Personal Details (Page 1)',
        },
        {
          xfa_path: 'Page1.PersonalDetails.AliasName.AliasNameIndicator.AliasNameIndicator',
          profile_path: 'personal.has_alias',
          label: 'Have you ever used another name (e.g. maiden name, alias)?',
          field_type: 'boolean',
          is_required: true,
          sort_order: 3,
          value_format: { boolean_true: '1', boolean_false: '2' },
        },
        {
          xfa_path: 'Page1.PersonalDetails.AliasName.AliasFamilyName',
          profile_path: 'personal.alias_family_name',
          label: 'Other Family Name',
          field_type: 'text',
          is_required: false,
          sort_order: 4,
          show_when: { profile_path: 'personal.has_alias', operator: 'is_truthy' },
        },
        {
          xfa_path: 'Page1.PersonalDetails.AliasName.AliasGivenName',
          profile_path: 'personal.alias_given_name',
          label: 'Other Given Name',
          field_type: 'text',
          is_required: false,
          sort_order: 5,
          show_when: { profile_path: 'personal.has_alias', operator: 'is_truthy' },
        },
        {
          xfa_path: 'Page1.PersonalDetails.UCIClientID',
          profile_path: 'personal.uci_number',
          label: 'UCI / Client ID (if previously assigned)',
          field_type: 'text',
          is_required: false,
          placeholder: 'e.g. 1234-5678',
          sort_order: 6,
        },
        {
          xfa_path: 'Page1.PersonalDetails.Sex.Sex',
          profile_path: 'personal.sex',
          label: 'Sex',
          field_type: 'select',
          is_required: true,
          options: [
            { label: 'Male', value: 'male' },
            { label: 'Female', value: 'female' },
            { label: 'Other', value: 'other' },
          ],
          sort_order: 7,
          readiness_section: 'Personal Details (Page 1)',
        },
        // Date of Birth — 3 XFA fields (date split)
        {
          xfa_path: 'Page1.PersonalDetails.DOBYear',
          profile_path: 'personal.date_of_birth',
          label: 'Date of Birth — Year',
          field_type: 'date',
          is_required: true,
          sort_order: 8,
          date_split: 'year',
          readiness_section: 'Personal Details (Page 1)',
        },
        {
          xfa_path: 'Page1.PersonalDetails.DOBMonth',
          profile_path: 'personal.date_of_birth',
          label: 'Date of Birth — Month',
          field_type: 'date',
          is_required: false,
          sort_order: 9,
          date_split: 'month',
        },
        {
          xfa_path: 'Page1.PersonalDetails.DOBDay',
          profile_path: 'personal.date_of_birth',
          label: 'Date of Birth — Day',
          field_type: 'date',
          is_required: false,
          sort_order: 10,
          date_split: 'day',
        },
        {
          xfa_path: 'Page1.PersonalDetails.PlaceBirthCity',
          profile_path: 'personal.place_of_birth_city',
          label: 'Place of Birth — City',
          field_type: 'text',
          is_required: true,
          sort_order: 11,
          max_length: 30,
          readiness_section: 'Personal Details (Page 1)',
        },
        {
          xfa_path: 'Page1.PersonalDetails.PlaceBirthCountry',
          profile_path: 'personal.place_of_birth_country',
          label: 'Place of Birth — Country',
          field_type: 'country',
          is_required: true,
          sort_order: 12,
          max_length: 40,
          readiness_section: 'Personal Details (Page 1)',
        },
        {
          xfa_path: 'Page1.PersonalDetails.Citizenship.Citizenship',
          profile_path: 'personal.citizenship',
          label: 'Country of Citizenship',
          field_type: 'country',
          is_required: true,
          sort_order: 13,
          max_length: 40,
          readiness_section: 'Personal Details (Page 1)',
        },
        {
          xfa_path: 'Page1.PersonalDetails.CurrentCOR.Row2.Country',
          profile_path: 'personal.current_country_of_residence',
          label: 'Current Country of Residence',
          field_type: 'country',
          is_required: true,
          sort_order: 14,
          readiness_section: 'Personal Details (Page 1)',
        },
        {
          xfa_path: 'Page1.PersonalDetails.CurrentCOR.Row2.Status',
          profile_path: 'personal.residence_status',
          label: 'Immigration Status in Current Country',
          field_type: 'text',
          is_required: false,
          placeholder: 'e.g. Citizen, Permanent Resident, Worker',
          sort_order: 15,
        },
        // COR dates
        {
          xfa_path: 'Page1.PersonalDetails.CORDates.FromYr',
          profile_path: 'personal.cor_from_date',
          label: 'Current Country of Residence — From Year',
          field_type: 'date',
          is_required: false,
          sort_order: 16,
          date_split: 'year',
        },
        {
          xfa_path: 'Page1.PersonalDetails.CORDates.FromMM',
          profile_path: 'personal.cor_from_date',
          label: 'Current Country of Residence — From Month',
          field_type: 'date',
          is_required: false,
          sort_order: 17,
          date_split: 'month',
        },
        {
          xfa_path: 'Page1.PersonalDetails.CORDates.FromDD',
          profile_path: 'personal.cor_from_date',
          label: 'Current Country of Residence — From Day',
          field_type: 'date',
          is_required: false,
          sort_order: 18,
          date_split: 'day',
        },
        {
          xfa_path: 'Page1.PersonalDetails.CORDates.ToYr',
          profile_path: 'personal.cor_to_date',
          label: 'Current Country of Residence — To Year',
          field_type: 'date',
          is_required: false,
          sort_order: 19,
          date_split: 'year',
        },
        {
          xfa_path: 'Page1.PersonalDetails.CORDates.ToMM',
          profile_path: 'personal.cor_to_date',
          label: 'Current Country of Residence — To Month',
          field_type: 'date',
          is_required: false,
          sort_order: 20,
          date_split: 'month',
        },
        {
          xfa_path: 'Page1.PersonalDetails.CORDates.ToDD',
          profile_path: 'personal.cor_to_date',
          label: 'Current Country of Residence — To Day',
          field_type: 'date',
          is_required: false,
          sort_order: 21,
          date_split: 'day',
        },
        // Same as COR / Country where applying
        {
          xfa_path: 'Page1.PersonalDetails.SameAsCORIndicator',
          profile_path: 'personal.same_as_cor',
          label: 'Country where applying same as country of residence?',
          field_type: 'boolean',
          is_required: true,
          sort_order: 22,
          value_format: { boolean_true: '1', boolean_false: '2' },
        },
        {
          xfa_path: 'Page1.PersonalDetails.CountryWhereApplying.Row2.Country',
          profile_path: 'personal.country_where_applying',
          label: 'Country Where Applying From',
          field_type: 'country',
          is_required: false,
          sort_order: 23,
          show_when: { profile_path: 'personal.same_as_cor', operator: 'is_falsy' },
        },
        {
          xfa_path: 'Page1.PersonalDetails.CountryWhereApplying.Row2.Status',
          profile_path: 'personal.cwa_status',
          label: 'Immigration Status in Country Where Applying',
          field_type: 'text',
          is_required: false,
          sort_order: 24,
          show_when: { profile_path: 'personal.same_as_cor', operator: 'is_falsy' },
        },
        // CWA dates
        {
          xfa_path: 'Page1.PersonalDetails.CWADates.FromYr',
          profile_path: 'personal.cwa_from_date',
          label: 'Country Where Applying — From Year',
          field_type: 'date',
          is_required: false,
          sort_order: 25,
          date_split: 'year',
        },
        {
          xfa_path: 'Page1.PersonalDetails.CWADates.FromMM',
          profile_path: 'personal.cwa_from_date',
          label: 'Country Where Applying — From Month',
          field_type: 'date',
          is_required: false,
          sort_order: 26,
          date_split: 'month',
        },
        {
          xfa_path: 'Page1.PersonalDetails.CWADates.FromDD',
          profile_path: 'personal.cwa_from_date',
          label: 'Country Where Applying — From Day',
          field_type: 'date',
          is_required: false,
          sort_order: 27,
          date_split: 'day',
        },
        {
          xfa_path: 'Page1.PersonalDetails.CWADates.ToYr',
          profile_path: 'personal.cwa_to_date',
          label: 'Country Where Applying — To Year',
          field_type: 'date',
          is_required: false,
          sort_order: 28,
          date_split: 'year',
        },
        {
          xfa_path: 'Page1.PersonalDetails.CWADates.ToMM',
          profile_path: 'personal.cwa_to_date',
          label: 'Country Where Applying — To Month',
          field_type: 'date',
          is_required: false,
          sort_order: 29,
          date_split: 'month',
        },
        {
          xfa_path: 'Page1.PersonalDetails.CWADates.ToDD',
          profile_path: 'personal.cwa_to_date',
          label: 'Country Where Applying — To Day',
          field_type: 'date',
          is_required: false,
          sort_order: 30,
          date_split: 'day',
        },
        {
          xfa_path: 'Page1.PersonalDetails.ServiceIn.ServiceIn',
          profile_path: 'personal.service_in',
          label: 'Preferred Language of Service',
          field_type: 'select',
          is_required: false,
          options: [
            { label: 'English', value: 'english' },
            { label: 'French', value: 'french' },
          ],
          sort_order: 31,
        },
        // Eye colour & height (questionnaire-only, no XFA path in main map)
        {
          xfa_path: '__questionnaire_only__eye_colour',
          profile_path: 'personal.eye_colour',
          label: 'Eye Colour',
          field_type: 'select',
          is_required: false,
          options: [
            { label: 'Black', value: 'black' },
            { label: 'Blue', value: 'blue' },
            { label: 'Brown', value: 'brown' },
            { label: 'Green', value: 'green' },
            { label: 'Grey', value: 'grey' },
            { label: 'Hazel', value: 'hazel' },
            { label: 'Other', value: 'other' },
          ],
          sort_order: 32,
        },
        {
          xfa_path: '__questionnaire_only__height_cm',
          profile_path: 'personal.height_cm',
          label: 'Height (cm)',
          field_type: 'number',
          is_required: false,
          placeholder: 'e.g. 170',
          sort_order: 33,
        },
        {
          xfa_path: '__questionnaire_only__second_citizenship',
          profile_path: 'personal.second_citizenship',
          label: 'Second Country of Citizenship (if applicable)',
          field_type: 'country',
          is_required: false,
          sort_order: 34,
        },
        {
          xfa_path: '__questionnaire_only__previous_countries',
          profile_path: 'personal.previous_countries',
          label: 'Previous Countries of Residence',
          field_type: 'repeater',
          is_required: false,
          description: 'List all countries where you have lived for six months or more.',
          sort_order: 35,
        },
      ],
    },
    // ── Section 3: Marital Status ─────────────────────────────────────
    {
      section_key: 'marital_status',
      title: 'Marital Status',
      description: 'Current marital or relationship status and spouse details.',
      sort_order: 3,
      fields: [
        {
          xfa_path: 'Page1.MaritalStatus.SectionA.MaritalStatus',
          profile_path: 'marital.status',
          label: 'Current Marital Status',
          field_type: 'select',
          is_required: true,
          options: MARITAL_STATUS_OPTIONS,
          sort_order: 1,
          readiness_section: 'Marital Status (Page 1)',
        },
        {
          xfa_path: 'Page1.MaritalStatus.SectionA.MarriageDate.FromYr',
          profile_path: 'marital.date_of_current_relationship',
          label: 'Marriage/Relationship Date — Year',
          field_type: 'date',
          is_required: false,
          sort_order: 2,
          date_split: 'year',
          show_when: { profile_path: 'marital.status', operator: 'equals', value: 'married' },
        },
        {
          xfa_path: 'Page1.MaritalStatus.SectionA.MarriageDate.FromMM',
          profile_path: 'marital.date_of_current_relationship',
          label: 'Marriage/Relationship Date — Month',
          field_type: 'date',
          is_required: false,
          sort_order: 3,
          date_split: 'month',
        },
        {
          xfa_path: 'Page1.MaritalStatus.SectionA.MarriageDate.FromDD',
          profile_path: 'marital.date_of_current_relationship',
          label: 'Marriage/Relationship Date — Day',
          field_type: 'date',
          is_required: false,
          sort_order: 4,
          date_split: 'day',
        },
        {
          xfa_path: 'Page1.MaritalStatus.SectionA.FamilyName',
          profile_path: 'marital.spouse_family_name',
          label: 'Spouse / Partner Family Name',
          field_type: 'text',
          is_required: false,
          sort_order: 5,
          show_when: { profile_path: 'marital.status', operator: 'equals', value: 'married' },
        },
        {
          xfa_path: 'Page1.MaritalStatus.SectionA.GivenName',
          profile_path: 'marital.spouse_given_name',
          label: 'Spouse / Partner Given Name',
          field_type: 'text',
          is_required: false,
          sort_order: 6,
          show_when: { profile_path: 'marital.status', operator: 'equals', value: 'married' },
        },
        {
          xfa_path: '__questionnaire_only__spouse_dob',
          profile_path: 'marital.spouse_date_of_birth',
          label: 'Spouse / Partner Date of Birth',
          field_type: 'date',
          is_required: false,
          sort_order: 7,
          show_when: { profile_path: 'marital.status', operator: 'equals', value: 'married' },
        },
        {
          xfa_path: '__questionnaire_only__previous_marriages',
          profile_path: 'marital.previous_marriages',
          label: 'Previous Marriages / Common-Law Relationships',
          field_type: 'repeater',
          is_required: false,
          description: 'List all previous marriages and common-law relationships.',
          sort_order: 8,
        },
      ],
    },
    // ── Section 4: Previous Marriage (IMM5257E extended) ──────────────
    {
      section_key: 'previous_marriage',
      title: 'Previous Marriage / Common-Law',
      description: 'Details of any previous marriage or common-law relationship.',
      sort_order: 4,
      fields: [
        {
          xfa_path: 'Page2.MaritalStatus.SectionA.PrevMarriedIndicator',
          profile_path: 'marital.was_previously_married',
          label: 'Were you previously married or in a common-law relationship?',
          field_type: 'boolean',
          is_required: true,
          sort_order: 1,
          value_format: { boolean_true: '1', boolean_false: '2' },
        },
        {
          xfa_path: 'Page2.MaritalStatus.SectionA.PMFamilyName',
          profile_path: 'marital.previous_spouse_family_name',
          label: 'Previous Spouse — Family Name',
          field_type: 'text',
          is_required: false,
          sort_order: 2,
          show_when: { profile_path: 'marital.was_previously_married', operator: 'is_truthy' },
        },
        {
          xfa_path: 'Page2.MaritalStatus.SectionA.GivenName.PMGivenName',
          profile_path: 'marital.previous_spouse_given_name',
          label: 'Previous Spouse — Given Name',
          field_type: 'text',
          is_required: false,
          sort_order: 3,
          show_when: { profile_path: 'marital.was_previously_married', operator: 'is_truthy' },
        },
        {
          xfa_path: 'Page2.MaritalStatus.SectionA.PrevSpouseDOB.DOBYear',
          profile_path: 'marital.previous_spouse_dob',
          label: 'Previous Spouse DOB — Year',
          field_type: 'date',
          is_required: false,
          sort_order: 4,
          date_split: 'year',
          show_when: { profile_path: 'marital.was_previously_married', operator: 'is_truthy' },
        },
        {
          xfa_path: 'Page2.MaritalStatus.SectionA.PrevSpouseDOB.DOBMonth',
          profile_path: 'marital.previous_spouse_dob',
          label: 'Previous Spouse DOB — Month',
          field_type: 'date',
          is_required: false,
          sort_order: 5,
          date_split: 'month',
        },
        {
          xfa_path: 'Page2.MaritalStatus.SectionA.PrevSpouseDOB.DOBDay',
          profile_path: 'marital.previous_spouse_dob',
          label: 'Previous Spouse DOB — Day',
          field_type: 'date',
          is_required: false,
          sort_order: 6,
          date_split: 'day',
        },
        {
          xfa_path: 'Page2.MaritalStatus.SectionA.TypeOfRelationship',
          profile_path: 'marital.previous_relationship_type',
          label: 'Type of Previous Relationship',
          field_type: 'select',
          is_required: false,
          options: [
            { label: 'Marriage', value: 'marriage' },
            { label: 'Common-Law', value: 'common_law' },
          ],
          sort_order: 7,
          show_when: { profile_path: 'marital.was_previously_married', operator: 'is_truthy' },
        },
        // Previous relationship dates
        {
          xfa_path: 'Page2.MaritalStatus.SectionA.PreviouslyMarriedDates.FromYr',
          profile_path: 'marital.previous_relationship_from_date',
          label: 'Previous Relationship — From Year',
          field_type: 'date',
          is_required: false,
          sort_order: 8,
          date_split: 'year',
          show_when: { profile_path: 'marital.was_previously_married', operator: 'is_truthy' },
        },
        {
          xfa_path: 'Page2.MaritalStatus.SectionA.PreviouslyMarriedDates.FromMM',
          profile_path: 'marital.previous_relationship_from_date',
          label: 'Previous Relationship — From Month',
          field_type: 'date',
          is_required: false,
          sort_order: 9,
          date_split: 'month',
        },
        {
          xfa_path: 'Page2.MaritalStatus.SectionA.PreviouslyMarriedDates.FromDD',
          profile_path: 'marital.previous_relationship_from_date',
          label: 'Previous Relationship — From Day',
          field_type: 'date',
          is_required: false,
          sort_order: 10,
          date_split: 'day',
        },
        {
          xfa_path: 'Page2.MaritalStatus.SectionA.PreviouslyMarriedDates.ToYr',
          profile_path: 'marital.previous_relationship_to_date',
          label: 'Previous Relationship — To Year',
          field_type: 'date',
          is_required: false,
          sort_order: 11,
          date_split: 'year',
        },
        {
          xfa_path: 'Page2.MaritalStatus.SectionA.PreviouslyMarriedDates.ToMM',
          profile_path: 'marital.previous_relationship_to_date',
          label: 'Previous Relationship — To Month',
          field_type: 'date',
          is_required: false,
          sort_order: 12,
          date_split: 'month',
        },
        {
          xfa_path: 'Page2.MaritalStatus.SectionA.PreviouslyMarriedDates.ToDD',
          profile_path: 'marital.previous_relationship_to_date',
          label: 'Previous Relationship — To Day',
          field_type: 'date',
          is_required: false,
          sort_order: 13,
          date_split: 'day',
        },
      ],
    },
    // ── Section 5: Language ───────────────────────────────────────────
    {
      section_key: 'language',
      title: 'Language',
      description: 'Native language and ability in English and French.',
      sort_order: 5,
      fields: [
        {
          xfa_path: 'Page2.MaritalStatus.SectionA.Languages.languages.nativeLang.nativeLang',
          profile_path: 'language.native_language',
          label: 'Native Language / Mother Tongue',
          field_type: 'text',
          is_required: true,
          placeholder: 'e.g. Mandarin, Spanish, Arabic',
          sort_order: 1,
        },
        {
          xfa_path: '__questionnaire_only__english_ability',
          profile_path: 'language.english_ability',
          label: 'Ability in English',
          field_type: 'select',
          is_required: true,
          options: [
            { label: 'None', value: 'none' },
            { label: 'Basic', value: 'basic' },
            { label: 'Moderate', value: 'moderate' },
            { label: 'Fluent', value: 'fluent' },
          ],
          sort_order: 2,
        },
        {
          xfa_path: '__questionnaire_only__french_ability',
          profile_path: 'language.french_ability',
          label: 'Ability in French',
          field_type: 'select',
          is_required: true,
          options: [
            { label: 'None', value: 'none' },
            { label: 'Basic', value: 'basic' },
            { label: 'Moderate', value: 'moderate' },
            { label: 'Fluent', value: 'fluent' },
          ],
          sort_order: 3,
        },
        {
          xfa_path: 'Page2.MaritalStatus.SectionA.Languages.languages.ableToCommunicate.ableToCommunicate',
          profile_path: 'language.preferred_language',
          label: 'Preferred Language of Correspondence',
          field_type: 'select',
          is_required: true,
          options: [
            { label: 'English', value: 'english' },
            { label: 'French', value: 'french' },
          ],
          sort_order: 4,
        },
        {
          xfa_path: 'Page2.MaritalStatus.SectionA.Languages.languages.lov',
          profile_path: 'language.language_of_interview',
          label: 'In which language are you most at ease for an interview?',
          field_type: 'select',
          is_required: false,
          options: [
            { label: 'English', value: 'english' },
            { label: 'French', value: 'french' },
            { label: 'Both', value: 'both' },
          ],
          sort_order: 5,
        },
      ],
    },
    // ── Section 6: Passport / Travel Document ─────────────────────────
    {
      section_key: 'passport',
      title: 'Passport / Travel Document',
      description: 'Details of the passport or travel document being used for this application.',
      sort_order: 6,
      fields: [
        {
          xfa_path: 'Page2.MaritalStatus.SectionA.Passport.PassportNum.PassportNum',
          profile_path: 'passport.number',
          label: 'Passport / Travel Document Number',
          field_type: 'text',
          is_required: true,
          sort_order: 1,
          max_length: 20,
          readiness_section: 'Passport (Page 2)',
        },
        {
          xfa_path: 'Page2.MaritalStatus.SectionA.Passport.CountryofIssue.CountryofIssue',
          profile_path: 'passport.country_of_issue',
          label: 'Country of Issue',
          field_type: 'country',
          is_required: true,
          sort_order: 2,
          readiness_section: 'Passport (Page 2)',
        },
        {
          xfa_path: 'Page2.MaritalStatus.SectionA.Passport.IssueYYYY',
          profile_path: 'passport.issue_date',
          label: 'Passport Issue Date — Year',
          field_type: 'date',
          is_required: true,
          sort_order: 3,
          date_split: 'year',
          readiness_section: 'Passport (Page 2)',
        },
        {
          xfa_path: 'Page2.MaritalStatus.SectionA.Passport.IssueMM',
          profile_path: 'passport.issue_date',
          label: 'Passport Issue Date — Month',
          field_type: 'date',
          is_required: false,
          sort_order: 4,
          date_split: 'month',
        },
        {
          xfa_path: 'Page2.MaritalStatus.SectionA.Passport.IssueDD',
          profile_path: 'passport.issue_date',
          label: 'Passport Issue Date — Day',
          field_type: 'date',
          is_required: false,
          sort_order: 5,
          date_split: 'day',
        },
        {
          xfa_path: 'Page2.MaritalStatus.SectionA.Passport.expiryYYYY',
          profile_path: 'passport.expiry_date',
          label: 'Passport Expiry Date — Year',
          field_type: 'date',
          is_required: true,
          sort_order: 6,
          date_split: 'year',
          readiness_section: 'Passport (Page 2)',
        },
        {
          xfa_path: 'Page2.MaritalStatus.SectionA.Passport.expiryMM',
          profile_path: 'passport.expiry_date',
          label: 'Passport Expiry Date — Month',
          field_type: 'date',
          is_required: false,
          sort_order: 7,
          date_split: 'month',
        },
        {
          xfa_path: 'Page2.MaritalStatus.SectionA.Passport.expiryDD',
          profile_path: 'passport.expiry_date',
          label: 'Passport Expiry Date — Day',
          field_type: 'date',
          is_required: false,
          sort_order: 8,
          date_split: 'day',
        },
      ],
    },
    // ── Section 7: Identity Documents ─────────────────────────────────
    {
      section_key: 'identity_documents',
      title: 'Identity Documents',
      description: 'National identity document and US permanent resident card information.',
      sort_order: 7,
      fields: [
        {
          xfa_path: 'Page2.natID.q1.natIDIndicator',
          profile_path: 'passport.national_id_indicator',
          label: 'Do you have a National Identity Document?',
          field_type: 'boolean',
          is_required: true,
          sort_order: 1,
          value_format: { boolean_true: '1', boolean_false: '2' },
        },
        {
          xfa_path: 'Page2.natID.natIDdocs.DocNum.DocNum',
          profile_path: 'passport.national_id_number',
          label: 'National ID — Document Number',
          field_type: 'text',
          is_required: false,
          sort_order: 2,
          show_when: { profile_path: 'passport.national_id_indicator', operator: 'is_truthy' },
        },
        {
          xfa_path: 'Page2.natID.natIDdocs.CountryofIssue.CountryofIssue',
          profile_path: 'passport.national_id_country',
          label: 'National ID — Country of Issue',
          field_type: 'country',
          is_required: false,
          sort_order: 3,
          show_when: { profile_path: 'passport.national_id_indicator', operator: 'is_truthy' },
        },
        {
          xfa_path: 'Page2.natID.natIDdocs.IssueDate.IssueDate',
          profile_path: 'passport.national_id_issue_date',
          label: 'National ID — Date of Issue',
          field_type: 'date',
          is_required: false,
          sort_order: 4,
          show_when: { profile_path: 'passport.national_id_indicator', operator: 'is_truthy' },
        },
        {
          xfa_path: 'Page2.natID.natIDdocs.ExpiryDate',
          profile_path: 'passport.national_id_expiry_date',
          label: 'National ID — Date of Expiry',
          field_type: 'date',
          is_required: false,
          sort_order: 5,
          show_when: { profile_path: 'passport.national_id_indicator', operator: 'is_truthy' },
        },
        {
          xfa_path: 'Page2.USCard.q1.usCardIndicator',
          profile_path: 'passport.us_pr_card_indicator',
          label: 'Do you have a US Permanent Resident Card (Green Card)?',
          field_type: 'boolean',
          is_required: true,
          sort_order: 6,
          value_format: { boolean_true: '1', boolean_false: '2' },
        },
        {
          xfa_path: 'Page2.USCard.usCarddocs.DocNum.DocNum',
          profile_path: 'passport.us_pr_card_number',
          label: 'US PR Card — Document Number',
          field_type: 'text',
          is_required: false,
          sort_order: 7,
          show_when: { profile_path: 'passport.us_pr_card_indicator', operator: 'is_truthy' },
        },
        {
          xfa_path: 'Page2.USCard.usCarddocs.ExpiryDate',
          profile_path: 'passport.us_pr_card_expiry_date',
          label: 'US PR Card — Date of Expiry',
          field_type: 'date',
          is_required: false,
          sort_order: 8,
          show_when: { profile_path: 'passport.us_pr_card_indicator', operator: 'is_truthy' },
        },
      ],
    },
    // ── Section 8: Contact Information ────────────────────────────────
    {
      section_key: 'contact_info',
      title: 'Contact Information',
      description: 'Current mailing address, residential address, and telephone details.',
      sort_order: 8,
      fields: [
        {
          xfa_path: 'Page2.ContactInformation.contact.AddressRow1.POBox.POBox',
          profile_path: 'contact_info.mailing_address.po_box',
          label: 'Mailing Address — P.O. Box',
          field_type: 'text',
          is_required: false,
          sort_order: 1,
        },
        {
          xfa_path: 'Page2.ContactInformation.contact.AddressRow1.Apt.AptUnit',
          profile_path: 'contact_info.mailing_address.apt_unit',
          label: 'Mailing Address — Apt / Unit',
          field_type: 'text',
          is_required: false,
          sort_order: 2,
        },
        {
          xfa_path: 'Page2.ContactInformation.contact.AddressRow1.StreetNum.StreetNum',
          profile_path: 'contact_info.mailing_address.street_number',
          label: 'Mailing Address — Street Number',
          field_type: 'text',
          is_required: true,
          sort_order: 3,
        },
        {
          xfa_path: 'Page2.ContactInformation.contact.AddressRow1.Streetname.Streetname',
          profile_path: 'contact_info.mailing_address.street_name',
          label: 'Mailing Address — Street Name',
          field_type: 'text',
          is_required: true,
          sort_order: 4,
          max_length: 60,
        },
        {
          xfa_path: 'Page2.ContactInformation.contact.AddressRow2.CityTow.CityTown',
          profile_path: 'contact_info.mailing_address.city',
          label: 'Mailing Address — City',
          field_type: 'text',
          is_required: true,
          sort_order: 5,
          max_length: 30,
        },
        {
          xfa_path: 'Page2.ContactInformation.contact.AddressRow2.Country.Country',
          profile_path: 'contact_info.mailing_address.country',
          label: 'Mailing Address — Country',
          field_type: 'country',
          is_required: true,
          sort_order: 6,
        },
        {
          xfa_path: 'Page2.ContactInformation.contact.AddressRow2.ProvinceState.ProvinceState',
          profile_path: 'contact_info.mailing_address.province_state',
          label: 'Mailing Address — Province / State',
          field_type: 'text',
          is_required: false,
          sort_order: 7,
        },
        {
          xfa_path: 'Page2.ContactInformation.contact.AddressRow2.PostalCode.PostalCode',
          profile_path: 'contact_info.mailing_address.postal_code',
          label: 'Mailing Address — Postal Code',
          field_type: 'text',
          is_required: false,
          sort_order: 8,
        },
        {
          xfa_path: 'Page2.ContactInformation.contact.AddressRow2.District',
          profile_path: 'contact_info.mailing_address.district',
          label: 'Mailing Address — District',
          field_type: 'text',
          is_required: false,
          sort_order: 9,
        },
        {
          xfa_path: 'Page2.ContactInformation.contact.SameAsMailingIndicator',
          profile_path: 'contact_info.same_as_mailing',
          label: 'Residential address same as mailing address',
          field_type: 'boolean',
          is_required: false,
          description: 'Check if your residential address is the same as your mailing address.',
          sort_order: 10,
          value_format: { boolean_true: '1', boolean_false: '2' },
        },
        // Residential address fields
        {
          xfa_path: 'Page2.ContactInformation.contact.ResidentialAddressRow1.StreetNum.StreetNum',
          profile_path: 'contact_info.residential_address.street_number',
          label: 'Residential — Street Number',
          field_type: 'text',
          is_required: false,
          sort_order: 11,
          show_when: { profile_path: 'contact_info.same_as_mailing', operator: 'is_falsy' },
        },
        {
          xfa_path: 'Page2.ContactInformation.contact.ResidentialAddressRow1.StreetName.Streetname',
          profile_path: 'contact_info.residential_address.street_name',
          label: 'Residential — Street Name',
          field_type: 'text',
          is_required: false,
          sort_order: 12,
          show_when: { profile_path: 'contact_info.same_as_mailing', operator: 'is_falsy' },
        },
        {
          xfa_path: 'Page2.ContactInformation.contact.ResidentialAddressRow1.AptUnit.AptUnit',
          profile_path: 'contact_info.residential_address.apt_unit',
          label: 'Residential — Apt/Unit',
          field_type: 'text',
          is_required: false,
          sort_order: 13,
          show_when: { profile_path: 'contact_info.same_as_mailing', operator: 'is_falsy' },
        },
        {
          xfa_path: 'Page2.ContactInformation.contact.ResidentialAddressRow1.CityTown.CityTown',
          profile_path: 'contact_info.residential_address.city',
          label: 'Residential — City / Town',
          field_type: 'text',
          is_required: false,
          sort_order: 14,
          show_when: { profile_path: 'contact_info.same_as_mailing', operator: 'is_falsy' },
        },
        {
          xfa_path: 'Page2.ContactInformation.contact.ResidentialAddressRow2.Country.Country',
          profile_path: 'contact_info.residential_address.country',
          label: 'Residential — Country',
          field_type: 'country',
          is_required: false,
          sort_order: 15,
          show_when: { profile_path: 'contact_info.same_as_mailing', operator: 'is_falsy' },
        },
        {
          xfa_path: 'Page2.ContactInformation.contact.ResidentialAddressRow2.ProvinceState.ProvinceState',
          profile_path: 'contact_info.residential_address.province_state',
          label: 'Residential — Province / State',
          field_type: 'text',
          is_required: false,
          sort_order: 16,
          show_when: { profile_path: 'contact_info.same_as_mailing', operator: 'is_falsy' },
        },
        {
          xfa_path: 'Page2.ContactInformation.contact.ResidentialAddressRow2.PostalCode.PostalCode',
          profile_path: 'contact_info.residential_address.postal_code',
          label: 'Residential — Postal Code',
          field_type: 'text',
          is_required: false,
          sort_order: 17,
          show_when: { profile_path: 'contact_info.same_as_mailing', operator: 'is_falsy' },
        },
        {
          xfa_path: 'Page2.ContactInformation.contact.ResidentialAddressRow2.District',
          profile_path: 'contact_info.residential_address.district',
          label: 'Residential — District',
          field_type: 'text',
          is_required: false,
          sort_order: 18,
          show_when: { profile_path: 'contact_info.same_as_mailing', operator: 'is_falsy' },
        },
        // Phone, Email
        {
          xfa_path: '__questionnaire_only__telephone',
          profile_path: 'contact_info.telephone',
          label: 'Telephone Number',
          field_type: 'phone',
          is_required: true,
          placeholder: '+1 (XXX) XXX-XXXX',
          sort_order: 19,
          readiness_section: 'Contact Information (Page 2)',
        },
        {
          xfa_path: '__questionnaire_only__alt_telephone',
          profile_path: 'contact_info.alt_telephone',
          label: 'Alternate Telephone Number',
          field_type: 'phone',
          is_required: false,
          sort_order: 20,
        },
        {
          xfa_path: '__questionnaire_only__fax',
          profile_path: 'contact_info.fax',
          label: 'Fax Number',
          field_type: 'phone',
          is_required: false,
          sort_order: 21,
        },
        {
          xfa_path: 'Page2.ContactInformation.contact.FaxEmail.Email',
          profile_path: 'contact_info.email',
          label: 'Email Address',
          field_type: 'email',
          is_required: true,
          placeholder: 'applicant@example.com',
          sort_order: 22,
          max_length: 80,
          readiness_section: 'Contact Information (Page 2)',
        },
      ],
    },
    // ── Section 9: Details of Visit ───────────────────────────────────
    {
      section_key: 'details_of_visit',
      title: 'Details of Visit',
      description: 'Purpose of visit to Canada, dates of travel, and funds available.',
      sort_order: 9,
      fields: [
        {
          xfa_path: 'Page3.DetailsOfVisit.PurposeRow1.PurposeOfVisit.PurposeOfVisit',
          profile_path: 'visit.purpose',
          label: 'Purpose of Visit',
          field_type: 'textarea',
          is_required: true,
          placeholder: 'Describe the main purpose of your visit to Canada.',
          sort_order: 1,
          readiness_section: 'Details of Visit (Page 3)',
        },
        {
          xfa_path: 'Page3.DetailsOfVisit.PurposeRow1.Other.Other',
          profile_path: 'visit.other_purpose',
          label: 'Other Purpose of Visit (if applicable)',
          field_type: 'textarea',
          is_required: false,
          sort_order: 2,
        },
        {
          xfa_path: 'Page3.DetailsOfVisit.PurposeRow1.HowLongStay.StayDates.FromYr',
          profile_path: 'visit.from_date',
          label: 'From Date — Year',
          field_type: 'date',
          is_required: true,
          sort_order: 3,
          date_split: 'year',
          readiness_section: 'Details of Visit (Page 3)',
        },
        {
          xfa_path: 'Page3.DetailsOfVisit.PurposeRow1.HowLongStay.StayDates.FromMM',
          profile_path: 'visit.from_date',
          label: 'From Date — Month',
          field_type: 'date',
          is_required: false,
          sort_order: 4,
          date_split: 'month',
        },
        {
          xfa_path: 'Page3.DetailsOfVisit.PurposeRow1.HowLongStay.StayDates.FromDD',
          profile_path: 'visit.from_date',
          label: 'From Date — Day',
          field_type: 'date',
          is_required: false,
          sort_order: 5,
          date_split: 'day',
        },
        {
          xfa_path: 'Page3.DetailsOfVisit.PurposeRow1.HowLongStay.StayDates.ToYr',
          profile_path: 'visit.to_date',
          label: 'To Date — Year',
          field_type: 'date',
          is_required: true,
          sort_order: 6,
          date_split: 'year',
          readiness_section: 'Details of Visit (Page 3)',
        },
        {
          xfa_path: 'Page3.DetailsOfVisit.PurposeRow1.HowLongStay.StayDates.ToMM',
          profile_path: 'visit.to_date',
          label: 'To Date — Month',
          field_type: 'date',
          is_required: false,
          sort_order: 7,
          date_split: 'month',
        },
        {
          xfa_path: 'Page3.DetailsOfVisit.PurposeRow1.HowLongStay.StayDates.ToDD',
          profile_path: 'visit.to_date',
          label: 'To Date — Day',
          field_type: 'date',
          is_required: false,
          sort_order: 8,
          date_split: 'day',
        },
        {
          xfa_path: 'Page3.DetailsOfVisit.PurposeRow1.Funds.Funds',
          profile_path: 'visit.funds_available_cad',
          label: 'Funds Available for Stay (CAD)',
          field_type: 'number',
          is_required: true,
          placeholder: 'Amount in Canadian dollars',
          sort_order: 9,
        },
        {
          xfa_path: '__questionnaire_only__contacts_in_canada',
          profile_path: 'visit.contacts_in_canada',
          label: 'Contacts in Canada',
          field_type: 'repeater',
          is_required: false,
          description: 'List any relatives, friends, or contacts in Canada.',
          sort_order: 10,
        },
      ],
    },
    // ── Section 10: Education ─────────────────────────────────────────
    {
      section_key: 'education',
      title: 'Education',
      description: 'Post-secondary education history.',
      sort_order: 10,
      fields: [
        {
          xfa_path: '__questionnaire_only__has_post_secondary',
          profile_path: 'education.has_post_secondary',
          label: 'Have you completed any post-secondary education?',
          field_type: 'boolean',
          is_required: true,
          sort_order: 1,
        },
        {
          xfa_path: '__questionnaire_only__highest_level',
          profile_path: 'education.highest_level',
          label: 'Highest Level of Education',
          field_type: 'select',
          is_required: true,
          options: [
            { label: 'No formal education', value: 'none' },
            { label: 'Primary school', value: 'primary' },
            { label: 'Secondary school', value: 'secondary' },
            { label: 'Trade / Apprenticeship', value: 'trade' },
            { label: 'Non-university diploma / Certificate', value: 'non_university_diploma' },
            { label: "Bachelor's degree", value: 'bachelors' },
            { label: "Master's degree", value: 'masters' },
            { label: 'Doctorate / PhD', value: 'doctorate' },
          ],
          sort_order: 2,
        },
        {
          xfa_path: '__questionnaire_only__total_years',
          profile_path: 'education.total_years',
          label: 'Total Years of Education',
          field_type: 'number',
          is_required: false,
          placeholder: 'e.g. 16',
          sort_order: 3,
        },
        {
          xfa_path: '__questionnaire_only__education_history',
          profile_path: 'education.history',
          label: 'Post-Secondary Education History',
          field_type: 'repeater',
          is_required: false,
          description: 'List all post-secondary institutions attended.',
          sort_order: 4,
          show_when: { profile_path: 'education.has_post_secondary', operator: 'is_truthy' },
        },
      ],
    },
    // ── Section 11: Employment History ────────────────────────────────
    {
      section_key: 'employment',
      title: 'Employment History',
      description: 'Current occupation and employment history for the past 10 years.',
      sort_order: 11,
      fields: [
        {
          xfa_path: '__questionnaire_only__current_occupation',
          profile_path: 'employment.current_occupation',
          label: 'Current Occupation',
          field_type: 'text',
          is_required: true,
          placeholder: 'e.g. Software Engineer, Student, Retired',
          sort_order: 1,
        },
        {
          xfa_path: '__questionnaire_only__employment_history',
          profile_path: 'employment.history',
          label: 'Employment History (Past 10 Years)',
          field_type: 'repeater',
          is_required: true,
          description: 'List all employment, self-employment, unemployment, and periods of study for the past 10 years.',
          sort_order: 2,
        },
      ],
    },
    // ── Section 12: Background Information ────────────────────────────
    {
      section_key: 'background',
      title: 'Background Information',
      description: 'Answer the following background questions truthfully.',
      sort_order: 12,
      fields: [
        {
          xfa_path: 'Page3.BackgroundInfo.Choice',
          profile_path: 'background.tuberculosis_contact',
          label: 'Close contact with a person who has tuberculosis in the past two years?',
          field_type: 'boolean',
          is_required: true,
          sort_order: 1,
          value_format: { boolean_true: '1', boolean_false: '2' },
        },
        {
          xfa_path: 'Page3.BackgroundInfo.Details.MedicalDetails',
          profile_path: 'background.physical_mental_disorder_details',
          label: 'Medical Condition — Details',
          field_type: 'textarea',
          is_required: false,
          sort_order: 2,
          show_when: { profile_path: 'background.tuberculosis_contact', operator: 'is_truthy' },
        },
        {
          xfa_path: 'Page3.BackgroundInfo2.VisaChoice1',
          profile_path: 'background.overstayed_visa',
          label: 'Ever overstayed a visa or been an illegal resident?',
          field_type: 'boolean',
          is_required: true,
          sort_order: 3,
          value_format: { boolean_true: '1', boolean_false: '2' },
        },
        {
          xfa_path: 'Page3.BackgroundInfo2.VisaChoice2',
          profile_path: 'background.refused_visa',
          label: 'Ever been refused a visa, denied entry, or ordered to leave?',
          field_type: 'boolean',
          is_required: true,
          sort_order: 4,
          value_format: { boolean_true: '1', boolean_false: '2' },
        },
        {
          xfa_path: 'Page3.BackgroundInfo2.Details.VisaChoice3',
          profile_path: 'background.criminal_record',
          label: 'Ever committed, arrested, charged, or convicted of any criminal offence?',
          field_type: 'boolean',
          is_required: true,
          sort_order: 5,
          value_format: { boolean_true: '1', boolean_false: '2' },
        },
        {
          xfa_path: 'Page3.BackgroundInfo2.Details.refusedDetails',
          profile_path: 'background.refused_visa_details',
          label: 'Visa/Criminal Record — Details',
          field_type: 'textarea',
          is_required: false,
          sort_order: 6,
        },
        {
          xfa_path: 'Page3.PageWrapper.BackgroundInfo3.Choice',
          profile_path: 'background.deported',
          label: 'Ever been deported or removed from any country?',
          field_type: 'boolean',
          is_required: true,
          sort_order: 7,
          value_format: { boolean_true: '1', boolean_false: '2' },
        },
        {
          xfa_path: 'Page3.PageWrapper.BackgroundInfo3.details',
          profile_path: 'background.deported_details',
          label: 'Deportation — Details',
          field_type: 'textarea',
          is_required: false,
          sort_order: 8,
          show_when: { profile_path: 'background.deported', operator: 'is_truthy' },
        },
        {
          xfa_path: 'Page3.PageWrapper.GovPosition.Choice',
          profile_path: 'background.government_position',
          label: 'Are you, or have you ever been, a government official?',
          field_type: 'boolean',
          is_required: true,
          sort_order: 9,
          value_format: { boolean_true: '1', boolean_false: '2' },
        },
        {
          xfa_path: 'Page3.PageWrapper.Military.Choice',
          profile_path: 'background.military_service',
          label: 'Ever served in the military, militia, or civil defence?',
          field_type: 'boolean',
          is_required: true,
          sort_order: 10,
          value_format: { boolean_true: '1', boolean_false: '2' },
        },
        {
          xfa_path: 'Page3.PageWrapper.Military.militaryServiceDetails',
          profile_path: 'background.military_service_details',
          label: 'Military Service — Details',
          field_type: 'textarea',
          is_required: false,
          sort_order: 11,
          show_when: { profile_path: 'background.military_service', operator: 'is_truthy' },
        },
        {
          xfa_path: 'Page3.PageWrapper.Occupation.Choice',
          profile_path: 'background.organization_involvement',
          label: 'Associated with a political party or group that used violence?',
          field_type: 'boolean',
          is_required: true,
          sort_order: 12,
          value_format: { boolean_true: '1', boolean_false: '2' },
        },
      ],
    },
    // ── Section 13: Signature (meta fields) ───────────────────────────
    {
      section_key: 'signature',
      title: 'Signature',
      description: 'Digital signature and date fields.',
      sort_order: 13,
      fields: [
        {
          xfa_path: 'Page3.Consent1.Signature.TextField2',
          profile_path: null,
          label: 'Signature',
          field_type: 'text',
          is_required: false,
          sort_order: 1,
          is_meta_field: true,
          meta_field_key: '__signature',
        },
        {
          xfa_path: 'Page3.Consent1.Signature.C1CertificateIssueDate',
          profile_path: null,
          label: 'Signed Date',
          field_type: 'date',
          is_required: false,
          sort_order: 2,
          is_meta_field: true,
          meta_field_key: '__signed_date',
        },
      ],
    },
  ],
  array_maps: [], // IMM5257E has inline array handling (PCR, contacts, education, employment) via code
}

// ── IMM 5406 — Additional Family Information ─────────────────────────────────

const IMM5406_FORM: SeedFormDef = {
  form_code: 'IMM5406',
  form_name: 'IMM 5406 — Additional Family Information',
  description: 'Family information form covering applicant, spouse, parents, children, and siblings.',
  storage_path: 'ircc-forms/IMM5406.pdf',
  file_name: 'IMM5406.pdf',
  checksum_sha256: '94fbb23db198a1382c3b2fd6aefb147b2bea4d309c9d80e5e4b2a66c812a824e',
  xfa_root_element: 'IMM_5406',
  is_xfa: true,
  scan_status: 'scanned',
  mapping_version: 'IMM5406-map-v1.0',
  sections: [
    // ── Section A: Applicant ──────────────────────────────────────────
    {
      section_key: 'applicant',
      title: 'Applicant Details',
      description: 'Applicant identification information.',
      sort_order: 1,
      merge_into: 'personal_details', // Merges with IMM5257E personal_details
      fields: [
        { xfa_path: 'SectionA.SectionAinfo.Applicant.PaddedEntry.PersonalData[0].Row.FamilyName', profile_path: 'personal.family_name', label: 'Family Name(s)', field_type: 'text', is_required: true, sort_order: 1, max_length: 60, readiness_section: 'Applicant (Section A)' },
        { xfa_path: 'SectionA.SectionAinfo.Applicant.PaddedEntry.PersonalData[0].Row.GivenNames', profile_path: 'personal.given_name', label: 'Given Name(s)', field_type: 'text', is_required: true, sort_order: 2, max_length: 60, readiness_section: 'Applicant (Section A)' },
        { xfa_path: 'SectionA.SectionAinfo.Applicant.PaddedEntry.PersonalData[0].Row.DOB', profile_path: 'personal.date_of_birth', label: 'Date of Birth', field_type: 'date', is_required: true, sort_order: 3, readiness_section: 'Applicant (Section A)' },
        { xfa_path: 'SectionA.SectionAinfo.Applicant.PaddedEntry.PersonalData[1].Row.COB', profile_path: 'personal.place_of_birth_country', label: 'Country of Birth', field_type: 'country', is_required: true, sort_order: 4, max_length: 40, readiness_section: 'Applicant (Section A)' },
        { xfa_path: 'SectionA.SectionAinfo.Applicant.PaddedEntry.PersonalData[1].Row.Address', profile_path: 'contact_info.mailing_address', label: 'Address', field_type: 'text', is_required: false, sort_order: 5, max_length: 120 },
        { xfa_path: 'SectionA.SectionAinfo.Applicant.PaddedEntry.PersonalData[1].Row.MaritalStatus', profile_path: 'marital.status', label: 'Marital Status', field_type: 'select', is_required: true, sort_order: 6, options: MARITAL_STATUS_OPTIONS, max_length: 30, readiness_section: 'Applicant (Section A)' },
        { xfa_path: 'SectionA.SectionAinfo.Applicant.PaddedEntry.PersonalData[1].Row.Email', profile_path: 'contact_info.email', label: 'Email', field_type: 'email', is_required: false, sort_order: 7, max_length: 80 },
      ],
    },
    // ── Section A: Spouse ─────────────────────────────────────────────
    {
      section_key: 'spouse',
      title: 'Spouse / Common-Law Partner',
      description: 'Details of your current spouse or common-law partner.',
      sort_order: 2,
      merge_into: 'marital_status', // Merges with IMM5257E marital_status
      fields: [
        { xfa_path: 'SectionA.SectionAinfo.Spouse.PaddedEntry.PersonalData[0].Row.FamilyName', profile_path: 'marital.spouse_family_name', label: 'Spouse — Family Name', field_type: 'text', is_required: false, sort_order: 1, max_length: 60, readiness_section: 'Spouse (Section A)', required_condition: { when_path: 'marital.status', equals: ['married', 'common_law'] } },
        { xfa_path: 'SectionA.SectionAinfo.Spouse.PaddedEntry.PersonalData[0].Row.GivenNames', profile_path: 'marital.spouse_given_name', label: 'Spouse — Given Name', field_type: 'text', is_required: false, sort_order: 2, max_length: 60, readiness_section: 'Spouse (Section A)', required_condition: { when_path: 'marital.status', equals: ['married', 'common_law'] } },
        { xfa_path: 'SectionA.SectionAinfo.Spouse.PaddedEntry.PersonalData[0].Row.DOB', profile_path: 'marital.spouse_date_of_birth', label: 'Spouse — Date of Birth', field_type: 'date', is_required: false, sort_order: 3, readiness_section: 'Spouse (Section A)', required_condition: { when_path: 'marital.status', equals: ['married', 'common_law'] } },
      ],
    },
    // ── Section A: Mother ─────────────────────────────────────────────
    {
      section_key: 'mother',
      title: 'Mother',
      description: 'Details of your mother.',
      sort_order: 3,
      fields: [
        { xfa_path: 'SectionA.SectionAinfo.Parent1.PaddedEntry.PersonalData[0].Row.FamilyName', profile_path: 'family.mother.family_name', label: 'Mother — Family Name', field_type: 'text', is_required: true, sort_order: 1, max_length: 60, readiness_section: 'Mother (Section A)' },
        { xfa_path: 'SectionA.SectionAinfo.Parent1.PaddedEntry.PersonalData[0].Row.GivenNames', profile_path: 'family.mother.given_name', label: 'Mother — Given Name', field_type: 'text', is_required: true, sort_order: 2, max_length: 60, readiness_section: 'Mother (Section A)' },
        { xfa_path: 'SectionA.SectionAinfo.Parent1.PaddedEntry.PersonalData[0].Row.DOB', profile_path: 'family.mother.date_of_birth', label: 'Mother — Date of Birth', field_type: 'date', is_required: true, sort_order: 3, readiness_section: 'Mother (Section A)' },
        { xfa_path: 'SectionA.SectionAinfo.Parent1.PaddedEntry.PersonalData[1].Row.COB', profile_path: 'family.mother.country_of_birth', label: 'Mother — Country of Birth', field_type: 'country', is_required: false, sort_order: 4, max_length: 40 },
        { xfa_path: 'SectionA.SectionAinfo.Parent1.PaddedEntry.PersonalData[1].Row.Address', profile_path: 'family.mother.address', label: 'Mother — Address', field_type: 'text', is_required: false, sort_order: 5, max_length: 120 },
        { xfa_path: 'SectionA.SectionAinfo.Parent1.PaddedEntry.PersonalData[1].Row.MaritalStatus', profile_path: 'family.mother.marital_status', label: 'Mother — Marital Status', field_type: 'select', is_required: false, sort_order: 6, options: MARITAL_STATUS_OPTIONS, max_length: 30 },
      ],
    },
    // ── Section A: Father ─────────────────────────────────────────────
    {
      section_key: 'father',
      title: 'Father',
      description: 'Details of your father.',
      sort_order: 4,
      fields: [
        { xfa_path: 'SectionA.SectionAinfo.Parent2.PaddedEntry.PersonalData[0].Row.FamilyName', profile_path: 'family.father.family_name', label: 'Father — Family Name', field_type: 'text', is_required: true, sort_order: 1, max_length: 60, readiness_section: 'Father (Section A)' },
        { xfa_path: 'SectionA.SectionAinfo.Parent2.PaddedEntry.PersonalData[0].Row.GivenNames', profile_path: 'family.father.given_name', label: 'Father — Given Name', field_type: 'text', is_required: true, sort_order: 2, max_length: 60, readiness_section: 'Father (Section A)' },
        { xfa_path: 'SectionA.SectionAinfo.Parent2.PaddedEntry.PersonalData[0].Row.DOB', profile_path: 'family.father.date_of_birth', label: 'Father — Date of Birth', field_type: 'date', is_required: true, sort_order: 3, readiness_section: 'Father (Section A)' },
        { xfa_path: 'SectionA.SectionAinfo.Parent2.PaddedEntry.PersonalData[1].Row.COB', profile_path: 'family.father.country_of_birth', label: 'Father — Country of Birth', field_type: 'country', is_required: false, sort_order: 4, max_length: 40 },
        { xfa_path: 'SectionA.SectionAinfo.Parent2.PaddedEntry.PersonalData[1].Row.Address', profile_path: 'family.father.address', label: 'Father — Address', field_type: 'text', is_required: false, sort_order: 5, max_length: 120 },
        { xfa_path: 'SectionA.SectionAinfo.Parent2.PaddedEntry.PersonalData[1].Row.MaritalStatus', profile_path: 'family.father.marital_status', label: 'Father — Marital Status', field_type: 'select', is_required: false, sort_order: 6, options: MARITAL_STATUS_OPTIONS, max_length: 30 },
      ],
    },
    // ── Section B: Children ───────────────────────────────────────────
    {
      section_key: 'children',
      title: 'Children',
      description: 'List all children, including adopted and from previous relationships.',
      sort_order: 5,
      fields: [
        { xfa_path: '__questionnaire_only__children_repeater', profile_path: 'family.children', label: 'Children', field_type: 'repeater', is_required: false, sort_order: 1, description: 'Enter details for each child.' },
      ],
    },
    // ── Section C: Siblings ───────────────────────────────────────────
    {
      section_key: 'siblings',
      title: 'Siblings',
      description: 'List all brothers and sisters, including half-siblings.',
      sort_order: 6,
      fields: [
        { xfa_path: '__questionnaire_only__siblings_repeater', profile_path: 'family.siblings', label: 'Siblings', field_type: 'repeater', is_required: false, sort_order: 1, description: 'Enter details for each sibling.' },
      ],
    },
    // ── Section D: Signature ──────────────────────────────────────────
    {
      section_key: 'signature',
      title: 'Signature',
      sort_order: 7,
      fields: [
        { xfa_path: 'SectionD.Signature.Signature', profile_path: null, label: 'Signature', field_type: 'text', is_required: false, sort_order: 1, is_meta_field: true, meta_field_key: '__signature' },
        { xfa_path: 'SectionD.Signature.SignedDate', profile_path: null, label: 'Signed Date', field_type: 'date', is_required: false, sort_order: 2, is_meta_field: true, meta_field_key: '__signed_date' },
      ],
    },
  ],
  array_maps: [
    {
      profile_path: 'family.children',
      xfa_base_path: 'SectionB.SectionBinfo',
      xfa_entry_name: 'Child',
      max_entries: 6,
      sub_fields: {
        family_name: 'PaddedEntry.PersonalData[0].Row.FamilyName',
        given_name: 'PaddedEntry.PersonalData[0].Row.GivenNames',
        date_of_birth: 'PaddedEntry.PersonalData[0].Row.DOB',
        relationship: 'PaddedEntry.PersonalData[0].Row.Relationship',
        country_of_birth: 'PaddedEntry.PersonalData[1].Row.COB',
        address: 'PaddedEntry.PersonalData[1].Row.Address',
        marital_status: 'PaddedEntry.PersonalData[1].Row.MaritalStatus',
      },
    },
    {
      profile_path: 'family.siblings',
      xfa_base_path: 'SectionC.SectionCinfo',
      xfa_entry_name: 'Sibling',
      max_entries: 6,
      sub_fields: {
        family_name: 'PaddedEntry.PersonalData[0].Row.FamilyName',
        given_name: 'PaddedEntry.PersonalData[0].Row.GivenNames',
        date_of_birth: 'PaddedEntry.PersonalData[0].Row.DOB',
        relationship: 'PaddedEntry.PersonalData[0].Row.Relationship',
        country_of_birth: 'PaddedEntry.PersonalData[1].Row.COB',
        address: 'PaddedEntry.PersonalData[1].Row.Address',
        marital_status: 'PaddedEntry.PersonalData[1].Row.MaritalStatus',
      },
    },
  ],
}

// ── IMM 5476E — Use of a Representative ──────────────────────────────────────

const IMM5476E_FORM: SeedFormDef = {
  form_code: 'IMM5476E',
  form_name: 'IMM 5476E — Use of a Representative',
  description: 'Authorization form for a representative to act on behalf of the applicant.',
  storage_path: 'ircc-forms/IMM5476E.pdf',
  file_name: 'IMM5476E.pdf',
  checksum_sha256: 'aca5c476b93d1c496b1afbc2cfe843499e852e31dcf0c192153bd01f8d6c56c4',
  xfa_root_element: 'IMM_5476',
  is_xfa: true,
  scan_status: 'scanned',
  mapping_version: 'IMM5476E-map-v1.0',
  sections: [
    {
      section_key: 'applicant',
      title: 'Applicant Information',
      description: 'Applicant identification for the representative form.',
      sort_order: 1,
      fields: [
        { xfa_path: 'Page1.SectionA.familyName', profile_path: 'personal.family_name', label: 'Family Name', field_type: 'text', is_required: true, sort_order: 1, max_length: 60 },
        { xfa_path: 'Page1.SectionA.givenName', profile_path: 'personal.given_name', label: 'Given Name(s)', field_type: 'text', is_required: true, sort_order: 2, max_length: 60 },
        { xfa_path: 'Page1.SectionA.DOB', profile_path: 'personal.date_of_birth', label: 'Date of Birth', field_type: 'date', is_required: true, sort_order: 3 },
        { xfa_path: 'Page1.SectionA.office[0]', profile_path: 'contact_info.email', label: 'Email Address', field_type: 'email', is_required: false, sort_order: 4, max_length: 80 },
        { xfa_path: 'Page1.SectionA.office[1]', profile_path: 'contact_info.telephone', label: 'Telephone', field_type: 'phone', is_required: false, sort_order: 5, max_length: 30 },
      ],
    },
    {
      section_key: 'representative',
      title: 'Representative Information',
      description: 'Representative identification and signature.',
      sort_order: 2,
      fields: [
        { xfa_path: 'Page1.SectionB.familyName', profile_path: null, label: 'Representative — Family Name', field_type: 'text', is_required: false, sort_order: 1, is_meta_field: true, meta_field_key: '__rep_family_name' },
        { xfa_path: 'Page1.SectionB.givenName', profile_path: null, label: 'Representative — Given Name', field_type: 'text', is_required: false, sort_order: 2, is_meta_field: true, meta_field_key: '__rep_given_name' },
        { xfa_path: 'Page1.SectionB.question8.signatrureApplicant[0]', profile_path: null, label: 'Representative — Signature', field_type: 'text', is_required: false, sort_order: 3, is_meta_field: true, meta_field_key: '__rep_signature' },
        { xfa_path: 'Page1.SectionB.question8.dateSigned[0]', profile_path: null, label: 'Representative — Signed Date', field_type: 'date', is_required: false, sort_order: 4, is_meta_field: true, meta_field_key: '__rep_signed_date' },
        { xfa_path: 'Page1.sectionD.familyName', profile_path: null, label: 'New Rep — Family Name', field_type: 'text', is_required: false, sort_order: 5, is_meta_field: true, meta_field_key: '__rep_d_family_name' },
        { xfa_path: 'Page1.sectionD.givenName', profile_path: null, label: 'New Rep — Given Name', field_type: 'text', is_required: false, sort_order: 6, is_meta_field: true, meta_field_key: '__rep_d_given_name' },
        { xfa_path: 'Page1.sectionD.signatrureApplicant', profile_path: null, label: 'New Rep — Signature', field_type: 'text', is_required: false, sort_order: 7, is_meta_field: true, meta_field_key: '__rep_d_signature' },
        { xfa_path: 'Page1.sectionD.dateApplicantSigned', profile_path: null, label: 'New Rep — Signed Date', field_type: 'date', is_required: false, sort_order: 8, is_meta_field: true, meta_field_key: '__rep_d_signed_date' },
      ],
    },
  ],
  array_maps: [],
}

// ── All form definitions ─────────────────────────────────────────────────────

const ALL_FORMS: SeedFormDef[] = [
  IMM5257E_FORM,
  IMM5406_FORM,
  IMM5476E_FORM,
]

// ═══════════════════════════════════════════════════════════════════════════════
// SEEDER — Insert all data into DB
// ═══════════════════════════════════════════════════════════════════════════════

async function seedForms() {
  console.log('🌱 IRCC Form Seeder — Starting...\n')

  // 1. Get tenant ID — accepts TENANT_ID env var, otherwise uses first tenant
  const forceTenantId = process.env.TENANT_ID
  const { data: tenants, error: tenantError } = await supabase
    .from('tenants')
    .select('id, name')
    .order('created_at')

  if (tenantError || !tenants?.length) {
    console.error('❌ No tenants found. Create a tenant first.')
    process.exit(1)
  }

  const targetTenant = forceTenantId
    ? tenants.find((t: { id: string; name: string }) => t.id === forceTenantId)
    : tenants[0]

  if (!targetTenant) {
    console.error(`❌ Tenant ${forceTenantId} not found.`)
    process.exit(1)
  }

  const tenantId = targetTenant.id
  console.log(`📌 Using tenant: ${targetTenant.name} (${tenantId})\n`)

  // 2. Check for existing forms (avoid duplicates)
  const { data: existingForms } = await supabase
    .from('ircc_forms')
    .select('form_code')
    .eq('tenant_id', tenantId)

  const existingCodes = new Set((existingForms ?? []).map((f: { form_code: string }) => f.form_code))

  let formsCreated = 0
  let sectionsCreated = 0
  let fieldsCreated = 0
  let arrayMapsCreated = 0

  for (const formDef of ALL_FORMS) {
    if (existingCodes.has(formDef.form_code)) {
      console.log(`⏭️  Skipping ${formDef.form_code} — already exists`)
      continue
    }

    console.log(`\n📋 Creating form: ${formDef.form_code}`)

    // ── Insert form ──────────────────────────────────────────────────
    const { data: form, error: formError } = await supabase
      .from('ircc_forms')
      .insert({
        tenant_id: tenantId,
        form_code: formDef.form_code,
        form_name: formDef.form_name,
        description: formDef.description,
        storage_path: formDef.storage_path,
        file_name: formDef.file_name,
        checksum_sha256: formDef.checksum_sha256,
        xfa_root_element: formDef.xfa_root_element,
        is_xfa: formDef.is_xfa,
        scan_status: formDef.scan_status,
        mapping_version: formDef.mapping_version,
      })
      .select('id')
      .single()

    if (formError) {
      console.error(`  ❌ Failed to create form ${formDef.form_code}:`, formError.message)
      continue
    }

    const formId = form.id
    formsCreated++
    console.log(`  ✅ Form created: ${formId}`)

    // ── Insert sections ──────────────────────────────────────────────
    const sectionIdMap = new Map<string, string>()

    for (const sectionDef of formDef.sections) {
      const { data: section, error: sectionError } = await supabase
        .from('ircc_form_sections')
        .insert({
          tenant_id: tenantId,
          form_id: formId,
          section_key: sectionDef.section_key,
          title: sectionDef.title,
          description: sectionDef.description ?? null,
          sort_order: sectionDef.sort_order,
          merge_into: sectionDef.merge_into ?? null,
        })
        .select('id')
        .single()

      if (sectionError) {
        console.error(`  ❌ Failed to create section ${sectionDef.section_key}:`, sectionError.message)
        continue
      }

      sectionIdMap.set(sectionDef.section_key, section.id)
      sectionsCreated++

      // ── Insert fields ────────────────────────────────────────────
      for (const fieldDef of sectionDef.fields) {
        const { error: fieldError } = await supabase
          .from('ircc_form_fields')
          .insert({
            tenant_id: tenantId,
            form_id: formId,
            xfa_path: fieldDef.xfa_path,
            xfa_field_type: fieldDef.field_type === 'select' ? 'choice' : fieldDef.field_type === 'boolean' ? 'checkbox' : 'text',
            suggested_label: fieldDef.label,
            profile_path: fieldDef.profile_path,
            label: fieldDef.label,
            field_type: fieldDef.field_type,
            options: fieldDef.options ?? null,
            is_required: fieldDef.is_required,
            placeholder: fieldDef.placeholder ?? null,
            description: fieldDef.description ?? null,
            section_id: section.id,
            sort_order: fieldDef.sort_order,
            max_length: fieldDef.max_length ?? null,
            date_split: fieldDef.date_split ?? null,
            value_format: fieldDef.value_format ?? null,
            show_when: fieldDef.show_when ?? null,
            required_condition: fieldDef.required_condition ?? null,
            readiness_section: fieldDef.readiness_section ?? null,
            is_mapped: fieldDef.profile_path !== null || fieldDef.is_meta_field === true,
            is_meta_field: fieldDef.is_meta_field ?? false,
            meta_field_key: fieldDef.meta_field_key ?? null,
            is_client_visible: fieldDef.is_client_visible ?? !(fieldDef.is_meta_field ?? false),
            is_client_required: fieldDef.is_client_required ?? fieldDef.is_required,
          })

        if (fieldError) {
          console.error(`  ❌ Failed to create field ${fieldDef.xfa_path}:`, fieldError.message)
        } else {
          fieldsCreated++
        }
      }
    }

    console.log(`  📊 Sections: ${formDef.sections.length}, Fields: ${formDef.sections.reduce((n, s) => n + s.fields.length, 0)}`)

    // ── Insert array maps ────────────────────────────────────────────
    for (const arrayMap of formDef.array_maps) {
      const { error: arrayError } = await supabase
        .from('ircc_form_array_maps')
        .insert({
          tenant_id: tenantId,
          form_id: formId,
          profile_path: arrayMap.profile_path,
          xfa_base_path: arrayMap.xfa_base_path,
          xfa_entry_name: arrayMap.xfa_entry_name,
          max_entries: arrayMap.max_entries,
          sub_fields: arrayMap.sub_fields,
        })

      if (arrayError) {
        console.error(`  ❌ Failed to create array map ${arrayMap.profile_path}:`, arrayError.message)
      } else {
        arrayMapsCreated++
      }
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60))
  console.log('🌱 Seed Complete!')
  console.log(`   Forms created:      ${formsCreated}`)
  console.log(`   Sections created:   ${sectionsCreated}`)
  console.log(`   Fields created:     ${fieldsCreated}`)
  console.log(`   Array maps created: ${arrayMapsCreated}`)
  console.log('═'.repeat(60))
}

// ── Run ──────────────────────────────────────────────────────────────────────

seedForms().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
