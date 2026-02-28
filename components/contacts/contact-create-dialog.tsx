'use client'

import { useRouter } from 'next/navigation'
import { useCreateContact } from '@/lib/queries/contacts'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import { ContactForm } from '@/components/contacts/contact-form'
import type { ContactFormValues } from '@/lib/schemas/contact'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'

interface ContactCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ContactCreateDialog({ open, onOpenChange }: ContactCreateDialogProps) {
  const router = useRouter()
  const { tenant } = useTenant()
  const { appUser } = useUser()
  const createContact = useCreateContact()

  function handleSubmit(values: ContactFormValues) {
    if (!tenant) return

    createContact.mutate(
      {
        ...values,
        tenant_id: tenant.id,
        created_by: appUser?.id ?? null,
        email_primary: values.email_primary || null,
        email_secondary: values.email_secondary || null,
        website: values.website || null,
        phone_primary: values.phone_primary || null,
        phone_secondary: values.phone_secondary || null,
        first_name: values.first_name || null,
        last_name: values.last_name || null,
        middle_name: values.middle_name || null,
        preferred_name: values.preferred_name || null,
        date_of_birth: values.date_of_birth || null,
        organization_name: values.organization_name || null,
        organization_id: values.organization_id || null,
        job_title: values.job_title || null,
        address_line1: values.address_line1 || null,
        address_line2: values.address_line2 || null,
        city: values.city || null,
        province_state: values.province_state || null,
        postal_code: values.postal_code || null,
        source: values.source || null,
        source_detail: values.source_detail || null,
        notes: values.notes || null,
        phone_type_secondary: values.phone_type_secondary || null,
      },
      {
        onSuccess: (data) => {
          onOpenChange(false)
          router.push(`/contacts/${data.id}`)
        },
      }
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>Add New Contact</SheetTitle>
          <SheetDescription>
            Create a new individual or organisation contact.
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-5rem)]">
          <div className="px-6 py-4">
            <ContactForm
              mode="create"
              onSubmit={handleSubmit}
              isLoading={createContact.isPending}
            />
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
