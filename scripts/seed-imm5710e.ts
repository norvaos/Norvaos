/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Seed IMM5710E Field Mappings
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * IMM5710E  -  Application to Change Conditions, Extend My Stay or Remain in
 * Canada as a Worker
 *
 * This script maps all 279 scanned XFA fields to their corresponding profile
 * paths. Fields that are UI-only (buttons, barcodes, page counters, computed
 * fields) are marked as meta fields with no profile_path.
 *
 * Usage:  npx tsx scripts/seed-imm5710e.ts
 *
 * Prerequisites:
 *   1. IMM5710E form already uploaded and scanned via the IRCC Form Library UI
 *      (279 fields, 0/279 mapped → this script maps all of them)
 *   2. .env.local has NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// ── Env Setup ─────────────────────────────────────────────────────────────────

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

// ── Marital Status Options ─────────────────────────────────────────────────────

const MARITAL_STATUS_OPTIONS = [
  { label: 'Single', value: 'single' },
  { label: 'Married', value: 'married' },
  { label: 'Common-Law', value: 'common_law' },
  { label: 'Divorced', value: 'divorced' },
  { label: 'Widowed', value: 'widowed' },
  { label: 'Separated', value: 'separated' },
  { label: 'Annulled', value: 'annulled' },
]

// ── Field Mapping Definition ──────────────────────────────────────────────────
// Maps each scanned XFA path → profile_path, label, field_type, etc.
// null profile_path = meta/computed/UI-only field (button, barcode, counter, etc.)

interface FieldMapping {
  xfa_path: string
  profile_path: string | null
  label: string | null
  field_type: string | null
  is_required: boolean
  date_split?: 'year' | 'month' | 'day' | null
  options?: Array<{ label: string; value: string }> | null
  value_format?: Record<string, string> | null
  show_when?: { profile_path: string; operator: string; value?: string } | null
  is_meta_field?: boolean
  meta_field_key?: string | null
  is_client_visible?: boolean
}

