/**
 * Variable Injection Engine for Communication Templates
 *
 * Pure utility — no React dependencies. Safe for both client (live preview)
 * and server (send-time rendering) usage.
 *
 * Merge tags use the format {{variable_name}}. Unknown tags are left as-is.
 */

export interface TemplateContext {
  client_name: string
  portal_link: string
  lawyer_name: string
  firm_name: string
  matter_number?: string
  [key: string]: string | undefined
}

/** Ordered list of supported merge tags for UI display in the template editor. */
export const SUPPORTED_VARIABLES = [
  'client_name',
  'portal_link',
  'lawyer_name',
  'firm_name',
  'matter_number',
] as const

/**
 * Replace {{variable}} placeholders in a template body with values from ctx.
 * Unknown variables are left as-is (safe fallback — no data loss, no errors).
 */
export function parseTemplate(body: string, ctx: TemplateContext): string {
  return body.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const value = ctx[key]
    return value !== undefined ? value : match
  })
}
