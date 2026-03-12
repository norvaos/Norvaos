'use client'

import { FileText, CreditCard, CheckCircle2, Clock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDate, formatRelativeDate, formatCurrency } from '@/lib/utils/formatters'
import type { LeadRetainerPackageRow } from './lead-workflow-types'

// ─── Status Config ──────────────────────────────────────────────────────────

const RETAINER_STATUS: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-slate-100 text-slate-600 border-slate-200' },
  sent: { label: 'Sent', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  signed: { label: 'Signed', className: 'bg-green-50 text-green-700 border-green-200' },
  declined: { label: 'Declined', className: 'bg-red-50 text-red-600 border-red-200' },
  expired: { label: 'Expired', className: 'bg-amber-50 text-amber-700 border-amber-200' },
}

const PAYMENT_STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: 'Payment Pending', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  partial: { label: 'Partial Payment', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  paid: { label: 'Paid', className: 'bg-green-50 text-green-700 border-green-200' },
  waived: { label: 'Waived', className: 'bg-slate-100 text-slate-600 border-slate-200' },
  refunded: { label: 'Refunded', className: 'bg-red-50 text-red-600 border-red-200' },
}

// ─── Component ──────────────────────────────────────────────────────────────

interface RetainerCardProps {
  retainer: LeadRetainerPackageRow
}

export function RetainerCard({ retainer }: RetainerCardProps) {
  const retainerStatus = RETAINER_STATUS[retainer.status] ?? RETAINER_STATUS.draft
  const paymentBadge = retainer.payment_status
    ? PAYMENT_STATUS[retainer.payment_status] ?? null
    : null

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Retainer</CardTitle>
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" size="xs" className={retainerStatus.className}>
              {retainerStatus.label}
            </Badge>
            {paymentBadge && (
              <Badge variant="outline" size="xs" className={paymentBadge.className}>
                {paymentBadge.label}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Fee */}
        {retainer.amount_requested != null && (
          <div className="flex items-center gap-2 text-sm">
            <CreditCard className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="font-medium">{formatCurrency(retainer.amount_requested)}</span>
            {retainer.template_type && (
              <span className="text-muted-foreground">({retainer.template_type})</span>
            )}
          </div>
        )}

        {/* Timeline */}
        <div className="space-y-1.5">
          {retainer.sent_at && (
            <TimelineItem
              icon={FileText}
              label="Sent"
              date={retainer.sent_at}
            />
          )}
          {retainer.signed_at && (
            <TimelineItem
              icon={CheckCircle2}
              label="Signed"
              date={retainer.signed_at}
              iconClass="text-green-600"
            />
          )}
          {retainer.payment_received_at && (
            <TimelineItem
              icon={CreditCard}
              label="Payment received"
              date={retainer.payment_received_at}
              iconClass="text-green-600"
            />
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Sub-component ──────────────────────────────────────────────────────────

function TimelineItem({
  icon: Icon,
  label,
  date,
  iconClass = 'text-muted-foreground',
}: {
  icon: React.ElementType
  label: string
  date: string
  iconClass?: string
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className={`h-3.5 w-3.5 shrink-0 ${iconClass}`} />
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto text-xs text-muted-foreground">{formatRelativeDate(date)}</span>
    </div>
  )
}
