/**
 * Sovereign Quick-Reply Protocol - Variable Injector
 *
 * Replaces {{Variable.Key}} placeholders in communication templates
 * with actual data from the matter, contact, and firm context.
 */

export interface TemplateContext {
  client?: {
    firstName?: string | null
    lastName?: string | null
    email?: string | null
    phone?: string | null
    organization?: string | null
  }
  matter?: {
    id?: string | null
    title?: string | null
    matterNumber?: string | null
    practiceArea?: string | null
    matterType?: string | null
    status?: string | null
  }
  firm?: {
    name?: string
    phone?: string
    email?: string
  }
  lastAttachment?: {
    name?: string
    type?: string
  }
  user?: {
    firstName?: string | null
    lastName?: string | null
    email?: string | null
  }
}

const VARIABLE_MAP: Record<string, (ctx: TemplateContext) => string> = {
  // Client
  'Client.FirstName': (ctx) => ctx.client?.firstName || 'Client',
  'Client.LastName': (ctx) => ctx.client?.lastName || '',
  'Client.FullName': (ctx) =>
    [ctx.client?.firstName, ctx.client?.lastName].filter(Boolean).join(' ') || 'Client',
  'Client.Email': (ctx) => ctx.client?.email || '',
  'Client.Phone': (ctx) => ctx.client?.phone || '',
  'Client.Organization': (ctx) => ctx.client?.organization || '',

  // Matter
  'Matter.ID': (ctx) => ctx.matter?.matterNumber || ctx.matter?.id || '',
  'Matter.Title': (ctx) => ctx.matter?.title || '',
  'Matter.Number': (ctx) => ctx.matter?.matterNumber || '',
  'Matter.PracticeArea': (ctx) => ctx.matter?.practiceArea || '',
  'Matter.Type': (ctx) => ctx.matter?.matterType || '',
  'Matter.Status': (ctx) => ctx.matter?.status || '',

  // Firm
  'Firm.Name': (ctx) => ctx.firm?.name || 'The Firm',
  'Firm.Phone': (ctx) => ctx.firm?.phone || '',
  'Firm.Email': (ctx) => ctx.firm?.email || '',

  // Attachment
  'LastAttachment.Name': (ctx) => ctx.lastAttachment?.name || 'your document',
  'LastAttachment.Type': (ctx) => ctx.lastAttachment?.type || 'Document',

  // Current user (sender)
  'User.FirstName': (ctx) => ctx.user?.firstName || '',
  'User.LastName': (ctx) => ctx.user?.lastName || '',
  'User.FullName': (ctx) =>
    [ctx.user?.firstName, ctx.user?.lastName].filter(Boolean).join(' ') || '',
  'User.Email': (ctx) => ctx.user?.email || '',

  // Date
  'Today': () => new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }),
  'Today.Short': () => new Date().toLocaleDateString('en-CA'),
}

/**
 * Injects context variables into a template string.
 * Replaces all {{Variable.Key}} patterns with resolved values.
 */
export function injectTemplateVariables(template: string, ctx: TemplateContext): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, key: string) => {
    const trimmed = key.trim()
    const resolver = VARIABLE_MAP[trimmed]
    if (resolver) return resolver(ctx)
    // Unknown variable - leave as-is for visibility
    return match
  })
}

/**
 * Strips salutation/sign-off for SMS mode.
 * Removes "Dear X," and "Regards, X" patterns.
 */
export function stripForSMS(text: string): string {
  return text
    .replace(/^Dear\s+[^,\n]+,?\s*/i, '')
    .replace(/\n\s*(Regards|Sincerely|Best|Thank you),?\s*\n?.*$/i, '')
    .trim()
}
