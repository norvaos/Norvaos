'use client'

/**
 * WorkspaceHeader  -  Sticky top identity bar.
 *
 * Always visible. Shows UCI, Application Number, Stream, responsible lawyer.
 * Copy actions for UCI and App# without leaving the page.
 * Back link returns to the main matter detail.
 */

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Copy, Check, Hash, User2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { Database } from '@/lib/types/database'
import type { MatterPersonProfile } from '@/lib/queries/matter-profiles'

type Matter = Database['public']['Tables']['matters']['Row']
type MatterImmigration = Database['public']['Tables']['matter_immigration']['Row']

// ── Stream colour mapping ─────────────────────────────────────────────────────

function getStreamColour(matterType: string | null): string {
  if (!matterType) return 'bg-muted text-muted-foreground'
  const t = matterType.toLowerCase()
  if (t.includes('study') || t.includes('student')) return 'bg-blue-950/40 text-blue-400 border-blue-500/20'
  if (t.includes('express entry') || t.includes('permanent') || t.includes('pr ')) return 'bg-emerald-950/40 text-emerald-400 border-emerald-500/20'
  if (t.includes('visitor') || t.includes('trv') || t.includes('tourist')) return 'bg-yellow-950/30 text-yellow-400 border-yellow-500/20'
  if (t.includes('work') || t.includes('pgwp') || t.includes('lmia')) return 'bg-teal-100 text-teal-800 border-teal-200'
  if (t.includes('spousal') || t.includes('family')) return 'bg-purple-950/30 text-purple-400 border-purple-500/20'
  if (t.includes('citizenship')) return 'bg-orange-950/30 text-orange-400 border-orange-500/20'
  return 'bg-muted text-muted-foreground'
}

// ── Copy button ───────────────────────────────────────────────────────────────

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <TooltipProvider>
      <Tooltip delayDuration={400}>
        <TooltipTrigger asChild>
          <button
            onClick={handleCopy}
            className="ml-1 inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
            aria-label={`Copy ${label}`}
          >
            {copied
              ? <Check className="h-3 w-3 text-green-600" />
              : <Copy className="h-3 w-3" />
            }
          </button>
        </TooltipTrigger>
        <TooltipContent>{copied ? 'Copied!' : `Copy ${label}`}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// ── Identity cell ─────────────────────────────────────────────────────────────

function IdentityCell({
  icon: Icon,
  label,
  value,
  copyable = false,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | null | undefined
  copyable?: boolean
}) {
  const display = value ?? ' - '
  const hasValue = !!value

  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70 leading-none">
        {label}
      </span>
      <div className="flex items-center gap-0.5">
        <Icon className="h-3 w-3 text-muted-foreground shrink-0" />
        <span
          className={cn(
            'text-sm font-mono leading-none truncate',
            hasValue ? 'text-foreground font-semibold' : 'text-muted-foreground italic'
          )}
        >
          {display}
        </span>
        {hasValue && copyable && <CopyButton value={display} label={label} />}
      </div>
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface WorkspaceHeaderProps {
  matter: Matter
  matterId: string
  immigrationData: MatterImmigration | null
  principalApplicant: MatterPersonProfile | null
}

// ── Component ─────────────────────────────────────────────────────────────────

export function WorkspaceHeader({ matter, matterId, immigrationData, principalApplicant }: WorkspaceHeaderProps) {
  const [copiedBoth, setCopiedBoth] = useState(false)

  const handleCopyBoth = async () => {
    const parts = [
      immigrationData?.uci_number ? `UCI: ${immigrationData.uci_number}` : null,
      immigrationData?.application_number ? `App #: ${immigrationData.application_number}` : null,
    ].filter(Boolean)
    if (parts.length === 0) return
    await navigator.clipboard.writeText(parts.join('\n'))
    setCopiedBoth(true)
    setTimeout(() => setCopiedBoth(false), 1500)
  }

  const clientName = principalApplicant
    ? [principalApplicant.first_name, principalApplicant.last_name].filter(Boolean).join(' ')
    : matter.title

  const streamColour = getStreamColour(matter.matter_type)

  return (
    <div className="flex items-center gap-4 px-4 py-2.5 border-b bg-card shrink-0 min-h-[52px]">

      {/* Back to matter */}
      <Link
        href={`/matters/${matterId}`}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
      >
        <ArrowLeft className="h-4 w-4" />
        <span className="hidden sm:inline">Matter</span>
      </Link>

      <div className="w-px h-6 bg-border shrink-0" />

      {/* Client name */}
      <div className="flex flex-col gap-0.5 min-w-0 shrink-0 max-w-[200px]">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70 leading-none">Client</span>
        <span className="text-sm font-semibold leading-none truncate">{clientName}</span>
      </div>

      <div className="w-px h-6 bg-border shrink-0" />

      {/* UCI */}
      <IdentityCell
        icon={Hash}
        label="UCI"
        value={immigrationData?.uci_number}
        copyable
      />

      <div className="w-px h-6 bg-border shrink-0" />

      {/* Application Number */}
      <IdentityCell
        icon={Hash}
        label="Application #"
        value={immigrationData?.application_number}
        copyable
      />

      {/* Copy both */}
      {(immigrationData?.uci_number || immigrationData?.application_number) && (
        <TooltipProvider>
          <Tooltip delayDuration={400}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={handleCopyBoth}
              >
                {copiedBoth
                  ? <Check className="h-3.5 w-3.5 text-green-600" />
                  : <Copy className="h-3.5 w-3.5" />
                }
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy UCI + App #</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      <div className="w-px h-6 bg-border shrink-0" />

      {/* Stream badge */}
      <div className="flex flex-col gap-0.5 shrink-0">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70 leading-none">Stream</span>
        <Badge
          variant="outline"
          className={cn('text-xs font-medium px-2 py-0 leading-5 border', streamColour)}
        >
          {matter.matter_type ?? 'Unassigned'}
        </Badge>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Status badge */}
      <Badge
        variant="outline"
        className={cn(
          'text-xs shrink-0',
          matter.status === 'active' ? 'border-green-300 text-emerald-400 bg-emerald-950/30' :
          matter.status?.startsWith('closed') ? 'border-zinc-300 text-zinc-600 bg-zinc-50' :
          'border-amber-300 text-amber-400 bg-amber-950/30'
        )}
      >
        {matter.status ?? 'Unknown'}
      </Badge>

      {/* Filing Workspace label */}
      <div className="flex items-center gap-1.5 shrink-0 pl-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
          IRCC Filing Workspace
        </span>
      </div>
    </div>
  )
}
