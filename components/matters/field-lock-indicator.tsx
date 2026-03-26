'use client'

/**
 * FieldLockIndicator — Shows "Lawyer A is editing..." when a field is locked.
 *
 * Wraps any form field. When the field is locked by another user, it overlays
 * a semi-transparent lock indicator and disables interaction.
 *
 * Usage:
 *   <FieldLockIndicator fieldId="status" lockInfo={getFieldLock('status')}>
 *     <Select ... onFocus={() => lockField('status')} onBlur={() => unlockField('status')} />
 *   </FieldLockIndicator>
 */

import type { ReactNode } from 'react'
import { Lock, Pencil } from 'lucide-react'
import type { FieldLockInfo } from '@/lib/hooks/use-field-lock'
import { cn } from '@/lib/utils'

interface FieldLockIndicatorProps {
  fieldId: string
  lockInfo: FieldLockInfo | undefined
  children: ReactNode
  className?: string
}

export function FieldLockIndicator({
  lockInfo,
  children,
  className,
}: FieldLockIndicatorProps) {
  if (!lockInfo) {
    return <>{children}</>
  }

  return (
    <div className={cn('relative', className)}>
      {/* Render the child field but disable pointer events */}
      <div className="pointer-events-none opacity-60">{children}</div>
      {/* Lock overlay */}
      <div className="absolute inset-0 flex items-center justify-center rounded-md bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
        <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
          <Pencil className="h-3 w-3 animate-pulse" />
          <span className="font-medium">
            {lockInfo.lockedBy.displayName} is editing...
          </span>
        </div>
      </div>
    </div>
  )
}

/**
 * FieldLockBadge — Compact inline badge variant for tight layouts.
 * Shows a small lock icon + name next to a field label.
 */
export function FieldLockBadge({ lockInfo }: { lockInfo: FieldLockInfo | undefined }) {
  if (!lockInfo) return null

  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 ml-2">
      <Lock className="h-2.5 w-2.5" />
      {lockInfo.lockedBy.displayName}
    </span>
  )
}
