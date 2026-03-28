'use client'

import { useState, useRef, useCallback } from 'react'
import { PortalTimeline } from './portal-timeline'
import { CHECKLIST_CATEGORIES, CHECKLIST_STATUSES } from '@/lib/utils/constants'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Upload,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Asterisk,
  Loader2,
  AlertCircle,
  Mail,
  Phone,
  User,
} from 'lucide-react'
import {
  getTranslations,
  t,
  PORTAL_LOCALES,
  isRtl,
  type PortalLocale,
} from '@/lib/utils/portal-translations'
import { Globe } from 'lucide-react'

interface ChecklistItem {
  id: string
  document_name: string
  description: string | null
  category: string
  is_required: boolean
  status: string
  document_id: string | null
  sort_order: number
}

interface PortalInfo {
  welcomeMessage: string
  instructions: string
  lawyerName: string
  lawyerEmail: string
  lawyerPhone: string
}

interface PortalChecklistProps {
  token: string
  tenant: {
    name: string
    logoUrl: string | null
    primaryColor: string
  }
  matterRef: string
  checklistItems: ChecklistItem[]
  portalInfo?: PortalInfo
  language?: PortalLocale
  /** When true, skips the header and full-page wrapper (for use inside tabs) */
  embedded?: boolean
}

function getStatusConfig(status: string) {
  return CHECKLIST_STATUSES.find((s) => s.value === status) ?? CHECKLIST_STATUSES[0]
}

function getCategoryLabel(categoryValue: string) {
  return CHECKLIST_CATEGORIES.find((c) => c.value === categoryValue)?.label ?? categoryValue
}

