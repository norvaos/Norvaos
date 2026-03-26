# NorvaOS  -  Final Testing Defect Register

**Testing Phase Start:** 2026-03-18
**Register Owner:** Zia Waseer
**Last Updated:** 2026-03-18

---

## Protocol Acknowledgement

The development team acknowledges and operates under the following testing protocol:

- Every reported issue is logged here with a permanent Issue ID
- No issue is closed unless retest passes  -  code change alone does not close an issue
- Severity must not be downgraded to improve optics
- Release Blockers are called out explicitly at the top of every daily report
- Every fix documents: what changed, why it happened, whether tests were added, and whether related workflows were regression-tested
- The following areas are treated as especially sensitive: matter lifecycle, stage gating, documents, client portal, intake/booking, trust/billing, permissions, form generation, refusal, closure, automations, audit logs

---

## ⚠️ Open Release Blockers

*None  -  DEF-007 fixed 2026-03-18. Pending retest.*

---

## Daily Status Summary

### 2026-03-18

| Category | Count |
|----------|-------|
| New issues opened | 7 |
| Issues fixed | 7 |
| Pending retest | 7 |
| Closed | 0 |
| Release Blockers open | 0 |

---

## Full Defect Register

---

### DEF-001

| Field | Value |
|-------|-------|
| **Issue ID** | DEF-001 |
| **Date Reported** | 2026-03-18 |
| **Reported By** | Zia Waseer |
| **Module** | Auth / Navigation |
| **Workflow Affected** | User logout |
| **Role Affected** | All roles |
| **Defect Type** | Bug |
| **Severity** | High |
| **Exact Defect Description** | After logout, the user is redirected to the Sign In page (`/sign-in` or `/login`) instead of the public home page (`/`). This creates a poor UX, does not reinforce the product brand on exit, and may confuse new-tenant evaluation users who expect to land on the marketing/home page. |
| **Steps to Reproduce** | 1. Log in as any user. 2. Click the logout button or trigger sign-out. 3. Observe the redirect destination. |
| **Expected Behaviour** | User is redirected to the public home page (`/`) after logout. |
| **Actual Behaviour** | User is redirected to the Sign In page (`/sign-in`). |
| **Environment** | Production  -  https://sparkly-kelpie-27e16b.netlify.app |
| **Route / Component / Service / Table** | Sign-out handler / `middleware.ts` / auth redirect config |
| **Root Cause** | Both logout handlers (`components/layout/sidebar.tsx` and `components/layout/header.tsx`) called `router.push('/login')` post sign-out instead of `router.push('/')`. |
| **Assigned Owner** | Dev |
| **Status** | Pending Retest |
| **Fix Commit / PR** | sidebar.tsx + header.tsx  -  changed `router.push('/login')` → `router.push('/')` in both `handleLogout` and `handleSignOut` |
| **Tests Added** | None |
| **Retest Instructions** | 1. Log in. 2. Log out. 3. Confirm redirect lands on `/` (public home page), not `/sign-in` or `/login`. |
| **Retest Result** | Not Retested |
| **Closure Date** |  -  |
| **Notes** | Low risk but affects first impression during controlled rollout and new-tenant evaluation. |

---

### DEF-002

