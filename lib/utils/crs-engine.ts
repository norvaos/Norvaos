// ============================================================================
// CRS (Comprehensive Ranking System) Scoring Engine
// Express Entry  -  Immigration, Refugees and Citizenship Canada (IRCC)
//
// Pure calculation functions. Zero dependencies on React, Supabase, or UI.
// All scoring tables sourced from official IRCC CRS criteria.
// Maximum possible score: 1,200
// ============================================================================

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface LanguageScores {
  listening: number
  reading: number
  writing: number
  speaking: number
}

export interface CrsInput {
  // Applicant core
  age: number | null
  educationLevel: string
  hasCanadianEducation: boolean
  canadianEducationYears: string // 'none' | '1_2_years' | '3_plus_years'

  // First official language (CLB levels 0-12)
  firstLanguageTestType: string // for display only
  firstLanguage: LanguageScores

  // Second official language (CLB levels 0 = none)
  hasSecondLanguage: boolean
  secondLanguage: LanguageScores

  // Work experience
  canadianWorkExperienceYears: number
  foreignWorkExperienceYears: number
  hasTradeCertificate: boolean

  // Spouse
  hasSpouse: boolean
  spouseEducationLevel: string
  spouseLanguage: LanguageScores
  spouseCanadianWorkExperienceYears: number

  // Additional
  hasProvincialNomination: boolean
  jobOfferNocTeer: string
  hasSiblingInCanada: boolean
}

export interface CrsBreakdown {
  coreHumanCapital: {
    age: number
    education: number
    firstLanguage: number
    secondLanguage: number
    canadianWorkExperience: number
    subtotal: number
    max: number
  }
  spouseFactors: {
    education: number
    language: number
    canadianWorkExperience: number
    subtotal: number
    max: number
  }
  skillTransferability: {
    educationLanguage: number
    educationCanadianWork: number
    foreignWorkLanguage: number
    foreignWorkCanadianWork: number
    tradeCertificateLanguage: number
    subtotal: number
    max: number
  }
  additionalPoints: {
    provincialNomination: number
    jobOffer: number
    canadianEducation: number
    frenchLanguageBonus: number
    siblingInCanada: number
    subtotal: number
    max: number
  }
  total: number
}

// ─── Default Input ──────────────────────────────────────────────────────────────

export const DEFAULT_CRS_INPUT: CrsInput = {
  age: null,
  educationLevel: 'less_than_secondary',
  hasCanadianEducation: false,
  canadianEducationYears: 'none',
  firstLanguageTestType: '',
  firstLanguage: { listening: 0, reading: 0, writing: 0, speaking: 0 },
  hasSecondLanguage: false,
  secondLanguage: { listening: 0, reading: 0, writing: 0, speaking: 0 },
  canadianWorkExperienceYears: 0,
  foreignWorkExperienceYears: 0,
  hasTradeCertificate: false,
  hasSpouse: false,
  spouseEducationLevel: 'less_than_secondary',
  spouseLanguage: { listening: 0, reading: 0, writing: 0, speaking: 0 },
  spouseCanadianWorkExperienceYears: 0,
  hasProvincialNomination: false,
  jobOfferNocTeer: 'none',
  hasSiblingInCanada: false,
}

// ─── Age Points ─────────────────────────────────────────────────────────────────
// [age]: [withoutSpouse, withSpouse]

const AGE_POINTS: Record<number, [number, number]> = {
  17: [0, 0],
  18: [99, 90],
  19: [105, 95],
  20: [110, 100],
  21: [110, 100],
  22: [110, 100],
  23: [110, 100],
  24: [110, 100],
  25: [110, 100],
  26: [110, 100],
  27: [110, 100],
  28: [110, 100],
  29: [110, 100],
  30: [105, 95],
  31: [99, 90],
  32: [94, 85],
  33: [88, 80],
  34: [83, 75],
  35: [77, 70],
  36: [72, 65],
  37: [66, 60],
  38: [61, 55],
  39: [55, 50],
  40: [50, 45],
  41: [39, 35],
  42: [28, 25],
  43: [17, 15],
  44: [6, 5],
}

