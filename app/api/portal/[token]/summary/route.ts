import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRateLimiter } from '@/lib/middleware/rate-limit'
import type {
  PortalNextAction,
  PortalSectionCounts,
  PortalSummaryResponse,
} from '@/lib/types/portal'
import { validatePortalToken, PortalAuthError } from '@/lib/services/portal-auth'

const rateLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30 })

// ── GET /api/portal/[token]/summary ──────────────────────────────────────────

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    const { allowed, retryAfterMs } = rateLimiter.check(ip)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } },
      )
    }

    const { token } = await params

    let link: Awaited<ReturnType<typeof validatePortalToken>>
    try {
      link = await validatePortalToken(token)
    } catch (error) {
      if (error instanceof PortalAuthError) {
        return NextResponse.json({ error: error.message }, { status: error.status })
      }
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any

    // Fetch client_read_at (not included in shared PortalLink type)
    const { data: linkExtra } = await admin
      .from('portal_links')
      .select('client_read_at')
      .eq('id', link.id)
      .single()

    const clientReadAtRaw = linkExtra?.client_read_at ?? null

    const now = new Date()
    const matterId = link.matter_id

    // ── Fetch matter info ─────────────────────────────────────────────────

    const { data: matter } = await admin
      .from('matters')
      .select('id, title, matter_number, status, matter_type_id')
      .eq('id', matterId)
      .single()

    if (!matter) {
      return NextResponse.json({ error: 'Matter not found' }, { status: 404 })
    }

    // Fetch matter type name
    let matterTypeName = ''
    if (matter.matter_type_id) {
      const { data: mt } = await admin
        .from('matter_types')
        .select('name')
        .eq('id', matter.matter_type_id)
        .single()
      matterTypeName = mt?.name ?? ''
    }

    // ── Fetch document slots ──────────────────────────────────────────────

    const { data: slots } = await admin
      .from('document_slots')
      .select('id, status, is_required, is_active')
      .eq('matter_id', matterId)
      .eq('is_active', true)

    let allSlots: Array<{ id: string; status: string; is_required: boolean; is_active: boolean }> = slots ?? []

    // Filter by document_requests: only count slots that were explicitly requested
    // (or have uploads). If no requests exist yet, count all active slots.
    const { data: docRequests } = await admin
      .from('document_requests')
      .select('slot_ids')
      .eq('matter_id', matterId)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (docRequests && (docRequests as any[]).length > 0) {
      const requestedIds = new Set<string>()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const req of docRequests as any[]) {
        const ids = req.slot_ids as string[] | null
        if (ids) ids.forEach((id: string) => requestedIds.add(id))
      }
      allSlots = allSlots.filter(
        (s) => requestedIds.has(s.id) || s.status !== 'empty'
      )
    }

    const requiredSlots = allSlots.filter((s) => s.is_required)
    const docCounts = {
      total: requiredSlots.length,
      uploaded: requiredSlots.filter((s) => s.status !== 'empty').length,
      accepted: requiredSlots.filter((s) => s.status === 'accepted').length,
      needed: requiredSlots.filter((s) => s.status === 'empty').length,
      reuploadNeeded: requiredSlots.filter(
        (s) => s.status === 'needs_re_upload' || s.status === 'rejected',
      ).length,
    }

    // For next action: get first re-upload doc details
    let firstReuploadDoc: { name: string; reason: string } | null = null
    if (docCounts.reuploadNeeded > 0) {
      const { data: reuploadSlots } = await admin
        .from('document_slots')
        .select('id, slot_name, status')
        .eq('matter_id', matterId)
        .eq('is_active', true)
        .eq('is_required', true)
        .in('status', ['needs_re_upload', 'rejected'])
        .order('sort_order', { ascending: true })
        .limit(1)

      if (reuploadSlots?.[0]) {
        // Get review reason
        const { data: versions } = await admin
          .from('document_versions')
          .select('review_reason')
          .eq('slot_id', reuploadSlots[0].id)
          .not('review_reason', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1)

        firstReuploadDoc = {
          name: reuploadSlots[0].slot_name,
          reason: versions?.[0]?.review_reason ?? 'Please re-upload this document',
        }
      }
    }

    // For next action: get first missing doc
    let firstMissingDoc: string | null = null
    if (docCounts.needed > 0) {
      const { data: missingSlots } = await admin
        .from('document_slots')
        .select('slot_name')
        .eq('matter_id', matterId)
        .eq('is_active', true)
        .eq('is_required', true)
        .eq('status', 'empty')
        .order('sort_order', { ascending: true })
        .limit(1)

      firstMissingDoc = missingSlots?.[0]?.slot_name ?? null
    }

    // ── Fetch IRCC questionnaire status ───────────────────────────────────

    const { data: irccSession } = await admin
      .from('ircc_questionnaire_sessions')
      .select('id, status, progress')
      .eq('matter_id', matterId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const questionsExist = !!irccSession
    const questionsCompleted = irccSession?.status === 'completed'
    let questionnaireProgress = 0
    let incompleteSections = 0

    // Per-form progress from session.progress.forms
    let totalForms = 0
    let completedFormCount = 0
    const incompleteFormNames: string[] = []

    if (irccSession && irccSession.progress) {
      const progress = irccSession.progress as Record<string, unknown>

      // New per-form tracking (session.progress.forms)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const formsProgress = (progress as any)?.forms as Record<string, any> | undefined
      if (formsProgress && Object.keys(formsProgress).length > 0) {
        const formEntries = Object.values(formsProgress)
        totalForms = formEntries.length
        let totalFilled = 0
        let totalFields = 0

        for (const entry of formEntries) {
          if (entry.status === 'completed') {
            completedFormCount++
          }
          totalFilled += entry.filled_fields ?? 0
          totalFields += entry.total_fields ?? 0
        }

        questionnaireProgress = totalFields > 0
          ? Math.round((totalFilled / totalFields) * 100)
          : 0
        incompleteSections = totalForms - completedFormCount
      } else {
        // Legacy: old session.progress shape (completed_sections / total_sections)
        const completedSections = (progress.completed_sections as string[]) ?? []
        const totalSections = (progress.total_sections as number) ?? 1
        questionnaireProgress = totalSections > 0
          ? Math.round((completedSections.length / totalSections) * 100)
          : 0
        incompleteSections = Math.max(0, totalSections - completedSections.length)
      }
    }

    // Fetch form names for incomplete forms (for next action display)
    if (incompleteSections > 0 && irccSession?.progress) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const formsProgress = ((irccSession.progress as any)?.forms ?? {}) as Record<string, any>
      const incompleteFormIds = Object.entries(formsProgress)
        .filter(([, entry]) => entry.status !== 'completed')
        .map(([fId]) => fId)

      if (incompleteFormIds.length > 0) {
        const { data: formInfos } = await admin
          .from('ircc_forms')
          .select('id, form_code, form_name')
          .in('id', incompleteFormIds)

        if (formInfos) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const fi of formInfos as any[]) {
            incompleteFormNames.push(`${fi.form_code} — ${fi.form_name}`)
          }
        }
      }
    }

    // ── Fetch invoices ────────────────────────────────────────────────────

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: invoices } = await (admin as any)
      .from('invoices')
      .select('id, total_amount, amount_paid, status, due_date, required_before_work')
      .eq('matter_id', matterId)
      .not('status', 'in', '("draft","cancelled","void")')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allInvoices: any[] = invoices ?? []
    const totalDue = allInvoices.reduce((sum: number, inv: any) => sum + (inv.total_amount ?? 0), 0)
    const totalPaid = allInvoices.reduce((sum: number, inv: any) => sum + (inv.amount_paid ?? 0), 0)
    const overdueInvoices = allInvoices.filter(
      (inv: any) =>
        inv.due_date &&
        new Date(inv.due_date) < now &&
        (inv.amount_paid ?? 0) < (inv.total_amount ?? 0),
    )
    const hasRequiredOverdue = overdueInvoices.some((inv: any) => inv.required_before_work)

    // For next action: first overdue required invoice
    let overduePaymentAmount = 0
    if (hasRequiredOverdue) {
      const firstOverdue = overdueInvoices.find((inv: any) => inv.required_before_work)
      if (firstOverdue) {
        overduePaymentAmount = (firstOverdue.total_amount ?? 0) - (firstOverdue.amount_paid ?? 0)
      }
    }

    // ── Fetch client tasks ────────────────────────────────────────────────

    const { data: tasks } = await admin
      .from('tasks')
      .select('id, status, due_date, title')
      .eq('matter_id', matterId)
      .eq('category', 'client_facing')
      .eq('is_deleted', false)

    const allTasks: Array<{ id: string; status: string; due_date: string | null; title: string }> = tasks ?? []
    const tasksTodo = allTasks.filter((t) => t.status !== 'completed')
    const tasksOverdue = tasksTodo.filter(
      (t) => t.due_date && new Date(t.due_date) < now,
    )
    const tasksCompleted = allTasks.filter((t) => t.status === 'completed')

    // For next action: first overdue task
    const firstOverdueTask = tasksOverdue[0] ?? null

    // ── Fetch messages ────────────────────────────────────────────────────

    const { data: messages } = await admin
      .from('matter_comments')
      .select('id, created_at')
      .eq('matter_id', matterId)
      .eq('is_internal', false)
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    const allMessages: Array<{ id: string; created_at: string }> = messages ?? []
    const clientReadAt = clientReadAtRaw ? new Date(clientReadAtRaw) : null
    const unreadMessages = clientReadAt
      ? allMessages.filter((m) => new Date(m.created_at) > clientReadAt)
      : allMessages // If never read, all are "unread"
    const latestMessageDate = allMessages[0]?.created_at ?? null

    // ── Fetch upcoming events ─────────────────────────────────────────────

    const sevenDaysFromNow = new Date(now)
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7)

    const ninetyDaysFromNow = new Date(now)
    ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90)

    const { data: events } = await admin
      .from('calendar_events')
      .select('id, title, start_at')
      .eq('matter_id', matterId)
      .eq('is_active', true)
      .eq('is_client_visible', true)
      .neq('status', 'cancelled')
      .gte('start_at', now.toISOString())
      .lte('start_at', ninetyDaysFromNow.toISOString())
      .order('start_at', { ascending: true })

    const allEvents: Array<{ id: string; title: string; start_at: string }> = events ?? []
    const upcomingIn7Days = allEvents.filter(
      (e) => new Date(e.start_at) <= sevenDaysFromNow,
    )
    const nextEvent = allEvents[0] ?? null

    // ── Compute next action (strict 8-level priority waterfall) ───────────

    const nextAction = computeNextAction({
      docCounts,
      firstReuploadDoc,
      firstMissingDoc,
      hasRequiredOverdue,
      overduePaymentAmount,
      questionsExist,
      questionsCompleted,
      questionnaireProgress,
      firstOverdueTask,
      unreadCount: unreadMessages.length,
      upcomingIn7Days,
      nextEvent,
    })

    // ── Compute awaiting review (strict 4-condition check) ────────────────

    const documentsReady =
      docCounts.reuploadNeeded === 0 &&
      docCounts.needed === 0 &&
      docCounts.total > 0

    const questionsReady = !questionsExist || questionsCompleted

    const tasksReady = tasksTodo.length === 0

    const paymentReady = !allInvoices.some(
      (inv: any) =>
        inv.required_before_work &&
        (inv.amount_paid ?? 0) < (inv.total_amount ?? 0),
    )

    const awaitingReview = documentsReady && questionsReady && tasksReady && paymentReady

    // ── Compute reviewContext (when awaiting review) ─────────────────────

    let reviewContext: PortalSummaryResponse['reviewContext'] = null
    if (awaitingReview) {
      const { data: lastActivity } = await admin
        .from('activities')
        .select('created_at, activity_type')
        .eq('matter_id', matterId)
        .in('activity_type', [
          'portal_upload',
          'portal_slot_upload',
          'portal_ircc_questionnaire_completed',
          'portal_payment_marked_sent',
        ])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const actionMap: Record<string, string> = {
        portal_upload: 'uploaded document',
        portal_slot_upload: 'uploaded document',
        portal_ircc_questionnaire_completed: 'completed questionnaire',
        portal_payment_marked_sent: 'sent payment notification',
      }

      reviewContext = {
        lastSubmittedAt: lastActivity?.created_at ?? null,
        lastSubmittedAction: lastActivity
          ? (actionMap[lastActivity.activity_type] ?? null)
          : null,
      }
    }

    // ── Fetch shared documents ──────────────────────────────────────────

    const { data: sharedDocs } = await admin
      .from('documents')
      .select('id, client_viewed_at')
      .eq('matter_id', matterId)
      .eq('is_shared_with_client', true)

    const allSharedDocs: Array<{ id: string; client_viewed_at: string | null }> = sharedDocs ?? []
    const sharedViewed = allSharedDocs.filter((d) => !!d.client_viewed_at).length

    // ── Build response ────────────────────────────────────────────────────

    const sections: PortalSectionCounts = {
      documents: docCounts,
      questions: {
        exists: questionsExist,
        completed: questionsCompleted,
        progress: questionnaireProgress,
        incompleteSections,
        totalForms,
        completedForms: completedFormCount,
        incompleteFormNames,
      },
      payment: {
        totalDue,
        totalPaid,
        overdueCount: overdueInvoices.length,
        invoiceCount: allInvoices.length,
        hasRequiredOverdue,
      },
      tasks: {
        total: allTasks.length,
        todo: tasksTodo.length,
        overdue: tasksOverdue.length,
        completed: tasksCompleted.length,
      },
      messages: {
        total: allMessages.length,
        unread: unreadMessages.length,
        latestDate: latestMessageDate,
      },
      calendar: {
        upcomingCount: allEvents.length,
        nextEvent: nextEvent
          ? { title: nextEvent.title, date: nextEvent.start_at }
          : null,
      },
      sharedDocuments: {
        total: allSharedDocs.length,
        viewed: sharedViewed,
        unviewed: allSharedDocs.length - sharedViewed,
      },
    }

    const response: PortalSummaryResponse = {
      nextAction,
      awaitingReview,
      reviewContext,
      sections,
      lastUpdated: now.toISOString(),
      matter: {
        title: matter.title ?? '',
        matterNumber: matter.matter_number ?? '',
        matterTypeName,
        status: matter.status ?? '',
      },
    }

    return NextResponse.json(response)
  } catch (err) {
    console.error('[portal/summary] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── Next Action Computation ──────────────────────────────────────────────────

function computeNextAction(data: {
  docCounts: PortalSectionCounts['documents']
  firstReuploadDoc: { name: string; reason: string } | null
  firstMissingDoc: string | null
  hasRequiredOverdue: boolean
  overduePaymentAmount: number
  questionsExist: boolean
  questionsCompleted: boolean
  questionnaireProgress: number
  firstOverdueTask: { title: string } | null
  unreadCount: number
  upcomingIn7Days: { title: string; start_at: string }[]
  nextEvent: { title: string; start_at: string } | null
}): PortalNextAction {
  // Priority 1: Documents needing re-upload
  if (data.docCounts.reuploadNeeded > 0 && data.firstReuploadDoc) {
    return {
      priority: 1,
      type: 'reupload_document',
      color: 'red',
      scrollTarget: 'section-documents',
      context: {
        documentName: data.firstReuploadDoc.name,
        reason: data.firstReuploadDoc.reason,
      },
    }
  }

  // Priority 2: Payment blocking work (overdue + required_before_work)
  if (data.hasRequiredOverdue) {
    return {
      priority: 2,
      type: 'payment_overdue',
      color: 'red',
      scrollTarget: 'section-payment',
      context: {
        amount: data.overduePaymentAmount,
      },
    }
  }

  // Priority 3: Missing required documents
  if (data.docCounts.needed > 0 && data.firstMissingDoc) {
    return {
      priority: 3,
      type: 'missing_document',
      color: 'amber',
      scrollTarget: 'section-documents',
      context: {
        documentName: data.firstMissingDoc,
      },
    }
  }

  // Priority 4: Incomplete intake questions
  if (data.questionsExist && !data.questionsCompleted) {
    return {
      priority: 4,
      type: 'incomplete_questionnaire',
      color: 'amber',
      scrollTarget: 'section-questions',
      context: {
        questionnaireProgress: data.questionnaireProgress,
      },
    }
  }

  // Priority 5: Overdue client tasks
  if (data.firstOverdueTask) {
    return {
      priority: 5,
      type: 'overdue_task',
      color: 'amber',
      scrollTarget: 'section-tasks',
      context: {
        taskTitle: data.firstOverdueTask.title,
      },
    }
  }

  // Priority 6: Unread firm messages
  if (data.unreadCount > 0) {
    return {
      priority: 6,
      type: 'unread_messages',
      color: 'blue',
      scrollTarget: 'section-messages',
      context: {},
    }
  }

  // Priority 7: Upcoming event in next 7 days
  if (data.upcomingIn7Days.length > 0) {
    const evt = data.upcomingIn7Days[0]
    return {
      priority: 7,
      type: 'upcoming_event',
      color: 'blue',
      scrollTarget: 'section-calendar',
      context: {
        eventTitle: evt.title,
        eventDate: evt.start_at,
      },
    }
  }

  // Priority 8: All complete / awaiting review
  return {
    priority: 8,
    type: 'awaiting_review',
    color: 'green',
    scrollTarget: null,
    context: {},
  }
}
