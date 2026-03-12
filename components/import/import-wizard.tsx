'use client'

import { useReducer, useCallback } from 'react'
import { SelectPlatform } from './steps/select-platform'
import { SelectEntity } from './steps/select-entity'
import { ChooseImportMode, type ImportMode } from './steps/choose-import-mode'
import { UploadCsv } from './steps/upload-csv'
import { ApiFetchPreview } from './steps/api-fetch-preview'
import { MapColumns } from './steps/map-columns'
import { PreviewValidate } from './steps/preview-validate'
import { ImportProgress } from './steps/import-progress'
import { ImportResults } from './steps/import-results'
import { useUploadImport, useValidateImport, useExecuteImport, useApiFetch } from '@/lib/queries/data-import'
import { useGhlConnection, useClioConnection } from '@/lib/queries/platform-connections'
import { useTenant } from '@/lib/hooks/use-tenant'
import type { SourcePlatform, ImportEntityType, DuplicateStrategy } from '@/lib/services/import/types'

// ─── State ───────────────────────────────────────────────────────────────────

type WizardStep = 'platform' | 'entity' | 'mode' | 'upload' | 'api-fetch' | 'map' | 'validate' | 'progress' | 'results'

interface WizardState {
  step: WizardStep
  platform: SourcePlatform | null
  entityType: ImportEntityType | null
  importMode: ImportMode | null
  batchId: string | null
  csvHeaders: string[]
  mapping: Record<string, string>
  previewRows: Record<string, string>[]
  totalRows: number
  // Validation results
  validRows: number
  invalidRows: number
  duplicateRows: number
  validationErrors: { rowNumber: number; field?: string; message: string }[]
  validationPreview: { rowNumber: number; data: Record<string, unknown>; isDuplicate: boolean }[]
  duplicateStrategy: DuplicateStrategy
  // Completed imports
  completedEntities: ImportEntityType[]
}

type WizardAction =
  | { type: 'SET_PLATFORM'; platform: SourcePlatform }
  | { type: 'SET_ENTITY'; entityType: ImportEntityType }
  | { type: 'SET_IMPORT_MODE'; mode: ImportMode }
  | { type: 'UPLOAD_SUCCESS'; batchId: string; headers: string[]; mapping: Record<string, string>; previewRows: Record<string, string>[]; totalRows: number }
  | { type: 'API_FETCH_SUCCESS'; batchId: string; headers: string[]; mapping: Record<string, string>; previewRows: Record<string, string>[]; totalRows: number }
  | { type: 'VALIDATE_SUCCESS'; validRows: number; invalidRows: number; duplicateRows: number; errors: { rowNumber: number; field?: string; message: string }[]; previewRows: { rowNumber: number; data: Record<string, unknown>; isDuplicate: boolean }[] }
  | { type: 'SET_MAPPING'; mapping: Record<string, string> }
  | { type: 'SET_DUPLICATE_STRATEGY'; strategy: DuplicateStrategy }
  | { type: 'EXECUTE_SUCCESS' }
  | { type: 'IMPORT_COMPLETE' }
  | { type: 'GO_TO_STEP'; step: WizardStep }
  | { type: 'IMPORT_ANOTHER' }
  | { type: 'RESET' }

const initialState: WizardState = {
  step: 'platform',
  platform: null,
  entityType: null,
  importMode: null,
  batchId: null,
  csvHeaders: [],
  mapping: {},
  previewRows: [],
  totalRows: 0,
  validRows: 0,
  invalidRows: 0,
  duplicateRows: 0,
  validationErrors: [],
  validationPreview: [],
  duplicateStrategy: 'skip',
  completedEntities: [],
}

function reducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'SET_PLATFORM':
      return { ...state, platform: action.platform, entityType: null, importMode: null }
    case 'SET_ENTITY':
      return { ...state, entityType: action.entityType }
    case 'SET_IMPORT_MODE':
      return { ...state, importMode: action.mode }
    case 'UPLOAD_SUCCESS':
      return {
        ...state,
        step: 'map',
        batchId: action.batchId,
        csvHeaders: action.headers,
        mapping: action.mapping,
        previewRows: action.previewRows,
        totalRows: action.totalRows,
      }
    case 'API_FETCH_SUCCESS':
      return {
        ...state,
        batchId: action.batchId,
        csvHeaders: action.headers,
        mapping: action.mapping,
        previewRows: action.previewRows,
        totalRows: action.totalRows,
      }
    case 'VALIDATE_SUCCESS':
      return {
        ...state,
        step: 'validate',
        validRows: action.validRows,
        invalidRows: action.invalidRows,
        duplicateRows: action.duplicateRows,
        validationErrors: action.errors,
        validationPreview: action.previewRows,
      }
    case 'SET_MAPPING':
      return { ...state, mapping: action.mapping }
    case 'SET_DUPLICATE_STRATEGY':
      return { ...state, duplicateStrategy: action.strategy }
    case 'EXECUTE_SUCCESS':
      return { ...state, step: 'progress' }
    case 'IMPORT_COMPLETE':
      return {
        ...state,
        step: 'results',
        completedEntities: state.entityType
          ? [...state.completedEntities, state.entityType]
          : state.completedEntities,
      }
    case 'GO_TO_STEP':
      return { ...state, step: action.step }
    case 'IMPORT_ANOTHER':
      return {
        ...state,
        step: 'entity',
        entityType: null,
        importMode: null,
        batchId: null,
        csvHeaders: [],
        mapping: {},
        previewRows: [],
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        duplicateRows: 0,
        validationErrors: [],
        validationPreview: [],
        duplicateStrategy: 'skip',
      }
    case 'RESET':
      return initialState
    default:
      return state
  }
}

// ─── Step labels ────────────────────────────────────────────────────────────

const CSV_STEPS: WizardStep[] = ['platform', 'entity', 'mode', 'upload', 'map', 'validate', 'progress', 'results']
const API_STEPS: WizardStep[] = ['platform', 'entity', 'mode', 'api-fetch', 'map', 'validate', 'progress', 'results']

const STEP_LABELS: Record<WizardStep, string> = {
  platform: 'Platform',
  entity: 'Entity',
  mode: 'Method',
  upload: 'Upload',
  'api-fetch': 'Fetch',
  map: 'Map',
  validate: 'Validate',
  progress: 'Import',
  results: 'Results',
}

// ─── Component ──────────────────────────────────────────────────────────────

interface ImportWizardProps {
  onDone: () => void
}

