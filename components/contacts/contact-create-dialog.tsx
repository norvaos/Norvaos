'use client'

import { SovereignContactModal } from '@/components/contacts/sovereign-contact-modal'

interface ContactCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: (contactId: string) => void
}

export function ContactCreateDialog({ open, onOpenChange, onSuccess }: ContactCreateDialogProps) {
  return <SovereignContactModal open={open} onOpenChange={onOpenChange} onSuccess={onSuccess} />
}
