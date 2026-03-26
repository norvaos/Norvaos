/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * NorvaOS Permission Matrix
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * SINGLE SOURCE OF TRUTH for role-based access control.
 * Every permission check in the codebase MUST reference this file.
 *
 * ── Terminology ────────────────────────────────────────────────────────────
 *   Entity  – A resource domain (e.g. "billing", "matters")
 *   Action  – An operation on that entity (e.g. "view", "edit")
 *   Key     – The compound form used in comments & error messages: "billing:view"
 *
 * ── Storage ────────────────────────────────────────────────────────────────
 *   roles.permissions  JSONB column, structure:
 *   {
 *     "entity": { "action": boolean, ... },
 *     ...
 *   }
 *   Admin role shortcut: { "all": true } → hasPermission() returns true for everything.
 *
 * ── Permission Modules & Actions ───────────────────────────────────────────
 *
 *   Module          Actions              Notes
 *   ─────────────── ──────────────────── ────────────────────────────────────
 *   contacts        view create edit del
 *   matters         view create edit del
 *   leads           view create edit del
 *   tasks           view create edit del
 *   documents       view create edit del  (portal uploads bypass  -  token auth)
 *   communications  view create edit del
 *   billing         view create edit del  ← see Billing section below
 *   reports         view export           (only 2 actions, no create/edit/del)
 *   settings        view edit             (only 2 actions)
 *   users           view create edit del  (managed in Settings → Users)
 *   roles           view create edit del  (managed in Settings → Roles)
 *   front_desk      view create edit      (Front Desk Mode access + actions)
 *   check_ins       view create           (Kiosk check-in data viewing)
 *   form_packs      view create approve export  (IRCC form pack generation & approval)
 *   conflicts       view create approve   (Conflict search & lawyer review)
 *
 * ── Default System Roles (seeded per tenant) ───────────────────────────────
 *
 *   Role       contacts  matters   leads     tasks     billing   reports   settings  conflicts
 *   ────────── ───────── ───────── ───────── ───────── ───────── ───────── ───────── ─────────
 *   Admin      ALL       ALL       ALL       ALL       ALL       ALL       ALL       ALL
 *   Lawyer     vce-      vce-      vce-      vced      ----      ----      ----      vca
 *   Paralegal  vce-      v-e-      v---      vce-      ----      ----      ----      vc-
 *   Clerk      vc--      v---      v---      vc--      ----      ----      ----      v--
 *
 *   Legend: v=view  c=create  e=edit  d=delete  -=denied  ALL=all actions
 *
 * ── Billing Permissions (Critical Section) ─────────────────────────────────
 *
 *   Key             Where enforced                           Effect
 *   ─────────────── ──────────────────────────────────────── ────────────────
 *   billing:view    /billing page (UI RequirePermission)     See billing dashboard
 *                   /matters/[id] BillingTab (UI)            See billing tab on matter
 *                   /matters/[id] sidebar financial card     See total_billed/paid/trust
 *                   /reports page RevenueSection (UI)        See revenue charts & KPI
 *                   /reports page Revenue KPI StatCard       See revenue KPI card
 *                   /reports page billing type filter        See billing type dropdown
 *                   /reports page KPI CSV export             Include revenue in export
 *                   RetainerBuilder (UI RequirePermission)   Create invoices/payments
 *                   /api/invoices/[id]/pdf (server 403)      Download invoice PDF
 *
 *   billing:create  (future) invoice creation                 Create new invoices
 *
 *   billing:edit    useCommandPermissions hook                Discount pricing in
 *                                                             Intake Command Centre
 *                   (future) invoice line item editing        Edit invoice amounts
 *
 *   billing:delete  (future) invoice deletion                 Delete/void invoices
 *
 *   IMPORTANT: billing:view is the gateway. Without it, a user CANNOT:
 *     • Access /billing page
 *     • See the Billing tab on any matter
 *     • See financial totals (total_billed, total_paid, trust_balance) in sidebar
 *     • Download any invoice PDF (server returns 403 + audit event)
 *     • See revenue-related charts/KPIs/export data on /reports
 *     • Use the RetainerBuilder to create invoices or record payments
 *
 *   Denied UX: billing entity shows "Billing Restricted" (not "Access Restricted")
 *   with zero numeric inference  -  no dollar signs, no financial terms.
 *
 *   The /api/invoices/[id]/pdf route additionally logs a denied audit event
 *   (action: "invoice_pdf_download_denied") with role_name, IP, and user-agent
 *   so security reviews can detect access probing.
 *
 * ── Reports Permissions ────────────────────────────────────────────────────
 *
 *   Key              Where enforced        Effect
 *   ──────────────── ───────────────────── ────────────────────────────────────
 *   reports:view     /reports page (UI)    See any report chart
 *   reports:export   CSV export button     Download CSV from any report
 *
 *   Revenue-specific reports also require billing:view (dual check).
 *
 * ── Settings Permissions ───────────────────────────────────────────────────
 *
 *   Key              Where enforced             Effect
 *   ──────────────── ──────────────────────────  ──────────────────────────────
 *   settings:view    /settings/* pages (UI)     See settings pages
 *   settings:edit    Settings edit forms (UI)   Modify tenant settings
 *                    Doc slot templates (UI)    Create/edit document templates
 *                    Enforcement toggle (DB)    Admin-only at DB trigger level
 *
 * ── Where Checks Happen (Enforcement Points) ──────────────────────────────
 *
 *   Layer            Mechanism                File(s)
 *   ──────────────── ──────────────────────── ────────────────────────────────
 *   UI (client)      <RequirePermission>      components/require-permission.tsx
 *                    canView/canEdit/etc.     lib/utils/permissions.ts
 *                    useCanViewBilling        lib/hooks/use-can-view-billing.ts
 *
 *   API routes       checkBillingPermission   lib/services/billing-permission.ts
 *   (server)         + logAuditServer         Returns 403 + writes audit event
 *
 *   Database (RLS)   has_billing_view()       migrations/033-billing-rls.sql
 *                    SECURITY DEFINER         Blocks Lawyer from billing tables
 *
 *   Database         SECURITY DEFINER RPCs    migrations/027-enforcement.sql
 *   triggers         + role name check        Only Admin can toggle enforcement
 *
 *   Portal (public)  Token-based auth         No role check  -  token = access
 *                    No user session           Document uploads use admin client
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

interface Permissions {
  [entity: string]: {
    [action: string]: boolean
  }
}

interface UserRole {
  permissions: Permissions
  is_system: boolean
  name: string
}

export function hasPermission(
  role: UserRole | null | undefined,
  entity: string,
  action: string
): boolean {
  if (!role) return false
  if (role.name === 'Admin') return true
  return role.permissions?.[entity]?.[action] === true
}

export function canView(role: UserRole | null | undefined, entity: string): boolean {
  return hasPermission(role, entity, 'view')
}

export function canCreate(role: UserRole | null | undefined, entity: string): boolean {
  return hasPermission(role, entity, 'create')
}

export function canEdit(role: UserRole | null | undefined, entity: string): boolean {
  return hasPermission(role, entity, 'edit')
}

export function canDelete(role: UserRole | null | undefined, entity: string): boolean {
  return hasPermission(role, entity, 'delete')
}

export const ENTITIES = [
  'contacts',
  'matters',
  'leads',
  'tasks',
  'documents',
  'communications',
  'billing',
  'reports',
  'settings',
  'users',
  'roles',
  'front_desk',
  'check_ins',
  'form_packs',
  'conflicts',
  'document_templates',
  'document_generation',
  'trust_accounting',
  'analytics',
] as const

export const ACTIONS = ['view', 'create', 'edit', 'delete', 'approve', 'export'] as const

export type Entity = (typeof ENTITIES)[number]
export type Action = (typeof ACTIONS)[number]

// ── Form Pack Permission Helpers ──────────────────────────────────────────────

export function canApprove(role: UserRole | null | undefined, entity: string): boolean {
  return hasPermission(role, entity, 'approve')
}

export function canExport(role: UserRole | null | undefined, entity: string): boolean {
  return hasPermission(role, entity, 'export')
}
