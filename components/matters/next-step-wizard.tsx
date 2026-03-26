'use client'

import { useState } from 'react'
import { ArrowRight, FileText, Scale, Gavel, RefreshCcw, X, Loader2, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface NextStepWizardProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  matterId: string
  matterTitle: string
  refusalGrounds?: string
}

type NextAction = 'reconsideration' | 'judicial_review' | 'appeal' | 'fresh_application' | 'no_action'

interface NextStepOption {
  action: NextAction
  label: string
  description: string
  icon: React.ReactNode
  colour: string
}

const NEXT_STEP_OPTIONS: NextStepOption[] = [
  {
    action: 'reconsideration',
    label: 'Request Reconsideration',
    description: 'Ask the officer to reconsider the decision based on new evidence or arguments.',
    icon: <RefreshCcw className="h-5 w-5" />,
    colour: 'text-blue-500',
  },
  {
    action: 'judicial_review',
    label: 'Judicial Review',
    description: 'Apply to Federal Court for judicial review of the decision. Strict 15/30-day deadline.',
    icon: <Scale className="h-5 w-5" />,
    colour: 'text-red-500',
  },
  {
    action: 'appeal',
    label: 'Appeal',
    description: 'File an appeal to the Immigration Appeal Division (IAD) if eligible.',
    icon: <Gavel className="h-5 w-5" />,
    colour: 'text-orange-500',
  },
  {
    action: 'fresh_application',
    label: 'Fresh Application',
    description: 'Submit a new application addressing the grounds for refusal.',
    icon: <FileText className="h-5 w-5" />,
    colour: 'text-green-500',
  },
  {
    action: 'no_action',
    label: 'No Further Action',
    description: 'Close this matter without pursuing further remedies.',
    icon: <X className="h-5 w-5" />,
    colour: 'text-muted-foreground',
  },
]

// ── Component ──────────────────────────────────────────────────────────────────

export function NextStepWizard({
  open,
  onOpenChange,
  matterId,
  matterTitle,
  refusalGrounds,
}: NextStepWizardProps) {
  const [selectedAction, setSelectedAction] = useState<NextAction | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const router = useRouter()

  const handleSubmit = async () => {
    if (!selectedAction) return

    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/matters/${matterId}/next-step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ next_action: selectedAction }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to initiate next step')
      }

      const result = await res.json()

      if (selectedAction === 'no_action') {
        toast.success('Matter marked  -  no further action')
        onOpenChange(false)
      } else {
        const actionLabel = NEXT_STEP_OPTIONS.find((o) => o.action === selectedAction)?.label
        toast.success(`${actionLabel} initiated`, {
          description: 'A new linked matter has been created with carried-forward data.',
          action: result.newMatterId
            ? {
                label: 'View new matter',
                onClick: () => router.push(`/matters/${result.newMatterId}`),
              }
            : undefined,
        })
        onOpenChange(false)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to initiate next step')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Next Steps After Refusal</DialogTitle>
          <DialogDescription>
            Choose the next course of action for &ldquo;{matterTitle}&rdquo;. A new linked matter
            will be created with data carried forward from the canonical profile.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Refusal grounds summary */}
          {refusalGrounds && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 p-3">
              <div className="text-xs font-medium text-red-600 dark:text-red-400 uppercase tracking-wider mb-1">
                Refusal Grounds
              </div>
              <p className="text-sm text-red-700 dark:text-red-300">{refusalGrounds}</p>
            </div>
          )}

          {/* Next step options */}
          <div className="grid gap-2">
            {NEXT_STEP_OPTIONS.map((option) => (
              <button
                key={option.action}
                onClick={() => setSelectedAction(option.action)}
                className={cn(
                  'flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent',
                  selectedAction === option.action
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'border-border'
                )}
              >
                <div className={cn('mt-0.5 shrink-0', option.colour)}>
                  {option.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{option.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {option.description}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Carry-forward preview */}
          {selectedAction && selectedAction !== 'no_action' && (
            <div className="rounded-lg bg-muted/50 p-3 space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Data carried forward to new matter
              </div>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li className="flex items-center gap-2">
                  <ArrowRight className="h-3 w-3" />
                  Contact details and relationships
                </li>
                <li className="flex items-center gap-2">
                  <ArrowRight className="h-3 w-3" />
                  Canonical profile snapshot (all IRCC fields)
                </li>
                <li className="flex items-center gap-2">
                  <ArrowRight className="h-3 w-3" />
                  Responsible and originating lawyer assignments
                </li>
                <li className="flex items-center gap-2">
                  <ArrowRight className="h-3 w-3" />
                  Practice area and matter type
                </li>
              </ul>
              <Badge variant="secondary" className="mt-2">
                <ExternalLink className="h-3 w-3 mr-1" />
                New matter will be linked to this one
              </Badge>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedAction || isSubmitting}
            variant={selectedAction === 'no_action' ? 'outline' : 'default'}
          >
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {selectedAction === 'no_action' ? 'Mark No Action' : 'Create New Matter'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
