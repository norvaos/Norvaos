'use client'

import { useMatterImmigration } from '@/lib/queries/immigration'
import { HelperTip } from '@/components/ui/helper-tip'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

function countFilled(record: Record<string, unknown> | null, keys: string[]): number {
  if (!record) return 0
  return keys.filter(k => {
    const v = record[k as keyof typeof record]
    return v !== null && v !== undefined && v !== '' && v !== 0 && v !== false
  }).length
}

export function MatterReadinessBadge({ matterId }: { matterId: string }) {
  const { data: immigration } = useMatterImmigration(matterId)

  if (!immigration) return null

  const rec = immigration as Record<string, unknown>

  // Same field lists as immigration-details-panel.tsx
  const caseInfo = countFilled(rec, ['case_type_id', 'application_number', 'uci_number', 'program_category'])
  const profile = countFilled(rec, ['country_of_citizenship', 'country_of_residence', 'current_visa_status', 'current_visa_expiry', 'passport_number', 'passport_expiry'])
  const dates = countFilled(rec, ['date_filed', 'date_biometrics', 'date_medical', 'date_interview', 'date_decision', 'date_landing'])
  const lang = countFilled(rec, ['language_test_type', 'education_credential', 'eca_status'])
  const langScores = rec.language_test_scores && typeof rec.language_test_scores === 'object' && Object.keys(rec.language_test_scores as object).length > 0 ? 1 : 0
  const employment = countFilled(rec, ['work_experience_years', 'canadian_work_experience_years', 'employer_name'])

  const filled = caseInfo + profile + dates + lang + langScores + employment
  const total = 4 + 6 + 6 + 4 + 3 // 23 base fields
  const pct = total > 0 ? Math.round((filled / total) * 100) : 0

  const color = pct >= 80 ? 'text-emerald-600' : pct >= 40 ? 'text-amber-600' : 'text-red-500'
  const progressColor = pct >= 80 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-400'

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-2.5">
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Matter Readiness</span>
        <HelperTip contentKey="matter.readiness_score" />
      </div>
      <Progress value={pct} className="h-2 w-24 [&>div]:transition-all" indicatorClassName={progressColor} />
      <span className={cn('text-sm font-semibold tabular-nums', color)}>{pct}%</span>
    </div>
  )
}
