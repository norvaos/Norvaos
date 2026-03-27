/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Passport Expiry Sentinel  -  Directive 082 / Target 10
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * When a passport is scanned and extracted, this service checks if the expiry
 * date falls within the alert window (default 180 days). If so, it:
 *
 *   1. Creates a high-priority notification for the responsible lawyer
 *   2. Creates a contact_status_record (passport type) if one doesn't exist
 *   3. Logs a SENTINEL audit event (IDENTITY_VERIFICATION)
 *
 * Designed to be called from:
 *   - POST /api/ocr/scan-id (after successful extraction)
 *   - The ID Scanner component's onScanComplete callback
 *   - Manual passport entry in the contact profile
 *
 * Uses the existing notifications table + sentinel_audit_log patterns.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Types ────────────────────────────────────────────────────────────────────

export interface PassportExpiryCheckInput {
  /** The contact's UUID */
  contactId: string
  /** Passport expiry date (YYYY-MM-DD) */
  expiryDate: string
  /** Passport number (for deduplication and audit) */
  passportNumber: string
  /** Country of issue (optional, for display) */
  countryOfIssue?: string
  /** The matter this scan is associated with (optional) */
  matterId?: string
  /** The user who performed the scan */
  scannedByUserId: string
  /** Tenant ID */
  tenantId: string
}

export interface PassportExpiryCheckResult {
  /** Whether an alert was triggered */
  alertTriggered: boolean
  /** Days until expiry (negative = already expired) */
  daysUntilExpiry: number
  /** Severity level */
  severity: 'ok' | 'warning' | 'critical' | 'expired'
  /** Notification ID if one was created */
  notificationId?: string
  /** Status record ID if one was created/updated */
  statusRecordId?: string
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Alert threshold in days  -  fires notification if expiry < this */
const ALERT_WINDOW_DAYS = 180

/** Severity thresholds */
const CRITICAL_THRESHOLD_DAYS = 90
const EXPIRED_THRESHOLD_DAYS = 0

// ── Main Function ────────────────────────────────────────────────────────────

/**
 * Check passport expiry and fire alerts if within the danger window.
 *
 * Idempotent: will not create duplicate notifications for the same
 * passport + expiry date combination.
 */
export async function checkPassportExpiry(
  supabase: SupabaseClient,
  input: PassportExpiryCheckInput,
): Promise<PassportExpiryCheckResult> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expiry = new Date(input.expiryDate + 'T00:00:00Z')
  const daysUntilExpiry = Math.ceil(
    (expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  )

  // Classify severity
  let severity: PassportExpiryCheckResult['severity'] = 'ok'
  if (daysUntilExpiry <= EXPIRED_THRESHOLD_DAYS) {
    severity = 'expired'
  } else if (daysUntilExpiry <= CRITICAL_THRESHOLD_DAYS) {
    severity = 'critical'
  } else if (daysUntilExpiry <= ALERT_WINDOW_DAYS) {
    severity = 'warning'
  }

  const result: PassportExpiryCheckResult = {
    alertTriggered: false,
    daysUntilExpiry,
    severity,
  }

  // ── 1. Upsert contact_status_record ──────────────────────────────────────

  try {
    // Check for existing passport record for this contact
    const { data: existingRecord } = await supabase
      .from('contact_status_records')
      .select('id')
      .eq('contact_id', input.contactId)
      .eq('tenant_id', input.tenantId)
      .eq('status_type', 'passport')
      .eq('document_reference', input.passportNumber)
      .limit(1)
      .maybeSingle()

    if (existingRecord) {
      // Update existing record with new expiry
      await supabase
        .from('contact_status_records')
        .update({
          expiry_date: input.expiryDate,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingRecord.id)

      result.statusRecordId = existingRecord.id
    } else {
      // Create new passport status record
      const { data: newRecord } = await supabase
        .from('contact_status_records')
        .insert({
          contact_id: input.contactId,
          tenant_id: input.tenantId,
          status_type: 'passport',
          document_reference: input.passportNumber,
          expiry_date: input.expiryDate,
          matter_id: input.matterId ?? null,
        })
        .select('id')
        .single()

      if (newRecord) {
        result.statusRecordId = newRecord.id
      }
    }
  } catch (err) {
    console.error('[passport-expiry-sentinel] Failed to upsert status record:', err)
  }

  // ── 2. Fire notification if within alert window ──────────────────────────

  if (severity !== 'ok') {
    try {
      // Find responsible lawyer (matter → responsible_lawyer_id, or fallback to scanner)
      let recipientId = input.scannedByUserId

      if (input.matterId) {
        const { data: matter } = await supabase
          .from('matters')
          .select('responsible_lawyer_id')
          .eq('id', input.matterId)
          .single()

        if (matter?.responsible_lawyer_id) {
          recipientId = matter.responsible_lawyer_id
        }
      }

      // Idempotency: check for existing notification
      const idempotencyTitle = severity === 'expired'
        ? `Passport EXPIRED: ${input.passportNumber}`
        : `Passport expires in ${daysUntilExpiry} days: ${input.passportNumber}`

      const { data: existing } = await supabase
        .from('notifications')
        .select('id')
        .eq('entity_id', input.contactId)
        .eq('notification_type', 'expiry_reminder')
        .eq('title', idempotencyTitle)
        .limit(1)

      if (!existing || existing.length === 0) {
        const countryNote = input.countryOfIssue
          ? ` (${input.countryOfIssue})`
          : ''

        const message = severity === 'expired'
          ? `Passport ${input.passportNumber}${countryNote} expired on ${input.expiryDate}. Client cannot travel or submit IRCC applications with this document.`
          : `Passport ${input.passportNumber}${countryNote} expires on ${input.expiryDate} (${daysUntilExpiry} days). ${
              daysUntilExpiry <= CRITICAL_THRESHOLD_DAYS
                ? 'IRCC may reject applications with passports expiring within processing time.'
                : 'Consider advising the client to renew before filing.'
            }`

        const { data: notification } = await supabase
          .from('notifications')
          .insert({
            tenant_id: input.tenantId,
            user_id: recipientId,
            title: idempotencyTitle,
            message,
            notification_type: 'expiry_reminder',
            entity_type: 'contact',
            entity_id: input.contactId,
            channels: ['in_app'],
            priority: severity === 'expired' || severity === 'critical' ? 'high' : 'normal',
          })
          .select('id')
          .single()

        if (notification) {
          result.notificationId = notification.id
          result.alertTriggered = true
        }
      }
    } catch (err) {
      console.error('[passport-expiry-sentinel] Failed to create notification:', err)
    }
  }

  // ── 3. Log Sentinel audit event ──────────────────────────────────────────

  try {
    await (supabase.from('sentinel_audit_log' as never) as any).insert({
      event_type: 'IDENTITY_VERIFICATION',
      severity: severity === 'expired' ? 'critical' : severity === 'critical' ? 'warning' : 'info',
      tenant_id: input.tenantId,
      user_id: input.scannedByUserId,
      table_name: 'contact_status_records',
      record_id: result.statusRecordId ?? input.contactId,
      details: {
        action: 'passport_scan_expiry_check',
        passport_number_last4: input.passportNumber.slice(-4),
        expiry_date: input.expiryDate,
        days_until_expiry: daysUntilExpiry,
        severity,
        alert_triggered: result.alertTriggered,
        matter_id: input.matterId ?? null,
      },
    })
  } catch (err) {
    // Non-critical  -  don't fail the scan for audit logging
    console.error('[passport-expiry-sentinel] Audit log failed:', err)
  }

  return result
}
