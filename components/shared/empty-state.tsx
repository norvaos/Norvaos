import { type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

// ── Norva watermark (inline SVG, no import overhead) ────────────────────────

function NorvaWatermark() {
  return (
    <svg
      width="36"
      height="36"
      viewBox="0 0 32 32"
      fill="none"
      className="absolute -top-1 -right-1 opacity-10"
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="7.5" fill="#4f46e5" />
      <rect x="6.5" y="7" width="3.5" height="18" rx="1" fill="white" />
      <polygon points="10,7 13.5,7 22,25 18.5,25" fill="white" />
      <rect x="22" y="7" width="3.5" height="18" rx="1" fill="white" />
    </svg>
  )
}

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
  /** Optional quick-start hint shown below description */
  quickHint?: string
}

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction, quickHint }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="relative mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
        <Icon className="h-7 w-7 text-muted-foreground" />
        <NorvaWatermark />
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {quickHint && (
        <p className="mt-2 max-w-xs text-xs text-indigo-600 dark:text-indigo-400">{quickHint}</p>
      )}
      {actionLabel && onAction && (
        <Button onClick={onAction} className="mt-4" size="sm">
          {actionLabel}
        </Button>
      )}
    </div>
  )
}
