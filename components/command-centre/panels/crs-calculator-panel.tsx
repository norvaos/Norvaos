'use client'

import { useState, useMemo, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
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
  Calculator,
  User,
  Heart,
  Briefcase,
  GraduationCap,
  Languages,
  Globe,
  Award,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  CRS_EDUCATION_LEVELS,
  CRS_NOC_TEER_CATEGORIES,
  CRS_CANADIAN_EDUCATION_OPTIONS,
  CRS_WORK_EXPERIENCE_OPTIONS,
  LANGUAGE_TEST_TYPES,
} from '@/lib/utils/constants'
import {
  calculateCrs,
  ieltsToClb,
  celpipToClb,
  tefToClb,
  DEFAULT_CRS_INPUT,
} from '@/lib/utils/crs-engine'
import type { CrsInput, LanguageScores } from '@/lib/utils/crs-engine'

// ─── Score Color Helpers ────────────────────────────────────────────

function getScoreColor(score: number): string {
  if (score >= 470) return 'text-green-600'
  if (score >= 400) return 'text-blue-600'
  if (score >= 300) return 'text-amber-600'
  return 'text-slate-600'
}

function getScoreBadge(score: number): string {
  if (score >= 470) return 'bg-green-100 text-green-700 border-green-200'
  if (score >= 400) return 'bg-blue-100 text-blue-700 border-blue-200'
  if (score >= 300) return 'bg-amber-100 text-amber-700 border-amber-200'
  return 'bg-slate-100 text-slate-700 border-slate-200'
}

// ─── Collapsible Section ────────────────────────────────────────────

function Section({
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
        className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
          )}
          <Icon className="h-3.5 w-3.5 text-slate-500" />
          <span className="text-xs font-medium text-slate-700">{title}</span>
        </div>
        <span className={cn('text-xs font-semibold tabular-nums', getScoreColor(points))}>
          {points}/{maxPoints}
        </span>
      </button>
      {expanded && <div className="p-3 space-y-3">{children}</div>}
    </div>
  )
}

// ─── Language Input ─────────────────────────────────────────────────

