'use client'

import { useState, useCallback } from 'react'
import { SignaturePad } from '@/components/esign/signature-pad'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SigningPageClientProps {
  token: string
  signerName: string
  signerEmail: string
  documentTitle: string
  matterReference: string
  expiresAt: string
  status: string
  firmName: string
  firmLogoUrl: string | null
  primaryColor: string
  alreadySigned: boolean
  signedAt?: string
}

interface SignatureData {
  dataUrl: string
  mode: 'drawn' | 'typed'
  typedName?: string
}

type PageView = 'signing' | 'success' | 'declined'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-CA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      />
    </svg>
  )
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className ?? ''}`}
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"
      />
    </svg>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SigningPageClient({
  token,
  signerName,
  signerEmail,
  documentTitle,
  matterReference,
  expiresAt,
  status,
  firmName,
  firmLogoUrl,
  primaryColor,
  alreadySigned,
  signedAt,
}: SigningPageClientProps) {
  // ── State ─────────────────────────────────────────────────────────────────

  const [view, setView] = useState<PageView>(
    alreadySigned ? 'success' : 'signing'
  )
  const [consentChecked, setConsentChecked] = useState(false)
  const [signatureData, setSignatureData] = useState<SignatureData | null>(null)
  const [signatureMode, setSignatureMode] = useState<'draw' | 'type'>('draw')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeclining, setIsDeclining] = useState(false)
  const [showDeclineDialog, setShowDeclineDialog] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [completedSignedAt, setCompletedSignedAt] = useState<string | undefined>(signedAt)

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSignatureChange = useCallback(
    (data: { dataUrl: string; mode: 'drawn' | 'typed'; typedName?: string } | null) => {
      setSignatureData(data)
    },
    []
  )

  const consentText = `I, ${signerName}, have reviewed the document titled '${documentTitle}' presented above. I understand that by signing electronically, my signature has the same legal effect as a handwritten signature. I agree to sign this document electronically.`

  const canSign = consentChecked && signatureData !== null

  const handleSign = async () => {
    if (!canSign || !signatureData) return

    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      const response = await fetch(`/api/signing/${token}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signatureDataUrl: signatureData.dataUrl,
          signatureMode: signatureData.mode,
          typedName: signatureData.typedName,
          consentText,
        }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to submit signature')
      }

      setCompletedSignedAt(new Date().toISOString())
      setView('success')
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'An unexpected error occurred'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDecline = async () => {
    setIsDeclining(true)
    setErrorMessage(null)

    try {
      const response = await fetch(`/api/signing/${token}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: declineReason.trim() || undefined,
        }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to decline')
      }

      setShowDeclineDialog(false)
      setView('declined')
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'An unexpected error occurred'
      )
    } finally {
      setIsDeclining(false)
    }
  }

  // ── Firm Header ───────────────────────────────────────────────────────────

  const firmHeader = (
    <div className="flex items-center gap-3 pb-6 border-b border-slate-200">
      {firmLogoUrl ? (
        <img
          src={firmLogoUrl}
          alt={firmName}
          className="h-10 w-auto max-w-[160px] object-contain"
        />
      ) : (
        <div
          className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold text-lg"
          style={{ backgroundColor: primaryColor || '#1e293b' }}
        >
          {firmName.charAt(0).toUpperCase()}
        </div>
      )}
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{firmName}</h2>
        {matterReference && (
          <p className="text-xs text-slate-500">Ref: {matterReference}</p>
        )}
      </div>
    </div>
  )

  // ── Already Signed / Success View ─────────────────────────────────────────

  if (view === 'success') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-start justify-center p-4 pt-12 sm:pt-20">
        <div className="w-full max-w-[800px] bg-white rounded-xl shadow-sm border border-slate-200 p-6 sm:p-10">
          {firmHeader}

          <div className="mt-10 text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
              <CheckCircleIcon className="w-8 h-8 text-emerald-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">
              Document Signed
            </h1>
            {completedSignedAt && (
              <p className="text-sm text-slate-600">
                This document was signed on {formatDate(completedSignedAt)}
              </p>
            )}
            <p className="text-sm text-slate-500">
              Signed by {signerName} ({signerEmail})
            </p>

            <div className="pt-4">
              <a
                href={`/api/signing/${token}/document`}
                className="inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-medium text-white transition-colors hover:opacity-90"
                style={{ backgroundColor: primaryColor || '#1e293b' }}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
                  />
                </svg>
                Download Signed Copy
              </a>
            </div>
          </div>

          <div className="mt-12 pt-6 border-t border-slate-100 text-center">
            <p className="text-xs text-slate-400">Powered by NorvaOS</p>
          </div>
        </div>
      </div>
    )
  }

  // ── Declined View ─────────────────────────────────────────────────────────

  if (view === 'declined') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-start justify-center p-4 pt-12 sm:pt-20">
        <div className="w-full max-w-[800px] bg-white rounded-xl shadow-sm border border-slate-200 p-6 sm:p-10">
          {firmHeader}

          <div className="mt-10 text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
              <InfoIcon className="w-8 h-8 text-slate-500" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">
              Signing Declined
            </h1>
            <p className="text-sm text-slate-600">
              You have declined to sign this document. Your law firm has been
              notified and will follow up with you.
            </p>
            <p className="text-sm text-slate-500 mt-2">
              If you declined in error, please contact {firmName} directly.
            </p>
          </div>

          <div className="mt-12 pt-6 border-t border-slate-100 text-center">
            <p className="text-xs text-slate-400">Powered by NorvaOS</p>
          </div>
        </div>
      </div>
    )
  }

  // ── Active Signing View ───────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 flex items-start justify-center p-4 pt-8 sm:pt-14">
      <div className="w-full max-w-[800px] space-y-6">
        {/* Main Card */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 sm:p-10">
          {firmHeader}

          {/* Document Title */}
          <div className="mt-6">
            <h1 className="text-xl font-bold text-slate-900">
              {documentTitle}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Please review the document below, then provide your electronic
              signature.
            </p>
          </div>

          {/* Section 1: Document Viewer */}
          <div className="mt-8">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              View Document
            </label>
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <iframe
                src={`/api/signing/${token}/document`}
                className="w-full border-0"
                style={{ minHeight: '500px' }}
                title={documentTitle}
              />
            </div>
          </div>

          {/* Section 2: Consent */}
          <div className="mt-8">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consentChecked}
                  onChange={(e) => setConsentChecked(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-700 leading-relaxed">
                  {consentText}
                </span>
              </label>
            </div>
          </div>

          {/* Section 3: Signature Capture */}
          <div className="mt-8">
            <label className="block text-sm font-medium text-slate-700 mb-3">
              Your Signature
            </label>

            {/* Mode Toggle */}
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5 mb-4">
              <button
                type="button"
                onClick={() => {
                  setSignatureMode('draw')
                  setSignatureData(null)
                }}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  signatureMode === 'draw'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Draw
              </button>
              <button
                type="button"
                onClick={() => {
                  setSignatureMode('type')
                  setSignatureData(null)
                }}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  signatureMode === 'type'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Type
              </button>
            </div>

            <SignaturePad
              mode={signatureMode}
              signerName={signerName}
              onSignatureChange={handleSignatureChange}
              disabled={isSubmitting}
            />
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="mt-4 rounded-lg bg-red-50 border border-red-200 p-3">
              <p className="text-sm text-red-700">{errorMessage}</p>
            </div>
          )}

          {/* Section 4: Actions */}
          <div className="mt-8 flex flex-col sm:flex-row items-center gap-3">
            <button
              type="button"
              onClick={handleSign}
              disabled={!canSign || isSubmitting}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg px-8 py-3 text-sm font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
              style={{ backgroundColor: primaryColor || '#1e293b' }}
            >
              {isSubmitting ? (
                <>
                  <SpinnerIcon className="w-4 h-4" />
                  Signing...
                </>
              ) : (
                'Sign Document'
              )}
            </button>

            <button
              type="button"
              onClick={() => setShowDeclineDialog(true)}
              disabled={isSubmitting}
              className="w-full sm:w-auto inline-flex items-center justify-center rounded-lg border border-slate-300 px-6 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Decline to Sign
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center space-y-1 pb-8">
          {expiresAt && (
            <p className="text-xs text-slate-400">
              This link expires on {formatDate(expiresAt)}
            </p>
          )}
          <p className="text-xs text-slate-400">Powered by NorvaOS</p>
        </div>
      </div>

      {/* Decline Dialog Overlay */}
      {showDeclineDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md bg-white rounded-xl shadow-xl p-6 space-y-4">
            <h3 className="text-lg font-semibold text-slate-900">
              Decline to Sign
            </h3>
            <p className="text-sm text-slate-600">
              Are you sure you want to decline signing this document? Your law
              firm will be notified.
            </p>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Reason (optional)
              </label>
              <textarea
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                rows={3}
                placeholder="Please let us know why you are declining..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
              />
            </div>

            {errorMessage && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3">
                <p className="text-sm text-red-700">{errorMessage}</p>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowDeclineDialog(false)
                  setErrorMessage(null)
                }}
                disabled={isDeclining}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDecline}
                disabled={isDeclining}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {isDeclining ? (
                  <>
                    <SpinnerIcon className="w-4 h-4" />
                    Declining...
                  </>
                ) : (
                  'Confirm Decline'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
