/**
 * POST /api/documents/classify — Classify a document by filename + optional text
 *
 * Used by the import bridge and delta-sync to auto-tag documents.
 * Also available for on-demand reclassification from the UI.
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { classifyDocument } from '@/lib/services/document-classifier'

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    const admin = createAdminClient()

    const body = await request.json()
    const { documentId, fileName, firstPageText } = body as {
      documentId?: string
      fileName: string
      firstPageText?: string
    }

    if (!fileName) {
      return NextResponse.json(
        { success: false, error: 'fileName is required' },
        { status: 400 },
      )
    }

    const result = await classifyDocument(fileName, firstPageText)

    // If a documentId was provided, update the document record
    if (documentId) {
      await admin
        .from('documents')
        .update({
          category: result.category,
          status: 'classified',
          metadata: {
            classification: {
              category: result.category,
              type: result.type,
              confidence: result.confidence,
              method: result.method,
              suggestedName: result.suggestedName,
              classified_at: new Date().toISOString(),
            },
          },
        })
        .eq('id', documentId)
        .eq('tenant_id', auth.tenantId)
    }

    return NextResponse.json({
      success: true,
      classification: result,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
