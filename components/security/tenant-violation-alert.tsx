'use client'

import { ShieldAlert } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface TenantViolationAlertProps {
  /** Error message from the server */
  message: string
  /** Optional: which resource was being accessed */
  resource?: string
  /** Called when user clicks "Return to Dashboard" */
  onDismiss: () => void
}

/**
 * Hard 403 Tenant Violation Alert
 *
 * Team SENTINEL requirement: when cross-tenant access is attempted,
 * display a clear, non-dismissable alert. The user must navigate away.
 * This replaces the old behaviour of showing empty result sets.
 */
export function TenantViolationAlert({
  message,
  resource,
  onDismiss,
}: TenantViolationAlertProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <Card className="mx-4 max-w-lg border-destructive/50 shadow-2xl">
        <CardHeader className="space-y-1 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
              <ShieldAlert className="h-5 w-5 text-destructive" />
            </div>
            <CardTitle className="text-lg text-destructive">
              Access Denied  -  Error 403
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {message || 'You do not have permission to access this resource. This incident has been logged.'}
          </p>

          {resource && (
            <div className="rounded-md bg-muted/50 px-3 py-2">
              <p className="text-xs text-muted-foreground">
                Resource: <span className="font-mono">{resource}</span>
              </p>
            </div>
          )}

          <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2">
            <p className="text-xs text-destructive/80">
              This access attempt has been recorded in the security audit log.
              If you believe this is an error, contact your system administrator.
            </p>
          </div>

          <Button
            onClick={onDismiss}
            className="w-full"
            variant="destructive"
          >
            Return to Dashboard
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * Utility to detect if a fetch response is a SENTINEL tenant violation.
 * Use in TanStack Query error handlers.
 */
export function isTenantViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const err = error as { status?: number; code?: string; message?: string }
  return (
    err.status === 403 ||
    err.code === 'SENTINEL_TENANT_VIOLATION' ||
    (typeof err.message === 'string' && err.message.includes('SENTINEL-403'))
  )
}
