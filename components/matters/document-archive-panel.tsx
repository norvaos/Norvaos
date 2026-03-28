'use client'

/**
 * DocumentArchivePanel  -  Classifier-Categorised File Archive (Directive 22.2 + 28.0)
 *
 * Displays all uploaded/migrated documents for a matter, grouped by the
 * AI Classifier categories (identity, financial, legal, correspondence,
 * medical, immigration, other).
 *
 * This panel complements the slot-based DocumentsTab by showing the raw
 * file inventory  -  especially useful for Clio-migrated matters where
 * documents arrive pre-tagged by the Directive 5.4 classifier.
 *
 * Directive 28.1  -  Polyglot-Tag: Source language badge on cards when OCR/Norva
 *   Ear detects non-English script (e.g., "Urdu | اردو"). Helps lawyers
 *   identify which documents require certified translation.
 *
 * Directive 28.2  -  Migration-Pulse: SHA-256 vault shield icon confirms
 *   document integrity. Green ShieldCheck + NorvaWhisper tooltip shows
 *   truncated hash. Clio migration badge for external-origin files.
 *
 * Layout: sidebar category tree + main area with document cards.
 */

import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { useCrossLocaleSearch } from '@/components/search/SearchContext'
import { useDocuments, useDownloadDocument, useVaultIntegrityPolling } from '@/lib/queries/documents'
import type { Document, VaultIntegrityRecord } from '@/lib/queries/documents'
import { formatCategory } from '@/components/matters/document-slot-panel'
import {
  FileText,
  Folder,
  FolderOpen,
  Download,
  Eye,
  Search,
  Filter,
  Fingerprint,
  Landmark,
  Scale,
  Mail,
  Stethoscope,
  Globe,
  MoreHorizontal,
  Sparkles,
  ChevronRight,
  Languages,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
} from 'lucide-react'
import { NORVA_EAR_LANGUAGES } from '@/lib/i18n/config'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { NorvaWhisper } from '@/components/ui/norva-whisper'
import { useLocale } from '@/lib/i18n/use-locale'

// ── Types ────────────────────────────────────────────────────────────────────

interface DocumentArchivePanelProps {
  matterId: string
  tenantId: string
}

// ── Category metadata ────────────────────────────────────────────────────────

const CATEGORY_META: Record<string, {
  icon: typeof FileText
  colour: string
  bgColour: string
  label: string
}> = {
  identity: {
    icon: Fingerprint,
    colour: 'text-blue-600 dark:text-blue-400',
    bgColour: 'bg-blue-950/30 dark:bg-blue-950/30',
    label: 'Identity',
  },
  financial: {
    icon: Landmark,
    colour: 'text-emerald-600 dark:text-emerald-400',
    bgColour: 'bg-emerald-950/30 dark:bg-emerald-950/30',
    label: 'Financial',
  },
  legal: {
    icon: Scale,
    colour: 'text-violet-600 dark:text-violet-400',
    bgColour: 'bg-violet-50 dark:bg-violet-950/30',
    label: 'Legal',
  },
  correspondence: {
    icon: Mail,
    colour: 'text-amber-600 dark:text-amber-400',
    bgColour: 'bg-amber-950/30 dark:bg-amber-950/30',
    label: 'Correspondence',
  },
  medical: {
    icon: Stethoscope,
    colour: 'text-red-600 dark:text-red-400',
    bgColour: 'bg-red-950/30 dark:bg-red-950/30',
    label: 'Medical',
  },
  immigration: {
    icon: Globe,
    colour: 'text-teal-600 dark:text-teal-400',
    bgColour: 'bg-teal-50 dark:bg-teal-950/30',
    label: 'Immigration',
  },
  other: {
    icon: MoreHorizontal,
    colour: 'text-muted-foreground',
    bgColour: 'bg-muted',
    label: 'Other',
  },
}

function getCategoryMeta(category: string) {
  return CATEGORY_META[category] ?? CATEGORY_META.other
}

// ── File size formatter ──────────────────────────────────────────────────────

