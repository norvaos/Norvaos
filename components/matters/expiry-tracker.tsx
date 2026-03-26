'use client'

import { Clock, AlertTriangle, Shield, GraduationCap, Briefcase, Globe, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useContactStatusRecords } from '@/lib/queries/lifecycle'
import { useLocale } from '@/lib/i18n/use-locale'
import type { DictionaryKey } from '@/lib/i18n/dictionaries/en'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ExpiryTrackerProps {
  contactId: string
}

// ── Status Type Config ─────────────────────────────────────────────────────────

const STATUS_TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; colour: string }> = {
  passport: {
    label: 'Passport',
    icon: <Shield className="h-4 w-4" />,
    colour: 'text-indigo-600 dark:text-indigo-400',
  },
  work_permit: {
    label: 'Work Permit',
    icon: <Briefcase className="h-4 w-4" />,
    colour: 'text-blue-600 dark:text-blue-400',
  },
  study_permit: {
    label: 'Study Permit',
    icon: <GraduationCap className="h-4 w-4" />,
    colour: 'text-purple-600 dark:text-purple-400',
  },
  pr: {
    label: 'Permanent Residence',
    icon: <Shield className="h-4 w-4" />,
    colour: 'text-green-600 dark:text-green-400',
  },
  citizenship: {
    label: 'Citizenship',
    icon: <Shield className="h-4 w-4" />,
    colour: 'text-emerald-600 dark:text-emerald-400',
  },
  visa: {
    label: 'Visa',
    icon: <Globe className="h-4 w-4" />,
    colour: 'text-orange-600 dark:text-orange-400',
  },
  travel_document: {
    label: 'Travel Document',
    icon: <Globe className="h-4 w-4" />,
    colour: 'text-teal-600 dark:text-teal-400',
  },
  eid: {
    label: 'eID / National ID',
    icon: <Shield className="h-4 w-4" />,
    colour: 'text-slate-600 dark:text-slate-400',
  },
  drivers_licence: {
    label: "Driver's Licence",
    icon: <Briefcase className="h-4 w-4" />,
    colour: 'text-cyan-600 dark:text-cyan-400',
  },
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getDaysUntilExpiry(expiryDate: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expiry = new Date(expiryDate)
  return Math.ceil((expiry.getTime() - today.getTime()) / 86400000)
}

function getExpiryBadge(days: number, t: (key: DictionaryKey, fallback?: string) => string) {
  const remaining = t('status.days_remaining', `${days}d remaining`).replace('{days}', String(days))
  if (days < 0) {
    return <Badge variant="destructive">{t('status.expired', 'Expired')}</Badge>
  }
  if (days <= 14) {
    return <Badge variant="destructive">{remaining}</Badge>
  }
  if (days <= 30) {
    return <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300">{remaining}</Badge>
  }
  if (days <= 60) {
    return <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300">{remaining}</Badge>
  }
  return <Badge variant="secondary">{remaining}</Badge>
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ExpiryTracker({ contactId }: ExpiryTrackerProps) {
  const { data: records, isLoading } = useContactStatusRecords(contactId)
  const { t, locale } = useLocale()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!records || records.length === 0) {
    return (
      <div className="text-center py-6 text-sm text-muted-foreground">
        <Clock className="h-8 w-8 mx-auto mb-2 opacity-30" />
        No status records on file for this contact.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Clock className="h-4 w-4" />
        Immigration Status Records
      </div>

      <div className="grid gap-2">
        {records.map((record) => {
          const days = getDaysUntilExpiry(record.expiry_date)
          const config = STATUS_TYPE_CONFIG[record.status_type] ?? {
            label: record.status_type,
            icon: <Globe className="h-4 w-4" />,
            colour: 'text-muted-foreground',
          }

          return (
            <div
              key={record.id}
              className={cn(
                'flex items-center gap-3 rounded-lg border p-3 transition-colors',
                days < 0 && 'border-red-300 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20',
                days >= 0 && days <= 30 && 'border-red-200 bg-red-50/30 dark:border-red-900 dark:bg-red-950/10 animate-pulse',
                days > 30 && days <= 90 && 'border-amber-300 bg-amber-50/30 dark:border-amber-800 dark:bg-amber-950/10',
              )}
            >
              <div className={cn('shrink-0', config.colour)}>
                {config.icon}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{config.label}</span>
                  {days < 0 && (
                    <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                  )}
                  {days >= 0 && days <= 90 && (
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  )}
                </div>
                <div className={cn(
                  'text-xs mt-0.5',
                  days < 0
                    ? 'text-red-600 dark:text-red-400 font-medium'
                    : days <= 90
                      ? 'text-amber-600 dark:text-amber-400 font-medium'
                      : 'text-muted-foreground'
                )}>
                  Issued: {new Date(record.issue_date).toLocaleDateString('en-CA')}
                  {' — '}
                  Expires: {new Date(record.expiry_date).toLocaleDateString('en-CA')}
                </div>
                {record.document_reference && (
                  <div className="text-xs text-muted-foreground">
                    Ref: {record.document_reference}
                  </div>
                )}
              </div>

              <div className="shrink-0" data-locale={locale}>
                {getExpiryBadge(days, t)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
