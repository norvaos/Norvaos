'use client'

import { type ReactNode } from 'react'
import { ShieldAlert } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { useUserRole } from '@/lib/hooks/use-user-role'
import { hasPermission, type Entity, type Action } from '@/lib/utils/permissions'

// ── Types ──────────────────────────────────────────────────────────────────

interface RequirePermissionProps {
  /** The entity domain to check (e.g. "billing", "settings") */
  entity: Entity
  /** The action to check (e.g. "view", "edit") */
  action: Action
  /** Content to render when permission is granted */
  children: ReactNode
  /**
   * Fallback variant:
   *   "page"   – full-page centred block with heading (for route-level gates)
   *   "inline" – compact message (for tabs / sections within a page)
   *
   * @default "page"
   */
  variant?: 'page' | 'inline'
  /**
   * Loading skeleton variant while role is being fetched:
   *   "page"   – large skeleton layout
   *   "inline" – compact skeleton
   *
   * Defaults to match `variant`.
   */
  loadingVariant?: 'page' | 'inline'
  /**
   * Custom denial message. If omitted, a default is generated from entity:action.
   */
  message?: string
}

// ── Component ──────────────────────────────────────────────────────────────

/**
 * Single-source permission gate for UI routes and sections.
 *
 * Usage:
 *   <RequirePermission entity="billing" action="view">
 *     <BillingDashboard />
 *   </RequirePermission>
 *
 *   <RequirePermission entity="settings" action="edit" variant="inline">
 *     <TemplateEditor />
 *   </RequirePermission>
 *
 * Handles three states:
 *   1. Loading – shows a skeleton
 *   2. Denied  – shows a standardised denial block ("Billing Restricted" for billing entity, "Access Restricted" for others)
 *   3. Granted – renders children
 *
 * data-testid is set to "require-permission-denied" on denial and
 * "require-permission-granted" on grant for integration testing.
 */
export function RequirePermission({
  entity,
  action,
  children,
  variant = 'page',
  loadingVariant,
  message,
}: RequirePermissionProps) {
  const { role, isLoading } = useUserRole()
  const effectiveLoadingVariant = loadingVariant ?? variant

  // ── Loading ──────────────────────────────────────────────────
  if (isLoading) {
    if (effectiveLoadingVariant === 'inline') {
      return (
        <div className="flex flex-col gap-3 py-8">
          <Skeleton className="h-6 w-40 mx-auto" />
          <Skeleton className="h-4 w-64 mx-auto" />
        </div>
      )
    }
    // page loading
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-14 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  // ── Permission check ─────────────────────────────────────────
  const allowed = hasPermission(role, entity, action)

  if (!allowed) {
    const permKey = `${entity}:${action}`
    const isBilling = entity === 'billing'
    const heading = isBilling ? 'Billing Restricted' : 'Access Restricted'
    const defaultMessage = isBilling
      ? 'You don\u2019t have permission to view billing information. Contact your administrator.'
      : `You don\u2019t have permission to ${action === 'view' ? 'view' : 'manage'} ${entity}. Contact your administrator to request the ${permKey} permission.`
    const displayMessage = message ?? defaultMessage

    if (variant === 'inline') {
      return (
        <div
          className="flex flex-col items-center justify-center gap-2 py-12 text-center"
          data-testid="require-permission-denied"
          data-permission={permKey}
        >
          <ShieldAlert className="h-8 w-8 text-muted-foreground" />
          {isBilling && <p className="text-sm font-semibold">{heading}</p>}
          <p className="text-sm text-muted-foreground max-w-md">{displayMessage}</p>
        </div>
      )
    }

    // page variant
    return (
      <div
        className="flex flex-col items-center justify-center gap-3 p-12 text-center"
        data-testid="require-permission-denied"
        data-permission={permKey}
      >
        <ShieldAlert className="h-10 w-10 text-muted-foreground" />
        <h2 className="text-lg font-semibold">{heading}</h2>
        <p className="text-sm text-muted-foreground max-w-md">{displayMessage}</p>
      </div>
    )
  }

  // ── Granted ──────────────────────────────────────────────────
  return (
    <div data-testid="require-permission-granted" data-permission={`${entity}:${action}`}>
      {children}
    </div>
  )
}
