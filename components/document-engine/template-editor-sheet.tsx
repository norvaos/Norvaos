'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  FileText,
  Loader2,
  GripVertical,
  Settings2,
  Layers,
  Variable,
  GitBranch,
  Eye,
  Table2,
  PenLine,
  AlertTriangle,
} from 'lucide-react'
import { useDocumentTemplate, useUpdateTemplate, usePublishVersion } from '@/lib/queries/document-engine'
import { TemplateStatusBadge } from './document-status-badge'
import { TemplateStructureEditor } from './template-structure-editor'

interface TemplateEditorSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  templateId: string | null
}

export function TemplateEditorSheet({ open, onOpenChange, templateId }: TemplateEditorSheetProps) {
  const [activeTab, setActiveTab] = useState('overview')
  const [isEditingStructure, setIsEditingStructure] = useState(false)
  const { data, isLoading } = useDocumentTemplate(templateId)
  const updateMutation = useUpdateTemplate(templateId ?? '')
  const publishMutation = usePublishVersion(templateId ?? '')

  if (!templateId) return null

  const detail = data as Record<string, unknown> | undefined
  const template = detail?.template as Record<string, unknown> | undefined
  const version = detail?.version as Record<string, unknown> | undefined
  const mappings = (detail?.mappings ?? []) as Record<string, unknown>[]
  const conditions = (detail?.conditions ?? []) as Record<string, unknown>[]
  const clauseAssignments = (detail?.clauseAssignments ?? []) as Record<string, unknown>[]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center justify-between">
            <div>
              <SheetTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {isLoading ? 'Loading...' : (template?.name as string ?? 'Template')}
              </SheetTitle>
              <SheetDescription>
                {template?.template_key as string ?? ''}
                {template && <> &middot; <TemplateStatusBadge status={template.status as string} /></>}
              </SheetDescription>
            </div>
            {template && version && (template.status as string) === 'draft' && (
              <Button
                size="sm"
                onClick={() => publishMutation.mutate(version.id as string)}
                disabled={publishMutation.isPending}
              >
                {publishMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
                Publish
              </Button>
            )}
          </div>
        </SheetHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !template ? (
          <div className="py-12 text-center text-muted-foreground">Template not found.</div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="overview" className="text-xs">
                <Settings2 className="h-3.5 w-3.5 mr-1" /> Overview
              </TabsTrigger>
              <TabsTrigger value="preview" className="text-xs">
                <Eye className="h-3.5 w-3.5 mr-1" /> Preview
              </TabsTrigger>
              <TabsTrigger value="mappings" className="text-xs">
                <Variable className="h-3.5 w-3.5 mr-1" /> Fields
              </TabsTrigger>
              <TabsTrigger value="conditions" className="text-xs">
                <GitBranch className="h-3.5 w-3.5 mr-1" /> Conditions
              </TabsTrigger>
              <TabsTrigger value="structure" className="text-xs">
                <Layers className="h-3.5 w-3.5 mr-1" /> Structure
              </TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-4 mt-4">
              <OverviewSection template={template} version={version} onUpdate={(data) => {
                updateMutation.mutate(data)
              }} />
            </TabsContent>

            {/* Preview Tab */}
            <TabsContent value="preview" className="mt-4">
              <PreviewSection version={version} conditions={conditions} />
            </TabsContent>

            {/* Field Mappings Tab */}
            <TabsContent value="mappings" className="space-y-3 mt-4">
              <MappingsSection mappings={mappings} />
            </TabsContent>

            {/* Conditions Tab */}
            <TabsContent value="conditions" className="space-y-3 mt-4">
              <ConditionsSection conditions={conditions} />
            </TabsContent>

            {/* Structure Tab */}
            <TabsContent value="structure" className="space-y-3 mt-4">
              {isEditingStructure && version ? (
                <TemplateStructureEditor
                  templateId={templateId!}
                  version={version}
                  mappings={mappings}
                  conditions={conditions}
                  clauseAssignments={clauseAssignments}
                  onDone={() => setIsEditingStructure(false)}
                />
              ) : (
                <StructureSection
                  version={version}
                  clauseAssignments={clauseAssignments}
                  onEdit={() => setIsEditingStructure(true)}
                />
              )}
            </TabsContent>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  )
}

// ─── Overview Section ──────────────────────────────────────────────────────

function OverviewSection({
  template,
  version,
  onUpdate,
}: {
  template: Record<string, unknown>
  version: Record<string, unknown> | undefined
  onUpdate: (data: Record<string, unknown>) => void
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Template Key</label>
          <p className="text-sm font-mono mt-0.5">{template.template_key as string}</p>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Document Family</label>
          <p className="text-sm mt-0.5">{template.document_family as string}</p>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Status</label>
          <div className="mt-0.5"><TemplateStatusBadge status={template.status as string} /></div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">System Template</label>
          <p className="text-sm mt-0.5">{template.is_system_template ? 'Yes' : 'No'}</p>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Requires Review</label>
          <p className="text-sm mt-0.5">{template.requires_review ? 'Yes' : 'No'}</p>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Jurisdiction</label>
          <p className="text-sm mt-0.5">{(template.jurisdiction_code as string) || 'Any'}</p>
        </div>
      </div>

      {version && (
        <div className="border-t pt-4 space-y-2">
          <h4 className="text-sm font-medium">Current Version</h4>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Version:</span> v{version.version_number as number}
            </div>
            <div>
              <span className="text-muted-foreground">Label:</span> {(version.version_label as string) || ' - '}
            </div>
            <div className="col-span-2">
              <span className="text-muted-foreground">Summary:</span> {(version.change_summary as string) || ' - '}
            </div>
          </div>
        </div>
      )}

      {Boolean(template.description) && (
        <div className="border-t pt-4">
          <label className="text-xs font-medium text-muted-foreground">Description</label>
          <p className="text-sm mt-1">{template.description as string}</p>
        </div>
      )}
    </div>
  )
}

// ─── Field Mappings Section ────────────────────────────────────────────────

function MappingsSection({ mappings }: { mappings: Record<string, unknown>[] }) {
  if (mappings.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Variable className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No field mappings defined.</p>
        <p className="text-xs mt-1">Field mappings connect template placeholders to data sources.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Field Mappings ({mappings.length})</h4>
      </div>
      <div className="space-y-1.5">
        {mappings.map((m) => (
          <div key={m.id as string} className="flex items-center justify-between border rounded-md px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                  {`{{${m.field_key as string}}}`}
                </code>
                {Boolean(m.is_required) && (
                  <Badge variant="outline" className="text-[9px] text-red-600 border-red-500/20">Required</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {m.display_name as string} &middot; {m.source_entity as string}.{m.source_path as string}
                {m.format_rule ? ` · ${String(m.format_rule)}` : null}
              </p>
            </div>
            <Badge variant="secondary" className="text-[10px]">{m.field_type as string}</Badge>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Conditions Section ────────────────────────────────────────────────────

function ConditionsSection({ conditions }: { conditions: Record<string, unknown>[] }) {
  if (conditions.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <GitBranch className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No conditions defined.</p>
        <p className="text-xs mt-1">Conditions control which sections appear in the generated document.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Conditions ({conditions.length})</h4>
      </div>
      <div className="space-y-2">
        {conditions.map((c) => {
          const rules = (c.rules as Record<string, unknown>)?.rules as Record<string, unknown>[] ?? []
          return (
            <div key={c.id as string} className="border rounded-md p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{c.condition_key as string}</code>
                  <span className="text-xs text-muted-foreground ml-2">{c.label as string}</span>
                </div>
                <Badge variant="secondary" className="text-[10px]">{c.logic_operator as string}</Badge>
              </div>
              {rules.length > 0 && (
                <div className="space-y-1 ml-2 border-l-2 border-muted pl-3">
                  {rules.map((r, i) => (
                    <p key={i} className="text-xs text-muted-foreground">
                      <span className="font-mono">{r.field_key as string}</span>{' '}
                      <span className="text-foreground font-medium">{r.operator as string}</span>{' '}
                      <span className="font-mono">{JSON.stringify(r.value)}</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Preview Section ──────────────────────────────────────────────────────

function PreviewSection({
  version,
  conditions,
}: {
  version: Record<string, unknown> | undefined
  conditions: Record<string, unknown>[]
}) {
  const body = version?.template_body as Record<string, unknown> | undefined
  const sections = (body?.sections ?? []) as Record<string, unknown>[]
  const header = body?.header as Record<string, unknown> | undefined
  const footer = body?.footer as Record<string, unknown> | undefined
  const metadata = body?.metadata as Record<string, unknown> | undefined

  if (sections.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Eye className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No content to preview.</p>
        <p className="text-xs mt-1">Add sections to the template body to see a preview.</p>
      </div>
    )
  }

  // Build condition key → label map
  const conditionLabels = new Map<string, string>()
  for (const c of conditions) {
    conditionLabels.set(c.condition_key as string, c.label as string)
  }

  // Render merge fields as highlighted spans
  function renderContent(text: string) {
    const parts = text.split(/(\{\{[^}]+\}\})/)
    return parts.map((part, i) => {
      if (part.startsWith('{{') && part.endsWith('}}')) {
        return (
          <code key={i} className="text-xs bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 px-1 py-0.5 rounded font-mono">
            {part}
          </code>
        )
      }
      // Handle newlines
      return part.split('\n').map((line, j) => (
        <span key={`${i}-${j}`}>
          {j > 0 && <br />}
          {line}
        </span>
      ))
    })
  }

  function renderElement(el: Record<string, unknown>, idx: number) {
    const type = el.type as string
    const condKey = el.condition_key as string | null

    const wrapper = (children: React.ReactNode) => (
      <div key={el.id as string ?? idx} className="relative">
        {condKey && (
          <div className="absolute -left-3 top-0 bottom-0 w-0.5 bg-amber-400 rounded" title={`Conditional: ${condKey}`} />
        )}
        {children}
      </div>
    )

    switch (type) {
      case 'paragraph': {
        const style = el.style as string
        const content = el.content as string
        const indent = el.indent_level as number | undefined

        let className = 'text-sm leading-relaxed'
        if (style === 'bold') className += ' font-bold'
        if (style === 'bullet') className = 'text-sm leading-relaxed list-disc ml-4'
        if (indent) className += ` ml-${indent * 6}`

        if (style === 'bullet') {
          return wrapper(
            <li className={className}>{renderContent(content)}</li>
          )
        }

        return wrapper(
          <p className={className} style={indent ? { marginLeft: `${indent * 1.5}rem` } : undefined}>
            {renderContent(content)}
          </p>
        )
      }

      case 'table': {
        const columns = (el.columns ?? []) as string[]
        const rows = (el.rows ?? []) as string[][]
        return wrapper(
          <div className="my-2 border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  {columns.map((col, ci) => (
                    <th key={ci} className="px-3 py-1.5 text-left text-xs font-medium text-muted-foreground">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={ri} className="border-t">
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-3 py-1.5 text-sm">{renderContent(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }

      case 'signature_block': {
        const signers = (el.signers ?? []) as Record<string, unknown>[]
        const layout = el.layout as string
        return wrapper(
          <div className={`my-4 ${layout === 'side_by_side' ? 'grid grid-cols-2 gap-8' : 'space-y-6'}`}>
            {signers.map((signer, si) => (
              <div key={si} className="space-y-2">
                <div className="border-t border-foreground pt-2 mt-8">
                  <p className="text-sm font-medium">{renderContent(signer.label as string)}</p>
                  <p className="text-xs text-muted-foreground">({signer.role as string})</p>
                </div>
                {!!(signer.include_date_line) && (
                  <p className="text-xs text-muted-foreground">Date: ____________________</p>
                )}
                {!!(signer.include_lso_number) && (
                  <p className="text-xs text-muted-foreground">LSO #: ____________________</p>
                )}
              </div>
            ))}
          </div>
        )
      }

      case 'clause_placeholder': {
        const placementKey = el.clause_placement_key as string
        return wrapper(
          <div className="my-2 border border-dashed rounded-md px-3 py-2 bg-muted/30">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <PenLine className="h-3 w-3" />
              Clause: <code className="font-mono bg-muted px-1 rounded">{placementKey}</code>
            </p>
          </div>
        )
      }

      case 'page_break':
        return wrapper(
          <div className="my-3 border-t-2 border-dashed border-muted-foreground/30 relative">
            <span className="absolute left-1/2 -translate-x-1/2 -top-2.5 bg-background px-2 text-[10px] text-muted-foreground">PAGE BREAK</span>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="space-y-1">
      {/* Document paper preview */}
      <div className="border rounded-lg bg-white dark:bg-zinc-950 shadow-sm">
        {/* Header */}
        {header && !!header.content && (
          <div className={`border-b px-6 py-3 text-xs text-muted-foreground ${header.alignment === 'center' ? 'text-center' : ''}`}>
            {renderContent(header.content as string)}
          </div>
        )}

        {/* Body */}
        <div className="px-6 py-4 space-y-4" style={{ fontFamily: (metadata?.font_family as string) || 'Times New Roman' }}>
          {sections
            .sort((a, b) => (a.order as number) - (b.order as number))
            .map((section, i) => {
              const title = section.title as string
              const titleStyle = section.title_style as string
              const condKey = section.condition_key as string | null
              const elements = (section.elements ?? []) as Record<string, unknown>[]

              return (
                <div key={section.id as string ?? i} className="relative">
                  {/* Conditional section indicator */}
                  {condKey && (
                    <div className="flex items-center gap-1 mb-1">
                      <AlertTriangle className="h-3 w-3 text-amber-500" />
                      <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                        Conditional: {conditionLabels.get(condKey) || condKey}
                      </span>
                    </div>
                  )}

                  {/* Section title */}
                  {title && (
                    <h3 className={`font-bold mb-2 ${
                      titleStyle === 'heading1' ? 'text-lg text-center' :
                      titleStyle === 'heading2' ? 'text-base' :
                      'text-sm'
                    }`}>
                      {title}
                    </h3>
                  )}

                  {/* Elements */}
                  <div className="space-y-2">
                    {elements
                      .sort((a, b) => (a.order as number) - (b.order as number))
                      .map((el, j) => renderElement(el, j))}
                  </div>
                </div>
              )
            })}
        </div>

        {/* Footer */}
        {footer && !!footer.content && (
          <div className="border-t px-6 py-2 text-[10px] text-muted-foreground text-center">
            {renderContent(footer.content as string)}
            {!!(footer.show_page_numbers) && (
              <span className="ml-2">{(footer.page_number_format as string) || 'Page {PAGE} of {NUMPAGES}'}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Structure Section ─────────────────────────────────────────────────────

function StructureSection({
  version,
  clauseAssignments,
  onEdit,
}: {
  version: Record<string, unknown> | undefined
  clauseAssignments: Record<string, unknown>[]
  onEdit?: () => void
}) {
  const body = version?.template_body as Record<string, unknown> | undefined
  const sections = (body?.sections ?? []) as Record<string, unknown>[]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Sections ({sections.length})</h4>
        {onEdit && (
          <Button variant="outline" size="sm" onClick={onEdit}>
            <PenLine className="h-3.5 w-3.5 mr-1" />
            Edit
          </Button>
        )}
      </div>

      {sections.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Layers className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No sections defined in template body.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sections
            .sort((a, b) => (a.order as number) - (b.order as number))
            .map((section, i) => {
              const elements = (section.elements ?? []) as Record<string, unknown>[]
              return (
                <div key={section.id as string ?? i} className="border rounded-md p-3">
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm font-medium">{section.title as string || `Section ${i + 1}`}</span>
                    {Boolean(section.condition_key) && (
                      <Badge variant="outline" className="text-[9px]">
                        if: {section.condition_key as string}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 ml-6">
                    {elements.length} element{elements.length !== 1 ? 's' : ''}
                    {elements.length > 0 && (
                      <> &middot; {elements.map(e => e.type as string).filter(Boolean).join(', ')}</>
                    )}
                  </p>
                </div>
              )
            })}
        </div>
      )}

      {clauseAssignments.length > 0 && (
        <div className="border-t pt-4 space-y-2">
          <h4 className="text-sm font-medium">Clause Assignments ({clauseAssignments.length})</h4>
          {clauseAssignments.map((ca) => (
            <div key={ca.id as string} className="flex items-center justify-between border rounded-md px-3 py-2">
              <div className="text-sm">
                <span className="font-mono text-xs bg-muted px-1 rounded">{ca.placement_key as string}</span>
                {Boolean(ca.condition_id) && (
                  <Badge variant="outline" className="text-[9px] ml-2">Conditional</Badge>
                )}
              </div>
              <span className="text-xs text-muted-foreground">order: {ca.sort_order as number}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
