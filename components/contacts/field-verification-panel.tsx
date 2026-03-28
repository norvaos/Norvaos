'use client'

/**
 * =============================================================================
 * Field Verification Panel — Data Integrity Gatekeeper
 * =============================================================================
 * Directive: Data Integrity Gatekeeper — Mandatory Verification Attachments
 *
 * When a high-security field (passport, name, DOB, national ID) is edited,
 * this Midnight Glass sub-panel slides out requiring either:
 *   1. An upload to the Verification_Evidence bucket, OR
 *   2. A mandatory Change_Rationale note
 *
 * The "Update" button is disabled until one of these is provided.
 * =============================================================================
 */

import { useState, useCallback } from 'react'
import { Upload, FileText, AlertTriangle, CheckCircle2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { isHighSecurityField } from '@/lib/queries/contact-field-history'

interface FieldChange {
  fieldName: string
  fieldLabel: string
  oldValue: string | null
  newValue: string | null
}

interface FieldVerificationPanelProps {
  changes: FieldChange[]
  onVerified: (verifications: FieldVerification[]) => void
  onCancel: () => void
}

export interface FieldVerification {
  fieldName: string
  oldValue: string | null
  newValue: string | null
  evidenceFile?: File
  rationale?: string
}

export function FieldVerificationPanel({
  changes,
  onVerified,
  onCancel,
}: FieldVerificationPanelProps) {
  const highSecurityChanges = changes.filter(c => isHighSecurityField(c.fieldName))
  const [verifications, setVerifications] = useState<Record<string, { file?: File; rationale: string }>>({})

  const updateVerification = useCallback((fieldName: string, update: Partial<{ file: File; rationale: string }>) => {
    setVerifications(prev => ({
      ...prev,
      [fieldName]: {
        ...prev[fieldName],
        rationale: prev[fieldName]?.rationale ?? '',
        ...update,
      },
    }))
  }, [])

  // Check if all high-security fields have either a file or a rationale
  const allVerified = highSecurityChanges.every(change => {
    const v = verifications[change.fieldName]
    return v && (v.file || v.rationale.trim().length > 0)
  })

  const handleConfirm = () => {
    const result: FieldVerification[] = changes.map(change => ({
      fieldName: change.fieldName,
      oldValue: change.oldValue,
      newValue: change.newValue,
      evidenceFile: verifications[change.fieldName]?.file,
      rationale: verifications[change.fieldName]?.rationale?.trim() || undefined,
    }))
    onVerified(result)
  }

  if (highSecurityChanges.length === 0) {
    // No high-security fields changed — auto-proceed
    handleConfirm()
    return null
  }

  return (
    <div
      className="rounded-xl border border-white/[0.08] p-5 space-y-4"
      style={{
        background: 'linear-gradient(180deg, rgba(2,6,23,0.94) 0%, rgba(2,6,23,0.98) 100%)',
        backdropFilter: 'blur(40px)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-amber-400" />
          <span className="text-[11px] font-mono uppercase tracking-[0.15em] text-amber-400">
            High-Security Field Change
          </span>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="p-1 rounded text-zinc-500 hover:text-white transition-colors"
        >
          <X className="size-4" />
        </button>
      </div>

      <p className="text-[10px] font-mono text-zinc-500">
        The following protected fields have been modified. Provide verification evidence or a change rationale for each.
      </p>

      {/* Field Change Cards */}
      <div className="space-y-3">
        {highSecurityChanges.map(change => {
          const v = verifications[change.fieldName]
          const isFieldVerified = v && (v.file || v.rationale.trim().length > 0)

          return (
            <div
              key={change.fieldName}
              className={`rounded-lg border p-3 space-y-2 transition-colors ${
                isFieldVerified
                  ? 'border-emerald-500/30 bg-emerald-500/5'
                  : 'border-white/[0.06] bg-white/[0.02]'
              }`}
            >
              {/* Field info */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                  {change.fieldLabel}
                </span>
                {isFieldVerified && (
                  <CheckCircle2 className="size-3.5 text-emerald-400" />
                )}
              </div>

              {/* Old → New value display */}
              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="text-zinc-600 line-through">{change.oldValue || '—'}</span>
                <span className="text-zinc-700">→</span>
                <span className="text-white">{change.newValue || '—'}</span>
              </div>

              {/* Upload zone */}
              <div className="flex items-center gap-2">
                <label className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2 rounded-md border border-dashed border-emerald-500/30 bg-emerald-500/5 px-3 py-2 hover:bg-emerald-500/10 transition-colors">
                    <Upload className="size-3.5 text-emerald-400" />
                    <span className="text-[10px] font-mono text-emerald-400">
                      {v?.file ? v.file.name : 'Upload Evidence'}
                    </span>
                  </div>
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) updateVerification(change.fieldName, { file })
                    }}
                  />
                </label>
              </div>

              {/* Rationale (alternative to upload) */}
              {!v?.file && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <FileText className="size-3 text-zinc-500" />
                    <span className="text-[9px] font-mono uppercase tracking-wider text-zinc-500">
                      Or provide rationale
                    </span>
                  </div>
                  <Textarea
                    value={v?.rationale ?? ''}
                    onChange={(e) => updateVerification(change.fieldName, { rationale: e.target.value })}
                    placeholder="Reason for change..."
                    rows={2}
                    className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-zinc-600 font-mono text-xs resize-none focus:border-emerald-500/50 focus:ring-emerald-500/20"
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-2 pt-2 border-t border-white/[0.06]">
        <Button
          variant="outline"
          size="sm"
          onClick={onCancel}
          className="border-white/[0.08] bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08] hover:text-white font-mono text-[10px] uppercase tracking-wider"
        >
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleConfirm}
          disabled={!allVerified}
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-[10px] uppercase tracking-wider shadow-lg shadow-emerald-500/20 disabled:bg-zinc-800 disabled:text-zinc-600 disabled:shadow-none"
        >
          Confirm Changes
        </Button>
      </div>
    </div>
  )
}

// ── Helper: Detect high-security field changes between old and new values ────

export function detectHighSecurityChanges(
  oldContact: Record<string, unknown>,
  newValues: Record<string, unknown>,
): FieldChange[] {
  const FIELD_LABELS: Record<string, string> = {
    first_name: 'First Name',
    last_name: 'Last Name',
    date_of_birth: 'Date of Birth',
    passport_number: 'Passport Number',
    national_id: 'National ID',
    uci: 'UCI',
  }

  const changes: FieldChange[] = []

  for (const [key, label] of Object.entries(FIELD_LABELS)) {
    const oldVal = String(oldContact[key] ?? '')
    const newVal = String(newValues[key] ?? '')
    if (oldVal !== newVal && newVal !== '') {
      changes.push({
        fieldName: key,
        fieldLabel: label,
        oldValue: oldVal || null,
        newValue: newVal || null,
      })
    }
  }

  return changes
}
