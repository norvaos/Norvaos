/**
 * Zod schemas for Kiosk & Front Desk workflow configuration.
 * Stored in tenants.settings JSONB as kiosk_config and front_desk_config.
 */

import { z } from 'zod/v4'

// ─── Kiosk Configuration ────────────────────────────────────────────

export const kioskStepsSchema = z.object({
  appointment_lookup: z.boolean().default(true),
  identity_verify: z.boolean().default(true),
  id_scan: z.boolean().default(true),
})

export const kioskBrandingSchema = z.object({
  welcome_message: z.string().max(200).default('Welcome! Please check in for your appointment.'),
  logo_url: z.string().url().optional().or(z.literal('')),
  primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#1e293b'),
  background_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#f8fafc'),
})

export const kioskConfigSchema = z.object({
  steps: kioskStepsSchema.optional(),
  branding: kioskBrandingSchema.optional(),
  data_safety_notice: z.string().max(1000).default(
    'Your ID will be scanned for verification purposes only. The scan will be stored securely and automatically deleted after 90 days. By proceeding, you acknowledge and consent to this process.'
  ),
  inactivity_timeout_seconds: z.number().min(30).max(600).default(120),
  confirmation_display_seconds: z.number().min(5).max(60).default(15),
  id_scan_retention_days: z.number().min(1).max(365).default(90),
  max_check_ins_per_hour: z.number().min(1).max(100).default(30),
})

// ─── Front Desk Configuration ───────────────────────────────────────

export const frontDeskActionsSchema = z.object({
  mark_contacted: z.boolean().default(true),
  log_call: z.boolean().default(true),
  send_follow_up: z.boolean().default(true),
  mark_no_answer: z.boolean().default(true),
  schedule_consultation: z.boolean().default(true),
})

export const frontDeskFieldOverridesSchema = z.object({
  call_notes_min_length: z.number().min(0).max(500).default(10),
  follow_up_message_min_length: z.number().min(0).max(500).default(10),
})

export const frontDeskConfigSchema = z.object({
  available_actions: frontDeskActionsSchema.optional(),
  auto_follow_up_threshold: z.number().min(1).max(10).default(3),
  auto_follow_up_template_id: z.string().uuid().optional(),
  show_check_in_queue: z.boolean().default(true),
  show_call_log: z.boolean().default(true),
  visible_lead_statuses: z.array(z.string()).default(['new', 'contacted', 'qualified', 'proposal']),
  field_overrides: frontDeskFieldOverridesSchema.optional(),
})

// ─── Combined config schema for API validation ──────────────────────

export const workflowConfigUpdateSchema = z.object({
  kiosk_config: kioskConfigSchema.optional(),
  front_desk_config: frontDeskConfigSchema.optional(),
})

// ─── Type exports ───────────────────────────────────────────────────

export type KioskConfig = z.infer<typeof kioskConfigSchema>
export type FrontDeskConfig = z.infer<typeof frontDeskConfigSchema>
export type WorkflowConfigUpdate = z.infer<typeof workflowConfigUpdateSchema>