function calcAgePoints(age: number | null, hasSpouse: boolean): number {
  if (age === null || age < 17 || age >= 45) return 0
  const entry = AGE_POINTS[age]
  if (!entry) return 0
  return hasSpouse ? entry[1] : entry[0]
}

// ─── Education Points ───────────────────────────────────────────────────────────
// [level]: [withoutSpouse, withSpouse]

const EDUCATION_POINTS: Record<string, [number, number]> = {
  less_than_secondary: [0, 0],
  secondary: [30, 28],
  one_year_post_secondary: [90, 84],
  two_year_post_secondary: [98, 91],
  bachelors_3year: [120, 112],
  two_or_more_credentials: [128, 119],
  masters: [135, 126],
  phd: [150, 140],
}

function calcEducationPoints(level: string, hasSpouse: boolean): number {
  const entry = EDUCATION_POINTS[level]
  if (!entry) return 0
  return hasSpouse ? entry[1] : entry[0]
}

// ─── First Official Language Points ─────────────────────────────────────────────
// Per ability. CLB level → [withoutSpouse, withSpouse]

const FIRST_LANG_POINTS: Record<number, [number, number]> = {
  0: [0, 0],
  1: [0, 0],
  2: [0, 0],
  3: [0, 0],
  4: [6, 6],
  5: [6, 6],
  6: [9, 8],
  7: [17, 16],
  8: [23, 22],
  9: [31, 29],
  10: [34, 32],
  11: [34, 32],
  12: [34, 32],
}

function calcFirstLanguagePoints(clb: LanguageScores, hasSpouse: boolean): number {
  let total = 0
  for (const ability of ['listening', 'reading', 'writing', 'speaking'] as const) {
    const level = Math.min(Math.max(Math.floor(clb[ability]), 0), 12)
    const entry = FIRST_LANG_POINTS[level]
    total += entry ? (hasSpouse ? entry[1] : entry[0]) : 0
  }
  return total
}

// ─── Second Official Language Points ────────────────────────────────────────────
// Per ability. CLB level → points (same regardless of spouse)

const SECOND_LANG_POINTS: Record<number, number> = {
  0: 0, 1: 0, 2: 0, 3: 0, 4: 0,
  5: 1, 6: 1,
  7: 3, 8: 3,
  9: 6, 10: 6, 11: 6, 12: 6,
}

function calcSecondLanguagePoints(clb: LanguageScores, hasSpouse: boolean): number {
  // Max: 24 without spouse, 22 with spouse
  const maxTotal = hasSpouse ? 22 : 24
  let total = 0
  for (const ability of ['listening', 'reading', 'writing', 'speaking'] as const) {
    const level = Math.min(Math.max(Math.floor(clb[ability]), 0), 12)
    total += SECOND_LANG_POINTS[level] ?? 0
  }
  return Math.min(total, maxTotal)
}

// ─── Canadian Work Experience Points ────────────────────────────────────────────
// years → [withoutSpouse, withSpouse]

const CANADIAN_WORK_POINTS: Record<number, [number, number]> = {
  0: [0, 0],
  1: [40, 35],
  2: [53, 46],
  3: [64, 56],
  4: [72, 63],
  5: [80, 70],
}

function calcCanadianWorkPoints(years: number, hasSpouse: boolean): number {
  const capped = Math.min(Math.max(Math.floor(years), 0), 5)
  const entry = CANADIAN_WORK_POINTS[capped]
  if (!entry) return 0
  return hasSpouse ? entry[1] : entry[0]
}

// ─── Spouse Factor Points ───────────────────────────────────────────────────────

const SPOUSE_EDUCATION_POINTS: Record<string, number> = {
  less_than_secondary: 0,
  secondary: 2,
  one_year_post_secondary: 6,
  two_year_post_secondary: 7,
  bachelors_3year: 8,
  two_or_more_credentials: 9,
  masters: 10,
  phd: 10,
}

