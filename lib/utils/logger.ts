/**
 * Structured JSON logger with tenant-first context.
 *
 * Every log entry includes timestamp and is output as single-line JSON
 * for parsing by Vercel Logs, Axiom, or any log aggregator.
 *
 * Scale Fix Pack v1: replaces dev-only console logger with production-grade
 * structured logging that includes tenant_id on every line.
 */

export interface LogContext {
  tenant_id?: string
  user_id?: string
  role_name?: string
  route?: string
  request_id?: string
  duration_ms?: number
  db_query_count?: number
  cache_hit?: boolean
  error_code?: string
  [key: string]: unknown
}

type LogLevel = 'info' | 'warn' | 'error' | 'debug'

function emit(level: LogLevel, message: string, ctx?: LogContext): void {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...ctx,
  }

  const line = JSON.stringify(entry)

  switch (level) {
    case 'error':
      console.error(line)
      break
    case 'warn':
      console.warn(line)
      break
    case 'debug':
      if (process.env.NODE_ENV === 'development') {
        console.debug(line)
      }
      break
    default:
      console.log(line)
  }
}

export const log = {
  info(message: string, ctx?: LogContext): void {
    emit('info', message, ctx)
  },
  warn(message: string, ctx?: LogContext): void {
    emit('warn', message, ctx)
  },
  error(message: string, ctx?: LogContext): void {
    emit('error', message, ctx)
  },
  debug(message: string, ctx?: LogContext): void {
    emit('debug', message, ctx)
  },
}

// Keep backward-compatible export for existing code that uses `logger`
export const logger = log
