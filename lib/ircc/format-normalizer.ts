/**
 * IRCC Forms Engine  -  Format Normalizer
 *
 * Pure function module (no I/O, no database, no side effects).
 * Handles value normalization between human-readable answer format,
 * canonical storage format, and XFA/PDF output format.
 */

// ── Storage Normalization ────────────────────────────────────────────────────

/**
 * Normalize a user-entered value into the canonical storage format.
 * Called when saving answers to ensure consistent storage.
 */
export function normalizeForStorage(
  value: unknown,
  fieldType: string
): unknown {
  if (value === null || value === undefined) return null
  if (value === '') return null

  switch (fieldType) {
    case 'boolean':
      return normalizeBoolean(value)

    case 'date':
      return normalizeDate(value)

    case 'phone':
      return normalizePhone(value)

    case 'email':
      return normalizeEmail(value)

    case 'number':
      return normalizeNumber(value)

    case 'text':
    case 'textarea':
      return typeof value === 'string' ? value.trim() : String(value).trim()

    case 'select':
    case 'country':
      return typeof value === 'string' ? value.trim() : String(value)

    default:
      return value
  }
}

function normalizeBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim()
    if (['yes', 'true', '1', 'y', 'oui'].includes(lower)) return true
    if (['no', 'false', '0', 'n', 'non'].includes(lower)) return false
  }
  return null
}

function normalizeDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null

  // Already ISO: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed

  // YYYY/MM/DD
  const slashIso = trimmed.match(/^(\d{4})\/(\d{2})\/(\d{2})$/)
  if (slashIso) return `${slashIso[1]}-${slashIso[2]}-${slashIso[3]}`

  // MM/DD/YYYY or MM-DD-YYYY
  const mdy = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (mdy) {
    const m = mdy[1].padStart(2, '0')
    const d = mdy[2].padStart(2, '0')
    return `${mdy[3]}-${m}-${d}`
  }

  // DD.MM.YYYY (European)
  const dmy = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (dmy) {
    const d = dmy[1].padStart(2, '0')
    const m = dmy[2].padStart(2, '0')
    return `${dmy[3]}-${m}-${d}`
  }

  return trimmed
}

function normalizePhone(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  // Keep + prefix and digits only
  return trimmed.replace(/[^\d+]/g, '').replace(/(?!^\+)\+/g, '')
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().toLowerCase()
  return trimmed || null
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isNaN(value) ? null : value
  if (typeof value === 'string') {
    const cleaned = value.trim().replace(/,/g, '')
    if (!cleaned) return null
    const num = Number(cleaned)
    return Number.isNaN(num) ? null : num
  }
  return null
}

// ── Display Formatting ───────────────────────────────────────────────────────

/**
 * Format a stored value for display to the user.
 */
export function formatForDisplay(
  value: unknown,
  fieldType: string,
  locale?: string
): string {
  if (value === null || value === undefined || value === '') return ''

  switch (fieldType) {
    case 'boolean':
      return value === true ? 'Yes' : value === false ? 'No' : String(value)

    case 'date': {
      if (typeof value !== 'string') return String(value)
      // Format YYYY-MM-DD as locale date
      const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
      if (parts) {
        try {
          const date = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]))
          return date.toLocaleDateString(locale ?? 'en-CA', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })
        } catch {
          return value
        }
      }
      return value
    }

    case 'country': {
      if (typeof value !== 'string') return String(value)
      return COUNTRY_MAP[value.toUpperCase()] ?? value
    }

    case 'number':
      return typeof value === 'number' ? value.toLocaleString(locale ?? 'en-CA') : String(value)

    default:
      return String(value)
  }
}

// ── XFA Output Formatting ────────────────────────────────────────────────────

/**
 * Transform a stored value into the string format expected by the XFA field.
 */
