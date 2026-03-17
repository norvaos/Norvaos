'use client'

/**
 * ZoneC — Left Rail
 *
 * Collapsible left sidebar (240px expanded, 40px collapsed).
 * Contains file context at a glance:
 *   - Matter type label
 *   - Responsible lawyer
 *   - Date opened + next deadline
 *   - Next action (most urgent open task)
 *   - Open risk flags summary
 *   - Billing snapshot (billed / paid / trust)
 *
 * Spec ref: Section 3 — Zone C: Left Rail
 */

import { useState } from 'react'
import { format } from 'date-fns'
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  User,
  AlertTriangle,
  Clock,
  Briefcase,
  DollarSign,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import { useQuery } from '@tanstack/react-query'
import { useMatterRiskFlags } from '@/lib/queries/stage-transitions'
import type { Database } from '@/lib/types/database'

type Matter = Database['public']['Tables']['matters']['Row']

// ── Props ────────────────────────────────────────────────────────────────────

export interface ZoneCProps {
  matter: Matter
  tenantId: string
}

// ── Component ────────────────────────────────────────────────────────────────

export function ZoneC({ matter, tenantId }: ZoneCProps) {
  const [collapsed, setCollapsed] = useState(false)
  const supabase = createClient()

  // Responsible lawyer
  const { data: lawyer } = useQuery({
    queryKey: ['user_display', matter.responsible_lawyer_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('users')
        .select('id, first_name, last_name, email')
        .eq('id', matter.responsible_lawyer_id!)
        .single()
      return (data ?? null) as {
        id: string
        first_name: string | null
        last_name: string | null
        email: string
      } | null
    },
    enabled: !!matter.responsible_lawyer_id,
    staleTime: 10 * 60 * 1000,
  })

  // Open risk flags
  const { data: riskFlags = [] } = useMatterRiskFlags(matter.id)

  // Most urgent open task (next action)
  const { data: nextTask } = useQuery({
    queryKey: ['matter_next_task', matter.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('tasks')
        .select('id, title, due_date, priority')
        .eq('matter_id', matter.id)
        .eq('status', 'open')
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(1)
        .maybeSingle()
      return (data ?? null) as {
        id: string
        title: string
        due_date: string | null
        priority: string | null
      } | null
    },
    enabled: !!matter.id,
    staleTime: 2 * 60 * 1000,
  })

  const lawyerName = lawyer
    ? [lawyer.first_name, lawyer.last_name].filter(Boolean).join(' ') || lawyer.email
    : null

  const criticalCount = riskFlags.filter(f => f.severity === 'critical').length
  const elevatedCount = riskFlags.filter(f => f.severity === 'elevated').length
  const totalFlags    = riskFlags.length

  const nextDeadlineDate = matter.next_deadline ? new Date(matter.next_deadline) : null
  const isDeadlinePast   = nextDeadlineDate ? nextDeadlineDate < new Date() : false

  // ── Collapsed view (icon strip) ──────────────────────────────────────────
  if (collapsed) {
    return (
      <div className="flex-none w-10 border-r bg-card flex flex-col items-center pt-2 gap-3">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground"
          title="Expand file details"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>

        {totalFlags > 0 && (
          <div
            className={cn(
              'flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold',
              criticalCount > 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700',
            )}
            title={`${totalFlags} open risk ${totalFlags === 1 ? 'flag' : 'flags'}`}
          >
            {totalFlags}
          </div>
        )}

        {nextTask && (
          <span title={`Next action: ${nextTask.title}`}>
            <Clock className="h-3.5 w-3.5 text-amber-500" aria-hidden />
          </span>
        )}
      </div>
    )
  }

  // ── Expanded view ────────────────────────────────────────────────────────
  return (
    <div className="flex-none w-60 border-r bg-card flex flex-col overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b flex-none">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          File Details
        </span>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground"
          title="Collapse left rail"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">

        {/* Matter type */}
        {matter.matter_type && (
          <MetaRow icon={<Briefcase className="h-3.5 w-3.5" />} label="Matter Type">
            <span className="text-xs">{matter.matter_type}</span>
          </MetaRow>
        )}

        {/* Responsible lawyer */}
        <MetaRow icon={<User className="h-3.5 w-3.5" />} label="Responsible Lawyer">
          <span className="text-xs">
            {lawyerName ?? <span className="text-muted-foreground italic">Unassigned</span>}
          </span>
        </MetaRow>

        {/* Date opened */}
        {matter.date_opened && (
          <MetaRow icon={<Calendar className="h-3.5 w-3.5" />} label="Opened">
            <span className="text-xs">
              {format(new Date(matter.date_opened), 'MMM d, yyyy')}
            </span>
          </MetaRow>
        )}

        {/* Next deadline */}
        {nextDeadlineDate && (
          <MetaRow icon={<Clock className="h-3.5 w-3.5" />} label="Next Deadline">
            <span className={cn('text-xs font-medium', isDeadlinePast ? 'text-red-600' : '')}>
              {format(nextDeadlineDate, 'MMM d, yyyy')}
              {isDeadlinePast && <span className="ml-1 text-[10px] text-red-500">overdue</span>}
            </span>
          </MetaRow>
        )}

        {/* Next action */}
        {nextTask && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">
              Next Action
            </p>
            <p className="text-xs text-amber-900 line-clamp-2 leading-snug">
              {nextTask.title}
            </p>
            {nextTask.due_date && (
              <p className="text-[10px] text-amber-600">
                Due {format(new Date(nextTask.due_date), 'MMM d')}
              </p>
            )}
          </div>
        )}

        {/* Risk flags */}
        {totalFlags > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-amber-500" />
              Risk Flags ({totalFlags})
            </p>

            {criticalCount > 0 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-red-50 text-red-700 border-red-300 w-full justify-start gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                {criticalCount} Critical
              </Badge>
            )}
            {elevatedCount > 0 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-orange-50 text-orange-700 border-orange-300 w-full justify-start gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-400 shrink-0" />
                {elevatedCount} Elevated
              </Badge>
            )}

            {/* Show up to 3 flag type labels */}
            {riskFlags.slice(0, 3).map(flag => (
              <p key={flag.id} className="text-[10px] text-muted-foreground truncate pl-1 leading-snug">
                • {flag.flag_type.replace(/_/g, ' ').toLowerCase()}
              </p>
            ))}
            {totalFlags > 3 && (
              <p className="text-[10px] text-muted-foreground pl-1">
                +{totalFlags - 3} more…
              </p>
            )}
          </div>
        )}

        {/* Billing snapshot */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <DollarSign className="h-3 w-3" />
            Billing
          </p>
          <div className="space-y-1 text-[10px]">
            <BillingRow label="Billed"  value={matter.total_billed}  colour="text-foreground" />
            <BillingRow label="Paid"    value={matter.total_paid}    colour="text-green-700" />
            {Number(matter.trust_balance ?? 0) > 0 && (
              <BillingRow label="Trust"   value={matter.trust_balance} colour="text-blue-700" />
            )}
          </div>
        </div>

      </div>
    </div>
  )
}

// ── Helper components ────────────────────────────────────────────────────────

function MetaRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="pl-5">{children}</div>
    </div>
  )
}

function BillingRow({
  label,
  value,
  colour,
}: {
  label: string
  value: string | number | null | undefined
  colour: string
}) {
  if (value === null || value === undefined) return null
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('font-medium tabular-nums', colour)}>
        ${Number(value).toLocaleString('en-CA', { minimumFractionDigits: 0 })}
      </span>
    </div>
  )
}
