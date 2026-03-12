/**
 * Zod schemas for data import API routes.
 */

import { z } from 'zod'

export const sourcePlatformSchema = z.enum(['ghl', 'clio', 'officio'])

export const importEntityTypeSchema = z.enum([
  'contacts',
  'leads',
  'matters',
  'tasks',
  'notes',
  'documents',
  'time_entries',
  'pipeline_stages',
  'calendar_events',
  'conversations',
  'tags',
  'custom_fields',
  'invoices',
  'companies',
  'forms',
  'payments',
  'surveys',
  'users',
])

export const duplicateStrategySchema = z.enum(['skip', 'update', 'create_new'])

export const uploadImportSchema = z.object({
  platform: sourcePlatformSchema,
  entityType: importEntityTypeSchema,
})

export const validateImportSchema = z.object({
  batchId: z.string().uuid('Invalid batch ID'),
  columnMapping: z.record(z.string(), z.string()),
})

export const executeImportSchema = z.object({
  batchId: z.string().uuid('Invalid batch ID'),
  duplicateStrategy: duplicateStrategySchema.default('skip'),
})

export const rollbackImportSchema = z.object({
  batchId: z.string().uuid('Invalid batch ID'),
})

export const apiFetchSchema = z.object({
  platform: z.enum(['ghl', 'clio']),
  entityType: importEntityTypeSchema,
})

export type UploadImportInput = z.infer<typeof uploadImportSchema>
export type ValidateImportInput = z.infer<typeof validateImportSchema>
export type ExecuteImportInput = z.infer<typeof executeImportSchema>
export type ApiFetchInput = z.infer<typeof apiFetchSchema>
