/**
 * Translation Bridge  -  Neural Mirror Mapping (Directive 18.0)
 *
 * When a client submits a fact in Mandarin (or any non-EN/FR language),
 * the Norva Ear stores the original string but the Lawyer's Intelligence Tab
 * displays the English (or French) translation.
 *
 * This bridge resolves the "display language" for any given data point
 * based on the viewer's role:
 *   - Staff/Lawyer → Firm's official language (en or fr, from user preference)
 *   - Client → Original language + translation note
 *
 * The original is ALWAYS preserved for audit. This module only controls
 * which version is *displayed* in each context.
 */

import type { AdminLocaleCode } from '@/lib/i18n/config'

// ── Types ────────────────────────────────────────────────────────────────────

export interface DualLanguageField {
  /** Original text in source language */
  original: string
  /** Source language code */
  sourceLanguage: string
  /** English translation (always available) */
  english: string
  /** French translation (available if firm prefers FR) */
  french?: string
}

export interface BridgeResolvedField {
  /** Text to display in the current view */
  displayText: string
  /** Whether this is a translation (vs. original) */
  isTranslated: boolean
  /** Original text for tooltip/audit */
  originalText: string
  /** Source language label */
  sourceLanguageLabel: string
}

// ── Firm language preference ────────────────────────────────────────────────

/**
 * Get the firm's official display language.
 * Defaults to 'en'. Overridden by tenant settings or user preference.
 */
export function getFirmDisplayLanguage(
  userPreference?: string | null,
  tenantPreference?: string | null,
): AdminLocaleCode {
  // User preference takes priority, then tenant, then default
  const pref = userPreference ?? tenantPreference ?? 'en'
  return pref === 'fr' ? 'fr' : 'en'
}

// ── Bridge resolver ─────────────────────────────────────────────────────────

/**
 * Resolve which language version to display for a dual-language field.
 *
 * For lawyer/staff views:
 *   - If firm language is 'en': show English translation
 *   - If firm language is 'fr': show French translation (or English fallback)
 *   - Always include original in metadata for audit tooltip
 *
 * For client views:
 *   - Show original text in their language
 */
export function resolveForLawyerView(
  field: DualLanguageField,
  firmLanguage: AdminLocaleCode = 'en',
): BridgeResolvedField {
  const LANGUAGE_LABELS: Record<string, string> = {
    en: 'English', fr: 'French', es: 'Spanish', pa: 'Punjabi',
    zh: 'Mandarin', ar: 'Arabic', hi: 'Hindi', ur: 'Urdu',
    tl: 'Tagalog', pt: 'Portuguese', ko: 'Korean', fa: 'Farsi',
    vi: 'Vietnamese', uk: 'Ukrainian', bn: 'Bengali',
  }

  // If source is already the firm language, no translation needed
  if (field.sourceLanguage === firmLanguage) {
    return {
      displayText: field.original,
      isTranslated: false,
      originalText: field.original,
      sourceLanguageLabel: LANGUAGE_LABELS[field.sourceLanguage] ?? field.sourceLanguage,
    }
  }

  // If source is English and firm wants French
  if (field.sourceLanguage === 'en' && firmLanguage === 'fr') {
    return {
      displayText: field.french ?? field.english,
      isTranslated: !!field.french,
      originalText: field.original,
      sourceLanguageLabel: 'English',
    }
  }

  // Default: show English translation (or French if available and preferred)
  const displayText = firmLanguage === 'fr' && field.french
    ? field.french
    : field.english

  return {
    displayText,
    isTranslated: true,
    originalText: field.original,
    sourceLanguageLabel: LANGUAGE_LABELS[field.sourceLanguage] ?? field.sourceLanguage,
  }
}

/**
 * Resolve for client view  -  shows original language.
 */
export function resolveForClientView(
  field: DualLanguageField,
): BridgeResolvedField {
  const LANGUAGE_LABELS: Record<string, string> = {
    en: 'English', fr: 'French', es: 'Spanish', pa: 'Punjabi',
    zh: 'Mandarin', ar: 'Arabic', hi: 'Hindi', ur: 'Urdu',
    tl: 'Tagalog', pt: 'Portuguese', ko: 'Korean', fa: 'Farsi',
    vi: 'Vietnamese', uk: 'Ukrainian', bn: 'Bengali',
  }

  return {
    displayText: field.original,
    isTranslated: false,
    originalText: field.original,
    sourceLanguageLabel: LANGUAGE_LABELS[field.sourceLanguage] ?? field.sourceLanguage,
  }
}

/**
 * Build a DualLanguageField from a Norva Ear session's stored data.
 */
export function buildDualLanguageField(
  transcript: string | null,
  transcriptEnglish: string | null,
  sourceLanguage: string | null,
): DualLanguageField {
  return {
    original: transcript ?? '',
    sourceLanguage: sourceLanguage ?? 'en',
    english: transcriptEnglish ?? transcript ?? '',
    // French translation would be added by a separate translation step if needed
  }
}