export function formatForXfa(
  value: unknown,
  field: {
    field_type: string | null
    value_format: { boolean_true?: string; boolean_false?: string } | null
    date_split: 'year' | 'month' | 'day' | null
    max_length: number | null
  }
): string {
  if (value === null || value === undefined) return ''

  const fieldType = field.field_type ?? 'text'

  // Boolean formatting
  if (fieldType === 'boolean') {
    const trueVal = field.value_format?.boolean_true ?? '1'
    const falseVal = field.value_format?.boolean_false ?? '2'
    if (value === true) return trueVal
    if (value === false) return falseVal
    // Try to parse string booleans
    if (typeof value === 'string') {
      const lower = value.toLowerCase()
      if (['yes', 'true', '1', 'y'].includes(lower)) return trueVal
      if (['no', 'false', '0', 'n'].includes(lower)) return falseVal
    }
    return String(value)
  }

  // Date formatting with optional split
  if (fieldType === 'date' && typeof value === 'string') {
    const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (parts) {
      if (field.date_split === 'year') return parts[1]
      if (field.date_split === 'month') return parts[2]
      if (field.date_split === 'day') return parts[3]
      // No split  -  IRCC format YYYY/MM/DD
      return `${parts[1]}/${parts[2]}/${parts[3]}`
    }
    return value
  }

  // Convert to string
  let str: string
  if (typeof value === 'object') {
    str = JSON.stringify(value)
  } else {
    str = String(value)
  }

  // Apply max_length truncation
  if (field.max_length != null && str.length > field.max_length) {
    str = str.slice(0, field.max_length)
  }

  return str
}

// ── Radio Pair Consolidation ─────────────────────────────────────────────────

/**
 * Detect and consolidate radio button pairs into boolean fields.
 * IRCC XFA forms often use separate Yes/No radio fields for a single question.
 */
export function consolidateRadioPairs(
  fields: Array<{
    id: string
    xfa_path: string
    profile_path: string | null
    field_type: string | null
    suggested_label: string | null
  }>
): Map<string, { primaryId: string; secondaryId: string; label: string }> {
  const result = new Map<string, { primaryId: string; secondaryId: string; label: string }>()
  const pathMap = new Map<string, typeof fields[number]>()

  for (const field of fields) {
    pathMap.set(field.xfa_path, field)
  }

  for (const field of fields) {
    const parts = field.xfa_path.split('.')
    const last = parts[parts.length - 1]?.toLowerCase()
    const secondLast = parts.length >= 2 ? parts[parts.length - 2]?.toLowerCase() : ''

    // Pattern 1: ...yesno.yes / ...yesno.no
    if (secondLast === 'yesno' && last === 'yes') {
      const noParts = [...parts]
      noParts[noParts.length - 1] = 'no'
      const noPath = noParts.join('.')
      const noField = pathMap.get(noPath)
      if (noField) {
        const label = field.suggested_label ?? parts.slice(0, -2).pop() ?? 'Yes/No'
        result.set(field.id, {
          primaryId: field.id,
          secondaryId: noField.id,
          label,
        })
      }
    }

    // Pattern 2: ...QuestionName.Yes / ...QuestionName.No
    if (last === 'yes' && secondLast !== 'yesno') {
      const noParts = [...parts]
      noParts[noParts.length - 1] = 'No'
      const noPath = noParts.join('.')
      const noField = pathMap.get(noPath)
      if (noField) {
        const label = field.suggested_label ?? parts[parts.length - 2] ?? 'Yes/No'
        result.set(field.id, {
          primaryId: field.id,
          secondaryId: noField.id,
          label,
        })
      }
    }
  }

  return result
}

// ── Junk Field Detection ─────────────────────────────────────────────────────

const JUNK_XFA_PATTERNS = [
  /\.ValidateButton\d*$/i,
  /\.formNum$/i,
  /\.link$/i,
  /Section[A-Z]signature$/i,
  /Section[A-Z]date$/i,
  /\.hideChildren$/i,
  /\.buttons\./i,
  /\.addRow$/i,
  /\.removeRow$/i,
  /^SignatureField\d*$/i,
  /\.btnReset$/i,
  /\.btnPrint$/i,
  /\.btnSave$/i,
  /\.barcode$/i,
  /\.Barcode$/i,
  /\.PageCount$/i,
  /\.CurrentPage$/i,
]

/**
 * Check if an XFA path looks like a "junk" field that should be hidden.
 */
export function isJunkXfaField(xfaPath: string): boolean {
  for (const pattern of JUNK_XFA_PATTERNS) {
    if (pattern.test(xfaPath)) return true
  }
  return false
}

// ── Country Map ──────────────────────────────────────────────────────────────

