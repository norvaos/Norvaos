'use client'

/**
 * PortalInstructions  -  Bulleted list of matter-specific instructions.
 * Two-level system: matter-type defaults (pre-populated) can be overridden
 * per-matter when creating the portal link. Hidden if no instructions configured.
 */

import { getTranslations, type PortalLocale } from '@/lib/utils/portal-translations'

interface PortalInstructionsProps {
  instructions: string
  language: PortalLocale
}

export function PortalInstructions({
  instructions,
  language,
}: PortalInstructionsProps) {
  const tr = getTranslations(language)

  if (!instructions.trim()) return null

  // Split on newlines and filter empty lines
  const lines = instructions
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    // Strip leading bullet characters if present
    .map((line) => line.replace(/^[-•·*]\s*/, ''))

  if (lines.length === 0) return null

  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-blue-700 mb-2">
        {tr.section_instructions ?? tr.instructions_label ?? 'Instructions'}
      </h3>
      <ul className="space-y-1.5">
        {lines.map((line, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-400 shrink-0" />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
