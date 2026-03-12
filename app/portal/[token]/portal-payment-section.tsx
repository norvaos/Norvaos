'use client'

/**
 * PortalPaymentSection — Invoice list, retainer summary, mark-as-sent,
 * e-transfer copy, and secure credit card redirect.
 *
 * Business rules (locked):
 * - Mark as Sent creates pending record only, does NOT mark invoice as paid
 * - Dedup prevents repeated submissions
 * - Credit card opens in new tab with security indicators
 */

import { useState, useEffect, useCallback } from 'react'
import { getTranslations, t, type PortalLocale } from '@/lib/utils/portal-translations'
import { track } from '@/lib/utils/portal-analytics'
import type { PortalBillingResponse, PortalInvoice } from '@/lib/types/portal'
import { cn } from '@/lib/utils'

interface PortalPaymentSectionProps {
  token: string
  primaryColor: string
  language: PortalLocale
}

export function PortalPaymentSection({
  token,
  primaryColor,
  language,
}: PortalPaymentSectionProps) {
  const tr = getTranslations(language)
  const [data, setData] = useState<PortalBillingResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchBilling = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/${token}/billing`)
      if (!res.ok) return
      const json: PortalBillingResponse = await res.json()
      setData(json)
    } catch {
      // Fail silently
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    fetchBilling()
  }, [fetchBilling])

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-16 bg-slate-100 rounded-lg" />
        <div className="h-16 bg-slate-100 rounded-lg" />
      </div>
    )
  }

  if (!data || data.invoices.length === 0) {
    return (
      <p className="text-sm text-slate-500 py-4 text-center">
        No invoices on file.
      </p>
    )
  }

  const { invoices, summary, paymentConfig } = data

  return (
    <div className="space-y-4">
      {/* Account Summary Card */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {/* Header */}
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Account Summary</h3>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-3 divide-x divide-slate-100">
          <div className="px-4 py-3 text-center">
            <p className="text-[11px] text-slate-400 font-medium mb-0.5">Total Due</p>
            <p className="text-lg font-bold text-slate-800">
              ${(summary.totalDue / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="px-4 py-3 text-center">
            <p className="text-[11px] text-slate-400 font-medium mb-0.5">Paid to Date</p>
            <p className="text-lg font-bold text-green-600">
              ${(summary.totalPaid / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="px-4 py-3 text-center">
            <p className="text-[11px] text-slate-400 font-medium mb-0.5">Balance</p>
            <p className={cn(
              'text-lg font-bold',
              summary.totalOutstanding <= 0
                ? 'text-green-600'
                : summary.overdueAmount > 0
                  ? 'text-red-600'
                  : 'text-amber-600'
            )}>
              {summary.totalOutstanding <= 0
                ? 'Paid in Full'
                : `$${(summary.totalOutstanding / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        {summary.totalDue > 0 && (
          <div className="px-4 pb-3">
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  summary.totalPaid >= summary.totalDue ? 'bg-green-500' : 'bg-blue-500'
                )}
                style={{ width: `${Math.min((summary.totalPaid / summary.totalDue) * 100, 100)}%` }}
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1 text-right">
              {Math.round((summary.totalPaid / summary.totalDue) * 100)}% paid
            </p>
          </div>
        )}

        {/* Overdue warning */}
        {summary.overdueAmount > 0 && (
          <div className="px-4 py-2 bg-red-50 border-t border-red-100 text-xs text-red-700">
            <span className="font-semibold">${(summary.overdueAmount / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span> is overdue. Please arrange payment at your earliest convenience.
          </div>
        )}
      </div>

      {/* Invoice list */}
      {invoices.map((inv) => (
        <InvoiceRow
          key={inv.id}
          invoice={inv}
          token={token}
          tr={tr}
          primaryColor={primaryColor}
          language={language}
          onMarkedSent={(sentAt: string) => {
            // Update local state to reflect marked-as-sent with timestamp
            setData((prev) => {
              if (!prev) return prev
              return {
                ...prev,
                invoices: prev.invoices.map((i) =>
                  i.id === inv.id ? { ...i, markedAsSent: true, markedAsSentAt: sentAt } : i,
                ),
              }
            })
          }}
        />
      ))}

      {/* Payment instructions */}
      {paymentConfig.e_transfer_email && (
        <ETransferBlock
          email={paymentConfig.e_transfer_email}
          instructions={paymentConfig.e_transfer_instructions ?? paymentConfig.payment_instructions}
          tr={tr}
        />
      )}

      {/* Credit card button */}
      {paymentConfig.credit_card_url && (
        <CreditCardBlock
          url={paymentConfig.credit_card_url}
          label={paymentConfig.credit_card_label}
          tr={tr}
          primaryColor={primaryColor}
          invoiceId={invoices[0]?.id}
        />
      )}
    </div>
  )
}

// ── Invoice Row ──────────────────────────────────────────────────────────────

function InvoiceRow({
  invoice,
  token,
  tr,
  primaryColor,
  language,
  onMarkedSent,
}: {
  invoice: PortalInvoice
  token: string
  tr: ReturnType<typeof getTranslations>
  primaryColor: string
  language: PortalLocale
  onMarkedSent: (sentAt: string) => void
}) {
  const [marking, setMarking] = useState(false)
  const remaining = invoice.totalAmount - invoice.amountPaid
  const isPaidInFull = remaining <= 0

  const handleMarkSent = async () => {
    if (marking || invoice.markedAsSent) return
    setMarking(true)
    try {
      track('payment_mark_sent_clicked', {
        invoice_id: invoice.id,
        invoice_number: invoice.invoiceNumber,
        amount_cents: remaining,
      })
      const res = await fetch(`/api/portal/${token}/billing/mark-sent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: invoice.id }),
      })
      if (res.ok) {
        onMarkedSent(new Date().toISOString())
      }
    } catch {
      // Fail silently
    } finally {
      setMarking(false)
    }
  }

  // Format the marked-as-sent timestamp
  const markedSentDate = invoice.markedAsSentAt
    ? new Date(invoice.markedAsSentAt).toLocaleDateString(language, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        invoice.isOverdue ? 'border-red-200 bg-red-50/30' : 'border-slate-200',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-800">
              {t(tr.payment_invoice ?? 'Invoice #{number}', { number: invoice.invoiceNumber })}
            </span>
            {invoice.isOverdue && (
              <span className="rounded-full bg-red-100 border border-red-200 px-2 py-0.5 text-[10px] font-semibold text-red-700 uppercase">
                {tr.payment_overdue_badge ?? 'Overdue'}
              </span>
            )}
            {isPaidInFull && (
              <span className="rounded-full bg-green-100 border border-green-200 px-2 py-0.5 text-[10px] font-semibold text-green-700 uppercase">
                {tr.payment_paid_in_full ?? 'Paid in full'}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {t(tr.payment_due ?? 'Due {date}', {
              date: invoice.dueDate
                ? new Date(invoice.dueDate).toLocaleDateString(language, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })
                : '—',
            })}
          </p>
          {!isPaidInFull && (
            <p className="text-xs text-slate-600 mt-0.5">
              {t(tr.payment_paid ?? '{paid} of {total} paid', {
                paid: `$${(invoice.amountPaid / 100).toLocaleString()}`,
                total: `$${(invoice.totalAmount / 100).toLocaleString()}`,
              })}
            </p>
          )}

          {/* Overdue + blocks work warning */}
          {invoice.isOverdue && invoice.requiredBeforeWork && (
            <p className="text-xs text-red-700 mt-1 font-medium">
              {tr.payment_overdue_blocks_work ?? 'This payment is required before work can proceed on your file.'}
            </p>
          )}
        </div>

        <div className="text-right shrink-0">
          <p className={cn('text-lg font-semibold', invoice.isOverdue ? 'text-red-700' : 'text-slate-800')}>
            ${(invoice.totalAmount / 100).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Mark as Sent section */}
      {!isPaidInFull && (
        <div className="mt-3 pt-3 border-t border-slate-200/60">
          {invoice.markedAsSent ? (
            <p className="text-xs text-green-700 flex items-center gap-1.5">
              <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              {markedSentDate
                ? t(tr.payment_marked_sent_detail ?? 'e-Transfer notification sent on {date}. Your payment will be confirmed by the office once received.', {
                    date: markedSentDate,
                  })
                : (tr.payment_marked_sent ?? 'e-Transfer notification sent. Your payment will be confirmed by the office once received.')}
            </p>
          ) : (
            <div>
              <button
                onClick={handleMarkSent}
                disabled={marking}
                className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors disabled:opacity-50"
              >
                {marking ? '...' : (tr.payment_mark_sent_button ?? "I've sent an e-transfer")}
              </button>
              <p className="text-[11px] text-slate-400 mt-1">
                {tr.payment_mark_sent_disclaimer ?? 'This notifies your legal team. It does not confirm payment.'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── E-Transfer Block ─────────────────────────────────────────────────────────

function ETransferBlock({
  email,
  instructions,
  tr,
}: {
  email: string
  instructions?: string
  tr: ReturnType<typeof getTranslations>
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(email)
    setCopied(true)
    track('payment_instructions_copied', { email })
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-medium text-slate-600 mb-2">
        {tr.payment_etransfer_email ?? 'e-Transfer to'}
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-sm font-medium text-slate-800 truncate">
          {email}
        </code>
        <button
          onClick={handleCopy}
          className="shrink-0 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
        >
          {copied ? (tr.payment_copied ?? 'Copied!') : (tr.payment_copy ?? 'Copy')}
        </button>
      </div>
      {instructions && (
        <p className="text-xs text-slate-500 mt-2">{instructions}</p>
      )}
    </div>
  )
}

// ── Credit Card Block ────────────────────────────────────────────────────────

function CreditCardBlock({
  url,
  label,
  tr,
  primaryColor,
  invoiceId,
}: {
  url: string
  label?: string
  tr: ReturnType<typeof getTranslations>
  primaryColor: string
  invoiceId?: string
}) {
  const providerName = label || extractDomain(url)

  return (
    <div className="text-center">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => track('payment_credit_card_clicked', {
          invoice_id: invoiceId ?? 'unknown',
          provider: providerName,
        })}
        className="inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-medium text-white transition-colors hover:opacity-90"
        style={{ backgroundColor: primaryColor }}
      >
        {/* Lock icon */}
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        {t(tr.payment_credit_card ?? 'Pay securely via {provider}', {
          provider: providerName,
        })}
      </a>
      <p className="text-[11px] text-slate-400 mt-2">
        {tr.payment_credit_card_hint ?? 'You will be redirected to a secure external payment page.'}
      </p>
    </div>
  )
}

function extractDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname
    // Remove common prefixes
    return hostname.replace(/^(www|pay|checkout|secure)\./, '').split('.')[0] || hostname
  } catch {
    return 'payment provider'
  }
}
