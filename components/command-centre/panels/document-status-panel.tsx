'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useCommandCentre } from '../command-centre-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  FileCheck,
  FileX2,
  File,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react'

// ─── Hook ───────────────────────────────────────────────────────────

function useMatterDocumentSlots(matterId: string, tenantId: string) {
  return useQuery({
    queryKey: ['matter-doc-slots', matterId],
    queryFn: async () => {
      const supabase = createClient()

      // Get document slots for this matter
      const { data: slots, error } = await supabase
        .from('document_slots')
        .select('id, slot_name, category, is_required, status, current_document_id, sort_order')
        .eq('matter_id', matterId)
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('category')
        .order('sort_order')

      if (error) throw error
      return slots ?? []
    },
    enabled: !!matterId && !!tenantId,
    refetchInterval: 30_000,
  })
}

// ─── Status config ──────────────────────────────────────────────────

const SLOT_STATUS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  pending: { label: 'Pending', icon: <File className="h-3.5 w-3.5" />, color: 'text-amber-600 bg-amber-50 border-amber-200' },
  uploaded: { label: 'Uploaded', icon: <FileCheck className="h-3.5 w-3.5" />, color: 'text-blue-600 bg-blue-50 border-blue-200' },
  approved: { label: 'Approved', icon: <CheckCircle2 className="h-3.5 w-3.5" />, color: 'text-green-600 bg-green-50 border-green-200' },
  rejected: { label: 'Rejected', icon: <FileX2 className="h-3.5 w-3.5" />, color: 'text-red-600 bg-red-50 border-red-200' },
  not_applicable: { label: 'N/A', icon: <File className="h-3.5 w-3.5" />, color: 'text-slate-400 bg-slate-50 border-slate-200' },
}

// ─── Component ──────────────────────────────────────────────────────

/**
 * Document Status Panel — shows document slot completion for the matter.
 * Missing required docs are highlighted.
 *
 * Rule #14: Document requests triggered only when retained, with controlled overrides.
 * Rule #19: No N+1 — single consolidated query.
 */
export function DocumentStatusPanel() {
  const { entityId, tenantId, entityType } = useCommandCentre()
  const { data: slots, isLoading } = useMatterDocumentSlots(entityId, tenantId)

  if (entityType !== 'matter') return null

  // Compute stats
  const total = slots?.length ?? 0
  const completed = slots?.filter((s) => s.status === 'approved').length ?? 0
  const uploaded = slots?.filter((s) => s.status === 'uploaded').length ?? 0
  const pending = slots?.filter((s) => s.status === 'pending' && s.is_required).length ?? 0
  const rejected = slots?.filter((s) => s.status === 'rejected').length ?? 0

  // Group by category
  const grouped = (slots ?? []).reduce<Record<string, typeof slots>>((acc, slot) => {
    const cat = slot.category ?? 'Uncategorized'
    if (!acc[cat]) acc[cat] = []
    acc[cat]!.push(slot)
    return acc
  }, {})

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2 text-slate-700">
          <FileCheck className="h-4 w-4" />
          Document Status
          {total > 0 && (
            <Badge variant="secondary" className="ml-1 text-xs">
              {completed}/{total}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : total === 0 ? (
          <p className="text-sm text-slate-500 text-center py-6">
            No document slots configured for this matter.
          </p>
        ) : (
          <div className="space-y-4">
            {/* Progress bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-500">
                <span>{completed} approved of {total} documents</span>
                <span>{Math.round((completed / total) * 100)}%</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all"
                  style={{ width: `${(completed / total) * 100}%` }}
                />
              </div>
            </div>

            {/* Warnings */}
            {pending > 0 && (
              <div className="flex items-center gap-2 p-2 bg-amber-50 rounded-md border border-amber-200">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                <span className="text-xs text-amber-700">
                  {pending} required document{pending > 1 ? 's' : ''} still pending
                </span>
              </div>
            )}
            {rejected > 0 && (
              <div className="flex items-center gap-2 p-2 bg-red-50 rounded-md border border-red-200">
                <FileX2 className="h-4 w-4 text-red-600 shrink-0" />
                <span className="text-xs text-red-700">
                  {rejected} document{rejected > 1 ? 's' : ''} rejected — needs resubmission
                </span>
              </div>
            )}

            {/* Grouped document list */}
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {Object.entries(grouped).map(([category, catSlots]) => (
                <div key={category}>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    {category}
                  </p>
                  <div className="space-y-1">
                    {catSlots!.map((slot) => {
                      const statusConfig = SLOT_STATUS[slot.status] ?? SLOT_STATUS.pending
                      const isMissing = slot.is_required && slot.status === 'pending'

                      return (
                        <div
                          key={slot.id}
                          className={`flex items-center justify-between p-2 rounded-md text-xs ${
                            isMissing ? 'bg-amber-50/50 border border-amber-100' : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className={statusConfig.color.split(' ')[0]}>
                              {statusConfig.icon}
                            </span>
                            <span className={`text-slate-700 ${isMissing ? 'font-medium' : ''}`}>
                              {slot.slot_name}
                            </span>
                            {slot.is_required && (
                              <span className="text-red-400 text-[10px]">required</span>
                            )}
                          </div>
                          <Badge
                            variant="outline"
                            className={`text-[10px] py-0 h-5 ${statusConfig.color}`}
                          >
                            {statusConfig.label}
                          </Badge>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
