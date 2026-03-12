'use client'

/**
 * SecondaryAccessBar — Horizontal icon row that opens tab content in slide-over sheets.
 *
 * Shows up to 6 primary items as labeled buttons. Remaining items collapse
 * into a "More ▸" dropdown. Sheets preserve state across toggles by keeping
 * previously-opened components mounted in the DOM.
 */

import { useState, useCallback, useEffect, Component, type ReactNode } from 'react'
import {
  Users,
  ListTodo,
  CalendarDays,
  CreditCard,
  Flag,
  StickyNote,
  MessageSquare,
  Clock,
  Bell,
  FileText,
  ClipboardList,
  ClipboardCheck,
  MoreHorizontal,
  PenLine,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SecondaryAccessBarProps {
  /** Map of sheet key to rendered content */
  sheetContent: Record<string, ReactNode>
  /** Optional label overrides for specific sheet keys */
  labelOverrides?: Partial<Record<string, string>>
  /** Externally-controlled sheet key (e.g., opened by "Go to Field" buttons) */
  externalOpenSheet?: string | null
  /** Callback to clear external open request after handling it */
  onExternalSheetHandled?: () => void
}

// ── Sheet error boundary ───────────────────────────────────────────────────────

interface SheetErrorBoundaryState {
  hasError: boolean
  message: string
}

class SheetErrorBoundary extends Component<
  { children: ReactNode },
  SheetErrorBoundaryState
> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error: unknown) {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'An unexpected error occurred.',
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
          <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
            <span className="text-destructive text-lg font-bold">!</span>
          </div>
          <p className="text-sm font-medium text-destructive">Failed to load this panel</p>
          <p className="text-xs text-muted-foreground max-w-xs">{this.state.message}</p>
          <button
            className="text-xs underline text-muted-foreground hover:text-foreground"
            onClick={() => this.setState({ hasError: false, message: '' })}
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// ── Sheet configuration ────────────────────────────────────────────────────────
// Priority order: primary items appear as visible buttons (up to PRIMARY_LIMIT).
// The rest appear in the "More" dropdown.

const SHEET_CONFIGS = [
  { key: 'onboarding', label: 'Onboarding', icon: ClipboardCheck },
  { key: 'caseDetails', label: 'Case Details', icon: FileText },
  { key: 'irccIntake', label: 'IRCC Intake', icon: ClipboardList },
  { key: 'clientReview', label: 'Client Review', icon: PenLine },
  { key: 'tasks', label: 'Tasks', icon: ListTodo },
  { key: 'contacts', label: 'Contacts', icon: Users },
  { key: 'billing', label: 'Billing', icon: CreditCard },
  { key: 'deadlines', label: 'Deadlines', icon: CalendarDays },
  { key: 'notes', label: 'Notes', icon: StickyNote },
  { key: 'milestones', label: 'Milestones', icon: Flag },
  { key: 'discussion', label: 'Discussion', icon: MessageSquare },
  { key: 'history', label: 'History', icon: Clock },
  { key: 'notifications', label: 'Notifications', icon: Bell },
] as const

/** Maximum number of items shown as visible buttons before overflow to "More" */
const PRIMARY_LIMIT = 6

// ── Component ──────────────────────────────────────────────────────────────────

export function SecondaryAccessBar({
  sheetContent,
  labelOverrides,
  externalOpenSheet,
  onExternalSheetHandled,
}: SecondaryAccessBarProps) {
  const [activeSheet, setActiveSheet] = useState<string | null>(null)
  const [mountedSheets, setMountedSheets] = useState<Set<string>>(new Set())

  const openSheet = useCallback((key: string) => {
    setActiveSheet(key)
    setMountedSheets((prev) => {
      if (prev.has(key)) return prev
      const next = new Set(prev)
      next.add(key)
      return next
    })
  }, [])

  // Handle external open requests (e.g., "Go to Field" → open Case Details)
  useEffect(() => {
    if (externalOpenSheet && externalOpenSheet in sheetContent) {
      openSheet(externalOpenSheet)
      onExternalSheetHandled?.()
    }
  }, [externalOpenSheet, sheetContent, openSheet, onExternalSheetHandled])

  const closeSheet = useCallback(() => {
    setActiveSheet(null)
  }, [])

  // Only render configs that have content provided
  const availableConfigs = SHEET_CONFIGS.filter((c) => c.key in sheetContent).map((c) => ({
    ...c,
    resolvedLabel: labelOverrides?.[c.key] ?? c.label,
  }))

  // Split into primary (visible buttons) and secondary (More dropdown)
  const primaryConfigs = availableConfigs.slice(0, PRIMARY_LIMIT)
  const secondaryConfigs = availableConfigs.slice(PRIMARY_LIMIT)

  return (
    <>
      {/* Icon button row */}
      <div className="flex items-center gap-1 rounded-lg border bg-card px-3 py-2">
        {primaryConfigs.map((config) => (
          <Button
            key={config.key}
            variant={activeSheet === config.key ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => openSheet(config.key)}
          >
            <config.icon className="h-3.5 w-3.5" />
            {config.resolvedLabel}
          </Button>
        ))}

        {/* More overflow — only shown when there are secondary items */}
        {secondaryConfigs.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant={secondaryConfigs.some((c) => activeSheet === c.key) ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 text-xs gap-1"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
                More
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {secondaryConfigs.map((config) => (
                <DropdownMenuItem
                  key={config.key}
                  className={cn('gap-2', activeSheet === config.key && 'bg-secondary')}
                  onClick={() => openSheet(config.key)}
                >
                  <config.icon className="h-3.5 w-3.5 text-muted-foreground" />
                  {config.resolvedLabel}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Sheet panels — mounted sheets stay in DOM for state preservation */}
      {availableConfigs.map((config) =>
        mountedSheets.has(config.key) ? (
          <Sheet
            key={config.key}
            open={activeSheet === config.key}
            onOpenChange={(open) => {
              if (!open) closeSheet()
            }}
          >
            <SheetContent
              side="right"
              className="w-full sm:w-[600px] sm:max-w-none md:w-[700px] p-0 flex flex-col overflow-hidden"
            >
              <SheetHeader className="px-6 py-4 border-b shrink-0">
                <SheetTitle className="flex items-center gap-2">
                  <config.icon className="h-4 w-4" />
                  {config.resolvedLabel}
                </SheetTitle>
                <SheetDescription className="sr-only">
                  {config.resolvedLabel} panel
                </SheetDescription>
              </SheetHeader>
              <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="p-6">
                  <SheetErrorBoundary>
                    {sheetContent[config.key]}
                  </SheetErrorBoundary>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        ) : null
      )}
    </>
  )
}