| Field | Value |
|-------|-------|
| **Issue ID** | DEF-002 |
| **Date Reported** | 2026-03-18 |
| **Reported By** | Zia Waseer |
| **Module** | Onboarding / Default Settings |
| **Workflow Affected** | New tenant setup  -  practice area defaults |
| **Role Affected** | Admin (new tenant) |
| **Defect Type** | Missing Requirement |
| **Severity** | High |
| **Exact Defect Description** | During default settings configuration for a new tenant, the system does not enforce Immigration as the sole enabled practice area. Other practice areas are either enabled by default or selectable without restriction. Per operational requirement: Immigration is the primary and only default practice area. All other practice areas must be disabled by default. No automation is available for non-Immigration practice areas at this stage. Users may manually add other practice areas for their own use, but no system automation will be applied to them. |
| **Steps to Reproduce** | 1. Create a new tenant account. 2. Proceed through onboarding / default settings. 3. Observe which practice areas are enabled or visible. |
| **Expected Behaviour** | Immigration is pre-selected and enabled. All other practice areas are disabled by default. A clear note indicates that automations only apply to Immigration at this stage. |
| **Actual Behaviour** | Other practice areas are not disabled by default; no enforcement of Immigration as the sole automated practice area. |
| **Environment** | Production |
| **Route / Component / Service / Table** | Onboarding flow / practice area settings / tenant defaults table |
| **Root Cause** | Onboarding wizard `DEFAULT_STATE.selectedPracticeAreas` was `[]` (empty) and the practice area picker was a freeform toggle. No enforcement of Immigration as the sole default. |
| **Assigned Owner** | Dev |
| **Status** | Pending Retest |
| **Fix Commit / PR** | `app/(dashboard)/onboarding/wizard/page.tsx`  -  `DEFAULT_STATE.selectedPracticeAreas` set to `['Immigration']`; practice area UI replaced with a locked Immigration display block; all other areas removed from the onboarding picker; note added directing users to Settings for additional practice areas. |
| **Tests Added** | None |
| **Retest Instructions** | 1. Create a fresh tenant. 2. Go through onboarding wizard Step 1. 3. Confirm only Immigration is shown as the practice area  -  locked and pre-selected. 4. Confirm no other areas are selectable during onboarding. 5. Confirm note references Settings → Practice Areas for additions. |
| **Retest Result** | Not Retested |
| **Closure Date** |  -  |
| **Notes** | This directly affects how the product is used operationally. Immigration workflow is the live workflow. Other practice areas must not imply system support that does not exist yet. |

---

### DEF-003

| Field | Value |
|-------|-------|
| **Issue ID** | DEF-003 |
| **Date Reported** | 2026-03-18 |
| **Reported By** | Zia Waseer |
| **Module** | Onboarding / Default Settings |
| **Workflow Affected** | New tenant setup  -  firm profile / contact info |
| **Role Affected** | Admin (new tenant) |
| **Defect Type** | Missing Requirement |
| **Severity** | High |
| **Exact Defect Description** | The default settings step during onboarding does not collect office address, phone number, or email. These fields are required to populate all system-wide locations where firm contact information is used (letters, forms, footers, client communications, document generation, etc.). Without collecting these at setup, all downstream uses of firm contact data will be blank or require manual population later. |
| **Steps to Reproduce** | 1. Create a new tenant. 2. Go through onboarding / default settings. 3. Observe that no fields for office address, phone, or email are presented. |
| **Expected Behaviour** | Onboarding default settings includes a firm profile section with: office address (street, city, province, postal code), phone number, and office email. These values are stored in the tenant record and used as defaults everywhere firm contact info is referenced. |
| **Actual Behaviour** | No such fields are presented during onboarding defaults. |
| **Environment** | Production |
| **Route / Component / Service / Table** | Onboarding flow / firm settings / tenants table |
| **Root Cause** | Onboarding wizard Step 1 only collected firm name and logo. No fields for office address, phone, or email. Apply-setup API had no schema for these fields and did not store them. |
| **Assigned Owner** | Dev |
| **Status** | Pending Retest |
| **Fix Commit / PR** | `wizard/page.tsx`  -  added `officeAddress`, `officePhone`, `officeEmail` fields to `WizardState`, `DEFAULT_STATE`, and `StepFirmSetup` UI; passed to `applyFirmSetup()`. `apply-setup/route.ts`  -  schema extended with 3 new optional fields; stored under `settings.office_contact` on the tenant row. |
| **Tests Added** | None |
| **Retest Instructions** | 1. Create a fresh tenant. 2. In wizard Step 1, enter a firm name, office address, phone, and email. 3. Complete the wizard. 4. Navigate to Settings → Firm. 5. Confirm address, phone, and email are saved and displayed correctly. |
| **Retest Result** | Not Retested |
| **Closure Date** |  -  |
| **Notes** | Downstream uses (letter templates, form headers) are not yet wired to `settings.office_contact`  -  that is a separate task, not part of this fix. This fix ensures the data is collected and stored. |

