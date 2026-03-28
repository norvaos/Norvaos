'use client'

import { useState, useCallback } from 'react'
import { useCanonicalProfile, useUpdateCanonicalField } from '@/lib/queries/canonical-profiles'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils/formatters'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  ChevronDown,
  ChevronRight,
  Check,
  Clock,
  AlertTriangle,
  Upload,
  Edit2,
  X,
  User,
  MapPin,
  Plane,
  GraduationCap,
  Briefcase,
  Shield,
  Users,
  Heart,
  FileWarning,
} from 'lucide-react'

import type { CanonicalProfileFieldRow } from '@/lib/types/database'
import type { CanonicalDomain, FieldSource } from '@/lib/services/canonical-profile'

// ── Domain Metadata ─────────────────────────────────────────────────────────

const DOMAIN_CONFIG: Record<CanonicalDomain, { label: string; icon: React.ElementType; colour: string }> = {
  identity: { label: 'Identity', icon: User, colour: 'text-blue-600' },
  address: { label: 'Address & Contact', icon: MapPin, colour: 'text-green-600' },
  travel: { label: 'Travel Documents', icon: Plane, colour: 'text-purple-600' },
  education: { label: 'Education', icon: GraduationCap, colour: 'text-amber-600' },
  employment: { label: 'Employment', icon: Briefcase, colour: 'text-orange-600' },
  immigration: { label: 'Immigration History', icon: Shield, colour: 'text-indigo-600' },
  family: { label: 'Family Information', icon: Users, colour: 'text-pink-600' },
  sponsor: { label: 'Sponsor Information', icon: Heart, colour: 'text-red-600' },
  declarations: { label: 'Background Declarations', icon: FileWarning, colour: 'text-slate-600' },
}

const DOMAIN_ORDER: CanonicalDomain[] = [
  'identity', 'address', 'travel', 'education', 'employment',
  'immigration', 'family', 'sponsor', 'declarations',
]

// ── Props ───────────────────────────────────────────────────────────────────

interface CanonicalProfileViewProps {
  contactId: string
  /** Compact mode hides empty domains and shows fewer details */
  compact?: boolean
}

// ── Component ───────────────────────────────────────────────────────────────

export function CanonicalProfileView({ contactId, compact = false }: CanonicalProfileViewProps) {
  const { data: profile, isLoading, error } = useCanonicalProfile(contactId)

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-20 w-full" />
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-md border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
        Failed to load canonical profile. Please try again.
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="rounded-md border border-muted bg-muted/30 p-6 text-center text-sm text-muted-foreground">
        No canonical profile exists for this contact yet.
      </div>
    )
  }

  // Group fields by domain
  const fieldsByDomain: Record<string, CanonicalProfileFieldRow[]> = {}
  for (const field of profile.fields) {
    if (!fieldsByDomain[field.domain]) {
      fieldsByDomain[field.domain] = []
    }
    fieldsByDomain[field.domain].push(field)
  }

  return (
    <div className="space-y-1">
      {DOMAIN_ORDER.map((domain) => {
        const fields = fieldsByDomain[domain] ?? []
        if (compact && fields.length === 0) return null

        return (
          <DomainSection
            key={domain}
            domain={domain}
            fields={fields}
            profileId={profile.id}
            compact={compact}
          />
        )
      })}
    </div>
  )
}

// ── Domain Section ──────────────────────────────────────────────────────────

interface DomainSectionProps {
  domain: CanonicalDomain
  fields: CanonicalProfileFieldRow[]
  profileId: string
  compact: boolean
}

