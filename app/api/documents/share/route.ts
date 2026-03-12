import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * PATCH /api/documents/share
 *
 * Toggle is_shared_with_client on a document.
 * Optionally update display_name and category for client-facing presentation.
 */
export async function PATCH(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { document_id, share, display_name, category, description } = body as {
      document_id?: string
      share?: boolean
      display_name?: string
      category?: string
      description?: string
    }

    if (!document_id || typeof share !== 'boolean') {
      return NextResponse.json(
        { error: 'document_id and share (boolean) are required' },
        { status: 400 }
      )
    }

    // Build update payload
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: Record<string, any> = {
      is_shared_with_client: share,
    }

    if (share) {
      updateData.shared_at = new Date().toISOString()
      updateData.shared_by = user.id
    } else {
      updateData.shared_at = null
      updateData.shared_by = null
      updateData.client_viewed_at = null
    }

    if (display_name) {
      updateData.file_name = display_name
    }
    if (category !== undefined) {
      updateData.category = category
    }
    if (description !== undefined) {
      updateData.description = description
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('documents')
      .update(updateData)
      .eq('id', document_id)
      .select('id, file_name, category, description, is_shared_with_client, shared_at')
      .single()

    if (error) throw error

    return NextResponse.json({ document: data })
  } catch (err) {
    console.error('[Documents Share] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
