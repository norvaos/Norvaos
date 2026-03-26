'use client'

/**
 * RightDrawer (Zone 5)  -  Slide-over drawer panel.
 *
 * Renders sub-panels based on the selected Zone 4 rail item.
 * Content is lazy-loaded  -  only mounted when first opened.
 * Previously-opened panels stay mounted for state preservation.
 */

import { useState, useCallback, useEffect, Suspense, lazy, Component, type ReactNode } from 'react'
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
  X,
  Loader2,
} from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useUIStore } from '@/lib/stores/ui-store'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface RightDrawerProps {
  /** Map of panel key to rendered content */
  panelContent: Record<string, ReactNode>
}

// ── Panel Config ───────────────────────────────────────────────────────────────

const PANEL_CONFIG: Record<string, { label: string; icon: React.ElementType }> = {
  documents: { label: 'Documents', icon: FolderOpen },
  questionnaire: { label: 'Questionnaire', icon: ClipboardList },
  irccForms: { label: 'IRCC Forms', icon: FileText },
  tasks: { label: 'Tasks', icon: ListTodo },
  deadlines: { label: 'Deadlines', icon: CalendarDays },
  billing: { label: 'Billing', icon: CreditCard },
  notes: { label: 'Notes', icon: StickyNote },
  timeline: { label: 'Timeline', icon: Clock },
  people: { label: 'People', icon: Users },
  postDecision: { label: 'Post-Decision', icon: Gavel },
  customFields: { label: 'Custom Fields', icon: SlidersHorizontal },
}

// ── Error Boundary ─────────────────────────────────────────────────────────────

class DrawerErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; message: string }
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

// ── Loading Fallback ───────────────────────────────────────────────────────────

function DrawerLoading() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  )
}

// ── Component ──────────────────────────────────────────────────────────────────

export function RightDrawer({ panelContent }: RightDrawerProps) {
  const activePanel = useUIStore((s) => s.activeDrawerPanel)
  const setActivePanel = useUIStore((s) => s.setActiveDrawerPanel)
  const [mountedPanels, setMountedPanels] = useState<Set<string>>(new Set())

  // Track which panels have been opened (for lazy-loading)
  useEffect(() => {
    if (activePanel && !mountedPanels.has(activePanel)) {
      setMountedPanels((prev) => {
        const next = new Set(prev)
        next.add(activePanel)
        return next
      })
    }
  }, [activePanel, mountedPanels])

  const handleClose = useCallback(() => {
    setActivePanel(null)
  }, [setActivePanel])

  const config = activePanel ? PANEL_CONFIG[activePanel] : null
  const Icon = config?.icon ?? FolderOpen

  return (
    <Sheet open={!!activePanel} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent
        side="right"
        className="w-full sm:w-[400px] sm:max-w-none p-0 flex flex-col overflow-hidden"
      >
        {config && (
          <>
            <SheetHeader className="px-4 py-3 border-b shrink-0">
              <SheetTitle className="flex items-center gap-2 text-sm">
                <Icon className="h-4 w-4" />
                {config.label}
              </SheetTitle>
              <SheetDescription className="sr-only">
                {config.label} panel
              </SheetDescription>
            </SheetHeader>

            <ScrollArea className="flex-1 min-h-0">
              <div className="p-4">
                {/* Render all previously-mounted panels, hiding non-active ones */}
                {Array.from(mountedPanels).map((panelKey) => {
                  const content = panelContent[panelKey]
                  if (!content) return null

                  return (
                    <div
                      key={panelKey}
                      className={panelKey === activePanel ? '' : 'hidden'}
                    >
                      <DrawerErrorBoundary>
                        <Suspense fallback={<DrawerLoading />}>
                          {content}
                        </Suspense>
                      </DrawerErrorBoundary>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
