'use client'

import { useRouter } from 'next/navigation'
import { useCreateLead } from '@/lib/queries/leads'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import { useUIStore } from '@/lib/stores/ui-store'
import { useI18n } from '@/lib/i18n/i18n-provider'
import type { LeadFormValues } from '@/lib/schemas/lead'
import type { Database, Json } from '@/lib/types/database'

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { LeadForm } from './lead-form'

type PipelineStage = Database['public']['Tables']['pipeline_stages']['Row']

interface LeadCreateSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pipelineId: string
  stageId: string
  stages: PipelineStage[]
}

export function LeadCreateSheet({
  open,
  onOpenChange,
  pipelineId,
  stageId,
}: LeadCreateSheetProps) {
  const router = useRouter()
  const { t } = useI18n()
  const { tenant } = useTenant()
  const { appUser } = useUser()
  const activePracticeFilter = useUIStore((s) => s.activePracticeFilter)
  const createLead = useCreateLead()

  function handleSubmit(values: LeadFormValues) {
    if (!tenant) return

    // Build custom_fields with preferred_language if provided
    const customFields: Record<string, unknown> = {}
    if (values.preferred_language) {
      customFields.preferred_language = values.preferred_language
    }

    // Store email in custom_fields for data integrity
    if (values.email) {
      customFields.email = values.email
    }

    createLead.mutate(
      {
        tenant_id: tenant.id,
        contact_id: values.contact_id,
        pipeline_id: values.pipeline_id,
        stage_id: values.stage_id,
        temperature: values.temperature,
        source: values.source || null,
        source_detail: values.source_detail || null,
        practice_area_id: values.practice_area_id || null,
        estimated_value: values.estimated_value ?? null,
        assigned_to: values.assigned_to || null,
        notes: values.notes || null,
        next_follow_up: values.next_follow_up || null,
        created_by: appUser?.id ?? null,
        ...(Object.keys(customFields).length > 0 ? { custom_fields: customFields as unknown as Json } : {}),
      },
      {
        onSuccess: (lead) => {
          onOpenChange(false)
          if (lead?.id) {
            router.push(`/studio/workspace/${lead.id}?splash=1`)
          }
        },
      }
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 bg-background border-l border-border">
        <SheetHeader className="border-b border-border px-6 py-4">
          <SheetTitle className="text-emerald-600 dark:text-emerald-400 font-sans font-bold uppercase tracking-tight">{t('form.add_new_lead' as any)}</SheetTitle>
          <SheetDescription className="text-muted-foreground font-sans text-xs">
            {t('form.add_new_lead_desc' as any)}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-10rem)]">
          <div className="px-6 py-4">
            <LeadForm
              mode="create"
              fixedPipelineId={pipelineId}
              fixedStageId={stageId}
              defaultValues={
                activePracticeFilter !== 'all'
                  ? { practice_area_id: activePracticeFilter }
                  : undefined
              }
              onSubmit={handleSubmit}
              isLoading={createLead.isPending}
            />
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