const FIELD_MAPPINGS: FieldMapping[] = [
  // ── Page/Navigation meta fields ──────────────────────────────────────────
  { xfa_path: 'Page1.CurrentPage', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, meta_field_key: 'current_page', is_client_visible: false },
  { xfa_path: 'Page1.PageCount', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, meta_field_key: 'page_count', is_client_visible: false },
  { xfa_path: 'Page1.TextField', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  { xfa_path: 'OverFlowPage.CurrentPage', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  { xfa_path: 'OverFlowPage.PageCount', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  { xfa_path: 'OverFlowPage.appHeader.TextField', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  { xfa_path: 'OverFlowPage.TextField', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  { xfa_path: 'Page1.Header.Button1', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  { xfa_path: 'Page1.Header.CRCNum', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, meta_field_key: 'crc_number', is_client_visible: false },
  { xfa_path: 'Page1.ButtonsHeader.ValidateButton', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  { xfa_path: 'Page1.ButtonsHeader.Age', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  { xfa_path: 'Page1.ButtonsHeader.AdultFlag', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  { xfa_path: 'Page1.ButtonsHeader.FormVersion', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, meta_field_key: 'form_version', is_client_visible: false },
  { xfa_path: 'Page1.ButtonsHeader.PrevAge', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  { xfa_path: 'Page1.PersonalDetails.ApplicationValidatedFlag', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },

  // ── Section: Personal Details ─────────────────────────────────────────────
  {
    xfa_path: 'Page1.PersonalDetails.ServiceIn.UCIClientID',
    profile_path: 'personal.uci_number',
    label: 'UCI / Client ID (if previously assigned)',
    field_type: 'text',
    is_required: false,
    is_client_visible: true,
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
    is_client_visible: true,
  },
  { xfa_path: 'Page1.PersonalDetails.OfficeUse.ApplicationValidatedFlag', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },

  // Applying for checkboxes
  {
    xfa_path: 'Page1.PersonalDetails.ApplyingFor.RestoreStat',
    profile_path: 'work.applying_for_restore_status',
    label: 'Applying to restore immigration status',
    field_type: 'boolean',
    is_required: false,
    value_format: { boolean_true: 'X', boolean_false: '' },
    is_client_visible: true,
  },
  {
    xfa_path: 'Page1.PersonalDetails.ApplyingFor.Extend',
    profile_path: 'work.applying_for_extend',
    label: 'Applying to extend work permit',
    field_type: 'boolean',
    is_required: false,
    value_format: { boolean_true: 'X', boolean_false: '' },
    is_client_visible: true,
  },
  {
    xfa_path: 'Page1.PersonalDetails.ApplyingFor.NewEmployer',
    profile_path: 'work.applying_for_new_employer',
    label: 'Applying to work for a new employer',
    field_type: 'boolean',
    is_required: false,
    value_format: { boolean_true: 'X', boolean_false: '' },
    is_client_visible: true,
  },
  {
    xfa_path: 'Page1.PersonalDetails.ApplyingFor.TRP',
    profile_path: 'work.applying_for_trp',
    label: 'Applying for Temporary Resident Permit (TRP)',
    field_type: 'boolean',
    is_required: false,
    value_format: { boolean_true: 'X', boolean_false: '' },
    is_client_visible: true,
  },

  // Name
  {
    xfa_path: 'Page1.PersonalDetails.Name.FamilyName',
    profile_path: 'personal.family_name',
    label: 'Family Name(s)',
    field_type: 'text',
    is_required: true,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page1.PersonalDetails.Name.GivenName',
    profile_path: 'personal.given_name',
    label: 'Given Name(s)',
    field_type: 'text',
    is_required: true,
    is_client_visible: true,
  },

  // Alias
  {
    xfa_path: 'Page1.PersonalDetails.AliasName.AliasFamilyName',
    profile_path: 'personal.alias_family_name',
    label: 'Other Family Name (alias)',
    field_type: 'text',
    is_required: false,
    show_when: { profile_path: 'personal.has_alias', operator: 'is_truthy' },
    is_client_visible: true,
  },
  {
    xfa_path: 'Page1.PersonalDetails.AliasName.AliasGivenName',
    profile_path: 'personal.alias_given_name',
    label: 'Other Given Name (alias)',
    field_type: 'text',
    is_required: false,
    show_when: { profile_path: 'personal.has_alias', operator: 'is_truthy' },
    is_client_visible: true,
  },
  {
    xfa_path: 'Page1.PersonalDetails.AliasName.AliasNameIndicator.AliasNameIndicator.No',
    profile_path: 'personal.has_alias',
    label: 'Alias Name  -  No',
    field_type: 'boolean',
    is_required: false,
    value_format: { boolean_false: 'X', boolean_true: '' },
    is_client_visible: false,
  },
  {
    xfa_path: 'Page1.PersonalDetails.AliasName.AliasNameIndicator.AliasNameIndicator.Yes',
    profile_path: 'personal.has_alias',
    label: 'Have you ever used another name (e.g. maiden name, alias)?',
    field_type: 'boolean',
    is_required: true,
    value_format: { boolean_true: 'X', boolean_false: '' },
    is_client_visible: true,
  },

  // Sex & DOB
  {
    xfa_path: 'Page1.PersonalDetails.q3-4-5.sex.Sex',
    profile_path: 'personal.sex',
    label: 'Sex',
    field_type: 'select',
    is_required: true,
    options: [
      { label: 'Male', value: 'male' },
      { label: 'Female', value: 'female' },
      { label: 'Other', value: 'other' },
    ],
    is_client_visible: true,
  },
  {
    xfa_path: 'Page1.PersonalDetails.q3-4-5.dob.DOBDay',
    profile_path: 'personal.date_of_birth',
    label: 'Date of Birth  -  Day',
    field_type: 'date',
    is_required: false,
    date_split: 'day',
    is_client_visible: false,
  },
  {
    xfa_path: 'Page1.PersonalDetails.q3-4-5.dob.DOBMonth',
    profile_path: 'personal.date_of_birth',
    label: 'Date of Birth  -  Month',
    field_type: 'date',
    is_required: false,
    date_split: 'month',
    is_client_visible: false,
  },
  {
    xfa_path: 'Page1.PersonalDetails.q3-4-5.dob.DOBYear',
    profile_path: 'personal.date_of_birth',
    label: 'Date of Birth',
    field_type: 'date',
    is_required: true,
    date_split: 'year',
    is_client_visible: true,
  },

  // Place of Birth
  {
    xfa_path: 'Page1.PersonalDetails.q3-4-5.pob.PlaceBirthCity',
    profile_path: 'personal.place_of_birth_city',
    label: 'Place of Birth  -  City',
    field_type: 'text',
    is_required: true,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page1.PersonalDetails.q3-4-5.pob.PlaceBirthCountry',
    profile_path: 'personal.place_of_birth_country',
    label: 'Place of Birth  -  Country',
    field_type: 'country',
    is_required: true,
    is_client_visible: true,
  },

  // Citizenship
  {
    xfa_path: 'Page1.PersonalDetails.Citizenship.Citizenship',
    profile_path: 'personal.citizenship',
    label: 'Country of Citizenship',
    field_type: 'country',
    is_required: true,
    is_client_visible: true,
  },

  // Current Country of Residence
  {
    xfa_path: 'Page1.PersonalDetails.CurrentCOR.CurrentCOR.Row2.Country',
    profile_path: 'personal.current_country_of_residence',
    label: 'Current Country of Residence',
    field_type: 'country',
    is_required: true,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page1.PersonalDetails.CurrentCOR.CurrentCOR.Row2.Status',
    profile_path: 'personal.residence_status',
    label: 'Immigration Status in Current Country',
    field_type: 'text',
    is_required: false,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page1.PersonalDetails.CurrentCOR.CurrentCOR.Row2.Other',
    profile_path: 'personal.residence_status_other',
    label: 'Immigration Status  -  Other (specify)',
    field_type: 'text',
    is_required: false,
    is_client_visible: true,
  },
  { xfa_path: 'Page1.PersonalDetails.CurrentCOR.CurrentCOR.Row2.FromDate', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  { xfa_path: 'Page1.PersonalDetails.CurrentCOR.CurrentCOR.Row2.ToDate', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  {
    xfa_path: 'Page1.PersonalDetails.CurrentCOR.CORDates.FromYr',
    profile_path: 'personal.cor_from_date',
    label: 'Current Country of Residence  -  From Year',
    field_type: 'date',
    is_required: false,
    date_split: 'year',
    is_client_visible: false,
  },
  {
    xfa_path: 'Page1.PersonalDetails.CurrentCOR.CORDates.FromMM',
    profile_path: 'personal.cor_from_date',
    label: 'Current Country of Residence  -  From Month',
    field_type: 'date',
    is_required: false,
    date_split: 'month',
    is_client_visible: false,
  },
  {
    xfa_path: 'Page1.PersonalDetails.CurrentCOR.CORDates.FromDD',
    profile_path: 'personal.cor_from_date',
    label: 'Current Country of Residence  -  From Day',
    field_type: 'date',
    is_required: false,
    date_split: 'day',
    is_client_visible: false,
  },
  {
    xfa_path: 'Page1.PersonalDetails.CurrentCOR.CORDates.ToDD',
    profile_path: 'personal.cor_to_date',
    label: 'Current Country of Residence  -  To Day',
    field_type: 'date',
    is_required: false,
    date_split: 'day',
    is_client_visible: false,
  },
  {
    xfa_path: 'Page1.PersonalDetails.CurrentCOR.CORDates.ToYr',
    profile_path: 'personal.cor_to_date',
    label: 'Current Country of Residence  -  To Year',
    field_type: 'date',
    is_required: false,
    date_split: 'year',
    is_client_visible: false,
  },
  {
    xfa_path: 'Page1.PersonalDetails.CurrentCOR.CORDates.ToMM',
    profile_path: 'personal.cor_to_date',
    label: 'Current Country of Residence  -  To Month',
    field_type: 'date',
    is_required: false,
    date_split: 'month',
    is_client_visible: false,
  },

  // Previous Country of Residence indicator
  {
    xfa_path: 'Page1.PersonalDetails.PrevCOR.PCRIndicator.No',
    profile_path: 'personal.has_previous_cor',
    label: 'Previous Country of Residence  -  No',
    field_type: 'boolean',
    is_required: false,
    value_format: { boolean_false: 'X', boolean_true: '' },
    is_client_visible: false,
  },
  {
    xfa_path: 'Page1.PersonalDetails.PrevCOR.PCRIndicator.Yes',
    profile_path: 'personal.has_previous_cor',
    label: 'Did you have a previous country of residence?',
    field_type: 'boolean',
    is_required: true,
    value_format: { boolean_true: 'X', boolean_false: '' },
    is_client_visible: true,
  },

  // Previous COR Row 1
  {
    xfa_path: 'Page1.PersonalDetails.PrevCOR.PCOR_tbl.PreviousCOR.Row2.Country',
    profile_path: 'personal.previous_cor_1_country',
    label: 'Previous Country of Residence 1  -  Country',
    field_type: 'country',
    is_required: false,
    show_when: { profile_path: 'personal.has_previous_cor', operator: 'is_truthy' },
    is_client_visible: true,
  },
  {
    xfa_path: 'Page1.PersonalDetails.PrevCOR.PCOR_tbl.PreviousCOR.Row2.Status',
    profile_path: 'personal.previous_cor_1_status',
    label: 'Previous Country of Residence 1  -  Immigration Status',
    field_type: 'text',
    is_required: false,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page1.PersonalDetails.PrevCOR.PCOR_tbl.PreviousCOR.Row2.Other',
    profile_path: 'personal.previous_cor_1_status_other',
    label: 'Previous COR 1  -  Status Other',
    field_type: 'text',
    is_required: false,
    is_client_visible: false,
  },
  { xfa_path: 'Page1.PersonalDetails.PrevCOR.PCOR_tbl.PreviousCOR.Row2.FromDate', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  { xfa_path: 'Page1.PersonalDetails.PrevCOR.PCOR_tbl.PreviousCOR.Row2.ToDate', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },

  // Previous COR Row 2
  {
    xfa_path: 'Page1.PersonalDetails.PrevCOR.PCOR_tbl.PreviousCOR.Row3.Country',
    profile_path: 'personal.previous_cor_2_country',
    label: 'Previous Country of Residence 2  -  Country',
    field_type: 'country',
    is_required: false,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page1.PersonalDetails.PrevCOR.PCOR_tbl.PreviousCOR.Row3.Status',
    profile_path: 'personal.previous_cor_2_status',
    label: 'Previous Country of Residence 2  -  Immigration Status',
    field_type: 'text',
    is_required: false,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page1.PersonalDetails.PrevCOR.PCOR_tbl.PreviousCOR.Row3.Other',
    profile_path: 'personal.previous_cor_2_status_other',
    label: 'Previous COR 2  -  Status Other',
    field_type: 'text',
    is_required: false,
    is_client_visible: false,
  },
  { xfa_path: 'Page1.PersonalDetails.PrevCOR.PCOR_tbl.PreviousCOR.Row3.FromDate', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  { xfa_path: 'Page1.PersonalDetails.PrevCOR.PCOR_tbl.PreviousCOR.Row3.ToDate', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },

  // Previous COR Dates  -  Row 1
  {
    xfa_path: 'Page1.PersonalDetails.PrevCOR.PCOR_tbl.PCRDatesR1.FromYr',
    profile_path: 'personal.previous_cor_1_from_date',
    label: 'Previous COR 1  -  From Year',
    field_type: 'date',
    is_required: false,
    date_split: 'year',
    is_client_visible: false,
  },
  {
    xfa_path: 'Page1.PersonalDetails.PrevCOR.PCOR_tbl.PCRDatesR1.FromMM',
    profile_path: 'personal.previous_cor_1_from_date',
    label: 'Previous COR 1  -  From Month',
    field_type: 'date',
    is_required: false,
    date_split: 'month',
    is_client_visible: false,
  },
  {
    xfa_path: 'Page1.PersonalDetails.PrevCOR.PCOR_tbl.PCRDatesR1.FromDD',
    profile_path: 'personal.previous_cor_1_from_date',
    label: 'Previous COR 1  -  From Day',
    field_type: 'date',
    is_required: false,
    date_split: 'day',
    is_client_visible: false,
  },
  {
    xfa_path: 'Page1.PersonalDetails.PrevCOR.PCOR_tbl.PCRDatesR1.ToYr',
    profile_path: 'personal.previous_cor_1_to_date',
    label: 'Previous COR 1  -  To Year',
    field_type: 'date',
    is_required: false,
    date_split: 'year',
    is_client_visible: false,
  },
  {
    xfa_path: 'Page1.PersonalDetails.PrevCOR.PCOR_tbl.PCRDatesR1.ToMM',
    profile_path: 'personal.previous_cor_1_to_date',
    label: 'Previous COR 1  -  To Month',
    field_type: 'date',
    is_required: false,
    date_split: 'month',
    is_client_visible: false,
  },
  {
    xfa_path: 'Page1.PersonalDetails.PrevCOR.PCOR_tbl.PCRDatesR1.ToDD',
    profile_path: 'personal.previous_cor_1_to_date',
    label: 'Previous COR 1  -  To Day',
    field_type: 'date',
    is_required: false,
    date_split: 'day',
    is_client_visible: false,
  },

  // Previous COR Dates  -  Row 2
  {
    xfa_path: 'Page1.PersonalDetails.PrevCOR.PCOR_tbl.PCRDatesR2.FromYr',
    profile_path: 'personal.previous_cor_2_from_date',
    label: 'Previous COR 2  -  From Year',
    field_type: 'date',
    is_required: false,
    date_split: 'year',
    is_client_visible: false,
  },
  {
    xfa_path: 'Page1.PersonalDetails.PrevCOR.PCOR_tbl.PCRDatesR2.FromMM',
    profile_path: 'personal.previous_cor_2_from_date',
    label: 'Previous COR 2  -  From Month',
    field_type: 'date',
    is_required: false,
    date_split: 'month',
    is_client_visible: false,
  },
  {
    xfa_path: 'Page1.PersonalDetails.PrevCOR.PCOR_tbl.PCRDatesR2.FromDD',
    profile_path: 'personal.previous_cor_2_from_date',
    label: 'Previous COR 2  -  From Day',
    field_type: 'date',
    is_required: false,
    date_split: 'day',
    is_client_visible: false,
  },
  {
    xfa_path: 'Page1.PersonalDetails.PrevCOR.PCOR_tbl.PCRDatesR2.ToYr',
    profile_path: 'personal.previous_cor_2_to_date',
    label: 'Previous COR 2  -  To Year',
    field_type: 'date',
    is_required: false,
    date_split: 'year',
    is_client_visible: false,
  },
  {
    xfa_path: 'Page1.PersonalDetails.PrevCOR.PCOR_tbl.PCRDatesR2.ToMM',
    profile_path: 'personal.previous_cor_2_to_date',
    label: 'Previous COR 2  -  To Month',
    field_type: 'date',
    is_required: false,
    date_split: 'month',
    is_client_visible: false,
  },
  {
    xfa_path: 'Page1.PersonalDetails.PrevCOR.PCOR_tbl.PCRDatesR2.ToDD',
    profile_path: 'personal.previous_cor_2_to_date',
    label: 'Previous COR 2  -  To Day',
    field_type: 'date',
    is_required: false,
    date_split: 'day',
    is_client_visible: false,
  },

  // ── Section: Marital Status ───────────────────────────────────────────────
  {
    xfa_path: 'Page1.MaritalStatus.Current.MaritalStatus',
    profile_path: 'marital.status',
    label: 'Current Marital Status',
    field_type: 'select',
    is_required: true,
    options: MARITAL_STATUS_OPTIONS,
    is_client_visible: true,
  },
  { xfa_path: 'Page1.MaritalStatus.Current.b.DateOfMarriage', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  {
    xfa_path: 'Page1.MaritalStatus.Current.b.MarriageDate.FromYr',
    profile_path: 'marital.date_of_current_relationship',
    label: 'Marriage/Relationship Date  -  Year',
    field_type: 'date',
    is_required: false,
    date_split: 'year',
    show_when: { profile_path: 'marital.status', operator: 'equals', value: 'married' },
    is_client_visible: true,
  },
  {
    xfa_path: 'Page1.MaritalStatus.Current.b.MarriageDate.FromMM',
    profile_path: 'marital.date_of_current_relationship',
    label: 'Marriage/Relationship Date  -  Month',
    field_type: 'date',
    is_required: false,
    date_split: 'month',
    is_client_visible: false,
  },
  {
    xfa_path: 'Page1.MaritalStatus.Current.b.MarriageDate.FromDD',
    profile_path: 'marital.date_of_current_relationship',
    label: 'Marriage/Relationship Date  -  Day',
    field_type: 'date',
    is_required: false,
    date_split: 'day',
    is_client_visible: false,
  },
  {
    xfa_path: 'Page1.MaritalStatus.Current.c.FamilyName',
    profile_path: 'marital.spouse_family_name',
    label: 'Spouse / Partner Family Name',
    field_type: 'text',
    is_required: false,
    show_when: { profile_path: 'marital.status', operator: 'equals', value: 'married' },
    is_client_visible: true,
  },
  {
    xfa_path: 'Page1.MaritalStatus.Current.c.GivenName',
    profile_path: 'marital.spouse_given_name',
    label: 'Spouse / Partner Given Name',
    field_type: 'text',
    is_required: false,
    show_when: { profile_path: 'marital.status', operator: 'equals', value: 'married' },
    is_client_visible: true,
  },
  {
    xfa_path: 'Page1.MaritalStatus.d.SpouseStatus.No',
    profile_path: 'marital.spouse_accompanying',
    label: 'Spouse/Partner Accompanying  -  No',
    field_type: 'boolean',
    is_required: false,
    value_format: { boolean_false: 'X', boolean_true: '' },
    is_client_visible: false,
  },
  {
    xfa_path: 'Page1.MaritalStatus.d.SpouseStatus.Yes',
    profile_path: 'marital.spouse_accompanying',
    label: 'Is spouse / partner accompanying you to Canada?',
    field_type: 'boolean',
    is_required: false,
    value_format: { boolean_true: 'X', boolean_false: '' },
    is_client_visible: true,
  },

  // Previous Marriage
  {
    xfa_path: 'Page2.MaritalStatus.PrevMarriage.PrevMarriedIndicator.No',
    profile_path: 'marital.was_previously_married',
    label: 'Previously married  -  No',
    field_type: 'boolean',
    is_required: false,
    value_format: { boolean_false: 'X', boolean_true: '' },
    is_client_visible: false,
  },
  {
    xfa_path: 'Page2.MaritalStatus.PrevMarriage.PrevMarriedIndicator.Yes',
    profile_path: 'marital.was_previously_married',
    label: 'Were you previously married or in a common-law relationship?',
    field_type: 'boolean',
    is_required: true,
    value_format: { boolean_true: 'X', boolean_false: '' },
    is_client_visible: true,
  },
  { xfa_path: 'Page2.MaritalStatus.PrevMarriage.DateLastValidated.DateCalc', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  { xfa_path: 'Page2.MaritalStatus.PrevMarriage.DateLastValidated.Year', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  { xfa_path: 'Page2.MaritalStatus.PrevMarriage.DateLastValidated.Month', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  { xfa_path: 'Page2.MaritalStatus.PrevMarriage.DateLastValidated.Day', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  {
    xfa_path: 'Page2.MaritalStatus.PrevMarriage.PMFamilyName',
    profile_path: 'marital.previous_spouse_family_name',
    label: 'Previous Spouse  -  Family Name',
    field_type: 'text',
    is_required: false,
    show_when: { profile_path: 'marital.was_previously_married', operator: 'is_truthy' },
    is_client_visible: true,
  },
  {
    xfa_path: 'Page2.MaritalStatus.PrevMarriage.PMGivenName',
    profile_path: 'marital.previous_spouse_given_name',
    label: 'Previous Spouse  -  Given Name',
    field_type: 'text',
    is_required: false,
    show_when: { profile_path: 'marital.was_previously_married', operator: 'is_truthy' },
    is_client_visible: true,
  },
  {
    xfa_path: 'Page2.MaritalStatus.PrevMarriage.TypeOfRelationship',
    profile_path: 'marital.previous_relationship_type',
    label: 'Type of Previous Relationship',
    field_type: 'select',
    is_required: false,
    options: [
      { label: 'Marriage', value: 'marriage' },
      { label: 'Common-Law', value: 'common_law' },
    ],
    show_when: { profile_path: 'marital.was_previously_married', operator: 'is_truthy' },
    is_client_visible: true,
  },
  { xfa_path: 'Page2.MaritalStatus.PrevMarriage.From.FromDate', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  { xfa_path: 'Page2.MaritalStatus.PrevMarriage.To.ToDate', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  {
    xfa_path: 'Page2.MaritalStatus.PrevMarriage.PreviouslyMarriedDates.FromYr',
    profile_path: 'marital.previous_relationship_from_date',
    label: 'Previous Relationship  -  From Year',
    field_type: 'date',
    is_required: false,
    date_split: 'year',
    is_client_visible: false,
  },
  {
    xfa_path: 'Page2.MaritalStatus.PrevMarriage.PreviouslyMarriedDates.FromMM',
    profile_path: 'marital.previous_relationship_from_date',
    label: 'Previous Relationship  -  From Month',
    field_type: 'date',
    is_required: false,
    date_split: 'month',
    is_client_visible: false,
  },
  {
    xfa_path: 'Page2.MaritalStatus.PrevMarriage.PreviouslyMarriedDates.FromDD',
    profile_path: 'marital.previous_relationship_from_date',
    label: 'Previous Relationship  -  From Day',
    field_type: 'date',
    is_required: false,
    date_split: 'day',
    is_client_visible: false,
  },
  {
    xfa_path: 'Page2.MaritalStatus.PrevMarriage.PreviouslyMarriedDates.ToYr',
    profile_path: 'marital.previous_relationship_to_date',
    label: 'Previous Relationship  -  To Year',
    field_type: 'date',
    is_required: false,
    date_split: 'year',
    is_client_visible: false,
  },
  {
    xfa_path: 'Page2.MaritalStatus.PrevMarriage.PreviouslyMarriedDates.ToMM',
    profile_path: 'marital.previous_relationship_to_date',
    label: 'Previous Relationship  -  To Month',
    field_type: 'date',
    is_required: false,
    date_split: 'month',
    is_client_visible: false,
  },
  {
    xfa_path: 'Page2.MaritalStatus.PrevMarriage.PreviouslyMarriedDates.ToDD',
    profile_path: 'marital.previous_relationship_to_date',
    label: 'Previous Relationship  -  To Day',
    field_type: 'date',
    is_required: false,
    date_split: 'day',
    is_client_visible: false,
  },
  {
    xfa_path: 'Page2.MaritalStatus.PrevMarriage.dob.DOBDay',
    profile_path: 'marital.previous_spouse_dob',
    label: 'Previous Spouse DOB  -  Day',
    field_type: 'date',
    is_required: false,
    date_split: 'day',
    is_client_visible: false,
  },
  {
    xfa_path: 'Page2.MaritalStatus.PrevMarriage.dob.DOBMonth',
    profile_path: 'marital.previous_spouse_dob',
    label: 'Previous Spouse DOB  -  Month',
    field_type: 'date',
    is_required: false,
    date_split: 'month',
    is_client_visible: false,
  },
  {
    xfa_path: 'Page2.MaritalStatus.PrevMarriage.dob.DOBYear',
    profile_path: 'marital.previous_spouse_dob',
    label: 'Previous Spouse  -  Date of Birth',
    field_type: 'date',
    is_required: false,
    date_split: 'year',
    is_client_visible: true,
  },

  // ── Section: Languages ────────────────────────────────────────────────────
  {
    xfa_path: 'Page2.Languages.nativeLang',
    profile_path: 'language.native_language',
    label: 'Native Language / Mother Tongue',
    field_type: 'text',
    is_required: true,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page2.Languages.communicateLang',
    profile_path: 'language.preferred_language',
    label: 'Preferred Language of Correspondence',
    field_type: 'select',
    is_required: true,
    options: [
      { label: 'English', value: 'english' },
      { label: 'French', value: 'french' },
    ],
    is_client_visible: true,
  },
  {
    xfa_path: 'Page2.Languages.LangTestIndicator.Yes',
    profile_path: 'language.has_language_test',
    label: 'Have you taken a language test?',
    field_type: 'boolean',
    is_required: false,
    value_format: { boolean_true: 'X', boolean_false: '' },
    is_client_visible: true,
  },
  {
    xfa_path: 'Page2.Languages.LangTestIndicator.No',
    profile_path: 'language.has_language_test',
    label: 'Language Test  -  No',
    field_type: 'boolean',
    is_required: false,
    value_format: { boolean_false: 'X', boolean_true: '' },
    is_client_visible: false,
  },
  {
    xfa_path: 'Page2.Languages.FreqLang',
    profile_path: 'language.language_of_interview',
    label: 'Language most at ease for interview',
    field_type: 'select',
    is_required: false,
    options: [
      { label: 'English', value: 'english' },
      { label: 'French', value: 'french' },
      { label: 'Both', value: 'both' },
    ],
    is_client_visible: true,
  },

  // ── Section: Passport ─────────────────────────────────────────────────────
  {
    xfa_path: 'Page2.Passport.PassportNum',
    profile_path: 'passport.number',
    label: 'Passport / Travel Document Number',
    field_type: 'text',
    is_required: true,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page2.Passport.CountryofIssue',
    profile_path: 'passport.country_of_issue',
    label: 'Passport  -  Country of Issue',
    field_type: 'country',
    is_required: true,
    is_client_visible: true,
  },
  { xfa_path: 'Page2.Passport.IssueDate', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  { xfa_path: 'Page2.Passport.ExpiryDate', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  {
    xfa_path: 'Page2.Passport.Issue.YYYY',
    profile_path: 'passport.issue_date',
    label: 'Passport Issue Date  -  Year',
    field_type: 'date',
    is_required: true,
    date_split: 'year',
    is_client_visible: true,
  },
  {
    xfa_path: 'Page2.Passport.Issue.MM',
    profile_path: 'passport.issue_date',
    label: 'Passport Issue Date  -  Month',
    field_type: 'date',
    is_required: false,
    date_split: 'month',
    is_client_visible: false,
  },
  {
    xfa_path: 'Page2.Passport.Issue.DD',
    profile_path: 'passport.issue_date',
    label: 'Passport Issue Date  -  Day',
    field_type: 'date',
    is_required: false,
    date_split: 'day',
    is_client_visible: false,
  },
  {
    xfa_path: 'Page2.Passport.Expiry.YYYY',
    profile_path: 'passport.expiry_date',
    label: 'Passport Expiry Date  -  Year',
    field_type: 'date',
    is_required: true,
    date_split: 'year',
    is_client_visible: true,
  },
  {
    xfa_path: 'Page2.Passport.Expiry.MM',
    profile_path: 'passport.expiry_date',
    label: 'Passport Expiry Date  -  Month',
    field_type: 'date',
    is_required: false,
    date_split: 'month',
    is_client_visible: false,
  },
  {
    xfa_path: 'Page2.Passport.Expiry.DD',
    profile_path: 'passport.expiry_date',
    label: 'Passport Expiry Date  -  Day',
    field_type: 'date',
    is_required: false,
    date_split: 'day',
    is_client_visible: false,
  },
  {
    xfa_path: 'Page2.Passport.TaiwanPIN.No',
    profile_path: 'passport.taiwan_pin',
    label: 'Taiwan Personal Identification Number  -  No',
    field_type: 'boolean',
    is_required: false,
    value_format: { boolean_false: 'X', boolean_true: '' },
    is_client_visible: false,
  },
  {
    xfa_path: 'Page2.Passport.TaiwanPIN.Yes',
    profile_path: 'passport.taiwan_pin',
    label: 'Does your passport include a Taiwan Personal Identification Number?',
    field_type: 'boolean',
    is_required: false,
    value_format: { boolean_true: 'X', boolean_false: '' },
    is_client_visible: true,
  },
  {
    xfa_path: 'Page2.Passport.IsraelPassportIndicator.No',
    profile_path: 'passport.israel_passport',
    label: 'Israel Passport  -  No',
    field_type: 'boolean',
    is_required: false,
    value_format: { boolean_false: 'X', boolean_true: '' },
    is_client_visible: false,
  },
  {
    xfa_path: 'Page2.Passport.IsraelPassportIndicator.Yes',
    profile_path: 'passport.israel_passport',
    label: 'Do you hold an Israeli passport that does not contain your place of birth?',
    field_type: 'boolean',
    is_required: false,
    value_format: { boolean_true: 'X', boolean_false: '' },
    is_client_visible: true,
  },

  // ── Section: National Identity Document ──────────────────────────────────
  {
    xfa_path: 'Page2.natID.q1.natIDIndicator.No',
    profile_path: 'passport.national_id_indicator',
    label: 'National ID  -  No',
    field_type: 'boolean',
    is_required: false,
    value_format: { boolean_false: 'X', boolean_true: '' },
    is_client_visible: false,
  },
  {
    xfa_path: 'Page2.natID.q1.natIDIndicator.Yes',
    profile_path: 'passport.national_id_indicator',
    label: 'Do you have a National Identity Document?',
    field_type: 'boolean',
    is_required: true,
    value_format: { boolean_true: 'X', boolean_false: '' },
    is_client_visible: true,
  },
  {
    xfa_path: 'Page2.natID.natIDdocs.DocNum.DocNum',
    profile_path: 'passport.national_id_number',
    label: 'National ID  -  Document Number',
    field_type: 'text',
    is_required: false,
    show_when: { profile_path: 'passport.national_id_indicator', operator: 'is_truthy' },
    is_client_visible: true,
  },
  {
    xfa_path: 'Page2.natID.natIDdocs.CountryofIssue.CountryofIssue',
    profile_path: 'passport.national_id_country',
    label: 'National ID  -  Country of Issue',
    field_type: 'country',
    is_required: false,
    show_when: { profile_path: 'passport.national_id_indicator', operator: 'is_truthy' },
    is_client_visible: true,
  },
  {
    xfa_path: 'Page2.natID.natIDdocs.IssueDate.IssueDate',
    profile_path: 'passport.national_id_issue_date',
    label: 'National ID  -  Date of Issue',
    field_type: 'date',
    is_required: false,
    show_when: { profile_path: 'passport.national_id_indicator', operator: 'is_truthy' },
    is_client_visible: true,
  },
  {
    xfa_path: 'Page2.natID.natIDdocs.ExpiryDate',
    profile_path: 'passport.national_id_expiry_date',
    label: 'National ID  -  Date of Expiry',
    field_type: 'date',
    is_required: false,
    show_when: { profile_path: 'passport.national_id_indicator', operator: 'is_truthy' },
    is_client_visible: true,
  },

  // ── Section: U.S. Green Card ──────────────────────────────────────────────
  {
    xfa_path: 'Page2.USCard.q1.usCardIndicator.No',
    profile_path: 'passport.us_pr_card_indicator',
    label: 'U.S. Green Card  -  No',
    field_type: 'boolean',
    is_required: false,
    value_format: { boolean_false: 'X', boolean_true: '' },
    is_client_visible: false,
  },
  {
    xfa_path: 'Page2.USCard.q1.usCardIndicator.Yes',
    profile_path: 'passport.us_pr_card_indicator',
    label: 'Do you have a U.S. Permanent Resident Card (Green Card)?',
    field_type: 'boolean',
    is_required: true,
    value_format: { boolean_true: 'X', boolean_false: '' },
    is_client_visible: true,
  },
  {
    xfa_path: 'Page2.USCard.usCarddocs.DocNum.DocNum',
    profile_path: 'passport.us_pr_card_number',
    label: 'U.S. Green Card  -  Document Number',
    field_type: 'text',
    is_required: false,
    show_when: { profile_path: 'passport.us_pr_card_indicator', operator: 'is_truthy' },
    is_client_visible: true,
  },
  {
    xfa_path: 'Page2.USCard.usCarddocs.ExpiryDate',
    profile_path: 'passport.us_pr_card_expiry_date',
    label: 'U.S. Green Card  -  Date of Expiry',
    field_type: 'date',
    is_required: false,
    show_when: { profile_path: 'passport.us_pr_card_indicator', operator: 'is_truthy' },
    is_client_visible: true,
  },

  // ── Section: Contact Information ──────────────────────────────────────────
  // Mailing Address
  {
    xfa_path: 'Page2.ContactInformation.Mailing.AddrLine1.POBox',
    profile_path: 'contact_info.mailing_address.po_box',
    label: 'Mailing Address  -  P.O. Box',
    field_type: 'text',
    is_required: false,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page2.ContactInformation.Mailing.AddrLine1.AptUnit',
    profile_path: 'contact_info.mailing_address.apt_unit',
    label: 'Mailing Address  -  Apt / Unit',
    field_type: 'text',
    is_required: false,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page2.ContactInformation.Mailing.AddrLine1.StreetNum',
    profile_path: 'contact_info.mailing_address.street_number',
    label: 'Mailing Address  -  Street Number',
    field_type: 'text',
    is_required: true,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page2.ContactInformation.Mailing.AddrLine1.Streetname',
    profile_path: 'contact_info.mailing_address.street_name',
    label: 'Mailing Address  -  Street Name',
    field_type: 'text',
    is_required: true,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page2.ContactInformation.Mailing.AddrLine2.City',
    profile_path: 'contact_info.mailing_address.city',
    label: 'Mailing Address  -  City',
    field_type: 'text',
    is_required: true,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page2.ContactInformation.Mailing.AddrLine2.Country',
    profile_path: 'contact_info.mailing_address.country',
    label: 'Mailing Address  -  Country',
    field_type: 'country',
    is_required: true,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page2.ContactInformation.Mailing.AddrLine2.Prov',
    profile_path: 'contact_info.mailing_address.province_state',
    label: 'Mailing Address  -  Province / State',
    field_type: 'text',
    is_required: false,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page2.ContactInformation.Mailing.AddrLine2.PostalCode',
    profile_path: 'contact_info.mailing_address.postal_code',
    label: 'Mailing Address  -  Postal Code',
    field_type: 'text',
    is_required: false,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page2.ContactInformation.Mailing.AddrLine2.District',
    profile_path: 'contact_info.mailing_address.district',
    label: 'Mailing Address  -  District',
    field_type: 'text',
    is_required: false,
    is_client_visible: false,
  },

  // Residential  -  Same as Mailing indicator
  {
    xfa_path: 'Page2.ContactInformation.Resi.SameAsAddr.SameAsMailingInd.No',
    profile_path: 'contact_info.same_as_mailing',
    label: 'Residential same as mailing  -  No',
    field_type: 'boolean',
    is_required: false,
    value_format: { boolean_false: 'X', boolean_true: '' },
    is_client_visible: false,
  },
  {
    xfa_path: 'Page2.ContactInformation.Resi.SameAsAddr.SameAsMailingInd.Yes',
    profile_path: 'contact_info.same_as_mailing',
    label: 'Residential address same as mailing address?',
    field_type: 'boolean',
    is_required: false,
    value_format: { boolean_true: 'X', boolean_false: '' },
    is_client_visible: true,
  },

  // Residential Address
  {
    xfa_path: 'Page2.ContactInformation.Resi.AddrLine1.AptUnit',
    profile_path: 'contact_info.residential_address.apt_unit',
    label: 'Residential  -  Apt / Unit',
    field_type: 'text',
    is_required: false,
    show_when: { profile_path: 'contact_info.same_as_mailing', operator: 'is_falsy' },
    is_client_visible: true,
  },
  {
    xfa_path: 'Page2.ContactInformation.Resi.AddrLine1.StreetNum',
    profile_path: 'contact_info.residential_address.street_number',
    label: 'Residential  -  Street Number',
    field_type: 'text',
    is_required: false,
    show_when: { profile_path: 'contact_info.same_as_mailing', operator: 'is_falsy' },
    is_client_visible: true,
  },
  {
    xfa_path: 'Page2.ContactInformation.Resi.AddrLine1.Streetname',
    profile_path: 'contact_info.residential_address.street_name',
    label: 'Residential  -  Street Name',
    field_type: 'text',
    is_required: false,
    show_when: { profile_path: 'contact_info.same_as_mailing', operator: 'is_falsy' },
    is_client_visible: true,
  },
  {
    xfa_path: 'Page2.ContactInformation.Resi.AddrLine2.City',
    profile_path: 'contact_info.residential_address.city',
    label: 'Residential  -  City',
    field_type: 'text',
    is_required: false,
    show_when: { profile_path: 'contact_info.same_as_mailing', operator: 'is_falsy' },
    is_client_visible: true,
  },
  {
    xfa_path: 'Page2.ContactInformation.Resi.AddrLine2.Country',
    profile_path: 'contact_info.residential_address.country',
    label: 'Residential  -  Country',
    field_type: 'country',
    is_required: false,
    show_when: { profile_path: 'contact_info.same_as_mailing', operator: 'is_falsy' },
    is_client_visible: true,
  },
  {
    xfa_path: 'Page2.ContactInformation.Resi.AddrLine2.Prov',
    profile_path: 'contact_info.residential_address.province_state',
    label: 'Residential  -  Province / State',
    field_type: 'text',
    is_required: false,
    show_when: { profile_path: 'contact_info.same_as_mailing', operator: 'is_falsy' },
    is_client_visible: true,
  },
  {
    xfa_path: 'Page2.ContactInformation.Resi.AddrLine2.PostalCode',
    profile_path: 'contact_info.residential_address.postal_code',
    label: 'Residential  -  Postal Code',
    field_type: 'text',
    is_required: false,
    show_when: { profile_path: 'contact_info.same_as_mailing', operator: 'is_falsy' },
    is_client_visible: true,
  },
  {
    xfa_path: 'Page2.ContactInformation.Resi.AddrLine2.District',
    profile_path: 'contact_info.residential_address.district',
    label: 'Residential  -  District',
    field_type: 'text',
    is_required: false,
    is_client_visible: false,
  },

  // Phone  -  Primary
  {
    xfa_path: 'Page2.ContactInformation.q3-4.Phone.CanOtherInd.CanadaUS',
    profile_path: 'contact_info.phone_type_indicator',
    label: 'Phone  -  Canada/US Number',
    field_type: 'text',
    is_required: false,
    is_client_visible: false,
  },
  {
    xfa_path: 'Page2.ContactInformation.q3-4.Phone.CanOtherInd.Other',
    profile_path: 'contact_info.phone_type_indicator_other',
    label: 'Phone  -  International Number',
    field_type: 'text',
    is_required: false,
    is_client_visible: false,
  },
  {
    xfa_path: 'Page2.ContactInformation.q3-4.Phone.ActualNumber',
    profile_path: 'contact_info.telephone',
    label: 'Telephone Number',
    field_type: 'phone',
    is_required: true,
    is_client_visible: true,
  },
  { xfa_path: 'Page2.ContactInformation.q3-4.Phone.Type', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  { xfa_path: 'Page2.ContactInformation.q3-4.Phone.NumberExt', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  { xfa_path: 'Page2.ContactInformation.q3-4.Phone.NumberCountry', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  { xfa_path: 'Page2.ContactInformation.q3-4.Phone.NANumber.AreaCode', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  { xfa_path: 'Page2.ContactInformation.q3-4.Phone.NANumber.FirstThree', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  { xfa_path: 'Page2.ContactInformation.q3-4.Phone.NANumber.LastFive', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  { xfa_path: 'Page2.ContactInformation.q3-4.Phone.IntlNumber.IntlNumber', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },

  // Phone  -  Alternate
  { xfa_path: 'Page2.ContactInformation.q3-4.AltPhone.CanOtherInd.CanadaUS', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  { xfa_path: 'Page2.ContactInformation.q3-4.AltPhone.CanOtherInd.Other', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  {
    xfa_path: 'Page2.ContactInformation.q3-4.AltPhone.ActualNumber',
    profile_path: 'contact_info.alt_telephone',
    label: 'Alternate Telephone Number',
    field_type: 'phone',
    is_required: false,
    is_client_visible: true,
  },
  { xfa_path: 'Page2.ContactInformation.q3-4.AltPhone.Type', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  { xfa_path: 'Page2.ContactInformation.q3-4.AltPhone.NumberExt', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  { xfa_path: 'Page2.ContactInformation.q3-4.AltPhone.NumberCountry', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  { xfa_path: 'Page2.ContactInformation.q3-4.AltPhone.NANumber.AreaCode', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  { xfa_path: 'Page2.ContactInformation.q3-4.AltPhone.NANumber.FirstThree', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  { xfa_path: 'Page2.ContactInformation.q3-4.AltPhone.NANumber.LastFive', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  { xfa_path: 'Page2.ContactInformation.q3-4.AltPhone.IntlNumber.IntlNumber', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },

  // Fax
  { xfa_path: 'Page2.ContactInformation.q5-6.Fax.CanOtherInd.CanadaUS', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  { xfa_path: 'Page2.ContactInformation.q5-6.Fax.CanOtherInd.Other', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  { xfa_path: 'Page2.ContactInformation.q5-6.Fax.NumberExt', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  { xfa_path: 'Page2.ContactInformation.q5-6.Fax.NumberCountry', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  {
    xfa_path: 'Page2.ContactInformation.q5-6.Fax.ActualNumber',
    profile_path: 'contact_info.fax',
    label: 'Fax Number',
    field_type: 'phone',
    is_required: false,
    is_client_visible: true,
  },
  { xfa_path: 'Page2.ContactInformation.q5-6.Fax.NANumber.AreaCode', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  { xfa_path: 'Page2.ContactInformation.q5-6.Fax.NANumber.FirstThree', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  { xfa_path: 'Page2.ContactInformation.q5-6.Fax.NANumber.LastFive', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  { xfa_path: 'Page2.ContactInformation.q5-6.Fax.IntlNumber.IntlNumber', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  {
    xfa_path: 'Page2.ContactInformation.q5-6.Email.Email',
    profile_path: 'contact_info.email',
    label: 'Email Address',
    field_type: 'email',
    is_required: true,
    is_client_visible: true,
  },

  // ── Section: Details of Visit to Canada ──────────────────────────────────
  {
    xfa_path: 'Page3.ComingIntoCda.OrigEntry.DateLastEntry',
    profile_path: 'work.original_entry_date',
    label: 'Date of Original Entry into Canada',
    field_type: 'text',
    is_required: false,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page3.ComingIntoCda.OrigEntry.Place',
    profile_path: 'work.original_entry_place',
    label: 'Place of Original Entry into Canada',
    field_type: 'text',
    is_required: false,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page3.ComingIntoCda.PurposeOfVisit.PurposeOfVisit',
    profile_path: 'work.purpose_of_visit',
    label: 'Purpose of Visit to Canada',
    field_type: 'text',
    is_required: true,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page3.ComingIntoCda.PurposeOfVisit.Other',
    profile_path: 'work.purpose_of_visit_other',
    label: 'Purpose of Visit  -  Other (specify)',
    field_type: 'text',
    is_required: false,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page3.ComingIntoCda.RecentEntry.DateLastEntry',
    profile_path: 'work.recent_entry_date',
    label: 'Date of Most Recent Entry into Canada',
    field_type: 'text',
    is_required: false,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page3.ComingIntoCda.RecentEntry.Place',
    profile_path: 'work.recent_entry_place',
    label: 'Place of Most Recent Entry into Canada',
    field_type: 'text',
    is_required: false,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page3.ComingIntoCda.PrevDocNum.docNum',
    profile_path: 'work.previous_document_number',
    label: 'Previous Authorization / Document Number',
    field_type: 'text',
    is_required: false,
    is_client_visible: true,
  },

  // ── Section: Details of Intended Work ────────────────────────────────────
  {
    xfa_path: 'Page3.DetailsOfWork.Purpose.Type',
    profile_path: 'work.work_permit_type',
    label: 'Type of Work Permit Being Applied For',
    field_type: 'text',
    is_required: true,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page3.DetailsOfWork.Purpose.Other',
    profile_path: 'work.work_permit_type_other',
    label: 'Work Permit Type  -  Other (specify)',
    field_type: 'text',
    is_required: false,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page3.DetailsOfWork.Employer.Name',
    profile_path: 'work.employer_name',
    label: 'Employer Name',
    field_type: 'text',
    is_required: true,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page3.DetailsOfWork.Employer.Addr',
    profile_path: 'work.employer_address',
    label: 'Employer Address',
    field_type: 'text',
    is_required: false,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page3.DetailsOfWork.Location.Prov',
    profile_path: 'work.work_location_province',
    label: 'Work Location  -  Province',
    field_type: 'text',
    is_required: false,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page3.DetailsOfWork.Location.City',
    profile_path: 'work.work_location_city',
    label: 'Work Location  -  City',
    field_type: 'text',
    is_required: false,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page3.DetailsOfWork.Location.Addr',
    profile_path: 'work.work_location_address',
    label: 'Work Location  -  Address',
    field_type: 'text',
    is_required: false,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page3.DetailsOfWork.Occupation.Job',
    profile_path: 'work.occupation_title',
    label: 'Job Title / Occupation',
    field_type: 'text',
    is_required: true,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page3.DetailsOfWork.Occupation.Desc',
    profile_path: 'work.occupation_description',
    label: 'Job Description',
    field_type: 'textarea',
    is_required: false,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page3.DetailsOfWork.Duration.FromDate',
    profile_path: 'work.work_from_date',
    label: 'Work Period  -  From Date',
    field_type: 'text',
    is_required: false,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page3.DetailsOfWork.Duration.ToDate',
    profile_path: 'work.work_to_date',
    label: 'Work Period  -  To Date',
    field_type: 'text',
    is_required: false,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page3.DetailsOfWork.Duration.LMO',
    profile_path: 'work.lmia_number',
    label: 'LMIA Number (Labour Market Impact Assessment)',
    field_type: 'text',
    is_required: false,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page3.DetailsOfWork.CAQ.CertNum',
    profile_path: 'work.caq_number',
    label: 'CAQ Certificate Number (Quebec only)',
    field_type: 'text',
    is_required: false,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page3.DetailsOfWork.CAQ.CertExpiry',
    profile_path: 'work.caq_expiry_date',
    label: 'CAQ Certificate Expiry Date',
    field_type: 'text',
    is_required: false,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page3.DetailsOfWork.ProvNominee.ProvNominee.No',
    profile_path: 'work.provincial_nominee',
    label: 'Provincial Nominee  -  No',
    field_type: 'boolean',
    is_required: false,
    value_format: { boolean_false: 'X', boolean_true: '' },
    is_client_visible: false,
  },
  {
    xfa_path: 'Page3.DetailsOfWork.ProvNominee.ProvNominee.Yes',
    profile_path: 'work.provincial_nominee',
    label: 'Are you a Provincial / Territorial Nominee?',
    field_type: 'boolean',
    is_required: false,
    value_format: { boolean_true: 'X', boolean_false: '' },
    is_client_visible: true,
  },

  // ── Section: Education ────────────────────────────────────────────────────
  {
    xfa_path: 'Page3.Education.EducationIndicator.No',
    profile_path: 'education.has_post_secondary',
    label: 'Post-Secondary Education  -  No',
    field_type: 'boolean',
    is_required: false,
    value_format: { boolean_false: 'X', boolean_true: '' },
    is_client_visible: false,
  },
  {
    xfa_path: 'Page3.Education.EducationIndicator.Yes',
    profile_path: 'education.has_post_secondary',
    label: 'Have you completed any post-secondary education?',
    field_type: 'boolean',
    is_required: true,
    value_format: { boolean_true: 'X', boolean_false: '' },
    is_client_visible: true,
  },
  {
    xfa_path: 'Page3.Education.EduLine1.From.YYYY',
    profile_path: 'education.edu1_from_year',
    label: 'Education 1  -  From Year',
    field_type: 'text',
    is_required: false,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page3.Education.EduLine1.From.MM',
    profile_path: 'education.edu1_from_month',
    label: 'Education 1  -  From Month',
    field_type: 'text',
    is_required: false,
    is_client_visible: false,
  },
  {
    xfa_path: 'Page3.Education.EduLine1.FieldOfStudy',
    profile_path: 'education.edu1_field_of_study',
    label: 'Education 1  -  Field of Study',
    field_type: 'text',
    is_required: false,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page3.Education.EduLine1.School',
    profile_path: 'education.edu1_school_name',
    label: 'Education 1  -  School / Institution Name',
    field_type: 'text',
    is_required: false,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page3.Education.EduLine2.To.YYYY',
    profile_path: 'education.edu1_to_year',
    label: 'Education 1  -  To Year',
    field_type: 'text',
    is_required: false,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page3.Education.EduLine2.To.MM',
    profile_path: 'education.edu1_to_month',
    label: 'Education 1  -  To Month',
    field_type: 'text',
    is_required: false,
    is_client_visible: false,
  },
  {
    xfa_path: 'Page3.Education.EduLine2.City',
    profile_path: 'education.edu1_city',
    label: 'Education 1  -  City',
    field_type: 'text',
    is_required: false,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page3.Education.EduLine2.Country',
    profile_path: 'education.edu1_country',
    label: 'Education 1  -  Country',
    field_type: 'country',
    is_required: false,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page3.Education.EduLine2.Prov',
    profile_path: 'education.edu1_province_state',
    label: 'Education 1  -  Province / State',
    field_type: 'text',
    is_required: false,
    is_client_visible: true,
  },

  // ── Section: Employment History  -  Record 1 ────────────────────────────────
  {
    xfa_path: 'Page3.Employment.EmpRec1.Line1.From.YYYY',
    profile_path: 'employment.emp1_from_year',
    label: 'Employment 1  -  From Year',
    field_type: 'text',
    is_required: false,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page3.Employment.EmpRec1.Line1.From.MM',
    profile_path: 'employment.emp1_from_month',
    label: 'Employment 1  -  From Month',
    field_type: 'text',
    is_required: false,
    is_client_visible: false,
  },
  {
    xfa_path: 'Page3.Employment.EmpRec1.Line1.Occupation',
    profile_path: 'employment.emp1_occupation',
    label: 'Employment 1  -  Occupation',
    field_type: 'text',
    is_required: false,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page3.Employment.EmpRec1.Line1.Employer',
    profile_path: 'employment.emp1_employer',
    label: 'Employment 1  -  Employer Name',
    field_type: 'text',
    is_required: false,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page3.Employment.EmpRec1.Line2.To.YYYY',
    profile_path: 'employment.emp1_to_year',
    label: 'Employment 1  -  To Year',
    field_type: 'text',
    is_required: false,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page3.Employment.EmpRec1.Line2.To.MM',
    profile_path: 'employment.emp1_to_month',
    label: 'Employment 1  -  To Month',
    field_type: 'text',
    is_required: false,
    is_client_visible: false,
  },
  {
    xfa_path: 'Page3.Employment.EmpRec1.Line2.City',
    profile_path: 'employment.emp1_city',
    label: 'Employment 1  -  City',
    field_type: 'text',
    is_required: false,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page3.Employment.EmpRec1.Line2.Country',
    profile_path: 'employment.emp1_country',
    label: 'Employment 1  -  Country',
    field_type: 'country',
    is_required: false,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page3.Employment.EmpRec1.Line2.ProvState',
    profile_path: 'employment.emp1_province_state',
    label: 'Employment 1  -  Province / State',
    field_type: 'text',
    is_required: false,
    is_client_visible: true,
  },

  // ── Section: Employment History  -  Record 2 ────────────────────────────────
  {
    xfa_path: 'Page4.EmpRec2.Line1.From.YYYY',
    profile_path: 'employment.emp2_from_year',
    label: 'Employment 2  -  From Year',
    field_type: 'text',
    is_required: false,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page4.EmpRec2.Line1.From.MM',
    profile_path: 'employment.emp2_from_month',
    label: 'Employment 2  -  From Month',
    field_type: 'text',
    is_required: false,
    is_client_visible: false,
  },
  {
    xfa_path: 'Page4.EmpRec2.Line1.Occupation',
    profile_path: 'employment.emp2_occupation',
    label: 'Employment 2  -  Occupation',
    field_type: 'text',
    is_required: false,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page4.EmpRec2.Line1.Employer',
    profile_path: 'employment.emp2_employer',
    label: 'Employment 2  -  Employer Name',
    field_type: 'text',
    is_required: false,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page4.EmpRec2.Line2.To.YYYY',
    profile_path: 'employment.emp2_to_year',
    label: 'Employment 2  -  To Year',
    field_type: 'text',
    is_required: false,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page4.EmpRec2.Line2.To.MM',
    profile_path: 'employment.emp2_to_month',
    label: 'Employment 2  -  To Month',
    field_type: 'text',
    is_required: false,
    is_client_visible: false,
  },
  {
    xfa_path: 'Page4.EmpRec2.Line2.City',
    profile_path: 'employment.emp2_city',
    label: 'Employment 2  -  City',
    field_type: 'text',
    is_required: false,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page4.EmpRec2.Line2.Country',
    profile_path: 'employment.emp2_country',
    label: 'Employment 2  -  Country',
    field_type: 'country',
    is_required: false,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page4.EmpRec2.Line2.ProvState',
    profile_path: 'employment.emp2_province_state',
    label: 'Employment 2  -  Province / State',
    field_type: 'text',
    is_required: false,
    is_client_visible: true,
  },

  // ── Section: Employment History  -  Record 3 ────────────────────────────────
  {
    xfa_path: 'Page4.EmpRec3.Line1.From.YYYY',
    profile_path: 'employment.emp3_from_year',
    label: 'Employment 3  -  From Year',
    field_type: 'text',
    is_required: false,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page4.EmpRec3.Line1.From.MM',
    profile_path: 'employment.emp3_from_month',
    label: 'Employment 3  -  From Month',
    field_type: 'text',
    is_required: false,
    is_client_visible: false,
  },
  {
    xfa_path: 'Page4.EmpRec3.Line1.Occupation',
    profile_path: 'employment.emp3_occupation',
    label: 'Employment 3  -  Occupation',
    field_type: 'text',
    is_required: false,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page4.EmpRec3.Line1.Employer',
    profile_path: 'employment.emp3_employer',
    label: 'Employment 3  -  Employer Name',
    field_type: 'text',
    is_required: false,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page4.EmpRec3.Line2.To.YYYY',
    profile_path: 'employment.emp3_to_year',
    label: 'Employment 3  -  To Year',
    field_type: 'text',
    is_required: false,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page4.EmpRec3.Line2.To.MM',
    profile_path: 'employment.emp3_to_month',
    label: 'Employment 3  -  To Month',
    field_type: 'text',
    is_required: false,
    is_client_visible: false,
  },
  {
    xfa_path: 'Page4.EmpRec3.Line2.City',
    profile_path: 'employment.emp3_city',
    label: 'Employment 3  -  City',
    field_type: 'text',
    is_required: false,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page4.EmpRec3.Line2.Country',
    profile_path: 'employment.emp3_country',
    label: 'Employment 3  -  Country',
    field_type: 'country',
    is_required: false,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page4.EmpRec3.Line2.ProvState',
    profile_path: 'employment.emp3_province_state',
    label: 'Employment 3  -  Province / State',
    field_type: 'text',
    is_required: false,
    is_client_visible: true,
  },

  // ── Section: Background Information ──────────────────────────────────────
  { xfa_path: 'Page4.BackgroundInfo.BackgroundHeader.ClearBkgButton', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },

  // Health questions
  {
    xfa_path: 'Page4.BackgroundInfo.HealthQ.qANY.No',
    profile_path: 'background.physical_mental_disorder',
    label: 'Physical/mental disorder requiring health care  -  No',
    field_type: 'boolean',
    is_required: false,
    value_format: { boolean_false: 'X', boolean_true: '' },
    is_client_visible: false,
  },
  {
    xfa_path: 'Page4.BackgroundInfo.HealthQ.qANY.Yes',
    profile_path: 'background.physical_mental_disorder',
    label: 'Do you have a physical or mental disorder for which health or social services will be needed?',
    field_type: 'boolean',
    is_required: true,
    value_format: { boolean_true: 'X', boolean_false: '' },
    is_client_visible: true,
  },
  {
    xfa_path: 'Page4.BackgroundInfo.HealthQ.qBNY.No',
    profile_path: 'background.tuberculosis_contact',
    label: 'Tuberculosis contact  -  No',
    field_type: 'boolean',
    is_required: false,
    value_format: { boolean_false: 'X', boolean_true: '' },
    is_client_visible: false,
  },
  {
    xfa_path: 'Page4.BackgroundInfo.HealthQ.qBNY.Yes',
    profile_path: 'background.tuberculosis_contact',
    label: 'Have you been in close contact with a person with tuberculosis in the last 2 years?',
    field_type: 'boolean',
    is_required: true,
    value_format: { boolean_true: 'X', boolean_false: '' },
    is_client_visible: true,
  },
  {
    xfa_path: 'Page4.BackgroundInfo.HealthQ.MedicalDetails',
    profile_path: 'background.physical_mental_disorder_details',
    label: 'Medical Condition  -  Details',
    field_type: 'textarea',
    is_required: false,
    is_client_visible: true,
  },
  { xfa_path: 'Page4.BackgroundInfo.HealthQ.backgroundInfoCalc', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },

  // Previous application questions
  {
    xfa_path: 'Page4.BackgroundInfo.PrevApplied.qANY.Yes',
    profile_path: 'background.previously_applied',
    label: 'Previously applied for a Canadian visa, permit, or stay extension?',
    field_type: 'boolean',
    is_required: true,
    value_format: { boolean_true: 'X', boolean_false: '' },
    is_client_visible: true,
  },
  {
    xfa_path: 'Page4.BackgroundInfo.PrevApplied.qANY.No',
    profile_path: 'background.previously_applied',
    label: 'Previously applied  -  No',
    field_type: 'boolean',
    is_required: false,
    value_format: { boolean_false: 'X', boolean_true: '' },
    is_client_visible: false,
  },
  {
    xfa_path: 'Page4.BackgroundInfo.PrevApplied.qBNY.Yes',
    profile_path: 'background.refused_visa',
    label: 'Ever been refused a Canadian visa or permit, or ordered to leave?',
    field_type: 'boolean',
    is_required: true,
    value_format: { boolean_true: 'X', boolean_false: '' },
    is_client_visible: true,
  },
  {
    xfa_path: 'Page4.BackgroundInfo.PrevApplied.qBNY.No',
    profile_path: 'background.refused_visa',
    label: 'Refused visa  -  No',
    field_type: 'boolean',
    is_required: false,
    value_format: { boolean_false: 'X', boolean_true: '' },
    is_client_visible: false,
  },
  {
    xfa_path: 'Page4.BackgroundInfo.PrevApplied.refusedDetails',
    profile_path: 'background.refused_visa_details',
    label: 'Refused Visa / Application  -  Details',
    field_type: 'textarea',
    is_required: false,
    is_client_visible: true,
  },
  {
    xfa_path: 'Page4.BackgroundInfo.PrevApplied.qCNY.No',
    profile_path: 'background.overstayed_visa',
    label: 'Overstayed visa  -  No',
    field_type: 'boolean',
    is_required: false,
    value_format: { boolean_false: 'X', boolean_true: '' },
    is_client_visible: false,
  },
  {
    xfa_path: 'Page4.BackgroundInfo.PrevApplied.qCNY.Yes',
    profile_path: 'background.overstayed_visa',
    label: 'Have you ever overstayed a Canadian authorization?',
    field_type: 'boolean',
    is_required: true,
    value_format: { boolean_true: 'X', boolean_false: '' },
    is_client_visible: true,
  },

  // Criminal
  {
    xfa_path: 'Page4.BackgroundInfo.Criminal.qANY.No',
    profile_path: 'background.criminal_record',
    label: 'Criminal record  -  No',
    field_type: 'boolean',
    is_required: false,
    value_format: { boolean_false: 'X', boolean_true: '' },
    is_client_visible: false,
  },
  {
    xfa_path: 'Page4.BackgroundInfo.Criminal.qANY.Yes',
    profile_path: 'background.criminal_record',
    label: 'Have you ever been arrested, charged, or convicted of a criminal offence?',
    field_type: 'boolean',
    is_required: true,
    value_format: { boolean_true: 'X', boolean_false: '' },
    is_client_visible: true,
  },
  {
    xfa_path: 'Page4.BackgroundInfo.Criminal.refusedDetails',
    profile_path: 'background.criminal_record_details',
    label: 'Criminal Record  -  Details',
    field_type: 'textarea',
    is_required: false,
    is_client_visible: true,
  },

  // Military
  {
    xfa_path: 'Page4.BackgroundInfo.Military.qANY.No',
    profile_path: 'background.military_service',
    label: 'Military service  -  No',
    field_type: 'boolean',
    is_required: false,
    value_format: { boolean_false: 'X', boolean_true: '' },
    is_client_visible: false,
  },
  {
    xfa_path: 'Page4.BackgroundInfo.Military.qANY.Yes',
    profile_path: 'background.military_service',
    label: 'Have you served in the military, militia, or civil defence unit?',
    field_type: 'boolean',
    is_required: true,
    value_format: { boolean_true: 'X', boolean_false: '' },
    is_client_visible: true,
  },
  {
    xfa_path: 'Page4.BackgroundInfo.Military.militaryServiceDetails',
    profile_path: 'background.military_service_details',
    label: 'Military Service  -  Details',
    field_type: 'textarea',
    is_required: false,
    is_client_visible: true,
  },

  // Occupation health exam
  {
    xfa_path: 'Page4.BackgroundInfo.Occupation.Choice.No',
    profile_path: 'background.occupation_health_required',
    label: 'Occupation requiring health exam  -  No',
    field_type: 'boolean',
    is_required: false,
    value_format: { boolean_false: 'X', boolean_true: '' },
    is_client_visible: false,
  },
  {
    xfa_path: 'Page4.BackgroundInfo.Occupation.Choice.Yes',
    profile_path: 'background.occupation_health_required',
    label: 'Will your work in Canada require a medical examination?',
    field_type: 'boolean',
    is_required: true,
    value_format: { boolean_true: 'X', boolean_false: '' },
    is_client_visible: true,
  },

  // Government position
  {
    xfa_path: 'Page4.BackgroundInfo.GovPosition.qGovtNY.No',
    profile_path: 'background.government_position',
    label: 'Government position  -  No',
    field_type: 'boolean',
    is_required: false,
    value_format: { boolean_false: 'X', boolean_true: '' },
    is_client_visible: false,
  },
  {
    xfa_path: 'Page4.BackgroundInfo.GovPosition.qGovtNY.Yes',
    profile_path: 'background.government_position',
    label: 'Are you, or have you ever been, a government official or employee?',
    field_type: 'boolean',
    is_required: true,
    value_format: { boolean_true: 'X', boolean_false: '' },
    is_client_visible: true,
  },

  // Witness to ill treatment
  {
    xfa_path: 'Page4.BackgroundInfo.Illtreatment.qWitnessNY.No',
    profile_path: 'background.witnessed_ill_treatment',
    label: 'Witness to ill treatment  -  No',
    field_type: 'boolean',
    is_required: false,
    value_format: { boolean_false: 'X', boolean_true: '' },
    is_client_visible: false,
  },
  {
    xfa_path: 'Page4.BackgroundInfo.Illtreatment.qWitnessNY.Yes',
    profile_path: 'background.witnessed_ill_treatment',
    label: 'Have you ever witnessed or participated in the ill-treatment of prisoners or civilians?',
    field_type: 'boolean',
    is_required: true,
    value_format: { boolean_true: 'X', boolean_false: '' },
    is_client_visible: true,
  },

  // ── Section: Consent & Declaration ───────────────────────────────────────
  { xfa_path: 'Page4.Consent1.Signature.C1CertificateIssueDate', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, meta_field_key: 'certificate_issue_date', is_client_visible: false },
  { xfa_path: 'Page4.Consent1.Signature.TextField2', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  {
    xfa_path: 'Page4.Consent1.Signature.FutureComm.No',
    profile_path: 'consent.future_communications',
    label: 'Future communications consent  -  No',
    field_type: 'boolean',
    is_required: false,
    value_format: { boolean_false: 'X', boolean_true: '' },
    is_client_visible: false,
  },
  {
    xfa_path: 'Page4.Consent1.Signature.FutureComm.Yes',
    profile_path: 'consent.future_communications',
    label: 'Consent to receive future communications from IRCC?',
    field_type: 'boolean',
    is_required: false,
    value_format: { boolean_true: 'X', boolean_false: '' },
    is_client_visible: true,
  },

  // ── Footer & Barcodes (all meta) ──────────────────────────────────────────
  { xfa_path: 'Page4.ButtonsFooter.ValidateButtonBottom', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  { xfa_path: 'Page4.ButtonsFooter.ReaderInfo', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  { xfa_path: 'Barcodes.PaperFormsBarcode1', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  { xfa_path: 'Barcodes.PaperFormsBarcode2', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  { xfa_path: 'Barcodes.PaperFormsBarcode3', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  { xfa_path: 'Barcodes.PaperFormsBarcode4', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  { xfa_path: 'Barcodes.PaperFormsBarcode5', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  { xfa_path: 'Barcodes.PaperFormsBarcode6', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  { xfa_path: 'Page5.TextField1', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  { xfa_path: 'Page5.Button2', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, is_client_visible: false },
  { xfa_path: 'SignatureField1', profile_path: null, label: null, field_type: null, is_required: false, is_meta_field: true, meta_field_key: 'signature', is_client_visible: false },
]

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('  IMM5710E Field Mapping Seed')
  console.log('═══════════════════════════════════════════════════════════')

  // Fetch the IMM5710E form record
  const { data: form, error: formErr } = await supabase
    .from('ircc_forms')
    .select('id, form_code, form_name')
    .eq('form_code', 'IMM5710E')
    .single()

  if (formErr || !form) {
    console.error('IMM5710E form not found in DB. Please upload and scan the form first via the IRCC Form Library UI.')
    process.exit(1)
  }

  console.log(`\nForm: ${form.form_code}  -  ${form.form_name}`)
  console.log(`Form ID: ${form.id}`)

  // Fetch all scanned fields for this form
  const { data: scannedFields, error: fieldsErr } = await supabase
    .from('ircc_form_fields')
    .select('id, xfa_path, is_mapped')
    .eq('form_id', form.id)
    .order('sort_order')

  if (fieldsErr || !scannedFields) {
    console.error('Failed to fetch fields:', fieldsErr?.message)
    process.exit(1)
  }

  console.log(`\nScanned fields: ${scannedFields.length}`)
  console.log(`Mapping definitions: ${FIELD_MAPPINGS.length}`)

  // Build lookup: xfa_path → scanned field
  const scannedByPath: Record<string, { id: string; xfa_path: string; is_mapped: boolean }> = {}
  for (const f of scannedFields) {
    scannedByPath[f.xfa_path] = f
  }

  // Verify all mapping paths exist in scanned fields
  const missing: string[] = []
  for (const m of FIELD_MAPPINGS) {
    if (!scannedByPath[m.xfa_path]) {
      missing.push(m.xfa_path)
    }
  }

  if (missing.length > 0) {
    console.error(`\n❌ ERROR: ${missing.length} XFA path(s) in mapping not found in scanned fields:`)
    for (const p of missing) console.error(`  - ${p}`)
    process.exit(1)
  }

  // Apply mappings
  let updated = 0
  let skipped = 0
  let errors = 0

  for (const mapping of FIELD_MAPPINGS) {
    const scanned = scannedByPath[mapping.xfa_path]
    if (!scanned) continue

    const updateData: Record<string, unknown> = {
      is_mapped: mapping.profile_path !== null,
      profile_path: mapping.profile_path,
      label: mapping.label,
      field_type: mapping.field_type,
      is_required: mapping.is_required,
      is_client_visible: mapping.is_client_visible ?? true,
      is_meta_field: mapping.is_meta_field ?? false,
      meta_field_key: mapping.meta_field_key ?? null,
      date_split: mapping.date_split ?? null,
      options: mapping.options ?? null,
      value_format: mapping.value_format ?? null,
      show_when: mapping.show_when ?? null,
    }

    const { error: updateErr } = await supabase
      .from('ircc_form_fields')
      .update(updateData)
      .eq('id', scanned.id)

    if (updateErr) {
      console.error(`  ✗ ${mapping.xfa_path}: ${updateErr.message}`)
      errors++
    } else {
      updated++
    }
  }

  // Check for any scanned fields not in our mapping (shouldn't happen if count is correct)
  const coveredPaths = new Set(FIELD_MAPPINGS.map((m) => m.xfa_path))
  const uncovered = scannedFields.filter((f) => !coveredPaths.has(f.xfa_path))
  if (uncovered.length > 0) {
    console.warn(`\n⚠  ${uncovered.length} scanned field(s) not in mapping (no profile_path assigned):`)
    for (const f of uncovered) console.warn(`  - ${f.xfa_path}`)
    skipped = uncovered.length
  }

  // Final report
  console.log('\n───────────────────────────────────────────────────────────')
  console.log(`  Total scanned fields:   ${scannedFields.length}`)
  console.log(`  Mapping definitions:    ${FIELD_MAPPINGS.length}`)
  console.log(`  Updated:                ${updated}`)
  if (skipped > 0) console.log(`  Uncovered (no map):     ${skipped}`)
  if (errors > 0) console.log(`  Errors:                 ${errors}`)

  const withProfile = FIELD_MAPPINGS.filter((m) => m.profile_path !== null).length
  const metaOnly = FIELD_MAPPINGS.filter((m) => m.profile_path === null).length
  console.log(`\n  With profile_path:      ${withProfile}`)
  console.log(`  Meta/UI-only (no path): ${metaOnly}`)

  if (errors === 0) {
    console.log('\n  ✓ IMM5710E field mappings applied successfully')
  } else {
    console.log(`\n  ✗ Completed with ${errors} errors`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('Fatal:', e.message)
  process.exit(1)
})
