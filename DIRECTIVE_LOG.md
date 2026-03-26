# NorvaOS Directive Execution Log

Immutable record of all directive implementations. Each entry records what was built, where it lives, and the compliance guarantees it provides.

---

## Directive 004: The Compliance Lockdown
**Status:** COMPLETE (2026-03-25)

### Migration 200  -  Immutable Trust Ledger Audit
- SHA-256 hash chain on trust_audit_log (TRUST_AUDIT_GENESIS_BLOCK_v1 seed)
- trust_audit_verify_chain() verification function
- reason_for_change column on trust_transactions (mandatory)
- compliance_examination_snapshots table (immutable, checksummed)
- rpc_generate_compliance_snapshot RPC
- **ACKNOWLEDGED: Migration 200 is complete and verified.**

### Migration 201  -  Automated Three-Way Reconciliation
- reconciliation_discrepancies table with auto-lock triggers
- Disbursement lockdown on discrepancy detection
- Auto-unlock when all discrepancies resolved
- rpc_auto_reconcile RPC (full 7-step automated workflow)
- reconciliation_schedule table for cron scheduling

### Migration 202  -  PIPEDA Data Sovereignty
- data_sovereignty_log (append-only, immutable)
- pii_access_registry with 12 seeded PII column definitions
- pii_decryption_log for decrypt audit
- norva_decrypt_audited() function
- v_pii_encryption_status view

### Migration 203  -  Deadline Shield
- is_shielded, shield_reason columns on matter_deadlines
- ircc_deadline_rules table with 14 IRCC rules seeded
- shield_deadline_guard() trigger (prevents deletion of shielded deadlines)
- rpc_scan_matter_deadlines RPC (auto-scan on matter creation)
- auto_scan_on_matter_create trigger

### Service Layer
- lib/services/trust-accounting/compliance-examination-service.ts
- lib/services/trust-accounting/auto-reconciliation-service.ts
- lib/services/data-sovereignty/index.ts (PIPEDA geo-enforcement)
- lib/services/data-sovereignty/pii-encryption-service.ts (AES-256-GCM)
- lib/services/deadline-shield/index.ts (multi-layer alerts)
- middleware.ts updated with sovereignty check

### API Routes
- /api/trust-accounting/compliance-snapshots (GET/POST)
- /api/trust-accounting/auto-reconcile (POST)
- /api/trust-accounting/disbursement-lock (GET)
- /api/cron/auto-reconcile (POST)
- /api/deadline-shield/scan (POST)
- /api/deadline-shield/rules (GET)
- /api/deadline-shield/shielded (GET)
- /api/internal/sovereignty-log (POST)

---

## Directive 005.1  -  Trust Ledger "Immutable Foundation"

**Status:** COMPLETE
**Date:** 2026-03-25
**Migration:** `scripts/migrations/200-trust-ledger-audit-immutable.sql`

### What was built

| Artefact | Location |
|----------|----------|
| `trust_ledger_audit` table | Migration 200 |
| Immutability triggers (UPDATE/DELETE blocked) | Migration 200 |
| Auto-audit trigger on `trust_transactions` INSERT | Migration 200 |
| SHA-256 content hash tamper detection | Migration 200 |
| `verify_trust_ledger_audit_integrity()` function | Migration 200 |
| `TrustLedgerAuditRow` / `TrustLedgerAuditInsert` types | `lib/types/database.ts` |

### Compliance guarantees

- **INSERT-only enforcement**: DB triggers + RLS  -  no UPDATE/DELETE policies exist
- **Transactional integrity**: Audit trigger fires AFTER INSERT on `trust_transactions`; if audit fails, the transaction rolls back  -  zero ghost-money
- **Tamper detection**: SHA-256 hash of all critical fields stored per audit entry
- **Balance continuity**: `verify_trust_ledger_audit_integrity()` checks hash + balance chain
- **Tenant isolation**: RLS policy `tenant_id = auth.uid()` on all rows

### Architecture

```
trust_transactions INSERT
  -> BEFORE INSERT trigger (compute running balance, overdraft check)
  -> Row inserted
  -> AFTER INSERT trigger (auto-insert trust_ledger_audit)
     -> If audit fails -> entire transaction ROLLS BACK
```

---

## Directive 005.2  -  Global Conflict Check Engine

**Status:** IN PROGRESS (2026-03-25)

### Migration 204  -  Global Conflict Engine
- search_contacts_fuzzy RPC (pg_trgm, threshold 0.3)
- search_leads_fuzzy RPC
- search_matters_by_party RPC
- fn_global_conflict_scan RPC (cross-entity)
- global_conflict_results table
- GIN trigram indexes on leads

---

## Directive 005.3  -  Compliance "Kill Switch"

**Status:** COMPLETE
**Date:** 2026-03-25

### What was built

| Artefact | Location |
|----------|----------|
| `CriticalComplianceError` class | `lib/supabase/region-guard.ts` |
| `enforceRegionCompliance()`  -  boot-level check | `lib/supabase/region-guard.ts` |
| `detectSupabaseRegion()`  -  parses pooler/env | `lib/supabase/region-guard.ts` |
| `getRegionStatus()`  -  non-throwing for dashboard | `lib/supabase/region-guard.ts` |
| Module-level enforcement in server.ts | `lib/supabase/server.ts` |
| Module-level enforcement in admin.ts | `lib/supabase/admin.ts` |

### Compliance guarantees