function DomainSection({ domain, fields, profileId, compact }: DomainSectionProps) {
  const [isExpanded, setIsExpanded] = useState(!compact)
  const config = DOMAIN_CONFIG[domain]
  const Icon = config.icon

  const verifiedCount = fields.filter((f) => f.verification_status === 'verified').length
  const conflictCount = fields.filter((f) => f.verification_status === 'conflict').length
  const pendingCount = fields.filter((f) => f.verification_status === 'pending').length

  return (
    <div className="rounded-lg border bg-card">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/50 transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <Icon className={cn('h-4 w-4 shrink-0', config.colour)} />
        <span className="font-medium text-sm">{config.label}</span>
        <span className="text-xs text-muted-foreground ml-auto">
          {fields.length} field{fields.length !== 1 ? 's' : ''}
        </span>
        <div className="flex items-center gap-1.5">
          {verifiedCount > 0 && (
            <Badge variant="outline" className="text-xs border-emerald-500/30 text-emerald-400 bg-emerald-950/30">
              <Check className="h-3 w-3 mr-0.5" />
              {verifiedCount}
            </Badge>
          )}
          {pendingCount > 0 && (
            <Badge variant="outline" className="text-xs border-yellow-500/20 text-yellow-400 bg-yellow-950/30">
              <Clock className="h-3 w-3 mr-0.5" />
              {pendingCount}
            </Badge>
          )}
          {conflictCount > 0 && (
            <Badge variant="outline" className="text-xs border-red-500/20 text-red-400 bg-red-950/30">
              <AlertTriangle className="h-3 w-3 mr-0.5" />
              {conflictCount}
            </Badge>
          )}
        </div>
      </button>

      {isExpanded && fields.length > 0 && (
        <div className="border-t px-4 py-2">
          <div className="divide-y divide-border/50">
            {fields.map((field) => (
              <FieldRow
                key={field.id}
                field={field}
                profileId={profileId}
                domain={domain}
                compact={compact}
              />
            ))}
          </div>
        </div>
      )}

      {isExpanded && fields.length === 0 && (
        <div className="border-t px-4 py-4 text-sm text-muted-foreground text-center">
          No fields recorded
        </div>
      )}
    </div>
  )
}

// ── Field Row ───────────────────────────────────────────────────────────────

interface FieldRowProps {
  field: CanonicalProfileFieldRow
  profileId: string
  domain: CanonicalDomain
  compact: boolean
}

function FieldRow({ field, profileId, domain, compact }: FieldRowProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const updateField = useUpdateCanonicalField()

  const handleEdit = useCallback(() => {
    const displayVal = formatFieldValue(field.value)
    setEditValue(typeof displayVal === 'string' ? displayVal : JSON.stringify(displayVal))
    setIsEditing(true)
  }, [field.value])

  const handleSave = useCallback(() => {
    updateField.mutate({
      profileId,
      domain,
      fieldKey: field.field_key,
      value: editValue,
      source: 'staff' as FieldSource,
    })
    setIsEditing(false)
  }, [updateField, profileId, domain, field.field_key, editValue])

  const handleCancel = useCallback(() => {
    setIsEditing(false)
  }, [])

  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground truncate">
            {formatFieldKey(field.field_key)}
          </span>
          <VerificationBadge status={field.verification_status} />
        </div>
        {isEditing ? (
          <div className="flex items-center gap-1.5 mt-1">
            <Input
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="h-7 text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave()
                if (e.key === 'Escape') handleCancel()
              }}
            />
            <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={handleSave}>
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={handleCancel}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <div className="text-sm mt-0.5 truncate">
            {formatFieldValue(field.value) || (
              <span className="text-muted-foreground italic">Empty</span>
            )}
          </div>
        )}
      </div>

      {!compact && !isEditing && (
        <div className="flex items-center gap-2 shrink-0">
          <SourceBadge source={field.source} />
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={handleEdit}
          >
            <Edit2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function VerificationBadge({ status }: { status: string }) {
  switch (status) {
    case 'verified':
      return (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-500/30 text-emerald-400 bg-emerald-950/30">
          Verified
        </Badge>
      )
    case 'client_submitted':
      return (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-500/20 text-blue-400 bg-blue-950/30">
          Client Submitted
        </Badge>
      )
    case 'conflict':
      return (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-red-500/20 text-red-400 bg-red-950/30">
          Conflict
        </Badge>
      )
    case 'pending':
    default:
      return (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-yellow-500/20 text-yellow-400 bg-yellow-950/30">
          Pending
        </Badge>
      )
  }
}

function SourceBadge({ source }: { source: string }) {
  const config: Record<string, { label: string; icon: React.ElementType }> = {
    extraction: { label: 'Extracted', icon: Upload },
    client_portal: { label: 'Client', icon: User },
    staff: { label: 'Staff', icon: Edit2 },
    import: { label: 'Import', icon: Upload },
  }

  const src = config[source] ?? { label: source, icon: Upload }
  const SrcIcon = src.icon

  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
      <SrcIcon className="h-3 w-3" />
      {src.label}
    </span>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatFieldKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return `${value.length} item${value.length !== 1 ? 's' : ''}`
  if (typeof value === 'object') {
    // For address objects, join non-empty values
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([, v]) => String(v))
    return entries.join(', ') || ''
  }
  return String(value)
}
