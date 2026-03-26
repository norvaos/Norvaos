'use client'

import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { SovereignStepper } from './sovereign-stepper'

interface SovereignIntakeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SovereignIntakeDialog({ open, onOpenChange }: SovereignIntakeDialogProps) {
  const router = useRouter()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <span className="text-lg">New Client Intake</span>
          </DialogTitle>
          <DialogDescription>
            Search for conflicts, create a contact and lead, then complete the compliance review.
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 py-4">
          <SovereignStepper
            onComplete={(contactId, leadId) => {
              onOpenChange(false)
              if (leadId) {
                router.push(`/leads?command=${leadId}`)
              } else {
                router.push(`/contacts/${contactId}`)
              }
            }}
            onCancel={() => onOpenChange(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
