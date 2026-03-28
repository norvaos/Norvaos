'use client'

/**
 * ADR-9  -  Debug Inspector Panels
 *
 * Five embedded inspection panels for staff-only debugging of the IRCC Forms Engine.
 * Provides deep visibility into condition evaluation, precedence resolution,
 * cross-form propagation, completion state, and raw answer data.
 */

import { useState, useMemo, useCallback } from 'react'
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Bug,
  Search,
  Copy,
  Lock,
  Check,
  X,
  ChevronDown,
} from 'lucide-react'

import type { FieldCondition, ConditionEvalResult, RuleEvalResult } from '@/lib/ircc/types/conditions'
import type {
  AnswerMap,
  AnswerRecord,
  CompletionState,
  SectionCompletionState,
  ResolvedValue,
  PropagationMode,
} from '@/lib/ircc/types/answers'
import { PrecedenceLevel } from '@/lib/ircc/types/answers'
import { evaluateConditionWithTrace } from '@/lib/ircc/condition-engine'

// ---------------------------------------------------------------------------
// Precedence level labels
// ---------------------------------------------------------------------------

const PRECEDENCE_LABELS: Record<number, string> = {
  [PrecedenceLevel.VERIFIED_MATTER_OVERRIDE]: 'L1  -  Verified Matter Override',
  [PrecedenceLevel.CURRENT_MATTER_ANSWER]: 'L2  -  Current Matter Answer',
  [PrecedenceLevel.CROSS_FORM_REUSE]: 'L3  -  Cross-Form Reuse',
  [PrecedenceLevel.VERIFIED_CANONICAL]: 'L4  -  Verified Canonical',
  [PrecedenceLevel.UNVERIFIED_CANONICAL]: 'L5  -  Unverified Canonical',
  [PrecedenceLevel.CONTACT_FALLBACK]: 'L6  -  Contact Fallback',
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function formatValue(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value === 'string') return `"${value}"`
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {
    // silent fail  -  non-critical
  })
}

// ---------------------------------------------------------------------------
// 1. ConditionDebugPanel
// ---------------------------------------------------------------------------

interface ConditionField {
  id: string
  label: string
  condition: FieldCondition
  conditionType: 'show_when' | 'required_condition'
}

interface ConditionDebugPanelProps {
  fields: ConditionField[]
  values: Record<string, unknown>
}

function RuleResultRow({ ruleResult }: { ruleResult: RuleEvalResult }) {
  const { rule, result, actual_value } = ruleResult
  return (
    <TableRow className={result ? 'bg-emerald-950/30 dark:bg-green-950/20' : 'bg-red-950/30 dark:bg-red-950/20'}>
      <TableCell className="font-mono text-xs">{rule.field_path}</TableCell>
      <TableCell>
        <Badge variant="outline" className="text-xs">{rule.operator}</Badge>
      </TableCell>
      <TableCell className="font-mono text-xs">{formatValue(rule.value)}</TableCell>
      <TableCell className="font-mono text-xs">{formatValue(actual_value)}</TableCell>
      <TableCell>
        {result
          ? <Check className="h-4 w-4 text-green-600" />
          : <X className="h-4 w-4 text-red-600" />}
      </TableCell>
    </TableRow>
  )
}

function ConditionGroupTrace({
  evalResult,
  depth = 0,
}: {
  evalResult: ConditionEvalResult
  depth?: number
}) {
  return (
    <div className={depth > 0 ? 'ml-4 border-l-2 border-muted pl-3 mt-2' : ''}>
      <div className="flex items-center gap-2 mb-1">
        <Badge variant={evalResult.result ? 'default' : 'destructive'} className="text-xs">
          {evalResult.condition.logic}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {evalResult.result ? 'PASS' : 'FAIL'}
        </span>
      </div>

      {evalResult.rule_results.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Field Path</TableHead>
              <TableHead className="text-xs">Operator</TableHead>
              <TableHead className="text-xs">Expected</TableHead>
              <TableHead className="text-xs">Actual</TableHead>
              <TableHead className="text-xs w-10">Result</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {evalResult.rule_results.map((rr, i) => (
              <RuleResultRow key={i} ruleResult={rr} />
            ))}
          </TableBody>
        </Table>
      )}

      {evalResult.group_results?.map((gr, i) => (
        <ConditionGroupTrace key={i} evalResult={gr} depth={depth + 1} />
      ))}
    </div>
  )
}

