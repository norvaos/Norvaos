'use client'

/**
 * WorkbenchPanel — Column 3
 *
 * IRCC field verification workbench.
 *
 * Each field shows:
 *   - Label + optional help tooltip
 *   - Value input (editable)
 *   - Verify toggle (circle → green check)
 *   - Verified-by + timestamp when verified
 *
 * Verification state is stored in profile_data._ver:
 *   { "personal.family_name": { v: true, by: "John Smith", at: "2026-03-17T..." } }
 *
 * Rules:
 *   - Editing a verified field immediately clears its verification
 *   - Verify button disabled while field has unsaved changes
 *   - Empty fields can be verified only after marking "Not applicable"
 *   - All changes persist via useUpdateMatterPersonProfile (optimistic versioning)
 */

import { useState, useCallback } from 'react'
import {
  CheckCircle2,
  Circle,
  Loader2,
  User2,
  Heart,
  Languages,
  BookOpen,
  MapPin,
  Plane,
  GraduationCap,
  Briefcase,
  Lock,
  Users,
  Info,
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  useMatterPeople,
  useUpdateMatterPersonProfile,
  type MatterPersonProfile,
} from '@/lib/queries/matter-profiles'
import { PROFILE_PATH_CATALOG, type ProfilePathEntry } from '@/lib/ircc/profile-path-catalog'
import type { WorkspaceSection } from './workspace-shell'

// ── Verification entry type ───────────────────────────────────────────────────

interface VerEntry {
  v: boolean
  by: string
  at: string
}

// ── Field sections shown in workbench (client_profile) ───────────────────────

const WORKBENCH_SECTIONS: { key: string; label: string; icon: React.ComponentType<{ className?: string }>; paths: string[] }[] = [
  {
    key: 'personal',
    label: 'Personal Details',
    icon: User2,
    paths: [
      'personal.family_name',
      'personal.given_name',
      'personal.other_names',
      'personal.sex',
      'personal.date_of_birth',
      'personal.place_of_birth_city',
      'personal.place_of_birth_country',
      'personal.citizenship',
      'personal.second_citizenship',
      'personal.current_country_of_residence',
      'personal.residence_status',
    ],
  },
  {
    key: 'marital',
    label: 'Marital Status',
    icon: Heart,
    paths: [
      'marital.status',
      'marital.date_of_current_relationship',
      'marital.spouse_family_name',
      'marital.spouse_given_name',
      'marital.spouse_date_of_birth',
    ],
  },
  {
    key: 'passport',
    label: 'Passport / Travel Document',
    icon: BookOpen,
    paths: [
      'passport.number',
      'passport.country_of_issue',
      'passport.issue_date',
      'passport.expiry_date',
    ],
  },
  {
    key: 'language',
    label: 'Language',
    icon: Languages,
    paths: [
      'language.native_language',
      'language.english_ability',
      'language.french_ability',
      'language.preferred_language',
    ],
  },
  {
    key: 'contact_info',
    label: 'Contact Information',
    icon: MapPin,
    paths: [
      'contact_info.mailing_address.street_number',
      'contact_info.mailing_address.street_name',
      'contact_info.mailing_address.apt_unit',
      'contact_info.mailing_address.city',
      'contact_info.mailing_address.province_state',
      'contact_info.mailing_address.postal_code',
      'contact_info.mailing_address.country',
      'contact_info.telephone',
      'contact_info.email',
    ],
  },
]

// Build lookup from path → catalog entry
const CATALOG_BY_PATH = new Map<string, ProfilePathEntry>(
  PROFILE_PATH_CATALOG.map(e => [e.path, e])
)

// ── Helper: read value from nested profile by dot-path ────────────────────────

function readPath(profile: Record<string, unknown>, path: string): string {
  const parts = path.split('.')
  let current: unknown = profile
  for (const part of parts) {
    if (!current || typeof current !== 'object') return ''
    current = (current as Record<string, unknown>)[part]
  }
  if (current === null || current === undefined) return ''
  return String(current)
}

// ── Section completion percentage ─────────────────────────────────────────────

function sectionCompletion(
  paths: string[],
  profile: Record<string, unknown>,
  ver: Record<string, VerEntry>,
): { filled: number; verified: number; total: number } {
  let filled = 0
  let verified = 0
  for (const path of paths) {
    const val = readPath(profile, path)
    if (val) filled++
    if (ver[path]?.v) verified++
  }
  return { filled, verified, total: paths.length }
}

// ── FieldRow ──────────────────────────────────────────────────────────────────

