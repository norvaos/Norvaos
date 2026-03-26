/**
 * Norva Ear  -  Neural Translation Layer (Directive 14.0, Tier 2)
 *
 * When a consultation is conducted in a non-English language, this service:
 *   1. Preserves the original transcript verbatim
 *   2. Provides a professional English translation for legal drafting
 *   3. Stores both versions so Audit-Mirror can verify "Intent"
 *
 * Uses Claude for legally-accurate translation that preserves nuance,
 * not just literal word-for-word conversion.
 *
 * Integrity: Both original quote and translation are stored per fact,
 * maintaining an audit trail for LSO Rule 3.2-2 compliance.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { NorvaEarLanguageCode } from '@/lib/i18n/config'

// ── Types ────────────────────────────────────────────────────────────────────

export interface TranslatedTranscript {
  /** Original transcript in source language */
  original: string
  /** English translation for legal use */
  englishTranslation: string
  /** Source language code */
  sourceLanguage: NorvaEarLanguageCode
  /** Language name for display */
  sourceLanguageLabel: string
  /** Whether translation was performed (false if already English) */
  wasTranslated: boolean
}

export interface TranslatedFact {
  /** Fact value (always in English) */
  value: string
  /** Original quote in source language */
  originalQuote: string
  /** English translation of the quote */
  translatedQuote: string
  /** Whether the quote was translated */
  wasTranslated: boolean
}

// ── Language labels ─────────────────────────────────────────────────────────

const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  fr: 'French',
  es: 'Spanish',
  pa: 'Punjabi',
  zh: 'Mandarin Chinese',
  ar: 'Arabic',
  hi: 'Hindi',
  ur: 'Urdu',
  tl: 'Tagalog',
  pt: 'Portuguese',
  ko: 'Korean',
  fa: 'Farsi',
}

// ── Translation ─────────────────────────────────────────────────────────────

/**
 * Translate a consultation transcript to English for legal drafting.
 *
 * If the source language is English, returns the transcript as-is.
 * Otherwise, performs a legally-aware translation preserving:
 *   - Legal terminology accuracy
 *   - Temporal references (dates, durations)
 *   - Proper nouns (names, places, institutions)
 *   - Emotional nuance (important for H&C cases)
 */
export async function translateTranscript(
  transcript: string,
  sourceLanguage: NorvaEarLanguageCode,
): Promise<TranslatedTranscript> {
  const langLabel = LANGUAGE_LABELS[sourceLanguage] ?? sourceLanguage

  // No translation needed for English
  if (sourceLanguage === 'en') {
    return {
      original: transcript,
      englishTranslation: transcript,
      sourceLanguage,
      sourceLanguageLabel: 'English',
      wasTranslated: false,
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('[Norva Ear Translation] ANTHROPIC_API_KEY is not set')
    return {
      original: transcript,
      englishTranslation: '[TRANSLATION UNAVAILABLE  -  API key not configured]',
      sourceLanguage,
      sourceLanguageLabel: langLabel,
      wasTranslated: false,
    }
  }

  const client = new Anthropic({ apiKey })

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      system: `You are a professional legal translator specialising in Canadian immigration law. Translate the following ${langLabel} consultation transcript into English.

RULES:
1. Preserve all proper nouns (names, places, institutions) in their original form with English phonetic approximation in parentheses if needed.
2. Translate legal terminology accurately using Canadian legal English equivalents.
3. Preserve temporal references exactly (dates, time periods, deadlines).
4. Maintain the speaker's tone and emotional register  -  this is critical for Humanitarian & Compassionate (H&C) assessments.
5. If a word or phrase has no direct English equivalent, provide the closest legal equivalent and note the original term in brackets.
6. Mark any ambiguous passages with [TRANSLATION NOTE: ...] to flag for lawyer review.
7. Do NOT add, remove, or paraphrase content. Translate everything faithfully.

Output ONLY the English translation, no preamble.`,
      messages: [
        {
          role: 'user',
          content: transcript,
        },
      ],
    })

    const textBlock = response.content.find((block) => block.type === 'text')
    const translation = textBlock?.type === 'text' ? textBlock.text.trim() : ''

    return {
      original: transcript,
      englishTranslation: translation || '[TRANSLATION FAILED]',
      sourceLanguage,
      sourceLanguageLabel: langLabel,
      wasTranslated: true,
    }
  } catch (error) {
    console.error('[Norva Ear Translation] Translation failed:', error)
    return {
      original: transcript,
      englishTranslation: `[TRANSLATION ERROR: ${error instanceof Error ? error.message : 'Unknown error'}]`,
      sourceLanguage,
      sourceLanguageLabel: langLabel,
      wasTranslated: false,
    }
  }
}

/**
 * Detect the language of a transcript using a lightweight Claude call.
 * Returns a language code from the supported set.
 */
export async function detectLanguage(
  text: string,
): Promise<NorvaEarLanguageCode> {
  // Quick heuristic: check for script-specific characters before calling API
  const sample = text.slice(0, 500)

  if (/[\u0600-\u06FF]/.test(sample)) return 'ar' // Arabic script
  if (/[\u0A00-\u0A7F]/.test(sample)) return 'pa' // Gurmukhi (Punjabi)
  if (/[\u4E00-\u9FFF]/.test(sample)) return 'zh' // CJK (Chinese)
  if (/[\u0900-\u097F]/.test(sample)) return 'hi' // Devanagari (Hindi)
  if (/[\uAC00-\uD7AF]/.test(sample)) return 'ko' // Korean
  if (/[\u0600-\u06FF\u0750-\u077F]/.test(sample)) return 'fa' // Extended Arabic (Farsi)

  // For Latin-script languages, check common words
  const lower = sample.toLowerCase()
  if (/\b(le|la|les|est|sont|nous|vous|avec|dans|pour)\b/.test(lower)) return 'fr'
  if (/\b(el|la|los|las|es|son|con|para|por|como)\b/.test(lower)) return 'es'
  if (/\b(o|os|as|com|para|por|como|mais|mas)\b/.test(lower)) return 'pt'

  return 'en' // Default
}
