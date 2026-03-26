// ─── Zone Configuration ─────────────────────────────────────────────────────

export type VitalityZone = 'readiness' | 'relationships' | 'stages' | 'financials' | 'documents'

export interface VitalityHeaderProps {
  matterId: string
  tenantId: string
  userId: string
  /** Collapse to compact mode (single-row summary) */
  compact?: boolean
  /** Called when a zone is clicked for drill-down */
  onZoneDrillDown?: (zone: VitalityZone) => void
}

// ─── Readiness Zone ─────────────────────────────────────────────────────────

export interface ReadinessZoneData {
  overallScore: number
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  completionPct: number
  intakeStatus: string | null
  draftingReady: boolean
  draftingBlockerCount: number
  filingReady: boolean
  filingBlockerCount: number
  lawyerReviewRequired: boolean
  lawyerReviewStatus: string | null
  stalePacks: number
  formsPct: number
  docsPct: number
  contradictionCount: number
  /** Top 3 blockers for quick display */
  topBlockers: { label: string; type: string }[]
  /** Domains from readiness matrix */
  domains: {
    key: string
    label: string
    pct: number
    satisfied: number
    total: number
  }[]
}

export interface ReadinessZoneProps {
  data: ReadinessZoneData | null
  isLoading: boolean
  onDrillDown?: () => void
}

// ─── Relationships Zone ─────────────────────────────────────────────────────

export interface RelationshipPerson {
  id: string
  role: 'principal_applicant' | 'spouse' | 'dependent' | 'co_sponsor' | 'other'
  roleLabel: string
  fullName: string
  email: string | null
  phone: string | null
  dateOfBirth: string | null
  nationality: string | null
  immigrationStatus: string | null
  /** Sensitive fields that require reveal toggle */
  sensitiveFields: {
    uci?: string
    passportNumber?: string
    passportExpiry?: string
    passportCountry?: string
  }
  /** Flags */
  passportExpiring: boolean
  inadmissibilityFlag: boolean
  criminalCharges: boolean
}

export interface RelationshipsZoneData {
  primaryContact: RelationshipPerson | null
  additionalPeople: RelationshipPerson[]
  responsibleLawyer: { id: string; name: string } | null
  originatingLawyer: { id: string; name: string } | null
  teamMembers: { id: string; name: string }[]
}

export interface RelationshipsZoneProps {
  data: RelationshipsZoneData | null
  isLoading: boolean
  tenantId: string
  userId: string
  matterId: string
  onDrillDown?: () => void
}

// ─── Stages Zone ────────────────────────────────────────────────────────────

export interface StageInfo {
  id: string
  name: string
  color: string
  sortOrder: number
  completionPct: number
  slaDays: number | null
  isTerminal: boolean
  /** Gating errors preventing advancement */
  gatingErrors: string[]
}

export interface StagesZoneData {
  pipelineId: string | null
  pipelineName: string | null
  currentStageId: string | null
  currentStageName: string | null
  stageEnteredAt: string | null
  timeInStage: string
  stages: StageInfo[]
  /** Overall pipeline progress (0-100) */
  pipelineProgress: number
  /** History of stage transitions */
  recentTransitions: {
    fromStage: string
    toStage: string
    at: string
    by: string | null
  }[]
}

export interface StagesZoneProps {
  data: StagesZoneData | null
  isLoading: boolean
  onDrillDown?: () => void
}

// ─── Financials Zone ────────────────────────────────────────────────────────

export interface FinancialsZoneData {
  billingType: string | null
  hourlyRate: number | null
  estimatedValue: number | null
  /** All amounts in cents */
  trustBalanceCents: number
  totalBilledCents: number
  totalPaidCents: number
  outstandingCents: number
  /** Fee snapshot */
  feeSnapshot: {
    totalCents: number
    taxCents: number
    subtotalCents: number
  }
  /** Aging buckets (cents) */
  aging: {
    currentCents: number
    thirtyDayCents: number
    sixtyPlusCents: number
  }
  /** Health indicator */
  financialHealth: 'healthy' | 'warning' | 'critical'
  /** Last 5 trust transactions for the mini-ledger */
  recentTransactions: {
    id: string
    createdAt: string
    type: string
    amountCents: number
    runningBalanceCents: number
  }[]
}

export interface FinancialsZoneProps {
  data: FinancialsZoneData | null
  isLoading: boolean
  onDrillDown?: () => void
}

// ─── Documents Zone ─────────────────────────────────────────────────────────

export interface DocumentSlotSummary {
  id: string
  slotName: string
  slotSlug: string
  category: string
  isRequired: boolean
  status: 'empty' | 'uploaded' | 'pending_review' | 'accepted' | 'rejected' | 'needs_re_upload'
  personName?: string
  personRole?: string
}

export interface DocumentsZoneData {
  totalSlots: number
  mandatorySlots: number
  uploaded: number
  accepted: number
  pendingReview: number
  needsReUpload: number
  rejected: number
  empty: number
  /** Completion percentage */
  completionPct: number
  /** Pending slots for quick action */
  pendingSlots: DocumentSlotSummary[]
  /** Recently uploaded (last 7 days) */
  recentUploads: { slotName: string; uploadedAt: string }[]
}

export interface DocumentsZoneProps {
  data: DocumentsZoneData | null
  isLoading: boolean
  onDrillDown?: () => void
  onUpload?: (slotId: string) => void
}

// ─── Skeleton ───────────────────────────────────────────────────────────────

export interface VitalitySkeletonProps {
  /** Which zones to show skeletons for */
  zones?: VitalityZone[]
}
