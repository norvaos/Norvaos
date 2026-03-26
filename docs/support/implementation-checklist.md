# NorvaOS  -  Implementation Checklist
## New Tenant Onboarding

**Version:** 1.0  -  2026-03-16
**Team 3 / Module 4  -  Support and Implementation Tooling**

Use this checklist when onboarding a new law firm tenant. Complete each phase in order. Tick each item before moving to the next phase.

---

## Phase 1  -  Account Creation
*Estimated time: 30–60 minutes*

### Supabase Setup
- [ ] Create new tenant record in Supabase (`tenants` table): `id`, `name`, `plan`, `is_active = true`
- [ ] Confirm `tenant_id` UUID is available and noted
- [ ] Verify RLS policies are active on all core tables (run `check-front-desk-isolation.sh` or equivalent)

### Admin User
- [ ] Create admin user in Supabase Auth (email + temp password)
- [ ] Insert `users` row with `tenant_id`, `role_id` = admin role, `is_active = true`
- [ ] Send welcome email with temporary credentials (use off-system email  -  not via NorvaOS until email integration is set up)
- [ ] Confirm admin user can log in

### Domain / Subdomain (if applicable)
- [ ] Configure subdomain or white-label domain if applicable
- [ ] Verify DNS propagation
- [ ] Test HTTPS redirect

---

## Phase 2  -  Configuration
*Estimated time: 1–2 hours*

### Practice Areas
- [ ] Navigate to **Settings → Practice Areas**
- [ ] Enable relevant practice areas for this firm (Immigration, Family Law, Real Estate, etc.)
- [ ] Assign colours to each enabled practice area
- [ ] Confirm disabled practice areas are hidden from UI

### Matter Types
- [ ] Navigate to **Settings → Matter Types** (per practice area)
- [ ] Confirm default matter types are loaded
- [ ] Add firm-specific matter types if required
- [ ] Review and confirm stage pipelines per matter type

### Billing Configuration
- [ ] Set default currency (CAD)
- [ ] Set default hourly rate
- [ ] Set billing address (matches Law Society registration)
- [ ] Configure Stripe account connection (if online payment collection required)
- [ ] Confirm trust account settings (if using NorvaOS trust accounting module)

### Office Settings
- [ ] Navigate to **Settings → Office**
- [ ] Set firm name, address, phone, website
- [ ] Set timezone (America/Toronto default for Ontario firms)
- [ ] Upload firm logo

---

## Phase 3  -  User Setup
*Estimated time: 30–60 minutes per staff group*

### Roles Confirmation
- [ ] Confirm available roles meet firm needs: Admin, Lawyer, Paralegal, Receptionist
- [ ] Review role permissions in **Settings → Roles** (note: roles are system-defined; contact support for custom permissions)

### Staff Invitations
- [ ] Invite all lawyers (Admin or Lawyer role)
- [ ] Invite all paralegals / clerks (Paralegal role)
- [ ] Invite reception / front-desk staff (Receptionist role)
- [ ] Confirm all users received invite emails
- [ ] Confirm all users completed password setup

### Access Verification
- [ ] Log in as a Lawyer  -  confirm matter access, billing, documents visible
- [ ] Log in as a Paralegal  -  confirm matter access, task management visible
- [ ] Log in as a Receptionist  -  confirm booking, kiosk, front desk visible; billing hidden
- [ ] Confirm no user can see another tenant's data (cross-tenant isolation test)

---

## Phase 4  -  Integration Setup
*Estimated time: 1–2 hours*

### Email Integration (Microsoft 365)
- [ ] Navigate to **Settings → Integrations → Email**
- [ ] Click **Connect Microsoft 365**
- [ ] Complete OAuth flow with firm's Microsoft admin account
- [ ] Verify connection status shows **Connected**
- [ ] Send a test email via NorvaOS  -  confirm delivery
- [ ] Confirm email sync is active (incoming emails appear in matter threads)

### Calendar (if applicable)
- [ ] Connect Microsoft 365 calendar via the same integration
- [ ] Confirm events sync bidirectionally
- [ ] Test creating a calendar event from a matter

### OneDrive / Document Storage (if applicable)
- [ ] Navigate to **Settings → Integrations → OneDrive**
- [ ] Connect OneDrive with firm's Microsoft account
- [ ] Set root folder for document storage
- [ ] Upload a test document  -  confirm it appears in OneDrive