function calcSpouseEducationPoints(level: string): number {
  return SPOUSE_EDUCATION_POINTS[level] ?? 0
}

// Spouse language: per ability CLB → points
const SPOUSE_LANG_POINTS: Record<number, number> = {
  0: 0, 1: 0, 2: 0, 3: 0, 4: 0,
  5: 1, 6: 1,
  7: 3, 8: 3,
  9: 5, 10: 5, 11: 5, 12: 5,
}

function calcSpouseLanguagePoints(clb: LanguageScores): number {
  let total = 0
  for (const ability of ['listening', 'reading', 'writing', 'speaking'] as const) {
    const level = Math.min(Math.max(Math.floor(clb[ability]), 0), 12)
    total += SPOUSE_LANG_POINTS[level] ?? 0
  }
  return Math.min(total, 20)
}

const SPOUSE_CANADIAN_WORK_POINTS: Record<number, number> = {
  0: 0,
  1: 5,
  2: 7,
  3: 8,
  4: 9,
  5: 10,
}

function calcSpouseCanadianWorkPoints(years: number): number {
  const capped = Math.min(Math.max(Math.floor(years), 0), 5)
  return SPOUSE_CANADIAN_WORK_POINTS[capped] ?? 0
}

// ─── Skill Transferability ──────────────────────────────────────────────────────
// Each combination yields 0, 13, 25, or 50 points. Total capped at 100.

function getEducationTier(level: string): number {
  // 0 = none/secondary, 1 = one/two year, 2 = bachelor+
  switch (level) {
    case 'less_than_secondary':
    case 'secondary':
      return 0
    case 'one_year_post_secondary':
    case 'two_year_post_secondary':
      return 1
    default:
      return 2 // bachelors_3year, two_or_more_credentials, masters, phd
  }
}

function getLanguageTier(clb: LanguageScores): number {
  // Based on highest CLB among all 4 abilities  -  but IRCC uses minimum of all 4
  // Actually per IRCC: "CLB 7 or more on all first official language abilities"
  const min = Math.min(clb.listening, clb.reading, clb.writing, clb.speaking)
  if (min >= 9) return 2
  if (min >= 7) return 1
  return 0
}

function getCanadianWorkTier(years: number): number {
  if (years >= 2) return 2
  if (years >= 1) return 1
  return 0
}

function getForeignWorkTier(years: number): number {
  if (years >= 3) return 2
  if (years >= 1) return 1
  return 0
}

// Combination matrix: [factorA_tier][factorB_tier] → points
const TRANSFERABILITY_MATRIX: number[][] = [
  // B=0  B=1  B=2
  [0,    0,    0],   // A=0
  [0,   13,   25],   // A=1
  [0,   25,   50],   // A=2
]

function lookupTransferability(tierA: number, tierB: number): number {
  return TRANSFERABILITY_MATRIX[Math.min(tierA, 2)]?.[Math.min(tierB, 2)] ?? 0
}

function calcSkillTransferability(input: CrsInput) {
  const eduTier = getEducationTier(input.educationLevel)
  const langTier = getLanguageTier(input.firstLanguage)
  const cdnWorkTier = getCanadianWorkTier(input.canadianWorkExperienceYears)
  const foreignWorkTier = getForeignWorkTier(input.foreignWorkExperienceYears)
  const tradeTier = input.hasTradeCertificate ? 2 : 0

  const educationLanguage = lookupTransferability(eduTier, langTier)
  const educationCanadianWork = lookupTransferability(eduTier, cdnWorkTier)
  const foreignWorkLanguage = lookupTransferability(foreignWorkTier, langTier)
  const foreignWorkCanadianWork = lookupTransferability(foreignWorkTier, cdnWorkTier)
  // Trade certificate: uses language tier but CLB 5+ counts as tier 1
  const tradeLangTier = Math.min(input.firstLanguage.listening, input.firstLanguage.reading, input.firstLanguage.writing, input.firstLanguage.speaking) >= 5 ? (langTier >= 1 ? langTier : 1) : 0
  const tradeCertificateLanguage = input.hasTradeCertificate ? lookupTransferability(tradeTier, tradeLangTier) : 0

  const rawTotal = educationLanguage + educationCanadianWork + foreignWorkLanguage + foreignWorkCanadianWork + tradeCertificateLanguage
  const subtotal = Math.min(rawTotal, 100)

  return {
    educationLanguage,
    educationCanadianWork,
    foreignWorkLanguage,
    foreignWorkCanadianWork,
    tradeCertificateLanguage,
    subtotal,
    max: 100,
  }
}

