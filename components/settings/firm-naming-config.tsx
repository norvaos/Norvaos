'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Castle,
  Check,
  ChevronRight,
  Fingerprint,
  Hash,
  Loader2,
  Plus,
  Save,
  Shield,
  ShieldAlert,
  Sparkles,
  User,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/lib/hooks/use-tenant'
import { cn } from '@/lib/utils'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

// ── Token Types ──────────────────────────────────────────────────────────────

interface NamingToken {
  id: string
  label: string
  token: string
  example: string
  description: string
  required?: boolean
}

const AVAILABLE_TOKENS: NamingToken[] = [
  { id: 'prefix', label: 'Firm Prefix', token: '{PREFIX}', example: 'NRV', description: 'Your firm code (configurable below)' },
  { id: 'yyyy', label: 'Year (Full)', token: '{YYYY}', example: '2026', description: 'Four-digit year' },
  { id: 'yy', label: 'Year (Short)', token: '{YY}', example: '26', description: 'Two-digit year' },
  { id: 'mm', label: 'Month', token: '{MM}', example: '03', description: 'Zero-padded month' },
  { id: 'client_last', label: 'Client Surname', token: '{CLIENT_LAST}', example: 'WASEER', description: 'Primary client last name (uppercase)' },
  { id: 'type_code', label: 'Matter Type', token: '{TYPE_CODE}', example: 'PR', description: 'Practice area code (e.g. PR, WP, SP, FAM)' },
  { id: 'inc_num', label: 'Counter', token: '{INC_NUM}', example: '00042', description: 'Sequential number (gapless, collision-proof)', required: true },
  { id: 'random_hex', label: 'Hex Code', token: '{RANDOM_HEX}', example: 'XJ92', description: 'Random 4-char hex (high-security firms)' },
]

// ── Preset Templates ─────────────────────────────────────────────────────────

interface Preset {
  name: string
  template: string | null
  description: string
  example: string
  icon: typeof Castle
}

const PRESETS: Preset[] = [
  { name: 'The Classicist', template: '{PREFIX}{SEP}{YYYY}{SEP}{INC_NUM}', description: 'Year + Counter', example: 'NRV-2026-00042', icon: Castle },
  { name: 'The Specialist', template: '{TYPE_CODE}{SEP}{CLIENT_LAST}{SEP}{YYYY}', description: 'Type + Client + Year', example: 'PR-SMITH-2026', icon: Fingerprint },
  { name: 'The Fortress', template: '{RANDOM_HEX}{SEP}{YYYY}{SEP}{INC_NUM}', description: 'Hex + Year + Counter', example: 'XJ92-2026-00042', icon: Shield },
  { name: 'The Traditionalist', template: '{CLIENT_LAST}{SEP}{YYYY}{SEP}{INC_NUM}', description: 'Client + Year + Counter', example: 'SMITH-2026-001', icon: User },
  { name: 'Legacy (Default)', template: null, description: 'Prefix + Year + Counter', example: 'NRV-2026-00001', icon: Sparkles },
]

const SEPARATOR_OPTIONS = [
  { value: '-', label: 'Dash ( - )' },
  { value: '/', label: 'Slash ( / )' },
  { value: '.', label: 'Dot ( . )' },
]

// ── Types ────────────────────────────────────────────────────────────────────

interface NamingConfig {
  prefix: string
  separator: string
  padding: number
  includeYear: boolean
  template: string | null
  resetYearly: boolean
}

interface TenantNamingRow {
  matter_number_prefix: string | null
  matter_number_separator: string | null
  matter_number_padding: number | null
  matter_number_include_year: boolean | null
  matter_naming_template: string | null
}

// ── Pure Preview Generator ───────────────────────────────────────────────────

function generatePreview(
  template: string | null,
  prefix: string,
  separator: string,
  padding: number,
): string {
  // Legacy mode - no custom template
  if (!template) {
    const counter = '1'.padStart(padding, '0')
    return `${prefix || 'NRV'}${separator}2026${separator}${counter}`
  }

  const now = new Date()
  const yyyy = now.getFullYear().toString()
  const yy = yyyy.slice(-2)
  const mm = (now.getMonth() + 1).toString().padStart(2, '0')
  const counter = '42'.padStart(padding, '0')

  let result = template
  result = result.replace(/\{PREFIX\}/g, prefix || 'NRV')
  result = result.replace(/\{SEP\}/g, separator)
  result = result.replace(/\{YYYY\}/g, yyyy)
  result = result.replace(/\{YY\}/g, yy)
  result = result.replace(/\{MM\}/g, mm)
  result = result.replace(/\{CLIENT_LAST\}/g, 'WASEER')
  result = result.replace(/\{TYPE_CODE\}/g, 'PR')
  result = result.replace(/\{INC_NUM\}/g, counter)
  result = result.replace(/\{RANDOM_HEX\}/g, 'XJ92')

  return result
}

