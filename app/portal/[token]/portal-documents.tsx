'use client'

import { useState } from 'react'
import { PortalTimeline } from './portal-timeline'
import { UploadSheet } from './upload-sheet'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Upload,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Asterisk,
  AlertCircle,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react'
import {
  getTranslations,
  getPersonRoleLabel,
  getCategoryLabel,
  t,
  isRtl,
  type PortalLocale,
} from '@/lib/utils/portal-translations'
import {
  getRejectionInfo,
  getRejectionUiLabels,
  type RejectionReasonCode,
} from '@/lib/utils/rejection-reason-translations'
import { track } from '@/lib/utils/portal-analytics'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PortalSlot {
  id: string
  slot_name: string
  description: string | null
  category: string
  person_role: string | null
  is_required: boolean
  status: string // empty | pending_review | accepted | needs_re_upload | rejected
  accepted_file_types: string[]
  max_file_size_bytes: number
  current_version: number
  latest_review_reason: string | null
  rejection_reason_code: string | null
  /** Lawyer verification status: pending | submitted | verified | rejected */
  verification_status?: string | null
  /** Reason for rejection from lawyer verification flow */
  verification_rejection_reason?: string | null
}

interface PortalDocumentsProps {
  token: string
  tenant: {
    name: string
    logoUrl: string | null
    primaryColor: string
  }
  matterRef: string
  slots: PortalSlot[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  portalInfo?: any
  language?: PortalLocale
  /** When true, skips the standalone wrapper (always true in guided workspace) */
  embedded?: boolean
}

// ─── Plain-Language Status Labels ────────────────────────────────────────────
// Business rule: No technical jargon. These labels are what the client sees.

function getPlainStatusLabel(status: string, tr: ReturnType<typeof getTranslations>): string {
  switch (status) {
    case 'empty':
      return tr.doc_status_not_uploaded ?? 'Not uploaded'
    case 'pending_review':
      return tr.doc_status_under_review ?? 'Uploaded, under review'
    case 'accepted':
      return tr.doc_status_accepted ?? 'Accepted'
    case 'needs_re_upload':
    case 'rejected':
      return tr.doc_status_need_reupload ?? 'Need re-upload'
    default:
      return status
  }
}

// ─── Status Config ──────────────────────────────────────────────────────────

const STATUS_BG_CONFIG: Record<string, { color: string; bgClass: string }> = {
  empty: { color: '#d97706', bgClass: 'bg-amber-50 text-amber-700 border-amber-200' },
  pending_review: { color: '#2563eb', bgClass: 'bg-blue-50 text-blue-700 border-blue-200' },
  accepted: { color: '#16a34a', bgClass: 'bg-green-50 text-green-700 border-green-200' },
  needs_re_upload: { color: '#ea580c', bgClass: 'bg-orange-50 text-orange-700 border-orange-200' },
  rejected: { color: '#dc2626', bgClass: 'bg-red-50 text-red-700 border-red-200' },
}

function getStatusBgConfig(status: string) {
  return STATUS_BG_CONFIG[status] ?? STATUS_BG_CONFIG.empty
}

// ─── Component ──────────────────────────────────────────────────────────────

export function PortalDocuments({
  token,
  tenant,
  matterRef,
  slots: initialSlots,
  language: initialLanguage = 'en',
  embedded = false,
}: PortalDocumentsProps) {
  const [currentLang] = useState<PortalLocale>(initialLanguage)
  const tr = getTranslations(currentLang)
  const [slots, setSlots] = useState(initialSlots)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [successIds, setSuccessIds] = useState<Set<string>>(new Set())
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [uploadSheet, setUploadSheet] = useState<{
    slotId: string
    slotName: string
    description: string | null
    isRequired: boolean
    acceptedFileTypes: string[]
    maxFileSizeBytes: number
  } | null>(null)

  // ── Detect person-role grouping ─────────────────────────────────────
  const hasPersonRoles = slots.some((s) => s.person_role)

  // ── Upload handlers ─────────────────────────────────────────────────
  const handleUploadClick = (slot: PortalSlot) => {
    const isReupload = slot.status === 'needs_re_upload' || slot.status === 'rejected' || slot.status === 'pending_review'
    track('document_upload_started', {
      slot_id: slot.id,
      slot_name: slot.slot_name,
      is_reupload: isReupload,
    })
    setErrors((prev) => {
      const next = { ...prev }
      delete next[slot.id]
      return next
    })
    setUploadSheet({
      slotId: slot.id,
      slotName: slot.slot_name,
      description: slot.description,
      isRequired: slot.is_required,
      acceptedFileTypes: slot.accepted_file_types,
      maxFileSizeBytes: slot.max_file_size_bytes,
    })
  }

  const handleUploadComplete = (slotId: string, result: { versionNumber: number }) => {
    const slot = slots.find((s) => s.id === slotId)
    const isReupload = slot ? (slot.status === 'needs_re_upload' || slot.status === 'rejected' || slot.status === 'pending_review') : false
    track('document_upload_completed', {
      slot_id: slotId,
      slot_name: slot?.slot_name ?? slotId,
      is_reupload: isReupload,
    })
    setSlots((prev) =>
      prev.map((s) =>
        s.id === slotId
          ? {
              ...s,
              status: 'pending_review',
              current_version: result.versionNumber,
              latest_review_reason: null,
            }
          : s
      )
    )
    setSuccessIds((prev) => new Set(prev).add(slotId))
    setUploadSheet(null)
  }

  const handleUploadError = (slotId: string, error: string) => {
    const slot = slots.find((s) => s.id === slotId)
    const isReupload = slot ? (slot.status === 'needs_re_upload' || slot.status === 'rejected' || slot.status === 'pending_review') : false
    track('document_upload_failed', {
      slot_id: slotId,
      slot_name: slot?.slot_name ?? slotId,
      is_reupload: isReupload,
      error_type: error,
    })
    setErrors((prev) => ({ ...prev, [slotId]: error }))
  }

  const toggleGroup = (groupKey: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupKey)) {
        next.delete(groupKey)
      } else {
        next.add(groupKey)
      }
      return next
    })
  }

  const canUpload = (slot: PortalSlot) => {
    // Verified documents are locked  -  no re-upload allowed
    if (slot.verification_status === 'verified') return false
    const status = slot.status
    return status === 'empty' || status === 'needs_re_upload' || status === 'rejected' || status === 'pending_review'
  }

  /**
   * Fallback descriptions for common document slot names.
   */
  function getFallbackDescriptions(translations: ReturnType<typeof getTranslations>): Record<string, string> {
    return {
      passport: translations.doc_desc_passport,
      'birth certificate': translations.doc_desc_birth_certificate,
      'marriage certificate': translations.doc_desc_marriage_certificate,
      'police clearance': translations.doc_desc_police_clearance,
      'police certificate': translations.doc_desc_police_clearance,
      'bank statement': translations.doc_desc_bank_statement,
      'proof of funds': translations.doc_desc_proof_of_funds,
      'employment letter': translations.doc_desc_employment_letter,
      'pay stub': translations.doc_desc_pay_stub,
      'tax return': translations.doc_desc_tax_return,
      't4': translations.doc_desc_t4,
      'noa': translations.doc_desc_noa,
      'notice of assessment': translations.doc_desc_noa,
      photograph: translations.doc_desc_photograph,
      photo: translations.doc_desc_photograph,
      'national id': translations.doc_desc_national_id,
      'driver': translations.doc_desc_drivers_licence,
      resume: translations.doc_desc_resume,
      cv: translations.doc_desc_resume,
      diploma: translations.doc_desc_diploma,
      transcript: translations.doc_desc_transcript,
      eca: translations.doc_desc_eca,
      'credential assessment': translations.doc_desc_eca,
      'language test': translations.doc_desc_language_test,
      ielts: translations.doc_desc_ielts,
      celpip: translations.doc_desc_celpip,
      'medical exam': translations.doc_desc_medical_exam,
      'travel history': translations.doc_desc_travel_history,
      'invitation letter': translations.doc_desc_invitation_letter,
      lmia: translations.doc_desc_lmia,
      'offer of employment': translations.doc_desc_offer_of_employment,
      'work permit': translations.doc_desc_work_permit,
      'study permit': translations.doc_desc_study_permit,
      'letter of acceptance': translations.doc_desc_letter_of_acceptance,
      'proof of relationship': translations.doc_desc_proof_of_relationship,
      'cohabitation proof': translations.doc_desc_cohabitation_proof,
      'custody documents': translations.doc_desc_custody_documents,
      'consent letter': translations.doc_desc_consent_letter,
      'statutory declaration': translations.doc_desc_statutory_declaration,
      'affidavit': translations.doc_desc_affidavit,
    }
  }

  function getFallbackDescription(slotName: string): string | null {
    const lower = slotName.toLowerCase()
    const descriptions = getFallbackDescriptions(tr)
    for (const [key, desc] of Object.entries(descriptions)) {
      if (lower.includes(key)) return desc
    }
    return null
  }

  // ── Category sort order ─────────────────────────────────────────────
  const categoryOrder = [
    'identity', 'financial', 'employment', 'relationship',
    'property', 'medical', 'background', 'general', 'custom', 'other',
  ]

  // ── Build grouped structure ─────────────────────────────────────────
  // If person roles exist: Person → Category → Slots
  // Otherwise: Category → Slots

  type GroupedSlots = Array<{
    groupKey: string
    groupLabel: string
    subgroups: Array<{
      subKey: string
      subLabel: string
      slots: PortalSlot[]
    }>
  }>

  const buildGroupedSlots = (): GroupedSlots => {
    if (hasPersonRoles) {
      // Group by person role first, then by category
      const personMap = new Map<string, PortalSlot[]>()
      for (const slot of slots) {
        const role = slot.person_role || '_no_role'
        if (!personMap.has(role)) personMap.set(role, [])
        personMap.get(role)!.push(slot)
      }

      // Sort person roles: principal_applicant first, then spouse, dependents, etc.
      const personOrder = ['principal_applicant', 'spouse', 'dependent', 'co_sponsor', '_no_role']
      const sortedPersons = [...personMap.entries()].sort(
        (a, b) => {
          const ai = personOrder.indexOf(a[0])
          const bi = personOrder.indexOf(b[0])
          return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
        }
      )

      return sortedPersons.map(([role, personSlots]) => {
        // Within each person, group by category
        const catMap = new Map<string, PortalSlot[]>()
        for (const slot of personSlots) {
          const cat = slot.category || 'general'
          if (!catMap.has(cat)) catMap.set(cat, [])
          catMap.get(cat)!.push(slot)
        }

        const sortedCats = [...catMap.entries()].sort(
          (a, b) => categoryOrder.indexOf(a[0]) - categoryOrder.indexOf(b[0])
        )

        return {
          groupKey: `person-${role}`,
          groupLabel: role === '_no_role'
            ? (tr.person_role_general ?? 'General')
            : (getPersonRoleLabel(role, currentLang) || role),
          subgroups: sortedCats.map(([cat, catSlots]) => ({
            subKey: `${role}-${cat}`,
            subLabel: getCategoryLabel(cat, currentLang),
            slots: catSlots,
          })),
        }
      })
    } else {
      // Flat category grouping (no person roles)
      const catMap = new Map<string, PortalSlot[]>()
      for (const slot of slots) {
        const cat = slot.category || 'general'
        if (!catMap.has(cat)) catMap.set(cat, [])
        catMap.get(cat)!.push(slot)
      }

      const sortedCats = [...catMap.entries()].sort(
        (a, b) => categoryOrder.indexOf(a[0]) - categoryOrder.indexOf(b[0])
      )

      // Return as single-level grouping (no person groups)
      return [{
        groupKey: '_flat',
        groupLabel: '',
        subgroups: sortedCats.map(([cat, catSlots]) => ({
          subKey: cat,
          subLabel: getCategoryLabel(cat, currentLang),
          slots: catSlots,
        })),
      }]
    }
  }

  const groupedSlots = buildGroupedSlots()

  // ── Empty state ─────────────────────────────────────────────────────
  if (slots.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-slate-600">
          {tr.portal_no_documents}
        </p>
      </div>
    )
  }

  // ── Render a single slot row ────────────────────────────────────────
  const renderSlotRow = (slot: PortalSlot) => {
    const statusBg = getStatusBgConfig(slot.status)
    const statusLabel = getPlainStatusLabel(slot.status, tr)
    const hasError = errors[slot.id]
    const isAccepted = slot.status === 'accepted'
    const isPending = slot.status === 'pending_review'
    const needsReUpload = slot.status === 'needs_re_upload' || slot.status === 'rejected'
    const justUploaded = successIds.has(slot.id)
    const isVerified = slot.verification_status === 'verified'
    const isVerificationRejected = slot.verification_status === 'rejected'

    return (
      <div
        key={slot.id}
        className={cn('px-4 py-3', justUploaded && 'bg-green-50')}
      >
        <div className="flex items-center gap-3">
          {/* Document info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm text-slate-900">{slot.slot_name}</span>
              {slot.is_required && (
                <span className="text-[10px] font-medium text-red-500 uppercase">
                  {tr.doc_required ?? 'Required'}
                </span>
              )}
              {/* Show person role badge only when NOT in person-grouped mode */}
              {!hasPersonRoles && slot.person_role && (
                <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                  {getPersonRoleLabel(slot.person_role, currentLang)}
                </Badge>
              )}
            </div>
            {(slot.description || getFallbackDescription(slot.slot_name)) && (
              <p className="text-xs text-slate-500 mt-0.5">
                {slot.description || getFallbackDescription(slot.slot_name)}
              </p>
            )}
          </div>

          {/* Status + action */}
          <div className="flex items-center gap-2 shrink-0">
            {isVerified ? (
              <Badge variant="outline" className="text-xs py-0 px-1.5 border border-green-300 bg-green-50 text-green-700 gap-0.5">
                <CheckCircle2 className="h-3 w-3" />
                Verified by Law Firm
              </Badge>
            ) : isVerificationRejected ? (
              <Badge variant="outline" className="text-xs py-0 px-1.5 border border-red-300 bg-red-50 text-red-700 gap-0.5">
                <AlertCircle className="h-3 w-3" />
                Needs Correction
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className={cn('text-xs py-0 px-1.5 border', statusBg.bgClass)}
              >
                {statusLabel}
              </Badge>
            )}
            {isVerified ? (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            ) : isAccepted ? (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            ) : isPending ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-blue-600 font-medium">
                  v{slot.current_version}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-slate-500 hover:text-slate-700 px-2"
                  onClick={() => handleUploadClick(slot)}
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  {tr.replace_button ?? 'Replace'}
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => handleUploadClick(slot)}
              >
                {needsReUpload ? (
                  <>
                    <RotateCcw className="h-3.5 w-3.5 mr-1" />
                    {tr.re_upload_button}
                  </>
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

        {/* Re-upload reason  -  structured (with code) or plain text fallback */}
        {needsReUpload && (() => {
          const code = slot.rejection_reason_code as RejectionReasonCode | null
          const info = getRejectionInfo(code, currentLang)
          const uiLabels = getRejectionUiLabels(currentLang)

          if (info) {
            return (
              <div className="mt-2 rounded-md border border-orange-200 bg-orange-50 overflow-hidden">
                {/* Reason heading */}
                <div className="flex items-start gap-1.5 px-3 pt-2.5 pb-1.5 border-b border-orange-100">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 text-orange-600 flex-shrink-0" />
                  <p className="text-xs font-semibold text-orange-900">{info.label}</p>
                </div>

                {/* How to fix */}
                <div className="px-3 pt-2 pb-1">
                  <p className="text-[11px] font-medium text-orange-800 uppercase tracking-wide mb-0.5">
                    {uiLabels.how_to_fix}
                  </p>
                  <p className="text-xs text-orange-800 leading-relaxed">{info.guidance}</p>
                </div>

                {/* Best practice tip */}
                {info.tip && (
                  <div className="px-3 pt-1 pb-2.5">
                    <p className="text-[11px] text-orange-700 italic">
                      <span className="font-medium not-italic">{uiLabels.tip}: </span>
                      {info.tip}
                    </p>
                  </div>
                )}

                {/* Custom reason text (if staff added extra notes) */}
                {slot.latest_review_reason && (
                  <div className="px-3 py-2 bg-orange-100/60 border-t border-orange-100">
                    <p className="text-xs text-orange-800">
                      <span className="font-medium">{tr.reason_label}:</span>{' '}
                      {slot.latest_review_reason}
                    </p>
                  </div>
                )}
              </div>
            )
          }

          // Fallback: plain text reason only
          if (slot.latest_review_reason) {
            return (
              <div className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
                <p className="text-xs text-amber-800">
                  <span className="font-medium">{tr.reason_label}:</span>{' '}
                  {slot.latest_review_reason}
                </p>
              </div>
            )
          }

          return null
        })()}

        {/* Verification rejection reason (from lawyer review) */}
        {isVerificationRejected && slot.verification_rejection_reason && (
          <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2">
            <div className="flex items-start gap-1.5">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 text-red-600 flex-shrink-0" />
              <p className="text-xs text-red-800">
                <span className="font-medium">Law firm feedback:</span>{' '}
                {slot.verification_rejection_reason}
              </p>
            </div>
            {/* "Fixed It" button  -  signals lawyer the client has corrected the issue */}
            <div className="mt-2 flex justify-end">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs border-green-300 text-green-700 hover:bg-green-50"
                onClick={async () => {
                  try {
                    const res = await fetch(`/api/portal/${token}/field-verifications/resubmit`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        targets: [{ type: 'document', slot_id: slot.id }],
                      }),
                    })
                    if (res.ok) {
                      setSlots((prev) =>
                        prev.map((s) =>
                          s.id === slot.id
                            ? { ...s, verification_status: 'submitted', verification_rejection_reason: null }
                            : s
                        )
                      )
                    }
                  } catch {
                    // Silent failure  -  the document upload already saved
                  }
                }}
              >
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Fixed It  -  Ready for Review
              </Button>
            </div>
          </div>
        )}

        {/* In-context upload guidance  -  shown near upload button for empty/re-upload slots */}
        {canUpload(slot) && !isAccepted && !isPending && (
          <p className="mt-1.5 text-[11px] text-slate-400">
            {tr.upload_guidance ?? 'Upload a clear colour scan (PDF or image). Photos of documents may be rejected.'}
          </p>
        )}

        {/* Per-slot error */}
        {hasError && (
          <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" /> {hasError}
          </p>
        )}
      </div>
    )
  }

  // ── Main render ─────────────────────────────────────────────────────
  return (
    <div dir={isRtl(currentLang) ? 'rtl' : 'ltr'}>
      <div className="space-y-3">
        {groupedSlots.map((group) => {
          const isFlat = group.groupKey === '_flat'

          return (
            <div key={group.groupKey}>
              {/* Person role heading (only in person-grouped mode) */}
              {!isFlat && (
                <div className="flex items-center gap-2 mb-2 mt-2 first:mt-0">
                  <div
                    className="h-px flex-1 bg-slate-200"
                  />
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 px-2">
                    {group.groupLabel}
                  </span>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>
              )}

              {/* Category subgroups within this person (or flat) */}
              <div className="space-y-2">
                {group.subgroups.map((sub) => {
                  const isCollapsed = collapsedGroups.has(sub.subKey)
                  const subRequired = sub.slots.filter((s) => s.is_required)
                  const subUploaded = subRequired.filter(
                    (s) => s.status === 'pending_review' || s.status === 'accepted'
                  ).length

                  return (
                    <div
                      key={sub.subKey}
                      className="rounded-2xl border border-slate-200/60 bg-white/80 backdrop-blur-sm overflow-hidden transition-all hover:shadow-sm"
                    >
                      {/* Category header */}
                      <button
                        type="button"
                        onClick={() => toggleGroup(sub.subKey)}
                        className="flex items-center justify-between w-full px-4 py-3.5 hover:bg-slate-50/50 transition-colors text-left"
                      >
                        <div className="flex items-center gap-2">
                          {isCollapsed ? (
                            <ChevronRight className="h-4 w-4 text-slate-400" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-slate-400" />
                          )}
                          <span className="text-sm font-medium text-slate-700">
                            {sub.subLabel}
                          </span>
                        </div>
                        {subRequired.length > 0 && (
                          <span className="text-xs text-slate-500">
                            {subUploaded}/{subRequired.length}
                          </span>
                        )}
                      </button>

                      {/* Slot items */}
                      {!isCollapsed && (
                        <div className="divide-y border-t">
                          {sub.slots.map(renderSlotRow)}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Upload sheet (mobile-friendly bottom drawer) */}
      {uploadSheet && (
        <UploadSheet
          open={!!uploadSheet}
          onOpenChange={(open) => {
            if (!open) setUploadSheet(null)
          }}
          slotId={uploadSheet.slotId}
          slotName={uploadSheet.slotName}
          description={uploadSheet.description}
          isRequired={uploadSheet.isRequired}
          acceptedFileTypes={uploadSheet.acceptedFileTypes}
          maxFileSizeBytes={uploadSheet.maxFileSizeBytes}
          token={token}
          language={currentLang}
          onUploadComplete={(result) =>
            handleUploadComplete(uploadSheet.slotId, result)
          }
          onUploadError={(error) =>
            handleUploadError(uploadSheet.slotId, error)
          }
        />
      )}
    </div>
  )
}