### Third-Party Import (if migrating from Clio / GHL / Officio)
- [ ] Navigate to **Settings → Data Import**
- [ ] Select source system (Clio / GHL / Officio)
- [ ] Run import in preview mode first  -  review sample data
- [ ] Confirm field mapping is correct
- [ ] Run full import
- [ ] Verify imported contacts and matters appear correctly
- [ ] Note: data import is one-time; deduplication is not automatic

---

## Phase 5  -  Data Migration
*Estimated time: variable  -  2 hours to 2 days depending on data volume*

### Pre-Migration
- [ ] Export data from previous system in supported format
- [ ] Validate export file (no corrupted rows, correct encoding UTF-8)
- [ ] Back up the export file

### Contact Import
- [ ] Review contact import mapping (first name, last name, email, phone, address)
- [ ] Import contacts via **Settings → Data Import**
- [ ] Spot-check 10 random contacts for accuracy

### Matter Import
- [ ] Map old matter statuses to NorvaOS statuses (open, in_progress, pending, closed)
- [ ] Import matters  -  link to imported contacts
- [ ] Confirm matter reference numbers are preserved or remapped

### Document Migration (if required)
- [ ] Bulk upload existing documents to OneDrive via desktop client
- [ ] Link OneDrive folders to matters via **Documents → Link OneDrive Folder**

### Post-Migration Validation
- [ ] Contact count in NorvaOS matches source system
- [ ] Matter count matches
- [ ] Run conflict check on 5 sample clients  -  confirm no false positives from import

---

## Phase 6  -  Training
*Estimated time: 2–4 hours (group session)*

### Staff Training Topics
- [ ] Dashboard and navigation overview
- [ ] Creating and managing contacts
- [ ] Creating matters, assigning matter types, moving through stages
- [ ] Tasks and deadlines
- [ ] Time entry and billing
- [ ] Document management and portal
- [ ] Client portal walkthrough (show from client perspective)
- [ ] Booking pages and kiosk (if front desk module in use)
- [ ] Email integration  -  how to associate emails to matters

### Document Templates
- [ ] Upload firm letter templates
- [ ] Upload standard agreement templates
- [ ] Test merge fields on one template

### Demo / Practice Run
- [ ] Create a test matter end-to-end as a Lawyer
- [ ] Complete a test intake as a Paralegal
- [ ] Submit a test client portal request as a client

---

## Phase 7  -  Go-Live Verification
*Estimated time: 1–2 hours*

### Health Check
- [ ] Run `/api/support/health`  -  confirm all indicators green
- [ ] Run `scripts/support/verify-environment.ts`  -  confirm all checks PASS
- [ ] Confirm no stalled jobs in job queue (check **Settings → Support Dashboard**)

### RLS Verification
- [ ] Log in as each role and confirm data access matches expected permissions
- [ ] Confirm staff from this firm cannot access a different test tenant's data

### Integration Verification
- [ ] Send a real email from the firm email address  -  confirm delivery and sync
- [ ] Create a calendar event  -  confirm it appears in Microsoft Calendar
- [ ] Upload a document  -  confirm it appears in OneDrive

### Notification Verification
- [ ] Trigger a task assignment  -  confirm the assigned user receives an in-app notification
- [ ] Trigger a client notification  -  confirm client receives email

### Sign-Off
- [ ] Firm admin confirms all modules working as expected
- [ ] Implementation record created in onboarding tracker (`initOnboardingRecord(tenantId)`)
- [ ] All phases marked complete in tracker
- [ ] Implementation team notified  -  firm is live

---

## Escalation Contacts (Internal Roles)

| Issue | Contact |
|-------|---------|
| Auth / access problems | Platform admin |
| Database / RLS issues | Backend team |
| Email integration failures | Integration team |
| Billing / Stripe issues | Finance team |
| Client-reported bugs | Support team via issue intake form |

---

## Notes

_Use this section for firm-specific notes during implementation._

- Tenant ID: `___________________________`
- Implementation start date: `___________________________`
- Go-live date: `___________________________`
- Primary contact at firm: `___________________________`
- Special requirements: `___________________________`
