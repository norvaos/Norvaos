'use client'

/**
 * QuickAccessRail (Zone 4) — Vertical icon button bar.
 *
 * Each click opens the corresponding panel in Zone 5 (right drawer).
 * Active item is highlighted.
 */

import {
  FolderOpen,
  ClipboardList,
  FileText,
  ListTodo,
  CalendarDays,
  CreditCard,
  StickyNote,
  Clock,
  Users,
  Gavel,
  SlidersHorizontal,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/lib/stores/ui-store'

// ── Rail Items ─────────────────────────────────────────────────────────────────

const RAIL_ITEMS = [
  { key: 'documents', icon: FolderOpen, label: 'Documents' },
  { key: 'questionnaire', icon: ClipboardList, label: 'Questionnaire' },
  { key: 'irccForms', icon: FileText, label: 'IRCC Forms' },
  { key: 'tasks', icon: ListTodo, label: 'Tasks' },
  { key: 'deadlines', icon: CalendarDays, label: 'Deadlines' },
  { key: 'billing', icon: CreditCard, label: 'Billing' },
  { key: 'notes', icon: StickyNote, label: 'Notes' },
  { key: 'timeline', icon: Clock, label: 'Timeline' },
  { key: 'people', icon: Users, label: 'People' },
  { key: 'postDecision', icon: Gavel, label: 'Post-Decision' },
  { key: 'customFields', icon: SlidersHorizontal, label: 'Custom Fields' },
] as const

// ── Component ──────────────────────────────────────────────────────────────────

export function QuickAccessRail() {
  const activePanel = useUIStore((s) => s.activeDrawerPanel)
  const setActivePanel = useUIStore((s) => s.setActiveDrawerPanel)

  return (
    <div className="flex flex-col items-center gap-1 py-2 w-14 shrink-0 border-r bg-card">
      {RAIL_ITEMS.map((item) => {
        const Icon = item.icon
        const isActive = activePanel === item.key

        return (
          <Tooltip key={item.key} delayDuration={300}>
            <TooltipTrigger asChild>
              <Button
                variant={isActive ? 'secondary' : 'ghost'}
                size="icon"
                className={cn(
                  'size-10 rounded-lg transition-colors',
                  isActive && 'bg-primary/10 text-primary border border-primary/20'
                )}
                onClick={() => setActivePanel(item.key as any)}
              >
                <Icon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              {item.label}
            </TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}
