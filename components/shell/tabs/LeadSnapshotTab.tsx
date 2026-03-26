'use client'

/**
 * Lead Snapshot Tab — "Intake History"
 *
 * Shows the lawyer all data captured during the lead intake phase,
 * migrated into matter_custom_data during conversion. This ensures
 * the lawyer can see their previous work was preserved.
 */

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { FileText, Calendar, User, Globe, Briefcase, AlertCircle } from 'lucide-react'

interface LeadSnapshotTabProps {
  matterId: string
  tenantId: string
}

// Human-readable labels for common intake field keys
const FIELD_LABELS: Record<string, string> = {
  processing_stream: 'Processing Stream',
  program_category: 'Programme Category',
  passport_number: 'Passport Number',
  passport_expiry: 'Passport Expiry',
  uci_number: 'UCI Number',
  dli_number: 'DLI Number',
  country_of_birth: 'Country of Birth',
  country_of_residence: 'Country of Residence',
  nationality: 'Nationality',
  immigration_status: 'Immigration Status',
  immigration_status_expiry: 'Status Expiry',
  marital_status: 'Marital Status',
  currently_in_canada: 'Currently in Canada',
  date_of_birth: 'Date of Birth',
  sponsor_contact_id: 'Sponsor (Contact ID)',
  estimated_value: 'Estimated Value',
  source: 'Lead Source',
  source_detail: 'Source Detail',
  temperature: 'Lead Temperature',
  notes: 'Intake Notes',
  preferred_language: 'Preferred Language',
  urgency: 'Urgency Level',
}

function formatFieldValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}

function getSectionIcon(sectionKey: string) {
  switch (sectionKey) {
    case 'lead_intake_data': return <FileText className="size-4" />
    case 'lead_custom_fields': return <Briefcase className="size-4" />
    case 'lead_metadata': return <Globe className="size-4" />
    default: return <FileText className="size-4" />
  }
}

function getSectionLabel(sectionKey: string) {
  switch (sectionKey) {
    case 'lead_intake_data': return 'AI Intake Data'
    case 'lead_custom_fields': return 'Custom Fields'
    case 'lead_metadata': return 'Lead Metadata'
    default: return sectionKey.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  }
}

export function LeadSnapshotTab({ matterId, tenantId }: LeadSnapshotTabProps) {
  const { data: snapshots, isLoading } = useQuery({
    queryKey: ['matter-lead-snapshot', matterId],
    queryFn: async () => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('matter_custom_data')
        .select('section_key, data, created_at, updated_at')
        .eq('matter_id', matterId)
        .in('section_key', ['lead_intake_data', 'lead_custom_fields', 'lead_metadata'])
        .order('created_at', { ascending: true })

      if (error) throw error
      return (data ?? []) as { section_key: string; data: Record<string, unknown> | null; created_at: string | null; updated_at: string | null }[]
    },
    enabled: !!matterId,
    staleTime: 1000 * 60 * 5,
  })

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  if (!snapshots || snapshots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <AlertCircle className="size-10 mb-3 opacity-40" />
        <p className="text-sm font-medium">No Intake History</p>
        <p className="text-xs mt-1">This matter was not created from a lead conversion, or no intake data was captured.</p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <User className="size-5 text-primary" />
        <h3 className="text-base font-semibold">Lead Snapshot</h3>
        <Badge variant="secondary" className="text-xs">
          Preserved at Conversion
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        All data captured during the intake phase. This is a read-only snapshot of what was recorded before the matter was opened.
      </p>

      {snapshots.map((snapshot) => {
        const data = (snapshot.data ?? {}) as Record<string, unknown>
        const entries = Object.entries(data).filter(([, v]) => v !== null && v !== undefined && v !== '')

        if (entries.length === 0) return null

        return (
          <div key={snapshot.section_key} className="rounded-lg border bg-white">
            <div className="flex items-center gap-2 px-4 py-3 border-b bg-slate-50 rounded-t-lg">
              {getSectionIcon(snapshot.section_key)}
              <span className="text-sm font-medium">{getSectionLabel(snapshot.section_key)}</span>
              {snapshot.created_at && (
                <span className="ml-auto text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="size-3" />
                  {new Date(snapshot.created_at).toLocaleDateString('en-CA')}
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-0">
              {entries.map(([key, value]) => (
                <div key={key} className="flex flex-col px-4 py-2.5 border-b last:border-b-0 odd:border-r">
                  <span className="text-xs text-muted-foreground">
                    {FIELD_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </span>
                  <span className="text-sm font-medium mt-0.5 break-words">
                    {typeof value === 'object' && value !== null ? (
                      <pre className="text-xs bg-slate-50 rounded p-2 mt-1 overflow-x-auto whitespace-pre-wrap">
                        {JSON.stringify(value, null, 2)}
                      </pre>
                    ) : (
                      formatFieldValue(key, value)
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