function formatFileSize(bytes: number | null): string {
  if (!bytes) return ' - '
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── Main Component ───────────────────────────────────────────────────────────

export function DocumentArchivePanel({ matterId, tenantId }: DocumentArchivePanelProps) {
  const { data: documents = [], isLoading } = useDocuments({ tenantId, matterId })
  const { data: integrityRecords = [] } = useVaultIntegrityPolling(matterId, tenantId, 2000)
  const downloadMutation = useDownloadDocument()
  const { t, locale } = useLocale()

  // Build a fast lookup map: docId → tamper_status
  const integrityMap = useMemo(() => {
    const map = new Map<string, VaultIntegrityRecord>()
    for (const r of integrityRecords) map.set(r.id, r)
    return map
  }, [integrityRecords])

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Directive 36.2: Cross-locale search  -  resolves "Passport" in any of the
  // Global 15 languages to its English canonical equivalents so document
  // filtering works regardless of the active Globe locale.
  const { crossMatch } = useCrossLocaleSearch(searchQuery)

  // Group documents by category
  const grouped = useMemo(() => {
    const map: Record<string, Document[]> = {}
    for (const doc of documents) {
      const cat = doc.category || 'other'
      if (!map[cat]) map[cat] = []
      map[cat].push(doc)
    }
    return map
  }, [documents])

  // Sorted category keys (classified first, 'other' last)
  const categories = useMemo(() => {
    const keys = Object.keys(grouped)
    const priority = ['identity', 'financial', 'legal', 'immigration', 'correspondence', 'medical']
    return keys.sort((a, b) => {
      const ai = priority.indexOf(a)
      const bi = priority.indexOf(b)
      if (ai === -1 && bi === -1) return a.localeCompare(b)
      if (ai === -1) return 1
      if (bi === -1) return -1
      return ai - bi
    })
  }, [grouped])

  // Filter documents  -  uses cross-locale matching (Directive 36.2)
  const filteredDocs = useMemo(() => {
    let docs = selectedCategory ? (grouped[selectedCategory] ?? []) : documents
    if (searchQuery.trim()) {
      docs = docs.filter(d =>
        crossMatch(d.file_name) ||
        crossMatch(d.description ?? '') ||
        crossMatch(d.document_type ?? '')
      )
    }
    return docs
  }, [documents, grouped, selectedCategory, searchQuery, crossMatch])

  // Stats
  const totalDocs = documents.length
  const classifiedCount = documents.filter(d => d.category && d.category !== 'other').length

  if (isLoading) {
    return (
      <div className="flex h-full">
        <div className="w-56 flex-none border-r p-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
        <div className="flex-1 p-4 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Category Sidebar ────────────────────────────────────────────── */}
      <div className="w-56 flex-none border-r overflow-y-auto">
        {/* Header */}
        <div className="p-3 border-b">
          <div className="flex items-center gap-1.5 mb-1">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[11px] font-semibold">Categories</span>
            <NorvaWhisper title="AI Classifier" side="right">
              Documents are auto-categorised by the Norva Classifier (Directive 5.4).
              Tier 1 uses filename heuristics; Tier 2 escalates to Claude Haiku for ambiguous files.
            </NorvaWhisper>
          </div>
          {classifiedCount > 0 && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Sparkles className="h-3 w-3 text-violet-500" />
              {classifiedCount} of {totalDocs} AI-classified
            </div>
          )}
        </div>

        {/* All Documents */}
        <button
          onClick={() => setSelectedCategory(null)}
          className={cn(
            'w-full text-left px-3 py-2 flex items-center gap-2 text-[11px] transition-colors',
            'hover:bg-muted/50',
            selectedCategory === null && 'bg-muted font-medium'
          )}
        >
          <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
          All Documents
          <Badge variant="secondary" className="ml-auto text-[9px] h-4 px-1.5">
            {totalDocs}
          </Badge>
        </button>

        {/* Category folders */}
        {categories.map(cat => {
          const meta = getCategoryMeta(cat)
          const Icon = meta.icon
          const count = grouped[cat]?.length ?? 0
          const isActive = selectedCategory === cat

          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={cn(
                'w-full text-left px-3 py-2 flex items-center gap-2 text-[11px] transition-colors',
                'hover:bg-muted/50',
                isActive && 'bg-muted font-medium'
              )}
            >
              <Icon className={cn('h-3.5 w-3.5', meta.colour)} />
              {meta.label}
              <Badge variant="secondary" className="ml-auto text-[9px] h-4 px-1.5">
                {count}
              </Badge>
            </button>
          )
        })}
      </div>

      {/* ── Main Content Area ───────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Search bar */}
        <div className="flex-none border-b px-4 py-2.5 flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search documents..."
              className="h-7 pl-8 text-[11px]"
            />
          </div>
          {selectedCategory && (
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="text-[10px] gap-1">
                {getCategoryMeta(selectedCategory).label}
                <button onClick={() => setSelectedCategory(null)} className="ml-0.5 hover:text-foreground">
                  &times;
                </button>
              </Badge>
            </div>
          )}
          <span className="text-[10px] text-muted-foreground ml-auto">
            {filteredDocs.length} document{filteredDocs.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Document list */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredDocs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
              <FileText className="h-12 w-12 text-muted-foreground/20" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {searchQuery ? 'No documents match your search.' : 'No documents in this category.'}
                </p>
                <p className="text-[11px] text-muted-foreground/60 mt-1">
                  {selectedCategory
                    ? 'Try selecting a different category or clear the filter.'
                    : 'Documents will appear here as they are uploaded or migrated from Clio.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredDocs.map(doc => (
                <DocumentArchiveCard
                  key={doc.id}
                  doc={doc}
                  integrity={integrityMap.get(doc.id)}
                  t={t as (key: string, fallback?: string) => string}
                  locale={locale}
                  onDownload={() => downloadMutation.mutate({
                    storagePath: doc.storage_path,
                    bucket: doc.storage_bucket ?? 'documents',
                  })}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Document metadata extraction ─────────────────────────────────────────────

/** Extract structured metadata from ai_extracted_data JSONB */
function extractDocMeta(doc: Document): {
  sourceLanguage: string | null
  languageLabel: string | null
  languageNative: string | null
  checksumSha256: string | null
  isMigrated: boolean
} {
  const data = doc.ai_extracted_data as Record<string, unknown> | null
  const sourceLanguage = (data?.source_language as string) ?? (data?.detected_language as string) ?? null
  const checksumSha256 = (data?.checksum_sha256 as string) ?? (data?.sha256 as string) ?? (data?.content_hash as string) ?? null
  const isMigrated = !!(data?.migration_source || doc.external_id || doc.external_provider)

  let languageLabel: string | null = null
  let languageNative: string | null = null
  if (sourceLanguage && sourceLanguage !== 'en') {
    const lang = NORVA_EAR_LANGUAGES.find(l => l.code === sourceLanguage)
    if (lang) {
      const parts = lang.label.split(' / ')
      languageLabel = parts[0]
      languageNative = parts[1] ?? null
    } else {
      languageLabel = sourceLanguage.toUpperCase()
    }
  }

  return { sourceLanguage, languageLabel, languageNative, checksumSha256, isMigrated }
}

// ── Document Card ────────────────────────────────────────────────────────────

function DocumentArchiveCard({
  doc,
  integrity,
  t,
  locale,
  onDownload,
}: {
  doc: Document
  integrity?: VaultIntegrityRecord
  t: (key: string, fallback?: string) => string
  locale: string
  onDownload: () => void
}) {
  const meta = getCategoryMeta(doc.category || 'other')
  const Icon = meta.icon
  const docType = doc.document_type
    ? formatCategory(doc.document_type)
    : null
  const { sourceLanguage, languageLabel, languageNative, checksumSha256, isMigrated } = extractDocMeta(doc)

  // Sentinel Shield state  -  polled every 2s via useVaultIntegrityPolling
  const tamperStatus = integrity?.tamper_status ?? doc.tamper_status ?? null
  const isTampered = tamperStatus === 'tampered'
  const isVerified = tamperStatus === 'verified'
  const hasHash = !!(checksumSha256 || integrity?.content_hash || doc.content_hash)

  return (
    <Card className={cn(
      'overflow-hidden transition-colors',
      isTampered
        ? 'border-red-400 bg-red-950/30/60 dark:border-red-700 dark:bg-red-950/30 animate-pulse'
        : 'hover:bg-muted/30',
    )}>
      <CardContent className="p-3 flex items-start gap-3">
        {/* Category icon */}
        <div className={cn(
          'flex h-9 w-9 items-center justify-center rounded-lg flex-none',
          isTampered ? 'bg-red-100 dark:bg-red-950/50' : meta.bgColour,
        )}>
          {isTampered ? (
            <ShieldAlert className="h-4.5 w-4.5 text-red-600 dark:text-red-400" />
          ) : (
            <Icon className={cn('h-4.5 w-4.5', meta.colour)} />
          )}
        </div>

        {/* File info */}
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-1.5">
            <p className={cn(
              'text-[12px] font-medium leading-tight truncate',
              isTampered && 'text-red-700 dark:text-red-400',
            )}>
              {doc.file_name}
            </p>

            {/* Sentinel Shield  -  tamper-aware (Directive 28.2) */}
            {isTampered && (
              <>
                <NorvaWhisper title={t('status.sentinel_tamper_title', 'SENTINEL ALERT  -  Tamper Detected')} side="top">
                  {`${t('status.sentinel_tamper_body', 'Document hash mismatch detected. This document has been modified outside NorvaOS.')}\n\nExpected: ${(checksumSha256 || doc.content_hash || '').slice(0, 16)}...\nStored:   ${(integrity?.content_hash || '').slice(0, 16)}...`}
                </NorvaWhisper>
                <Badge
                  variant="destructive"
                  data-locale={locale}
                  className="text-[8px] h-4 px-1.5 gap-0.5 flex-none animate-pulse"
                >
                  <AlertTriangle className="h-2.5 w-2.5" />
                  {t('status.tamper_detected', 'TAMPER DETECTED')}
                </Badge>
              </>
            )}
            {!isTampered && hasHash && isVerified && (
              <>
                <NorvaWhisper title={t('status.vault_verified_title', 'Norva Vault  -  Integrity Verified')} side="top">
                  SHA-256: {(checksumSha256 || doc.content_hash || '').slice(0, 16)}...{(checksumSha256 || doc.content_hash || '').slice(-8)}
                  {'\n'}{t('status.vault_verified_body', 'This document is hash-locked in the Norva Vault. Any tampering will be detected.')}
                </NorvaWhisper>
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 flex-none" />
              </>
            )}
            {!isTampered && hasHash && !isVerified && (
              <>
                <NorvaWhisper title="Norva Vault  -  Awaiting Verification" side="top">
                  SHA-256: {(checksumSha256 || doc.content_hash || '').slice(0, 16)}...
                  {'\n'}Hash recorded but not yet verified against storage. Click to verify.
                </NorvaWhisper>
                <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground/50 flex-none" />
              </>
            )}

            {/* Directive 28.1: Source language badge */}
            {languageLabel && (
              <Badge
                variant="outline"
                className="text-[8px] h-3.5 px-1 gap-0.5 flex-none border-indigo-300 text-indigo-700 dark:text-indigo-400"
              >
                <Languages className="h-2.5 w-2.5" />
                {languageLabel}
                {languageNative && (
                  <span className="text-muted-foreground"> | {languageNative}</span>
                )}
              </Badge>
            )}
          </div>

          {/* Tamper alert banner */}
          {isTampered && (
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-red-700 dark:text-red-400 bg-red-100/80 dark:bg-red-950/40 rounded px-2 py-1 mt-0.5" data-locale={locale}>
              <ShieldAlert className="h-3 w-3 shrink-0" />
              {t('status.sentinel_tamper_body', 'Document hash mismatch detected. This document has been modified outside NorvaOS.')}
            </div>
          )}

          <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
            {docType && (
              <Badge variant="outline" className="text-[9px] h-4 px-1.5">
                {docType}
              </Badge>
            )}
            <span>{formatFileSize(doc.file_size)}</span>
            {doc.file_type && <span>{doc.file_type}</span>}
            {doc.created_at && (
              <span>
                {new Date(doc.created_at).toLocaleDateString('en-CA', {
                  month: 'short', day: 'numeric', year: 'numeric',
                })}
              </span>
            )}
            {isMigrated && (
              <Badge variant="outline" className="text-[8px] h-3.5 px-1 border-teal-300 text-teal-600 dark:text-teal-400">
                Clio
              </Badge>
            )}
          </div>
          {doc.ai_summary && (
            <p className="text-[10px] text-muted-foreground/70 line-clamp-1 mt-0.5">
              {doc.ai_summary}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 flex-none">
          {doc.review_status && (
            <Badge
              variant={doc.review_status === 'approved' ? 'default' : 'outline'}
              className="text-[9px] h-4 px-1.5 mr-1"
            >
              {doc.review_status === 'approved' ? 'Approved' : doc.review_status}
            </Badge>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDownload}>
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