- **Boot-level enforcement**: `enforceRegionCompliance()` runs at module load before any DB client is created
- **Multi-source detection**: Checks `SUPABASE_REGION` env, `DATABASE_URL` pooler string, and `NEXT_PUBLIC_SUPABASE_URL`
- **Production hard-fail**: If region is not `ca-central-1` in production, throws `CriticalComplianceError` and halts
- **Development grace**: Warns in dev/localhost but does not block
- **Dashboard integration**: `getRegionStatus()` feeds the compliance dashboard without throwing

---

## Directive 005.4  -  Document Vault Zero-Knowledge Preview

**Status:** COMPLETE
**Date:** 2026-03-25

### What was built

| Artefact | Location |
|----------|----------|
| 60-second signed URL generation | `app/api/documents/view/route.ts` |
| SENTINEL access logging on every view | `app/api/documents/view/route.ts` |
| Server-side proxy for PDF/image (no URL exposure) | `app/api/documents/view/route.ts` |
| Cache-Control: no-store (zero caching) | `app/api/documents/view/route.ts` |

### Compliance guarantees

- **No permanent URLs**: Every document access generates a 60-second TTL signed URL via Supabase Storage
- **Zero client exposure**: Signed URLs are consumed server-side only; client never sees the storage URL
- **Every access logged**: SENTINEL `PDF_VAULT_ACCESS` event with document_id, file_name, TTL, timestamp
- **No caching**: `Cache-Control: private, no-store, max-age=0`  -  browser cannot cache document content
- **Graceful fallback**: If signed URL generation fails, falls back to server proxy (still authenticated + logged)

---

## Directive 006  -  In-House Compliance Dashboard

**Status:** COMPLETE
**Date:** 2026-03-25

### What was built

| Artefact | Location |
|----------|----------|
| `/admin/compliance` page | `app/(dashboard)/admin/compliance/page.tsx` |
| `/api/admin/compliance-health` API | `app/api/admin/compliance-health/route.ts` |

### Health checks displayed

1. **Region Lock**  -  Confirms connection is in `ca-central-1` (via `getRegionStatus()`)
2. **Encryption Status**  -  Samples PII columns, verifies ciphertext format (`iv:authTag:ciphertext`)
3. **Audit Parity**  -  Compares `trust_transactions` count vs `trust_ledger_audit` count (delta must be 0)
4. **SENTINEL Summary**  -  24-hour event breakdown by severity (breach/critical/warning/info) and type

### Features

- Auto-refreshes every 30 seconds
- Overall status badge: COMPLIANT / WARNING / CRITICAL
- Detailed JSON view of each check's raw results
- Admin-only access (requires `settings:view` permission)

---

## Directive 007  -  Automated "Disaster" Recovery Test

**Status:** IN PROGRESS (2026-03-25)
- e2e/disaster-recovery-audit.spec.ts (6 suites)

---

## Directive 008  -  System-Wide Telemetry

**Status:** COMPLETE
**Date:** 2026-03-25

### What was built

| Artefact | Location |
|----------|----------|
| Enhanced `beforeSend` with NorvaOS event classification | `sentry.server.config.ts` |
| `reportRLSViolation()`  -  RLS failure reporter | `lib/monitoring/error-reporter.ts` |
| `reportConflictFailure()`  -  conflict engine reporter | `lib/monitoring/error-reporter.ts` |
| `reportTrustError()`  -  trust accounting reporter | `lib/monitoring/error-reporter.ts` |
| `reportComplianceViolation()`  -  PIPEDA reporter | `lib/monitoring/error-reporter.ts` |
| SENTINEL API guard wired to Sentry | `lib/middleware/sentinel-api-guard.ts` |

### Event classification (Sentry tags)

| `norva_category` tag | Trigger | Sentry Level |
|---------------------|---------|-------------|
| `rls_violation` | PostgreSQL 42501 / insufficient_privilege | error |
| `trust_accounting` | Trust ledger/balance/immutable errors | fatal |
| `conflict_check` | Conflict scan/engine failures | error |
| `compliance_violation` | CRITICAL_COMPLIANCE_ERROR / PIPEDA | fatal |
| `sentinel_security` | Any SENTINEL-prefixed event | warning |
| `immutability_violation` | IMMUTABLE_VIOLATION attempts | fatal |

### Zero-silent-failure guarantee

- Every 500 error in SENTINEL-guarded routes → Sentry with full stack trace
- Every RLS violation → Sentry + SENTINEL audit log
- Every trust accounting anomaly → Sentry at FATAL level
- Every compliance breach → Sentry at FATAL level

---

## Directive 009  -  Smart Document Precision Benchmarking

**Status:** IN PROGRESS (2026-03-25)
- Document classifier benchmark tests
- OCR ID parser benchmark tests
- Document extractor benchmark tests
- Precision metrics utility

---

## Directive 012  -  SaaS "High-Velocity" Optimization

**Status:** COMPLETE
**Date:** 2026-03-25

### 12.1  -  Optimistic UI + Realtime Dashboard Sync

| Artefact | Location |
|----------|----------|
| Optimistic upload mutation (`onMutate` / `onError` rollback) | `lib/queries/documents.ts` |
| Enhanced `useDocumentRealtime` (slots + readiness invalidation) | `lib/hooks/use-document-realtime.ts` |
| `useDashboardDocumentRealtime` (tenant-wide listener) | `lib/hooks/use-document-realtime.ts` |
| Portal upload broadcast | `app/api/portal/[token]/upload-document/route.ts` |
| `document:uploaded` cross-tab sync | `lib/hooks/use-cross-tab-sync.ts` |

