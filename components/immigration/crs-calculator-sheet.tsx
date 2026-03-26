'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ChevronDown,
  ChevronRight,
  Save,
  User,
  Heart,
  ArrowRightLeft,
  Plus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUpdateMatterImmigration } from '@/lib/queries/immigration'
import {
  CRS_EDUCATION_LEVELS,
  CRS_NOC_TEER_CATEGORIES,
  CRS_CANADIAN_EDUCATION_OPTIONS,
  CRS_WORK_EXPERIENCE_OPTIONS,
  LANGUAGE_TEST_TYPES,
} from '@/lib/utils/constants'
import {
  calculateCrs,
  prefillFromImmigration,
  ieltsToClb,
  celpipToClb,
  tefToClb,
  DEFAULT_CRS_INPUT,
} from '@/lib/utils/crs-engine'
import type { CrsInput, CrsBreakdown, LanguageScores } from '@/lib/utils/crs-engine'
import type { Database } from '@/lib/types/database'

type MatterImmigration = Database['public']['Tables']['matter_immigration']['Row']

// ─── Props ──────────────────────────────────────────────────────────────────────

interface CrsCalculatorSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  immigration: MatterImmigration
  matterId: string
}

// ─── Score Color Helper ─────────────────────────────────────────────────────────

function getScoreColor(score: number): string {
  if (score >= 470) return 'text-green-600'
  if (score >= 400) return 'text-blue-600'
  if (score >= 300) return 'text-amber-600'
  return 'text-slate-600'
}

function getScoreBg(score: number): string {
  if (score >= 470) return 'bg-green-50 border-green-200'
  if (score >= 400) return 'bg-blue-50 border-blue-200'
  if (score >= 300) return 'bg-amber-50 border-amber-200'
  return 'bg-slate-50 border-slate-200'
}

// ─── Collapsible Section ────────────────────────────────────────────────────────

function CalcSection({
  title,
  icon: Icon,
  points,
  maxPoints,
  expanded,
  onToggle,
  children,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  points: number
  maxPoints: number
  expanded: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-400" />
          )}
          <Icon className="h-4 w-4 text-slate-500" />
          <span className="text-sm font-medium text-slate-700">{title}</span>
        </div>
        <Badge variant="secondary" className="font-mono text-xs">
          {points} / {maxPoints}
        </Badge>
      </button>
      {expanded && (
        <div className="px-4 py-4 space-y-4 border-t border-slate-200">
          {children}
        </div>
      )}
    </div>
  )
}

// ─── Field Row ──────────────────────────────────────────────────────────────────

function FieldRow({
  label,
  points,
  children,
}: {
  label: string
  points?: number
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium text-slate-600">{label}</Label>
        {points !== undefined && (
          <span className="text-xs font-mono text-slate-500">{points} pts</span>
        )}
      </div>
      {children}
    </div>
  )
}

// ─── Language Score Input Group ──────────────────────────────────────────────────

