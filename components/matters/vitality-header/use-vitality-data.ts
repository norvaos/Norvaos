'use client'

import { useMemo } from 'react'
import { useMatterDashboard } from '@/lib/queries/matter-dashboard'
import { useReadinessScore } from '@/lib/queries/readiness'
import { useCheckGating, useMatterStages } from '@/lib/queries/matter-types'
import { formatFullName } from '@/lib/utils/formatters'
import type {
  ReadinessZoneData,
  RelationshipsZoneData,
  StagesZoneData,
  FinancialsZoneData,
  DocumentsZoneData,
  RelationshipPerson,
} from './types'

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDuration(enteredAt: string): string {
  const start = new Date(enteredAt)
  const now = new Date()
  const diffMs = now.getTime() - start.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  if (diffDays === 0) {
    if (diffHours === 0) return '< 1h'
    return `${diffHours}h`
  }
  if (diffDays === 1) return `1d ${diffHours}h`
  return `${diffDays}d`
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr)
  const now = new Date()
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useVitalityData(matterId: string) {
  const {
    matter,
    contact,
    trustBalance,
    recentTransactions,
    emptySlots,
    isLoading: dashboardLoading,
  } = useMatterDashboard(matterId)

  const {
    data: readiness,
    isLoading: readinessLoading,
  } = useReadinessScore(matterId)

  const pipelineId = matter?.pipeline_id ?? null
  const { data: stages, isLoading: stagesLoading } = useMatterStages(pipelineId)
  const { data: gatingData } = useCheckGating(matterId, !!pipelineId)
  const gatingErrors = gatingData?.gatingErrors ?? {}

  const isLoading = dashboardLoading || readinessLoading

  // ── Readiness Zone ──────────────────────────────────────────────────────
  const readinessZone = useMemo((): ReadinessZoneData | null => {
    if (!matter) return null
    const score = readiness?.total ?? matter.readiness_score ?? 0
    const rawLevel = readiness?.level ?? matter.risk_level ?? 'medium'
    // ReadinessResult.level can be 'ready' which maps to 'low' risk in our zone display
    const riskLevel: ReadinessZoneData['riskLevel'] =
      rawLevel === 'ready' ? 'low' : (rawLevel as ReadinessZoneData['riskLevel'])
    const completionPct = readiness
      ? Math.round(readiness.domains.reduce((sum, d) => sum + d.weighted, 0))
      : score

    // Domain breakdown  -  ReadinessDomain has: name, score, weight, weighted, detail
    const domains = readiness?.domains?.map(d => ({
      key: d.name,
      label: d.name,
      pct: Math.round(d.score),
      satisfied: Math.round(d.score),
      total: 100,
    })) ?? []

    // Derive topBlockers from domains with score < 60 (red zone)
    // Each domain's detail string describes what's wrong
    const topBlockers: { label: string; type: string }[] = []
    if (readiness?.domains) {
      for (const d of readiness.domains) {
        if (d.score < 60 && d.detail) {
          topBlockers.push({
            label: d.detail,
            type: d.name.toLowerCase(),
          })
        }
      }
      // Sort by score ascending (worst first), cap at 3
      topBlockers.sort((a, b) => {
        const aScore = readiness.domains.find(d => d.name.toLowerCase() === a.type)?.score ?? 100
        const bScore = readiness.domains.find(d => d.name.toLowerCase() === b.type)?.score ?? 100
        return aScore - bScore
      })
      topBlockers.splice(3)
    }

    return {
      overallScore: score,
      riskLevel,
      completionPct,
      intakeStatus: matter.intake_status,
      draftingReady: true, // will be overridden by immigration readiness if available
      draftingBlockerCount: 0,
      filingReady: true,
      filingBlockerCount: 0,
      lawyerReviewRequired: false,
      lawyerReviewStatus: null,
      stalePacks: 0,
      formsPct: 0,
      docsPct: 0,
      contradictionCount: 0,
      topBlockers,
      domains,
    }
  }, [matter, readiness])

  // ── Relationships Zone ──────────────────────────────────────────────────
  const relationshipsZone = useMemo((): RelationshipsZoneData | null => {
    if (!contact && !matter) return null

    let primaryContact: RelationshipPerson | null = null
    if (contact) {
      const immData = (() => {
        if (contact.immigration_data && typeof contact.immigration_data === 'object') {
          return contact.immigration_data as Record<string, string | undefined>
        }
        if (contact.custom_fields && typeof contact.custom_fields === 'object') {
          const cf = contact.custom_fields as Record<string, unknown>
          return {
            uci: cf.uci as string | undefined,
            passport_number: cf.passport_number as string | undefined,
            passport_expiry: cf.passport_expiry as string | undefined,
            passport_country: cf.passport_country as string | undefined,
          }
        }
        return {}
      })()

      primaryContact = {
        id: contact.id,
        role: 'principal_applicant',
        roleLabel: 'Principal Applicant',
        fullName: formatFullName(contact.first_name, contact.last_name) || 'Unnamed',
        email: contact.email_primary,
        phone: contact.phone_primary,
        dateOfBirth: contact.date_of_birth,
        nationality: contact.nationality,
        immigrationStatus: contact.immigration_status,
        sensitiveFields: {
          uci: immData.uci,
          passportNumber: immData.passport_number,
          passportExpiry: immData.passport_expiry,
          passportCountry: immData.passport_country,
        },
        passportExpiring: immData.passport_expiry ? daysUntil(immData.passport_expiry) <= 90 : false,
        inadmissibilityFlag: false,
        criminalCharges: false,
      }
    }

    return {
      primaryContact,
      additionalPeople: [],
      responsibleLawyer: null,
      originatingLawyer: null,
      teamMembers: [],
    }
  }, [contact, matter])

  // ── Stages Zone ─────────────────────────────────────────────────────────
  const stagesZone = useMemo((): StagesZoneData | null => {
    if (!matter) return null

    const currentStageId = matter.stage_id
    const stageEnteredAt = matter.stage_entered_at
    const sortedStages = (stages ?? []).map(s => ({
      id: s.id,
      name: s.name,
      color: s.color ?? '#6b7280',
      sortOrder: s.sort_order,
      completionPct: s.completion_pct ?? 0,
      slaDays: s.sla_days,
      isTerminal: s.is_terminal ?? false,
      gatingErrors: gatingErrors[s.id] ?? [],
    }))

    const currentIdx = sortedStages.findIndex(s => s.id === currentStageId)
    const pipelineProgress = sortedStages.length > 0 && currentIdx >= 0
      ? Math.round(((currentIdx + 1) / sortedStages.length) * 100)
      : 0

    return {
      pipelineId,
      pipelineName: null,
      currentStageId,
      currentStageName: currentIdx >= 0 ? sortedStages[currentIdx]?.name ?? null : null,
      stageEnteredAt,
      timeInStage: stageEnteredAt ? formatDuration(stageEnteredAt) : ' - ',
      stages: sortedStages,
      pipelineProgress,
      recentTransitions: [],
    }
  }, [matter, stages, gatingErrors, pipelineId])

  // ── Financials Zone ─────────────────────────────────────────────────────
  const financialsZone = useMemo((): FinancialsZoneData | null => {
    if (!matter) return null

    const feeSnap = (() => {
      const raw = matter.fee_snapshot as Record<string, unknown> | null
      if (raw && typeof raw === 'object') {
        return {
          totalCents: (raw.total_amount_cents as number) ?? 0,
          taxCents: (raw.tax_amount_cents as number) ?? 0,
          subtotalCents: (raw.subtotal_cents as number) ?? 0,
        }
      }
      return {
        totalCents: matter.total_amount_cents ?? 0,
        taxCents: 0,
        subtotalCents: matter.total_amount_cents ?? 0,
      }
    })()

    const balanceCents = trustBalance?.running_balance_cents ?? 0
    const outstandingCents = Math.max(0, feeSnap.totalCents - Math.max(0, balanceCents))
    const financialHealth: FinancialsZoneData['financialHealth'] =
      balanceCents < 0 ? 'critical' : balanceCents === 0 ? 'warning' : 'healthy'

    return {
      billingType: matter.billing_type,
      hourlyRate: null,
      estimatedValue: null,
      trustBalanceCents: balanceCents,
      totalBilledCents: feeSnap.totalCents,
      totalPaidCents: Math.max(0, balanceCents),
      outstandingCents,
      feeSnapshot: feeSnap,
      aging: { currentCents: 0, thirtyDayCents: 0, sixtyPlusCents: 0 },
      financialHealth,
      recentTransactions: recentTransactions.map(tx => ({
        id: tx.id,
        createdAt: tx.created_at,
        type: tx.transaction_type,
        amountCents: tx.amount_cents,
        runningBalanceCents: tx.running_balance_cents,
      })),
    }
  }, [matter, trustBalance, recentTransactions])

  // ── Documents Zone ──────────────────────────────────────────────────────
  const documentsZone = useMemo((): DocumentsZoneData | null => {
    if (!matter) return null

    const totalSlots = emptySlots.length // Note: emptySlots are the UNFILLED slots
    const empty = emptySlots.length
    const pendingSlots = emptySlots.map(s => ({
      id: s.id,
      slotName: s.slot_name,
      slotSlug: s.slot_slug,
      category: s.category ?? '',
      isRequired: s.is_required,
      status: 'empty' as const,
    }))

    return {
      totalSlots: totalSlots, // this is a simplification
      mandatorySlots: emptySlots.filter(s => s.is_required).length,
      uploaded: 0,
      accepted: 0,
      pendingReview: 0,
      needsReUpload: 0,
      rejected: 0,
      empty,
      completionPct: 0,
      pendingSlots,
      recentUploads: [],
    }
  }, [matter, emptySlots])

  return {
    isLoading,
    stagesLoading,
    readinessZone,
    relationshipsZone,
    stagesZone,
    financialsZone,
    documentsZone,
    /** Raw matter for title/number display */
    matter,
  }
}
