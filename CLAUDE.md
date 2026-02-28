# NorvaOS — Claude Code Instructions

## What this is
NorvaOS is a single-tenant, multi-practice area law firm operating system. It started as LexCRM (immigration-only) and is being evolved into a full firm OS that supports multiple practice areas (Immigration, Real Estate, Family Law, etc.) from a single codebase. Each practice area gets its own matter types, stage pipelines, deadline catalogues, and workflow templates, but shares contacts, billing, documents, and settings.

## Tech stack (do not change)
- **Framework**: Next.js 15 App Router, React 19
- **Database**: Supabase (PostgreSQL + Row Level Security). Auth via `auth.uid()` in RLS policies.
- **Server state**: TanStack Query (React Query v5) — all Supabase fetches go through hooks in `lib/queries/`
- **Client state**: Zustand with persist middleware — store key is `norvaos-ui`, file is `lib/stores/ui-store.ts`
- **Styling**: Tailwind CSS v4 + shadcn/ui components
- **Forms**: React Hook Form + Zod (`@hookform/resolvers/zod`)
- **Types**: Manual TypeScript types in `lib/types/database.ts` — NOT generated. Update this file when adding tables.
- **Package manager**: pnpm

## Project structure
```
app/(dashboard)/          # All authenticated pages
app/(auth)/               # Login / signup
components/layout/        # Sidebar, Header, MobileNav
components/matters/       # Matter-specific components
components/contacts/      # Contact-specific components
lib/queries/              # All TanStack Query hooks (one file per domain)
lib/stores/               # Zustand stores
lib/schemas/              # Zod validation schemas
lib/types/database.ts     # Manual DB types — keep in sync with migrations
lib/utils/                # constants.ts, logger.ts, cn(), etc.
scripts/migrations/       # Numbered SQL migration files (run manually in Supabase dashboard)
```

## Coding conventions

### RLS pattern (use this everywhere)
```sql
USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()))
```

### TanStack Query hook pattern
```typescript
export function useSomething(tenantId: string) {
  return useQuery({
    queryKey: ['something', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('table')
        .select('*')
        .eq('tenant_id', tenantId)
      if (error) throw error
      return data
    },
    enabled: !!tenantId,
    staleTime: 1000 * 60 * 5, // 5 min for reference data
  })
}
```

### Mutation pattern
```typescript
export function useCreateSomething() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: SomethingInsert) => { ... },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['something'] })
    },
  })
}
```

### Adding a new table
1. Write a numbered migration in `scripts/migrations/` (next number in sequence)
2. Add `IF NOT EXISTS`, RLS policy, and indexes to the migration
3. Add the Row/Insert/Update types to `lib/types/database.ts`
4. Create a query hook file in `lib/queries/`
5. Run the migration in Supabase dashboard SQL editor

### Soft deletes
Use `is_active: boolean DEFAULT true`. Never hard-delete user data except deadlines and junction rows.

### Practice area filtering
- Global filter is in Zustand: `useUIStore((s) => s.activePracticeFilter)` — value is a UUID or `'all'`
- Pages should respect this filter. Pattern: `effectivePracticeAreaId = localFilter || (globalFilter !== 'all' ? globalFilter : '')`

### Canadian English
Use Canadian spelling in all UI strings: "colour", "customise", "organisation", "licence", "defence".

## What Phase 1 built (already done — do not redo)
- `scripts/migrations/009-norva-os-multi-practice.sql` — new tables: `matter_types`, `matter_stage_pipelines`, `matter_stages`, `deadline_types`, `matter_type_schema`, `matter_custom_data`, `workflow_templates`, `matter_stage_state`. Alters: `matters.matter_type_id`, `matter_deadlines.deadline_type_id`, `users.practice_filter_preference`, `practice_areas.is_enabled`.
- `lib/queries/matter-types.ts` — hooks for matter types, pipelines, stages, deadline types, matter deadlines, upcoming deadlines widget
- `lib/stores/ui-store.ts` — added `activePracticeFilter` (persisted)
- `components/layout/header.tsx` — global practice filter dropdown (Select with enabled practice areas)
- `app/(dashboard)/settings/practice-areas/page.tsx` — full CRUD + enable/disable toggles + colour picker
- `components/matters/matter-form.tsx` — matter type dropdown (conditional on practice area selection)
- `app/(dashboard)/matters/page.tsx` — global filter integration, matter type column
- `app/(dashboard)/page.tsx` — practice-filter-aware stats, `DeadlinesIn14DaysWidget`
- `app/(dashboard)/matters/[id]/page.tsx` — Deadlines tab with `DeadlinesTab` component
- Full rebrand: all "LexCRM" → "NorvaOS" across all source files

## Phase 2 — Matter Stages & Pipeline UI (build next)
Each matter has a stage state in `matter_stage_state`. The pipeline and stages are seeded per matter type (see migration 009).

**Deliverables:**
- `components/matters/stage-pipeline-bar.tsx` — horizontal stepper showing stages for the matter's pipeline; clicking a stage advances the matter; current stage highlighted; completed stages shown as checked
- Wire `matter_stage_state` into `app/(dashboard)/matters/[id]/page.tsx` — show the pipeline bar above the tabs
- `app/(dashboard)/settings/matter-types/page.tsx` — CRUD for matter types per practice area; manage stage pipelines and stages per matter type (name, colour, icon, SLA days, terminal flag)
- `lib/queries/matter-types.ts` additions: `useAdvanceMatterStage()` mutation, `useMatterStageState(matterId)`

**Acceptance criteria:**
- Advancing a stage updates `matter_stage_state.current_stage_id` and appends to `matter_stage_state.stage_history` (JSONB)
- Terminal stages auto-close the matter (`matters.status = 'closed_won'`) if `auto_close_matter = true`
- Pipeline bar is read-only for closed matters

## Phase 3 — Workflow Templates & Task Auto-Creation
When a matter advances to a new stage, if a `workflow_template` exists for that (matter_type + stage), auto-create tasks from the template.

**Deliverables:**
- `app/(dashboard)/settings/workflow-templates/page.tsx` — bind task templates to stage transitions
- Stage advance mutation should check for workflow templates and fire task creation
- `app/(dashboard)/settings/deadline-types/page.tsx` — admin CRUD for `deadline_types` catalogue

## Phase 4 — Matter Custom Fields
Each matter type has a JSON schema in `matter_type_schema`. Render a dynamic form from that schema on the matter detail page.

**Deliverables:**
- `components/matters/custom-fields-panel.tsx` — renders form fields from JSON schema, saves to `matter_custom_data.data`
- Schema builder in settings (drag-and-drop field types: text, date, select, number, checkbox)

## Phase 5 — Reporting
Practice-area-aware reports dashboard.

## Key files to read before touching anything
- `lib/types/database.ts` — understand the full type surface before any DB work
- `lib/queries/matters.ts` — existing matter query patterns (don't duplicate)
- `scripts/migrations/009-norva-os-multi-practice.sql` — understand all new tables before writing new queries

## Things NOT to change
- The existing Contacts, Leads, Tasks, Documents modules — Phase 1-4 don't touch them
- The Supabase auth setup in `lib/supabase/`
- The billing/Stripe setup in `lib/stripe/` and `app/(dashboard)/settings/billing/`
- The existing `pipelines` and `pipeline_stages` tables — those are for leads, not matters. The new matter pipeline tables are `matter_stage_pipelines` and `matter_stages`.

## Running the app
```bash
pnpm dev          # dev server on localhost:3000
pnpm build        # production build
pnpm type-check   # tsc --noEmit
```

Migrations are run manually in the Supabase dashboard SQL editor — there is no automated migration runner.
