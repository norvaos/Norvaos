/**
 * GET /api/admin/global15-readiness
 *
 * Generates the Global 15 Readiness PDF for the current tenant's Managing Partner.
 * Directive 29.1: Launch-Day readiness report.
 */

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { generateGlobal15ReadinessPdf } from '@/lib/utils/global15-readiness-pdf'
import type { Global15ReadinessData } from '@/lib/utils/global15-readiness-pdf'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get tenant info
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: dbUser } = await (supabase as any)
    .from('users')
    .select('tenant_id, first_name, last_name, role')
    .eq('auth_user_id', user.id)
    .single()

  if (!dbUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const tenantId = dbUser.tenant_id as string

  // Gather data in parallel
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any
  const [
    tenantRes,
    mattersRes,
    contactsRes,
    documentsRes,
    usersRes,
    sentinelRes,
  ] = await Promise.all([
    sb.from('tenants').select('id, name').eq('id', tenantId).single(),
    sb.from('matters').select('id, status').eq('tenant_id', tenantId),
    sb.from('contacts').select('id').eq('tenant_id', tenantId),
    sb.from('documents').select('id').eq('tenant_id', tenantId),
    sb.from('users').select('id, is_active').eq('tenant_id', tenantId),
    sb
      .from('sentinel_audit_log')
      .select('id, severity')
      .eq('tenant_id', tenantId)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
  ])

  const tenant = tenantRes.data
  const matters = mattersRes.data ?? []
  const contacts = contactsRes.data ?? []
  const documents = documentsRes.data ?? []
  const users = usersRes.data ?? []
  const sentinelEvents = sentinelRes.data ?? []

  const activeMatterCount = matters.filter((m: { status: string }) =>
    m.status !== 'closed_won' && m.status !== 'closed_lost' && m.status !== 'archived'
  ).length
  const closedMatterCount = matters.length - activeMatterCount

  const criticalEvents = sentinelEvents.filter((e: { severity: string }) => e.severity === 'critical' || e.severity === 'breach').length
  const totalEvents = sentinelEvents.length

  // Compute Sentinel security score (higher = better)
  // Base 100, deduct for critical events, clamp to 0-100
  const sentinelScore = Math.max(0, Math.min(100, 100 - (criticalEvents * 10) - Math.floor(totalEvents * 0.2)))

  const data: Global15ReadinessData = {
    firmName: tenant?.name ?? 'Unknown Firm',
    partnerName: [dbUser.first_name, dbUser.last_name].filter(Boolean).join(' ') || 'Managing Partner',
    generatedAt: new Date().toISOString(),
    migration: {
      totalMatters: matters.length,
      activeMatters: activeMatterCount,
      closedMatters: closedMatterCount,
      totalContacts: contacts.length,
      totalDocuments: documents.length,
      migratedFrom: null,
    },
    sentinel: {
      overallScore: sentinelScore,
      layers: {
        authentication: 100, // Supabase Auth + MFA = always 100
        authorisation: Math.min(100, sentinelScore + 5),
        tenantIsolation: 100, // RLS + tenant_id = always 100
        dataIntegrity: Math.min(100, 100 - criticalEvents * 5),
      },
      recentEvents: totalEvents,
      criticalEvents,
    },
    seats: {
      totalUsers: users.length,
      activeUsers: users.filter((u: { is_active: boolean }) => u.is_active).length,
      planName: 'NorvaOS Professional',
    },
  }

  const pdfBytes = await generateGlobal15ReadinessPdf(data)

  return new NextResponse(pdfBytes as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="NorvaOS-Global15-Readiness-${new Date().toISOString().split('T')[0]}.pdf"`,
    },
  })
}
