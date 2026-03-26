'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Zap,
  Settings2,
  CheckCircle2,
  ChevronRight,
  Clock,
  Loader2,
  Building2,
  Layers,
  Users,
  FileText,
  Bell,
  CreditCard,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { TenantOnboardingWizardRow } from '@/lib/types/database'

// ─── What Default Setup configures ───────────────────────────────────────────

const DEFAULT_INCLUDES = [
  { icon: Layers,    label: 'One general practice area' },
  { icon: FileText,  label: 'M-YYYY-NNN matter numbering' },
  { icon: Users,     label: 'Lawyer, Paralegal, Receptionist, Billing roles' },
  { icon: Building2, label: 'Mon–Fri 9–5 working calendar' },
  { icon: Bell,      label: 'Email notifications, 7 / 3 / 1-day deadline reminders' },
  { icon: CreditCard,label: 'CAD billing, 30-day payment terms' },
]

// ─── Main page ────────────────────────────────────────────────────────────────

export default function OnboardingGatePage() {
  const router = useRouter()
  const [wizard, setWizard] = useState<TenantOnboardingWizardRow | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/onboarding/wizard')
      .then((r) => r.json())
      .then((d) => setWizard(d.wizard ?? null))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // ── Already activated ────────────────────────────────────────────────────────
  if (!loading && (wizard?.status === 'activated' || wizard?.status === 'default_applied')) {
    return <AlreadyActivated wizard={wizard} onReset={() => router.push('/settings/firm')} />
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    )
  }

  const hasProgress = (wizard?.current_step ?? 0) > 0

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Welcome to NorvaOS</h1>
        <p className="mt-2 text-sm text-slate-500 max-w-xl">
          Before you can open matters and serve clients, your workspace needs to be configured.
          Choose how you&rsquo;d like to proceed.
        </p>
      </div>

      {/* Resume banner */}
      {hasProgress && wizard?.mode === 'custom' && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-amber-800">
            <Clock className="h-4 w-4 shrink-0" />
            <span>
              You have an unfinished custom setup  -  step {(wizard.current_step ?? 0) + 1} of 15.
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="text-amber-800 border-amber-300 hover:bg-amber-100"
            onClick={() => router.push('/onboarding/wizard')}
          >
            Resume
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Choice cards */}
      <div className="grid sm:grid-cols-2 gap-5">
        {/* Default Setup */}
        <PathCard
          icon={Zap}
          iconClass="text-emerald-600 bg-emerald-50"
          title="Default Setup"
          badge="Recommended  -  ready in seconds"
          badgeClass="bg-emerald-100 text-emerald-700"
          description="Apply a safe, opinionated baseline configuration immediately. You can customise everything later from Settings."
          includes={DEFAULT_INCLUDES}
          includesLabel="Configures:"
          cta="Apply Default Setup"
          ctaVariant="default"
          ctaClass="bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={() => router.push('/onboarding/default')}
        />

        {/* Custom Setup */}
        <PathCard
          icon={Settings2}
          iconClass="text-indigo-600 bg-indigo-50"
          title="Custom Setup"
          badge="Takes 5–10 minutes"
          badgeClass="bg-indigo-100 text-indigo-700"
          description="Walk through a 15-step wizard to configure every part of your workspace exactly as your firm needs it."
          includes={[
            { icon: Building2, label: 'Firm profile & branding' },
            { icon: Layers,    label: 'Practice areas & matter numbering' },
            { icon: Users,     label: 'Roles & team permissions' },
            { icon: FileText,  label: 'Templates, custom fields & portal' },
            { icon: Bell,      label: 'Notifications & reminders' },
            { icon: CreditCard,label: 'Billing, trust & data import' },
          ]}
          includesLabel="Covers:"
          cta={hasProgress && wizard?.mode === 'custom' ? 'Resume Custom Setup' : 'Start Custom Setup'}
          ctaVariant="outline"
          ctaClass=""
          onClick={() => router.push('/onboarding/wizard')}
        />
      </div>

      <p className="text-xs text-slate-400 text-center">
        You can change any configuration at any time from <strong>Settings</strong> after setup is complete.
      </p>
    </div>
  )
}

// ─── Path Card ────────────────────────────────────────────────────────────────

function PathCard({
  icon: Icon,
  iconClass,
  title,
  badge,
  badgeClass,
  description,
  includes,
  includesLabel,
  cta,
  ctaVariant,
  ctaClass,
  onClick,
}: {
  icon: React.ElementType
  iconClass: string
  title: string
  badge: string
  badgeClass: string
  description: string
  includes: Array<{ icon: React.ElementType; label: string }>
  includesLabel: string
  cta: string
  ctaVariant: 'default' | 'outline'
  ctaClass: string
  onClick: () => void
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 flex flex-col gap-5 hover:shadow-sm transition-shadow">
      <div className="flex items-start gap-3">
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', iconClass)}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', badgeClass)}>{badge}</span>
          </div>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-slate-500 mb-2">{includesLabel}</p>
        <ul className="space-y-1.5">
          {includes.map(({ icon: ItemIcon, label }) => (
            <li key={label} className="flex items-center gap-2 text-xs text-slate-600">
              <ItemIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              {label}
            </li>
          ))}
        </ul>
      </div>

      <Button
        variant={ctaVariant}
        className={cn('mt-auto w-full', ctaClass)}
        onClick={onClick}
      >
        {cta}
        <ChevronRight className="ml-1.5 h-4 w-4" />
      </Button>
    </div>
  )
}

// ─── Already Activated ────────────────────────────────────────────────────────

function AlreadyActivated({
  wizard,
  onReset,
}: {
  wizard: TenantOnboardingWizardRow
  onReset: () => void
}) {
  const router = useRouter()
  const activatedAt = wizard.activated_at
    ? new Date(wizard.activated_at).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })
    : null
  const modeLabel = wizard.status === 'default_applied' ? 'Default Setup' : 'Custom Setup'

  return (
    <div className="max-w-lg mx-auto text-center space-y-6">
      <div className="flex justify-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 className="h-9 w-9 text-emerald-600" />
        </div>
      </div>
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Workspace already configured</h1>
        <p className="mt-2 text-sm text-slate-500">
          {modeLabel} was applied{activatedAt ? ` on ${activatedAt}` : ''}.
          Your workspace is fully set up and ready to use.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Button variant="outline" onClick={onReset}>
          Review Settings
        </Button>
        <Button onClick={() => router.push('/')}>
          Go to Dashboard
        </Button>
      </div>
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _useToast() { return toast }
