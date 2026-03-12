'use client'

import { useCommandCentre } from '../command-centre-context'
import { DocumentUpload } from '@/components/shared/document-upload'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FileText, Info } from 'lucide-react'

// ─── Component ──────────────────────────────────────────────────────

export function DocumentInbox() {
  const { entityType, entityId, tenantId } = useCommandCentre()

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2 text-slate-700">
            <FileText className="h-4 w-4" />
            Pre-Retainer Inbox
          </CardTitle>
          <Badge variant="outline" className="text-[10px] text-slate-400 font-normal">
            Staff Reference Only
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Info banner */}
        <div className="flex items-start gap-2 rounded-md border border-blue-100 bg-blue-50/50 px-3 py-2">
          <Info className="mt-0.5 h-3.5 w-3.5 text-blue-400 shrink-0" />
          <p className="text-xs text-blue-600">
            Documents uploaded here are for staff reference only. Slot-based requirements activate after retention.
          </p>
        </div>

        {/* Reuse existing DocumentUpload component */}
        <DocumentUpload
          entityType={entityType === 'matter' ? 'matter' : 'lead'}
          entityId={entityId}
          tenantId={tenantId}
        />
      </CardContent>
    </Card>
  )
}