function LanguageInput({
  label,
  scores,
  onChange,
  testType,
  onTestTypeChange,
  showTestType,
}: {
  label: string
  scores: LanguageScores
  onChange: (scores: LanguageScores) => void
  testType?: string
  onTestTypeChange?: (type: string) => void
  showTestType?: boolean
}) {
  const handleChange = (skill: keyof LanguageScores, value: string) => {
    const numVal = parseFloat(value) || 0
    const updated = { ...scores, [skill]: numVal }
    onChange(updated)
  }

  const convertToClb = useCallback(() => {
    if (!testType) return
    let converted: LanguageScores
    if (testType === 'ielts_general' || testType === 'ielts_academic') {
      converted = {
        listening: ieltsToClb('listening', scores.listening),
        reading: ieltsToClb('reading', scores.reading),
        writing: ieltsToClb('writing', scores.writing),
        speaking: ieltsToClb('speaking', scores.speaking),
      }
    } else if (testType === 'celpip') {
      converted = {
        listening: celpipToClb(scores.listening),
        reading: celpipToClb(scores.reading),
        writing: celpipToClb(scores.writing),
        speaking: celpipToClb(scores.speaking),
      }
    } else if (testType === 'tef' || testType === 'tcf') {
      converted = {
        listening: tefToClb('listening', scores.listening),
        reading: tefToClb('reading', scores.reading),
        writing: tefToClb('writing', scores.writing),
        speaking: tefToClb('speaking', scores.speaking),
      }
    } else {
      return
    }
    onChange(converted)
  }, [testType, scores, onChange])

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
      {showTestType && onTestTypeChange && (
        <div className="flex items-center gap-2">
          <Select value={testType ?? ''} onValueChange={onTestTypeChange}>
            <SelectTrigger className="h-7 text-xs flex-1">
              <SelectValue placeholder="Test type..." />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGE_TEST_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {testType && (
            <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={convertToClb}>
              → CLB
            </Button>
          )}
        </div>
      )}
      <div className="grid grid-cols-4 gap-2">
        {(['listening', 'reading', 'writing', 'speaking'] as const).map((skill) => (
          <div key={skill} className="space-y-0.5">
            <Label className="text-[10px] text-slate-400 capitalize">{skill}</Label>
            <Input
              type="number"
              className="h-7 text-xs"
              min={0}
              max={12}
              value={scores[skill] || ''}
              onChange={(e) => handleChange(skill, e.target.value)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── CRS Calculator Panel ───────────────────────────────────────────

export function CrsCalculatorPanel() {
  const [input, setInput] = useState<CrsInput>({ ...DEFAULT_CRS_INPUT })
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    core: true,
    language: false,
    work: false,
    spouse: false,
    additional: false,
  })

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const updateInput = useCallback(<K extends keyof CrsInput>(key: K, value: CrsInput[K]) => {
    setInput((prev) => ({ ...prev, [key]: value }))
  }, [])

  // Calculate CRS score
  const breakdown = useMemo(() => calculateCrs(input), [input])

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2 text-slate-700">
            <Calculator className="h-4 w-4" />
            CRS Score Calculator
          </CardTitle>
          <Badge
            variant="outline"
            className={cn('text-sm font-bold tabular-nums px-3', getScoreBadge(breakdown.total))}
          >
            {breakdown.total} / 1200
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* ─── Core / Human Capital ──────────────────── */}
        <Section
          title="Core / Human Capital"
          icon={User}
          points={breakdown.coreHumanCapital.subtotal}
          maxPoints={breakdown.coreHumanCapital.max}
          expanded={expandedSections.core}
          onToggle={() => toggleSection('core')}
        >
          {/* Age */}
          <div className="space-y-1.5">
            <Label className="text-[11px] text-slate-500">Age</Label>
            <Input
              type="number"
              className="h-7 text-xs"
              min={17}
              max={45}
              placeholder="Enter age..."
              value={input.age ?? ''}
              onChange={(e) => updateInput('age', parseInt(e.target.value) || null)}
            />
          </div>

          {/* Education */}
          <div className="space-y-1.5">
            <Label className="text-[11px] text-slate-500 flex items-center gap-1">
              <GraduationCap className="h-3 w-3" />
              Education Level
            </Label>
            <Select value={input.educationLevel} onValueChange={(v) => updateInput('educationLevel', v)}>
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CRS_EDUCATION_LEVELS.map((e) => (
                  <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Canadian Education */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="crs-can-edu"
              checked={input.hasCanadianEducation}
              onCheckedChange={(v) => updateInput('hasCanadianEducation', v === true)}
            />
            <Label htmlFor="crs-can-edu" className="text-[11px] text-slate-600 cursor-pointer">
              Canadian education credential
            </Label>
          </div>
          {input.hasCanadianEducation && (
            <Select value={input.canadianEducationYears} onValueChange={(v) => updateInput('canadianEducationYears', v)}>
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CRS_CANADIAN_EDUCATION_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Section>

        {/* ─── Language ──────────────────────────────── */}
        <Section
          title="Language Proficiency"
          icon={Languages}
          points={breakdown.coreHumanCapital.firstLanguage + breakdown.coreHumanCapital.secondLanguage}
          maxPoints={input.hasSpouse ? 128 + 22 : 136 + 24}
          expanded={expandedSections.language}
          onToggle={() => toggleSection('language')}
        >
          <LanguageInput
            label="First Official Language (CLB)"
            scores={input.firstLanguage}
            onChange={(s) => updateInput('firstLanguage', s)}
            testType={input.firstLanguageTestType}
            onTestTypeChange={(t) => updateInput('firstLanguageTestType', t)}
            showTestType
          />
          <Separator />
          <div className="flex items-center gap-2">
            <Checkbox
              id="crs-second-lang"
              checked={input.hasSecondLanguage}
              onCheckedChange={(v) => updateInput('hasSecondLanguage', v === true)}
            />
            <Label htmlFor="crs-second-lang" className="text-[11px] text-slate-600 cursor-pointer">
              Second official language
            </Label>
          </div>
          {input.hasSecondLanguage && (
            <LanguageInput
              label="Second Official Language (CLB)"
              scores={input.secondLanguage}
              onChange={(s) => updateInput('secondLanguage', s)}
            />
          )}
        </Section>

        {/* ─── Work Experience ───────────────────────── */}
        <Section
          title="Work Experience"
          icon={Briefcase}
          points={breakdown.coreHumanCapital.canadianWorkExperience}
          maxPoints={input.hasSpouse ? 70 : 80}
          expanded={expandedSections.work}
          onToggle={() => toggleSection('work')}
        >
          <div className="space-y-1.5">
            <Label className="text-[11px] text-slate-500">Canadian Work Experience (years)</Label>
            <Select
              value={input.canadianWorkExperienceYears.toString()}
              onValueChange={(v) => updateInput('canadianWorkExperienceYears', parseInt(v))}
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CRS_WORK_EXPERIENCE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value.toString()}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-slate-500">Foreign Work Experience (years)</Label>
            <Select
              value={input.foreignWorkExperienceYears.toString()}
              onValueChange={(v) => updateInput('foreignWorkExperienceYears', parseInt(v))}
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CRS_WORK_EXPERIENCE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value.toString()}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="crs-trade"
              checked={input.hasTradeCertificate}
              onCheckedChange={(v) => updateInput('hasTradeCertificate', v === true)}
            />
            <Label htmlFor="crs-trade" className="text-[11px] text-slate-600 cursor-pointer">
              Canadian trade certificate
            </Label>
          </div>
        </Section>

        {/* ─── Spouse ───────────────────────────────── */}
        <Section
          title="Spouse / Partner"
          icon={Heart}
          points={breakdown.spouseFactors.subtotal}
          maxPoints={breakdown.spouseFactors.max}
          expanded={expandedSections.spouse}
          onToggle={() => toggleSection('spouse')}
        >
          <div className="flex items-center gap-2">
            <Checkbox
              id="crs-spouse"
              checked={input.hasSpouse}
              onCheckedChange={(v) => updateInput('hasSpouse', v === true)}
            />
            <Label htmlFor="crs-spouse" className="text-[11px] text-slate-600 cursor-pointer">
              Accompanying spouse/partner
            </Label>
          </div>

          {input.hasSpouse && (
            <>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-slate-500">Spouse Education</Label>
                <Select value={input.spouseEducationLevel} onValueChange={(v) => updateInput('spouseEducationLevel', v)}>
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CRS_EDUCATION_LEVELS.map((e) => (
                      <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <LanguageInput
                label="Spouse Language (CLB)"
                scores={input.spouseLanguage}
                onChange={(s) => updateInput('spouseLanguage', s)}
              />
              <div className="space-y-1.5">
                <Label className="text-[11px] text-slate-500">Spouse Canadian Work (years)</Label>
                <Select
                  value={input.spouseCanadianWorkExperienceYears.toString()}
                  onValueChange={(v) => updateInput('spouseCanadianWorkExperienceYears', parseInt(v))}
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CRS_WORK_EXPERIENCE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value.toString()}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </Section>

        {/* ─── Additional Points ─────────────────────── */}
        <Section
          title="Additional Points"
          icon={Award}
          points={breakdown.additionalPoints.subtotal}
          maxPoints={breakdown.additionalPoints.max}
          expanded={expandedSections.additional}
          onToggle={() => toggleSection('additional')}
        >
          <div className="flex items-center gap-2">
            <Checkbox
              id="crs-pnp"
              checked={input.hasProvincialNomination}
              onCheckedChange={(v) => updateInput('hasProvincialNomination', v === true)}
            />
            <Label htmlFor="crs-pnp" className="text-[11px] text-slate-600 cursor-pointer">
              Provincial / Territorial nomination (+600)
            </Label>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] text-slate-500">Arranged Employment (NOC TEER)</Label>
            <Select value={input.jobOfferNocTeer} onValueChange={(v) => updateInput('jobOfferNocTeer', v)}>
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CRS_NOC_TEER_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="crs-sibling"
              checked={input.hasSiblingInCanada}
              onCheckedChange={(v) => updateInput('hasSiblingInCanada', v === true)}
            />
            <Label htmlFor="crs-sibling" className="text-[11px] text-slate-600 cursor-pointer">
              Sibling in Canada (citizen/PR) (+15)
            </Label>
          </div>
        </Section>

        {/* ─── Score Breakdown ───────────────────────── */}
        <div className="bg-slate-50 rounded-lg p-3 space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Core / Human Capital</span>
            <span className="font-medium tabular-nums">{breakdown.coreHumanCapital.subtotal}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Spouse Factors</span>
            <span className="tabular-nums">{breakdown.spouseFactors.subtotal}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Skill Transferability</span>
            <span className="tabular-nums">{breakdown.skillTransferability.subtotal}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Additional Points</span>
            <span className="tabular-nums">{breakdown.additionalPoints.subtotal}</span>
          </div>
          <Separator />
          <div className={cn('flex justify-between text-sm font-bold', getScoreColor(breakdown.total))}>
            <span>Total CRS Score</span>
            <span className="tabular-nums">{breakdown.total} / 1200</span>
          </div>
          {breakdown.total >= 470 && (
            <p className="text-[10px] text-green-600 mt-1">
              Above recent Express Entry draw cutoffs
            </p>
          )}
          {breakdown.total >= 300 && breakdown.total < 470 && (
            <p className="text-[10px] text-amber-600 mt-1">
              May qualify with PNP nomination or additional points
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
