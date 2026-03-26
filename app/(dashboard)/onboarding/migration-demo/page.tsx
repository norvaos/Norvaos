'use client'

/**
 * Migration Demo Page  -  Clio-Escape Onboarding Experience (Directive 7.2)
 *
 * Standalone demo page showing the dramatic migration progress bar.
 * Access: /onboarding/migration-demo
 */

import { useState } from 'react'
import { MigrationProgressBar } from '@/components/import/migration-progress-bar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowRight, RotateCcw, Sparkles } from 'lucide-react'

export default function MigrationDemoPage() {
  const [running, setRunning] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [key, setKey] = useState(0)

  function handleStart() {
    setRunning(true)
    setCompleted(false)
    setKey((k) => k + 1)
  }

  function handleComplete() {
    setCompleted(true)
  }

  function handleReset() {
    setRunning(false)
    setCompleted(false)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-8 px-4">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          Escape from Clio
        </h1>
        <p className="text-muted-foreground text-lg">
          Watch your entire practice migrate to NorvaOS in under 60 seconds.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            Live Migration Simulator
          </CardTitle>
          <CardDescription>
            This demo simulates the Clio → NorvaOS data migration experience your
            firm will see during onboarding.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!running ? (
            <div className="flex flex-col items-center gap-4 py-8">
              <p className="text-sm text-muted-foreground text-center max-w-md">
                Click below to start the migration simulation. Real migrations
                connect directly to the Clio API and run at production speed.
              </p>
              <Button size="lg" onClick={handleStart} className="gap-2">
                Start Migration Demo
                <ArrowRight className="size-4" />
              </Button>
            </div>
          ) : (
            <>
              <MigrationProgressBar
                key={key}
                demoMode
                onComplete={handleComplete}
              />
              {completed && (
                <div className="flex justify-center pt-2">
                  <Button variant="outline" onClick={handleReset} className="gap-2">
                    <RotateCcw className="size-4" />
                    Run Again
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
