'use client'

import {
  FileText,
  ChevronRight,
  History,
  Link2,
  ArrowRightLeft,
  Trash2,
  ClipboardList,
  Pencil,
} from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { ScanStatusBadge } from './scan-status-badge'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FormData = any

export function FormCard({
  form,
  onSelect,
  onDelete,
  onShowHistory,
  onMoveForm,
  onAssignForm,
  matterTypeBadges,
  questionStats,
}: {
  form: FormData
  onSelect: (id: string) => void
  onDelete: (form: FormData) => void
  onShowHistory?: (form: FormData) => void
  onMoveForm?: (form: FormData) => void
  onAssignForm?: (form: FormData) => void
  matterTypeBadges?: Array<{ name: string; color?: string }>
  questionStats?: { sectionCount: number; fieldCount: number } | null
}) {
  return (
    <Card
      className="group cursor-pointer transition-all hover:shadow-sm hover:border-slate-300"
      onClick={() => onSelect(form.id)}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-50">
              <FileText className="h-5 w-5 text-rose-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 group-hover:text-primary transition-colors">
                {form.form_code}
              </p>
              <p className="text-xs text-slate-500 line-clamp-1">{form.form_name}</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 transition-colors mt-1" />
        </div>

        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <ScanStatusBadge status={form.scan_status} />
          {form.current_version > 1 && (
            <Badge variant="outline" className="text-xs gap-1 text-indigo-600 border-indigo-200 bg-indigo-50">
              <History className="h-2.5 w-2.5" />
              v{form.current_version}
            </Badge>
          )}
          {form.is_xfa && (
            <Badge variant="outline" className="text-xs">XFA</Badge>
          )}
          {form.field_count > 0 && (
            <Badge variant="secondary" className="text-xs">
              {form.field_count} fields
            </Badge>
          )}
          {form.mapped_field_count > 0 && (
            <Badge variant="secondary" className="text-xs gap-1 text-green-600 bg-green-50">
              <Link2 className="h-2.5 w-2.5" />
              {form.mapped_field_count} mapped
            </Badge>
          )}
          {questionStats && (
            <Badge variant="outline" className="text-xs gap-1 text-blue-600 border-blue-200 bg-blue-50">
              <ClipboardList className="h-2.5 w-2.5" />
              {questionStats.sectionCount} question sections
            </Badge>
          )}
          {matterTypeBadges && matterTypeBadges.length > 0 && matterTypeBadges.map((mt, i) => (
            <Badge key={i} variant="outline" className="text-[10px] gap-1 text-slate-500 border-slate-200">
              {mt.color && (
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: mt.color }} />
              )}
              {mt.name}
            </Badge>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-xs text-slate-400">
              {form.file_name} ({form.file_size ? `${(form.file_size / 1024).toFixed(0)} KB` : ' - '})
            </p>
            {form.form_date && (
              <p className="text-[10px] text-slate-400 mt-0.5">
                IRCC date: {new Date(form.form_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
            {/* Edit fields link  -  navigates to dedicated field editor */}
            <Link
              href={`/settings/ircc-form-library/${form.id}`}
              onClick={(e) => e.stopPropagation()}
              title="Edit field mappings"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:text-blue-600 hover:bg-accent transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Link>
            {onShowHistory && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-slate-400 hover:text-indigo-600"
                onClick={(e) => {
                  e.stopPropagation()
                  onShowHistory(form)
                }}
              >
                <History className="h-3.5 w-3.5" />
              </Button>
            )}
            {onAssignForm && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 p-0 text-xs text-slate-400 hover:text-primary gap-1"
                onClick={(e) => {
                  e.stopPropagation()
                  onAssignForm(form)
                }}
                title="Assign to matter type"
              >
                <Link2 className="h-3 w-3" />
                Assign
              </Button>
            )}
            {onMoveForm && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-slate-400 hover:text-amber-600"
                onClick={(e) => {
                  e.stopPropagation()
                  onMoveForm(form)
                }}
                title="Move to different matter type"
              >
                <ArrowRightLeft className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-slate-400 hover:text-red-600"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(form)
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