export function ImportWizard({ onDone }: ImportWizardProps) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const { tenant } = useTenant()
  const uploadMutation = useUploadImport()
  const validateMutation = useValidateImport()
  const executeMutation = useExecuteImport()
  const apiFetchMutation = useApiFetch()

  // Connection status
  const { data: ghlConnection } = useGhlConnection(tenant?.id ?? '')
  const { data: clioConnection } = useClioConnection(tenant?.id ?? '')

  const isConnected = state.platform === 'ghl'
    ? !!ghlConnection?.isActive
    : state.platform === 'clio'
      ? !!clioConnection?.isActive
      : false

  const steps = state.importMode === 'api' ? API_STEPS : CSV_STEPS
  const currentStepIndex = steps.indexOf(state.step)

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleUpload = useCallback(
    async (file: File) => {
      if (!state.platform || !state.entityType) return
      const result = await uploadMutation.mutateAsync({
        file,
        platform: state.platform,
        entityType: state.entityType,
      })
      dispatch({
        type: 'UPLOAD_SUCCESS',
        batchId: result.batchId,
        headers: result.detectedHeaders,
        mapping: result.suggestedMapping,
        previewRows: result.previewRows,
        totalRows: result.totalRows,
      })
    },
    [state.platform, state.entityType, uploadMutation],
  )

  const handleApiFetch = useCallback(async () => {
    if (!state.platform || !state.entityType) return
    if (state.platform === 'officio') return
    const result = await apiFetchMutation.mutateAsync({
      platform: state.platform as 'ghl' | 'clio',
      entityType: state.entityType,
    })
    dispatch({
      type: 'API_FETCH_SUCCESS',
      batchId: result.batchId,
      headers: result.detectedHeaders,
      mapping: result.suggestedMapping,
      previewRows: result.previewRows,
      totalRows: result.totalRows,
    })
  }, [state.platform, state.entityType, apiFetchMutation])

  const handleValidate = useCallback(async () => {
    if (!state.batchId) return
    const result = await validateMutation.mutateAsync({
      batchId: state.batchId,
      columnMapping: state.mapping,
    })
    dispatch({
      type: 'VALIDATE_SUCCESS',
      validRows: result.validRows,
      invalidRows: result.invalidRows,
      duplicateRows: result.duplicateRows,
      errors: result.errors,
      previewRows: result.previewRows,
    })
  }, [state.batchId, state.mapping, validateMutation])

  const handleExecute = useCallback(async () => {
    if (!state.batchId) return
    await executeMutation.mutateAsync({
      batchId: state.batchId,
      duplicateStrategy: state.duplicateStrategy,
    })
    dispatch({ type: 'EXECUTE_SUCCESS' })
  }, [state.batchId, state.duplicateStrategy, executeMutation])

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-1">
        {steps.map((step, i) => {
          const isCurrent = state.step === step
          const isCompleted = currentStepIndex > i

          return (
            <div key={step} className="flex items-center gap-1">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-medium ${
                  isCurrent
                    ? 'bg-primary text-white'
                    : isCompleted
                      ? 'bg-primary/20 text-primary'
                      : 'bg-slate-100 text-slate-400'
                }`}
              >
                {i + 1}
              </div>
              <span
                className={`text-[10px] hidden sm:inline ${
                  isCurrent ? 'text-slate-900 font-medium' : 'text-slate-400'
                }`}
              >
                {STEP_LABELS[step]}
              </span>
              {i < steps.length - 1 && (
                <div className="w-4 h-px bg-slate-200 mx-0.5" />
              )}
            </div>
          )
        })}
      </div>

      {/* Step content */}
      {state.step === 'platform' && (
        <SelectPlatform
          selected={state.platform}
          onSelect={(p) => dispatch({ type: 'SET_PLATFORM', platform: p })}
          onNext={() => dispatch({ type: 'GO_TO_STEP', step: 'entity' })}
        />
      )}

      {state.step === 'entity' && state.platform && (
        <SelectEntity
          platform={state.platform}
          selected={state.entityType}
          completedEntities={state.completedEntities}
          onSelect={(e) => dispatch({ type: 'SET_ENTITY', entityType: e })}
          onNext={() => dispatch({ type: 'GO_TO_STEP', step: 'mode' })}
          onBack={() => dispatch({ type: 'GO_TO_STEP', step: 'platform' })}
        />
      )}

      {state.step === 'mode' && state.platform && (
        <ChooseImportMode
          platform={state.platform}
          isConnected={isConnected}
          selected={state.importMode}
          onSelect={(mode) => dispatch({ type: 'SET_IMPORT_MODE', mode })}
          onNext={() => {
            if (state.importMode === 'api') {
              dispatch({ type: 'GO_TO_STEP', step: 'api-fetch' })
            } else {
              dispatch({ type: 'GO_TO_STEP', step: 'upload' })
            }
          }}
          onBack={() => dispatch({ type: 'GO_TO_STEP', step: 'entity' })}
        />
      )}

      {state.step === 'upload' && (
        <UploadCsv
          onUpload={handleUpload}
          isUploading={uploadMutation.isPending}
          onBack={() => dispatch({ type: 'GO_TO_STEP', step: 'mode' })}
        />
      )}

      {state.step === 'api-fetch' && state.platform && state.entityType && (
        <ApiFetchPreview
          platform={state.platform}
          entityType={state.entityType}
          totalRows={state.totalRows}
          previewRows={state.previewRows}
          isFetching={apiFetchMutation.isPending}
          onFetch={handleApiFetch}
          onNext={() => dispatch({ type: 'GO_TO_STEP', step: 'map' })}
          onBack={() => dispatch({ type: 'GO_TO_STEP', step: 'mode' })}
        />
      )}

      {state.step === 'map' && state.platform && state.entityType && (
        <MapColumns
          platform={state.platform}
          entityType={state.entityType}
          csvHeaders={state.csvHeaders}
          mapping={state.mapping}
          previewRows={state.previewRows}
          onMappingChange={(m) => dispatch({ type: 'SET_MAPPING', mapping: m })}
          onValidate={handleValidate}
          isValidating={validateMutation.isPending}
          onBack={() => dispatch({ type: 'GO_TO_STEP', step: state.importMode === 'api' ? 'api-fetch' : 'upload' })}
        />
      )}

      {state.step === 'validate' && (
        <PreviewValidate
          totalRows={state.totalRows}
          validRows={state.validRows}
          invalidRows={state.invalidRows}
          duplicateRows={state.duplicateRows}
          errors={state.validationErrors}
          previewRows={state.validationPreview}
          duplicateStrategy={state.duplicateStrategy}
          onDuplicateStrategyChange={(s) => dispatch({ type: 'SET_DUPLICATE_STRATEGY', strategy: s })}
          onExecute={handleExecute}
          isExecuting={executeMutation.isPending}
          onBack={() => dispatch({ type: 'GO_TO_STEP', step: 'map' })}
        />
      )}

      {state.step === 'progress' && state.batchId && (
        <ImportProgress
          batchId={state.batchId}
          onComplete={() => dispatch({ type: 'IMPORT_COMPLETE' })}
        />
      )}

      {state.step === 'results' && state.batchId && (
        <ImportResults
          batchId={state.batchId}
          onImportAnother={() => dispatch({ type: 'IMPORT_ANOTHER' })}
          onDone={onDone}
        />
      )}
    </div>
  )
}