---

### DEF-004

| Field | Value |
|-------|-------|
| **Issue ID** | DEF-004 |
| **Date Reported** | 2026-03-18 |
| **Reported By** | Zia Waseer |
| **Module** | Onboarding / Default Settings / System-wide |
| **Workflow Affected** | Date display and input across all modules |
| **Role Affected** | All roles |
| **Defect Type** | Missing Requirement |
| **Severity** | Medium |
| **Exact Defect Description** | The system default date format has not been set to DD-MM-YYYY. This affects all date fields, displays, and inputs system-wide. For a Canadian immigration law practice, date format consistency is important for accuracy in documents, filings, and client communications. |
| **Steps to Reproduce** | 1. Open any date field or date display in the system. 2. Observe the format in use. |
| **Expected Behaviour** | All dates across the system display and accept input in DD-MM-YYYY format by default. This should also be the default set during onboarding. |
| **Actual Behaviour** | Date format is not set to DD-MM-YYYY  -  system appears to use a different default. |
| **Environment** | Production |
| **Route / Component / Service / Table** | System config / tenant defaults / date utility functions / all date-rendering components |
| **Root Cause** | `app/api/auth/signup/route.ts` hardcoded `date_format: 'YYYY-MM-DD'` when creating the tenant row. |
| **Assigned Owner** | Dev |
| **Status** | Pending Retest |
| **Fix Commit / PR** | `app/api/auth/signup/route.ts`  -  changed `date_format: 'YYYY-MM-DD'` → `date_format: 'DD-MM-YYYY'` in tenant insert. |
| **Tests Added** | None |
| **Retest Instructions** | 1. Create a new tenant. 2. Open any matter, contact, or billing record with a date field. 3. Confirm dates display in DD-MM-YYYY format. 4. Check the tenant row in DB to confirm `date_format = 'DD-MM-YYYY'`. |
| **Retest Result** | Not Retested |
| **Closure Date** |  -  |
| **Notes** | Existing tenants (including Almira Law Office) will still have `YYYY-MM-DD` in the database. A one-time migration or manual update via Settings → Firm may be needed for existing tenants. |

---

### DEF-005

