'use client'

import { useState } from 'react'
import {
  FileText,
  Upload,
  Link2,
  Folder,
  FolderOpen,
  ClipboardList,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FormCard } from './form-card'
import { getFormQuestionStats } from '@/lib/ircc/form-question-utils'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FormData = any

export function MatterTypeFolder({
  matterTypeId,
  matterTypeName,
  practiceAreaId,
  practiceAreaName,
  practiceAreaColor,
  forms,
  defaultOpen,
  onSelectForm,
  onDeleteForm,
  onUploadForm,
  onAddExistingForm,
  onShowHistory,
  onMoveForm,
  DocumentSlotList,
  FolderTemplateList,
}: {
  matterTypeId: string
  matterTypeName: string
  practiceAreaId: string
  practiceAreaName: string
  practiceAreaColor?: string
  forms: FormData[]
  defaultOpen: boolean
  onSelectForm: (id: string) => void
  onDeleteForm: (form: FormData) => void
  onUploadForm: (matterTypeId: string, practiceAreaId: string) => void
  onAddExistingForm: (matterTypeId: string, matterTypeName: string) => void
  onShowHistory?: (form: FormData) => void
  onMoveForm?: (form: FormData, matterTypeId: string, matterTypeName: string) => void
  DocumentSlotList: React.ComponentType<{ matterTypeId: string }>
  FolderTemplateList: React.ComponentType<{ matterTypeId: string }>
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const [activeTab, setActiveTab] = useState<'forms' | 'documents' | 'folders'>('forms')

  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? (
          <FolderOpen className="h-5 w-5 text-amber-500 shrink-0" />
        ) : (
          <Folder className="h-5 w-5 text-amber-500 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">{matterTypeName}</span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {forms.length} form{forms.length !== 1 ? 's' : ''}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            {practiceAreaColor && (
              <span
                className="inline-block h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: practiceAreaColor }}
              />
            )}
            <span className="text-xs text-slate-500">{practiceAreaName}</span>
          </div>
        </div>
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
        )}
      </button>
      {isOpen && (
        <div className="border-t border-slate-100 bg-slate-50/50">
          {/* Sub-tabs: Forms | Documents | Folders */}
          <div className="flex border-b border-slate-200">
            <button
              type="button"
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors ${
                activeTab === 'forms'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
              onClick={() => setActiveTab('forms')}
            >
              <FileText className="h-3.5 w-3.5" />
              Forms
            </button>
            <button
              type="button"
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors ${
                activeTab === 'documents'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
              onClick={() => setActiveTab('documents')}
            >
              <ClipboardList className="h-3.5 w-3.5" />
              Documents
            </button>
            <button
              type="button"
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors ${
                activeTab === 'folders'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
              onClick={() => setActiveTab('folders')}
            >
              <Folder className="h-3.5 w-3.5" />
              Folders
            </button>
          </div>

          <div className="p-4">
            {activeTab === 'forms' ? (
              <div className="space-y-3">
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 h-7 text-xs"
                    onClick={() => onAddExistingForm(matterTypeId, matterTypeName)}
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    Add Existing Form
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 h-7 text-xs"
                    onClick={() => onUploadForm(matterTypeId, practiceAreaId)}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Upload New Form
                  </Button>
                </div>
                {forms.length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {forms.map((form: FormData) => (
                      <FormCard
                        key={form.id}
                        form={form}
                        onSelect={onSelectForm}
                        onDelete={onDeleteForm}
                        onShowHistory={onShowHistory}
                        questionStats={getFormQuestionStats(form.form_code)}
                        onMoveForm={onMoveForm ? () => onMoveForm(form, matterTypeId, matterTypeName) : undefined}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic py-2">
                    No forms assigned yet. Use &quot;Add Existing Form&quot; or &quot;Upload New Form&quot; to add one.
                  </p>
                )}
              </div>
            ) : activeTab === 'documents' ? (
              <DocumentSlotList matterTypeId={matterTypeId} />
            ) : (
              <FolderTemplateList matterTypeId={matterTypeId} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
