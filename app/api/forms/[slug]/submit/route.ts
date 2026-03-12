import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { evaluateCondition } from '@/lib/utils/condition-evaluator'
import type { IntakeField, IntakeFormSettings, FieldCondition } from '@/lib/types/intake-field'
import { withTiming } from '@/lib/middleware/request-timing'

async function handlePost(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const admin = createAdminClient()

    // 1. Look up the form
    const { data: form, error: formError } = await admin
      .from('intake_forms')
      .select('*')
      .eq('slug', slug)
      .eq('status', 'published')
      .eq('is_active', true)
      .single()

    if (formError || !form) {
      return NextResponse.json(
        { success: false, error: 'Form not found or not published' },
        { status: 404 }
      )
    }

    // 2. Parse request body (JSON or FormData)
    const contentType = request.headers.get('content-type') ?? ''
    let data: Record<string, unknown>
    let utm_source: string | undefined
    let utm_medium: string | undefined
    let utm_campaign: string | undefined
    const fileEntries: { fieldId: string; file: File }[] = []

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const rawData = formData.get('data')
      data = rawData ? JSON.parse(String(rawData)) : {}
      utm_source = formData.get('utm_source')?.toString() || undefined
      utm_medium = formData.get('utm_medium')?.toString() || undefined
      utm_campaign = formData.get('utm_campaign')?.toString() || undefined

      // Collect file entries
      for (const [key, value] of formData.entries()) {
        if (key.startsWith('file_') && value instanceof File) {
          const fieldId = key.replace('file_', '')
          fileEntries.push({ fieldId, file: value })
        }
      }
    } else {
      const body = await request.json()
      data = body.data as Record<string, unknown>
      utm_source = body.utm_source
      utm_medium = body.utm_medium
      utm_campaign = body.utm_campaign
    }

    if (!data || typeof data !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Invalid submission data' },
        { status: 400 }
      )
    }

    // 3. Validate required fields (skip conditionally hidden ones)
    const fields = (Array.isArray(form.fields) ? form.fields : []) as unknown as IntakeField[]
    const settings = (form.settings && typeof form.settings === 'object'
      ? form.settings
      : {}) as IntakeFormSettings
    const sections = settings.sections ?? []
    const validationErrors: string[] = []

    // Build a set of hidden section IDs
    const hiddenSectionIds = new Set<string>()
    for (const section of sections) {
      if (section.condition && !evaluateCondition(section.condition, data)) {
        hiddenSectionIds.add(section.id)
      }
    }

    for (const field of fields) {
      // Skip fields in hidden sections
      if (field.section_id && hiddenSectionIds.has(field.section_id)) continue
      // Skip fields whose own condition is not met
      if (field.condition && !evaluateCondition(field.condition, data)) continue

      if (field.is_required) {
        if (field.field_type === 'file') {
          const hasFile = fileEntries.some((fe) => fe.fieldId === field.id)
          if (!hasFile) {
            validationErrors.push(`${field.label} is required`)
          }
        } else {
          const val = data[field.id]
          if (val === undefined || val === null || (typeof val === 'string' && !val.trim())) {
            validationErrors.push(`${field.label} is required`)
          }
        }
      }
    }

    if (validationErrors.length > 0) {
      return NextResponse.json(
        { success: false, error: validationErrors.join(', ') },
        { status: 400 }
      )
    }

    // 4. Upload files to Supabase Storage
    for (const { fieldId, file } of fileEntries) {
      const ext = file.name.split('.').pop() ?? 'bin'
      const filePath = `${form.tenant_id}/intake/${Date.now()}-${Math.random().toString(36).substring(2)}.${ext}`

      const { error: uploadError } = await admin.storage
        .from('documents')
        .upload(filePath, file, {
          contentType: file.type,
          upsert: false,
        })

      if (uploadError) {
        console.error('File upload error:', uploadError)
        return NextResponse.json(
          { success: false, error: `Failed to upload ${file.name}` },
          { status: 500 }
        )
      }

      // Get public URL
      const { data: urlData } = admin.storage
        .from('documents')
        .getPublicUrl(filePath)

      // Store the URL in data so it's recorded in the submission
      data[fieldId] = urlData.publicUrl
    }

    // 5. Extract mapped contact fields
    const contactData: Record<string, string | null> = {}

    for (const field of fields) {
      if (field.mapping && field.field_type !== 'file') {
        const val = data[field.id]
        if (val !== undefined && val !== null) {
          // Handle "Other" select values
          if (typeof val === 'object' && !Array.isArray(val)) {
            const obj = val as { selected?: string; custom?: string }
            if (obj.selected === '__other__' && obj.custom) {
              contactData[field.mapping] = obj.custom
            } else if (obj.selected) {
              // Find the label for the selected option
              const opt = field.options?.find((o) => o.value === obj.selected)
              contactData[field.mapping] = opt?.label ?? obj.selected
            }
          } else {
            contactData[field.mapping] = String(val)
          }
        }
      }
    }

    // 6. Smart contact creation — detect duplicates by email
    let contactId: string
    let isReturningClient = false
    const submittedEmail = contactData.email_primary?.trim().toLowerCase()

    if (submittedEmail) {
      // Check if a contact with this email already exists in the tenant
      const { data: existingContact } = await admin
        .from('contacts')
        .select('id, first_name, last_name, phone_primary, notes')
        .eq('tenant_id', form.tenant_id)
        .eq('email_primary', submittedEmail)
        .eq('is_archived', false)
        .limit(1)
        .maybeSingle()

      if (existingContact) {
        // Returning client — link to existing contact and enrich with new data
        contactId = existingContact.id
        isReturningClient = true

        // Update contact with any newly provided info that was previously missing
        const updates: Record<string, string | null> = {}
        if (!existingContact.first_name && contactData.first_name) updates.first_name = contactData.first_name
        if (!existingContact.last_name && contactData.last_name) updates.last_name = contactData.last_name
        if (!existingContact.phone_primary && contactData.phone_primary) updates.phone_primary = contactData.phone_primary
        if (contactData.notes) {
          // Append notes rather than overwrite
          const existingNotes = existingContact.notes ?? ''
          const separator = existingNotes ? '\n---\n' : ''
          updates.notes = `${existingNotes}${separator}[Intake ${new Date().toLocaleDateString()}] ${contactData.notes}`
        }

        if (Object.keys(updates).length > 0) {
          await admin
            .from('contacts')
            .update(updates)
            .eq('id', contactId)
        }
      } else {
        // New client — create contact
        const { data: newContact, error: contactError } = await admin
          .from('contacts')
          .insert({
            tenant_id: form.tenant_id,
            first_name: contactData.first_name || null,
            last_name: contactData.last_name || null,
            email_primary: submittedEmail,
            phone_primary: contactData.phone_primary || null,
            notes: contactData.notes || null,
            contact_type: 'individual',
            source: 'intake_form',
          })
          .select('id')
          .single()

        if (contactError || !newContact) {
          console.error('Failed to create contact:', contactError)
          return NextResponse.json(
            { success: false, error: 'Failed to process submission' },
            { status: 500 }
          )
        }
        contactId = newContact.id
      }
    } else {
      // No email provided — always create a new contact
      const { data: newContact, error: contactError } = await admin
        .from('contacts')
        .insert({
          tenant_id: form.tenant_id,
          first_name: contactData.first_name || null,
          last_name: contactData.last_name || null,
          email_primary: null,
          phone_primary: contactData.phone_primary || null,
          notes: contactData.notes || null,
          contact_type: 'individual',
          source: 'intake_form',
        })
        .select('id')
        .single()

      if (contactError || !newContact) {
        console.error('Failed to create contact:', contactError)
        return NextResponse.json(
          { success: false, error: 'Failed to process submission' },
          { status: 500 }
        )
      }
      contactId = newContact.id
    }

    // Store returning client flag in submission metadata
    if (isReturningClient) {
      data._meta = { is_returning_client: true }
    }

    // 7. Link uploaded files as documents for the contact
    for (const { fieldId, file } of fileEntries) {
      const fileUrl = data[fieldId]
      if (typeof fileUrl === 'string') {
        // Extract the storage path from the URL
        const pathMatch = fileUrl.match(/\/documents\/(.+)$/)
        const storagePath = pathMatch ? pathMatch[1] : null

        await admin.from('documents').insert({
          tenant_id: form.tenant_id,
          entity_type: 'contact',
          entity_id: contactId,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type || 'application/octet-stream',
          storage_path: storagePath ?? fileUrl,
          uploaded_by: null,
        })
      }
    }

    // 8. Create lead if pipeline is configured
    let leadId: string | null = null

    if (form.pipeline_id) {
      // Get the stage — use configured stage or first stage in pipeline
      let stageId = form.stage_id as string | null

      if (!stageId) {
        const { data: firstStage } = await admin
          .from('pipeline_stages')
          .select('id')
          .eq('pipeline_id', form.pipeline_id)
          .order('sort_order', { ascending: true })
          .limit(1)
          .single()

        stageId = firstStage?.id ?? null
      }

      if (stageId) {
        const leadInsert = {
          tenant_id: form.tenant_id,
          contact_id: contactId,
          pipeline_id: form.pipeline_id as string,
          stage_id: stageId,
          source: 'intake_form' as const,
          source_detail: form.name,
          utm_source: utm_source ?? null,
          utm_medium: utm_medium ?? null,
          utm_campaign: utm_campaign ?? null,
          status: 'open' as const,
          assigned_to: settings.auto_assign_to ?? null,
        }

        const { data: lead, error: leadError } = await admin
          .from('leads')
          .insert(leadInsert)
          .select('id')
          .single()

        if (lead) leadId = lead.id
        if (leadError) console.error('Failed to create lead:', leadError)
      }
    }

    // 9. Insert submission record
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
    const userAgent = request.headers.get('user-agent') ?? null

    const { error: subError } = await admin
      .from('intake_submissions')
      .insert({
        tenant_id: form.tenant_id,
        form_id: form.id,
        data: data as any,
        contact_id: contactId,
        lead_id: leadId,
        source_ip: ip,
        user_agent: userAgent,
        utm_source: utm_source ?? null,
        utm_medium: utm_medium ?? null,
        utm_campaign: utm_campaign ?? null,
        status: 'processed',
        processed_at: new Date().toISOString(),
      })

    if (subError) {
      console.error('Failed to record submission:', subError)
    }

    // 10. Log activity on the contact
    const activityTitle = isReturningClient
      ? `Returning client submitted intake form: ${form.name}`
      : `Submitted intake form: ${form.name}`

    await admin.from('activities').insert({
      tenant_id: form.tenant_id,
      activity_type: 'form_submission',
      title: activityTitle,
      description: `${isReturningClient ? 'Returning client' : 'New'} submission via public form "${form.name}"`,
      entity_type: 'contact',
      entity_id: contactId,
      engagement_points: isReturningClient ? 15 : 10,
      metadata: {
        form_id: form.id,
        form_slug: form.slug,
        lead_id: leadId,
        is_returning_client: isReturningClient,
      } as any,
    })

    // 11. Create notification activity for assigned user or form creator
    const notifyUserId = settings.auto_assign_to || form.created_by
    if (notifyUserId) {
      const submitterName = [contactData.first_name, contactData.last_name]
        .filter(Boolean)
        .join(' ') || submittedEmail || 'Someone'

      const { error: notifyError } = await admin.from('activities').insert({
        tenant_id: form.tenant_id,
        activity_type: 'notification',
        title: `New intake form submission`,
        description: `${submitterName} submitted "${form.name}"${isReturningClient ? ' (returning client)' : ''}`,
        entity_type: 'contact',
        entity_id: contactId,
        user_id: notifyUserId,
        metadata: {
          form_id: form.id,
          form_slug: form.slug,
          contact_id: contactId,
          lead_id: leadId,
          notify_email: settings.notify_email,
        } as any,
      })
      if (notifyError) {
        // Non-fatal — don't fail the submission if notification fails
        console.error('Failed to create notification activity:', notifyError)
      }
    }

    return NextResponse.json(
      { success: true, contact_id: contactId, lead_id: leadId, is_returning_client: isReturningClient },
      { status: 201 }
    )
  } catch (error) {
    console.error('Form submission error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/forms/[slug]/submit')
