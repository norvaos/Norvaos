'use client'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertTriangle } from 'lucide-react'

interface OverdueInvoice {
  id: string
  invoice_number?: string
  amount_cents: number
  due_date: string
  days_overdue: number
}

interface OverdueInvoiceBannerProps {
  invoices: OverdueInvoice[]
  matterId?: string
}

function fmtCents(cents: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 2,
  }).format(cents / 100)
}

export function OverdueInvoiceBanner({ invoices, matterId }: OverdueInvoiceBannerProps) {
  if (invoices.length === 0) return null

  const totalOverdueCents = invoices.reduce((sum, inv) => sum + inv.amount_cents, 0)

  return (
    <Alert className="border-red-500/30 bg-red-950/30 text-red-400">
      <AlertTriangle className="h-4 w-4 text-red-600" />
      <AlertTitle className="text-red-400 font-semibold">
        {invoices.length} Invoice{invoices.length > 1 ? 's' : ''} Overdue ({'>'}30 Days)
      </AlertTitle>
      <AlertDescription className="text-red-400">
        <p className="text-sm mt-1">
          Total overdue: <span className="font-semibold">{fmtCents(totalOverdueCents)}</span>
        </p>
        {invoices.length <= 5 && (
          <ul className="mt-2 space-y-1">
            {invoices.map((inv) => (
              <li key={inv.id} className="text-xs flex items-center gap-2">
                <span className="font-medium">
                  {inv.invoice_number ?? inv.id.slice(0, 8)}
                </span>
                <span>{fmtCents(inv.amount_cents)}</span>
                <span className="text-red-500 font-semibold">
                  {inv.days_overdue} days overdue
                </span>
              </li>
            ))}
          </ul>
        )}
      </AlertDescription>
    </Alert>
  )
}