#### Guarantees
- **Zero-flicker uploads**: `onMutate` injects optimistic document entry; UI updates instantly before server round-trip
- **Automatic rollback**: `onError` restores previous cache state  -  no stale optimistic data persists on failure
- **Live dashboard sync**: Supabase Realtime broadcast + postgres_changes invalidate document-slots, readiness, and matter-dashboard caches
- **Cross-tab consistency**: BroadcastChannel propagates `document:uploaded` events to all open tabs

### 12.2  -  Zero-Noise Notification Engine (Smart Batching)

| Artefact | Location |
|----------|----------|
| `checkAndNotifyReadiness()`  -  category-aware readiness check | `lib/services/matter-readiness-notifier.ts` |
| `document_uploaded` channels suppressed | `lib/services/notification-engine.ts` |
| `matter_ready_for_review` notification type | `lib/services/notification-engine.ts` |
| Upload route wired to readiness check | `app/api/documents/upload/route.ts` |

#### Guarantees
- **Single alert per milestone**: Lawyers receive one `matter_ready_for_review` notification when all Identity + Financial required slots are filled  -  not one per document
- **1-hour deduplication**: Prevents duplicate alerts within a 60-minute window
- **All channels**: `matter_ready_for_review` fires on in-app, email, and push simultaneously
- **Per-document noise eliminated**: `document_uploaded` default channels set to `false` across all delivery methods

---

## Directive 016  -  "Emerald Flow" Dashboard UI

**Status:** COMPLETE
**Date:** 2026-03-25

### What was built

| Artefact | Location |
|----------|----------|
| Emerald Pulse Critical animation (`<35` readiness) | `app/globals.css` |
| Emerald Glow animation (shield complete) | `app/globals.css` |
| Sovereign Sparkle + Chain-Lock Dissolve animations | `app/globals.css` |
| Sovereign Purple background track on ScoreRing | `components/matters/vitality-header/readiness-zone.tsx` |
| Emerald Green ring glow when shield domains 100% | `components/matters/vitality-header/readiness-zone.tsx` |
| Low-readiness (`<35`) pulse wrapper on ReadinessZone | `components/matters/vitality-header/readiness-zone.tsx` |
| "Shield Complete" badge (emerald) at 95+ with shield met | `components/matters/vitality-header/readiness-zone.tsx` |
| `ChainLockActivateButton` (Lock → Sparkle on genesis) | `components/matters/chain-lock-activate-button.tsx` |
| Genesis block query hook (`useGenesisBlock`) | `components/matters/chain-lock-activate-button.tsx` |
| Genesis block mutation (`useGenerateGenesisBlock`) | `components/matters/chain-lock-activate-button.tsx` |
| Button wired into CommandToolbar | `components/matters/command-toolbar.tsx` |
| Genesis block cache invalidation on realtime | `lib/hooks/use-document-realtime.ts` |

### Pre-existing (Directive 015)

| Artefact | Location |
|----------|----------|
| `matter_genesis_metadata` table (immutable) | `scripts/migrations/205-matter-genesis-block.sql` |
| `fn_generate_matter_genesis_block` RPC | `scripts/migrations/205-matter-genesis-block.sql` |
| Immutability triggers (UPDATE/DELETE blocked) | `scripts/migrations/205-matter-genesis-block.sql` |

### Visual States

1. **Readiness < 35%**: Sovereign Purple pulse animation on entire ReadinessZone wrapper (heartbeat border glow)
2. **Readiness ≥ 95%, shield incomplete**: Gold ring glow + "Ready for Fast-Track" badge (existing)
3. **Readiness ≥ 95%, shield complete**: Emerald Green ring glow + "Shield Complete" badge
4. **Activate button (no genesis)**: Sovereign Purple gradient, Lock icon
5. **Activate button (generating)**: Spinner + "Sealing..."
6. **Activate button (sealed)**: Lock dissolves → Sparkles animate in → "Matter Sealed" with emerald styling

### Shield Domains

The Readiness Ring glows Emerald Green when ALL of these domains reach 100%:
- **Documents** (22% weight)
- **Review** (18% weight)
- **Compliance** (11% weight)

### Real-Time "Breeze"

Document classification → `broadcastDocumentStatus()` → Supabase Realtime `document_status_changed` → `useDocumentRealtime` invalidates `['readiness', matterId]` + `['genesis-block', matterId]` → TanStack Query refetch → score ticks up immediately without refresh

---

## Directive 016.1  -  "Sovereign Sparkle" & Guard

**Status:** COMPLETE
**Date:** 2026-03-25

### What was built

| Artefact | Location |
|----------|----------|
| `GenesisGuard` component (readiness < 100 → disabled) | `components/matters/chain-lock-activate-button.tsx` |
| Sovereign Confetti (Emerald Green + Sovereign Gold) | `components/matters/chain-lock-activate-button.tsx` |
| Matter status → ACTIVE on genesis seal | `components/matters/chain-lock-activate-button.tsx` |
| `readinessScore` prop on CommandToolbar | `components/matters/command-toolbar.tsx` |
| `DocumentTamperOverlay` (backdrop-blur + red warning) | `components/matters/document-tamper-overlay.tsx` |
| `TamperStatusIndicator` (inline verify/tampered badge) | `components/matters/document-tamper-overlay.tsx` |
| Tamper indicator wired into SlotCard | `components/matters/document-slot-panel.tsx` |
| `GET /api/matters/[id]/export-audit` (LSO-Ready PDF) | `app/api/matters/[id]/export-audit/route.ts` |

