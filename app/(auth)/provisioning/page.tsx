'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Scale, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

const STEPS = [
  'Setting up your practice areas',
  'Configuring matter pipelines & stages',
  'Loading legal automation rules',
  'Preparing trust ledger templates',
  'Finalising your workspace',
]

export default function ProvisioningPage() {
  const router = useRouter()
  const [activeStep, setActiveStep] = useState(0)
  const [complete, setComplete] = useState(false)

  useEffect(() => {
    // Animate through steps over ~4 seconds
    const stepInterval = setInterval(() => {
      setActiveStep((prev) => {
        if (prev >= STEPS.length - 1) {
          clearInterval(stepInterval)
          return prev
        }
        return prev + 1
      })
    }, 800)

    // After 4.5 seconds, mark complete and redirect
    const completeTimer = setTimeout(() => {
      setComplete(true)
    }, STEPS.length * 800 + 200)

    const redirectTimer = setTimeout(() => {
      router.replace('/')
    }, STEPS.length * 800 + 1200)

    return () => {
      clearInterval(stepInterval)
      clearTimeout(completeTimer)
      clearTimeout(redirectTimer)
    }
  }, [router])

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md text-center">
        {/* Logo */}
        <div className="mb-8">
          <Scale className="mx-auto size-12 text-primary animate-pulse" />
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">
            NorvaOS
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {complete
              ? 'Your firm is ready.'
              : 'Configuring your firm...'}
          </p>
        </div>

        {/* Progress steps */}
        <div className="mx-auto max-w-xs space-y-3 text-left">
          {STEPS.map((step, i) => (
            <div
              key={step}
              className={cn(
                'flex items-center gap-3 rounded-lg border px-4 py-3 text-sm transition-all duration-500',
                i < activeStep
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : i === activeStep
                    ? 'border-primary/30 bg-primary/5 text-foreground font-medium'
                    : 'border-transparent bg-transparent text-muted-foreground/40'
              )}
            >
              {i < activeStep ? (
                <Check className="size-4 shrink-0 text-emerald-500" />
              ) : i === activeStep ? (
                <div className="size-4 shrink-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              ) : (
                <div className="size-4 shrink-0 rounded-full border border-muted-foreground/20" />
              )}
              <span>{step}</span>
            </div>
          ))}
        </div>

        {/* Complete state */}
        {complete && (
          <p className="mt-6 text-sm text-emerald-600 font-medium animate-in fade-in">
            Redirecting to your dashboard...
          </p>
        )}
      </div>
    </div>
  )
}
