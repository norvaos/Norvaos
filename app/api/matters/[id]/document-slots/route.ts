import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import {
  regenerateDocumentSlots,
} from '@/lib/services/document-slot-engine'
import { regenerateFormInstances } from '@/lib/services/form-instance-engine'
import { invalidateGating } from '@/lib/services/cache-invalidation'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * GET /api/matters/[id]/document-slots
 *
 * Returns all document slots for a matter with current document info.
 * Filters by is_active = true by default.
 */
async function handleGet(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: matterId } = await params
    const auth = await authenticateRequest()
    requirePermission(auth, 'documents', 'view')

    // Verify matter belongs to tenant
    const { data: matter, error: matterErr } = await auth.supabase
      .from('matters')
      .select('id, tenant_id')
      .eq('id', matterId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (matterErr || !matter) {
      return NextResponse.json(
        { error: 'Matter not found or access denied' },
        { status: 404 }
      )
    }

    // Fetch active document slots with current document info
    const { data: slots, error: slotsErr } = await auth.supabase
      .from('document_slots')
      .select(`
        *,
        current_document:documents!document_slots_current_document_id_fkey (
          id,
          file_name,
          file_type,
          file_size,
          storage_path,
          created_at
        )
      `)
      .eq('matter_id', matterId)
      .eq('is_active', true)
      .order('sort_order')
      .order('slot_name')

    if (slotsErr) {
      return NextResponse.json(
        { error: 'Failed to fetch document slots', details: slotsErr.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ slots: slots ?? [] })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      )
    }
    console.error('Document slots fetch error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/matters/[id]/document-slots
 *
 * Triggers regeneration of document slots for the matter.
 * Deterministically recomputes the full slot set from current Core Data.
 */
async function handlePost(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: matterId } = await params
    const auth = await authenticateRequest()
    requirePermission(auth, 'matters', 'edit')

    // Fetch matter with type info
    const { data: matter, error: matterErr } = await auth.supabase
      .from('matters')
      .select('id, tenant_id, matter_type_id')
      .eq('id', matterId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (matterErr || !matter) {
      return NextResponse.json(
        { error: 'Matter not found or access denied' },
        { status: 404 }
      )
    }

    // Determine scope — check for case_type_id from matter_immigration
    let caseTypeId: string | null = null
    if (!matter.matter_type_id) {
      const { data: immData } = await auth.supabase
        .from('matter_immigration')
        .select('case_type_id')
        .eq('matter_id', matterId)
        .maybeSingle()

      caseTypeId = immData?.case_type_id ?? null
    }

    const result = await regenerateDocumentSlots({
      supabase: auth.supabase,
      tenantId: auth.tenantId,
      matterId,
      matterTypeId: matter.matter_type_id,
      caseTypeId,
    })

    // Also regenerate form instances
    const formResult = await regenerateFormInstances({
      supabase: auth.supabase,
      tenantId: auth.tenantId,
      matterId,
      matterTypeId: matter.matter_type_id,
      caseTypeId,
    })

    await invalidateGating(auth.tenantId, matterId)

    return NextResponse.json({
      success: true,
      added: result.added.length,
      removed: result.removed.length,
      reactivated: result.reactivated.length,
      unchanged: result.unchanged,
      details: result,
      formInstances: formResult,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      )
    }
    console.error('Document slot regeneration error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/matters/[id]/document-slots
 *
 * Creates a custom (ad-hoc) document slot on a matter.
 * Used from the Send Document Request dialog for matter-specific documents.
 *
 * Body: { slot_name: string }
 */
async function handlePut(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: matterId } = await params
    const auth = await authenticateRequest()
    requirePermission(auth, 'documents', 'edit')

    // Parse and validate body
    const body = await request.json()
    const slotName = ((body.slot_name as string) ?? '').trim()
    const forcedSlug = ((body.slot_slug as string) ?? '').trim() || null

    if (!slotName || slotName.length > 120) {
      return NextResponse.json(
        { error: 'slot_name is required (max 120 characters)' },
        { status: 400 }
      )
    }

    // Verify matter belongs to tenant
    const { data: matter, error: matterErr } = await auth.supabase
      .from('matters')
      .select('id, tenant_id')
      .eq('id', matterId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (matterErr || !matter) {
      return NextResponse.json(
        { error: 'Matter not found or access denied' },
        { status: 404 }
      )
    }

    // Use forced slug (from playbook) if provided, otherwise auto-generate a unique one
    let slug: string
    if (forcedSlug) {
      slug = forcedSlug
    } else {
      const baseSlug = slotName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
        || 'custom'

      const { data: existingSlugs } = await auth.supabase
        .from('document_slots')
        .select('slot_slug')
        .eq('matter_id', matterId)
        .eq('is_active', true)

      const taken = new Set((existingSlugs ?? []).map((s) => s.slot_slug))
      slug = baseSlug
      let i = 2
      while (taken.has(slug)) {
        slug = `${baseSlug}_${i}`
        i++
      }
    }

    // Determine next sort_order
    const { data: maxSort } = await auth.supabase
      .from('document_slots')
      .select('sort_order')
      .eq('matter_id', matterId)
      .eq('is_active', true)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle()

    const nextSortOrder = (maxSort?.sort_order ?? 0) + 1

    // Insert custom slot
    const { data: newSlot, error: insertErr } = await auth.supabase
      .from('document_slots')
      .insert({
        tenant_id: auth.tenantId,
        matter_id: matterId,
        slot_name: slotName,
        slot_slug: slug,
        slot_template_id: null,
        category: 'custom',
        person_id: null,
        person_role: null,
        is_required: true,
        is_active: true,
        status: 'empty',
        sort_order: nextSortOrder,
        accepted_file_types: ['application/pdf', 'image/jpeg', 'image/png'],
        max_file_size_bytes: 20_971_520, // 20 MB
      })
      .select('*')
      .single()

    if (insertErr || !newSlot) {
      console.error('Custom slot insert error:', insertErr)
      return NextResponse.json(
        { error: 'Failed to create custom document slot' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, slot: newSlot }, { status: 201 })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      )
    }
    console.error('Custom document slot creation error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/matters/[id]/document-slots
 *
 * Instantiates a specific document_slot_template as a document_slot on the matter.
 * If the slot already exists but is soft-deactivated, it is reactivated.
 *
 * Body: { slot_template_id: string, person_id?: string | null }
 */
async function handlePatch(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: matterId } = await params
    const auth = await authenticateRequest()
    requirePermission(auth, 'documents', 'edit')

    const body = await request.json()
    const slotTemplateId = ((body.slot_template_id as string) ?? '').trim()
    const personId: string | null = body.person_id ?? null

    if (!slotTemplateId) {
      return NextResponse.json(
        { error: 'slot_template_id is required' },
        { status: 400 }
      )
    }

    // Verify matter belongs to tenant
    const { data: matter, error: matterErr } = await auth.supabase
      .from('matters')
      .select('id, tenant_id')
      .eq('id', matterId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (matterErr || !matter) {
      return NextResponse.json(
        { error: 'Matter not found or access denied' },
        { status: 404 }
      )
    }

    // Fetch the template (must belong to same tenant)
    const { data: template, error: tplErr } = await auth.supabase
      .from('document_slot_templates')
      .select('*')
      .eq('id', slotTemplateId)
      .eq('tenant_id', auth.tenantId)
      .eq('is_active', true)
      .single()

    if (tplErr || !template) {
      return NextResponse.json(
        { error: 'Document template not found' },
        { status: 404 }
      )
    }

    // Check if already instantiated for this (matter, template, person) combination
    const existingQuery = auth.supabase
      .from('document_slots')
      .select('id, is_active')
      .eq('matter_id', matterId)
      .eq('slot_template_id', slotTemplateId)

    const existingResult = personId
      ? await existingQuery.eq('person_id', personId).maybeSingle()
      : await existingQuery.is('person_id', null).maybeSingle()

    const existing = existingResult.data

    if (existing) {
      if (existing.is_active) {
        return NextResponse.json(
          { error: 'This document slot already exists on the matter' },
          { status: 409 }
        )
      }
      // Reactivate a previously soft-deleted slot
      const { data: reactivated, error: reactErr } = await auth.supabase
        .from('document_slots')
        .update({ is_active: true, deactivated_at: null, status: 'empty' })
        .eq('id', existing.id)
        .select('*')
        .single()

      if (reactErr || !reactivated) {
        return NextResponse.json({ error: 'Failed to reactivate slot' }, { status: 500 })
      }
      return NextResponse.json({ success: true, slot: reactivated }, { status: 200 })
    }

    // Determine next sort_order
    const { data: maxSort } = await auth.supabase
      .from('document_slots')
      .select('sort_order')
      .eq('matter_id', matterId)
      .eq('is_active', true)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle()

    const nextSortOrder = (maxSort?.sort_order ?? 0) + 1

    // Insert the new slot from template data
    const { data: newSlot, error: insertErr } = await auth.supabase
      .from('document_slots')
      .insert({
        tenant_id: auth.tenantId,
        matter_id: matterId,
        slot_template_id: slotTemplateId,
        person_id: personId,
        slot_name: template.slot_name,
        slot_slug: template.slot_slug,
        description: template.description,
        category: template.category,
        person_role: template.person_role_scope,
        is_required: template.is_required,
        is_active: true,
        status: 'empty',
        sort_order: nextSortOrder,
        accepted_file_types: template.accepted_file_types,
        max_file_size_bytes: template.max_file_size_bytes,
      })
      .select('*')
      .single()

    if (insertErr || !newSlot) {
      console.error('Template slot instantiation error:', insertErr)
      return NextResponse.json(
        { error: 'Failed to create document slot from template' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, slot: newSlot }, { status: 201 })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('Template slot instantiation error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/matters/[id]/document-slots?slot_id=<uuid>
 *
 * Soft-deletes a document slot (sets is_active = false).
 */
async function handleDelete(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: matterId } = await params
    const auth = await authenticateRequest()
    requirePermission(auth, 'documents', 'edit')

    const slotId = new URL(request.url).searchParams.get('slot_id')
    if (!slotId) {
      return NextResponse.json({ error: 'slot_id is required' }, { status: 400 })
    }

    const { error } = await auth.supabase
      .from('document_slots')
      .update({ is_active: false })
      .eq('id', slotId)
      .eq('matter_id', matterId)
      .eq('tenant_id', auth.tenantId)

    if (error) {
      return NextResponse.json({ error: 'Failed to remove document slot' }, { status: 500 })
    }

    await invalidateGating(auth.tenantId, matterId)
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/matters/[id]/document-slots')
export const POST = withTiming(handlePost, 'POST /api/matters/[id]/document-slots')
export const PUT = withTiming(handlePut, 'PUT /api/matters/[id]/document-slots')
export const PATCH = withTiming(handlePatch, 'PATCH /api/matters/[id]/document-slots')
export const DELETE = withTiming(handleDelete, 'DELETE /api/matters/[id]/document-slots')
