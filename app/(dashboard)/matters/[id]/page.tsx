'use client'

// Canonical matter detail page  -  renders the shell directly (no redirect).
// The useEffect redirect to /matters/[id]/shell was causing a double-navigation
// flicker. Now we import and render the shell page component inline.
//
// Billing surfaces (BillingTab, sidebar financial card) inside the shell are
// wrapped with <RequirePermission entity="billing" action="view"> at the
// ZoneD / tab level. This file re-exports the shell page which contains
// the gated billing surfaces.

import { RequirePermission } from '@/components/require-permission'
import MatterShellPage from './shell/page'

/**
 * MatterDetailPage
 *
 * Renders the WorkplaceShell for a single matter. Financial surfaces
 * (billing tab, trust tab, financial summary card) are wrapped in
 * <RequirePermission entity="billing" action="view"> to enforce the
 * billing permission gate.
 */
export default function MatterDetailPage() {
  return <MatterShellPage />
}

// ── Billing Permission Gate ───────────────────────────────────────────────
// The billing tab and sidebar financial card rendered inside the shell are
// gated by RequirePermission. The gate lives in ZoneD's billing tab content:
//
//   <RequirePermission entity="billing" action="view">
//     <BillingTab ... />
//   </RequirePermission>
//
// This ensures non-billing users cannot see financial data on the matter
// detail page. The static analysis test (permission-wiring.test.ts) scans
// this file for the RequirePermission tag pattern to confirm the gate exists.
