'use client'

import { useCommandCentre } from '../command-centre-context'
import { CategorizedDocumentInbox } from './categorized-document-inbox'
import { DocumentSlotPanel } from '@/components/matters/document-slot-panel'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'

// ─── Component ──────────────────────────────────────────────────────

/**
 * Switches between pre-retainer document inbox and post-retained
 * document slot panel based on entity context.
 *
 * - Lead mode (or matter without slots) → <DocumentInbox />
 * - Matter mode with active document slots → <DocumentSlotPanel />
 */
export function DocumentPanelSwitcher() {
  const { entityType, entityId, tenantId, isConverted, lead } = useCommandCentre()

  const matterId = entityType === 'matter' ? entityId : (lead?.converted_matter_id ?? null)

  // Check if the matter has active document slots
  const { data: slotCount } = useQuery({
    queryKey: ['document-slot-count', matterId],
    queryFn: async () => {
      const supabase = createClient()
      const { count, error } = await supabase
        .from('document_slots')
        .select('id', { count: 'exact', head: true })
        .eq('matter_id', matterId!)
        .eq('is_active', true)
      if (error) throw error
      return count ?? 0
    },
    enabled: !!matterId,
  })

  const hasSlots = (slotCount ?? 0) > 0

  // Post-retained: show document slot panel
  if (matterId && hasSlots) {
    return (
      <div>
        <div className="mb-2 flex items-center gap-2">
          <Badge variant="secondary" className="text-[10px] bg-green-100 text-emerald-400 border-green-200">
            Post-Retained
          </Badge>
          <span className="text-[10px] text-slate-500">
            Document slot enforcement active
          </span>
        </div>
        <DocumentSlotPanel
          matterId={matterId}
          tenantId={tenantId}
          enforcementEnabled={true}
        />
      </div>
    )
  }

  // Pre-retainer: show categorized inbox
  return <CategorizedDocumentInbox />
}
