/**
 * Application version configuration
 * Version is sourced from package.json and injected at build time
 */

export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0'
export const BUILD_SHA = process.env.NEXT_PUBLIC_BUILD_SHA || 'dev'
export const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME || new Date().toISOString()
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'NorvaOS'

/**
 * Core Enforcement Specification version.
 * Must match the version in docs/core-enforcement-spec-v1.md.
 * Bump this when spec invariants change.
 */
export const CORE_ENFORCEMENT_SPEC_VERSION = '1.3.0'

export function getVersionInfo() {
  return {
    version: APP_VERSION,
    build: BUILD_SHA,
    buildTime: BUILD_TIME,
    name: APP_NAME,
    enforcementSpec: CORE_ENFORCEMENT_SPEC_VERSION,
    environment: process.env.NODE_ENV || 'development',
  }
}

/**
 * Subscription plan tiers and their limits
 */
export const PLAN_TIERS = {
  trial: {
    name: 'Trial',
    maxUsers: 2,
    maxStorageGb: 1,
    maxMatters: 25,
    maxContacts: 100,
    features: ['contacts', 'matters', 'leads', 'tasks', 'documents'],
    trialDays: 14,
  },
  starter: {
    name: 'Starter',
    maxUsers: 3,
    maxStorageGb: 5,
    maxMatters: 100,
    maxContacts: 500,
    features: ['contacts', 'matters', 'leads', 'tasks', 'documents', 'notes', 'pipeline'],
    priceMonthly: 4900, // $49.00 in cents
    priceYearly: 47000, // $470.00 in cents (2 months free)
  },
  professional: {
    name: 'Professional',
    maxUsers: 10,
    maxStorageGb: 25,
    maxMatters: -1, // unlimited
    maxContacts: -1,
    features: [
      'contacts', 'matters', 'leads', 'tasks', 'documents', 'notes',
      'pipeline', 'email_sync', 'calendar', 'reports', 'automations',
      'custom_fields', 'client_portal',
    ],
    priceMonthly: 9900, // $99.00
    priceYearly: 95000, // $950.00
  },
  enterprise: {
    name: 'Enterprise',
    maxUsers: -1,
    maxStorageGb: -1,
    maxMatters: -1,
    maxContacts: -1,
    features: [
      'contacts', 'matters', 'leads', 'tasks', 'documents', 'notes',
      'pipeline', 'email_sync', 'calendar', 'reports', 'automations',
      'custom_fields', 'client_portal', 'phone', 'advanced_reporting',
      'api_access', 'sso', 'audit_logs', 'white_label',
    ],
    priceMonthly: 19900, // $199.00
    priceYearly: 190000, // $1,900.00
  },
} as const

export type PlanTier = keyof typeof PLAN_TIERS
