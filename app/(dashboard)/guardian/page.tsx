'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useUser } from '@/lib/hooks/use-user'
import {
  useGuardianTimeline,
  useGuardianBirthdays,
  type GuardianTimelineEntry,
} from '@/lib/queries/lifecycle'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import {
  Shield,
  Calendar,
  AlertTriangle,
  Clock,
  Search,
  Cake,
  ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Status type labels & colours ──────────────────────────────────────────────

const STATUS_TYPE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  work_permit:  { label: 'Work Permit',  color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-200' },
  study_permit: { label: 'Study Permit', color: 'text-indigo-700', bg: 'bg-indigo-50', border: 'border-indigo-200' },
  pr:           { label: 'PR Card',      color: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-200' },
  citizenship:  { label: 'Citizenship',  color: 'text-emerald-700',bg: 'bg-emerald-50',border: 'border-emerald-200' },
  visa:         { label: 'Visa',         color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200' },
  passport:     { label: 'Passport',     color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200' },
}

function getStatusConfig(type: string) {
  return STATUS_TYPE_CONFIG[type] ?? { label: type, color: 'text-slate-700', bg: 'bg-slate-50', border: 'border-slate-200' }
}

function getUrgencyBadge(days: number) {
  if (days <= 30) return { label: `${days}d`, variant: 'destructive' as const, cls: '' }
  if (days <= 90) return { label: `${days}d`, variant: 'outline' as const, cls: 'text-amber-700 border-amber-300' }
  if (days <= 365) return { label: `${Math.ceil(days / 30)}mo`, variant: 'outline' as const, cls: 'text-blue-700 border-blue-200' }
  return { label: `${Math.round(days / 365)}yr`, variant: 'outline' as const, cls: 'text-slate-500 border-slate-200' }
}

// ── Timeline Year Group ───────────────────────────────────────────────────────

function TimelineYearGroup({ year, entries }: { year: number; entries: GuardianTimelineEntry[] }) {
  const isCurrentYear = year === new Date().getFullYear()

  return (
    <div className="relative">
      {/* Year marker */}
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-slate-100 px-4 py-2 flex items-center gap-2">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <span className={cn('text-sm font-semibold', isCurrentYear ? 'text-blue-700' : 'text-slate-600')}>
          {year}
        </span>
        <Badge variant="outline" className="text-[10px] ml-auto">
          {entries.length} {entries.length === 1 ? 'expiry' : 'expiries'}
        </Badge>
      </div>

      {/* Entries */}
      <div className="divide-y divide-slate-50">
        {entries.map((entry) => {
          const config = getStatusConfig(entry.status_type)
          const urgency = getUrgencyBadge(entry.days_until_expiry)

          return (
            <div key={entry.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50/50">
              {/* Date */}
              <span className="text-xs text-muted-foreground tabular-nums w-20 shrink-0">
                {new Date(entry.expiry_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
              </span>

              {/* Status type badge */}
              <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium shrink-0', config.color, config.bg, config.border)}>
                {config.label}
              </span>

              {/* Contact name */}
              <Link
                href={`/contacts/${entry.contact_id}`}
                className="text-sm font-medium text-blue-700 hover:underline truncate min-w-0 flex-1"
              >
                {entry.contact_name}
              </Link>

              {/* Document ref */}
              {entry.document_reference && (
                <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[120px]">
                  {entry.document_reference}
                </span>
              )}

              {/* Matter link */}
              {entry.matter_id && (
                <Link href={`/matters/${entry.matter_id}`} className="text-muted-foreground hover:text-blue-700">
                  <ExternalLink className="h-3 w-3" />
                </Link>
              )}

              {/* Urgency */}
              <Badge variant={urgency.variant} className={cn('text-[10px] px-1.5 shrink-0', urgency.cls)}>
                {entry.days_until_expiry <= 30 && <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />}
                {urgency.label}
              </Badge>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Birthdays Card ────────────────────────────────────────────────────────────

function BirthdaysCard({ tenantId }: { tenantId: string }) {
  const { data, isLoading } = useGuardianBirthdays(tenantId)

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Skeleton className="h-5 w-32 mb-3" />
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8" />)}
          </div>
        </CardContent>
      </Card>
    )
  }

  const birthdays = data ?? []

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Cake className="h-4 w-4 text-pink-500" />
          Upcoming Birthdays
          {birthdays.length > 0 && (
            <Badge variant="outline" className="text-[10px] ml-auto">{birthdays.length}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {birthdays.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No upcoming birthdays in the next 90 days</p>
        ) : (
          <div className="space-y-1">
            {birthdays.slice(0, 15).map((b) => (
              <div key={b.contact_id} className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-slate-50">
                <div className="flex items-center gap-2 min-w-0">
                  <Link href={`/contacts/${b.contact_id}`} className="text-sm font-medium text-blue-700 hover:underline truncate">
                    {b.contact_name}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    turning {b.age_turning}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {new Date(b.next_birthday).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
                  </span>
                  {b.days_until === 0 ? (
                    <Badge className="text-[10px] bg-pink-500">Today!</Badge>
                  ) : b.days_until <= 7 ? (
                    <Badge variant="outline" className="text-[10px] text-pink-700 border-pink-200">
                      {b.days_until}d
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">{b.days_until}d</Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Main Guardian Dashboard ───────────────────────────────────────────────────

export default function GuardianDashboardPage() {
  const { appUser } = useUser()
  const tenantId = appUser?.tenant_id ?? ''
  const [search, setSearch] = useState('')
  const { data: timeline, isLoading } = useGuardianTimeline(tenantId)

  if (!tenantId) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Skeleton className="h-8 w-48" />
      </div>
    )
  }

  // Filter by search
  const filtered = (timeline ?? []).filter((entry) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      entry.contact_name.toLowerCase().includes(q) ||
      entry.status_type.toLowerCase().includes(q) ||
      entry.document_reference?.toLowerCase().includes(q)
    )
  })

  // Group by year
  const yearGroups = new Map<number, GuardianTimelineEntry[]>()
  for (const entry of filtered) {
    const group = yearGroups.get(entry.year) ?? []
    group.push(entry)
    yearGroups.set(entry.year, group)
  }

  // Summary stats
  const expiring30 = (timeline ?? []).filter((e) => e.days_until_expiry <= 30).length
  const expiring90 = (timeline ?? []).filter((e) => e.days_until_expiry <= 90).length
  const totalTracked = timeline?.length ?? 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <Shield className="h-5 w-5 text-blue-600" />
          Norva Guardian
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          10-year post-matter timeline. Track every expiry, every milestone, every opportunity to re-engage.
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Tracked</p>
            <p className="text-2xl font-bold tabular-nums">{totalTracked}</p>
          </CardContent>
        </Card>
        <Card className={expiring30 > 0 ? 'border-red-200' : undefined}>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-red-500" />
              Expiring in 30 Days
            </p>
            <p className={cn('text-2xl font-bold tabular-nums', expiring30 > 0 ? 'text-red-700' : '')}>
              {expiring30}
            </p>
          </CardContent>
        </Card>
        <Card className={expiring90 > 0 ? 'border-amber-200' : undefined}>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3 text-amber-500" />
              Expiring in 90 Days
            </p>
            <p className={cn('text-2xl font-bold tabular-nums', expiring90 > 0 ? 'text-amber-700' : '')}>
              {expiring90}
            </p>
          </CardContent>
        </Card>
        <BirthdaysCard tenantId={tenantId} />
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, document type, or reference..."
          className="pl-9"
        />
      </div>

      {/* Timeline */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            Expiry Timeline
            {filtered.length !== totalTracked && (
              <span className="text-xs font-normal text-muted-foreground ml-1">
                ({filtered.length} of {totalTracked})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
            </div>
          ) : yearGroups.size === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <Shield className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-sm font-medium">No expiry records found</p>
              <p className="text-xs mt-1">
                Add immigration status records to contacts to populate the Guardian timeline.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {Array.from(yearGroups.entries()).map(([year, entries]) => (
                <TimelineYearGroup key={year} year={year} entries={entries} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