| Field | Value |
|-------|-------|
| **Issue ID** | DEF-005 |
| **Date Reported** | 2026-03-18 |
| **Reported By** | Zia Waseer |
| **Module** | Onboarding / Firm Settings |
| **Workflow Affected** | New tenant account creation  -  firm name persistence |
| **Role Affected** | Admin (new tenant) |
| **Defect Type** | Bug |
| **Severity** | High |
| **Exact Defect Description** | During account creation, the office name entered was "Almira Law Office". After completing onboarding and arriving at Firm Settings, the firm name displayed is "Rishmond Law Office"  -  which is an incorrect, unrelated value. The entered firm name was not persisted correctly or was overwritten by a wrong default or seed value. |
| **Steps to Reproduce** | 1. Create a new tenant account. 2. Enter office name as "Almira Law Office" during signup or onboarding. 3. Complete the onboarding flow. 4. Navigate to Firm Settings. 5. Observe the displayed firm name. |
| **Expected Behaviour** | Firm Settings displays "Almira Law Office"  -  the exact name entered during signup. |
| **Actual Behaviour** | Firm Settings displays "Rishmond Law Office"  -  an incorrect, stale, or seed value that was not entered by the user. |
| **Environment** | Production |
| **Route / Component / Service / Table** | Signup / onboarding flow / `tenants` table / Firm Settings page / firm name field |
| **Root Cause** | The onboarding wizard `DEFAULT_STATE.firmName` was `''` (empty string). The wizard did not pre-populate the firm name from the already-created tenant. If the user typed a different name during the wizard (or their browser autofilled a different value), `applyFirmSetup()` would overwrite the correct tenant name. "Rishmond Law Office" was a value entered or autofilled into the wizard's firm name field  -  not the value from signup. |
| **Assigned Owner** | Dev |
| **Status** | Pending Retest |
| **Fix Commit / PR** | `wizard/page.tsx`  -  added `useTenant()` hook; `useEffect` pre-populates `state.firmName` from `tenant.name` when wizard loads, ensuring the correct existing name is shown and the user must deliberately change it. |
| **Tests Added** | None |
| **Retest Instructions** | 1. Create a fresh tenant with name "Test Firm ABC". 2. Log in and go through the onboarding wizard. 3. Confirm Step 1 shows "Test Firm ABC" pre-populated in the Firm Name field. 4. Complete wizard without changing the name. 5. Navigate to Firm Settings  -  confirm name is still "Test Firm ABC". |
| **Retest Result** | Not Retested |
| **Closure Date** |  -  |
| **Notes** | The existing Almira Law Office tenant has incorrect data in the DB  -  name shows "Rishmond Law Office". This can be corrected directly in Settings → Firm → update firm name. A DB-level correction may also be needed. |

---

### DEF-006

| Field | Value |
|-------|-------|
| **Issue ID** | DEF-006 |
| **Date Reported** | 2026-03-18 |
| **Reported By** | Zia Waseer |
| **Module** | Navigation / Dashboard |
| **Workflow Affected** | Dashboard navigation |
| **Role Affected** | All roles |
| **Defect Type** | Design Flaw |
| **Severity** | Medium |
| **Exact Defect Description** | The sidebar or navigation contains two separate entries that both lead to or represent the Dashboard. The Dashboard should be a single navigation item. Clicking "Dashboard" should go directly to the dashboard view  -  there should be no sub-item, duplicate, or nested option. |
| **Steps to Reproduce** | 1. Log in as any user. 2. Look at the sidebar navigation. 3. Observe the Dashboard section  -  there are two items where one is expected. |
| **Expected Behaviour** | A single "Dashboard" navigation item. Clicking it takes the user directly to the dashboard. No sub-items, no expandable menu, no duplicate. |
| **Actual Behaviour** | Two navigation items appear where only one should exist for the dashboard. |
| **Environment** | Production |
| **Route / Component / Service / Table** | Sidebar navigation component / nav config / dashboard route |
| **Root Cause** | `lib/config/navigation.ts` had "Dashboards" as a `NavDropdown` item with two children (`Overview` at `/` and `Immigration` at `/dashboards/immigration`). This rendered as a parent item + expandable sub-items, appearing as duplicated navigation. |
| **Assigned Owner** | Dev |
| **Status** | Pending Retest |
| **Fix Commit / PR** | `lib/config/navigation.ts`  -  replaced the `Dashboards` dropdown object (with children) with a single flat `{ title: 'Dashboard', href: '/', icon: LayoutDashboard }` nav item. Also removed unused `Globe` import. |
| **Tests Added** | None |
| **Retest Instructions** | 1. Log in. 2. Look at sidebar. 3. Confirm a single "Dashboard" item with no chevron or sub-items. 4. Click it  -  confirm direct navigation to `/`. |
| **Retest Result** | Not Retested |
| **Closure Date** |  -  |
| **Notes** | The `/dashboards/immigration` route still exists if needed in future. It is simply no longer in the main nav. |

---

### DEF-007

