'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { reportError } from '@/lib/monitoring/error-reporter'

export default function MatterDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Matter detail error:', error)
    reportError(error, { route: 'matters/[id]', metadata: { digest: error.digest } })
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-7 w-7 text-destructive" />
      </div>
      <h2 className="text-lg font-semibold">Failed to load matter</h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        This matter could not be loaded. It may have been deleted or you may not have access.
      </p>
      <div className="mt-6 flex gap-3">
        <Button variant="outline" asChild>
          <Link href="/matters">Back to Matters</Link>
        </Button>
        <Button onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  )
}
