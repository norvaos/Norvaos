/**
 * Polyglot Code-Switch  -  Directive 15.0 Protocol 3
 *
 * Neural Translation Layer for Norva Ear that handles code-switching.
 *
 * When a client speaks a mix of languages (e.g., Taglish = Tagalog + English,
 * Hinglish = Hindi + English, Franglais = French + English), the system:
 *
 *   1. Detects language segments within a single utterance
 *   2. Tags each segment with its language code
 *   3. Anchors all segments into a unified English legal draft
 *   4. Preserves original language for fact-anchor attribution
 *
 * This is the processing layer between raw transcription and fact extraction.
 */

import type { LocaleCode } from './config'

// ── Types ────────────────────────────────────────────────────────────────────

export interface LanguageSegment {
  /** The text content of this segment */
  text: string
  /** Detected language code */
  language: LocaleCode
  /** Confidence score (0-1) */
  confidence: number
  /** Start index in the original transcript */
  startIdx: number
  /** End index in the original transcript */
  endIdx: number
}

export interface CodeSwitchResult {
  /** Original full transcript */
  originalText: string
  /** Detected language segments */
  segments: LanguageSegment[]
  /** Primary language (most text volume) */
  primaryLanguage: LocaleCode
  /** Secondary languages detected */
  secondaryLanguages: LocaleCode[]
  /** Whether code-switching was detected */
  isCodeSwitched: boolean
  /** Unified English translation */
  englishTranslation: string
  /** Language pair label (e.g., "Taglish", "Hinglish") */
  mixLabel: string | null
}

export interface FactExtractionInput {
  /** The code-switch result to extract facts from */
  codeSwitchResult: CodeSwitchResult
  /** Matter context for legal relevance scoring */
  matterType?: string
}

// ── Known Code-Switch Pairs ──────────────────────────────────────────────────

const CODE_SWITCH_LABELS: Record<string, string> = {
  'tl+en': 'Taglish',
  'en+tl': 'Taglish',
  'hi+en': 'Hinglish',
  'en+hi': 'Hinglish',
  'fr+en': 'Franglais',
  'en+fr': 'Franglais',
  'ur+en': 'Urdu-English',
  'en+ur': 'Urdu-English',
  'pa+en': 'Punjabi-English',
  'en+pa': 'Punjabi-English',
  'es+en': 'Spanglish',
  'en+es': 'Spanglish',
  'bn+en': 'Banglish',
  'en+bn': 'Banglish',
  'ar+en': 'Arabic-English',
  'en+ar': 'Arabic-English',
  'fa+en': 'Finglish',
  'en+fa': 'Finglish',
  'ko+en': 'Konglish',
  'en+ko': 'Konglish',
  'vi+en': 'Vietnamese-English',
  'en+vi': 'Vietnamese-English',
  'uk+en': 'Ukrainian-English',
  'en+uk': 'Ukrainian-English',
}

// ── Code-Switch Detection ────────────────────────────────────────────────────

/**
 * Get the mix label for a code-switched pair.
 */
export function getCodeSwitchLabel(primary: LocaleCode, secondary: LocaleCode): string | null {
  return CODE_SWITCH_LABELS[`${primary}+${secondary}`] ?? null
}

/**
 * Build the system prompt addendum for the AI to handle code-switching.
 *
 * Injected into the Norva Ear transcription/translation pipeline when
 * multiple languages are detected in a single session.
 */