/** ISO 3166-1 alpha-2 code → country name */
export const COUNTRY_MAP: Record<string, string> = {
  AF: 'Afghanistan',
  AL: 'Albania',
  DZ: 'Algeria',
  AR: 'Argentina',
  AM: 'Armenia',
  AU: 'Australia',
  AT: 'Austria',
  AZ: 'Azerbaijan',
  BD: 'Bangladesh',
  BY: 'Belarus',
  BE: 'Belgium',
  BZ: 'Belize',
  BJ: 'Benin',
  BO: 'Bolivia',
  BA: 'Bosnia and Herzegovina',
  BW: 'Botswana',
  BR: 'Brazil',
  BN: 'Brunei',
  BG: 'Bulgaria',
  BF: 'Burkina Faso',
  BI: 'Burundi',
  KH: 'Cambodia',
  CM: 'Cameroon',
  CA: 'Canada',
  CL: 'Chile',
  CN: 'China',
  CO: 'Colombia',
  CD: 'Congo (DRC)',
  CG: 'Congo (Republic)',
  CR: 'Costa Rica',
  HR: 'Croatia',
  CU: 'Cuba',
  CY: 'Cyprus',
  CZ: 'Czechia',
  DK: 'Denmark',
  DO: 'Dominican Republic',
  EC: 'Ecuador',
  EG: 'Egypt',
  SV: 'El Salvador',
  EE: 'Estonia',
  ET: 'Ethiopia',
  FI: 'Finland',
  FR: 'France',
  GE: 'Georgia',
  DE: 'Germany',
  GH: 'Ghana',
  GR: 'Greece',
  GT: 'Guatemala',
  GN: 'Guinea',
  GY: 'Guyana',
  HT: 'Haiti',
  HN: 'Honduras',
  HK: 'Hong Kong',
  HU: 'Hungary',
  IS: 'Iceland',
  IN: 'India',
  ID: 'Indonesia',
  IR: 'Iran',
  IQ: 'Iraq',
  IE: 'Ireland',
  IL: 'Israel',
  IT: 'Italy',
  JM: 'Jamaica',
  JP: 'Japan',
  JO: 'Jordan',
  KZ: 'Kazakhstan',
  KE: 'Kenya',
  KR: 'Korea (South)',
  KW: 'Kuwait',
  KG: 'Kyrgyzstan',
  LA: 'Laos',
  LV: 'Latvia',
  LB: 'Lebanon',
  LY: 'Libya',
  LT: 'Lithuania',
  LU: 'Luxembourg',
  MG: 'Madagascar',
  MY: 'Malaysia',
  ML: 'Mali',
  MX: 'Mexico',
  MD: 'Moldova',
  MN: 'Mongolia',
  MA: 'Morocco',
  MZ: 'Mozambique',
  MM: 'Myanmar',
  NP: 'Nepal',
  NL: 'Netherlands',
  NZ: 'New Zealand',
  NI: 'Nicaragua',
  NE: 'Niger',
  NG: 'Nigeria',
  NO: 'Norway',
  OM: 'Oman',
  PK: 'Pakistan',
  PA: 'Panama',
  PY: 'Paraguay',
  PE: 'Peru',
  PH: 'Philippines',
  PL: 'Poland',
  PT: 'Portugal',
  QA: 'Qatar',
  RO: 'Romania',
  RU: 'Russia',
  RW: 'Rwanda',
  SA: 'Saudi Arabia',
  SN: 'Senegal',
  RS: 'Serbia',
  SG: 'Singapore',
  SK: 'Slovakia',
  SI: 'Slovenia',
  SO: 'Somalia',
  ZA: 'South Africa',
  ES: 'Spain',
  LK: 'Sri Lanka',
  SD: 'Sudan',
  SE: 'Sweden',
  CH: 'Switzerland',
  SY: 'Syria',
  TW: 'Taiwan',
  TJ: 'Tajikistan',
  TZ: 'Tanzania',
  TH: 'Thailand',
  TT: 'Trinidad and Tobago',
  TN: 'Tunisia',
  TR: 'Turkey',
  TM: 'Turkmenistan',
  UG: 'Uganda',
  UA: 'Ukraine',
  AE: 'United Arab Emirates',
  GB: 'United Kingdom',
  US: 'United States',
  UY: 'Uruguay',
  UZ: 'Uzbekistan',
  VE: 'Venezuela',
  VN: 'Vietnam',
  YE: 'Yemen',
  ZM: 'Zambia',
  ZW: 'Zimbabwe',
}
