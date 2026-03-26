'use client'

import { useState, useCallback, useMemo } from 'react'
import {
  Search,
  ArrowLeft,
  RotateCcw,
  CheckCircle2,
  Loader2,
  Users,
  Settings2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useIrccFormFields,
  useRescanIrccForm,
  useBulkUpdateIrccFormFields,
} from '@/lib/queries/ircc-forms'
import type { IrccFormField, IrccFormFieldUpdate } from '@/lib/types/ircc-forms'
import { ScanStatusBadge } from './scan-status-badge'
import { FieldMappingRow } from './field-mapping-row'
import { ClientFieldConfigPanel } from './client-field-config-panel'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FormData = any

export function FormDetailView({
  form,
  onBack,
}: {
  form: FormData
  onBack: () => void
}) {
  const { data: fields, isLoading: fieldsLoading } = useIrccFormFields(form.id)
  const rescanMutation = useRescanIrccForm()
  const bulkUpdateMutation = useBulkUpdateIrccFormFields()
  const [activeTab, setActiveTab] = useState<'client' | 'mapping'>('client')
  const [fieldSearch, setFieldSearch] = useState('')
  const [filterMapped, setFilterMapped] = useState<'all' | 'mapped' | 'unmapped'>('all')

  // Collect pending updates in local state
  const [pendingUpdates, setPendingUpdates] = useState<
    Record<string, IrccFormFieldUpdate>
  >({})

  const handleFieldUpdate = useCallback(
    (fieldId: string, updates: IrccFormFieldUpdate) => {
      setPendingUpdates((prev) => ({
        ...prev,
        [fieldId]: { ...prev[fieldId], ...updates },
      }))
    },
    [],
  )

  const handleSaveMappings = async () => {
    const entries = Object.entries(pendingUpdates)
    if (entries.length === 0) {
      toast.info('No changes to save')
      return
    }

    try {
      await bulkUpdateMutation.mutateAsync({
        formId: form.id,
        updates: entries.map(([fieldId, updates]) => ({ fieldId, updates })),
      })
      setPendingUpdates({})
    } catch {
      // Error handled by mutation
    }
  }

  const filteredFields = useMemo(() => {
    if (!fields) return []
    let result = fields as IrccFormField[]

    // Apply pending updates to display state
    result = result.map((f) => {
      const pending = pendingUpdates[f.id]
      if (pending) {
        return {
          ...f,
          ...pending,
          is_mapped: !!pending.profile_path || f.is_mapped,
        }
      }
      return f
    })

    if (fieldSearch) {
      const lower = fieldSearch.toLowerCase()
      result = result.filter(
        (f) =>
          f.xfa_path.toLowerCase().includes(lower) ||
          f.suggested_label?.toLowerCase().includes(lower) ||
          f.profile_path?.toLowerCase().includes(lower),
      )
    }

    if (filterMapped === 'mapped') result = result.filter((f) => f.is_mapped)
    if (filterMapped === 'unmapped') result = result.filter((f) => !f.is_mapped)

    return result
  }, [fields, fieldSearch, filterMapped, pendingUpdates])

  const mappedCount = fields?.filter((f: IrccFormField) => f.is_mapped).length ?? 0
  const totalCount = fields?.length ?? 0
  const pendingCount = Object.keys(pendingUpdates).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-slate-900">{form.form_code}</h2>
            <ScanStatusBadge status={form.scan_status} />
          </div>
          <p className="text-sm text-slate-500">{form.form_name}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => rescanMutation.mutate(form.id)}
            disabled={rescanMutation.isPending}
          >
            {rescanMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            )}
            Re-scan
          </Button>
          {pendingCount > 0 && (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={handleSaveMappings}
              disabled={bulkUpdateMutation.isPending}
            >
              {bulkUpdateMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              Save {pendingCount} Change{pendingCount !== 1 ? 's' : ''}
            </Button>
          )}
        </div>
      </div>

      {/* Form Info Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <p className="text-xs text-slate-500">File</p>
              <p className="font-medium">{form.file_name}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">XFA Root</p>
              <p className="font-mono text-xs">{form.xfa_root_element ?? ' - '}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Fields</p>
              <p className="font-medium">{totalCount}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Mapped</p>
              <p className="font-medium">
                {mappedCount} / {totalCount}
                {totalCount > 0 && (
                  <span className="text-xs text-slate-400 ml-1">
                    ({Math.round((mappedCount / totalCount) * 100)}%)
                  </span>
                )}
              </p>
            </div>
          </div>
          {form.scan_error && (
            <div className="mt-3 rounded-md bg-red-50 p-3 text-xs text-red-700">
              <strong>Scan Error:</strong> {form.scan_error}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 border-b">
        <button
          type="button"
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'client'
              ? 'border-primary text-primary'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
          onClick={() => setActiveTab('client')}
        >
          <Users className="h-3.5 w-3.5" />
          Client Fields
        </button>
        <button
          type="button"
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'mapping'
              ? 'border-primary text-primary'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
          onClick={() => setActiveTab('mapping')}
        >
          <Settings2 className="h-3.5 w-3.5" />
          Advanced Mapping
        </button>
      </div>

      {/* Client Fields Tab */}
      {activeTab === 'client' && (
        <ClientFieldConfigPanel formId={form.id} />
      )}

      {/* Field Mapping Table */}
      {activeTab === 'mapping' && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Field Mappings</CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                  <Input
                    className="h-8 w-[200px] pl-8 text-xs"
                    placeholder="Search fields..."
                    value={fieldSearch}
                    onChange={(e) => setFieldSearch(e.target.value)}
                  />
                </div>
                <Select
                  value={filterMapped}
                  onValueChange={(v) => setFilterMapped(v as 'all' | 'mapped' | 'unmapped')}
                >
                  <SelectTrigger className="h-8 w-[130px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Fields</SelectItem>
                    <SelectItem value="mapped">Mapped</SelectItem>
                    <SelectItem value="unmapped">Unmapped</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {fieldsLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : filteredFields.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Search className="h-8 w-8 text-slate-300 mb-2" />
                <p className="text-sm text-slate-500">No fields found</p>
                <p className="text-xs text-slate-400 mt-1">
                  {fieldSearch ? 'Try a different search term' : 'Upload and scan a form to see fields'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">XFA Path</TableHead>
                      <TableHead className="text-xs">Suggested Label</TableHead>
                      <TableHead className="text-xs">Type</TableHead>
                      <TableHead className="text-xs">Profile Path</TableHead>
                      <TableHead className="text-xs w-[60px]">Mapped</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredFields.map((field) => (
                      <FieldMappingRow
                        key={field.id}
                        field={field}
                        onUpdate={handleFieldUpdate}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