interface FieldRowProps {
  entry: ProfilePathEntry
  value: string
  verEntry: VerEntry | undefined
  isLocked: boolean
  isSaving: boolean
  onSave: (path: string, value: string, clearVerify: boolean) => Promise<void>
  onVerify: (path: string) => Promise<void>
  onUnverify: (path: string) => Promise<void>
}

function FieldRow({
  entry,
  value,
  verEntry,
  isLocked,
  isSaving,
  onSave,
  onVerify,
  onUnverify,
}: FieldRowProps) {
  const [localValue, setLocalValue] = useState(value)
  const isDirty = localValue !== value
  const isVerified = verEntry?.v === true

  const handleBlur = useCallback(async () => {
    if (!isDirty) return
    await onSave(entry.path, localValue, isVerified)
  }, [isDirty, localValue, isVerified, entry.path, onSave])

  const handleVerifyClick = useCallback(async () => {
    if (isDirty) {
      toast.error('Save your changes before verifying.')
      return
    }
    if (isVerified) {
      await onUnverify(entry.path)
    } else {
      await onVerify(entry.path)
    }
  }, [isDirty, isVerified, entry.path, onVerify, onUnverify])

  return (
    <div className={cn(
      'grid items-start gap-x-2 py-1.5 border-b last:border-0',
      'grid-cols-[1fr_auto]'
    )}>
      {/* Left: label + input */}
      <div className="min-w-0">
        <div className="flex items-center gap-1 mb-0.5">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide leading-none">
            {entry.label}
          </label>
          {entry.type === 'date' && (
            <span className="text-[9px] text-muted-foreground/60">(YYYY-MM-DD)</span>
          )}
        </div>
        <input
          type="text"
          value={localValue}
          disabled={isLocked}
          onChange={e => {
            setLocalValue(e.target.value)
          }}
          onBlur={handleBlur}
          placeholder={isLocked ? 'Locked' : `Enter ${entry.label.toLowerCase()}`}
          className={cn(
            'w-full text-xs px-2 py-1 rounded border bg-background transition-colors',
            'focus:outline-none focus:ring-1 focus:ring-primary/40',
            isDirty && 'border-amber-400 bg-amber-50/30',
            isVerified && !isDirty && 'border-green-300 bg-green-50/20',
            isLocked && 'bg-muted cursor-not-allowed opacity-60',
          )}
        />
        {isVerified && verEntry && !isDirty && (
          <p className="text-[10px] text-green-600 mt-0.5 leading-none">
            ✓ {verEntry.by} · {new Date(verEntry.at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
        {isDirty && (
          <p className="text-[10px] text-amber-600 mt-0.5 leading-none">
            Unsaved — click away to save
          </p>
        )}
      </div>

      {/* Right: verify button */}
      <div className="flex items-center pt-4">
        <TooltipProvider>
          <Tooltip delayDuration={400}>
            <TooltipTrigger asChild>
              <button
                onClick={handleVerifyClick}
                disabled={isLocked || isSaving || (!localValue && !isVerified)}
                className={cn(
                  'transition-colors rounded-full p-0.5',
                  isVerified && !isDirty
                    ? 'text-green-600 hover:text-green-700'
                    : 'text-muted-foreground/40 hover:text-muted-foreground',
                  (isLocked || (!localValue && !isVerified)) && 'opacity-30 cursor-not-allowed'
                )}
              >
                {isSaving
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : isVerified && !isDirty
                    ? <CheckCircle2 className="h-4 w-4" />
                    : <Circle className="h-4 w-4" />
                }
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={4}>
              {isVerified && !isDirty ? 'Verified — click to unverify' : isDirty ? 'Save changes first' : !localValue ? 'Enter a value to verify' : 'Mark as verified'}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  )
}

// ── Section block ─────────────────────────────────────────────────────────────

interface SectionBlockProps {
  section: typeof WORKBENCH_SECTIONS[0]
  profile: Record<string, unknown>
  ver: Record<string, VerEntry>
  isLocked: boolean
  savingPaths: Set<string>
  onSave: (path: string, value: string, clearVerify: boolean) => Promise<void>
  onVerify: (path: string) => Promise<void>
  onUnverify: (path: string) => Promise<void>
}

function SectionBlock({ section, profile, ver, isLocked, savingPaths, onSave, onVerify, onUnverify }: SectionBlockProps) {
  const [collapsed, setCollapsed] = useState(false)
  const Icon = section.icon
  const { filled, verified, total } = sectionCompletion(section.paths, profile, ver)
  const pct = total === 0 ? 0 : Math.round((verified / total) * 100)

  return (
    <div className="mb-3">
      {/* Section header */}
      <button
        onClick={() => setCollapsed(v => !v)}
        className="flex items-center gap-2 w-full py-1.5 px-1 hover:bg-muted/50 rounded-lg transition-colors"
      >
        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-semibold flex-1 text-left">{section.label}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">{filled}/{total} filled</span>
          <Badge
            variant="outline"
            className={cn(
              'text-[10px] py-0 px-1.5 leading-4 border',
              pct === 100 ? 'border-green-300 text-green-700 bg-green-50' :
              pct > 0     ? 'border-blue-300 text-blue-700 bg-blue-50' :
              'border-zinc-200 text-muted-foreground'
            )}
          >
            {pct}% verified
          </Badge>
          <span className="text-muted-foreground text-xs">{collapsed ? '▸' : '▾'}</span>
        </div>
      </button>

      {/* Fields */}
      {!collapsed && (
        <div className="px-1 mt-1">
          {section.paths.map(path => {
            const catalogEntry = CATALOG_BY_PATH.get(path)
            if (!catalogEntry) return null
            return (
              <FieldRow
                key={path}
                entry={catalogEntry}
                value={readPath(profile, path)}
                verEntry={ver[path]}
                isLocked={isLocked}
                isSaving={savingPaths.has(path)}
                onSave={onSave}
                onVerify={onVerify}
                onUnverify={onUnverify}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Person selector tab bar ───────────────────────────────────────────────────

interface PersonTabBarProps {
  people: MatterPersonProfile[]
  activePersonId: string
  onSelect: (id: string) => void
}

function PersonTabBar({ people, activePersonId, onSelect }: PersonTabBarProps) {
  if (people.length <= 1) return null
  return (
    <div className="flex items-center gap-1 px-3 py-1.5 border-b bg-muted/20 overflow-x-auto shrink-0">
      {people.map(p => (
        <button
          key={p.id}
          onClick={() => onSelect(p.id)}
          className={cn(
            'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md transition-colors whitespace-nowrap shrink-0',
            activePersonId === p.id
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          )}
        >
          <Users className="h-3 w-3" />
          {[p.first_name, p.last_name].filter(Boolean).join(' ') || p.person_role}
          <span className="text-[10px] opacity-70">({p.person_role.replace('_', ' ')})</span>
        </button>
      ))}
    </div>
  )
}

// ── Stub section ──────────────────────────────────────────────────────────────

function StubSection({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
      <Info className="h-8 w-8 opacity-30" />
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs opacity-60 text-center max-w-48">
        This section will be built in a future phase.
      </p>
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface WorkbenchPanelProps {
  matterId: string
  tenantId: string
  activeSection: WorkspaceSection
  principalApplicant: MatterPersonProfile | null
  allPeople: MatterPersonProfile[]
  currentUserId: string
  currentUserName: string
}

// ── Component ─────────────────────────────────────────────────────────────────

export function WorkbenchPanel({
  matterId,
  activeSection,
  principalApplicant,
  allPeople,
  currentUserId,
  currentUserName,
}: WorkbenchPanelProps) {
  const { data: freshPeople } = useMatterPeople(matterId)
  const updateProfile = useUpdateMatterPersonProfile()
  const [activePersonId, setActivePersonId] = useState<string>(principalApplicant?.id ?? '')
  const [savingPaths, setSavingPaths] = useState<Set<string>>(new Set())

  // Use fresh data from query cache when available
  const people = freshPeople ?? allPeople
  const activePerson = people.find(p => p.id === activePersonId) ?? people[0] ?? null

  if (!activePerson && activeSection === 'client_profile') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground p-6">
        <User2 className="h-10 w-10 opacity-20" />
        <p className="text-sm font-medium">No principal applicant found</p>
        <p className="text-xs opacity-60 text-center">
          Add a contact to this matter to populate the client profile.
        </p>
      </div>
    )
  }

  const profile = (activePerson?.profile_data ?? {}) as Record<string, unknown>
  const ver = ((profile._ver ?? {}) as Record<string, VerEntry>)
  const isLocked = activePerson?.is_locked ?? false
  const profileVersion = activePerson?.profile_version ?? 1

  const handleSave = async (path: string, value: string, clearVerify: boolean) => {
    if (!activePerson) return
    setSavingPaths(prev => new Set(prev).add(path))
    try {
      const patch: Record<string, unknown> = {}

      // Write value at dot-path (top-level key for the root path segment)
      // The mutation does a top-level merge so we write the full nested object
      const parts = path.split('.')
      if (parts.length === 1) {
        patch[path] = value || null
      } else {
        // Read the current top-level object and merge
        const topKey = parts[0]
        const existing = (profile[topKey] ?? {}) as Record<string, unknown>
        let current = existing
        for (let i = 1; i < parts.length - 1; i++) {
          const nextKey = parts[i]
          const next = (current[nextKey] ?? {}) as Record<string, unknown>
          current[nextKey] = { ...next }
          current = current[nextKey] as Record<string, unknown>
        }
        current[parts[parts.length - 1]] = value || null
        patch[topKey] = { ...existing }
        // Re-traverse to set correctly (immutable pattern)
        let obj = patch[topKey] as Record<string, unknown>
        for (let i = 1; i < parts.length - 1; i++) {
          obj = obj[parts[i]] as Record<string, unknown>
        }
        obj[parts[parts.length - 1]] = value || null
      }

      if (clearVerify) {
        const newVer = { ...ver }
        delete newVer[path]
        patch._ver = newVer
      }

      await updateProfile.mutateAsync({
        personId: activePerson.id,
        matterId,
        patch,
        currentVersion: profileVersion,
      })
    } catch (err) {
      toast.error('Failed to save field. Please try again.')
    } finally {
      setSavingPaths(prev => { const s = new Set(prev); s.delete(path); return s })
    }
  }

  const handleVerify = async (path: string) => {
    if (!activePerson) return
    setSavingPaths(prev => new Set(prev).add(path))
    try {
      const now = new Date().toISOString()
      const newVer = { ...ver, [path]: { v: true, by: currentUserName || currentUserId, at: now } }
      await updateProfile.mutateAsync({
        personId: activePerson.id,
        matterId,
        patch: { _ver: newVer },
        currentVersion: profileVersion,
      })
    } catch {
      toast.error('Failed to verify field.')
    } finally {
      setSavingPaths(prev => { const s = new Set(prev); s.delete(path); return s })
    }
  }

  const handleUnverify = async (path: string) => {
    if (!activePerson) return
    setSavingPaths(prev => new Set(prev).add(path))
    try {
      const newVer = { ...ver }
      delete newVer[path]
      await updateProfile.mutateAsync({
        personId: activePerson.id,
        matterId,
        patch: { _ver: newVer },
        currentVersion: profileVersion,
      })
    } catch {
      toast.error('Failed to update verification.')
    } finally {
      setSavingPaths(prev => { const s = new Set(prev); s.delete(path); return s })
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Workbench header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30 shrink-0">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Workbench
        </span>
        <div className="flex items-center gap-2">
          {isLocked && (
            <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 bg-amber-50">
              <Lock className="h-2.5 w-2.5 mr-1" />
              Profile Locked
            </Badge>
          )}
          {activePerson && (
            <Badge variant="outline" className="text-[10px]">
              v{profileVersion}
            </Badge>
          )}
        </div>
      </div>

      {/* Person tabs (if multiple people) */}
      {activeSection === 'client_profile' && (
        <PersonTabBar
          people={people}
          activePersonId={activePersonId || activePerson?.id || ''}
          onSelect={setActivePersonId}
        />
      )}

      {/* Content area */}
      <ScrollArea className="flex-1">
        <div className="p-3">
          {activeSection === 'client_profile' && activePerson ? (
            WORKBENCH_SECTIONS.map(section => (
              <SectionBlock
                key={section.key}
                section={section}
                profile={profile}
                ver={ver}
                isLocked={isLocked}
                savingPaths={savingPaths}
                onSave={handleSave}
                onVerify={handleVerify}
                onUnverify={handleUnverify}
              />
            ))
          ) : activeSection === 'family_group' ? (
            <StubSection label="Family Group Comparison" />
          ) : activeSection === 'imm_forms' ? (
            <StubSection label="IMM Forms Assignment" />
          ) : activeSection === 'documents' ? (
            <StubSection label="Document Matrix" />
          ) : activeSection === 'loe_builder' ? (
            <StubSection label="Letter of Explanation Builder" />
          ) : activeSection === 'fees' ? (
            <StubSection label="Fee Allocation" />
          ) : activeSection === 'biometrics' ? (
            <StubSection label="Biometrics & Medical Tracking" />
          ) : activeSection === 'submission' ? (
            <StubSection label="Submission History" />
          ) : activeSection === 'notes' ? (
            <StubSection label="Internal Notes & Strategy" />
          ) : activeSection === 'audit_log' ? (
            <StubSection label="Audit Log" />
          ) : null}
        </div>
      </ScrollArea>
    </div>
  )
}
