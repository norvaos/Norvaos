'use client'

import { useState, useCallback } from 'react'
import {
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Search,
  User,
  Languages,
  CreditCard,
  Heart,
  Phone,
  Users,
  Plane,
  GraduationCap,
  Briefcase,
  Shield,
  Scale,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { copyToClipboard } from '@/lib/utils/copy-to-clipboard'
import type { ClipSection, ClipField } from '@/lib/services/ircc-field-clip'

// ─── Icon map ────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ElementType> = {
  user: User,
  languages: Languages,
  'credit-card': CreditCard,
  heart: Heart,
  phone: Phone,
  users: Users,
  plane: Plane,
  'graduation-cap': GraduationCap,
  briefcase: Briefcase,
  shield: Shield,
  scale: Scale,
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface FieldClipPanelProps {
  sections: ClipSection[]
}

// ─── Component ───────────────────────────────────────────────────────────────

export function FieldClipPanel({ sections }: FieldClipPanelProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const handleCopy = useCallback((field: ClipField) => {
    if (!field.filled) return
    copyToClipboard(field.value)
    setCopiedKey(field.key)
    setTimeout(() => setCopiedKey(null), 1500)
  }, [])

  // Filter sections/fields by search
  const filteredSections = searchQuery.trim()
    ? sections.map((section) => ({
        ...section,
        fields: section.fields.filter(
          (f) =>
            f.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
            f.value.toLowerCase().includes(searchQuery.toLowerCase())
        ),
      })).filter((s) => s.fields.length > 0)
    : sections

  const totalFilled = sections.reduce((acc, s) => acc + s.filledCount, 0)
  const totalFields = sections.reduce((acc, s) => acc + s.totalCount, 0)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-none px-3 py-2 border-b space-y-2">
        <div className="flex items-center justify-between">
          <Tooltip>
            <TooltipTrigger asChild>
              <h3 className="text-sm font-semibold cursor-help">Field-to-Clip</h3>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs max-w-[240px]">
              <p className="font-medium mb-0.5">Norva Submission Engine</p>
              <p>Each field is formatted exactly as the IRCC portal expects it. Hover any row and click the copy icon to grab the value instantly.</p>
            </TooltipContent>
          </Tooltip>
          <Badge variant="secondary" className="text-[10px]">
            {totalFilled}/{totalFields} filled
          </Badge>
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search fields..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-7 pl-7 text-xs"
          />
        </div>
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-y-auto">
        {filteredSections.map((section) => (
          <SectionBlock
            key={section.id}
            section={section}
            copiedKey={copiedKey}
            onCopy={handleCopy}
          />
        ))}
        {filteredSections.length === 0 && searchQuery.trim() && (
          <p className="text-xs text-muted-foreground text-center py-8">
            No fields match &ldquo;{searchQuery}&rdquo;
          </p>
        )}
        {filteredSections.length === 0 && !searchQuery.trim() && (
          <div className="flex flex-col items-center py-10 px-4 text-center">
            <Copy className="h-8 w-8 text-muted-foreground/30 mb-2" />
            <p className="text-xs font-medium">No profile data yet</p>
            <p className="text-[10px] text-muted-foreground mt-1 max-w-[240px]">
              Complete the <strong>Questionnaire</strong> tab first. Once the client profile has data, every field will appear here with a one-click copy button.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Section Block ───────────────────────────────────────────────────────────

function SectionBlock({
  section,
  copiedKey,
  onCopy,
}: {
  section: ClipSection
  copiedKey: string | null
  onCopy: (field: ClipField) => void
}) {
  const [open, setOpen] = useState(true)
  const Icon = ICON_MAP[section.icon] ?? User

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-muted/50 border-b transition-colors">
          {open ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium flex-1">{section.title}</span>
          <span className="text-[10px] text-muted-foreground">
            {section.filledCount}/{section.totalCount}
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="divide-y">
          {section.fields.map((field) => (
            <FieldRow
              key={field.key}
              field={field}
              isCopied={copiedKey === field.key}
              onCopy={onCopy}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

// ─── Field Row ───────────────────────────────────────────────────────────────

function FieldRow({
  field,
  isCopied,
  onCopy,
}: {
  field: ClipField
  isCopied: boolean
  onCopy: (field: ClipField) => void
}) {
  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 group ${
        field.filled ? 'hover:bg-muted/30' : 'opacity-40'
      }`}
    >
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-muted-foreground leading-none mb-0.5">{field.label}</p>
        <p className="text-xs truncate">
          {field.filled ? field.value : '—'}
        </p>
      </div>
      {field.filled && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => onCopy(field)}
            >
              {isCopied ? (
                <Check className="h-3 w-3 text-emerald-500" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left" className="text-xs">
            {isCopied ? 'Copied!' : 'Copy to clipboard'}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}
