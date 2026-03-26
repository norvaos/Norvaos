/**
 * Email Delivery Adapter
 *
 * Hardened wrapper for outbound email sending via Resend.
 *
 * Hardens:
 * - Retry with exponential backoff (max 3 attempts)
 * - Structured logging with tenant_id on every path
 * - PII protection: email addresses are masked in log output;
 *   email body content never appears in logs
 * - Sentry capture on permanent Resend API failure
 * - Returns a typed DeliveryResult  -  callers do not need try/catch
 *
 * Scope constraint: wraps existing email delivery infrastructure;
 * does not change email content, template selection, or recipient logic.
 */

import { Resend } from 'resend'
import * as Sentry from '@sentry/nextjs'
import { retryWithBackoff, NonRetryableError } from '@/lib/utils/retry'
import { log } from '@/lib/utils/logger'
import { recordDeliveryAttempt } from '@/lib/services/notifications/delivery-tracker'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EmailDeliveryPayload {
  /** Sender address in "Name <addr>" or plain format. */
  from: string
  /** Primary recipient(s). */
  to: string[]
  subject: string
  /** Rendered HTML body. Required or `text` must be provided. */
  html?: string
  /** Plain-text fallback. */
  text?: string
  /** Optional CC recipients. */
  cc?: string[]
  /** Optional BCC recipients. */
  bcc?: string[]
  /**
   * Opaque correlation tag for delivery tracking (e.g. notification type).
   * Never logged in full  -  used only for structured metadata.
   */
  correlationTag?: string
}

export interface EmailDeliveryContext {
  tenantId: string
}

export interface EmailDeliveryResult {
  sent: boolean
  /** Resend message ID when delivery was accepted. */
  messageId?: string
  /** Human-readable error description on failure. */
  error?: string
  attempts: number
}

// ─── PII Masking ─────────────────────────────────────────────────────────────

/**
 * Return a masked representation of an email address safe for log output.
 *
 * Example: "john.doe@example.com" → "***@example.com (…doe)"
 * This prevents recipient email addresses from appearing in plain text
 * in log aggregators, even in the local part.
 */
function maskEmail(email: string): string {
  const atIdx = email.lastIndexOf('@')
  if (atIdx <= 0) return '***'
  const local = email.slice(0, atIdx)
  const domain = email.slice(atIdx + 1)
  const tail = local.length > 3 ? local.slice(-3) : local.slice(-1)
  return `***@${domain} (…${tail})`
}

function maskRecipients(addresses: string[]): string {
  return addresses.map(maskEmail).join(', ')
}

// ─── Resend Client ──────────────────────────────────────────────────────────

function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    throw new NonRetryableError(
      'RESEND_API_KEY is not configured  -  email delivery is disabled',
    )
  }
  return new Resend(apiKey)
}

// ─── Resend Error Classification ─────────────────────────────────────────────

/**
 * Determine whether a Resend API error is retryable.
 *
 * Resend surfaces errors as objects with a `statusCode` field.
 * 4xx errors (except 429) are permanent  -  retrying will not help.
 * 429 and 5xx errors are transient and should be retried.
 */
function classifyResendError(err: unknown): { retryable: boolean; message: string } {
  if (err instanceof Error) {
    const message = err.message
    const match = message.match(/\b(4\d\d|5\d\d)\b/)
    if (match) {
      const status = parseInt(match[1], 10)
      // 4xx except 429 → permanent
      if (status >= 400 && status < 500 && status !== 429) {
        return { retryable: false, message }
      }
    }
    return { retryable: true, message }
  }

  if (typeof err === 'object' && err !== null) {
    const obj = err as Record<string, unknown>
    const statusCode = typeof obj.statusCode === 'number' ? obj.statusCode : 0
    const message = typeof obj.message === 'string' ? obj.message : JSON.stringify(err)
    if (statusCode >= 400 && statusCode < 500 && statusCode !== 429) {
      return { retryable: false, message }
    }
    return { retryable: true, message }
  }

  return { retryable: true, message: String(err) }
}

