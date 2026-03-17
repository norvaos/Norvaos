'use client'

/**
 * /admin/critical-actions
 *
 * Displays all matters whose next_action_escalation = 'critical', ordered by
 * next_action_due_at ASC (nulls last). Allows staff to immediately navigate to
 * the matter shell for remediation.
 */

import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface CriticalMatterRow {
  id: string
  matter_number: string | null
  title: string
  next_action_description: string | null
  next_action_due_at: string | null
  next_action_type: string | null
  responsible_lawyer_id: string | null
  // joined
  lawyer_name?: string | null
  client_name?: string | null
}

export default function CriticalActionsPage() {
  const router = useRouter()
  const supabase = createClient()

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ['admin', 'critical-actions'],
    queryFn: async (): Promise<CriticalMatterRow[]> => {
      const { data, error } = await supabase
        .from('matters')
        .select(`
          id,
          matter_number,
          title,
          next_action_description,
          next_action_due_at,
          next_action_type,
          responsible_lawyer_id
        `)
        .eq('next_action_escalation', 'critical')
        .order('next_action_due_at', { ascending: true, nullsFirst: false })
        .limit(200)

      if (error) throw error

      const matters = (data ?? []) as CriticalMatterRow[]

      // Enrich with lawyer display names (one extra query, batched)
      const lawyerIds = [...new Set(matters.map((m) => m.responsible_lawyer_id).filter(Boolean))] as string[]
      let lawyerMap: Record<string, string> = {}
      if (lawyerIds.length > 0) {
        const { data: lawyers } = await supabase
          .from('users')
          .select('id, first_name, last_name, email')
          .in('id', lawyerIds)
        lawyerMap = Object.fromEntries(
          (lawyers ?? []).map((u: { id: string; first_name: string | null; last_name: string | null; email: string }) => [
            u.id,
            [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email,
          ])
        )
      }

      return matters.map((m) => ({
        ...m,
        lawyer_name: m.responsible_lawyer_id ? (lawyerMap[m.responsible_lawyer_id] ?? null) : null,
      }))
    },
    staleTime: 2 * 60 * 1000,
  })

  function handleRowClick(matterId: string) {
    router.push(`/matters/${matterId}/shell?tab=details`)
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-100">
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Critical Actions</h1>
            <p className="text-sm text-muted-foreground">
              Matters requiring immediate attention — escalation level: Critical
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isLoading}
          className="gap-1.5"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading critical actions…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-16 text-center">
          <p className="text-lg font-medium">All clear!</p>
          <p className="text-sm text-muted-foreground mt-1">No matters have critical-level next actions right now.</p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_2fr_3fr_1.5fr_1fr] gap-x-4 px-4 py-2 bg-muted/40 border-b text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Matter #</span>
            <span>Client / Title</span>
            <span>Required Action</span>
            <span>Due</span>
            <span>Lawyer</span>
          </div>

          {/* Rows */}
          <div className="divide-y">
            {rows.map((row) => {
              const dueLabel = row.next_action_due_at
                ? format(parseISO(row.next_action_due_at), "MMM d, yyyy 'at' h:mm a")
                : '—'

              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => handleRowClick(row.id)}
                  className="w-full grid grid-cols-[1fr_2fr_3fr_1.5fr_1fr] gap-x-4 px-4 py-3 text-left hover:bg-accent/50 transition-colors items-center"
                >
                  {/* Matter number */}
                  <span className="font-mono text-xs text-muted-foreground truncate">
                    {row.matter_number ?? '—'}
                  </span>

                  {/* Title */}
                  <span className="text-sm font-medium truncate" title={row.title}>
                    {row.title}
                  </span>

                  {/* Description + type badge */}
                  <div className="flex items-start gap-2 min-w-0">
                    <Badge
                      variant="outline"
                      className="shrink-0 bg-red-50 text-red-700 border-red-300 text-[10px] px-1.5 py-0 uppercase tracking-wider font-bold"
                    >
                      CRITICAL
                    </Badge>
                    <span className="text-xs text-red-900 leading-snug line-clamp-2">
                      {row.next_action_description ?? '—'}
                    </span>
                  </div>

                  {/* Due */}
                  <span className="text-xs text-red-600 font-medium tabular-nums">
                    {dueLabel}
                  </span>

                  {/* Lawyer */}
                  <span className="text-xs text-muted-foreground truncate">
                    {row.lawyer_name ?? '—'}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Footer count */}
          <div className="px-4 py-2 border-t bg-muted/20 text-[11px] text-muted-foreground">
            {rows.length} critical {rows.length === 1 ? 'matter' : 'matters'}
          </div>
        </div>
      )}
    </div>
  )
}
