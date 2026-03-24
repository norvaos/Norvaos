'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'

interface DeferredDateDialogProps {
  open: boolean
  onConfirm: (date: Date) => void
  onCancel: () => void
}

export function DeferredDateDialog({
  open,
  onConfirm,
  onCancel,
}: DeferredDateDialogProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined)

  const handleConfirm = () => {
    if (selectedDate) {
      onConfirm(selectedDate)
      setSelectedDate(undefined)
    }
  }

  const handleCancel = () => {
    setSelectedDate(undefined)
    onCancel()
  }

  // Disable dates in the past (allow today onward)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleCancel() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Set Reactivation Date</DialogTitle>
          <DialogDescription>
            When should this lead be moved back to New Inquiry?
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-center py-4">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            disabled={{ before: today }}
            initialFocus
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedDate}>
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
