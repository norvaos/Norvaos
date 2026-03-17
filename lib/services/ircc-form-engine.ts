import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

export interface FormInstanceStatus {
  templateId: string
  formId: string
  formCode: string
  formName: string
  personId: string | null
  personRole: string | null
  status: 'not_started' | 'in_progress' | 'complete' | 'submitted'
  sortOrder: number
  isRequired: boolean
}

export async function getFormInstanceStatuses(
  supabase: SupabaseClient<Database>,
  matterId: string
): Promise<FormInstanceStatus[]> {
  // Fetch from matter_form_instances (cast as any — table not yet in DB type)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('matter_form_instances')
    .select('*')
    .eq('matter_id', matterId)
    .eq('is_active', true)
    .order('sort_order')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => ({
    templateId: row.assignment_template_id,
    formId: row.form_id,
    formCode: row.form_code,
    formName: row.form_name,
    personId: row.person_id,
    personRole: row.person_role,
    status: row.status ?? 'not_started',
    sortOrder: row.sort_order ?? 0,
    isRequired: row.is_required ?? true,
  }))
}
