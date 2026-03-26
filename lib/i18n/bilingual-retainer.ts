/**
 * Bilingual Retainer Configuration (Directive 14.0, Tier 3)
 *
 * Generates retainer agreement metadata for dual-language PDF rendering.
 * When a client's preferred language is French, the system produces
 * an en-fr bilingual retainer with parallel columns.
 *
 * Compliance:
 *   - Language Rights: client cannot claim they didn't understand fees
 *   - LSO Rule 3.2-2: communication in client's language
 */

import type { LocaleCode } from './config'
import { BILINGUAL_PAIRS } from './config'
import { loadDictionary } from './dictionaries'
import type { DictionaryKey } from './dictionaries/en'

// ── Types ────────────────────────────────────────────────────────────────────

export interface BilingualRetainerConfig {
  /** Whether to generate bilingual */
  isBilingual: boolean
  /** Primary language (always English for legal validity) */
  primaryLanguage: LocaleCode
  /** Secondary language for client comprehension */
  secondaryLanguage: LocaleCode | null
  /** Display label (e.g. "English / Français") */
  pairLabel: string
  /** Retainer sections with translations */
  sections: BilingualSection[]
}

export interface BilingualSection {
  key: DictionaryKey
  primary: string
  secondary: string | null
}

// ── Retainer section keys ───────────────────────────────────────────────────

const RETAINER_KEYS: DictionaryKey[] = [
  'legal.retainer_title',
  'legal.retainer_intro',
  'legal.fee_structure',
  'legal.scope_of_services',
  'legal.client_obligations',
  'legal.termination',
  'legal.signature_declaration',
  'legal.witness',
  'legal.date',
  'legal.signature',
]

// ── Builder ─────────────────────────────────────────────────────────────────

/**
 * Build a bilingual retainer configuration for a given client language.
 *
 * If the client's language is English, returns a monolingual config.
 * Otherwise, returns an en-{lang} bilingual config with parallel translations.
 */
export async function buildBilingualRetainerConfig(
  clientLanguage: LocaleCode,
): Promise<BilingualRetainerConfig> {
  const pair = BILINGUAL_PAIRS.find((p) => p.secondary === clientLanguage)

  if (!pair || clientLanguage === 'en') {
    // Monolingual English
    const enDict = await loadDictionary('en')
    return {
      isBilingual: false,
      primaryLanguage: 'en',
      secondaryLanguage: null,
      pairLabel: 'English',
      sections: RETAINER_KEYS.map((key) => ({
        key,
        primary: enDict[key],
        secondary: null,
      })),
    }
  }

  // Bilingual: load both dictionaries
  const [enDict, secDict] = await Promise.all([
    loadDictionary('en'),
    loadDictionary(clientLanguage),
  ])

  return {
    isBilingual: true,
    primaryLanguage: 'en',
    secondaryLanguage: clientLanguage,
    pairLabel: pair.label,
    sections: RETAINER_KEYS.map((key) => ({
      key,
      primary: enDict[key],
      secondary: secDict[key] ?? null,
    })),
  }
}
