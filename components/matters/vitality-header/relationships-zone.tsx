'use client'

import { useState, useCallback, useMemo } from 'react'
import {
  type RelationshipsZoneProps,
  type RelationshipPerson,
} from './types'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { logAudit } from '@/lib/queries/audit-logs'
import {
  User,
  Eye,
  EyeOff,
  Fingerprint,
  AlertTriangle,
  Shield,
  Users,
  Phone,
  Mail,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Mask all characters except the last 4 with bullets */
function maskValue(value: string): string {
  if (value.length <= 4) return value
  return '\u2022'.repeat(value.length - 4) + value.slice(-4)
}

/** Compute initials from a full name (max 2 chars) */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

/** Truncate email for compact display */
function truncateEmail(email: string, maxLen = 24): string {
  if (email.length <= maxLen) return email
  const [local, domain] = email.split('@')
  if (!domain) return email.slice(0, maxLen) + '\u2026'
  const maxLocal = maxLen - domain.length - 2 // 1 for @, 1 for ellipsis
  if (maxLocal < 3) return email.slice(0, maxLen) + '\u2026'
  return local.slice(0, maxLocal) + '\u2026@' + domain
}

/** Check if a date string is within N days of today */
function isWithinDays(dateStr: string, days: number): boolean {
  const target = new Date(dateStr)
  const now = new Date()
  const diff = target.getTime() - now.getTime()
  return diff >= 0 && diff <= days * 24 * 60 * 60 * 1000
}

/** Check if a date is in the past */
function isPast(dateStr: string): boolean {
  return new Date(dateStr).getTime() < Date.now()
}

/** Format a date string for display */
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// ─── Role colour mapping ────────────────────────────────────────────────────

function roleBadgeStyle(role: RelationshipPerson['role']): string {
  switch (role) {
    case 'principal_applicant':
      return 'bg-blue-950/40 text-blue-400 dark:bg-blue-900/40 dark:text-blue-400'
    case 'spouse':
      return 'bg-purple-950/40 text-purple-400 dark:bg-purple-900/40 dark:text-purple-400'
    case 'dependent':
      return 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400'
    case 'co_sponsor':
      return 'bg-amber-950/40 text-amber-400 dark:bg-amber-900/40 dark:text-amber-400'
    default:
      return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
  }
}

// ─── Sensitive Field Row ────────────────────────────────────────────────────

function SensitiveFieldRow({
  fieldKey,
  label,
  value,
  icon: Icon,
  isRevealed,
  onToggle,
  alert,
}: {
  fieldKey: string
  label: string
  value: string
  icon: React.ComponentType<{ className?: string }>
  isRevealed: boolean
  onToggle: (key: string) => void
  alert?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Icon className="size-3 shrink-0 text-muted-foreground" />
      <span className="text-[10px] shrink-0 text-muted-foreground w-16">
        {label}
      </span>
      <span
        className={cn(
          'text-xs font-mono tabular-nums truncate',
          isRevealed ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        {isRevealed ? value : maskValue(value)}
      </span>
      <button
        type="button"
        onClick={() => onToggle(fieldKey)}
        className={cn(
          'shrink-0 p-0.5 rounded-sm transition-colors',
          'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1'
        )}
        aria-label={isRevealed ? `Hide ${label}` : `Reveal ${label}`}
        aria-pressed={isRevealed}
      >
        {isRevealed ? (
          <EyeOff className="size-3 text-muted-foreground" />
        ) : (
          <Eye className="size-3 text-muted-foreground" />
        )}
      </button>
      {alert}
    </div>
  )
}

// ─── Skeleton State ─────────────────────────────────────────────────────────

function RelationshipsZoneSkeleton() {
  return (
    <div
      role="region"
      aria-label="Relationships"
      aria-busy="true"
      className="flex flex-col gap-3 p-3"
    >
      {/* Avatar + name + role */}
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-full" />
        <div className="flex flex-col gap-1">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-20 rounded-full" />
        </div>
      </div>

      {/* Sensitive fields */}
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-4 w-40" />
      </div>

      {/* Personal details grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-3.5 w-28" />
        <Skeleton className="h-3.5 w-20" />
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-3.5 w-22" />
        <Skeleton className="h-3.5 w-26" />
      </div>

      {/* Flags */}
      <div className="flex gap-1.5">
        <Skeleton className="h-5 w-24 rounded-full" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>

      {/* Team pills */}
      <div className="flex gap-1.5">
        <Skeleton className="h-5 w-28 rounded-full" />
        <Skeleton className="h-5 w-24 rounded-full" />
      </div>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function RelationshipsZone({
  data,
  isLoading,
  tenantId,
  userId,
  matterId,
  onDrillDown,
}: RelationshipsZoneProps) {
  const [revealedFields, setRevealedFields] = useState<Set<string>>(
    () => new Set()
  )
  const [peopleExpanded, setPeopleExpanded] = useState(false)

  const handleReveal = useCallback(
    (fieldKey: string) => {
      setRevealedFields((prev) => {
        const next = new Set(prev)
        if (next.has(fieldKey)) {
          next.delete(fieldKey)
        } else {
          next.add(fieldKey)
          // Fire-and-forget audit log on reveal
          logAudit({
            tenantId,
            userId,
            entityType: 'matter',
            entityId: matterId,
            action: 'sensitive_field_revealed',
            metadata: { field: fieldKey },
          })
        }
        return next
      })
    },
    [tenantId, userId, matterId]
  )

  const primaryFlags = useMemo(() => {
    if (!data?.primaryContact) return []
    const flags: { label: string; tooltip: string }[] = []
    const p = data.primaryContact
    if (p.passportExpiring) {
      const expiry = p.sensitiveFields.passportExpiry
      const isExpired = expiry ? isPast(expiry) : false
      flags.push({
        label: isExpired ? 'PASSPORT EXPIRED' : 'EXPIRING SOON',
        tooltip: expiry
          ? `Passport expires ${formatDate(expiry)}`
          : 'Passport expiring soon',
      })
    }
    if (p.inadmissibilityFlag) {
      flags.push({
        label: 'Inadmissibility',
        tooltip: 'Inadmissibility flag on file',
      })
    }
    if (p.criminalCharges) {
      flags.push({
        label: 'Criminal Charges',
        tooltip: 'Criminal charges on file',
      })
    }
    return flags
  }, [data?.primaryContact])

  if (isLoading || !data) {
    return <RelationshipsZoneSkeleton />
  }

  const { primaryContact, additionalPeople, responsibleLawyer, originatingLawyer, teamMembers } = data

  return (
    <TooltipProvider>
      <div
        role="region"
        aria-label="Relationships"
        className={cn(
          'flex flex-col gap-3 p-3 overflow-y-auto transition-colors',
          onDrillDown && 'cursor-pointer hover:bg-muted/40 rounded-lg'
        )}
        onClick={onDrillDown}
        onKeyDown={(e) => {
          if (onDrillDown && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            onDrillDown()
          }
        }}
        tabIndex={onDrillDown ? 0 : undefined}
      >
        {/* ── 1. Primary Contact Card ──────────────────────────────────── */}
        {primaryContact ? (
          <>
            <div className="flex items-center gap-3">
              <div
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm"
                aria-hidden="true"
              >
                {getInitials(primaryContact.fullName)}
              </div>
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-sm font-semibold truncate">
                  {primaryContact.fullName}
                </span>
                <Badge
                  variant="outline"
                  size="xs"
                  className={cn('w-fit', roleBadgeStyle(primaryContact.role))}
                >
                  {primaryContact.roleLabel}
                </Badge>
              </div>
            </div>

            {/* ── 2. Sensitive Fields ──────────────────────────────────── */}
            <div className="flex flex-col gap-1.5">
              {primaryContact.sensitiveFields.uci && (
                <SensitiveFieldRow
                  fieldKey={`${primaryContact.id}:uci`}
                  label="UCI"
                  value={primaryContact.sensitiveFields.uci}
                  icon={Fingerprint}
                  isRevealed={revealedFields.has(`${primaryContact.id}:uci`)}
                  onToggle={handleReveal}
                />
              )}

              {primaryContact.sensitiveFields.passportNumber && (
                <SensitiveFieldRow
                  fieldKey={`${primaryContact.id}:passport`}
                  label="Passport"
                  value={primaryContact.sensitiveFields.passportNumber}
                  icon={Shield}
                  isRevealed={revealedFields.has(`${primaryContact.id}:passport`)}
                  onToggle={handleReveal}
                />
              )}

              {primaryContact.sensitiveFields.passportExpiry && (() => {
                const expired = isPast(primaryContact.sensitiveFields.passportExpiry)
                const expiringSoon = !expired && isWithinDays(primaryContact.sensitiveFields.passportExpiry, 90)
                const urgent = !expired && isWithinDays(primaryContact.sensitiveFields.passportExpiry, 30)
                return (
                  <div className={cn(
                    'flex items-center gap-2 min-w-0 rounded-md px-1.5 py-0.5 -mx-1.5 transition-colors',
                    expired && 'bg-red-950/30/80 dark:bg-red-950/30',
                    urgent && 'bg-red-950/30/60 dark:bg-red-950/20 animate-pulse',
                    expiringSoon && !urgent && 'bg-amber-950/30/60 dark:bg-amber-950/20',
                  )}>
                    <Shield className={cn(
                      'size-3 shrink-0',
                      expired ? 'text-red-500' : expiringSoon ? 'text-amber-500' : 'text-muted-foreground',
                    )} />
                    <span className="text-[10px] shrink-0 text-muted-foreground w-16">
                      Expiry
                    </span>
                    <span className={cn(
                      'text-xs tabular-nums font-medium',
                      expired
                        ? 'text-red-600 dark:text-red-400'
                        : expiringSoon
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-foreground',
                    )}>
                      {formatDate(primaryContact.sensitiveFields.passportExpiry)}
                    </span>
                    {(expired || expiringSoon) && (
                      <Badge
                        variant="destructive"
                        size="xs"
                        className={cn(
                          'gap-0.5 shrink-0',
                          !expired && 'bg-amber-950/40 text-amber-400 dark:bg-amber-900 dark:text-amber-300 border-amber-500/30 dark:border-amber-700',
                        )}
                      >
                        <AlertTriangle className="size-2.5" />
                        {expired ? 'EXPIRED' : urgent ? 'CRITICAL' : 'EXPIRING SOON'}
                      </Badge>
                    )}
                  </div>
                )
              })()}
            </div>

            {/* ── 3. Personal Details (2-col grid) ─────────────────────── */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {primaryContact.dateOfBirth && (
                <DetailCell label="DOB" value={formatDate(primaryContact.dateOfBirth)} />
              )}
              {primaryContact.nationality && (
                <DetailCell label="Nationality" value={primaryContact.nationality} />
              )}
              {primaryContact.immigrationStatus && (
                <DetailCell label="Status" value={primaryContact.immigrationStatus} />
              )}
              {primaryContact.email && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1 min-w-0 cursor-default">
                      <Mail className="size-2.5 shrink-0 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground truncate">
                        {truncateEmail(primaryContact.email)}
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>{primaryContact.email}</TooltipContent>
                </Tooltip>
              )}
              {primaryContact.phone && (
                <div className="flex items-center gap-1 min-w-0">
                  <Phone className="size-2.5 shrink-0 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground truncate">
                    {primaryContact.phone}
                  </span>
                </div>
              )}
            </div>

            {/* ── 4. Flags Row ─────────────────────────────────────────── */}
            {primaryFlags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {primaryFlags.map((flag) => (
                  <Tooltip key={flag.label}>
                    <TooltipTrigger asChild>
                      <Badge
                        variant="destructive"
                        size="xs"
                        className="gap-0.5"
                      >
                        <AlertTriangle className="size-2.5" />
                        {flag.label}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>{flag.tooltip}</TooltipContent>
                  </Tooltip>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center gap-2 text-muted-foreground">
            <User className="size-4" />
            <span className="text-xs">No primary contact assigned</span>
          </div>
        )}

        {/* ── 5. Additional People ───────────────────────────────────── */}
        {additionalPeople.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setPeopleExpanded((prev) => !prev)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  e.stopPropagation()
                  setPeopleExpanded((prev) => !prev)
                }
              }}
              className={cn(
                'flex items-center gap-1.5 text-xs text-muted-foreground',
                'hover:text-foreground transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded-sm'
              )}
              aria-expanded={peopleExpanded}
              aria-controls="additional-people-list"
            >
              <Users className="size-3" />
              <span>
                {additionalPeople.length} additional{' '}
                {additionalPeople.length === 1 ? 'person' : 'people'}
              </span>
              <svg
                className={cn(
                  'size-3 transition-transform duration-200',
                  peopleExpanded && 'rotate-180'
                )}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {peopleExpanded && (
              <ul
                id="additional-people-list"
                className="flex flex-col gap-1 pl-1"
              >
                {additionalPeople.map((person) => (
                  <li
                    key={person.id}
                    className="flex items-center gap-2 min-w-0"
                  >
                    <div
                      className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground"
                      aria-hidden="true"
                    >
                      {getInitials(person.fullName)}
                    </div>
                    <span className="text-xs truncate">
                      {person.fullName}
                    </span>
                    <Badge
                      variant="outline"
                      size="xs"
                      className={cn('shrink-0', roleBadgeStyle(person.role))}
                    >
                      {person.roleLabel}
                    </Badge>
                    {(person.passportExpiring ||
                      person.inadmissibilityFlag ||
                      person.criminalCharges) && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <AlertTriangle className="size-3 shrink-0 text-red-500" />
                        </TooltipTrigger>
                        <TooltipContent>
                          {[
                            person.passportExpiring && 'Passport expiring',
                            person.inadmissibilityFlag && 'Inadmissibility',
                            person.criminalCharges && 'Criminal charges',
                          ]
                            .filter(Boolean)
                            .join(', ')}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* ── 6. Team ────────────────────────────────────────────────── */}
        {(responsibleLawyer || originatingLawyer || teamMembers.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border">
            {responsibleLawyer && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="secondary"
                    size="xs"
                    className="gap-0.5 cursor-default"
                  >
                    <User className="size-2.5" />
                    {responsibleLawyer.name}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>Responsible lawyer</TooltipContent>
              </Tooltip>
            )}

            {originatingLawyer && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="secondary"
                    size="xs"
                    className="gap-0.5 cursor-default"
                  >
                    <User className="size-2.5" />
                    {originatingLawyer.name}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>Originating lawyer</TooltipContent>
              </Tooltip>
            )}

            {teamMembers.map((member) => (
              <Tooltip key={member.id}>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    size="xs"
                    className="gap-0.5 cursor-default"
                  >
                    <Users className="size-2.5" />
                    {member.name}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>Team member</TooltipContent>
              </Tooltip>
            ))}
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}

// ─── Detail Cell (compact label + value) ────────────────────────────────────

function DetailCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1 min-w-0">
      <span className="text-[10px] text-muted-foreground shrink-0">
        {label}:
      </span>
      <span className="text-[10px] text-foreground truncate">{value}</span>
    </div>
  )
}
