# Changelog

All notable changes to NorvaOS will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-02-25

### Added
- **Contacts Module**  -  Full CRUD for individual and organization contacts with search, filtering, and detail pages
- **Matters Module**  -  Matter management with practice areas, status tracking, team assignment, and billing types
- **Leads Module**  -  Kanban board with drag-and-drop, pipeline stages, temperature tracking, and lead detail pages
- **Pipeline Management**  -  Create/edit pipelines and stages with drag-to-reorder, stage colors, win probabilities
- **Tasks Module**  -  Task creation, assignment, priorities, due dates, and status tracking
- **Documents**  -  File uploads with drag-and-drop, category tagging, multi-entity attachment (matters, contacts, leads)
- **Notes**  -  Inline note editor with pin/unpin, edit, delete, linked to matters/contacts/leads
- **Labels/Tags**  -  Color-coded tag system with inline creation, applied to matters and contacts
- **Activity Timeline**  -  Merged timeline of activities, notes, and audit log changes with filter tabs
- **Contact Search**  -  Combobox search with hover preview cards and inline contact creation from matter forms
- **Matter Visibility**  -  Security control (all users, owner only, team, group) per matter
- **Lead Detail Page**  -  Full lead view with overview, pipeline position, contact info, activities, and notes tabs
- **Pipeline Display Settings**  -  Card display customization (show/hide values, follow-up, source, assignee) and stage visibility toggles
- **Dashboard**  -  Overview with key metrics, recent activities, and quick navigation
- **Settings**  -  Firm settings, user management, roles, practice areas, custom fields, and pipeline management
- **Multi-tenant Architecture**  -  Shared database with row-level security, tenant isolation on every table
- **Authentication**  -  Supabase Auth with email/password, protected routes, and session management
- **Responsive Design**  -  Collapsible sidebar, mobile navigation sheet, adaptive layouts
- **Command Palette**  -  Global search and navigation via Cmd+K

### Infrastructure
- Next.js 16.1.6 App Router with React 19
- Supabase (PostgreSQL + Auth + Storage + RLS)
- TanStack Query for data fetching and cache management
- shadcn/ui component library
- @dnd-kit for drag-and-drop interactions
- Tailwind CSS v4 for styling
- Zod v4 for schema validation
- Zustand for client state management

## [1.1.0] - 2026-02-25

### Added
- **Subscription & Billing**  -  Full Stripe integration with plan selection, checkout, customer portal, and invoice history
- **Plan Tiers**  -  Trial, Starter ($49/mo), Professional ($99/mo), Enterprise ($199/mo) with yearly discounts
- **Auto-Renewal**  -  Stripe handles automatic subscription renewals with webhook-driven status updates
- **Payment History**  -  Invoice listing with status badges, view/download links
- **Feature Gating**  -  Plan-based feature access control via `plan_features` database table
- **Subscription Guard**  -  Middleware hook to check subscription status and redirect expired/cancelled users
- **Version API**  -  `/api/version` endpoint for health checks and build identification
- **Build Versioning**  -  Semantic versioning with git SHA and build timestamp injected at build time
- **Version Display**  -  App version shown in sidebar footer

### Infrastructure
- Stripe SDK integration (server + client)
- Stripe Webhook handler for subscription lifecycle events
- Stripe Checkout for new subscriptions
- Stripe Customer Portal for self-service management
- Billing database tables (subscriptions, billing_invoices, plan_features)
