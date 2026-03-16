'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { reportError } from '@/lib/monitoring/error-reporter'

export default function LeadDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Lead detail error:', error)
    reportError(error, { route: 'leads/[id]', metadata: { digest: error.digest } })
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-7 w-7 text-destructive" />
      </div>
      <h2 className="text-lg font-semibold">Failed to load lead</h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        This lead could not be loaded. It may have been archived or you may not have access.
      </p>
      <div className="mt-6 flex gap-3">
        <Button variant="outline" asChild>
          <Link href="/leads">Back to Leads</Link>
        </Button>
        <Button onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  )
}
