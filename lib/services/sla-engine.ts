import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

export type SLAClass =
  | 'CLIENT_RESPONSE'    // 120 hours
  | 'DOCUMENT_REVIEW'    // 24 hours
  | 'LAWYER_REVIEW'      // 48 hours
  | 'BILLING_CLEARANCE'  // 72 hours
  | 'FILING'             // 48 hours
  | 'IRCC_RESPONSE'      // 336 hours

export const SLA_HOURS: Record<SLAClass, number> = {
  CLIENT_RESPONSE:   120,
  DOCUMENT_REVIEW:    24,
  LAWYER_REVIEW:      48,
  BILLING_CLEARANCE:  72,
  FILING:             48,
  IRCC_RESPONSE:     336,
}

export async function startSLA(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  matterId: string,
  slaClass: SLAClass,
  contextRef?: string,
  userId?: string
): Promise<string> {
  const startedAt = new Date()
  const dueAt = new Date(startedAt.getTime() + SLA_HOURS[slaClass] * 60 * 60 * 1000)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('matter_sla_tracking')
    .insert({
      tenant_id: tenantId,
      matter_id: matterId,
      sla_class: slaClass,
      started_at: startedAt.toISOString(),
      due_at: dueAt.toISOString(),
      status: 'running',
      context_ref: contextRef ?? null,
      created_by: userId ?? null,
    })
    .select('id')
    .single()

  if (error) throw error
  return (data as { id: string }).id
}

export async function completeSLA(
  supabase: SupabaseClient<Database>,
  slaId: string
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('matter_sla_tracking')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', slaId)
}

export async function checkBreaches(
  supabase: SupabaseClient<Database>,
  tenantId: string
): Promise<{ breached: string[]; errors: string[] }> {
  const now = new Date().toISOString()
  const breached: string[] = []
  const errors: string[] = []

  // Find all running SLAs past due
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: overdue } = await (supabase as any)
    .from('matter_sla_tracking')
    .select('id, matter_id, sla_class, due_at, context_ref')
    .eq('tenant_id', tenantId)
    .eq('status', 'running')
    .lt('due_at', now)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const sla of ((overdue ?? []) as any[])) {
    try {
      // Mark as breached
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('matter_sla_tracking')
        .update({ status: 'breached', breached_at: now })
        .eq('id', sla.id)

      // Create activity alert
      await supabase.from('activities').insert({
        tenant_id: tenantId,
        matter_id: sla.matter_id,
        activity_type: 'sla_breached',
        title: `SLA Breached: ${sla.sla_class}`,
        description: `${sla.sla_class} SLA breached. Was due ${new Date(sla.due_at).toLocaleDateString()}.`,
        entity_type: 'matter',
        entity_id: sla.matter_id,
      })

      breached.push(sla.id)
    } catch (e) {
      errors.push(`${sla.id}: ${e}`)
    }
  }

  return { breached, errors }
}