export function ConditionDebugPanel({ fields, values }: ConditionDebugPanelProps) {
  const traces = useMemo(() => {
    return fields.map((field) => ({
      field,
      trace: evaluateConditionWithTrace(field.condition, values),
    }))
  }, [fields, values])

  if (fields.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No fields with show_when or required_condition found.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {traces.map(({ field, trace }) => (
        <Card key={field.id}>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">
                {field.label}
                <span className="ml-2 text-xs text-muted-foreground font-normal">({field.id})</span>
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">{field.conditionType}</Badge>
                <Badge variant={trace.result ? 'default' : 'destructive'} className="text-xs">
                  {trace.result ? 'PASS' : 'FAIL'}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <ConditionGroupTrace evalResult={trace} />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 2. PrecedenceDebugPanel
// ---------------------------------------------------------------------------

interface PrecedenceDebugPanelProps {
  resolvedFields: Record<string, ResolvedValue>
}

export function PrecedenceDebugPanel({ resolvedFields }: PrecedenceDebugPanelProps) {
  const paths = Object.keys(resolvedFields).sort()

  if (paths.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No resolved fields available.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {paths.map((path) => {
        const resolved = resolvedFields[path]
        return (
          <Card key={path}>
            <CardHeader className="py-3 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-mono font-medium">{path}</CardTitle>
                <div className="flex items-center gap-2">
                  {resolved.has_conflict && (
                    <Badge variant="destructive" className="text-xs">CONFLICT</Badge>
                  )}
                  {resolved.verified && (
                    <Badge variant="default" className="text-xs">Verified</Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              {/* Winning value */}
              <div className="mb-3 rounded-md border border-emerald-500/20 bg-emerald-950/30 p-2 dark:border-green-900 dark:bg-green-950/20">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-600" />
                  <span className="text-xs font-semibold text-emerald-400 dark:text-green-400">Winner</span>
                </div>
                <div className="mt-1 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Level: </span>
                    <span className="font-medium">{PRECEDENCE_LABELS[resolved.precedence]}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Source: </span>
                    <span className="font-mono">{resolved.source}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Value: </span>
                    <span className="font-mono">{formatValue(resolved.value)}</span>
                  </div>
                </div>
              </div>

              {/* Alternatives */}
              {resolved.alternatives.length > 0 && (
                <div>
                  <span className="text-xs font-semibold text-muted-foreground">Alternatives considered:</span>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Level</TableHead>
                        <TableHead className="text-xs">Source</TableHead>
                        <TableHead className="text-xs">Value</TableHead>
                        <TableHead className="text-xs">Verified</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {resolved.alternatives.map((alt, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs">{PRECEDENCE_LABELS[alt.precedence]}</TableCell>
                          <TableCell className="text-xs font-mono">{alt.source}</TableCell>
                          <TableCell className="text-xs font-mono">{formatValue(alt.value)}</TableCell>
                          <TableCell>
                            {alt.verified
                              ? <Check className="h-3 w-3 text-green-600" />
                              : <X className="h-3 w-3 text-muted-foreground" />}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 3. PropagationDebugPanel
// ---------------------------------------------------------------------------

interface PropagationEntry {
  profile_path: string
  instances: Array<{
    instance_id: string
    form_label: string
    value: unknown
  }>
  propagation_mode: PropagationMode
}

interface PropagationEvent {
  from_instance: string
  to_instance: string
  profile_path: string
  value: unknown
  timestamp: string
}

interface PropagationDebugPanelProps {
  entries: PropagationEntry[]
  pendingEvents?: PropagationEvent[]
}

export function PropagationDebugPanel({ entries, pendingEvents = [] }: PropagationDebugPanelProps) {
  if (entries.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No cross-form propagation paths found.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <Card key={entry.profile_path}>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-mono font-medium flex items-center gap-2">
                {entry.propagation_mode === 'no_propagate' && (
                  <Lock className="h-4 w-4 text-amber-500" />
                )}
                {entry.profile_path}
              </CardTitle>
              <Badge
                variant={entry.propagation_mode === 'auto' ? 'default' : 'secondary'}
                className="text-xs"
              >
                {entry.propagation_mode}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Instance</TableHead>
                  <TableHead className="text-xs">Form</TableHead>
                  <TableHead className="text-xs">Current Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entry.instances.map((inst) => (
                  <TableRow key={inst.instance_id}>
                    <TableCell className="text-xs font-mono">{inst.instance_id}</TableCell>
                    <TableCell className="text-xs">{inst.form_label}</TableCell>
                    <TableCell className="text-xs font-mono">{formatValue(inst.value)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      {/* Pending propagation events */}
      {pendingEvents.length > 0 && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium">
              Pending Propagation Events
              <Badge variant="destructive" className="ml-2 text-xs">{pendingEvents.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">From</TableHead>
                  <TableHead className="text-xs">To</TableHead>
                  <TableHead className="text-xs">Path</TableHead>
                  <TableHead className="text-xs">Value</TableHead>
                  <TableHead className="text-xs">Timestamp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingEvents.map((evt, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs font-mono">{evt.from_instance}</TableCell>
                    <TableCell className="text-xs font-mono">{evt.to_instance}</TableCell>
                    <TableCell className="text-xs font-mono">{evt.profile_path}</TableCell>
                    <TableCell className="text-xs font-mono">{formatValue(evt.value)}</TableCell>
                    <TableCell className="text-xs">{evt.timestamp}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 4. CompletionDebugPanel
// ---------------------------------------------------------------------------

interface CompletionDebugPanelProps {
  completionState: CompletionState
}

function completionColour(pct: number): string {
  if (pct >= 100) return 'bg-emerald-950/40 text-emerald-400 dark:bg-green-950/30 dark:text-green-400'
  if (pct > 0) return 'bg-amber-950/40 text-amber-400 dark:bg-amber-950/30 dark:text-amber-400'
  return 'bg-red-950/30 text-red-400 dark:bg-red-950/30 dark:text-red-400'
}

export function CompletionDebugPanel({ completionState }: CompletionDebugPanelProps) {
  const sections = Object.values(completionState.sections)

  if (sections.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No sections in completion state.
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="text-xs">Section</TableHead>
          <TableHead className="text-xs text-right">Total</TableHead>
          <TableHead className="text-xs text-right">Filled</TableHead>
          <TableHead className="text-xs text-right">Stale</TableHead>
          <TableHead className="text-xs text-right">Blocked</TableHead>
          <TableHead className="text-xs text-right">% Complete</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sections.map((section) => {
          const pct = section.total_relevant > 0
            ? Math.round((section.filled / section.total_relevant) * 100)
            : 0
          return (
            <TableRow key={section.section_id}>
              <TableCell className="text-xs font-medium">{section.section_id}</TableCell>
              <TableCell className="text-xs text-right">{section.total_relevant}</TableCell>
              <TableCell className="text-xs text-right">{section.filled}</TableCell>
              <TableCell className="text-xs text-right">
                {section.stale > 0 && (
                  <span className="text-amber-600 font-medium">{section.stale}</span>
                )}
                {section.stale === 0 && '0'}
              </TableCell>
              <TableCell className="text-xs text-right">
                {section.blocked > 0 && (
                  <span className="text-red-600 font-medium">{section.blocked}</span>
                )}
                {section.blocked === 0 && '0'}
              </TableCell>
              <TableCell className="text-xs text-right">
                <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${completionColour(pct)}`}>
                  {pct}%
                </span>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
      <TableFooter>
        <TableRow className="font-semibold">
          <TableCell className="text-xs">Totals</TableCell>
          <TableCell className="text-xs text-right">{completionState.total_relevant}</TableCell>
          <TableCell className="text-xs text-right">{completionState.total_filled}</TableCell>
          <TableCell className="text-xs text-right">
            {completionState.total_stale > 0 && (
              <span className="text-amber-600">{completionState.total_stale}</span>
            )}
            {completionState.total_stale === 0 && '0'}
          </TableCell>
          <TableCell className="text-xs text-right">
            {completionState.total_blocked > 0 && (
              <span className="text-red-600">{completionState.total_blocked}</span>
            )}
            {completionState.total_blocked === 0 && '0'}
          </TableCell>
          <TableCell className="text-xs text-right">
            <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${completionColour(completionState.completion_pct)}`}>
              {completionState.completion_pct}%
            </span>
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  )
}

// ---------------------------------------------------------------------------
// 5. AnswerMapDebugPanel
// ---------------------------------------------------------------------------

interface AnswerMapDebugPanelProps {
  answers: AnswerMap
}

export function AnswerMapDebugPanel({ answers }: AnswerMapDebugPanelProps) {
  const [search, setSearch] = useState('')
  const [jsonView, setJsonView] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const entries = useMemo(() => {
    const all = Object.entries(answers).sort(([a], [b]) => a.localeCompare(b))
    if (!search) return all
    const lower = search.toLowerCase()
    return all.filter(([path]) => path.toLowerCase().includes(lower))
  }, [answers, search])

  const handleCopy = useCallback((text: string, key: string) => {
    copyToClipboard(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 1500)
  }, [])

  if (Object.keys(answers).length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Answer map is empty.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Filter by profile_path..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <Button
          variant={jsonView ? 'default' : 'outline'}
          size="sm"
          onClick={() => setJsonView(!jsonView)}
        >
          {jsonView ? 'Table' : 'JSON'}
        </Button>
      </div>

      <div className="text-xs text-muted-foreground">
        {entries.length} of {Object.keys(answers).length} entries
      </div>

      {jsonView ? (
        /* JSON view */
        <pre className="max-h-[500px] overflow-auto rounded-md bg-muted p-3 text-xs font-mono">
          {JSON.stringify(
            Object.fromEntries(entries),
            null,
            2,
          )}
        </pre>
      ) : (
        /* Table view */
        <div className="max-h-[500px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Path</TableHead>
                <TableHead className="text-xs">Value</TableHead>
                <TableHead className="text-xs">Source</TableHead>
                <TableHead className="text-xs">Trust</TableHead>
                <TableHead className="text-xs">Verified</TableHead>
                <TableHead className="text-xs">Stale</TableHead>
                <TableHead className="text-xs">Updated At</TableHead>
                <TableHead className="text-xs w-16">Copy</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map(([path, record]) => {
                // Import SOURCE_TRUST_LEVEL inline for display
                const trustLevels: Record<string, number> = {
                  extraction: 1,
                  migration: 1,
                  canonical_prefill: 2,
                  cross_matter_import: 3,
                  cross_form_reuse: 4,
                  client_portal: 5,
                  staff_entry: 6,
                }
                const trust = trustLevels[record.source] ?? 0

                return (
                  <TableRow key={path}>
                    <TableCell className="text-xs font-mono max-w-[200px] truncate" title={path}>
                      {path}
                    </TableCell>
                    <TableCell className="text-xs font-mono max-w-[150px] truncate" title={formatValue(record.value)}>
                      {formatValue(record.value)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{record.source}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-center">{trust}</TableCell>
                    <TableCell>
                      {record.verified
                        ? <Check className="h-3 w-3 text-green-600" />
                        : <X className="h-3 w-3 text-muted-foreground" />}
                    </TableCell>
                    <TableCell>
                      {record.stale
                        ? <Badge variant="destructive" className="text-xs">Stale</Badge>
                        : <span className="text-xs text-muted-foreground">No</span>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{record.updated_at}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          title="Copy path"
                          onClick={() => handleCopy(path, `path-${path}`)}
                        >
                          {copiedKey === `path-${path}`
                            ? <Check className="h-3 w-3 text-green-600" />
                            : <Copy className="h-3 w-3" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          title="Copy value"
                          onClick={() => handleCopy(formatValue(record.value), `val-${path}`)}
                        >
                          {copiedKey === `val-${path}`
                            ? <Check className="h-3 w-3 text-green-600" />
                            : <Copy className="h-3 w-3" />}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Wrapper: DebugInspector
// ---------------------------------------------------------------------------

interface DebugInspectorProps {
  instanceId: string
  formId: string
  matterId: string
  /** Condition debug data */
  conditionFields?: ConditionField[]
  conditionValues?: Record<string, unknown>
  /** Precedence debug data */
  resolvedFields?: Record<string, ResolvedValue>
  /** Propagation debug data */
  propagationEntries?: PropagationEntry[]
  propagationEvents?: PropagationEvent[]
  /** Completion debug data */
  completionState?: CompletionState
  /** Answer map debug data */
  answers?: AnswerMap
  /** Whether the current user has admin role */
  isAdmin?: boolean
}

export function DebugInspector({
  instanceId,
  formId,
  matterId,
  conditionFields = [],
  conditionValues = {},
  resolvedFields = {},
  propagationEntries = [],
  propagationEvents = [],
  completionState,
  answers = {},
  isAdmin = false,
}: DebugInspectorProps) {
  const [isOpen, setIsOpen] = useState(false)

  // Only render in development or for admin users
  const isDev = process.env.NODE_ENV === 'development'
  if (!isDev && !isAdmin) return null

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="border-dashed border-amber-500/30 dark:border-amber-700">
        <CollapsibleTrigger asChild>
          <CardHeader className="py-2 px-4 cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bug className="h-4 w-4 text-amber-500" />
                <CardTitle className="text-sm font-medium">Debug Inspector</CardTitle>
                <span className="text-xs text-muted-foreground">
                  {instanceId} / {formId}
                </span>
              </div>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
              />
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="px-4 pb-4 pt-0">
            <Tabs defaultValue="conditions" className="w-full">
              <TabsList className="w-full justify-start">
                <TabsTrigger value="conditions" className="text-xs">Conditions</TabsTrigger>
                <TabsTrigger value="precedence" className="text-xs">Precedence</TabsTrigger>
                <TabsTrigger value="propagation" className="text-xs">Propagation</TabsTrigger>
                <TabsTrigger value="completion" className="text-xs">Completion</TabsTrigger>
                <TabsTrigger value="answers" className="text-xs">Answer Map</TabsTrigger>
              </TabsList>

              <TabsContent value="conditions" className="mt-3">
                <ConditionDebugPanel
                  fields={conditionFields}
                  values={conditionValues}
                />
              </TabsContent>

              <TabsContent value="precedence" className="mt-3">
                <PrecedenceDebugPanel resolvedFields={resolvedFields} />
              </TabsContent>

              <TabsContent value="propagation" className="mt-3">
                <PropagationDebugPanel
                  entries={propagationEntries}
                  pendingEvents={propagationEvents}
                />
              </TabsContent>

              <TabsContent value="completion" className="mt-3">
                {completionState ? (
                  <CompletionDebugPanel completionState={completionState} />
                ) : (
                  <div className="p-4 text-sm text-muted-foreground">
                    No completion state available.
                  </div>
                )}
              </TabsContent>

              <TabsContent value="answers" className="mt-3">
                <AnswerMapDebugPanel answers={answers} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}
