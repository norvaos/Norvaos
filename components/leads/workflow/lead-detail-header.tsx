'use client'

import { useRouter } from 'next/navigation'
import {
  ArrowLeft, MoreHorizontal, Pencil, XCircle, RotateCcw, ArrowRightLeft,
  ExternalLink, Trash2, Thermometer, Brain,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatFullName, formatInitials } from '@/lib/utils/formatters'
import { getStageLabel } from './lead-workflow-helpers'
import { isTerminalStage, isClosedStage, LEAD_STAGES } from '@/lib/config/lead-workflow-definitions'
import type { Lead, Contact } from './lead-workflow-types'

// ─── Temperature config ─────────────────────────────────────────────────────

const TEMP_BADGES: Record<string, { label: string; className: string }> = {
  hot: { label: 'Hot', className: 'bg-red-50 text-red-700 border-red-200' },
  warm: { label: 'Warm', className: 'bg-orange-50 text-orange-700 border-orange-200' },
  cold: { label: 'Cold', className: 'bg-blue-50 text-blue-700 border-blue-200' },
}

// ─── Component ──────────────────────────────────────────────────────────────

interface LeadDetailHeaderProps {
  lead: Lead
  contact: Contact | null | undefined
  onEdit?: () => void
  onClose?: () => void
  onReopen?: () => void
  onConvert?: () => void
  onDelete?: () => void
  onStartIntake?: () => void
}

export function LeadDetailHeader({
  lead,
  contact,
  onEdit,
  onClose,
  onReopen,
  onConvert,
  onDelete,
  onStartIntake,
}: LeadDetailHeaderProps) {
  const router = useRouter()
  const currentStage = lead.current_stage ?? ''
  const isTerminal = isTerminalStage(currentStage)
  const isClosed = isClosedStage(currentStage)
  const isConverted = currentStage === LEAD_STAGES.CONVERTED
  const tempBadge = TEMP_BADGES[lead.temperature ?? ''] ?? TEMP_BADGES.warm

  const contactName = contact
    ? formatFullName(contact.first_name, contact.last_name)
    : 'Unknown Contact'
  const contactInitials = contact
    ? formatInitials(contact.first_name, contact.last_name)
    : '?'

  // Show convert only at RETAINED_ACTIVE_MATTER
  const showConvert = currentStage === LEAD_STAGES.RETAINED_ACTIVE_MATTER

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b shrink-0">
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push('/leads')}
        className="h-8 w-8 p-0 shrink-0"
      >
        <ArrowLeft className="h-4 w-4" />
      </Button>

      {/* Contact avatar + name */}
      <Avatar size="sm">
        <AvatarFallback className="text-xs bg-primary/10 text-primary">
          {contactInitials}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h1 className="text-base font-semibold truncate">{contactName}</h1>
          <Badge variant="outline" size="xs" className={tempBadge.className}>
            {tempBadge.label}
          </Badge>
          {lead.current_stage && (
            <Badge variant="outline" size="xs">
              {getStageLabel(lead.current_stage)}
            </Badge>
          )}
        </div>
      </div>

      {/* Start Intake button (desktop) */}
      {!isTerminal && onStartIntake && (
        <Button
          variant="outline"
          size="sm"
          onClick={onStartIntake}
          className="shrink-0 hidden lg:flex border-violet-200 text-violet-700 hover:bg-violet-50"
        >
          <Brain className="mr-1.5 h-3.5 w-3.5" />
          Start Intake
        </Button>
      )}

      {/* Converted → View Matter link */}
      {isConverted && lead.converted_matter_id && (
        <Button variant="outline" size="sm" asChild className="shrink-0">
          <a href={`/matters/${lead.converted_matter_id}`}>
            <ExternalLink className="mr-1 h-3 w-3" />
            View Matter
          </a>
        </Button>
      )}

      {/* Actions dropdown */}
      {!isConverted && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {/* Active lead actions */}
            {!isTerminal && (
              <>
                {onEdit && (
                  <DropdownMenuItem onClick={onEdit}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit Lead
                  </DropdownMenuItem>
                )}
                {showConvert && onConvert && (
                  <DropdownMenuItem onClick={onConvert}>
                    <ArrowRightLeft className="mr-2 h-4 w-4" />
                    Convert to Matter
                  </DropdownMenuItem>
                )}
                {onClose && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={onClose} className="text-destructive">
                      <XCircle className="mr-2 h-4 w-4" />
                      Close Lead
                    </DropdownMenuItem>
                  </>
                )}
              </>
            )}

            {/* Closed lead actions */}
            {isClosed && onReopen && (
              <DropdownMenuItem onClick={onReopen}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Reopen Lead
              </DropdownMenuItem>
            )}

            {/* Delete (always available except converted) */}
            {onDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onDelete} className="text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Lead
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
