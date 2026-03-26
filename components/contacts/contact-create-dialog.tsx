'use client'

import { useI18n } from '@/lib/i18n/i18n-provider'
import { SovereignIntakeDialog } from '@/components/contacts/sovereign-intake/sovereign-intake-dialog'

interface ContactCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ContactCreateDialog({ open, onOpenChange }: ContactCreateDialogProps) {
  const { t } = useI18n()
  return <SovereignIntakeDialog open={open} onOpenChange={onOpenChange} />
}