### GenesisGuard Logic

- If `readinessScore < 100` AND `genesisBlock === null` → button disabled with Sovereign Purple + tooltip: "Shield Requirements Incomplete: View Readiness Report."
- If `readinessScore >= 100` → button enabled, ready to seal

### Activation Sequence

1. User clicks "Activate Matter"
2. `fn_generate_matter_genesis_block` RPC called
3. Matter status updated to `active`
4. **Sovereign Confetti** burst: `canvas-confetti` with Emerald Green (#50C878) + Sovereign Gold (#D4AF37) palette  -  triple burst (left, right, centre starburst)
5. Lock icon dissolves → Sovereign Sparkle animates in → "Matter Sealed"
6. All caches invalidated (genesis-block, readiness, matters)

### Integrity Overlay

- `TamperStatusIndicator` on every SlotCard document row
- If `tamper_status === 'tampered'` → red pulsing "TAMPERED" badge
- If `tamper_status === 'verified'` → emerald "Verified" badge
- If unchecked → "Verify" button calls `POST /api/documents/verify-integrity`
- `DocumentTamperOverlay` wraps preview with backdrop-blur + red "Tamper Warning" overlay when tampered

### LSO-Ready Audit Export

- `GET /api/matters/[id]/export-audit` → password-protected PDF
- Password: matter number
- 4 sections: Genesis Block (3-pillar breakdown), Immutable Trust Ledger, Trust Audit Trail, Conflict Justification
- Permissions: printing allowed, modification/copying blocked
- SENTINEL logged: `AUDIT_EXPORT_GENERATED` event
- Cache-Control: `private, no-store, max-age=0`

---

## Directive 019  -  "Sovereign Summary" Dashboard

**Status:** COMPLETE
**Date:** 2026-03-26

### What was built

| Artefact | Location |
|----------|----------|
| Data Hardening Integrity API check | `app/api/admin/compliance-health/route.ts` (`checkHardeningIntegrity`) |
| Data Hardening Integrity dashboard widget | `app/(dashboard)/admin/compliance/page.tsx` |
| Pre-Flight Checklist modal (3-check hard-gate) | `components/matters/pre-flight-checklist.tsx` |
| Pre-Flight wired into GenesisGuard activation flow | `components/matters/chain-lock-activate-button.tsx` |

### Data Hardening Integrity Widget (Compliance Dashboard)

Displays 4 real-time metrics on `/admin/compliance`:
- **Gaps Closed**  -  required document slots that reached `accepted` status (with progress bar)
- **Inconsistencies Pre-empted**  -  SENTINEL events for OCR_MISMATCH, CONTRADICTION_DETECTED, FIELD_VERIFICATION_MISMATCH, DATA_CORRECTION
- **Genesis Blocks Sealed**  -  count of sealed genesis blocks (compliant vs total)
- **Document Integrity**  -  verified vs tampered document counts

### Pre-Flight Checklist (Directive 019 Hard-Gate)

Before the "Sovereign Sparkle" can trigger, a modal displays three hard-gate checks:

1. **Identity: 100% Match**  -  Passport vs. Intake data. Queries `identity_verifications` for the primary contact; requires `status = 'verified'` with `confidence_score >= 80`
2. **History: 0 Days Unaccounted**  -  Complete immigration timeline. Queries `matter_immigration.questionnaire_pct` (must be 100%) and `field_verifications` for unverified history fields (must be 0)
3. **Trust: Hash Chain Intact**  -  Immutable ledger parity. Compares `trust_transactions` count vs `trust_ledger_audit` count (delta must be 0)

Only after all three green checks appear does the "Generate Genesis Block" button become active inside the modal.

### "Un-Rejectable" Logic Flow

1. User clicks "Activate Matter" → Pre-Flight Checklist modal opens (instead of direct genesis generation)
2. Modal runs 3 checks against live database
3. All pass → "Generate Genesis Block" button enables inside the modal
4. User clicks "Generate Genesis Block" → modal closes → genesis RPC fires → Sovereign Confetti → Matter Sealed
5. Any check fails → button stays disabled, red summary shows failure count, "Re-check" button available

---

## Directive 020  -  "Matrix Manifesto" Integration

**Status:** COMPLETE
**Date:** 2026-03-26

### What was built

| Artefact | Location |
|----------|----------|
| `useFirmHealth()` hook  -  aggregate compliance polling | `lib/hooks/use-firm-health.ts` |
| `.sovereign-pulse-amber` CSS animation | `app/globals.css` |
| `.sovereign-pulse-red` CSS animation | `app/globals.css` |
| Sidebar pulse integration | `components/layout/sidebar.tsx` |

### useFirmHealth() Hook

- Polls `/api/admin/compliance-health` every 30 seconds via TanStack Query
- Returns `overallStatus` ('COMPLIANT' | 'WARNING' | 'CRITICAL'), `riskLevel` ('low' | 'medium' | 'high'), `shouldPulseAmber` boolean
- Drives the sidebar visual state: amber glow for WARNING, red glow for CRITICAL

### Sovereign Pulse Animations

- `sovereign-pulse-amber`: 2.5s ease-in-out infinite  -  soft amber box-shadow glow on sidebar when firm risk is medium
- `sovereign-pulse-red`: 1.8s ease-in-out infinite  -  urgent red box-shadow glow when firm risk is high/critical
- Applied to the sidebar `<aside>` element conditionally based on `useFirmHealth()` state

---

## Directive 022  -  "LSO-Ready" Forensic Export

**Status:** COMPLETE
**Date:** 2026-03-26

### What was built

| Artefact | Location |
|----------|----------|
| Enhanced Forensic Export API | `app/api/matters/[id]/export-audit/route.ts` |
| Global Expiry Dashboard API | `app/api/admin/global-expiry/route.ts` |
| Global Expiry Dashboard page | `app/(dashboard)/admin/global-expiry/page.tsx` |
| Sovereign Share ReadinessGauge | `components/matters/readiness-gauge.tsx` |

### Forensic Footer (Every Page)

- Every page of the PDF now includes a forensic footer with:
  - **Global Firm Hash**: HMAC-SHA256 of tenant_id + all genesis hashes across the firm
  - **Matter Genesis Hash**: SHA-256 hash from the matter's genesis block
  - Generation timestamp and page number
- Proves the document was generated directly from the immutable chain

### Closing Certificate (LSO Rule 3.7)

- If matter status is `closed_won`, `closed_lost`, or `closed`, Section 5 is appended to the PDF
- **Zero-Balance Verification**: Checks `running_balance_cents` on the last trust transaction
- If `trust_balance === 0`: Closing Certificate issued with full compliance stamp (emerald)
- If `trust_balance !== 0`: **COMPLIANCE FAILURE**  -  red alert: "Residual Trust Funds Detected"  -  certificate NOT issued
- SENTINEL logs closing certificate status: `ISSUED` or `BLOCKED_RESIDUAL_FUNDS`

### Global Expiry Dashboard

- `/admin/global-expiry`  -  Principal Lawyer view of all clients sorted by "Days to Expiry"
- Colour heatmap: >180 days (Grey), 90-180 days (Amber Pulse), <90 days (Sovereign Red)
- Summary cards showing counts per colour band
- Each row: contact name, document type, expiry date, days remaining, linked matter number
- Auto-refreshes every 30 seconds

### Sovereign Share ReadinessGauge

- SVG circular gauge showing real-time readiness percentage
- Colour-coded: red (<35%), amber (35-69%), green (70-94%), emerald (95-100%)
- Optional domain breakdown (Documents, Review, Compliance, Financials, Client Info)
- Shows "Genesis Sealed" badge when genesis block exists

---

## Directive 025  -  "Firm-Wide Oversight" Dashboard

**Status:** COMPLETE
**Date:** 2026-03-26

### What was built

| Artefact | Location |
|----------|----------|
| Firm Oversight API | `app/api/admin/firm-oversight/route.ts` |
| Firm Oversight Dashboard page | `app/(dashboard)/admin/firm-oversight/page.tsx` |

### Oversight Command Widget

- `/admin/firm-oversight`  -  "5-Second Health Check" for the Principal Lawyer
- **Matrix Grid**: Two columns  -  "Hardened" (Genesis Sealed) vs "Soft" (In-Progress)
- Summary cards: Total Active, Hardened (emerald), Soft (amber), Integrity Breaches (red)
- Each matter card shows: matter_number, title, status, genesis hash, trust balance, integrity status

### Red Alert Pulse

- If ANY matter's `trust_ledger_audit` hash chain fails verification (via `verify_trust_ledger_audit_integrity()` RPC), the dashboard triggers a pulsing red banner: "INTEGRITY BREACH DETECTED"
- **"Investigate Breach" button** on breached matters jumps directly to `/matters/{id}?tab=trust`

### API Design

- Batch queries to avoid N+1: genesis metadata and trust transactions fetched in bulk, indexed by matter_id
- Integrity verification via `verify_trust_ledger_audit_integrity` RPC per matter (wrapped in try/catch, falls back to 'unchecked')
- Auto-refreshes every 15 seconds

### Sovereign Manifesto (Current State)

| Feature | Hard-Gate (Shield) | Breeze (UX) |
|---------|-------------------|-------------|
| Intake | Conflict Search + RLS | OCR ID Injection |
| Processing | Gapless Continuity Check | Real-Time Readiness Score |
| Activation | 3-Gate Pre-Flight Modal | Sovereign Confetti |
| Oversight | Global Hash Verification | 5-Second Firm Pulse |

---

## Directive 026  -  "Pilot Launch" Hardening

**Status:** COMPLETE
**Date:** 2026-03-26

### What was built

| Artefact | Location |
|----------|----------|
| Audit Simulation API | `app/api/admin/audit-simulation/route.ts` |
| Audit Simulation UI (compliance dashboard) | `app/(dashboard)/admin/compliance/page.tsx` |
| Emergency Override service | `lib/services/emergency-override.ts` |
| Emergency Override API | `app/api/admin/emergency-override/route.ts` |
| PII Ghost Scrub (lead conversion) | `lib/services/lead-conversion-executor.ts` (step 5q) |

### Audit Simulation Mode

- "Simulate LSO Examination" toggle on `/admin/compliance` dashboard
- Runs 100% integrity check on ALL active matters:
  - Genesis block sealed or missing
  - Trust ledger parity (transactions vs audit entries)
  - Hash chain integrity via `verify_trust_ledger_audit_integrity()` RPC
  - Trust balance verification
- Returns `BATTLE_READY` or `ISSUES_FOUND` verdict
- Per-matter export links to generate individual LSO-Ready PDFs
- SENTINEL logged: `AUDIT_SIMULATION_EXECUTED`

### Emergency Override (Partner PIN)

- POST `/api/admin/emergency-override`  -  requires Partner/Admin role + 6+ digit PIN
- Supported override types: `TRUST_OVERDRAFT`, `GENESIS_BYPASS`, `DEADLINE_OVERRIDE`, `CLOSING_OVERRIDE`
- HMAC-SHA256 hash of override action generated and logged
- Failed PIN attempts logged to SENTINEL as `EMERGENCY_OVERRIDE_DENIED` (critical severity)
- Successful overrides logged as `EMERGENCY_OVERRIDE_EXECUTED` (critical severity)
- Override hash is immutable proof of the action

### Final PII Scrub (Lead Ghosting)

- After lead-to-matter conversion (step 5q in executor), all encrypted PII fields are nulled:
  - `first_name_encrypted` → null
  - `last_name_encrypted` → null
  - `email_encrypted` → null
  - `phone_encrypted` → null
  - `custom_intake_data` → `{ _ghosted: true, _ghosted_at: timestamp }`
- Real data lives on the contact and matter  -  the lead record becomes a "ghost"
- Non-fatal: scrub failure does not block conversion

### "Battle-Ready" Scorecard

| Layer | Shield (Hard-Gate) | Breeze (Efficiency) |
|-------|-------------------|---------------------|
| FIRM | Global HMAC Hash Chain | 5-Second Health Matrix |
| MATTER | Zero-Balance Closing Gate | Real-Time Readiness Gauge |
| CLIENT | 180-Day Expiry Pulse | OCR Identity Injection |
| CONTACT | RLS PII Protection | 3-Second Conflict Click |

---

## Directive 029  -  "Norva Sovereign Academy" (Pilot Finalization)

**Status:** COMPLETE
**Date:** 2026-03-26

### What was built

| Artefact | Location |
|----------|----------|
| Academy page with 3 video modules | `app/(dashboard)/academy/page.tsx` |
| Certification hook | `lib/hooks/use-certification.ts` |
| Gold Sparkle CSS animation for certified avatars | `app/globals.css` (`sovereign-certified-avatar`) |
| Gold Sparkle wired into sidebar avatar | `components/layout/sidebar.tsx` |
| Academy nav item added | `lib/config/navigation.ts` |

### Academy Modules

1. **Module 1: The Fortress Foundations**  -  RLS, immutable ledgers, HMAC hash chains, PIPEDA enforcement
2. **Module 2: Intake to Genesis  -  The Breeze**  -  Lead intake, OCR, conflict scan, readiness, genesis activation
3. **Module 3: Sovereign Oversight  -  The Shield**  -  Compliance dashboard, audit simulation, emergency overrides, expiry sentinel

### Certification Flow

1. User navigates to `/academy` and completes each module (video + "Mark as Completed" button)
2. Completed modules stored in `auth.users.user_metadata.academy_completed_modules` array
3. When all 3 modules complete → `norva_certified: true` + `norva_certified_at` timestamp set in metadata
4. `useCertification()` hook reads metadata, returns `isCertified` boolean
5. Sidebar avatar conditionally applies `.sovereign-certified-avatar` class → Gold Sparkle border animation

### "Sovereign Certified" UI

- Certified users see a Gold Sparkle pulsing border around their sidebar avatar
- Academy page shows a Sovereign Gold progress bar and "Sovereign Certified" badge
- Certification card with Trophy icon and congratulatory message

---

## Directive 030  -  "Norva Sovereign Ignition" (Pilot Deployment)

**Status:** COMPLETE
**Date:** 2026-03-26

### What was built

| Artefact | Location |
|----------|----------|
| Pilot provisioning script | `scripts/admin/provision-pilot-firm.ts` |
| Continuity Sequence cron route | `app/api/cron/continuity-sequence/route.ts` |

### Pilot Provisioning Script

Usage: `npx tsx scripts/admin/provision-pilot-firm.ts --tenant-id <uuid> --firm-name "Firm Name"`

Steps:
1. Verifies tenant exists in database
2. Sets tenant settings: `sentinel_pulse_interval: 24h`, `continuity_cron_schedule: 0 2 * * *`, academy video URLs
3. Enables 10 pilot feature flags (front_desk_mode, conflict_engine, genesis_block, audit_simulation, etc.)
4. Checks IRCC deadline rules are seeded
5. Logs `PILOT_FIRM_PROVISIONED` to SENTINEL audit trail

### Continuity Sequence (02:00 AM Cron)

`POST /api/cron/continuity-sequence`  -  protected by CRON_SECRET bearer token

Nightly checks across all active tenants:
1. **Address history gaps**: Scans all active matters for timeline discontinuities
2. **Document expiry**: Identifies documents expiring within 180-day window
3. **Stale matters**: Detects active matters with no updates in 7+ days
4. **Shadow matter triggers**: Processes pending prospect triggers

### Norva Sovereign Manifesto  -  FINAL STATUS

| Module | Status | Security Level |
|--------|--------|---------------|
| Intake Gate | LOCKED | RLS + Conflict Hard-Gate |
| Trust Ledger | IMMUTABLE | SHA-256 Hash Chain |
| Matter Identity | SEALED | Norva Genesis Block |
| Data Continuity | VERIFIED | 0-Day Gap Enforcement |
| Oversight | GLOBAL | HMAC Firm-Wide Pulse |

---

## Directive 031  -  ToS "Hard-Gate" Integration

**Status:** COMPLETE
**Date:** 2026-03-26

### What was built

| Artefact | Location |
|----------|----------|
| ToS Acceptance Modal component | `components/admin/tos-acceptance-modal.tsx` |
| `useTosAcceptance()` hook  -  checks acceptance status | `components/admin/tos-acceptance-modal.tsx` |
| `useAcceptTos()` mutation  -  generates hash + stores Block 0 | `components/admin/tos-acceptance-modal.tsx` |

### ToS Hard-Gate Logic

1. Before Norva Sovereign Ignition, the ToS modal **must** be displayed
2. "Accept and Seal" button is **disabled for 10 seconds** (countdown timer) to force scroll-through
3. User must also **scroll to the bottom** of the document  -  both conditions required
4. On accept → SHA-256 hash generated from `user_id + timestamp + tos_version`
5. Hash is generated client-side via `crypto.subtle.digest('SHA-256', ...)`

### Signature Hash Vault

- Stored in `firm_global_audit_ledger` as event type `TOS_ACCEPTED`
- Block 0 entry with details: `tos_version`, `accepted_by`, `accepted_at`, `signature_hash`, `block_number: 0`, `mathematical_finality: true`
- Immutable  -  cannot be modified or deleted (append-only ledger)

### ToS Sections (Version 1.0.0)

1. Platform Access and Licence
2. Data Sovereignty and Immutability
3. Trust Accounting Compliance
4. Genesis Block and Compliance Seal
5. **Mathematical Finality Clause** (the forced-read section)
6. Emergency Override Protocol
7. Limitation of Liability
8. Acceptance and Digital Signature

### Guard Conditions

- `countdown > 0` → button locked with amber Lock icon + seconds remaining
- `!hasScrolled` → "Scroll to bottom required" indicator
- Both conditions met → emerald "Accept and Seal" button activates
- After acceptance → signature hash displayed with Sparkles icon

---

## Session A: "Prestige" Architect  -  Glass Fortress & Ignition Ceremony

**Status:** COMPLETE
**Date:** 2026-03-26

### 1. Glass Fortress Dashboard (Workspace Mastery)

| Artefact | Location |
|----------|----------|
| Glass Fortress Matrix component | `components/dashboard/glass-fortress-matrix.tsx` |
| Glassmorphism CSS (bento card, heatmap pulse, gold aura) | `app/globals.css` |
| Wired into main dashboard | `app/(dashboard)/page.tsx` (lazy-loaded) |

#### "Bento-Box" Glassmorphism

- `bg-white/[0.04] backdrop-blur-xl` frosted glass surfaces
- 0.05 opacity emerald borders (`border-emerald-500/15`)
- Rounded-2xl  -  no sharp edges, every card is polished jade
- Smooth hover transitions: `translateY(-4px) scale(1.01)` + emerald glow shadow

#### Norva Sovereign Matrix

- Displays all active matters in a bento grid with real-time data
- **Firm Hash Card**: HMAC-SHA256 Global Firm Hash computed client-side from all genesis hashes + tenant_id
- **Health Pulse Card**: Real-time compliance status from `useFirmHealth()` with gap closure progress bar
- Auto-refreshes every 30 seconds

#### Micro-Audit Trace (500ms Hover)

- When user hovers over a sealed matter card for 500ms:
  - `bg-black/70 backdrop-blur-md` overlay fades in
  - Genesis Hash displayed with `Fingerprint` icon (emerald)
  - Visual hash-chain connector (gradient line with `Link2` icon)
  - Global Firm Hash displayed with `Hash` icon (violet)
  - Demonstrates cryptographic linkage between matter and firm chain

#### High-Fidelity SVG Readiness Ring

- SVG circular gauge with animated stroke-dasharray/stroke-dashoffset
- Colour-coded: red (≤34), amber (40-69), green (70-89), emerald (90-99), emerald+gold-glow (100)
- **Heat-Map Red**: `glass-heatmap-pulse` animation for locked matters (≤34)
- **Gold Aura**: `glass-gold-aura` animation for perfect-score matters (100)
- 700ms ease-out transition on score changes

### 2. Ignition Ceremony (/ignite)

| Artefact | Location |
|----------|----------|
| Ignite page | `app/(dashboard)/ignite/page.tsx` |
| Ignite CSS (shimmer, floating particles) | `app/globals.css` |

#### The Ritual Experience

- **Dark-mode**: Full-screen `bg-black` with `from-emerald-950/20 via-transparent to-violet-950/20` gradient
- **Floating particles**: 20 ambient dots with `float-particle` animation (8-20s cycles)
- **Typewriter effect**: Custom `useTypewriter()` hook  -  30ms per character, line-by-line reveal of 19-line manifesto
- Key lines highlighted: "This is not software" (amber), "This is a Digital Constitution" (amber), "The math is perfect" (emerald)

#### Liquid Progress "Intent-Lock" Button

- User must **hold the button for 3 seconds** (the Intent-Lock)
- Liquid fill progresses left-to-right via `linear-gradient` with dynamic `${progress}%` breakpoint
- 60fps progress update (16ms interval)
- Button scales `0.98` while held, border transitions to amber
- Button disabled until typewriter completes  -  forces reading the manifesto

#### 3D Sovereign Confetti

- 4-wave confetti sequence using `canvas-confetti`:
  1. Left burst (60 particles, spread 80)
  2. Right burst (150ms delay, 60 particles)
  3. Centre starburst (400ms delay, 100 particles, star shapes, 360° spread)
  4. Gold rain from top (700ms delay, 80 particles, gravity 1.2)
- Palette: Emerald Green (#50C878), Sovereign Gold (#D4AF37), Sovereign Silver (#C0C0C0)
- **Haptic vibration**: `navigator.vibrate([100, 50, 200, 50, 100])` on mobile/trackpad

#### Ignition Hash

- SHA-256 hash of `IGNITION:${userId}:${timestamp}:${TOS_VERSION}` via `crypto.subtle.digest`
- Stored in `firm_global_audit_ledger` as event type `SOVEREIGN_IGNITION` with `block_number: 0`
- Hash displayed post-ignition in `font-mono text-white/20`

### Mastery Verification

| Layer | Metric | Status |
|-------|--------|--------|
| Visuals | Glassmorphism Bento UI | ✅ High-Prestige Professionalism |
| Integrity | Conflict-Genesis Weld (Micro-Audit Trace) | ✅ Mathematical Finality |
| Speed | <100ms Atomic Transfer (Liquid Button) | ✅ The "Breeze" Experience |
| Security | Partner-PIN Override (Directive 026) | ✅ The "Shield" Enforcement |
| Reward | 3D Sovereign Sparkle (4-wave confetti) | ✅ The "Prestige" Reward |

### TSC: 0 errors ✅

---

## ComplianceOnboardingTour  -  Guided Product Tour

**Status:** COMPLETE
**Date:** 2026-03-26

### What was built

| Artefact | Location |
|----------|----------|
| ComplianceOnboardingTour component + provider | `components/onboarding/compliance-onboarding-tour.tsx` |
| `useTour()` hook for external access | `components/onboarding/compliance-onboarding-tour.tsx` |
| Tour bullet stagger animation | `app/globals.css` (`@keyframes fadeSlideIn`) |
| Wired into dashboard layout | `app/(dashboard)/layout.tsx` |

### Tour Stops (7)

| # | Stop | What it explains |
|---|------|-----------------|
| 1 | Welcome to the Fortress | RLS, SHA-256, PIPEDA, SENTINEL overview |
| 2 | The Sovereign Matrix | Glass Fortress dashboard, Micro-Audit Trace, Firm Hash |
| 3 | Readiness Score & Shield Domains | 5 domains, emerald glow, heat-map pulse |
| 4 | Pre-Flight & Genesis Block | 3-check hard-gate, Sovereign Confetti, immutable seal |
| 5 | Immutable Trust Ledger | Append-only, overdraft prevention, zero-balance closing |
| 6 | Compliance Dashboard & Audit Simulation | Region lock, encryption, parity, LSO simulation |
| 7 | Academy & Sovereign Ignition | 3 modules, certification badge, hold-to-ignite ceremony |

### Activation Logic

- **Auto-trigger**: On first login when `user_metadata.onboarding_tour_completed` is not set
- **1.5-second delay**: Dashboard renders before overlay appears
- **Navigation**: Steps with `href` auto-navigate the user to the relevant page
- **Skip / Complete**: Both paths set `onboarding_tour_completed: true` + `onboarding_tour_completed_at` in user metadata
- **Re-trigger**: `useTour().startTour()` can be called from Academy or settings

### Sovereign-Styled UI

- **Glassmorphism card**: `bg-slate-900/90 backdrop-blur-2xl` with `border-white/[0.08]`, `rounded-3xl`
- **Step indicator**: Animated dots  -  current step is 6px emerald, completed are 3px emerald/40, upcoming are white/10
- **Detail bullets**: Staggered `fadeSlideIn` animation (0.08s delay per bullet) with accent-coloured check icons
- **Progress bar**: Emerald gradient, smooth 500ms transition
- **Navigation**: Ghost "Back"/"Skip" buttons, emerald "Next" button, gold "Complete Tour" on final step

### TSC: 0 errors ✅

---

## Directive 039  -  Sovereign Naming Architect

**Status:** COMPLETE
**Date:** 2026-03-26

### Migration 212  -  Matter Naming Template Engine
- `matter_naming_template` column on `tenants` (nullable text, default NULL = legacy mode)
- Expanded `fn_next_matter_number` with full template parsing (token substitution: `{PREFIX}`, `{YEAR}`, `{INC_NUM}`, `{RANDOM_HEX}`, `{PRACTICE}`, `{TYPE}`, `{SEP}`)
- `fn_preview_matter_number` function for live sandbox preview without side effects

### FirmNamingConfig.tsx  -  Live Preview Sandbox
- Glassmorphism preview card with real-time template rendering
- Preset templates (Classic, Year-First, Practice-Coded, Hex-Unique)
- Token builder UI with drag-and-drop token insertion
- Dynamically loaded via `next/dynamic` with `ssr: false` on Firm Settings page

### API
- `/api/settings/firm` PATCH route extended with `matter_naming_template` field
- Validation: template must be a string, max 120 characters, only whitelisted tokens permitted

### Guardrail
- Amber uniqueness warning surfaced in UI when template lacks `{INC_NUM}` or `{RANDOM_HEX}` (risk of duplicate matter numbers)
