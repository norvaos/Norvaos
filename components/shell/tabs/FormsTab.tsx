'use client'

/**
 * FormsTab  -  Zone D tab #3
 *
 * Displays IRCC form instance statuses for this matter, grouped by person.
 * Data sourced from matter_form_instances via the IRCC form engine.
 * Download links sourced from form_pack_versions (latest version).
 */

import { useQuery } from '@tanstack/react-query'
import {
  FileText,
  CheckCircle2,
  Download,
  PackageOpen,
  User,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'

import { getFormInstanceStatuses } from '@/lib/services/ircc-form-engine'
import type { FormInstanceStatus } from '@/lib/services/ircc-form-engine'
import { useFormPackVersions } from '@/lib/queries/form-packs'

// ── Status badge config ───────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  FormInstanceStatus['status'],
  { label: string; className: string }
> = {
  not_started: {
    label: 'Not Started',
    className: 'bg-slate-100 text-slate-600 border-slate-200',
  },
  in_progress: {
    label: 'In Progress',
    className: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  complete: {
    label: 'Complete',
    className: 'bg-green-50 text-green-700 border-green-200',
  },
  submitted: {
    label: 'Submitted',
    className: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface FormsTabProps {
  matterId: string
  matterStatus?: string
}

// ── Component ─────────────────────────────────────────────────────────────────

export function FormsTab({ matterId, matterStatus: _matterStatus }: FormsTabProps) {
  const supabase = createClient()

  const { data: instances, isLoading } = useQuery({
    queryKey: ['form-instances', matterId],
    queryFn: () => getFormInstanceStatuses(supabase, matterId),
    enabled: !!matterId,
  })

  // Latest form pack version for download link
  const { data: packVersions } = useFormPackVersions(matterId)
  const latestPack = packVersions?.[0] ?? null

  // Stats
  const total = instances?.length ?? 0
  const complete = instances?.filter(
    i => i.status === 'complete' || i.status === 'submitted'
  ).length ?? 0
  const progressPct = total > 0 ? Math.round((complete / total) * 100) : 0

  // Group by person (personRole + personId). null personId = matter-level.
  const grouped = groupByPerson(instances ?? [])

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-md" />
        ))}
      </div>
    )
  }

  if (!instances || instances.length === 0) {
    return (
      <div className="p-6 flex flex-col items-center justify-center gap-4 text-center">
        <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center">
          <PackageOpen className="h-6 w-6 text-slate-400" />
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            Norva Submission Engine is ready.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Click Generate Pack to create form instances for this matter and begin your submission.
          </p>
        </div>
        <GeneratePackButton matterId={matterId} />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-card shrink-0">
        <div className="flex items-center gap-3">
          <div>
            <p className="text-sm font-semibold">
              {complete} of {total} form{total !== 1 ? 's' : ''} complete
            </p>
            <div className="mt-1 w-48">
              <Progress value={progressPct} className="h-1.5" />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {latestPack && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5"
              onClick={() => {
                // Artifacts are queried separately per version; navigate to the
                // matter's form pack detail page or trigger a download via API.
                // For now this is a non-destructive no-op placeholder.
              }}
            >
              <Download className="h-3 w-3" />
              Pack v{latestPack.version_number}
            </Button>
          )}
          <GeneratePackButton matterId={matterId} />
        </div>
      </div>

      {/* Form cards grouped by person */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {grouped.map(group => (
          <Card key={group.key}>
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wide">
                <User className="h-3.5 w-3.5" />
                {group.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3 space-y-2">
              {group.forms.map(form => (
                <FormCard key={`${form.formId}-${form.personId}`} form={form} />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ── FormCard ──────────────────────────────────────────────────────────────────

function FormCard({ form }: { form: FormInstanceStatus }) {
  const config = STATUS_CONFIG[form.status]
  const isDone = form.status === 'complete' || form.status === 'submitted'

  return (
    <div className="flex items-center gap-3 rounded-md border bg-card px-3 py-2.5">
      {/* Status icon */}
      <div className={cn(
        'h-7 w-7 rounded-full flex items-center justify-center shrink-0',
        isDone ? 'bg-green-50' : 'bg-slate-50'
      )}>
        {isDone
          ? <CheckCircle2 className="h-4 w-4 text-green-500" />
          : <FileText className="h-4 w-4 text-slate-400" />
        }
      </div>

      {/* Form code + name */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
            {form.formCode}
          </span>
          {!form.isRequired && (
            <span className="text-[10px] text-muted-foreground">Optional</span>
          )}
        </div>
        <p className="text-xs text-foreground mt-0.5 truncate">{form.formName}</p>
      </div>

      {/* Status badge */}
      <Badge
        variant="outline"
        className={cn('text-[10px] shrink-0', config.className)}
      >
        {config.label}
      </Badge>
    </div>
  )
}

// ── GeneratePackButton ────────────────────────────────────────────────────────

function GeneratePackButton({ matterId: _matterId }: { matterId: string }) {
  return (
    <Button size="sm" className="h-7 text-xs gap-1.5">
      <PackageOpen className="h-3 w-3" />
      Generate Pack
    </Button>
  )
}

// ── Grouping helper ───────────────────────────────────────────────────────────

interface PersonGroup {
  key: string
  label: string
  forms: FormInstanceStatus[]
}

function groupByPerson(instances: FormInstanceStatus[]): PersonGroup[] {
  const map = new Map<string, PersonGroup>()

  for (const inst of instances) {
    const key = inst.personId ?? 'matter-level'
    if (!map.has(key)) {
      const label = inst.personRole
        ? inst.personRole.charAt(0).toUpperCase() + inst.personRole.slice(1)
        : 'Matter-Level Forms'
      map.set(key, { key, label, forms: [] })
    }
    map.get(key)!.forms.push(inst)
  }

  // Sort groups: matter-level last
  return [...map.values()].sort((a, b) => {
    if (a.key === 'matter-level') return 1
    if (b.key === 'matter-level') return -1
    return a.label.localeCompare(b.label)
  })
}
