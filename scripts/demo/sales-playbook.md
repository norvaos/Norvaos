# NorvaOS Sales Demo Playbook

> Internal use only. Always use the demo tenant. Never use production data.

## Before the Demo

1. Run `reset-demo-tenant.ts` to ensure clean state
2. Log in to the demo tenant as the admin user
3. Verify the dashboard loads with demo data
4. Run `verify-demo-isolation.ts` — must exit 0
5. Open the app in a clean browser profile (no cached sessions)

---

## 5-Step Demo Flow

### Step 1 — Setup (2 min)

**Goal:** Show the firm is configured and ready to work.

1. Navigate to **Settings → Practice Areas**
   - Show Immigration and Family Law are enabled
   - Show matter types within each practice area
2. Navigate to **Settings → Users**
   - Show multiple roles: Admin, Lawyer, Paralegal
   - Point out role-based access control
3. **Talking point:** "You configure this once during onboarding — takes under an hour."

---

### Step 2 — Contacts (3 min)

**Goal:** Show the CRM layer — client records, organisations, conflict check.

1. Navigate to **Contacts**
   - Show the contact list (demo contacts loaded)
   - Click into one individual contact (e.g. "Alexandra Anderson")
2. Show tabs: Overview, Matters, Documents, Calendar, Notes, Portal
3. Show the **conflict check** field — demonstrate it's clear
4. **Talking point:** "Every new client goes through conflict check before any work begins — it's baked in."

**Avoid:** Trust account balances, immigration file details, private notes.

---

### Step 3 — Matters (5 min)

**Goal:** Show the matter lifecycle — stages, tasks, deadlines.

1. Navigate to **Matters**
   - Show the matter list — mix of statuses
   - Filter by Practice Area: show Immigration vs Family Law view
2. Click into an open immigration matter (e.g. "Express Entry — Federal Skilled Worker")
3. Show tabs:
   - **Overview** — status, priority, billing type, opened date
   - **Stage Pipeline** — show current stage, advance it live if approved
   - **Tasks** — show linked tasks with due dates
   - **Deadlines** — show upcoming deadlines
   - **Documents** — show the document vault (empty is fine for demo)
4. **Talking point:** "Every matter has its own pipeline — immigration has different stages than family law. The system enforces the right workflow for each."

**Avoid:** Showing trust account tab, immigration private fields, client portal login.

---

### Step 4 — Tasks and Calendar (3 min)

**Goal:** Show day-to-day work management.

1. Navigate to **Dashboard**
   - Show the "Tasks Due" widget
   - Show the upcoming deadlines widget
2. Navigate to **Calendar** (if available)
   - Show demo hearing and consultation events
3. Back on a matter — show the Tasks tab
   - Create a new task live: "Prepare IRCC submission package", due in 7 days, high priority
4. **Talking point:** "Your whole team sees the same task list — no more chasing emails about what's been done."

---

### Step 5 — Billing Overview (2 min)

**Goal:** Show billing exists and is integrated — do not deep-dive.

1. Navigate to **Billing** or a matter's Billing tab
   - Show time entries already logged (from demo data)
   - Show invoice generation exists
2. Mention: flat fee, hourly, and contingency billing types are all supported
3. Mention: trust accounting is available for compliant trust management
4. **Talking point:** "Billing is built in — no separate accounting tool."

**Avoid:** Showing actual trust account balances, processing live payments, or detailed Stripe settings.

---

## Common Demo Questions

| Question | Answer |
|----------|--------|
| "Is data stored in Canada?" | Yes — Supabase Canada (Toronto) region. PIPEDA-compliant. |
| "Can we import from [Clio/GHL/Officio]?" | Yes — we have import adapters for Clio, GoHighLevel, and Officio. |
| "How long does setup take?" | Under 48 hours for standard configuration. Complex imports vary. |
| "Is there a client portal?" | Yes — clients can upload documents, sign forms, and check status. |
| "Do you support family law?" | Yes — Family Law is a supported practice area alongside Immigration. |
| "What's the pricing?" | Starting at $99/month for solo. Contact us for firm pricing. |
| "Is there an API?" | Yes — webhook integrations and REST API available on request. |

---

## What to Avoid

- Never show the Trust Accounting module in detail (requires separate compliance demo)
- Never show immigration private data fields (IRCC profile, passport numbers)
- Never log in as a client — keep demo on staff-side views
- Never process a live payment in demo
- Never show internal support/admin tools (health dashboard, job queue)
- Never screenshot demo data and share publicly

---

## After the Demo

1. Run `reset-demo-tenant.ts` to wipe and reseed for the next demo
2. Log out of the demo account
3. Note any prospect questions or feature requests in the CRM
