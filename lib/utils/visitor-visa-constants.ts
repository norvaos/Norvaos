// ---------------------------------------------------------------------------
// Canadian Visitor Visa Invitation Form — Constants
// ---------------------------------------------------------------------------

export const CANADIAN_PROVINCES = [
  { value: 'AB', label: 'Alberta' },
  { value: 'BC', label: 'British Columbia' },
  { value: 'MB', label: 'Manitoba' },
  { value: 'NB', label: 'New Brunswick' },
  { value: 'NL', label: 'Newfoundland and Labrador' },
  { value: 'NS', label: 'Nova Scotia' },
  { value: 'NT', label: 'Northwest Territories' },
  { value: 'NU', label: 'Nunavut' },
  { value: 'ON', label: 'Ontario' },
  { value: 'PE', label: 'Prince Edward Island' },
  { value: 'QC', label: 'Quebec' },
  { value: 'SK', label: 'Saskatchewan' },
  { value: 'YT', label: 'Yukon' },
] as const

export const COUNTRIES = [
  { value: 'AF', label: 'Afghanistan' },
  { value: 'AL', label: 'Albania' },
  { value: 'DZ', label: 'Algeria' },
  { value: 'AR', label: 'Argentina' },
  { value: 'AU', label: 'Australia' },
  { value: 'BD', label: 'Bangladesh' },
  { value: 'BR', label: 'Brazil' },
  { value: 'CM', label: 'Cameroon' },
  { value: 'CN', label: 'China' },
  { value: 'CO', label: 'Colombia' },
  { value: 'CD', label: 'Congo (DRC)' },
  { value: 'EG', label: 'Egypt' },
  { value: 'ET', label: 'Ethiopia' },
  { value: 'FR', label: 'France' },
  { value: 'DE', label: 'Germany' },
  { value: 'GH', label: 'Ghana' },
  { value: 'IN', label: 'India' },
  { value: 'ID', label: 'Indonesia' },
  { value: 'IR', label: 'Iran' },
  { value: 'IQ', label: 'Iraq' },
  { value: 'IE', label: 'Ireland' },
  { value: 'IL', label: 'Israel' },
  { value: 'IT', label: 'Italy' },
  { value: 'JM', label: 'Jamaica' },
  { value: 'JP', label: 'Japan' },
  { value: 'JO', label: 'Jordan' },
  { value: 'KE', label: 'Kenya' },
  { value: 'KR', label: 'South Korea' },
  { value: 'KW', label: 'Kuwait' },
  { value: 'LB', label: 'Lebanon' },
  { value: 'MY', label: 'Malaysia' },
  { value: 'MX', label: 'Mexico' },
  { value: 'MA', label: 'Morocco' },
  { value: 'MM', label: 'Myanmar' },
  { value: 'NP', label: 'Nepal' },
  { value: 'NG', label: 'Nigeria' },
  { value: 'PK', label: 'Pakistan' },
  { value: 'PA', label: 'Panama' },
  { value: 'PE', label: 'Peru' },
  { value: 'PH', label: 'Philippines' },
  { value: 'PL', label: 'Poland' },
  { value: 'RO', label: 'Romania' },
  { value: 'RU', label: 'Russia' },
  { value: 'SA', label: 'Saudi Arabia' },
  { value: 'SN', label: 'Senegal' },
  { value: 'ZA', label: 'South Africa' },
  { value: 'LK', label: 'Sri Lanka' },
  { value: 'SD', label: 'Sudan' },
  { value: 'SY', label: 'Syria' },
  { value: 'TW', label: 'Taiwan' },
  { value: 'TZ', label: 'Tanzania' },
  { value: 'TH', label: 'Thailand' },
  { value: 'TR', label: 'Turkey' },
  { value: 'UG', label: 'Uganda' },
  { value: 'UA', label: 'Ukraine' },
  { value: 'AE', label: 'United Arab Emirates' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'US', label: 'United States' },
  { value: 'VN', label: 'Vietnam' },
  { value: 'ZW', label: 'Zimbabwe' },
] as const

export const IMMIGRATION_STATUSES = [
  { value: 'citizen', label: 'Canadian Citizen' },
  { value: 'permanent_resident', label: 'Permanent Resident' },
  { value: 'work_permit', label: 'Work Permit Holder' },
  { value: 'study_permit', label: 'Study Permit Holder' },
  { value: 'other', label: 'Other' },
] as const

export const RELATIONSHIPS = [
  { value: 'parent', label: 'Parent' },
  { value: 'child', label: 'Child' },
  { value: 'spouse', label: 'Spouse / Partner' },
  { value: 'sibling', label: 'Sibling' },
  { value: 'grandparent', label: 'Grandparent' },
  { value: 'grandchild', label: 'Grandchild' },
  { value: 'uncle_aunt', label: 'Uncle / Aunt' },
  { value: 'cousin', label: 'Cousin' },
  { value: 'nephew_niece', label: 'Nephew / Niece' },
  { value: 'friend', label: 'Friend' },
  { value: 'business_associate', label: 'Business Associate' },
  { value: 'other', label: 'Other' },
] as const

export const VISIT_PURPOSES = [
  { value: 'family_visit', label: 'Family Visit' },
  { value: 'tourism', label: 'Tourism' },
  { value: 'business', label: 'Business' },
  { value: 'event', label: 'Attend Event / Conference' },
  { value: 'wedding', label: 'Wedding' },
  { value: 'medical', label: 'Medical Treatment' },
  { value: 'other', label: 'Other' },
] as const

export const ACCOMMODATION_TYPES = [
  { value: 'with_inviter', label: 'With me (the inviter)' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'airbnb', label: 'Airbnb / Rental' },
  { value: 'other', label: 'Other' },
] as const

export const EXPENSE_RESPONSIBILITY = [
  { value: 'inviter', label: 'I will cover all expenses' },
  { value: 'visitor', label: 'The visitor will cover their own expenses' },
  { value: 'shared', label: 'Shared between us' },
] as const

export const EMPLOYMENT_STATUSES = [
  { value: 'employed', label: 'Employed (Full-time)' },
  { value: 'self_employed', label: 'Self-Employed' },
  { value: 'part_time', label: 'Employed (Part-time)' },
  { value: 'retired', label: 'Retired' },
  { value: 'student', label: 'Student' },
  { value: 'other', label: 'Other' },
] as const

export const GENDERS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
] as const

/** Map province code → full name */
export function getProvinceName(code: string): string {
  return CANADIAN_PROVINCES.find((p) => p.value === code)?.label ?? code
}

/** Map country code → full name */
export function getCountryName(code: string): string {
  return COUNTRIES.find((c) => c.value === code)?.label ?? code
}

/** Map any option value → label from a constant list */
export function getOptionLabel(
  options: ReadonlyArray<{ value: string; label: string }>,
  value: string,
): string {
  return options.find((o) => o.value === value)?.label ?? value
}
