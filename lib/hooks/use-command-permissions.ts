'use client'

import { useMemo } from 'react'
import { useUserRole } from './use-user-role'
import { hasPermission } from '@/lib/utils/permissions'

/**
 * Command Centre-specific permission checks.
 * Provides booleans for privileged actions within the Intake Command Centre.
 */
export function useCommandPermissions() {
  const { role, isLoading } = useUserRole()

  return useMemo(
    () => ({
      /** Can convert a lead to "Retained – Active Matter" */
      canMarkRetained: hasPermission(role, 'matters', 'create'),

      /** Can apply price discounts or override fee amounts */
      canDiscountPricing: hasPermission(role, 'billing', 'edit'),

      /** Can send document request pack before full retention */
      canSendEarlyDocPack: hasPermission(role, 'documents', 'create'),

      /** Can override stage gating rules */
      canOverrideGating: hasPermission(role, 'settings', 'edit'),

      /** Can close a lead as lost */
      canCloseLost: hasPermission(role, 'leads', 'edit'),

      /** Can edit core lead data */
      canEditLead: hasPermission(role, 'leads', 'edit'),

      /** Can create tasks */
      canCreateTask: hasPermission(role, 'tasks', 'create'),

      /** Raw role for advanced checks */
      role,
      isLoading,
    }),
    [role, isLoading]
  )
}
