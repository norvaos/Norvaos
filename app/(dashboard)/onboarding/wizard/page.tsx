'use client'

/**
 * 7-Step Onboarding Wizard  -  NorvaOS
 *
 * Step 1  -  Firm Setup         (firm_name, logo, practice_areas)
 * Step 2  -  First Lawyer       (first_name, last_name, email, bar_number)
 * Step 3  -  First Matter Type  (3 immigration defaults or skip)
 * Step 4  -  Billing Defaults   (currency, flat_fee_default, hourly_rate_default)
 * Step 5  -  Branding           (primary_colour, email_footer)
 * Step 6  -  Invite Team        (email + role pairs)
 * Step 7  -  Done               (success + mark complete)
 *
 * Skip is available from Step 3 onward.
 * State is held in useState  -  no cross-refresh persistence needed.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useTenant } from '@/lib/hooks/use-tenant'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  Building2,
  Users,
  FileText,
  CreditCard,
  Palette,
  UserPlus,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  SkipForward,
  Plus,
  Trash2,
  Loader2,
  Upload,
} from 'lucide-react'

// ─── Step metadata ─────────────────────────────────────────────────────────────

interface StepMeta {
  index:     number
  label:     string
  icon:      React.ElementType
  skippable: boolean
}

const STEPS: StepMeta[] = [
  { index: 0, label: 'Firm Setup',        icon: Building2,    skippable: false },
  { index: 1, label: 'First Lawyer',       icon: Users,        skippable: false },
  { index: 2, label: 'Matter Types',       icon: FileText,     skippable: true  },
  { index: 3, label: 'Billing Defaults',   icon: CreditCard,   skippable: true  },
  { index: 4, label: 'Branding',           icon: Palette,      skippable: true  },
  { index: 5, label: 'Invite Team',        icon: UserPlus,     skippable: true  },
  { index: 6, label: 'Done',               icon: CheckCircle2, skippable: false },
]

const TOTAL_STEPS = STEPS.length

// ─── Types ─────────────────────────────────────────────────────────────────────

type PracticeAreaKey = 'Immigration' | 'Real Estate' | 'Family Law' | 'Corporate' | 'Wills & Estates'

interface InviteEntry {
  email: string
  role: 'lawyer' | 'legal_assistant' | 'front_desk' | 'billing' | 'admin'
}

interface WizardState {
  // Step 1
  firmName: string
  logoUrl: string | null
  logoFile: File | null
  selectedPracticeAreas: PracticeAreaKey[]
  officeAddress: string
  officePhone: string
  officeEmail: string

  // Step 2
  lawyerFirstName: string
  lawyerLastName: string
  lawyerEmail: string
  lawyerBarNumber: string

  // Step 3
  seedMatterTypes: boolean

  // Step 4
  currency: 'CAD' | 'USD'
  flatFeeDefault: string
  hourlyRateDefault: string

  // Step 5
  primaryColour: string
  emailFooter: string

  // Step 6
  invites: InviteEntry[]
}

const DEFAULT_STATE: WizardState = {
  firmName: '',
  logoUrl: null,
  logoFile: null,
  // Immigration is the only active practice area  -  pre-selected and locked
  selectedPracticeAreas: ['Immigration'],
  officeAddress: '',
  officePhone: '',
  officeEmail: '',
  lawyerFirstName: '',
  lawyerLastName: '',
  lawyerEmail: '',
  lawyerBarNumber: '',
  seedMatterTypes: true,
  currency: 'CAD',
  flatFeeDefault: '',
  hourlyRateDefault: '',
  primaryColour: '#3b82f6',
  emailFooter: '',
  invites: [{ email: '', role: 'lawyer' }],
}

const PRACTICE_AREAS: PracticeAreaKey[] = [
  'Immigration',
  'Real Estate',
  'Family Law',
  'Corporate',
  'Wills & Estates',
]

const ROLE_LABELS: Record<InviteEntry['role'], string> = {
  lawyer:          'Lawyer',
  legal_assistant: 'Legal Assistant',
  front_desk:      'Front Desk',
  billing:         'Billing',
  admin:           'Admin',
}

const DEFAULT_MATTER_TYPES = [
  { name: 'Study Permit',   description: 'Temporary resident permit for students studying in Canada.' },
  { name: 'Work Permit',    description: 'Permit authorising foreign nationals to work in Canada.' },
  { name: 'PR Application', description: 'Permanent Residency application under Express Entry or Provincial Nominee Program.' },
]

// ─── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ step }: { step: number }) {
  const pct = Math.round(((step + 1) / TOTAL_STEPS) * 100)
  return (
    <div className="relative h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-indigo-600 transition-all duration-500 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

// ─── Step 1: Firm Setup ─────────────────────────────────────────────────────────

function StepFirmSetup({
  state,
  onChange,
  onLogoUpload,
  uploading,
}: {
  state: WizardState
  onChange: (patch: Partial<WizardState>) => void
  onLogoUpload: (file: File) => Promise<void>
  uploading: boolean
}) {
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Firm Setup</h2>
        <p className="text-sm text-slate-500 mt-1">Tell us about your firm so we can personalise your workspace.</p>
      </div>

      {/* Firm name */}
      <div className="space-y-1.5">
        <Label htmlFor="firmName">Firm Name <span className="text-red-500">*</span></Label>
        <Input
          id="firmName"
          placeholder="e.g. Waseer Law Office"
          value={state.firmName}
          onChange={(e) => onChange({ firmName: e.target.value })}
        />
      </div>

      {/* Office contact details */}
      <div className="space-y-1.5">
        <Label htmlFor="officeAddress">Office Address <span className="text-slate-400 font-normal">(optional)</span></Label>
        <Input
          id="officeAddress"
          placeholder="e.g. 123 Main St, Toronto, ON M1A 1A1"
          value={state.officeAddress}
          onChange={(e) => onChange({ officeAddress: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="officePhone">Office Phone <span className="text-slate-400 font-normal">(optional)</span></Label>
          <Input
            id="officePhone"
            type="tel"
            placeholder="e.g. (416) 555-0100"
            value={state.officePhone}
            onChange={(e) => onChange({ officePhone: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="officeEmail">Office Email <span className="text-slate-400 font-normal">(optional)</span></Label>
          <Input
            id="officeEmail"
            type="email"
            placeholder="e.g. info@yourfirm.com"
            value={state.officeEmail}
            onChange={(e) => onChange({ officeEmail: e.target.value })}
          />
        </div>
      </div>

      <p className="text-xs text-slate-400 -mt-2">
        These details will be used in letters, forms, and client communications across the platform.
      </p>

      {/* Logo upload */}
      <div className="space-y-1.5">
        <Label>Firm Logo <span className="text-slate-400 font-normal">(optional)</span></Label>
        <div className="flex items-center gap-3">
          {state.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={state.logoUrl} alt="Firm logo" className="h-12 w-12 rounded-md object-cover border border-slate-200" />
          ) : (
            <div className="h-12 w-12 rounded-md border-2 border-dashed border-slate-300 flex items-center justify-center bg-slate-50">
              <Building2 className="h-5 w-5 text-slate-400" />
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? (
              <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Uploading…</>
            ) : (
              <><Upload className="mr-1.5 h-3.5 w-3.5" />Choose Logo</>
            )}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onLogoUpload(file)
            }}
          />
        </div>
        <p className="text-xs text-slate-400">PNG, JPG or SVG  -  max 2 MB</p>
      </div>

      {/* Practice areas  -  Immigration is locked as the primary area */}
      <div className="space-y-2">
        <Label>Practice Areas</Label>
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-indigo-800">Immigration</p>
            <p className="text-xs text-indigo-600 mt-0.5">Primary practice area  -  automation and workflows are fully configured for Immigration.</p>
          </div>
          <CheckCircle2 className="h-5 w-5 text-indigo-600 shrink-0" />
        </div>
        <p className="text-xs text-slate-400">
          Additional practice areas can be added later from <strong>Settings → Practice Areas</strong>. Automated workflows are currently available for Immigration only.
        </p>
      </div>
    </div>
  )
}

// ─── Step 2: First Lawyer ───────────────────────────────────────────────────────

function StepFirstLawyer({
  state,
  onChange,
}: {
  state: WizardState
  onChange: (patch: Partial<WizardState>) => void
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">First Lawyer</h2>
        <p className="text-sm text-slate-500 mt-1">Add the primary lawyer for your firm. They&apos;ll receive an invite if they&apos;re not already a user.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="lawyerFirst">First Name <span className="text-red-500">*</span></Label>
          <Input
            id="lawyerFirst"
            placeholder="Jane"
            value={state.lawyerFirstName}
            onChange={(e) => onChange({ lawyerFirstName: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lawyerLast">Last Name <span className="text-red-500">*</span></Label>
          <Input
            id="lawyerLast"
            placeholder="Smith"
            value={state.lawyerLastName}
            onChange={(e) => onChange({ lawyerLastName: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="lawyerEmail">Email Address <span className="text-red-500">*</span></Label>
        <Input
          id="lawyerEmail"
          type="email"
          placeholder="jane@firmname.com"
          value={state.lawyerEmail}
          onChange={(e) => onChange({ lawyerEmail: e.target.value })}
        />
        <p className="text-xs text-slate-400">An invitation will be sent if this is a new email address.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="lawyerBar">Bar Number <span className="text-slate-400 font-normal">(optional)</span></Label>
        <Input
          id="lawyerBar"
          placeholder="e.g. ON-12345"
          value={state.lawyerBarNumber}
          onChange={(e) => onChange({ lawyerBarNumber: e.target.value })}
        />
      </div>

      <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        <strong>Role:</strong> Lawyer  -  will be set automatically.
      </div>
    </div>
  )
}

// ─── Step 3: First Matter Types ─────────────────────────────────────────────────

function StepMatterTypes({
  state,
  onChange,
}: {
  state: WizardState
  onChange: (patch: Partial<WizardState>) => void
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">First Matter Types</h2>
        <p className="text-sm text-slate-500 mt-1">We can seed three common Immigration matter types to get you started, or you can configure them yourself later.</p>
      </div>

      {/* Option A  -  Accept defaults */}
      <button
        type="button"
        onClick={() => onChange({ seedMatterTypes: true })}
        className={cn(
          'w-full rounded-xl border-2 p-4 text-left transition-colors',
          state.seedMatterTypes
            ? 'border-indigo-600 bg-indigo-50'
            : 'border-slate-200 bg-white hover:border-slate-300'
        )}
      >
        <div className="flex items-center gap-2 mb-3">
          <div className={cn('h-4 w-4 rounded-full border-2 flex items-center justify-center', state.seedMatterTypes ? 'border-indigo-600' : 'border-slate-400')}>
            {state.seedMatterTypes && <div className="h-2 w-2 rounded-full bg-indigo-600" />}
          </div>
          <span className="font-medium text-slate-900">Add these 3 defaults</span>
          <Badge variant="secondary" className="ml-auto text-xs">Recommended</Badge>
        </div>
        <div className="space-y-2 pl-6">
          {DEFAULT_MATTER_TYPES.map((mt) => (
            <div key={mt.name} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
              <p className="text-sm font-medium text-slate-900">{mt.name}</p>
              <p className="text-xs text-slate-500 mt-0.5">{mt.description}</p>
            </div>
          ))}
        </div>
      </button>

      {/* Option B  -  Skip */}
      <button
        type="button"
        onClick={() => onChange({ seedMatterTypes: false })}
        className={cn(
          'w-full rounded-xl border-2 p-4 text-left transition-colors',
          !state.seedMatterTypes
            ? 'border-indigo-600 bg-indigo-50'
            : 'border-slate-200 bg-white hover:border-slate-300'
        )}
      >
        <div className="flex items-center gap-2">
          <div className={cn('h-4 w-4 rounded-full border-2 flex items-center justify-center', !state.seedMatterTypes ? 'border-indigo-600' : 'border-slate-400')}>
            {!state.seedMatterTypes && <div className="h-2 w-2 rounded-full bg-indigo-600" />}
          </div>
          <span className="font-medium text-slate-900">Configure matter types myself later</span>
        </div>
        <p className="mt-1 pl-6 text-sm text-slate-500">Skip this step and set up matter types from Settings → Matter Types.</p>
      </button>
    </div>
  )
}

// ─── Step 4: Billing Defaults ───────────────────────────────────────────────────

function StepBillingDefaults({
  state,
  onChange,
}: {
  state: WizardState
  onChange: (patch: Partial<WizardState>) => void
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Billing Defaults</h2>
        <p className="text-sm text-slate-500 mt-1">Set default billing rates for new matters. These can be overridden per-matter at any time.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="currency">Currency</Label>
        <Select value={state.currency} onValueChange={(v) => onChange({ currency: v as 'CAD' | 'USD' })}>
          <SelectTrigger id="currency" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="CAD">CAD  -  Canadian Dollar</SelectItem>
            <SelectItem value="USD">USD  -  US Dollar</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="flatFee">Default Flat Fee ({state.currency})</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
            <Input
              id="flatFee"
              type="number"
              min="0"
              step="50"
              placeholder="0.00"
              className="pl-6"
              value={state.flatFeeDefault}
              onChange={(e) => onChange({ flatFeeDefault: e.target.value })}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="hourlyRate">Default Hourly Rate ({state.currency}/hr)</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
            <Input
              id="hourlyRate"
              type="number"
              min="0"
              step="25"
              placeholder="0.00"
              className="pl-6"
              value={state.hourlyRateDefault}
              onChange={(e) => onChange({ hourlyRateDefault: e.target.value })}
            />
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-400">
        These values will be saved in your firm settings and can be updated at any time from <strong>Settings → Billing</strong>.
      </p>
    </div>
  )
}

// ─── Step 5: Branding ───────────────────────────────────────────────────────────

function StepBranding({
  state,
  onChange,
  firmName,
}: {
  state: WizardState
  onChange: (patch: Partial<WizardState>) => void
  firmName: string
}) {
  const defaultFooter = `Sent by ${firmName || 'Your Firm'}`

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Branding</h2>
        <p className="text-sm text-slate-500 mt-1">Personalise the colours and email footer that appear on client-facing communications.</p>
      </div>

      {/* Colour picker */}
      <div className="space-y-1.5">
        <Label htmlFor="primaryColour">Primary Colour</Label>
        <div className="flex items-center gap-3">
          <div
            className="h-10 w-10 rounded-md border border-slate-200 shadow-sm"
            style={{ backgroundColor: state.primaryColour }}
          />
          <Input
            id="primaryColour"
            type="color"
            value={state.primaryColour}
            onChange={(e) => onChange({ primaryColour: e.target.value })}
            className="h-10 w-20 cursor-pointer rounded-md p-1"
          />
          <Input
            placeholder="#3b82f6"
            value={state.primaryColour}
            onChange={(e) => {
              const val = e.target.value
              if (/^#[0-9a-fA-F]{0,6}$/.test(val)) onChange({ primaryColour: val })
            }}
            className="w-32 font-mono"
            maxLength={7}
          />
        </div>
        <p className="text-xs text-slate-400">Used in email headers, portal, and client-facing UI.</p>
      </div>

      {/* Email footer */}
      <div className="space-y-1.5">
        <Label htmlFor="emailFooter">Email Footer</Label>
        <Textarea
          id="emailFooter"
          rows={3}
          placeholder={defaultFooter}
          value={state.emailFooter}
          onChange={(e) => onChange({ emailFooter: e.target.value })}
        />
        <p className="text-xs text-slate-400">Appended to client notification emails. Leave blank to use: &ldquo;{defaultFooter}&rdquo;</p>
      </div>
    </div>
  )
}

// ─── Step 6: Invite Team ────────────────────────────────────────────────────────

function StepInviteTeam({
  state,
  onChange,
}: {
  state: WizardState
  onChange: (patch: Partial<WizardState>) => void
}) {
  function updateInvite(index: number, patch: Partial<InviteEntry>) {
    const next = state.invites.map((inv, i) => (i === index ? { ...inv, ...patch } : inv))
    onChange({ invites: next })
  }

  function addInvite() {
    onChange({ invites: [...state.invites, { email: '', role: 'lawyer' }] })
  }

  function removeInvite(index: number) {
    const next = state.invites.filter((_, i) => i !== index)
    onChange({ invites: next.length > 0 ? next : [{ email: '', role: 'lawyer' }] })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Invite Your Team</h2>
        <p className="text-sm text-slate-500 mt-1">Send invitations to your team members. They&apos;ll receive an email with a link to set up their accounts.</p>
      </div>

      <div className="space-y-3">
        {state.invites.map((invite, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              type="email"
              placeholder="colleague@firmname.com"
              value={invite.email}
              onChange={(e) => updateInvite(index, { email: e.target.value })}
              className="flex-1"
            />
            <Select
              value={invite.role}
              onValueChange={(v) => updateInvite(index, { role: v as InviteEntry['role'] })}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(ROLE_LABELS) as [InviteEntry['role'], string][]).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 text-slate-400 hover:text-red-500"
              onClick={() => removeInvite(index)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" size="sm" onClick={addInvite} className="gap-1.5">
        <Plus className="h-4 w-4" />
        Add another
      </Button>

      <p className="text-xs text-slate-400">
        You can invite more team members later from <strong>Settings → Team</strong>. Invitations are valid for 7 days.
      </p>
    </div>
  )
}

// ─── Step 7: Done ───────────────────────────────────────────────────────────────

function StepDone({ firmName }: { firmName: string }) {
  return (
    <div className="py-6 text-center space-y-5">
      <div className="flex justify-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-950/40">
          <CheckCircle2 className="h-11 w-11 text-emerald-600" />
        </div>
      </div>
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Your firm is ready!</h2>
        <p className="mt-2 text-sm text-slate-500 max-w-sm mx-auto">
          {firmName ? `${firmName} is` : 'Your workspace is'} fully configured and ready to open matters, serve clients, and grow.
        </p>
      </div>
      <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-400 text-left max-w-sm mx-auto">
        <p className="font-medium mb-1.5">What&apos;s set up:</p>
        <ul className="space-y-1 text-xs">
          <li>✓ Firm profile &amp; branding</li>
          <li>✓ Practice areas enabled</li>
          <li>✓ Billing defaults configured</li>
          <li>✓ Team invitations sent</li>
        </ul>
      </div>
    </div>
  )
}

// ─── Main wizard ────────────────────────────────────────────────────────────────

export default function SimpleOnboardingWizard() {
  const router = useRouter()
  const { tenant } = useTenant()
  const [step, setStep]     = useState(0)
  const [state, setState]   = useState<WizardState>(DEFAULT_STATE)
  const [saving, setSaving] = useState(false)
  const [logoUploading, setLogoUploading] = useState(false)
  const [inviteResults, setInviteResults] = useState<{ email: string; ok: boolean; error?: string }[]>([])

  // Pre-populate firm name from the already-created tenant (DEF-005)
  // This ensures the name entered at signup is carried through to the wizard
  // and prevents stale or incorrect values being written back via applyFirmSetup.
  useEffect(() => {
    if (tenant?.name && !state.firmName) {
      setState((prev) => ({ ...prev, firmName: tenant.name }))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.name])

  const isDoneStep  = step === TOTAL_STEPS - 1
  const canSkip     = step >= 2 && step < TOTAL_STEPS - 1

  const onChange = useCallback((patch: Partial<WizardState>) => {
    setState((prev) => ({ ...prev, ...patch }))
  }, [])

  // ── Logo upload ─────────────────────────────────────────────────────────────

  async function handleLogoUpload(file: File) {
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Logo must be under 2 MB.')
      return
    }
    setLogoUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/onboarding/upload-logo', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) throw new Error('Upload failed')
      const { url } = await res.json() as { url: string }
      onChange({ logoUrl: url, logoFile: file })
      toast.success('Logo uploaded.')
    } catch {
      toast.error('Failed to upload logo. You can add it later from Settings.')
    } finally {
      setLogoUploading(false)
    }
  }

  // ── Validation ──────────────────────────────────────────────────────────────

  function validateStep(s: number): string | null {
    if (s === 0) {
      if (!state.firmName.trim()) return 'Firm name is required.'
    }
    if (s === 1) {
      if (!state.lawyerFirstName.trim()) return 'First name is required.'
      if (!state.lawyerLastName.trim())  return 'Last name is required.'
      if (!state.lawyerEmail.trim())     return 'Email is required.'
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.lawyerEmail)) return 'Enter a valid email address.'
    }
    return null
  }

  // ── Save step to wizard row ─────────────────────────────────────────────────

  async function saveStepToWizard(currentStep: number) {
    // Map step index to wizard answer key
    const stepKeyMap: Record<number, string> = {
      0: 'firmProfile',
      1: 'rolesSetup',
      2: 'documentTemplates',
      3: 'billingSetup',
      4: 'emailSetup',
    }
    const stepKey = stepKeyMap[currentStep]
    if (!stepKey) return // steps 5 & 6 are handled separately

    let stepData: unknown

    switch (currentStep) {
      case 0:
        stepData = {
          firmName:      state.firmName.trim(),
          primaryColour: state.primaryColour,
        }
        break
      case 1:
        stepData = {
          useStandardRoles: true,
          standardRoles: ['Lawyer'],
        }
        break
      case 2:
        stepData = {
          seedTemplates: state.seedMatterTypes,
          templateSet:   state.seedMatterTypes ? 'immigration' : 'none',
        }
        break
      case 3:
        stepData = {
          billingEnabled:           true,
          trustAccountingEnabled:   false,
          currency:                 state.currency,
          defaultPaymentTermDays:   30,
        }
        break
      case 4:
        stepData = {
          emailSignatureEnabled: true,
          senderName:            state.firmName.trim() || undefined,
          replyToAddress:        undefined,
        }
        break
      default:
        return
    }

    await fetch('/api/onboarding/wizard', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        current_step: currentStep,
        step_key:     stepKey,
        step_data:    stepData,
        mode:         'custom',
      }),
    })
  }

  // ── Apply firm setup directly to tenants table ──────────────────────────────

  async function applyFirmSetup() {
    // Update firm name, logo, practice areas, office contact and billing via dedicated route
    await fetch('/api/onboarding/apply-setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firmName:           state.firmName.trim(),
        logoUrl:            state.logoUrl,
        practiceAreas:      state.selectedPracticeAreas,
        currency:           state.currency,
        flatFeeDefault:     state.flatFeeDefault ? Number(state.flatFeeDefault) : null,
        hourlyRateDefault:  state.hourlyRateDefault ? Number(state.hourlyRateDefault) : null,
        primaryColour:      state.primaryColour,
        emailFooter:        state.emailFooter.trim() || `Sent by ${state.firmName.trim()}`,
        seedMatterTypes:    state.seedMatterTypes,
        lawyerFirstName:    state.lawyerFirstName.trim(),
        lawyerLastName:     state.lawyerLastName.trim(),
        lawyerEmail:        state.lawyerEmail.trim(),
        lawyerBarNumber:    state.lawyerBarNumber.trim(),
        officeAddress:      state.officeAddress.trim() || undefined,
        officePhone:        state.officePhone.trim()   || undefined,
        officeEmail:        state.officeEmail.trim()   || undefined,
      }),
    })
  }

  // ── Send team invites ───────────────────────────────────────────────────────

  async function sendInvites(): Promise<{ email: string; ok: boolean; error?: string }[]> {
    const validInvites = state.invites.filter((inv) => inv.email.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inv.email.trim()))
    if (!validInvites.length) return []

    const results = await Promise.allSettled(
      validInvites.map(async (inv) => {
        const res = await fetch('/api/onboarding/invite-team', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: inv.email.trim(), role: inv.role }),
        })
        const data = await res.json() as { error?: string }
        if (!res.ok) throw new Error(data.error ?? 'Invite failed')
        return inv.email.trim()
      })
    )

    return validInvites.map((inv, i) => {
      const r = results[i]
      if (r?.status === 'fulfilled') return { email: inv.email.trim(), ok: true }
      return { email: inv.email.trim(), ok: false, error: r?.status === 'rejected' ? String(r.reason) : 'Failed' }
    })
  }

  // ── Mark onboarding complete ────────────────────────────────────────────────

  async function markComplete() {
    await fetch('/api/onboarding/wizard/complete', {
      method: 'POST',
    })
  }

  // ── Navigation ──────────────────────────────────────────────────────────────

  async function handleNext() {
    if (isDoneStep) {
      router.push('/workspace/lawyer')
      return
    }

    const err = validateStep(step)
    if (err) {
      toast.error(err)
      return
    }

    setSaving(true)
    try {
      if (step < TOTAL_STEPS - 2) {
        // Steps 0-5: save progress
        await saveStepToWizard(step)
      }

      if (step === TOTAL_STEPS - 2) {
        // Last content step (Step 6  -  Invite Team) → apply everything then go to Done
        await applyFirmSetup()

        const results = await sendInvites()
        setInviteResults(results)

        const failed = results.filter((r) => !r.ok)
        if (failed.length > 0) {
          toast.warning(`${failed.length} invite(s) could not be sent. You can retry from Settings → Team.`)
        } else if (results.length > 0) {
          toast.success(`${results.length} invitation(s) sent.`)
        }

        await markComplete()
      }

      setStep((s) => s + 1)
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSkip() {
    setSaving(true)
    try {
      // If skipping from invite step or beyond, apply all settings and mark complete
      if (step >= 5) {
        await applyFirmSetup()
        await markComplete()
        router.push('/workspace/lawyer')
        return
      }
      setStep(TOTAL_STEPS - 1) // skip to Done
      await applyFirmSetup()
      await markComplete()
    } catch {
      toast.error('Something went wrong during skip.')
    } finally {
      setSaving(false)
    }
  }

  function handleBack() {
    if (step > 0) setStep((s) => s - 1)
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const currentStepMeta = STEPS[step] ?? STEPS[0]!

  return (
    <div className="min-h-screen bg-slate-50 flex items-start justify-center py-12 px-4">
      <div className="w-full max-w-xl">
        {/* Card */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          {/* Progress bar */}
          <ProgressBar step={step} />

          {/* Card header */}
          <div className="px-6 pt-6 pb-4 flex items-center gap-3 border-b border-slate-100">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50">
              <currentStepMeta.icon className="h-5 w-5 text-indigo-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Step {step + 1} of {TOTAL_STEPS}
              </p>
              <p className="text-sm font-semibold text-slate-900 truncate">{currentStepMeta.label}</p>
            </div>

            {/* Step pills */}
            <div className="flex items-center gap-1 shrink-0">
              {STEPS.map((s, i) => (
                <div
                  key={s.index}
                  className={cn(
                    'h-1.5 rounded-full transition-all',
                    i === step ? 'w-4 bg-indigo-600' : i < step ? 'w-1.5 bg-indigo-300' : 'w-1.5 bg-slate-200'
                  )}
                />
              ))}
            </div>
          </div>

          {/* Step content */}
          <div className="px-6 py-6">
            {step === 0 && (
              <StepFirmSetup
                state={state}
                onChange={onChange}
                onLogoUpload={handleLogoUpload}
                uploading={logoUploading}
              />
            )}
            {step === 1 && <StepFirstLawyer state={state} onChange={onChange} />}
            {step === 2 && <StepMatterTypes state={state} onChange={onChange} />}
            {step === 3 && <StepBillingDefaults state={state} onChange={onChange} />}
            {step === 4 && <StepBranding state={state} onChange={onChange} firmName={state.firmName} />}
            {step === 5 && <StepInviteTeam state={state} onChange={onChange} />}
            {step === 6 && <StepDone firmName={state.firmName} />}
          </div>

          {/* Invite results (shown on done step if any failed) */}
          {isDoneStep && inviteResults.some((r) => !r.ok) && (
            <div className="px-6 pb-4">
              <div className="rounded-md border border-amber-500/20 bg-amber-950/30 px-4 py-3 text-sm text-amber-400">
                <p className="font-medium mb-1">Some invitations could not be sent:</p>
                <ul className="text-xs space-y-0.5">
                  {inviteResults.filter((r) => !r.ok).map((r) => (
                    <li key={r.email}>{r.email}  -  {r.error}</li>
                  ))}
                </ul>
                <p className="mt-2 text-xs">Retry from <strong>Settings → Team</strong>.</p>
              </div>
            </div>
          )}

          {/* Footer actions */}
          <div className="px-6 pb-6 flex items-center gap-3">
            {/* Back button */}
            {step > 0 && !isDoneStep && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleBack}
                disabled={saving}
                className="gap-1.5 text-slate-600"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </Button>
            )}

            <div className="flex-1" />

            {/* Skip button */}
            {canSkip && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleSkip}
                disabled={saving}
                className="gap-1.5 text-slate-500 hover:text-slate-700"
              >
                <SkipForward className="h-4 w-4" />
                Skip remaining
              </Button>
            )}

            {/* Next / Done button */}
            <Button
              type="button"
              onClick={handleNext}
              disabled={saving || logoUploading}
              className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {isDoneStep ? (
                <>Go to Dashboard <ChevronRight className="h-4 w-4" /></>
              ) : (
                <>Next <ChevronRight className="h-4 w-4" /></>
              )}
            </Button>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">
          You can change any of this later from <strong>Settings</strong>.
        </p>
      </div>
    </div>
  )
}