// ─── Core Send Function ──────────────────────────────────────────────────────

/**
 * Send an email via Resend with retry, structured logging, and Sentry capture.
 *
 * Log lines NEVER include:
 * - Email body (html or text)
 * - Full recipient email addresses (masked only)
 * - Sender's full name if it contains client names
 *
 * @param payload  - Email content and recipients
 * @param context  - Delivery context (tenantId required)
 */
export async function sendEmail(
  payload: EmailDeliveryPayload,
  context: EmailDeliveryContext,
): Promise<EmailDeliveryResult> {
  const { tenantId } = context
  const maskedRecipients = maskRecipients(payload.to)
  const correlationTag = payload.correlationTag ?? 'email'

  log.info('Email delivery initiated', {
    tenant_id: tenantId,
    correlation_tag: correlationTag,
    recipient_count: payload.to.length,
    recipients_masked: maskedRecipients,
  })

  const result = await retryWithBackoff(
    async () => {
      const resend = getResendClient()

      const sendResult = await resend.emails.send({
        from: payload.from,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
        cc: payload.cc,
        bcc: payload.bcc,
      } as Parameters<typeof resend.emails.send>[0])

      // Resend SDK returns { data, error }  -  surface error as thrown exception
      if (sendResult.error) {
        const { retryable, message } = classifyResendError(sendResult.error)
        if (!retryable) {
          throw new NonRetryableError(`Resend permanent error: ${message}`)
        }
        throw new Error(`Resend transient error: ${message}`)
      }

      return sendResult.data?.id ?? null
    },
    {
      maxAttempts: 3,
      baseDelayMs: 1_000,
      maxDelayMs: 10_000,
      tenantId,
      operation: 'email_send',
      onRetry: (attempt, err) => {
        log.warn('Email send retry scheduled', {
          tenant_id: tenantId,
          correlation_tag: correlationTag,
          recipients_masked: maskedRecipients,
          retry_attempt: attempt,
          error_message: err.message,
        })
        recordDeliveryAttempt({
          tenantId,
          channel: 'email',
          entityType: correlationTag,
          entityId: 'unknown',
          status: 'retrying',
          error: err.message,
          attempts: attempt - 1,
        })
      },
    },
  )

  if (result.success) {
    const messageId = result.value ?? undefined

    log.info('Email delivered successfully', {
      tenant_id: tenantId,
      correlation_tag: correlationTag,
      recipients_masked: maskedRecipients,
      message_id: messageId,
      attempts: result.attempts,
    })

    recordDeliveryAttempt({
      tenantId,
      channel: 'email',
      entityType: correlationTag,
      entityId: 'unknown',
      status: 'sent',
      attempts: result.attempts,
    })

    return { sent: true, messageId, attempts: result.attempts }
  }

  // Permanent failure  -  capture to Sentry with tenant context
  const errorMessage = result.error.message

  Sentry.withScope((scope) => {
    scope.setTag('tenant_id', tenantId)
    scope.setTag('operation', 'email_send')
    scope.setTag('correlation_tag', correlationTag)
    scope.setExtra('attempts', result.attempts)
    scope.setExtra('recipient_count', payload.to.length)
    // Never pass raw email addresses to Sentry
    scope.setExtra('recipients_masked', maskedRecipients)
    Sentry.captureException(result.error)
  })

  log.error('Email delivery permanently failed', {
    tenant_id: tenantId,
    correlation_tag: correlationTag,
    recipients_masked: maskedRecipients,
    error_code: 'EMAIL_DELIVERY_PERMANENT_FAILURE',
    error_message: errorMessage,
    attempts: result.attempts,
  })

  recordDeliveryAttempt({
    tenantId,
    channel: 'email',
    entityType: correlationTag,
    entityId: 'unknown',
    status: 'failed',
    error: errorMessage,
    attempts: result.attempts,
  })

  return { sent: false, error: errorMessage, attempts: result.attempts }
}
