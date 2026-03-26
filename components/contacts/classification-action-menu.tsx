'use client'

import { ChevronDown, Check } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { ClassificationBadge } from './classification-badge'
import { useUpdateContactClassification } from '@/lib/queries/contacts'

interface ClassificationActionMenuProps {
  contactId: string
  currentStatus: string
}

const CLASSIFICATION_GROUPS = [
  {
    label: 'Client Lifecycle',
    items: [
      { value: 'lead', label: 'Lead' },
      { value: 'client', label: 'Promote to Client' },
      { value: 'former_client', label: 'Mark as Former Client' },
    ],
  },
  {
    label: 'Legal Professionals',
    items: [
      { value: 'lawyer', label: 'Lawyer' },
      { value: 'judge', label: 'Judge' },
      { value: 'consultant', label: 'Consultant' },
    ],
  },
  {
    label: 'Government & Institutional',
    items: [
      { value: 'ircc_officer', label: 'IRCC Officer' },
      { value: 'government', label: 'Government' },
    ],
  },
  {
    label: 'Other',
    items: [
      { value: 'referral_source', label: 'Referral Source' },
      { value: 'vendor', label: 'Vendor' },
      { value: 'other_professional', label: 'Other Professional' },
    ],
  },
]

export function ClassificationActionMenu({ contactId, currentStatus }: ClassificationActionMenuProps) {
  const updateClassification = useUpdateContactClassification()

  const handleSelect = (value: string) => {
    if (value === currentStatus) return
    updateClassification.mutate({ contactId, clientStatus: value })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 h-auto py-1">
          <ClassificationBadge status={currentStatus} />
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {CLASSIFICATION_GROUPS.map((group, gi) => (
          <div key={group.label}>
            {gi > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-xs">{group.label}</DropdownMenuLabel>
            {group.items.map((item) => (
              <DropdownMenuItem
                key={item.value}
                onClick={() => handleSelect(item.value)}
                className="flex items-center justify-between"
              >
                <span>{item.label}</span>
                {currentStatus === item.value && <Check className="h-4 w-4 text-primary" />}
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
