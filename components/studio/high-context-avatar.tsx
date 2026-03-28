'use client'

import { motion } from 'framer-motion'
import { Globe, Briefcase } from 'lucide-react'

// ---------------------------------------------------------------------------
// High-Context Avatar — The Legacy Cleanup (Vision 2035)
// ---------------------------------------------------------------------------
// Replaces the 40-field profile header with a minimal, high-signal avatar.
// Shows ONLY: Name, Country, Case Type. Everything else is hidden until
// the active mission requires it.
// ---------------------------------------------------------------------------

interface HighContextAvatarProps {
  name: string
  /** ISO country code or country name */
  country?: string
  /** e.g. "Spousal Sponsorship", "PR Application" */
  caseType?: string
  /** Optional avatar URL */
  avatarUrl?: string
  /** Emerald dot indicating active mission */
  hasActiveMission?: boolean
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function HighContextAvatar({
  name,
  country,
  caseType,
  avatarUrl,
  hasActiveMission = false,
}: HighContextAvatarProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="flex items-center gap-4"
    >
      {/* Avatar */}
      <div className="relative">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={name}
            className="w-11 h-11 rounded-xl object-cover border border-white/10"
          />
        ) : (
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center border border-white/10"
            style={{
              background: 'linear-gradient(135deg, rgba(16,185,129,0.15) 0%, rgba(16,185,129,0.05) 100%)',
            }}
          >
            <span className="text-[13px] font-semibold text-emerald-400/80">
              {getInitials(name)}
            </span>
          </div>
        )}

        {/* Active Mission Indicator */}
        {hasActiveMission && (
          <motion.div
            className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400"
            animate={{
              boxShadow: [
                '0 0 0px rgba(16, 185, 129, 0.4)',
                '0 0 8px rgba(16, 185, 129, 0.6)',
                '0 0 0px rgba(16, 185, 129, 0.4)',
              ],
            }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
      </div>

      {/* Info — Name + two metadata chips */}
      <div className="min-w-0">
        <p className="text-white/85 font-medium text-sm truncate">{name}</p>
        <div className="flex items-center gap-2 mt-1">
          {country && (
            <span className="inline-flex items-center gap-1 text-[11px] text-white/30">
              <Globe className="w-3 h-3" />
              {country}
            </span>
          )}
          {country && caseType && (
            <span className="text-white/10 text-[10px]">·</span>
          )}
          {caseType && (
            <span className="inline-flex items-center gap-1 text-[11px] text-white/30">
              <Briefcase className="w-3 h-3" />
              {caseType}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  )
}
