'use client'

import { Badge } from '@/components/ui/badge'
import {
  FileText,
  Clock,
  CheckCircle2,
  Send,
  PenLine,
  XCircle,
  Ban,
  Timer,
  ArrowRightLeft,
} from 'lucide-react'

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  draft: { label: 'Draft', color: 'text-gray-600 bg-gray-50 border-gray-200', icon: FileText },
  pending_review: { label: 'Pending Review', color: 'text-amber-600 bg-amber-50 border-amber-200', icon: Clock },
  approved: { label: 'Approved', color: 'text-blue-600 bg-blue-50 border-blue-200', icon: CheckCircle2 },
  sent: { label: 'Sent', color: 'text-indigo-600 bg-indigo-50 border-indigo-200', icon: Send },
  partially_signed: { label: 'Partially Signed', color: 'text-purple-600 bg-purple-50 border-purple-200', icon: PenLine },
  signed: { label: 'Signed', color: 'text-green-600 bg-green-50 border-green-200', icon: CheckCircle2 },
  declined: { label: 'Declined', color: 'text-red-600 bg-red-50 border-red-200', icon: XCircle },
  voided: { label: 'Voided', color: 'text-red-600 bg-red-50 border-red-200', icon: Ban },
  expired: { label: 'Expired', color: 'text-orange-600 bg-orange-50 border-orange-200', icon: Timer },
  superseded: { label: 'Superseded', color: 'text-gray-500 bg-gray-50 border-gray-200', icon: ArrowRightLeft },
}

export function DocumentStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? { label: status, color: 'text-gray-600 bg-gray-50 border-gray-200', icon: FileText }
  const Icon = config.icon

  return (
    <Badge variant="outline" className={`gap-1 ${config.color}`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  )
}

const TEMPLATE_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'text-gray-600 bg-gray-50 border-gray-200' },
  published: { label: 'Published', color: 'text-green-600 bg-green-50 border-green-200' },
  archived: { label: 'Archived', color: 'text-orange-600 bg-orange-50 border-orange-200' },
  superseded: { label: 'Superseded', color: 'text-gray-500 bg-gray-50 border-gray-200' },
}

export function TemplateStatusBadge({ status }: { status: string }) {
  const config = TEMPLATE_STATUS_CONFIG[status] ?? { label: status, color: 'text-gray-600 bg-gray-50 border-gray-200' }

  return (
    <Badge variant="outline" className={`gap-1 ${config.color}`}>
      {config.label}
    </Badge>
  )
}
