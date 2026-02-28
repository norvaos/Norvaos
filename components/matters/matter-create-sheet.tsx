'use client'

import { useRouter } from 'next/navigation'

import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import { useUIStore } from '@/lib/stores/ui-store'
import { useCreateMatter } from '@/lib/queries/matters'
import { createClient } from '@/lib/supabase/client'
import type { MatterFormValues } from '@/lib/schemas/matter'
import { ScrollArea } from '@/components/ui/scroll-area'

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { MatterForm } from './matter-form'

interface MatterCreateSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultContactId?: string
}

export function MatterCreateSheet({ open, onOpenChange, defaultContactId }: MatterCreateSheetProps) {
  const router = useRouter()
  const { tenant } = useTenant()
  const { appUser } = useUser()
  const activePracticeFilter = useUIStore((s) => s.activePracticeFilter)
  const createMatter = useCreateMatter()

  async function handleSubmit(values: MatterFormValues) {
    if (!tenant || !appUser) return

    const { contact_id, additional_contacts, ...matterValues } = values

    const result = await createMatter.mutateAsync({
      tenant_id: tenant.id,
      title: matterValues.title,
      description: matterValues.description || null,
      practice_area_id: matterValues.practice_area_id || null,
      pipeline_id: matterValues.pipeline_id || null,
      stage_id: matterValues.stage_id || null,
      responsible_lawyer_id: matterValues.responsible_lawyer_id || null,
      originating_lawyer_id: matterValues.originating_lawyer_id || null,
      billing_type: matterValues.billing_type,
      hourly_rate: matterValues.hourly_rate ?? null,
      estimated_value: matterValues.estimated_value ?? null,
      priority: matterValues.priority,
      status: matterValues.status,
      visibility: matterValues.visibility || 'all',
      statute_of_limitations: matterValues.statute_of_limitations || null,
      next_deadline: matterValues.next_deadline || null,
      created_by: appUser.id,
    })

    // Link contacts to matter
    const supabase = createClient()
    const contactInserts: Array<{
      tenant_id: string
      matter_id: string
      contact_id: string
      role: string
      is_primary: boolean
    }> = []

    // Primary contact
    if (contact_id) {
      contactInserts.push({
        tenant_id: tenant.id,
        matter_id: result.id,
        contact_id: contact_id,
        role: 'client',
        is_primary: true,
      })
    }

    // Additional contacts
    if (additional_contacts && additional_contacts.length > 0) {
      for (const ac of additional_contacts) {
        contactInserts.push({
          tenant_id: tenant.id,
          matter_id: result.id,
          contact_id: ac.contact_id,
          role: ac.role,
          is_primary: false,
        })
      }
    }

    if (contactInserts.length > 0) {
      await supabase.from('matter_contacts').insert(contactInserts)
    }

    onOpenChange(false)
    router.push(`/matters/${result.id}`)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>New Matter</SheetTitle>
          <SheetDescription>
            Create a new matter. Fields marked with * are required.
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-1 overflow-y-auto px-4 pb-4">
          <MatterForm
            mode="create"
            defaultValues={{
              ...(activePracticeFilter !== 'all' ? { practice_area_id: activePracticeFilter } : {}),
              ...(defaultContactId ? { contact_id: defaultContactId } : {}),
            }}
            onSubmit={handleSubmit}
            isLoading={createMatter.isPending}
          />
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
