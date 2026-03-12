import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database'

type AuditLog = Database['public']['Tables']['audit_logs']['Row']
type AuditLogInsert = Database['public']['Tables']['audit_logs']['Insert']

interface AuditLogListParams {
  tenantId: string
  entityType?: string
  entityId?: string
  userId?: string
  limit?: number
}

export const auditLogKeys = {
  all: ['audit_logs'] as const,
  lists: () => [...auditLogKeys.all, 'list'] as const,
  list: (params: AuditLogListParams) => [...auditLogKeys.lists(), params] as const,
  forEntity: (entityType: string, entityId: string) => [...auditLogKeys.all, 'entity', entityType, entityId] as const,
}

export function useAuditLogs(params: AuditLogListParams) {
  const { tenantId, entityType, entityId, userId, limit = 50 } = params

  return useQuery({
    queryKey: auditLogKeys.list(params),
    queryFn: async () => {
      const supabase = createClient()

      let query = supabase
        .from('audit_logs')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (entityType) query = query.eq('entity_type', entityType)
      if (entityId) query = query.eq('entity_id', entityId)
      if (userId) query = query.eq('user_id', userId)

      const { data, error } = await query
      if (error) throw error
      return data as AuditLog[]
    },
    enabled: !!tenantId,
  })
}

export function useCreateAuditLog() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (log: AuditLogInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('audit_logs')
        .insert(log)
        .select()
        .single()

      if (error) throw error
      return data as AuditLog
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: auditLogKeys.all })
    },
  })
}

/**
 * Fire-and-forget audit log insertion (client-side).
 * Call from mutation `onSuccess` handlers where React Query context is
 * not needed. Errors are logged visibly but never block the primary
 * user operation.
 */
export async function logAudit(params: {
  tenantId: string
  userId: string
  entityType: string
  entityId: string
  action: string
  changes?: Record<string, unknown>
  metadata?: Record<string, unknown>
}): Promise<void> {
  try {
    const supabase = createClient()
    await supabase.from('audit_logs').insert({
      tenant_id: params.tenantId,
      user_id: params.userId,
      entity_type: params.entityType,
      entity_id: params.entityId,
      action: params.action,
      changes: (params.changes ?? {}) as AuditLogInsert['changes'],
      metadata: (params.metadata ?? {}) as AuditLogInsert['metadata'],
    })
  } catch (error) {
    console.error('[AUDIT] Failed to write audit log:', {
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      error,
    })
  }
}

/**
 * Server-side audit log insertion.
 * Uses an existing authenticated Supabase client (from API routes).
 * Errors are logged visibly but never block the primary operation.
 */
export async function logAuditServer(params: {
  supabase: import('@supabase/supabase-js').SupabaseClient<Database>
  tenantId: string
  userId: string
  entityType: string
  entityId: string
  action: string
  changes?: Record<string, unknown>
  metadata?: Record<string, unknown>
}): Promise<void> {
  try {
    await params.supabase.from('audit_logs').insert({
      tenant_id: params.tenantId,
      user_id: params.userId,
      entity_type: params.entityType,
      entity_id: params.entityId,
      action: params.action,
      changes: (params.changes ?? {}) as AuditLogInsert['changes'],
      metadata: (params.metadata ?? {}) as AuditLogInsert['metadata'],
    })
  } catch (error) {
    console.error('[AUDIT] Server audit log failed:', {
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      error,
    })
  }
}