export function PortalChecklist({
  token,
  tenant,
  matterRef,
  checklistItems,
  portalInfo,
  language: initialLanguage = 'en',
  embedded = false,
}: PortalChecklistProps) {
  const [currentLang, setCurrentLang] = useState<PortalLocale>(initialLanguage)
  const tr = getTranslations(currentLang)
  const [items, setItems] = useState(checklistItems)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [successIds, setSuccessIds] = useState<Set<string>>(new Set())
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingItemIdRef = useRef<string | null>(null)

  // Group by category (same logic as DocumentChecklistPanel)
  const grouped = new Map<string, ChecklistItem[]>()
  for (const item of items) {
    const cat = item.category || 'general'
    if (!grouped.has(cat)) grouped.set(cat, [])
    grouped.get(cat)!.push(item)
  }

  const categoryOrder = CHECKLIST_CATEGORIES.map((c) => c.value)
  const sortedCategories = [...grouped.entries()].sort(
    (a, b) =>
      categoryOrder.indexOf(a[0] as (typeof categoryOrder)[number]) -
      categoryOrder.indexOf(b[0] as (typeof categoryOrder)[number])
  )

  // Completion stats
  const receivedOrApproved = items.filter(
    (i) =>
      i.status === 'received' ||
      i.status === 'approved' ||
      i.status === 'not_applicable'
  ).length
  const completionPercent =
    items.length > 0 ? Math.round((receivedOrApproved / items.length) * 100) : 0

  const handleUploadClick = (itemId: string) => {
    pendingItemIdRef.current = itemId
    fileInputRef.current?.click()
  }

  const handleFileSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      const itemId = pendingItemIdRef.current
      if (!file || !itemId) return

      // Reset input so the same file can be re-selected
      e.target.value = ''

      setUploadingId(itemId)
      setErrors((prev) => {
        const next = { ...prev }
        delete next[itemId]
        return next
      })

      const formData = new FormData()
      formData.append('file', file)
      formData.append('checklist_item_id', itemId)

      try {
        const res = await fetch(`/api/portal/${token}/upload`, {
          method: 'POST',
          body: formData,
        })
        const result = await res.json()

        if (!res.ok || !result.success) {
          setErrors((prev) => ({
            ...prev,
            [itemId]: result.error || tr.error_upload_failed,
          }))
        } else {
          // Update local state: mark item as received
          setItems((prev) =>
            prev.map((item) =>
              item.id === itemId
                ? { ...item, status: 'received', document_id: result.document_id }
                : item
            )
          )
          setSuccessIds((prev) => new Set(prev).add(itemId))
        }
      } catch {
        setErrors((prev) => ({
          ...prev,
          [itemId]: tr.error_network,
        }))
      } finally {
        setUploadingId(null)
        pendingItemIdRef.current = null
      }
    },
    [token]
  )

  const toggleCategory = (cat: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) {
        next.delete(cat)
      } else {
        next.add(cat)
      }
      return next
    })
  }

  // ── Language dropdown helper ──────────────────────────────────
  const LanguageDropdown = () => (
    <div className="relative">
      <select
        value={currentLang}
        onChange={(e) => setCurrentLang(e.target.value as PortalLocale)}
        className="appearance-none bg-white border border-slate-200 rounded-md pl-7 pr-6 py-1.5 text-xs font-medium text-slate-700 cursor-pointer hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      >
        {PORTAL_LOCALES.map((loc) => (
          <option key={loc.value} value={loc.value}>
            {loc.nativeLabel}
          </option>
        ))}
      </select>
      <Globe className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
      <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
    </div>
  )

  // Empty state
  if (items.length === 0) {
    return (
      <div className={embedded ? '' : 'min-h-screen bg-slate-50'}>
        {!embedded && (
          <header className="bg-white border-b border-slate-200 px-4 py-4">
            <div className="max-w-2xl mx-auto flex items-center gap-3">
              <div className="flex-1">
                <h1
                  className="text-lg font-semibold"
                  style={{ color: tenant.primaryColor }}
                >
                  {tenant.name}
                </h1>
                <p className="text-xs text-slate-500">{tr.portal_title}</p>
              </div>
              <LanguageDropdown />
            </div>
          </header>
        )}
        <main className={embedded ? 'py-12 text-center' : 'max-w-2xl mx-auto px-4 py-12 text-center'}>
          <p className="text-sm text-slate-600">
            {tr.portal_no_documents}
          </p>
        </main>
      </div>
    )
  }

  return (
    <div className={embedded ? '' : 'min-h-screen bg-slate-50'} dir={isRtl(currentLang) ? 'rtl' : 'ltr'}>
      {/* Header  -  hidden in embedded mode (parent provides it) */}
      {!embedded && (
        <header className="bg-white border-b border-slate-200 px-4 py-4">
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            {tenant.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={tenant.logoUrl}
                alt={tenant.name}
                className="h-8 w-auto"
              />
            )}
            <div className="flex-1">
              <h1
                className="text-lg font-semibold"
                style={{ color: tenant.primaryColor }}
              >
                {tenant.name}
              </h1>
              <p className="text-xs text-slate-500">{tr.portal_title}</p>
            </div>
            <LanguageDropdown />
          </div>
        </header>
      )}

      {/* Main content */}
      <main className={embedded ? 'space-y-6' : 'max-w-2xl mx-auto px-4 py-6 space-y-6'}>
        {/* Welcome message */}
        {portalInfo?.welcomeMessage && (
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <p className="text-sm text-slate-700 whitespace-pre-line">
              {portalInfo.welcomeMessage}
            </p>
          </div>
        )}

        {/* Matter reference & progress */}
        <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600">
              {tr.reference_label}:{' '}
              <span className="font-medium text-slate-900">{matterRef}</span>
            </p>
            <span className="text-sm font-semibold text-slate-900">
              {completionPercent}%
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                completionPercent === 100
                  ? 'bg-green-500'
                  : completionPercent >= 50
                    ? 'bg-blue-500'
                    : 'bg-amber-500'
              )}
              style={{ width: `${completionPercent}%` }}
            />
          </div>
          <p className="text-xs text-slate-500">
            {t(tr.legacy_progress, { uploaded: String(receivedOrApproved), total: String(items.length) })}
          </p>
        </div>

        {/* Case progress timeline */}
        <PortalTimeline token={token} primaryColor={tenant.primaryColor} language={currentLang} />

        {/* Instructions */}
        {portalInfo?.instructions && (
          <div className="bg-blue-950/30 border border-blue-500/20 rounded-lg p-4">
            <p className="text-xs font-medium text-blue-400 mb-1">{tr.instructions_label}</p>
            <p className="text-sm text-blue-400 whitespace-pre-line">
              {portalInfo.instructions}
            </p>
          </div>
        )}

        {/* Lawyer contact info */}
        {portalInfo && (portalInfo.lawyerName || portalInfo.lawyerEmail || portalInfo.lawyerPhone) && (
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <p className="text-xs font-medium text-slate-500 mb-2">{tr.your_contact}</p>
            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-700">
              {portalInfo.lawyerName && (
                <span className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-slate-400" />
                  {portalInfo.lawyerName}
                </span>
              )}
              {portalInfo.lawyerEmail && (
                <a
                  href={`mailto:${portalInfo.lawyerEmail}`}
                  className="flex items-center gap-1.5 text-blue-600 hover:underline"
                >
                  <Mail className="h-3.5 w-3.5" />
                  {portalInfo.lawyerEmail}
                </a>
              )}
              {portalInfo.lawyerPhone && (
                <a
                  href={`tel:${portalInfo.lawyerPhone}`}
                  className="flex items-center gap-1.5 text-blue-600 hover:underline"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {portalInfo.lawyerPhone}
                </a>
              )}
            </div>
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx,.xls,.xlsx"
          onChange={handleFileSelected}
        />

        {/* Checklist by category */}
        {sortedCategories.map(([category, catItems]) => {
          const isCollapsed = collapsedCategories.has(category)
          const catDone = catItems.filter(
            (i) =>
              i.status === 'received' ||
              i.status === 'approved' ||
              i.status === 'not_applicable'
          ).length

          return (
            <div
              key={category}
              className="bg-white rounded-lg border border-slate-200 overflow-hidden"
            >
              {/* Category header */}
              <button
                type="button"
                onClick={() => toggleCategory(category)}
                className="flex items-center justify-between w-full px-4 py-3 hover:bg-slate-50 transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  )}
                  <span className="text-sm font-medium text-slate-700">
                    {getCategoryLabel(category)}
                  </span>
                </div>
                <span className="text-xs text-slate-500">
                  {catDone}/{catItems.length}
                </span>
              </button>

              {/* Items */}
              {!isCollapsed && (
                <div className="divide-y border-t">
                  {catItems
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map((item) => {
                      const statusCfg = getStatusConfig(item.status)
                      const isUploading = uploadingId === item.id
                      const hasError = errors[item.id]
                      const isUploaded =
                        item.status === 'received' || item.status === 'approved'
                      const isNA = item.status === 'not_applicable'
                      const justUploaded = successIds.has(item.id)

                      return (
                        <div
                          key={item.id}
                          className={cn(
                            'flex items-center gap-3 px-4 py-3',
                            justUploaded && 'bg-emerald-950/30'
                          )}
                        >
                          {/* Document info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm text-slate-900">
                                {item.document_name}
                              </span>
                              {item.is_required && (
                                <Asterisk className="h-3 w-3 text-red-500 flex-shrink-0" />
                              )}
                            </div>
                            {item.description && (
                              <p className="text-xs text-slate-500 mt-0.5">
                                {item.description}
                              </p>
                            )}
                            {hasError && (
                              <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" /> {hasError}
                              </p>
                            )}
                          </div>

                          {/* Status + action */}
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge
                              variant="outline"
                              className="text-xs py-0 px-1.5 border-0"
                              style={{
                                backgroundColor: `${statusCfg.color}20`,
                                color: statusCfg.color,
                              }}
                            >
                              {statusCfg.label}
                            </Badge>
                            {isUploaded || isNA ? (
                              <CheckCircle2 className="h-5 w-5 text-green-500" />
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs"
                                onClick={() => handleUploadClick(item.id)}
                                disabled={isUploading}
                              >
                                {isUploading ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <>
                                    <Upload className="h-3.5 w-3.5 mr-1" />
                                    {tr.upload_button}
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                </div>
              )}
            </div>
          )
        })}

        {/* All done message */}
        {completionPercent === 100 && (
          <div className="bg-emerald-950/30 border border-emerald-500/20 rounded-lg p-4 text-center">
            <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
            <p className="text-sm font-medium text-emerald-400">
              {tr.all_done_title}
            </p>
            <p className="text-xs text-green-600 mt-1">
              {tr.all_done_message}
            </p>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-slate-400 pt-4">
          {tr.powered_by}
        </p>
      </main>
    </div>
  )
}
