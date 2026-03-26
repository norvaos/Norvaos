'use client'

/**
 * PortalTeamMicroCards  -  High-density, mobile-first team display.
 *
 * Shows Responsible Lawyer + Case Assistant as compact cards with:
 * - Avatar initials (no photo URL needed  -  works universally)
 * - Public-facing contact info only (email, phone)
 * - Privacy Rule: internal Slack/extensions stay masked
 * - Elite mobile layout: single-column stacked, responsive 2-col on sm+
 */

import { cn } from '@/lib/utils'
import { track } from '@/lib/utils/portal-analytics'

// ── Types ────────────────────────────────────────────────────────────────────

interface TeamMember {
  name: string
  role: string
  email?: string
  phone?: string
  roleDescription?: string
}

interface PortalTeamMicroCardsProps {
  lawyer?: TeamMember
  assistant?: TeamMember
  accentColor?: string
}

// ── Avatar Initials ──────────────────────────────────────────────────────────

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// ── Micro Card ───────────────────────────────────────────────────────────────

function MicroCard({
  member,
  accentColor,
}: {
  member: TeamMember
  accentColor: string
}) {
  const initials = getInitials(member.name)

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      {/* Top: Avatar + Name */}
      <div className="flex items-center gap-3">
        <div
          className="w-11 h-11 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 shadow-inner"
          style={{ backgroundColor: accentColor }}
          aria-hidden="true"
        >
          {initials}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">{member.name}</p>
          <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
            {member.role}
          </p>
        </div>
      </div>

      {/* Contact actions  -  large tap targets for mobile */}
      <div className="mt-3 space-y-1.5">
        {member.email && (
          <a
            href={`mailto:${member.email}`}
            onClick={() => track('team_card_email_clicked', { role: member.role })}
            className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-blue-600 hover:bg-blue-50 hover:text-blue-700 transition-colors active:scale-[0.98] touch-manipulation"
          >
            <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
            <span className="truncate">{member.email}</span>
          </a>
        )}
        {member.phone && (
          <a
            href={`tel:${member.phone}`}
            onClick={() => track('team_card_phone_clicked', { role: member.role })}
            className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-blue-600 hover:bg-blue-50 hover:text-blue-700 transition-colors active:scale-[0.98] touch-manipulation"
          >
            <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
            <span>{member.phone}</span>
          </a>
        )}
      </div>

      {/* Role description  -  privacy-safe public guidance */}
      {member.roleDescription && (
        <p className="mt-2 text-[11px] text-slate-500 italic leading-snug">
          {member.roleDescription}
        </p>
      )}
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export function PortalTeamMicroCards({
  lawyer,
  assistant,
  accentColor = '#2563eb',
}: PortalTeamMicroCardsProps) {
  const hasLawyer = !!lawyer?.name
  const hasAssistant = !!assistant?.name

  if (!hasLawyer && !hasAssistant) return null

  // Derive a secondary accent (slightly rotated hue) for the assistant card
  const assistantAccent = hasAssistant ? shiftHue(accentColor, 40) : accentColor

  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        Your Legal Team
      </h3>
      <div className={cn(
        'grid gap-3',
        hasLawyer && hasAssistant ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 max-w-sm',
      )}>
        {hasLawyer && lawyer && (
          <MicroCard member={lawyer} accentColor={accentColor} />
        )}
        {hasAssistant && assistant && (
          <MicroCard member={assistant} accentColor={assistantAccent} />
        )}
      </div>
    </section>
  )
}

// ── Hue Shift Helper ─────────────────────────────────────────────────────────

function shiftHue(hex: string, degrees: number): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min

  if (d === 0) return hex // achromatic

  const s = l > 0.5 ? d / (2 - max - min) : d / (max - min)
  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6

  h = ((h * 360 + degrees) % 360) / 360

  // HSL → RGB
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const nr = Math.round(hue2rgb(p, q, h + 1 / 3) * 255)
  const ng = Math.round(hue2rgb(p, q, h) * 255)
  const nb = Math.round(hue2rgb(p, q, h - 1 / 3) * 255)

  return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`
}
