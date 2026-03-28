'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/i18n-provider'
import type { DictionaryKey } from '@/lib/i18n/dictionaries/en'

const STATUS_STYLE: Record<string, { i18nKey: DictionaryKey; color: string; bg: string }> = {
  lead: { i18nKey: 'classification.lead', color: 'text-amber-400', bg: 'bg-amber-950/40 border-amber-500/30' },
  client: { i18nKey: 'classification.client', color: 'text-emerald-400', bg: 'bg-emerald-950/40 border-emerald-500/30' },
  former_client: { i18nKey: 'classification.former_client', color: 'text-slate-600', bg: 'bg-slate-100 border-slate-300' },
  lawyer: { i18nKey: 'classification.lawyer', color: 'text-blue-400', bg: 'bg-blue-950/40 border-blue-500/30' },
  ircc_officer: { i18nKey: 'classification.ircc_officer', color: 'text-purple-400', bg: 'bg-purple-950/40 border-purple-500/30' },
  consultant: { i18nKey: 'classification.consultant', color: 'text-cyan-700', bg: 'bg-cyan-100 border-cyan-300' },
  judge: { i18nKey: 'classification.judge', color: 'text-rose-700', bg: 'bg-rose-100 border-rose-300' },
  referral_source: { i18nKey: 'classification.referral_source', color: 'text-orange-400', bg: 'bg-orange-950/40 border-orange-500/30' },
  government: { i18nKey: 'classification.government', color: 'text-indigo-700', bg: 'bg-indigo-100 border-indigo-300' },
  vendor: { i18nKey: 'classification.vendor', color: 'text-teal-700', bg: 'bg-teal-100 border-teal-300' },
  other_professional: { i18nKey: 'classification.other_professional', color: 'text-gray-700', bg: 'bg-gray-100 border-gray-300' },
}

interface ClassificationBadgeProps {
  status: string
  className?: string
}

export function ClassificationBadge({ status, className }: ClassificationBadgeProps) {
  const { t } = useI18n()
  const config = STATUS_STYLE[status] ?? STATUS_STYLE.lead
  return (
    <Badge
      variant="outline"
      className={cn(config.bg, config.color, 'font-medium', className)}
    >
      {t(config.i18nKey)}
    </Badge>
  )
}