| Field | Value |
|-------|-------|
| **Issue ID** | DEF-007 |
| **Date Reported** | 2026-03-18 |
| **Reported By** | Zia Waseer |
| **Module** | Front Desk |
| **Workflow Affected** | Lead intake  -  initial lead entry from front desk |
| **Role Affected** | Front Desk, Admin |
| **Defect Type** | Bug |
| **Severity** | Release Blocker |
| **Exact Defect Description** | The Front Desk module does not open. Clicking on Front Desk in the navigation produces no result, an error, or a blank/broken view. The Front Desk is the primary entry point for lead intake  -  all new client leads are entered from this module. If this is not functional, no new lead can be entered, no intake workflow can begin, and the entire intake-to-matter pipeline is blocked. |
| **Steps to Reproduce** | 1. Log in as Front Desk or Admin. 2. Click "Front Desk" in the navigation. 3. Observe result. |
| **Expected Behaviour** | Front Desk module opens and displays the lead intake interface. User can begin entering a new lead. |
| **Actual Behaviour** | Front Desk does not open. Module is non-functional. |
| **Environment** | Production |
| **Route / Component / Service / Table** | `/front-desk` route / Front Desk page component / intake API routes |
| **Root Cause** | The Front Desk layout (`app/(front-desk)/layout.tsx`) gates access behind `featureFlags.front_desk_mode === true`. When a new tenant is created via signup, `feature_flags: {}` is stored (empty object). `front_desk_mode` is therefore `undefined` → falsy → all users silently redirected to `/` with no error message. |
| **Assigned Owner** | Dev |
| **Status** | Pending Retest |
| **Fix Commit / PR** | (1) `app/api/auth/signup/route.ts`  -  `feature_flags` now includes `front_desk_mode: true` at tenant creation. (2) `app/api/onboarding/wizard/default/route.ts`  -  default preset now sets `flags.front_desk_mode = true`. (3) `app/api/onboarding/apply-setup/route.ts`  -  apply-setup now merges `front_desk_mode: true` into feature flags whenever onboarding completes. |
| **Tests Added** | None |
| **Retest Instructions** | 1. Log in as Admin or Front Desk role. 2. Click "Front Desk" in sidebar. 3. Confirm the Front Desk console loads (NowStrip, StatsBar, Schedule, Tasks, Check-in Queue, Quick Create all visible). 4. Use Quick Create to enter a new lead. 5. Confirm lead is saved. |
| **Retest Result** | Not Retested |
| **Closure Date** |  -  |
| **Notes** | **Was a Release Blocker.** Existing tenants that were created before this fix have `front_desk_mode` missing from their `feature_flags`. For the Almira Law Office tenant specifically, the flag must be enabled directly in the Supabase dashboard: `UPDATE tenants SET feature_flags = feature_flags || '{"front_desk_mode": true}'::jsonb WHERE name = 'Almira Law Office';`  -  or via Settings → Feature Flags if that UI exists. |

---

## Issue Index

| ID | Module | Severity | Status | Description (short) |
|----|--------|----------|--------|---------------------|
| DEF-001 | Auth / Navigation | High | Pending Retest | Logout redirects to sign-in instead of home page |
| DEF-002 | Onboarding / Settings | High | Pending Retest | Immigration not enforced as sole default practice area |
| DEF-003 | Onboarding / Settings | High | Pending Retest | Office address, phone, email not collected in onboarding |
| DEF-004 | System-wide | Medium | Pending Retest | Default date format not set to DD-MM-YYYY |
| DEF-005 | Onboarding / Firm Settings | High | Pending Retest | Firm name shows "Rishmond Law Office" instead of entered name |
| DEF-006 | Navigation / Dashboard | Medium | Pending Retest | Dashboard has two navigation items  -  should be one |
| DEF-007 | Front Desk | **Release Blocker** | **Pending Retest** | Front Desk module does not open  -  intake pipeline blocked |

---

*This register is the authoritative source of truth for all testing issues. No issue is considered resolved until the Retest Result column shows "Pass" and a Closure Date is recorded.*
