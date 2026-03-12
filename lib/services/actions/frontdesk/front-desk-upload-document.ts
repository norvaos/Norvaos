import type { ActionDefinition } from '../types'
import { assertNoError, assertOk } from '../db-assert'
import { frontDeskUploadDocumentSchema, type FrontDeskUploadDocumentInput } from '@/lib/schemas/workflow-actions'

interface FrontDeskUploadDocumentResult {
  documentId: string
  fileName: string
  documentType: string
}

export const frontDeskUploadDocumentAction: ActionDefinition<FrontDeskUploadDocumentInput, FrontDeskUploadDocumentResult> = {
  type: 'front_desk_upload_document',
  label: 'Upload Document (Front Desk)',
  inputSchema: frontDeskUploadDocumentSchema,
  permission: { entity: 'documents', action: 'create' },
  allowedSources: ['front_desk'],
  entityType: 'document',
  getEntityId: () => 'new',

  async execute({ input, tenantId, userId, supabase }) {
    if (!userId) throw new Error('User authentication required')

    // 1. Insert into documents table
    const document = assertOk(
      await supabase
        .from('documents')
        .insert({
          tenant_id: tenantId,
          contact_id: input.contactId,
          file_name: input.fileName,
          category: input.documentType,
          storage_path: input.storagePath,
          file_size: input.fileSize ?? null,
          uploaded_by: userId,
          matter_id: input.matterId ?? null,
        })
        .select('id')
        .single(),
      'front_desk_upload_document:insert_document'
    )

    return {
      data: {
        documentId: document!.id,
        fileName: input.fileName,
        documentType: input.documentType,
      },
      newState: {
        document_id: document!.id,
        file_name: input.fileName,
        document_type: input.documentType,
        contact_id: input.contactId,
      },
      activity: {
        activityType: 'document_uploaded_front_desk',
        title: `Document uploaded: ${input.documentType}`,
        metadata: {
          document_id: document!.id,
          file_name: input.fileName,
          document_type: input.documentType,
          file_size: input.fileSize,
          matter_id: input.matterId,
        },
        contactId: input.contactId,
      },
    }
  },
}
