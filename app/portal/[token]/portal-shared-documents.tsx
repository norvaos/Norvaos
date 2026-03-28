'use client'

/**
 * PortalSharedDocuments  -  Documents shared by the firm for client viewing.
 * Shows sent/viewed timestamps. Records first view via PATCH.
 */

import { useState, useEffect, useCallback } from 'react'
import { getTranslations, type PortalLocale } from '@/lib/utils/portal-translations'
import { track } from '@/lib/utils/portal-analytics'
import type { PortalSharedDocument } from '@/lib/types/portal'
import { cn } from '@/lib/utils'

interface PortalSharedDocumentsProps {
  token: string
  primaryColor: string
  language: PortalLocale
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(dateStr: string, language: PortalLocale): string {
  try {
    return new Date(dateStr).toLocaleDateString(language, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

function formatDateTime(dateStr: string, language: PortalLocale): string {
  try {
    return new Date(dateStr).toLocaleDateString(language, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return dateStr
  }
}

function getFileIcon(fileType: string | null): React.ReactNode {
  const isPdf = fileType === 'application/pdf'
  const isImage = fileType?.startsWith('image/')
  const isWord = fileType?.includes('word') || fileType?.includes('document')

  if (isPdf) {
    return (
      <svg className="h-5 w-5 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <path d="M9 15h6" />
        <path d="M9 11h6" />
      </svg>
    )
  }
  if (isImage) {
    return (
      <svg className="h-5 w-5 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
    )
  }
  if (isWord) {
    return (
      <svg className="h-5 w-5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    )
  }
  return (
    <svg className="h-5 w-5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

export function PortalSharedDocuments({
  token,
  primaryColor,
  language,
}: PortalSharedDocumentsProps) {
  const tr = getTranslations(language)
  const [documents, setDocuments] = useState<PortalSharedDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [viewingId, setViewingId] = useState<string | null>(null)

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/${token}/shared-documents`)
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setDocuments(data.documents ?? [])
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  const handleView = async (doc: PortalSharedDocument) => {
    if (viewingId) return
    setViewingId(doc.id)

    try {
      track('shared_document_viewed', {
        document_id: doc.id,
        file_name: doc.file_name,
        was_previously_viewed: !!doc.client_viewed_at,
      })

      const res = await fetch(`/api/portal/${token}/shared-documents`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: doc.id }),
      })

      if (!res.ok) throw new Error('Failed to get document')

      const data = await res.json()

      // Update local state immediately  -  set viewed timestamp
      if (!doc.client_viewed_at) {
        setDocuments((prev) =>
          prev.map((d) =>
            d.id === doc.id
              ? { ...d, client_viewed_at: data.viewed_at }
              : d,
          ),
        )
      }

      // Open in new tab
      if (data.url) {
        window.open(data.url, '_blank', 'noopener,noreferrer')
      }
    } catch {
      // Fail silently
    } finally {
      setViewingId(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-16 bg-slate-100 rounded-2xl" />
        <div className="h-16 bg-slate-100 rounded-2xl" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mx-auto h-12 w-12 rounded-2xl bg-gradient-to-br from-red-50 to-white flex items-center justify-center mb-3 shadow-sm">
          <svg className="h-5 w-5 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <p className="text-sm font-medium text-slate-500">{tr.error_generic}</p>
      </div>
    )
  }

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mx-auto h-12 w-12 rounded-2xl flex items-center justify-center mb-3 shadow-sm" style={{ backgroundColor: `${primaryColor}10` }}>
          <svg className="h-5 w-5" style={{ color: primaryColor }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            <polyline points="16 6 12 2 8 6" />
            <line x1="12" y1="2" x2="12" y2="15" />
          </svg>
        </div>
        <p className="text-sm font-medium text-slate-500">
          {tr.shared_docs_empty ?? 'No documents have been shared with you yet.'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {documents.map((doc) => {
        const isViewed = !!doc.client_viewed_at
        const isViewing = viewingId === doc.id

        return (
          <div
            key={doc.id}
            className="rounded-2xl border border-slate-200/60 bg-gradient-to-br from-slate-50/30 to-white p-4 backdrop-blur-sm transition-all hover:shadow-sm"
          >
            <div className="flex items-start gap-3">
              {/* File icon */}
              <div className="shrink-0 mt-0.5">
                {getFileIcon(doc.file_type)}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">
                      {doc.file_name}
                    </p>
                    {doc.description && (
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                        {doc.description}
                      </p>
                    )}
                  </div>

                  {/* Status badge */}
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium shrink-0',
                      isViewed
                        ? 'bg-emerald-950/30 text-emerald-400 border-green-200'
                        : 'bg-amber-50 text-amber-400 border-amber-200',
                    )}
                  >
                    {isViewed
                      ? (tr.shared_docs_viewed ?? 'Viewed')
                      : (tr.shared_docs_not_viewed ?? 'Not viewed')}
                  </span>
                </div>

                {/* Metadata row */}
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                  {/* Shared date */}
                  <span className="flex items-center gap-1">
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                      <polyline points="16 6 12 2 8 6" />
                      <line x1="12" y1="2" x2="12" y2="15" />
                    </svg>
                    {tr.shared_docs_sent ?? 'Shared'} {formatDate(doc.shared_at, language)}
                  </span>

                  {/* Viewed date */}
                  {isViewed && doc.client_viewed_at && (
                    <span className="flex items-center gap-1">
                      <svg className="h-3 w-3 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                      {tr.shared_docs_viewed ?? 'Viewed'} {formatDateTime(doc.client_viewed_at, language)}
                    </span>
                  )}

                  {/* File size */}
                  {doc.file_size && (
                    <span>{formatFileSize(doc.file_size)}</span>
                  )}

                  {/* Category */}
                  {doc.category && doc.category !== 'general' && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                      {doc.category}
                    </span>
                  )}
                </div>
              </div>

              {/* View button */}
              <button
                type="button"
                onClick={() => handleView(doc)}
                disabled={isViewing}
                className="shrink-0 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-all hover:bg-slate-50 hover:shadow-sm disabled:opacity-50"
              >
                {isViewing ? (
                  <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  tr.shared_docs_view ?? 'View'
                )}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