// ─── Additional Points ──────────────────────────────────────────────────────────

function calcAdditionalPoints(input: CrsInput) {
  const provincialNomination = input.hasProvincialNomination ? 600 : 0

  let jobOffer = 0
  switch (input.jobOfferNocTeer) {
    case 'teer_0_1': jobOffer = 200; break
    case 'teer_2_3': jobOffer = 50; break
    case 'teer_4_5': jobOffer = 0; break
    default: jobOffer = 0
  }

  let canadianEducation = 0
  switch (input.canadianEducationYears) {
    case '1_2_years': canadianEducation = 15; break
    case '3_plus_years': canadianEducation = 30; break
    default: canadianEducation = 0
  }

  // French language bonus: CLB 7+ in all 4 French abilities
  // We approximate: if second language has all abilities >= 7, treat as French bonus
  // In a real scenario, we'd track which language is French explicitly
  // For now: second language CLB 7+ all = 25 points, + if first lang also CLB 5+ = additional 25
  let frenchLanguageBonus = 0
  if (input.hasSecondLanguage) {
    const secondMin = Math.min(
      input.secondLanguage.listening,
      input.secondLanguage.reading,
      input.secondLanguage.writing,
      input.secondLanguage.speaking,
    )
    if (secondMin >= 7) {
      frenchLanguageBonus = 25
      const firstMin = Math.min(
        input.firstLanguage.listening,
        input.firstLanguage.reading,
        input.firstLanguage.writing,
        input.firstLanguage.speaking,
      )
      if (firstMin >= 5) {
        frenchLanguageBonus = 50
      }
    }
  }

  const siblingInCanada = input.hasSiblingInCanada ? 15 : 0

  const subtotal = provincialNomination + jobOffer + canadianEducation + frenchLanguageBonus + siblingInCanada

  return {
    provincialNomination,
    jobOffer,
    canadianEducation,
    frenchLanguageBonus,
    siblingInCanada,
    subtotal,
    max: 600,
  }
}

// ─── Main Calculation ───────────────────────────────────────────────────────────

export function calculateCrs(input: CrsInput): CrsBreakdown {
  const { hasSpouse } = input

  // A. Core / Human Capital
  const agePoints = calcAgePoints(input.age, hasSpouse)
  const educationPoints = calcEducationPoints(input.educationLevel, hasSpouse)
  const firstLangPoints = calcFirstLanguagePoints(input.firstLanguage, hasSpouse)
  const secondLangPoints = input.hasSecondLanguage
    ? calcSecondLanguagePoints(input.secondLanguage, hasSpouse)
    : 0
  const cdnWorkPoints = calcCanadianWorkPoints(input.canadianWorkExperienceYears, hasSpouse)
  const coreSubtotal = agePoints + educationPoints + firstLangPoints + secondLangPoints + cdnWorkPoints
  const coreMax = hasSpouse ? 460 : 500

  // B. Spouse / Partner
  let spouseEdu = 0
  let spouseLang = 0
  let spouseCdnWork = 0
  if (hasSpouse) {
    spouseEdu = calcSpouseEducationPoints(input.spouseEducationLevel)
    spouseLang = calcSpouseLanguagePoints(input.spouseLanguage)
    spouseCdnWork = calcSpouseCanadianWorkPoints(input.spouseCanadianWorkExperienceYears)
  }
  const spouseSubtotal = spouseEdu + spouseLang + spouseCdnWork
  const spouseMax = hasSpouse ? 40 : 0

  // C. Skill Transferability
  const transferability = calcSkillTransferability(input)

  // D. Additional Points
  const additional = calcAdditionalPoints(input)

  const total = coreSubtotal + spouseSubtotal + transferability.subtotal + additional.subtotal

  return {
    coreHumanCapital: {
      age: agePoints,
      education: educationPoints,
      firstLanguage: firstLangPoints,
      secondLanguage: secondLangPoints,
      canadianWorkExperience: cdnWorkPoints,
      subtotal: coreSubtotal,
      max: coreMax,
    },
    spouseFactors: {
      education: spouseEdu,
      language: spouseLang,
      canadianWorkExperience: spouseCdnWork,
      subtotal: spouseSubtotal,
      max: spouseMax,
    },
    skillTransferability: transferability,
    additionalPoints: additional,
    total,
  }
}