function LanguageInputGroup({
  scores,
  onChange,
  showClb,
  clbLevels,
  label,
}: {
  scores: LanguageScores
  onChange: (scores: LanguageScores) => void
  showClb?: boolean
  clbLevels?: LanguageScores
  label?: string
}) {
  const abilities = ['listening', 'reading', 'writing', 'speaking'] as const

  return (
    <div className="space-y-2">
      {label && <Label className="text-xs font-medium text-slate-600">{label}</Label>}
      <div className="grid grid-cols-4 gap-2">
        {abilities.map((ability) => (
          <div key={ability} className="space-y-1">
            <label className="text-[10px] uppercase tracking-wide text-slate-400 font-medium">
              {ability.charAt(0).toUpperCase()}
            </label>
            <Input
              type="number"
              min={0}
              max={12}
              step={showClb ? 1 : 0.5}
              value={scores[ability] || ''}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 0
                onChange({ ...scores, [ability]: val })
              }}
              className="h-8 text-center text-sm"
            />
            {showClb && clbLevels && (
              <div className="text-center">
                <Badge variant="outline" className="text-[10px] px-1 py-0">
                  CLB {clbLevels[ability]}
                </Badge>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export function CrsCalculatorSheet({
  open,
  onOpenChange,
  immigration,
  matterId,
}: CrsCalculatorSheetProps) {
  // Cast immigration for prefill (language_test_scores is Json in DB types)
  const immigrationForPrefill = useMemo(
    () => ({
      ...immigration,
      language_test_scores: immigration.language_test_scores as unknown as {
        listening?: number
        reading?: number
        writing?: number
        speaking?: number
      } | null,
    }),
    [immigration],
  )

  // Pre-fill from existing immigration data
  const initialInput = useMemo(() => {
    const prefilled = prefillFromImmigration(immigrationForPrefill)
    return { ...DEFAULT_CRS_INPUT, ...prefilled }
  }, [immigrationForPrefill])

  const [input, setInput] = useState<CrsInput>(initialInput)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['core', 'spouse', 'transferability', 'additional'])
  )

  const updateImmigration = useUpdateMatterImmigration()

  // Re-initialize when sheet opens with fresh data
  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (isOpen) {
        const prefilled = prefillFromImmigration(immigrationForPrefill)
        setInput({ ...DEFAULT_CRS_INPUT, ...prefilled })
        // Also reset raw test scores from immigration data
        const scores = immigrationForPrefill.language_test_scores
        setRawTestScores({
          listening: scores?.listening ?? 0,
          reading: scores?.reading ?? 0,
          writing: scores?.writing ?? 0,
          speaking: scores?.speaking ?? 0,
        })
      }
      onOpenChange(isOpen)
    },
    [immigrationForPrefill, onOpenChange],
  )

  // Real-time calculation
  const breakdown: CrsBreakdown = useMemo(() => calculateCrs(input), [input])

  // Raw test scores for first language (stored separately from CLB)
  const [rawTestScores, setRawTestScores] = useState<LanguageScores>(() => {
    const scores = immigration.language_test_scores as unknown as { listening?: number; reading?: number; writing?: number; speaking?: number } | null
    return {
      listening: scores?.listening ?? 0,
      reading: scores?.reading ?? 0,
      writing: scores?.writing ?? 0,
      speaking: scores?.speaking ?? 0,
    }
  })

  // Convert raw test scores → CLB when test type or scores change
  const firstLanguageClb = useMemo((): LanguageScores => {
    const testType = input.firstLanguageTestType.toLowerCase()
    if (testType === 'ielts_general' || testType === 'ielts_academic') {
      return {
        listening: ieltsToClb('listening', rawTestScores.listening),
        reading: ieltsToClb('reading', rawTestScores.reading),
        writing: ieltsToClb('writing', rawTestScores.writing),
        speaking: ieltsToClb('speaking', rawTestScores.speaking),
      }
    }
    if (testType === 'celpip') {
      return {
        listening: celpipToClb(rawTestScores.listening),
        reading: celpipToClb(rawTestScores.reading),
        writing: celpipToClb(rawTestScores.writing),
        speaking: celpipToClb(rawTestScores.speaking),
      }
    }
    if (testType === 'tef' || testType === 'tcf') {
      return {
        listening: tefToClb('listening', rawTestScores.listening),
        reading: tefToClb('reading', rawTestScores.reading),
        writing: tefToClb('writing', rawTestScores.writing),
        speaking: tefToClb('speaking', rawTestScores.speaking),
      }
    }
    // Direct CLB entry (no test type selected)
    return rawTestScores
  }, [input.firstLanguageTestType, rawTestScores])

  // Sync input.firstLanguage with computed CLB so calculateCrs() always uses correct values
  useEffect(() => {
    setInput((prev) => {
      // Only update if different to avoid infinite loops
      if (
        prev.firstLanguage.listening === firstLanguageClb.listening &&
        prev.firstLanguage.reading === firstLanguageClb.reading &&
        prev.firstLanguage.writing === firstLanguageClb.writing &&
        prev.firstLanguage.speaking === firstLanguageClb.speaking
      ) {
        return prev
      }
      return { ...prev, firstLanguage: firstLanguageClb }
    })
  }, [firstLanguageClb])

  // Keep input.firstLanguage in sync with computed CLB
  const updateFirstLanguageClb = useCallback(
    (newRaw: LanguageScores) => {
      setRawTestScores(newRaw)
      // Compute CLB from raw scores
      const testType = input.firstLanguageTestType.toLowerCase()
      let clb: LanguageScores
      if (testType === 'ielts_general' || testType === 'ielts_academic') {
        clb = {
          listening: ieltsToClb('listening', newRaw.listening),
          reading: ieltsToClb('reading', newRaw.reading),
          writing: ieltsToClb('writing', newRaw.writing),
          speaking: ieltsToClb('speaking', newRaw.speaking),
        }
      } else if (testType === 'celpip') {
        clb = {
          listening: celpipToClb(newRaw.listening),
          reading: celpipToClb(newRaw.reading),
          writing: celpipToClb(newRaw.writing),
          speaking: celpipToClb(newRaw.speaking),
        }
      } else if (testType === 'tef' || testType === 'tcf') {
        clb = {
          listening: tefToClb('listening', newRaw.listening),
          reading: tefToClb('reading', newRaw.reading),
          writing: tefToClb('writing', newRaw.writing),
          speaking: tefToClb('speaking', newRaw.speaking),
        }
      } else {
        clb = newRaw
      }
      setInput((prev) => ({ ...prev, firstLanguage: clb }))
    },
    [input.firstLanguageTestType],
  )

  // Update helper
  const update = useCallback(<K extends keyof CrsInput>(key: K, value: CrsInput[K]) => {
    setInput((prev) => ({ ...prev, [key]: value }))
  }, [])

  const toggleSection = useCallback((section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(section)) next.delete(section)
      else next.add(section)
      return next
    })
  }, [])

  // Save score to database
  const handleSave = useCallback(() => {
    updateImmigration.mutate(
      {
        matterId,
        crs_score: breakdown.total,
      },
      {
        onSuccess: () => {
          onOpenChange(false)
        },
      },
    )
  }, [matterId, breakdown.total, updateImmigration, onOpenChange])

  // Determine if we should show raw scores + CLB conversion
  const hasTestType = !!input.firstLanguageTestType && input.firstLanguageTestType !== ''

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col">
        <SheetHeader className="px-6 pt-6 pb-4">
          <SheetTitle>CRS Score Calculator</SheetTitle>
          <SheetDescription>
            Comprehensive Ranking System  -  Express Entry
          </SheetDescription>
        </SheetHeader>

        {/* Score Summary */}
        <div className={cn('mx-6 p-4 rounded-lg border', getScoreBg(breakdown.total))}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Total CRS Score
            </span>
            <span className={cn('text-3xl font-bold tabular-nums', getScoreColor(breakdown.total))}>
              {breakdown.total}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className="text-[10px]">
              Core {breakdown.coreHumanCapital.subtotal}
            </Badge>
            {input.hasSpouse && (
              <Badge variant="outline" className="text-[10px]">
                Spouse {breakdown.spouseFactors.subtotal}
              </Badge>
            )}
            <Badge variant="outline" className="text-[10px]">
              Transfer. {breakdown.skillTransferability.subtotal}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              Additional {breakdown.additionalPoints.subtotal}
            </Badge>
          </div>
        </div>

        <ScrollArea className="flex-1 min-h-0 px-6">
          <div className="space-y-3 py-4">
            {/* ═══════ SECTION A: Core / Human Capital ═══════ */}
            <CalcSection
              title="Core / Human Capital"
              icon={User}
              points={breakdown.coreHumanCapital.subtotal}
              maxPoints={breakdown.coreHumanCapital.max}
              expanded={expandedSections.has('core')}
              onToggle={() => toggleSection('core')}
            >
              {/* Age */}
              <FieldRow label="Age" points={breakdown.coreHumanCapital.age}>
                <Input
                  type="number"
                  min={17}
                  max={60}
                  value={input.age ?? ''}
                  onChange={(e) => update('age', e.target.value ? parseInt(e.target.value) : null)}
                  className="h-8 w-24 text-sm"
                  placeholder="e.g., 30"
                />
              </FieldRow>

              {/* Education */}
              <FieldRow label="Education Level" points={breakdown.coreHumanCapital.education}>
                <Select
                  value={input.educationLevel}
                  onValueChange={(v) => update('educationLevel', v)}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CRS_EDUCATION_LEVELS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldRow>

              {/* First Official Language */}
              <FieldRow
                label="First Official Language"
                points={breakdown.coreHumanCapital.firstLanguage}
              >
                <div className="space-y-3">
                  <Select
                    value={input.firstLanguageTestType || 'clb_direct'}
                    onValueChange={(v) => {
                      const testType = v === 'clb_direct' ? '' : v
                      update('firstLanguageTestType', testType)
                      // Re-convert raw scores with new test type
                      if (!testType) {
                        // Direct CLB  -  raw scores ARE the CLB
                        setInput((prev) => ({ ...prev, firstLanguageTestType: '', firstLanguage: rawTestScores }))
                      }
                    }}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Select test type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="clb_direct">Enter CLB directly</SelectItem>
                      {LANGUAGE_TEST_TYPES.filter((t) => t.value !== 'ielts_academic').map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <LanguageInputGroup
                    scores={hasTestType ? rawTestScores : input.firstLanguage}
                    onChange={hasTestType ? updateFirstLanguageClb : (s) => update('firstLanguage', s)}
                    showClb={hasTestType}
                    clbLevels={hasTestType ? firstLanguageClb : undefined}
                    label={hasTestType ? 'Test Scores (L / R / W / S)' : 'CLB Levels (L / R / W / S)'}
                  />
                </div>
              </FieldRow>

              {/* Second Official Language */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="hasSecondLang"
                    checked={input.hasSecondLanguage}
                    onCheckedChange={(checked) => update('hasSecondLanguage', !!checked)}
                  />
                  <label htmlFor="hasSecondLang" className="text-xs font-medium text-slate-600 cursor-pointer">
                    Second official language test results
                  </label>
                  {input.hasSecondLanguage && (
                    <span className="text-xs font-mono text-slate-500 ml-auto">
                      {breakdown.coreHumanCapital.secondLanguage} pts
                    </span>
                  )}
                </div>
                {input.hasSecondLanguage && (
                  <LanguageInputGroup
                    scores={input.secondLanguage}
                    onChange={(s) => update('secondLanguage', s)}
                    label="CLB Levels (L / R / W / S)"
                  />
                )}
              </div>

              {/* Canadian Work Experience */}
              <FieldRow
                label="Canadian Work Experience"
                points={breakdown.coreHumanCapital.canadianWorkExperience}
              >
                <Select
                  value={String(input.canadianWorkExperienceYears)}
                  onValueChange={(v) => update('canadianWorkExperienceYears', parseInt(v))}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CRS_WORK_EXPERIENCE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={String(opt.value)}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldRow>
            </CalcSection>

            {/* ═══════ SECTION B: Spouse / Partner ═══════ */}
            <CalcSection
              title="Spouse / Partner"
              icon={Heart}
              points={breakdown.spouseFactors.subtotal}
              maxPoints={breakdown.spouseFactors.max}
              expanded={expandedSections.has('spouse')}
              onToggle={() => toggleSection('spouse')}
            >
              <div className="flex items-center gap-2">
                <Checkbox
                  id="hasSpouse"
                  checked={input.hasSpouse}
                  onCheckedChange={(checked) => update('hasSpouse', !!checked)}
                />
                <label htmlFor="hasSpouse" className="text-xs font-medium text-slate-600 cursor-pointer">
                  Applicant has a spouse or common-law partner
                </label>
              </div>

              {input.hasSpouse && (
                <>
                  <FieldRow label="Spouse Education" points={breakdown.spouseFactors.education}>
                    <Select
                      value={input.spouseEducationLevel}
                      onValueChange={(v) => update('spouseEducationLevel', v)}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CRS_EDUCATION_LEVELS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FieldRow>

                  <FieldRow
                    label="Spouse Language (CLB)"
                    points={breakdown.spouseFactors.language}
                  >
                    <LanguageInputGroup
                      scores={input.spouseLanguage}
                      onChange={(s) => update('spouseLanguage', s)}
                    />
                  </FieldRow>

                  <FieldRow
                    label="Spouse Canadian Work Experience"
                    points={breakdown.spouseFactors.canadianWorkExperience}
                  >
                    <Select
                      value={String(input.spouseCanadianWorkExperienceYears)}
                      onValueChange={(v) => update('spouseCanadianWorkExperienceYears', parseInt(v))}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CRS_WORK_EXPERIENCE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={String(opt.value)}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FieldRow>
                </>
              )}

              {!input.hasSpouse && (
                <p className="text-xs text-slate-400 italic">
                  No spouse  -  core factor maximums are higher (500 vs 460).
                </p>
              )}
            </CalcSection>

            {/* ═══════ SECTION C: Skill Transferability ═══════ */}
            <CalcSection
              title="Skill Transferability"
              icon={ArrowRightLeft}
              points={breakdown.skillTransferability.subtotal}
              maxPoints={breakdown.skillTransferability.max}
              expanded={expandedSections.has('transferability')}
              onToggle={() => toggleSection('transferability')}
            >
              <FieldRow label="Foreign Work Experience">
                <Select
                  value={String(input.foreignWorkExperienceYears)}
                  onValueChange={(v) => update('foreignWorkExperienceYears', parseInt(v))}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CRS_WORK_EXPERIENCE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={String(opt.value)}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldRow>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="hasTradeCert"
                  checked={input.hasTradeCertificate}
                  onCheckedChange={(checked) => update('hasTradeCertificate', !!checked)}
                />
                <label htmlFor="hasTradeCert" className="text-xs font-medium text-slate-600 cursor-pointer">
                  Has a certificate of qualification (trade occupation)
                </label>
              </div>

              <Separator />

              <div className="space-y-1">
                <Label className="text-xs font-medium text-slate-500">Auto-calculated Breakdown</Label>
                <div className="bg-slate-50 rounded-md p-3 space-y-1.5 text-xs">
                  <TransferRow label="Education + Language" points={breakdown.skillTransferability.educationLanguage} />
                  <TransferRow label="Education + Canadian Work" points={breakdown.skillTransferability.educationCanadianWork} />
                  <TransferRow label="Foreign Work + Language" points={breakdown.skillTransferability.foreignWorkLanguage} />
                  <TransferRow label="Foreign Work + Canadian Work" points={breakdown.skillTransferability.foreignWorkCanadianWork} />
                  <TransferRow label="Trade Certificate + Language" points={breakdown.skillTransferability.tradeCertificateLanguage} />
                  <Separator className="my-1" />
                  <div className="flex justify-between font-medium text-slate-700">
                    <span>Total (capped at 100)</span>
                    <span className="font-mono">{breakdown.skillTransferability.subtotal}</span>
                  </div>
                </div>
              </div>
            </CalcSection>

            {/* ═══════ SECTION D: Additional Points ═══════ */}
            <CalcSection
              title="Additional Points"
              icon={Plus}
              points={breakdown.additionalPoints.subtotal}
              maxPoints={breakdown.additionalPoints.max}
              expanded={expandedSections.has('additional')}
              onToggle={() => toggleSection('additional')}
            >
              {/* Provincial Nomination */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="hasPNP"
                    checked={input.hasProvincialNomination}
                    onCheckedChange={(checked) => update('hasProvincialNomination', !!checked)}
                  />
                  <label htmlFor="hasPNP" className="text-xs font-medium text-slate-600 cursor-pointer">
                    Provincial / Territorial Nomination (PNP)
                  </label>
                </div>
                <span className="text-xs font-mono text-slate-500">
                  {breakdown.additionalPoints.provincialNomination} pts
                </span>
              </div>

              {/* Job Offer */}
              <FieldRow label="Job Offer (NOC TEER)" points={breakdown.additionalPoints.jobOffer}>
                <Select
                  value={input.jobOfferNocTeer}
                  onValueChange={(v) => update('jobOfferNocTeer', v)}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CRS_NOC_TEER_CATEGORIES.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldRow>

              {/* Canadian Education */}
              <FieldRow label="Canadian Education" points={breakdown.additionalPoints.canadianEducation}>
                <Select
                  value={input.canadianEducationYears}
                  onValueChange={(v) => update('canadianEducationYears', v)}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CRS_CANADIAN_EDUCATION_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldRow>

              {/* Sibling in Canada */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="hasSibling"
                    checked={input.hasSiblingInCanada}
                    onCheckedChange={(checked) => update('hasSiblingInCanada', !!checked)}
                  />
                  <label htmlFor="hasSibling" className="text-xs font-medium text-slate-600 cursor-pointer">
                    Sibling in Canada (PR or citizen)
                  </label>
                </div>
                <span className="text-xs font-mono text-slate-500">
                  {breakdown.additionalPoints.siblingInCanada} pts
                </span>
              </div>

              {/* French bonus (auto-calculated) */}
              {breakdown.additionalPoints.frenchLanguageBonus > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">French language bonus (auto-calculated)</span>
                  <span className="font-mono text-slate-500">
                    {breakdown.additionalPoints.frenchLanguageBonus} pts
                  </span>
                </div>
              )}
            </CalcSection>
          </div>
        </ScrollArea>

        {/* Footer */}
        <SheetFooter className="px-6 py-4 border-t border-slate-200">
          <div className="flex items-center justify-between w-full">
            <div className="text-sm text-slate-500">
              Score: <span className={cn('font-bold', getScoreColor(breakdown.total))}>{breakdown.total}</span> / 1200
            </div>
            <Button
              onClick={handleSave}
              disabled={updateImmigration.isPending}
            >
              <Save className="h-4 w-4 mr-2" />
              {updateImmigration.isPending ? 'Saving...' : 'Save Score to Case'}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

// ─── Transferability Breakdown Row ──────────────────────────────────────────────

function TransferRow({ label, points }: { label: string; points: number }) {
  return (
    <div className="flex justify-between text-slate-600">
      <span>{label}</span>
      <span className={cn('font-mono', points > 0 ? 'text-blue-600 font-medium' : 'text-slate-400')}>
        {points}
      </span>
    </div>
  )
}
