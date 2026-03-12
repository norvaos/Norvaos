import { z } from 'zod/v4'

export const matterIntakeSchema = z.object({
  processing_stream: z.enum(['inland', 'outland', 'hybrid']).nullable().optional(),
  program_category: z.string().nullable().optional(),
  jurisdiction: z.string().min(2).max(5),
  intake_delegation: z.enum(['pa_only', 'spouse_only', 'each_own']),
})

export type MatterIntakeFormValues = z.infer<typeof matterIntakeSchema>

export const riskOverrideSchema = z.object({
  risk_override_level: z.enum(['low', 'medium', 'high', 'critical']),
  risk_override_reason: z.string().min(10, 'Override justification must be at least 10 characters'),
})

export type RiskOverrideFormValues = z.infer<typeof riskOverrideSchema>
