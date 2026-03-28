'use client'

import { useState } from 'react'
import { GripVertical, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { KioskQuestion } from '@/lib/types/kiosk-question'
import type { PortalLocale } from '@/lib/utils/portal-translations'
import { PORTAL_LOCALES } from '@/lib/utils/portal-translations'

interface KioskQuestionsSettingsProps {
  questions: KioskQuestion[]
  enabledLanguages: PortalLocale[]
  onChange: (questions: KioskQuestion[]) => void
}

const FIELD_TYPE_LABELS: Record<KioskQuestion['field_type'], string> = {
  select: 'Single Choice',
  multi_select: 'Multiple Choice',
  text: 'Short Text',
  textarea: 'Long Text',
  boolean: 'Yes / No',
}

function generateId() {
  return `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

/**
 * Admin settings component for managing kiosk check-in questions.
 * Supports add/edit/delete/reorder, per-question field type, options,
 * required toggle, and per-locale translation overrides.
 */
export function KioskQuestionsSettings({
  questions,
  enabledLanguages,
  onChange,
}: KioskQuestionsSettingsProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const sorted = [...questions].sort((a, b) => a.sort_order - b.sort_order)
  const nonEnLanguages = enabledLanguages.filter((l) => l !== 'en')
  const hasTranslations = nonEnLanguages.length > 0

  function addQuestion() {
    const newQ: KioskQuestion = {
      id: generateId(),
      field_type: 'select',
      label: '',
      is_required: false,
      options: [
        { label: 'Option 1', value: 'option_1' },
        { label: 'Option 2', value: 'option_2' },
      ],
      sort_order: sorted.length > 0 ? sorted[sorted.length - 1].sort_order + 1 : 0,
    }
    onChange([...questions, newQ])
    setExpandedId(newQ.id)
  }

  function updateQuestion(id: string, patch: Partial<KioskQuestion>) {
    onChange(questions.map((q) => (q.id === id ? { ...q, ...patch } : q)))
  }

  function removeQuestion(id: string) {
    onChange(questions.filter((q) => q.id !== id))
    if (expandedId === id) setExpandedId(null)
  }

  function moveUp(index: number) {
    if (index <= 0) return
    const reordered = [...sorted]
    const temp = reordered[index].sort_order
    reordered[index] = { ...reordered[index], sort_order: reordered[index - 1].sort_order }
    reordered[index - 1] = { ...reordered[index - 1], sort_order: temp }
    onChange(reordered)
  }

  function moveDown(index: number) {
    if (index >= sorted.length - 1) return
    const reordered = [...sorted]
    const temp = reordered[index].sort_order
    reordered[index] = { ...reordered[index], sort_order: reordered[index + 1].sort_order }
    reordered[index + 1] = { ...reordered[index + 1], sort_order: temp }
    onChange(reordered)
  }

  function addOption(questionId: string) {
    const q = questions.find((q) => q.id === questionId)
    if (!q) return
    const opts = q.options ?? []
    const num = opts.length + 1
    updateQuestion(questionId, {
      options: [...opts, { label: `Option ${num}`, value: `option_${num}` }],
    })
  }

  function updateOption(questionId: string, optIndex: number, label: string) {
    const q = questions.find((q) => q.id === questionId)
    if (!q) return
    const opts = [...(q.options ?? [])]
    opts[optIndex] = { ...opts[optIndex], label }
    updateQuestion(questionId, { options: opts })
  }

  function removeOption(questionId: string, optIndex: number) {
    const q = questions.find((q) => q.id === questionId)
    if (!q) return
    const opts = [...(q.options ?? [])]
    opts.splice(optIndex, 1)
    updateQuestion(questionId, { options: opts })
  }

  function updateTranslation(
    questionId: string,
    locale: PortalLocale,
    field: 'label' | 'description' | 'placeholder',
    value: string,
  ) {
    const q = questions.find((q) => q.id === questionId)
    if (!q) return
    const translations = { ...(q.translations ?? {}) }
    translations[locale] = { ...(translations[locale] ?? {}), [field]: value || undefined }
    updateQuestion(questionId, { translations })
  }

  return (
    <div className="space-y-3">
      {sorted.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-4">
          No questions configured. Add one to get started.
        </p>
      ) : (
        sorted.map((q, index) => {
          const isExpanded = expandedId === q.id
          const hasOptions = q.field_type === 'select' || q.field_type === 'multi_select'

          return (
            <div key={q.id} className="border rounded-lg bg-white">
              {/* Header row */}
              <div className="flex items-center gap-2 p-3">
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => moveUp(index)}
                    disabled={index === 0}
                    className="text-slate-400 hover:text-slate-600 disabled:opacity-30"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveDown(index)}
                    disabled={index === sorted.length - 1}
                    className="text-slate-400 hover:text-slate-600 disabled:opacity-30"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>

                <GripVertical className="w-4 h-4 text-slate-300 flex-shrink-0" />

                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : q.id)}
                  className="flex-1 text-left flex items-center gap-2"
                >
                  <span className="text-sm font-medium text-slate-800 truncate">
                    {q.label || 'Untitled Question'}
                  </span>
                  <Badge variant="outline" className="text-xs flex-shrink-0">
                    {FIELD_TYPE_LABELS[q.field_type]}
                  </Badge>
                  {q.is_required && (
                    <Badge variant="secondary" className="text-xs flex-shrink-0">Required</Badge>
                  )}
                </button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeQuestion(q.id)}
                  className="text-red-500 hover:text-red-400 flex-shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>

              {/* Expanded editor */}
              {isExpanded && (
                <div className="border-t p-4 space-y-4">
                  {/* Field type */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-600">Field Type</label>
                      <Select
                        value={q.field_type}
                        onValueChange={(v) => updateQuestion(q.id, { field_type: v as KioskQuestion['field_type'] })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(FIELD_TYPE_LABELS).map(([val, label]) => (
                            <SelectItem key={val} value={val}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-end gap-3 pb-1">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={q.is_required}
                          onCheckedChange={(v) => updateQuestion(q.id, { is_required: v })}
                        />
                        <span className="text-sm text-slate-700">Required</span>
                      </div>
                    </div>
                  </div>

                  {/* Label */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">Question Label (English)</label>
                    <Input
                      value={q.label}
                      onChange={(e) => updateQuestion(q.id, { label: e.target.value })}
                      placeholder="e.g., What is the nature of your visit?"
                    />
                  </div>

                  {/* Description */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">Description (English)</label>
                    <Textarea
                      value={q.description ?? ''}
                      onChange={(e) => updateQuestion(q.id, { description: e.target.value || undefined })}
                      placeholder="Optional help text shown below the question"
                      rows={2}
                    />
                  </div>

                  {/* Placeholder (for text/textarea only) */}
                  {(q.field_type === 'text' || q.field_type === 'textarea') && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-600">Placeholder</label>
                      <Input
                        value={q.placeholder ?? ''}
                        onChange={(e) => updateQuestion(q.id, { placeholder: e.target.value || undefined })}
                        placeholder="Placeholder text"
                      />
                    </div>
                  )}

                  {/* Options (for select/multi_select) */}
                  {hasOptions && (
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-slate-600">Options</label>
                      <div className="space-y-2">
                        {(q.options ?? []).map((opt, oi) => (
                          <div key={oi} className="flex items-center gap-2">
                            <Input
                              value={opt.label}
                              onChange={(e) => updateOption(q.id, oi, e.target.value)}
                              className="flex-1"
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeOption(q.id, oi)}
                              disabled={(q.options ?? []).length <= 1}
                              className="text-red-400"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => addOption(q.id)}
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        Add Option
                      </Button>
                    </div>
                  )}

                  {/* Translation overrides */}
                  {hasTranslations && (
                    <div className="space-y-3 pt-3 border-t border-slate-100">
                      <p className="text-xs font-medium text-slate-600">
                        Translations
                      </p>
                      {nonEnLanguages.map((loc) => {
                        const localeInfo = PORTAL_LOCALES.find((l) => l.value === loc)
                        const t = q.translations?.[loc]
                        return (
                          <div key={loc} className="space-y-2 pl-3 border-l-2 border-slate-100">
                            <p className="text-xs font-medium text-slate-500">
                              {localeInfo?.label ?? loc} ({localeInfo?.nativeLabel ?? loc})
                            </p>
                            <Input
                              value={t?.label ?? ''}
                              onChange={(e) => updateTranslation(q.id, loc, 'label', e.target.value)}
                              placeholder={`Label in ${localeInfo?.label ?? loc}`}
                              className="text-sm"
                            />
                            <Input
                              value={t?.description ?? ''}
                              onChange={(e) => updateTranslation(q.id, loc, 'description', e.target.value)}
                              placeholder={`Description in ${localeInfo?.label ?? loc}`}
                              className="text-sm"
                            />
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })
      )}

      <Button
        variant="outline"
        onClick={addQuestion}
        className="w-full"
      >
        <Plus className="w-4 h-4 mr-2" />
        Add Question
      </Button>
    </div>
  )
}
