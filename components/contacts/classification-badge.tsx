'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  lead: { label: 'Lead', color: 'text-amber-700', bg: 'bg-amber-100 border-amber-300' },
  client: { label: 'Client', color: 'text-emerald-700', bg: 'bg-emerald-100 border-emerald-300' },
  former_client: { label: 'Former Client', color: 'text-slate-600', bg: 'bg-slate-100 border-slate-300' },
  lawyer: { label: 'Lawyer', color: 'text-blue-700', bg: 'bg-blue-100 border-blue-300' },
  ircc_officer: { label: 'IRCC Officer', color: 'text-purple-700', bg: 'bg-purple-100 border-purple-300' },
  consultant: { label: 'Consultant', color: 'text-cyan-700', bg: 'bg-cyan-100 border-cyan-300' },
  judge: { label: 'Judge', color: 'text-rose-700', bg: 'bg-rose-100 border-rose-300' },
  referral_source: { label: 'Referral Source', color: 'text-orange-700', bg: 'bg-orange-100 border-orange-300' },
  government: { label: 'Government', color: 'text-indigo-700', bg: 'bg-indigo-100 border-indigo-300' },
  vendor: { label: 'Vendor', color: 'text-teal-700', bg: 'bg-teal-100 border-teal-300' },
  other_professional: { label: 'Other Professional', color: 'text-gray-700', bg: 'bg-gray-100 border-gray-300' },
}

interface ClassificationBadgeProps {
  status: string
  className?: string
}

export function ClassificationBadge({ status, className }: ClassificationBadgeProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.lead
  return (
    <Badge
      variant="outline"
      className={cn(config.bg, config.color, 'font-medium', className)}
    >
      {config.label}
    </Badge>
  )
}
