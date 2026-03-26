'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckCircle2,
  Loader2,
  XCircle,
  ArrowRight,
  Layers,
  Hash,
  Shield,
  CalendarDays,
  Bell,
  CreditCard,
  RefreshCw,
  Workflow,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ─── What will be applied ─────────────────────────────────────────────────────

const APPLYING_STEPS = [
  { key: 'practice_areas',  label: 'Setting up Immigration practice area',              icon: Layers       },
  { key: 'matter_types',    label: 'Creating Immigration matter type, pipeline & stages', icon: Workflow   },
  { key: 'deadline_types',  label: 'Seeding standard deadline types',                  icon: Bell         },
  { key: 'matter_numbering',label: 'Configuring matter numbering (M-YYYY-NNN)',         icon: Hash         },
  { key: 'roles',           label: 'Seeding standard roles',                            icon: Shield       },
  { key: 'calendar',        label: 'Setting calendar defaults (Mon–Fri 9–5)',           icon: CalendarDays },
  { key: 'notifications',   label: 'Configuring deadline reminders',                   icon: Bell         },
  { key: 'billing',         label: 'Enabling billing (CAD, 30-day terms)',              icon: CreditCard   },
]

type StepStatus = 'waiting' | 'applying' | 'done' | 'error'

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DefaultSetupPage() {
  const router = useRouter()
  const [phase, setPhase]   = useState<'confirm' | 'applying' | 'done' | 'error'>('confirm')
  const [stepStatus, setStepStatus] = useState<Record<string, StepStatus>>(
    Object.fromEntries(APPLYING_STEPS.map((s) => [s.key, 'waiting']))
  )
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const runDefaultSetup = async () => {
    setPhase('applying')

    // Animate steps one by one while the API call runs in parallel
    const animateSteps = async () => {
      for (const step of APPLYING_STEPS) {
        setStepStatus((prev) => ({ ...prev, [step.key]: 'applying' }))
        await new Promise((r) => setTimeout(r, 400))
      }
    }

    const [apiResult] = await Promise.allSettled([
      fetch('/api/onboarding/wizard/default', { method: 'POST' }).then((r) => r.json()),
      animateSteps(),
    ])

    if (apiResult.status === 'rejected') {
      setPhase('error')
      setErrorMsg('Network error  -  please check your connection and try again.')
      return
    }

    const body = apiResult.value as { success: boolean; errors?: string[]; error?: string; status?: string; skipped?: boolean }

    if (body.skipped) {
      // Already applied
      setStepStatus(Object.fromEntries(APPLYING_STEPS.map((s) => [s.key, 'done'])))
      setPhase('done')
      return
    }

    if (!body.success && body.error) {
      setPhase('error')
      setErrorMsg(body.error)
      return
    }

    // Mark all steps done (or error if specific ones failed)
    const failed = new Set(body.errors ?? [])
    setStepStatus(
      Object.fromEntries(
        APPLYING_STEPS.map((s) => {
          const failed_map: Record<string, string> = {
            practice_areas:  'practice_areas',
            matter_types:    'matter_types',
            deadline_types:  'deadline_types',
            matter_numbering:'matter_numbering',
            roles:           'roles',
            calendar:        'tenant_settings_batch',
            notifications:   'tenant_settings_batch',
            billing:         'tenant_settings_batch',
          }
          return [s.key, failed.has(failed_map[s.key] ?? '') ? 'error' : 'done']
        })
      )
    )

    if (body.success) {
      setPhase('done')
    } else {
      setPhase('error')
      setErrorMsg(`Some steps could not be applied: ${body.errors?.join(', ')}. You can retry or proceed and configure these from Settings.`)
    }
  }

  if (phase === 'confirm') {
    return (
      <div className="max-w-lg mx-auto space-y-8">
        <div>
          <button
            className="text-xs text-slate-400 hover:text-slate-600"
            onClick={() => router.push('/onboarding')}
          >
            ← Setup
          </button>
          <h1 className="mt-2 text-xl font-bold text-slate-900">Apply Default Setup</h1>
          <p className="mt-2 text-sm text-slate-500">
            This will immediately apply a baseline configuration to your workspace.
            You will be able to customise everything from <strong>Settings</strong> at any time.
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
          {APPLYING_STEPS.map(({ key, label, icon: Icon }) => (
            <div key={key} className="flex items-center gap-3 px-4 py-3">
              <Icon className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="text-sm text-slate-700">{label}</span>
            </div>
          ))}
        </div>

        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-800">
            <strong>Note:</strong> Default Setup takes a few seconds. Do not close this tab while it runs.
          </p>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={() => router.push('/onboarding')}>
            Choose a different option
          </Button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={runDefaultSetup}
          >
            Apply Default Setup
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    )
  }

  if (phase === 'applying') {
    return (
      <div className="max-w-lg mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Applying default configuration…</h1>
          <p className="mt-1 text-sm text-slate-500">Please wait. This usually takes a few seconds.</p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
          {APPLYING_STEPS.map(({ key, label, icon: Icon }) => {
            const status = stepStatus[key]
            return (
              <div key={key} className="flex items-center gap-3 px-4 py-3">
                <div className="shrink-0">
                  {status === 'done'     && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                  {status === 'applying' && <Loader2     className="h-4 w-4 text-indigo-500 animate-spin" />}
                  {status === 'waiting'  && <Icon        className="h-4 w-4 text-slate-300" />}
                  {status === 'error'    && <XCircle     className="h-4 w-4 text-destructive" />}
                </div>
                <span className={cn('text-sm', status === 'done' ? 'text-slate-900' : status === 'applying' ? 'text-indigo-700 font-medium' : 'text-slate-400')}>
                  {label}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  if (phase === 'done') {
    return (
      <div className="max-w-lg mx-auto text-center space-y-6">
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle2 className="h-9 w-9 text-emerald-600" />
          </div>
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Workspace ready!</h1>
          <p className="mt-2 text-sm text-slate-500">
            Default configuration has been applied. Your workspace is ready to use.
            You can customise any setting from the <strong>Settings</strong> menu.
          </p>
        </div>

        <div className="rounded-lg border border-emerald-200 bg-emerald-50 divide-y divide-emerald-100">
          {APPLYING_STEPS.map(({ key, label, icon: Icon }) => (
            <div key={key} className="flex items-center gap-3 px-4 py-3">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
              <span className="text-sm text-emerald-800">{label}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button variant="outline" onClick={() => router.push('/settings/firm')}>
            Review Settings
          </Button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={() => router.push('/')}
          >
            Go to Dashboard
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    )
  }

  // Error state
  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Setup encountered an issue</h1>
        <p className="mt-1 text-sm text-slate-500">Some steps could not be applied automatically.</p>
      </div>

      {errorMsg && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3">
          <p className="text-sm text-destructive">{errorMsg}</p>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
        {APPLYING_STEPS.map(({ key, label, icon: Icon }) => {
          const status = stepStatus[key]
          return (
            <div key={key} className="flex items-center gap-3 px-4 py-3">
              <div className="shrink-0">
                {status === 'done'  && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                {status === 'error' && <XCircle      className="h-4 w-4 text-destructive" />}
                {(status === 'waiting' || status === 'applying') && <Icon className="h-4 w-4 text-slate-300" />}
              </div>
              <span className={cn('text-sm', status === 'done' ? 'text-slate-900' : status === 'error' ? 'text-destructive' : 'text-slate-400')}>
                {label}
              </span>
            </div>
          )
        })}
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={() => router.push('/')}>
          Skip  -  configure manually
        </Button>
        <Button onClick={runDefaultSetup}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </div>
    </div>
  )
}