export function buildCodeSwitchPrompt(detectedLanguages: LocaleCode[]): string {
  if (detectedLanguages.length <= 1) return ''

  const langs = detectedLanguages.join(', ')
  const mixLabel = detectedLanguages.length === 2
    ? getCodeSwitchLabel(detectedLanguages[0], detectedLanguages[1])
    : null

  return `
## CODE-SWITCHING DETECTED
The client is speaking in multiple languages${mixLabel ? ` (${mixLabel})` : ''}: ${langs}.

INSTRUCTIONS:
1. Transcribe each segment in its original language.
2. Tag each segment with [LANG:xx] markers (e.g., [LANG:tl], [LANG:en]).
3. Provide a unified English translation that preserves legal meaning.
4. When extracting facts, anchor BOTH the original language quote AND the English translation.
5. For legal terms spoken in a non-English language, use the proper legal-contextual equivalent.
6. Preserve emotional context and emphasis from the original language.

Example:
  Original: "[LANG:tl]Sabi ng nanay ko,[LANG:en] my father's bakery was destroyed [LANG:tl]noong bagyong Yolanda."
  English: "My mother said my father's bakery was destroyed during Typhoon Hainan (Yolanda)."
  Fact: { sourceQuote: "Sabi ng nanay ko, my father's bakery was destroyed noong bagyong Yolanda", englishQuote: "..." }
`.trim()
}

// ── Segment Parser ───────────────────────────────────────────────────────────

/**
 * Parse language-tagged transcript into segments.
 *
 * Input format: "[LANG:tl]text here[LANG:en]more text"
 * Output: array of LanguageSegment objects
 */
export function parseLanguageSegments(taggedTranscript: string): LanguageSegment[] {
  const segments: LanguageSegment[] = []
  const regex = /\[LANG:(\w{2})\]([\s\S]*?)(?=\[LANG:\w{2}\]|$)/g

  let match: RegExpExecArray | null
  while ((match = regex.exec(taggedTranscript)) !== null) {
    const lang = match[1] as LocaleCode
    const text = match[2].trim()
    if (!text) continue

    segments.push({
      text,
      language: lang,
      confidence: 0.9,
      startIdx: match.index,
      endIdx: match.index + match[0].length,
    })
  }

  // If no tags found, treat entire text as single English segment
  if (segments.length === 0 && taggedTranscript.trim()) {
    segments.push({
      text: taggedTranscript.trim(),
      language: 'en',
      confidence: 1.0,
      startIdx: 0,
      endIdx: taggedTranscript.length,
    })
  }

  return segments
}

/**
 * Analyse segments to determine primary/secondary languages and mix type.
 */
export function analyseCodeSwitch(
  segments: LanguageSegment[],
  englishTranslation: string,
  originalText: string,
): CodeSwitchResult {
  // Count characters per language
  const langVolume = new Map<LocaleCode, number>()
  for (const seg of segments) {
    langVolume.set(seg.language, (langVolume.get(seg.language) ?? 0) + seg.text.length)
  }

  // Sort by volume
  const sorted = [...langVolume.entries()].sort((a, b) => b[1] - a[1])
  const primaryLanguage = sorted[0]?.[0] ?? 'en'
  const secondaryLanguages = sorted.slice(1).map(([code]) => code)
  const isCodeSwitched = secondaryLanguages.length > 0

  const mixLabel = isCodeSwitched && secondaryLanguages.length === 1
    ? getCodeSwitchLabel(primaryLanguage, secondaryLanguages[0])
    : isCodeSwitched
      ? `${sorted.length}-language mix`
      : null

  return {
    originalText,
    segments,
    primaryLanguage,
    secondaryLanguages,
    isCodeSwitched,
    englishTranslation,
    mixLabel,
  }
}

/**
 * Build a fact-anchor attribution that preserves both original and English.
 *
 * When the source quote is in a non-English language, the fact anchor
 * shows both the original and the English translation.
 */
export function buildBilingualFactAnchor(
  originalQuote: string,
  originalLanguage: LocaleCode,
  englishQuote: string,
  sessionTitle: string,
): {
  sourceQuote: string
  englishQuote: string
  language: LocaleCode
  sessionTitle: string
  displayQuote: string
} {
  const isEnglish = originalLanguage === 'en'

  return {
    sourceQuote: originalQuote,
    englishQuote: isEnglish ? originalQuote : englishQuote,
    language: originalLanguage,
    sessionTitle,
    // Display: show original with English translation if non-English
    displayQuote: isEnglish
      ? originalQuote
      : `"${originalQuote}"  -  [${englishQuote}]`,
  }
}