/** Parse a template string into an ordered list of token IDs */
function parseTemplateToTokenIds(template: string | null): string[] {
  if (!template) return []
  const tokenPattern = /\{([A-Z_]+)\}/g
  const ids: string[] = []
  let match: RegExpExecArray | null
  while ((match = tokenPattern.exec(template)) !== null) {
    const raw = match[1]
    if (raw === 'SEP') continue
    const found = AVAILABLE_TOKENS.find((t) => t.token === `{${raw}}`)
    if (found) ids.push(found.id)
  }
  return ids
}

/** Build a template string from an ordered list of token IDs */
function buildTemplateFromTokenIds(tokenIds: string[]): string | null {
  if (tokenIds.length === 0) return null
  return tokenIds
    .map((id) => {
      const token = AVAILABLE_TOKENS.find((t) => t.id === id)
      return token ? token.token : ''
    })
    .filter(Boolean)
    .join('{SEP}')
}

// ── Hooks ────────────────────────────────────────────────────────────────────

function useNamingConfig(tenantId: string | undefined) {
  const supabase = createClient()
  return useQuery<NamingConfig>({
    queryKey: ['naming-config', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select(
          'matter_number_prefix, matter_number_separator, matter_number_padding, matter_number_include_year, matter_naming_template',
        )
        .eq('id', tenantId!)
        .single()

      if (error) throw error

      const row = data as TenantNamingRow
      return {
        prefix: row.matter_number_prefix ?? 'NRV',
        separator: row.matter_number_separator ?? '-',
        padding: row.matter_number_padding ?? 5,
        includeYear: row.matter_number_include_year ?? true,
        template: row.matter_naming_template ?? null,
        resetYearly: true,
      }
    },
    enabled: !!tenantId,
    staleTime: 1000 * 60 * 5,
  })
}

function useSaveNamingConfig() {
  const queryClient = useQueryClient()
  const supabase = createClient()

  return useMutation({
    mutationFn: async ({
      tenantId,
      config,
    }: {
      tenantId: string
      config: NamingConfig
    }) => {
      const { error } = await supabase
        .from('tenants')
        .update({
          matter_number_prefix: config.prefix,
          matter_number_separator: config.separator,
          matter_number_padding: config.padding,
          matter_number_include_year: config.includeYear,
          matter_naming_template: config.template,
        })
        .eq('id', tenantId)

      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['naming-config', variables.tenantId] })
      toast.success('Naming convention saved successfully')
    },
    onError: (error: Error) => {
      toast.error(`Failed to save: ${error.message}`)
    },
  })
}

// ── Main Component ───────────────────────────────────────────────────────────