// ─── CLB Conversion Helpers ─────────────────────────────────────────────────────

// IELTS General Training → CLB (per ability)
// Returns CLB level (4-12) based on IELTS band score

const IELTS_TO_CLB_LISTENING: [number, number][] = [
  [8.5, 10], [8.0, 9], [7.5, 8], [6.0, 7], [5.5, 6], [5.0, 5], [4.5, 4],
]

const IELTS_TO_CLB_READING: [number, number][] = [
  [8.0, 10], [7.0, 9], [6.5, 8], [6.0, 7], [5.0, 6], [4.0, 5], [3.5, 4],
]

const IELTS_TO_CLB_WRITING: [number, number][] = [
  [7.5, 10], [7.0, 9], [6.5, 8], [6.0, 7], [5.5, 6], [5.0, 5], [4.0, 4],
]

const IELTS_TO_CLB_SPEAKING: [number, number][] = [
  [7.5, 10], [7.0, 9], [6.5, 8], [6.0, 7], [5.5, 6], [5.0, 5], [4.0, 4],
]

function ieltsLookup(table: [number, number][], score: number): number {
  for (const [minScore, clb] of table) {
    if (score >= minScore) return clb
  }
  return 0
}

export function ieltsToClb(ability: 'listening' | 'reading' | 'writing' | 'speaking', score: number): number {
  switch (ability) {
    case 'listening': return ieltsLookup(IELTS_TO_CLB_LISTENING, score)
    case 'reading': return ieltsLookup(IELTS_TO_CLB_READING, score)
    case 'writing': return ieltsLookup(IELTS_TO_CLB_WRITING, score)
    case 'speaking': return ieltsLookup(IELTS_TO_CLB_SPEAKING, score)
  }
}

// CELPIP → CLB: Direct 1:1 mapping
export function celpipToClb(score: number): number {
  if (score >= 10) return 10
  if (score >= 4) return score
  return 0
}

// TEF Canada → CLB (per ability)
const TEF_TO_CLB_LISTENING: [number, number][] = [
  [316, 10], [298, 9], [280, 8], [249, 7], [217, 6], [181, 5], [145, 4],
]

const TEF_TO_CLB_READING: [number, number][] = [
  [263, 10], [248, 9], [233, 8], [207, 7], [181, 6], [151, 5], [121, 4],
]

const TEF_TO_CLB_WRITING: [number, number][] = [
  [393, 10], [371, 9], [349, 8], [310, 7], [271, 6], [226, 5], [181, 4],
]

const TEF_TO_CLB_SPEAKING: [number, number][] = [
  [393, 10], [371, 9], [349, 8], [310, 7], [271, 6], [226, 5], [181, 4],
]

export function tefToClb(ability: 'listening' | 'reading' | 'writing' | 'speaking', score: number): number {
  let table: [number, number][]
  switch (ability) {
    case 'listening': table = TEF_TO_CLB_LISTENING; break
    case 'reading': table = TEF_TO_CLB_READING; break
    case 'writing': table = TEF_TO_CLB_WRITING; break
    case 'speaking': table = TEF_TO_CLB_SPEAKING; break
  }
  for (const [minScore, clb] of table) {
    if (score >= minScore) return clb
  }
  return 0
}

