import { NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/services/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/utils/logger'
import { requirePermission } from '@/lib/services/require-role'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * GET /api/admin/first-hour
 *
 * Directive 26.1 — "First-Hour" Command Centre.
 * Returns real-time metrics for the first 60 minutes of firm onboarding:
 *   1. Clio-to-Norva sync velocity (matters migrated per minute)
 *   2. Ghost-Writer usage (AI drafts generated)
 *   3. Language Toggle distribution (locale usage across Fact-Anchors)
 *
 * Goal: Track how many of the first 25 firms use Urdu/Punjabi/Hindi
 * Fact-Anchors in their first 60 minutes.
 *
 * Requires Admin role.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface FirstHourMetrics {
  /** ISO timestamp of when this snapshot was computed */
  generatedAt: string
  /** Minutes since the tenant was activated */
  minutesSinceActivation: number

  sync: {
    /** Total matters imported from Clio */
    mattersImported: number
    /** Total contacts imported */
    contactsImported: number
    /** Matters per minute velocity */
    mattersPerMinute: number
    /** Contacts per minute velocity */
    contactsPerMinute: number
    /** Timeline: [{minute, matters, contacts}] for sparkline */
    timeline: { minute: number; matters: number; contacts: number }[]
  }

  ghostWriter: {
    /** Total AI drafts generated in the window */
    draftsGenerated: number
    /** Unique matters that received at least one draft */
    uniqueMattersWithDrafts: number
    /** Unique users who triggered a draft */
    uniqueUsersWithDrafts: number
    /** Drafts per minute velocity */
    draftsPerMinute: number
  }

  language: {
    /** Total Norva Ear sessions in the window */
    totalEarSessions: number
    /** Breakdown by language code: [{locale, count, percentage}] */
    distribution: { locale: string; label: string; count: number; percentage: number }[]
    /** Count of sessions using Urdu, Punjabi, or Hindi */
    southAsianCount: number
    /** Percentage of sessions using Urdu, Punjabi, or Hindi */
    southAsianPercentage: number
    /** How many unique firms (tenants) used south-asian Fact-Anchors */
    southAsianFirmCount: number
  }
}

// ── Language labels ─────────────────────────────────────────────────────────

const LOCALE_LABELS: Record<string, string> = {
  en: 'English', fr: 'French', es: 'Spanish', pa: 'Punjabi',
  zh: 'Mandarin', ar: 'Arabic', ur: 'Urdu', hi: 'Hindi',
  pt: 'Portuguese', tl: 'Tagalog', fa: 'Farsi', vi: 'Vietnamese',
  ko: 'Korean', uk: 'Ukrainian', bn: 'Bengali',
}

const SOUTH_ASIAN_LOCALES = new Set(['ur', 'pa', 'hi'])

// ── Handler ─────────────────────────────────────────────────────────────────

async function handleGet(_request: Request) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'view')
    const admin = createAdminClient()

    // Get tenant activation time (created_at as proxy)
    const { data: tenant } = await (admin as any)
      .from('tenants')
      .select('id, created_at')
      .eq('id', auth.tenantId)
      .single()

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const activationTime = new Date(tenant.created_at)
    const now = new Date()
    const minutesSinceActivation = Math.floor((now.getTime() - activationTime.getTime()) / 60_000)

    // Use a 60-minute window from activation, or from now-60min if tenant is older
    const windowStart = minutesSinceActivation <= 60
      ? activationTime.toISOString()
      : new Date(now.getTime() - 60 * 60_000).toISOString()
    const windowEnd = now.toISOString()

    // ── 1. Sync Velocity ──────────────────────────────────────────────────
    const { data: matters } = await (admin as any)
      .from('matters')
      .select('id, created_at')
      .eq('tenant_id', auth.tenantId)
      .gte('created_at', windowStart)
      .lte('created_at', windowEnd)

    const { data: contacts } = await (admin as any)
      .from('contacts')
      .select('id, created_at')
      .eq('tenant_id', auth.tenantId)
      .gte('created_at', windowStart)
      .lte('created_at', windowEnd)

    const mattersArr = matters ?? []
    const contactsArr = contacts ?? []

    const windowMinutes = Math.max(1, Math.floor(
      (new Date(windowEnd).getTime() - new Date(windowStart).getTime()) / 60_000
    ))

    // Build per-minute timeline (up to 60 buckets)
    const timeline: { minute: number; matters: number; contacts: number }[] = []
    const buckets = Math.min(windowMinutes, 60)
    for (let i = 0; i < buckets; i++) {
      const bucketStart = new Date(new Date(windowStart).getTime() + i * 60_000)
      const bucketEnd = new Date(bucketStart.getTime() + 60_000)
      timeline.push({
        minute: i + 1,
        matters: mattersArr.filter((m: any) => {
          const t = new Date(m.created_at).getTime()
          return t >= bucketStart.getTime() && t < bucketEnd.getTime()
        }).length,
        contacts: contactsArr.filter((c: any) => {
          const t = new Date(c.created_at).getTime()
          return t >= bucketStart.getTime() && t < bucketEnd.getTime()
        }).length,
      })
    }

    // ── 2. Ghost-Writer Usage ─────────────────────────────────────────────
    const { data: drafts } = await (admin as any)
      .from('ai_drafts')
      .select('id, matter_id, created_by, created_at')
      .eq('tenant_id', auth.tenantId)
      .gte('created_at', windowStart)
      .lte('created_at', windowEnd)

    const draftsArr = drafts ?? []
    const uniqueDraftMatters = new Set(draftsArr.map((d: any) => d.matter_id))
    const uniqueDraftUsers = new Set(draftsArr.map((d: any) => d.created_by))

    // ── 3. Language Distribution (Norva Ear sessions) ─────────────────────
    const { data: earSessions } = await (admin as any)
      .from('norva_ear_sessions')
      .select('id, source_language, tenant_id, created_at')
      .eq('tenant_id', auth.tenantId)
      .gte('created_at', windowStart)
      .lte('created_at', windowEnd)

    const earArr = earSessions ?? []
    const langCounts: Record<string, number> = {}
    const southAsianTenants = new Set<string>()

    for (const s of earArr) {
      const locale = (s.source_language ?? 'en').toLowerCase()
      langCounts[locale] = (langCounts[locale] ?? 0) + 1
      if (SOUTH_ASIAN_LOCALES.has(locale)) {
        southAsianTenants.add(s.tenant_id)
      }
    }

    const totalEar = earArr.length
    const distribution = Object.entries(langCounts)
      .map(([locale, count]) => ({
        locale,
        label: LOCALE_LABELS[locale] ?? locale,
        count,
        percentage: totalEar > 0 ? Math.round((count / totalEar) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)

    const southAsianCount = Array.from(SOUTH_ASIAN_LOCALES).reduce(
      (sum, l) => sum + (langCounts[l] ?? 0), 0
    )

    // ── Assemble Response ─────────────────────────────────────────────────
    const metrics: FirstHourMetrics = {
      generatedAt: now.toISOString(),
      minutesSinceActivation,
      sync: {
        mattersImported: mattersArr.length,
        contactsImported: contactsArr.length,
        mattersPerMinute: +(mattersArr.length / windowMinutes).toFixed(2),
        contactsPerMinute: +(contactsArr.length / windowMinutes).toFixed(2),
        timeline,
      },
      ghostWriter: {
        draftsGenerated: draftsArr.length,
        uniqueMattersWithDrafts: uniqueDraftMatters.size,
        uniqueUsersWithDrafts: uniqueDraftUsers.size,
        draftsPerMinute: +(draftsArr.length / windowMinutes).toFixed(2),
      },
      language: {
        totalEarSessions: totalEar,
        distribution,
        southAsianCount,
        southAsianPercentage: totalEar > 0 ? Math.round((southAsianCount / totalEar) * 100) : 0,
        southAsianFirmCount: southAsianTenants.size,
      },
    }

    return NextResponse.json(metrics)
  } catch (err: any) {
    if (err?.status === 401 || err?.message?.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    log.error('first-hour metrics failed', { error: err?.message })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/admin/first-hour')
