'use client'

import { CheckCircle2, Loader2, AlertCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

export function ScanStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'scanned':
      return (
        <Badge variant="outline" className="gap-1 text-green-600 border-green-200 bg-green-50">
          <CheckCircle2 className="h-3 w-3" />
          Scanned
        </Badge>
      )
    case 'scanning':
      return (
        <Badge variant="outline" className="gap-1 text-blue-600 border-blue-200 bg-blue-50">
          <Loader2 className="h-3 w-3 animate-spin" />
          Scanning
        </Badge>
      )
    case 'error':
      return (
        <Badge variant="outline" className="gap-1 text-red-600 border-red-200 bg-red-50">
          <AlertCircle className="h-3 w-3" />
          Error
        </Badge>
      )
    default:
      return (
        <Badge variant="outline" className="gap-1 text-slate-500 border-slate-200">
          Pending
        </Badge>
      )
  }
}