// ─── Pre-fill from Immigration Data ─────────────────────────────────────────────

/**
 * Best-effort pre-fill CrsInput from existing matter_immigration record.
 * Returns a partial object to merge with DEFAULT_CRS_INPUT.
 */
export function prefillFromImmigration(immigration: {
  date_of_birth?: string | null
  education_credential?: string | null
  language_test_type?: string | null
  language_test_scores?: { listening?: number; reading?: number; writing?: number; speaking?: number } | null
  canadian_work_experience_years?: number | null
  work_experience_years?: number | null
  spouse_included?: boolean | null
  provincial_nominee_program?: string | null
  job_offer_noc?: string | null
}): Partial<CrsInput> {
  const result: Partial<CrsInput> = {}

  // Age from DOB
  if (immigration.date_of_birth) {
    const dob = new Date(immigration.date_of_birth)
    const now = new Date()
    let age = now.getFullYear() - dob.getFullYear()
    const monthDiff = now.getMonth() - dob.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
      age--
    }
    result.age = age
  }

  // Education: best-effort mapping from free-text credential
  if (immigration.education_credential) {
    const cred = immigration.education_credential.toLowerCase()
    if (cred.includes('phd') || cred.includes('doctoral') || cred.includes('doctorate')) {
      result.educationLevel = 'phd'
    } else if (cred.includes('master')) {
      result.educationLevel = 'masters'
    } else if (cred.includes('bachelor') || cred.includes('3-year') || cred.includes('3 year')) {
      result.educationLevel = 'bachelors_3year'
    } else if (cred.includes('two') || cred.includes('2-year') || cred.includes('2 year') || cred.includes('diploma')) {
      result.educationLevel = 'two_year_post_secondary'
    } else if (cred.includes('one') || cred.includes('1-year') || cred.includes('1 year') || cred.includes('certificate')) {
      result.educationLevel = 'one_year_post_secondary'
    } else if (cred.includes('secondary') || cred.includes('high school')) {
      result.educationLevel = 'secondary'
    }
  }

  // Language scores → CLB
  if (immigration.language_test_type && immigration.language_test_scores) {
    const scores = immigration.language_test_scores
    const testType = immigration.language_test_type.toLowerCase()
    result.firstLanguageTestType = testType

    if (testType === 'ielts_general' || testType === 'ielts_academic') {
      result.firstLanguage = {
        listening: ieltsToClb('listening', scores.listening ?? 0),
        reading: ieltsToClb('reading', scores.reading ?? 0),
        writing: ieltsToClb('writing', scores.writing ?? 0),
        speaking: ieltsToClb('speaking', scores.speaking ?? 0),
      }
    } else if (testType === 'celpip') {
      result.firstLanguage = {
        listening: celpipToClb(scores.listening ?? 0),
        reading: celpipToClb(scores.reading ?? 0),
        writing: celpipToClb(scores.writing ?? 0),
        speaking: celpipToClb(scores.speaking ?? 0),
      }
    } else if (testType === 'tef' || testType === 'tcf') {
      result.firstLanguage = {
        listening: tefToClb('listening', scores.listening ?? 0),
        reading: tefToClb('reading', scores.reading ?? 0),
        writing: tefToClb('writing', scores.writing ?? 0),
        speaking: tefToClb('speaking', scores.speaking ?? 0),
      }
    }
  }

  // Work experience
  if (immigration.canadian_work_experience_years != null) {
    result.canadianWorkExperienceYears = Math.min(immigration.canadian_work_experience_years, 5)
  }
  if (immigration.work_experience_years != null) {
    result.foreignWorkExperienceYears = Math.min(immigration.work_experience_years, 5)
  }

  // Spouse
  if (immigration.spouse_included != null) {
    result.hasSpouse = immigration.spouse_included
  }

  // Provincial nomination
  if (immigration.provincial_nominee_program) {
    result.hasProvincialNomination = true
  }

  return result
}
