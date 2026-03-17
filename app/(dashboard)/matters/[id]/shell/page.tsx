'use client'

/**
 * /matters/[id]/shell
 *
 * Full-screen WorkplaceShell (5-zone layout) for a single matter.
 * Fetches the matter row and tenant context, then mounts the shell.
 *
 * This is the new spec-aligned shell (Section 3) that replaces the legacy
 * IRCC-specific WorkspaceShell over time. Both can coexist during migration.
 */

import { useParams, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { Loader2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { WorkplaceShell } from '@/components/shell/WorkplaceShell'
import { useMatter } from '@/lib/queries/matters'
import { useTenant } from '@/lib/hooks/use-tenant'

export default function MatterShellPage() {
  const params   = useParams()
  const router   = useRouter()
  const matterId = params.id as string

  const { tenant, isLoading: tenantLoading } = useTenant()
  const tenantId = tenant?.id ?? ''

  const {
    data: matter,
    isLoading: matterLoading,
    error: matterError,
  } = useMatter(matterId)

  // Bounce to matters list if matter is not found after loading completes
  useEffect(() => {
    if (!matterLoading && !matter && !matterError) {
      router.replace('/matters')
    }
  }, [matterLoading, matter, matterError, router])

  // ── Loading ──────────────────────────────────────────────────────────────
  if (tenantLoading || matterLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (matterError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center p-8">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <div className="space-y-1">
          <p className="text-sm font-medium">Unable to load matter</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            {(matterError as Error).message ?? 'An unexpected error occurred.'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => router.back()}>
          Go back
        </Button>
      </div>
    )
  }

  // ── Not found guard ──────────────────────────────────────────────────────
  if (!matter) return null

  // ── Shell ────────────────────────────────────────────────────────────────
  return (
    <div className="h-full overflow-hidden">
      <WorkplaceShell matter={matter} tenantId={tenantId} />
    </div>
  )
}
