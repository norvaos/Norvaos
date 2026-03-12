'use client'

/**
 * Shared helpers and types used by extracted matter tab components.
 * These were originally inline in app/(dashboard)/matters/[id]/page.tsx.
 */

import type { Database } from '@/lib/types/database'
import {
  MATTER_STATUSES,
  PRIORITIES,
  BILLING_TYPES,
  TASK_STATUSES,
  MATTER_CONTACT_ROLES,
} from '@/lib/utils/constants'
import { formatFullName } from '@/lib/utils/formatters'

// ── Types ──────────────────────────────────────────────────────────────────────

export type Matter = Database['public']['Tables']['matters']['Row']
export type MatterRow = Matter
export type MatterContact = Database['public']['Tables']['matter_contacts']['Row']
export type Contact = Database['public']['Tables']['contacts']['Row']
export type Task = Database['public']['Tables']['tasks']['Row']
export type UserRow = Database['public']['Tables']['users']['Row']
export type PracticeArea = Database['public']['Tables']['practice_areas']['Row']
export type MatterDeadlineRow = Database['public']['Tables']['matter_deadlines']['Row']
export type DeadlineTypeRow = Database['public']['Tables']['deadline_types']['Row']

// ── Helper functions ───────────────────────────────────────────────────────────

export function getStatusConfig(status: string) {
  const found = MATTER_STATUSES.find((s) => s.value === status)
  return found ?? { label: status, color: '#6b7280' }
}

export function getPriorityConfig(priority: string) {
  const found = PRIORITIES.find((p) => p.value === priority)
  return found ?? { label: priority, color: '#6b7280' }
}

export function getBillingLabel(billingType: string) {
  const found = BILLING_TYPES.find((b) => b.value === billingType)
  return found?.label ?? billingType
}

export function getTaskStatusConfig(status: string) {
  const found = TASK_STATUSES.find((s) => s.value === status)
  return found ?? { label: status, color: '#6b7280' }
}

export function getRoleLabel(role: string) {
  const found = MATTER_CONTACT_ROLES.find((r) => r.value === role)
  return found?.label ?? role
}

export function getUserName(userId: string | null, users: UserRow[] | undefined): string {
  if (!userId || !users) return '-'
  const user = users.find((u) => u.id === userId)
  if (!user) return '-'
  const name = formatFullName(user.first_name, user.last_name)
  return name || user.email
}

// ── Shared sub-components ──────────────────────────────────────────────────────

export function InfoRow({
  label,
  value,
}: {
  label: string
  value: string | null | undefined
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm text-slate-900">{value || '-'}</p>
    </div>
  )
}