export function FirmNamingConfig() {
  const { tenant } = useTenant()
  const tenantId = tenant?.id
  const { data: savedConfig, isLoading } = useNamingConfig(tenantId)
  const saveMutation = useSaveNamingConfig()

  // ── Local State ──
  const [prefix, setPrefix] = useState('NRV')
  const [separator, setSeparator] = useState('-')
  const [padding, setPadding] = useState(5)
  const [includeYear, setIncludeYear] = useState(true)
  const [resetYearly, setResetYearly] = useState(true)
  const [activeTokenIds, setActiveTokenIds] = useState<string[]>([])
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null)
  const [isCustomMode, setIsCustomMode] = useState(false)

  // Hydrate from saved config
  useEffect(() => {
    if (!savedConfig) return
    setPrefix(savedConfig.prefix)
    setSeparator(savedConfig.separator)
    setPadding(savedConfig.padding)
    setIncludeYear(savedConfig.includeYear)
    setResetYearly(savedConfig.resetYearly)

    if (savedConfig.template) {
      const ids = parseTemplateToTokenIds(savedConfig.template)
      setActiveTokenIds(ids)

      // Check if it matches a preset
      const matchedPreset = PRESETS.find((p) => p.template === savedConfig.template)
      if (matchedPreset) {
        setSelectedPreset(matchedPreset.name)
        setIsCustomMode(false)
      } else {
        setSelectedPreset(null)
        setIsCustomMode(true)
      }
    } else {
      setSelectedPreset('Legacy (Default)')
      setActiveTokenIds([])
      setIsCustomMode(false)
    }
  }, [savedConfig])

  // ── Derived State ──
  const currentTemplate = useMemo(() => {
    if (!isCustomMode && selectedPreset) {
      const preset = PRESETS.find((p) => p.name === selectedPreset)
      return preset?.template ?? null
    }
    return buildTemplateFromTokenIds(activeTokenIds)
  }, [isCustomMode, selectedPreset, activeTokenIds])

  const preview = useMemo(
    () => generatePreview(currentTemplate, prefix, separator, padding),
    [currentTemplate, prefix, separator, padding],
  )

  const hasUniquenessGuarantor = useMemo(() => {
    if (!currentTemplate) return true // Legacy always has counter
    return currentTemplate.includes('{INC_NUM}') || currentTemplate.includes('{RANDOM_HEX}')
  }, [currentTemplate])

  const isDirty = useMemo(() => {
    if (!savedConfig) return false
    return (
      prefix !== savedConfig.prefix ||
      separator !== savedConfig.separator ||
      padding !== savedConfig.padding ||
      includeYear !== savedConfig.includeYear ||
      currentTemplate !== savedConfig.template
    )
  }, [savedConfig, prefix, separator, padding, includeYear, currentTemplate])

  // ── Handlers ──
  const handleSelectPreset = useCallback((presetName: string) => {
    const preset = PRESETS.find((p) => p.name === presetName)
    if (!preset) return
    setSelectedPreset(presetName)
    setIsCustomMode(false)
    if (preset.template) {
      setActiveTokenIds(parseTemplateToTokenIds(preset.template))
    } else {
      setActiveTokenIds([])
    }
  }, [])

  const handleAddToken = useCallback((tokenId: string) => {
    setIsCustomMode(true)
    setSelectedPreset(null)
    setActiveTokenIds((prev) => {
      if (prev.includes(tokenId)) return prev
      return [...prev, tokenId]
    })
  }, [])

  const handleRemoveToken = useCallback((tokenId: string) => {
    setActiveTokenIds((prev) => prev.filter((id) => id !== tokenId))
  }, [])

  const handleMoveToken = useCallback((fromIndex: number, direction: 'left' | 'right') => {
    setActiveTokenIds((prev) => {
      const next = [...prev]
      const toIndex = direction === 'left' ? fromIndex - 1 : fromIndex + 1
      if (toIndex < 0 || toIndex >= next.length) return prev
      ;[next[fromIndex], next[toIndex]] = [next[toIndex], next[fromIndex]]
      return next
    })
  }, [])

  const handlePrefixChange = useCallback((value: string) => {
    const sanitised = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10)
    setPrefix(sanitised)
  }, [])

  const handleSave = useCallback(() => {
    if (!tenantId) return
    saveMutation.mutate({
      tenantId,
      config: {
        prefix,
        separator,
        padding,
        includeYear,
        template: currentTemplate,
        resetYearly,
      },
    })
  }, [tenantId, prefix, separator, padding, includeYear, currentTemplate, resetYearly, saveMutation])

  // ── Loading State ──
  if (isLoading) {
    return (
      <div className="flex items-centre justify-centre py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      {/* ── Left Column: Configuration ── */}
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            Sovereign Naming Architect
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Design the naming convention for your matter numbers. Changes apply to newly created matters only.
          </p>
        </div>

        {/* ── Design Presets ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Design Presets</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {PRESETS.map((preset) => {
              const Icon = preset.icon
              const isActive = !isCustomMode && selectedPreset === preset.name
              return (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => handleSelectPreset(preset.name)}
                  className={cn(
                    'group relative flex flex-col gap-1.5 rounded-xl border p-4 text-left transition-all',
                    'hover:border-emerald-500/30 hover:bg-emerald-500/[0.03]',
                    isActive
                      ? 'border-emerald-500/40 bg-emerald-500/[0.06] ring-1 ring-emerald-500/20'
                      : 'border-border',
                  )}
                >
                  {isActive && (
                    <div className="absolute right-3 top-3">
                      <Check className="size-4 text-emerald-500" />
                    </div>
                  )}
                  <div className="flex items-centre gap-2">
                    <Icon className="size-4 text-muted-foreground group-hover:text-emerald-500" />
                    <span className="text-sm font-medium">{preset.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {preset.description}
                  </p>
                  <code className="mt-1 block text-xs font-mono text-emerald-600 dark:text-emerald-400">
                    {preset.example}
                  </code>
                </button>
              )
            })}
          </CardContent>
        </Card>

        {/* ── Build Your Own ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Build Your Own</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Available Tokens */}
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">
                Available tokens - click to add
              </Label>
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_TOKENS.map((token) => {
                  const isAdded = activeTokenIds.includes(token.id)
                  return (
                    <Tooltip key={token.id}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          disabled={isAdded && isCustomMode}
                          onClick={() => handleAddToken(token.id)}
                          className={cn(
                            'inline-flex items-centre gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all',
                            isAdded && isCustomMode
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 opacity-60 cursor-not-allowed'
                              : 'border-border hover:border-emerald-500/30 hover:bg-emerald-500/[0.05] cursor-pointer',
                          )}
                        >
                          <Plus className="size-3" />
                          {token.label}
                          {token.required && (
                            <ShieldAlert className="size-3 text-amber-500" />
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-[220px]">
                        <p className="font-mono text-xs">{token.token}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {token.description}
                        </p>
                        <p className="mt-0.5 text-xs">
                          Example: <span className="font-mono">{token.example}</span>
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  )
                })}
              </div>
            </div>

            {/* Current Template Chips */}
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">
                Current template
              </Label>
              <div
                className={cn(
                  'min-h-[52px] rounded-xl border border-dashed p-3',
                  isCustomMode && activeTokenIds.length > 0
                    ? 'border-emerald-500/30 bg-emerald-500/[0.02]'
                    : 'border-border',
                )}
              >
                {isCustomMode && activeTokenIds.length > 0 ? (
                  <div className="flex flex-wrap items-centre gap-1.5">
                    {activeTokenIds.map((tokenId, index) => {
                      const token = AVAILABLE_TOKENS.find((t) => t.id === tokenId)
                      if (!token) return null
                      return (
                        <div key={`${tokenId}-${index}`} className="flex items-centre">
                          {index > 0 && (
                            <span className="mx-1 text-xs font-mono text-muted-foreground">
                              {separator}
                            </span>
                          )}
                          <div className="group inline-flex items-centre gap-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1">
                            {index > 0 && (
                              <button
                                type="button"
                                onClick={() => handleMoveToken(index, 'left')}
                                className="text-muted-foreground hover:text-foreground transition-colours"
                                aria-label={`Move ${token.label} left`}
                              >
                                <ChevronRight className="size-3 rotate-180" />
                              </button>
                            )}
                            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                              {token.label}
                            </span>
                            {index < activeTokenIds.length - 1 && (
                              <button
                                type="button"
                                onClick={() => handleMoveToken(index, 'right')}
                                className="text-muted-foreground hover:text-foreground transition-colours"
                                aria-label={`Move ${token.label} right`}
                              >
                                <ChevronRight className="size-3" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRemoveToken(tokenId)}
                              className="ml-0.5 text-muted-foreground hover:text-destructive transition-colours"
                              aria-label={`Remove ${token.label}`}
                            >
                              <X className="size-3" />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground py-1">
                    {selectedPreset
                      ? `Using preset: ${selectedPreset}`
                      : 'Click tokens above to build a custom template'}
                  </p>
                )}
              </div>
            </div>

            {/* Uniqueness Warning */}
            {isCustomMode && activeTokenIds.length > 0 && !hasUniquenessGuarantor && (
              <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3">
                <Shield className="mt-0.5 size-4 shrink-0 text-amber-500" />
                <div>
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                    Warning: This convention may create duplicate IDs.
                  </p>
                  <p className="mt-0.5 text-xs text-amber-600/80 dark:text-amber-400/80">
                    Add a Counter or Hex Code to ensure uniqueness.
                  </p>
                </div>
              </div>
            )}

            {/* Configuration Fields */}
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Prefix */}
              <div className="space-y-2">
                <Label htmlFor="naming-prefix">Firm Prefix</Label>
                <Input
                  id="naming-prefix"
                  value={prefix}
                  onChange={(e) => handlePrefixChange(e.target.value)}
                  placeholder="NRV"
                  maxLength={10}
                  className="font-mono uppercase"
                />
                <p className="text-xs text-muted-foreground">
                  1 - 10 alphanumeric characters
                </p>
              </div>

              {/* Separator */}
              <div className="space-y-2">
                <Label htmlFor="naming-separator">Separator</Label>
                <Select value={separator} onValueChange={setSeparator}>
                  <SelectTrigger id="naming-separator">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SEPARATOR_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Padding */}
              <div className="space-y-2">
                <Label htmlFor="naming-padding">Counter Padding</Label>
                <Select
                  value={padding.toString()}
                  onValueChange={(v) => setPadding(parseInt(v, 10))}
                >
                  <SelectTrigger id="naming-padding">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[3, 4, 5, 6, 7, 8].map((n) => (
                      <SelectItem key={n} value={n.toString()}>
                        {n} digits (e.g. {'1'.padStart(n, '0')})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Reset Counter Yearly */}
              <div className="flex items-centre justify-between gap-4 rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="naming-reset" className="text-sm">
                    Reset counter yearly
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Restarts from 1 each January
                  </p>
                </div>
                <Switch
                  id="naming-reset"
                  checked={resetYearly}
                  onCheckedChange={setResetYearly}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex items-centre gap-3">
          <Button
            onClick={handleSave}
            disabled={!isDirty || saveMutation.isPending}
            className="gap-2"
          >
            {saveMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Save Convention
          </Button>
          {isDirty && (
            <span className="text-xs text-muted-foreground">
              Unsaved changes
            </span>
          )}
        </div>
      </div>

      {/* ── Right Column: Live Preview (sticky) ── */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground">
            Live Preview
          </h3>

          {/* Glassmorphism Preview Card */}
          <div
            className={cn(
              'relative overflow-hidden rounded-2xl border border-emerald-500/[0.05]',
              'bg-white/[0.04] backdrop-blur-xl',
              'dark:bg-white/[0.04] dark:border-emerald-500/[0.05]',
              'shadow-lg shadow-emerald-500/[0.03]',
            )}
          >
            {/* Decorative gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/[0.03] via-transparent to-emerald-500/[0.01] pointer-events-none" />

            <div className="relative p-6 space-y-5">
              {/* Generated Matter Number */}
              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Generated Matter Number
                </p>
                <p className="text-2xl font-bold font-mono tracking-tight text-foreground">
                  {preview}
                </p>
              </div>

              {/* Divider */}
              <div className="h-px bg-gradient-to-r from-emerald-500/10 via-emerald-500/20 to-emerald-500/10" />

              {/* Mini Matter Card */}
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <p className="text-lg font-semibold text-foreground truncate font-mono">
                      {preview}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Ahmad Waseer
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="shrink-0 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                  >
                    Active
                  </Badge>
                </div>

                <div className="flex items-centre gap-2">
                  <Hash className="size-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    Permanent Residence
                  </span>
                </div>

                {/* Template Breakdown */}
                <div className="rounded-lg bg-black/[0.03] dark:bg-white/[0.03] p-3 space-y-1.5">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Template Breakdown
                  </p>
                  {currentTemplate ? (
                    <div className="flex flex-wrap gap-1">
                      {parseTemplateToTokenIds(currentTemplate).map(
                        (tokenId, idx) => {
                          const token = AVAILABLE_TOKENS.find(
                            (t) => t.id === tokenId,
                          )
                          if (!token) return null
                          return (
                            <Badge
                              key={`${tokenId}-${idx}`}
                              variant="secondary"
                              size="xs"
                              className="font-mono"
                            >
                              {token.token}
                            </Badge>
                          )
                        },
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground font-mono">
                      {'{PREFIX}{SEP}{YYYY}{SEP}{INC_NUM}'}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Helpful context */}
          <p className="text-xs text-muted-foreground leading-relaxed">
            This preview uses sample data. Actual matter numbers are generated when a new matter is created. Existing matters are not affected.
          </p>
        </div>
      </div>
    </div>
  )
}
