# IRCC Forms Engine — Architecture Decision Record

**Date:** 2026-03-19
**Status:** Gate — requires approval before any module build proceeds
**Prerequisite:** Module A audit complete (see MODULE-A-AUDIT.md)

This document resolves 10 architectural decisions. Each states: chosen approach, rejected alternatives, rationale, migration impact, risk, and dependency order. No implementation detail. No vague prose.

---

## ADR-1: Replacement of Flat JSONB Answer Storage

### Problem
All IRCC answers currently live in a single `contacts.immigration_data` JSONB column. This blob is contact-level (not matter-level), has no per-field source tracking, no per-form isolation, no stale detection, and allows cross-matter contamination.

### Chosen Approach
**Per-form-instance answer storage on `matter_form_instances`.**

Add an `answers` JSONB column to `matter_form_instances` (migration 074). Each key is a `profile_path`. Each value is an `AnswerRecord`:

```
{
  value: <the answer>,
  source: 'client_portal' | 'staff_entry' | 'canonical_prefill' | 'cross_form_reuse' | 'cross_matter_import' | 'extraction',
  source_origin: <originating entity ID>,
  verified: boolean,
  verified_by: UUID | null,
  verified_at: ISO timestamp | null,
  stale: boolean,
  stale_reason: string | null,
  updated_at: ISO timestamp
}
```

Also add: `completion_state` JSONB (per-section counts), `blocker_count` INT, `stale_count` INT, `missing_required_count` INT.

`contacts.immigration_data` continues to be updated as a **downstream cache** for backward compatibility. It is no longer the source of truth for any form-aware operation.

### Rejected Alternatives

| Alternative | Why Rejected |
|-------------|-------------|
| **Normalized answer table** (one row per answer per instance) | Over-normalized for the access pattern. Form load requires fetching all answers at once; JSONB column is one read. Row-per-answer adds O(N) inserts per save and join overhead. |
| **Keep single JSONB blob, add metadata columns alongside** | Fails the fundamental requirement: per-form-instance isolation. Two forms in the same matter sharing one blob cannot have independent source tracking or stale detection. |
| **EAV on `canonical_profile_fields` only** | Too slow for form rendering (requires per-field joins). Canonical is the truth layer; form instances need their own working copy. |
| **Separate `form_instance_answers` table with instance_id FK** | Viable but unnecessary indirection. JSONB on the instance row avoids the join and keeps the instance self-contained. If JSONB exceeds practical size (unlikely — typical form has <200 fields × ~100 bytes = ~20KB), this becomes the fallback. |

### Rationale
- One JSONB column per form instance bounds answer data to exactly the right scope: one form, one person, one matter.
- Source metadata per answer enables provenance tracking without a separate join.
- Stale flag per answer enables dependency invalidation at the answer level.
- Verified flag per answer replaces the separate `field_verifications` table for new flows (existing table preserved for migration).
- `contacts.immigration_data` demotion to cache eliminates it as a single point of truth while preserving backward compatibility for existing consumers (portal save endpoints, legacy queries).

### Migration Impact
- **Schema:** ALTER TABLE `matter_form_instances` ADD COLUMN `answers` JSONB DEFAULT '{}', ADD COLUMN `completion_state` JSONB DEFAULT '{}', ADD COLUMN `blocker_count` INT DEFAULT 0, ADD COLUMN `stale_count` INT DEFAULT 0, ADD COLUMN `missing_required_count` INT DEFAULT 0.
- **Data backfill:** Existing `contacts.immigration_data` values for active matters can be backfilled into their form instances' `answers` with `source: 'migration'`. This is optional and non-blocking — the prefill resolver (ADR-3) handles the fallback.
- **API changes:** All portal save endpoints switch from writing to `contacts.immigration_data` directly to writing to `matter_form_instances.answers` first, then cascading to `contacts.immigration_data` as cache.
- **Breaking change scope:** Portal API response shape changes (adds source metadata). Frontend must handle new response format.

### Risk
| Risk | Severity | Mitigation |
|------|----------|------------|
| JSONB column size for large forms | Low | Typical form: <200 fields × ~100 bytes = ~20KB. Monitor `pg_column_size()`. |
| Dual-write consistency (instance + immigration_data cache) | Medium | Single DB transaction. Reconciliation check on load (compare instance answer vs cache; log divergence). |
| Backfill correctness for existing matters | Low | Backfill is best-effort. Prefill resolver treats missing instance answers as "not yet populated" and falls back to canonical/contact data. |

### Dependency Order
**ADR-1 must be built first.** All other ADRs depend on per-instance answer storage existing.

---

## ADR-2: Canonical Immigration Profile Structure

### Problem
The canonical profile system (migration 095) exists with EAV temporal storage, but it is not integrated into the IRCC form engine. Form answers do not flow back to canonical. The canonical layer lacks coverage for several IRCC domains. The relationship between canonical fields and form answers is undefined.

### Chosen Approach
**Extend and integrate the existing three-layer canonical model. Do not replace it.**

**Layer 1 — Contact-level canonical** (`canonical_profiles` + `canonical_profile_fields`)
- Remains the single contact-level truth store.
- Extend domain coverage: add domains for all 16 IRCC profile sections (identity, biographical, contact, citizenship, passport, marital, spouse, dependants, parents, address_history, travel_history, education_history, employment_history, prior_refusals, immigration_history, military_security).
- Add a **form → canonical write-back path**: when a verified answer is saved to a form instance, and that profile_path maps to a canonical domain, upsert to `canonical_profile_fields` with source = 'ircc_form' and verification_status = 'client_submitted' or 'verified'.

**Layer 2 — Matter-level working copy** (`matter_form_instances.answers`)
- Per ADR-1. This is where form answers live during a matter's lifecycle.
- Not synced back to canonical until explicitly triggered (verification, matter closure, or staff action).

**Layer 3 — Form rendering** (read-only assembly)
- The questionnaire engine reads Layer 2 answers for the current instance.
- For empty fields, the prefill resolver (ADR-3) assembles from Layer 1 + prior instances.

**Relationship between layers:**
```
Layer 1 (canonical_profile_fields) ← write-back on verification
    ↓ prefill on form load
Layer 2 (matter_form_instances.answers) ← direct reads/writes during form work
    ↓ resolve on generation
Layer 3 (resolved output for XFA fill)
```

### Rejected Alternatives

| Alternative | Why Rejected |
|-------------|-------------|
| **Replace canonical with a new profile store** | Wastes existing infrastructure. Migration 095 already handles temporal versioning, provenance, conflict detection. |
| **Make canonical the direct answer store for forms** | Too slow for form interactions (EAV requires per-field joins). Forms need a working copy (JSONB on instance). |
| **Automatic bidirectional sync** | Dangerous. Unverified portal answers should not silently update canonical. Write-back must be gated by verification or explicit staff action. |

### Rationale
The three-layer model is architecturally correct. The only gap is the missing write-back path and incomplete domain coverage. Fixing those gaps gives us: reusable canonical data across matters, per-form working copies, and controlled propagation with provenance.

### Migration Impact
- **Schema:** Seed new domain values in `canonical_profile_fields` for IRCC-specific domains. No structural changes to canonical tables.
- **Data:** No migration needed. New canonical fields are populated organically as form answers are verified.
- **Code:** New write-back function: `writeBackToCanonical(contactId, profilePath, value, source, verificationStatus)`. Called from the answer engine when a form answer is verified.

### Risk
| Risk | Severity | Mitigation |
|------|----------|------------|
| Canonical bloat from form write-backs | Low | EAV is append-only with temporal versioning. Old values get `effective_to` set, not deleted. Storage is cheap. |
| Stale canonical values used for prefill | Medium | Canonical values carry `effective_from` dates. Prefill resolver shows "last updated X" for time-sensitive fields. |
| Write-back conflicts (two matters updating same canonical field) | Medium | Existing `canonical_profile_conflicts` table handles this. Staff resolves via conflict UI. |

### Dependency Order
ADR-2 depends on ADR-1 (needs per-instance answers to define what writes back). ADR-2 must precede ADR-3 (prefill resolver reads canonical), ADR-5 (cross-form reuse uses canonical equivalence), and ADR-6 (cross-matter reuse reads canonical).

---

## ADR-3: Source Precedence Hierarchy and Override Rules

### Problem
No defined precedence exists for resolving which value to use when multiple sources provide an answer for the same field. Contact data, canonical data, prior matter data, current matter data, and form-specific answers can all conflict.

### Chosen Approach
**Explicit six-level precedence hierarchy, evaluated top-down. First non-null match wins.**

```
1. Verified matter override     — staff verified this value for this specific matter
2. Current matter answer        — answer saved in this form instance (source: staff_entry or client_portal)
3. Cross-form reuse             — answer propagated from another form in the same matter
4. Verified canonical value     — canonical_profile_fields with verification_status = 'verified'
5. Unverified canonical value   — canonical_profile_fields with verification_status != 'verified'
6. Contact field fallback       — raw contacts table fields (name, email, phone, DOB, etc.)
```

**Override rules:**
- Levels 1–3 are matter-scoped. They never leak across matters.
- Levels 4–6 are contact-scoped. They are shared across all matters for that contact.
- A higher-precedence value always wins, but the lower-precedence values are preserved and visible for comparison.
- Staff can force any level by creating a verified matter override (level 1).
- No silent overwrites: if a save would change a value that has a higher-precedence source, the system flags a conflict and requires explicit resolution.

### Rejected Alternatives

| Alternative | Why Rejected |
|-------------|-------------|
| **Implicit precedence (latest write wins)** | Causes silent overwrites. Destroyed trust in prior implementations. Explicitly rejected by CTO spec. |
| **Timestamp-based (most recent value wins)** | Recency ≠ correctness. A verified value from 2 months ago outranks an unverified portal entry from today. |
| **Single-source (canonical only)** | Ignores matter-specific overrides. Immigration cases frequently need per-matter values that differ from the client's canonical profile (e.g., different intended travel dates, different employer). |
| **User-selectable per field** | Overcomplicated UX. The precedence must be deterministic. Staff can override via level 1 if they disagree with the resolution. |

### Rationale
Deterministic precedence eliminates silent overwrites, makes resolution testable, and gives staff a clear mental model: "what I verified for this matter always wins; otherwise the best available data is used."

### Migration Impact
- **New function:** `resolveFieldValue(instanceId, profilePath)` → returns `{ value, source, precedence_level, alternatives[] }`.
- **UI impact:** Every prefilled field shows its source badge. Conflict detection triggers when a save would violate precedence.
- **No schema change required.** Precedence is evaluated at read time from existing data structures.

### Risk
| Risk | Severity | Mitigation |
|------|----------|------------|
| Performance of six-level lookup per field | Low | Single DB query fetches instance answers + canonical fields for all paths at once. Resolution is in-memory. |
| Staff confusion about precedence levels | Medium | UI shows source badge per field. Tooltip explains why this value was chosen. Override action is always available. |

### Dependency Order
ADR-3 depends on ADR-1 (per-instance answers) and ADR-2 (canonical integration). ADR-3 must precede ADR-5 (cross-form reuse feeds into precedence level 3) and ADR-8 (generation uses resolved values).

---

## ADR-4: Unified Rules/Condition Engine

### Problem
Two separate condition evaluators exist with different operator sets. `show_when` supports only single conditions with 4 operators (equals, not_equals, is_truthy, is_falsy). No AND/OR grouping. No stale-answer invalidation when parent values change.

### Chosen Approach
**Single pure-function condition engine supporting grouped AND/OR logic with 14 operators and stale dependency tracking.**

**Condition schema** (JSONB, stored on `ircc_form_fields.show_when` and `required_condition`):

```
FieldCondition {
  logic: 'AND' | 'OR'
  rules: ConditionRule[]
  groups: FieldCondition[]    // recursive nesting
}

ConditionRule {
  field_path: string          // profile_path to evaluate against
  operator: ConditionOperator
  value?: unknown
}

ConditionOperator =
  'equals' | 'not_equals' | 'in' | 'not_in' |
  'truthy' | 'falsy' | 'has_value' | 'no_value' |
  'greater_than' | 'less_than' | 'greater_or_equal' | 'less_or_equal' |
  'contains' | 'not_contains'
```

**Backward compatibility:** Existing simple `show_when` values `{ profile_path, operator, value }` are auto-wrapped into `{ logic: 'AND', rules: [{ field_path, operator, value }], groups: [] }` at read time. No data migration required.

**Stale dependency tracking:**

Each field's `show_when` and `required_condition` implicitly define a dependency graph. When a parent field value changes:

1. Engine computes all fields that reference the changed field_path in their conditions.
2. For each dependent field:
   - If condition transitions from true → false: field becomes irrelevant. Answer marked `stale: true, stale_reason: 'parent_changed:{parent_path}'`. Behavior controlled by `on_parent_change` column on `ircc_form_fields`:
     - `'mark_stale'` (default): answer preserved but excluded from completion and flagged for review.
     - `'auto_clear'`: answer value set to null, stale flag set.
   - If condition transitions from false → true: field becomes relevant. If answer exists and was previously stale, prompt for re-confirmation.
3. `completion_state` and `blocker_count` / `stale_count` on the form instance are recalculated.

**Dependency graph precomputation:** At form definition load time (not per-keystroke), build an adjacency map: `{ [parent_profile_path]: child_field_ids[] }`. This makes change propagation O(children) not O(all_fields).

### Rejected Alternatives

| Alternative | Why Rejected |
|-------------|-------------|
| **Separate condition tables** (one row per rule) | Over-normalized for the query pattern. Conditions are always evaluated as a group per field. JSONB on the field row is simpler and avoids joins. |
| **Expression language (string DSL)** | Parsing overhead, injection risk, harder to validate, harder to build admin UI for. Structured JSONB is safer and queryable. |
| **Keep two separate evaluators** | Guaranteed divergence. The CTO spec explicitly requires portal and staff UI to share the same engine. |
| **Client-side-only evaluation** | Server must also evaluate conditions for validation, generation readiness, and API-level enforcement. Engine must be isomorphic (runs on both client and server). |

### Rationale
A single pure-function evaluator eliminates the divergence risk between portal and staff. The 14-operator set covers all IRCC form logic observed in the audit. Stale tracking at the engine level prevents false completion and invalid generation.

### Migration Impact
- **Schema:** ADD COLUMN `on_parent_change` TEXT DEFAULT 'mark_stale' CHECK (on_parent_change IN ('mark_stale', 'auto_clear')) TO `ircc_form_fields`.
- **Data:** No migration needed. Existing `show_when` values are backward-compatible (auto-wrapped at read time).
- **Code:** Replace `evaluateFieldCondition()` in `questionnaire-engine.ts` and `evaluateCondition()` in `condition-evaluator.ts` with single `evaluateCondition()` from new `condition-engine.ts`. Both portal and staff UI import from the same module.

### Risk
| Risk | Severity | Mitigation |
|------|----------|------------|
| Recursive condition evaluation could be slow for deeply nested groups | Low | Cap nesting depth at 3 levels. Real IRCC forms rarely need more than 2. |
| Stale cascade could be noisy (many fields flagged) | Medium | UI groups stale fields by triggering parent. Staff can "acknowledge all" per parent change. |
| Backward-compatible wrapper could mask broken legacy conditions | Low | Validate all existing `show_when` values against new schema at migration time. Log warnings for malformed conditions. |

### Dependency Order
ADR-4 depends on ADR-1 (stale flags stored on per-instance answers). ADR-4 must precede ADR-7 (validation engine uses conditions for required_if), ADR-8 (generation checks stale count), and all UI work (Modules C, H, I).

---

## ADR-5: Cross-Form Reuse Architecture

### Problem
Multiple IRCC forms in the same matter ask for the same information (family name, DOB, citizenship, passport, etc.). Currently, each form collects independently. No shared logical field resolution exists.

### Chosen Approach
**Implicit equivalence via shared `profile_path`. No explicit equivalence table.**

Two `ircc_form_fields` rows in different forms that share the same `profile_path` are, by definition, asking the same question. When an answer is saved to one form instance, the answer engine:

1. Queries all other `matter_form_instances` in the same matter.
2. For each, checks if their form's `ircc_form_fields` include the same `profile_path`.
3. If yes, and the target instance has no existing answer for that path (or has a lower-precedence source), propagates the answer with `source: 'cross_form_reuse'` and `source_origin: originating_instance_id`.
4. Logs propagation in `form_instance_answer_history`.

**Per-form output differences** are handled at the XFA mapping layer, not the answer layer. The answer is the same (`personal.family_name = "Smith"`); the output formatting (XFA path, date splitting, value formatting) is per-form-field.

### Rejected Alternatives

| Alternative | Why Rejected |
|-------------|-------------|
| **Explicit `canonical_field_equivalences` table** | Unnecessary indirection. `profile_path` already IS the equivalence key. If two fields share `profile_path: 'personal.family_name'`, they are equivalent by construction. An explicit table adds maintenance burden with no new information. |
| **UI-only reuse (show same value, no propagation)** | Fails the spec: "reuse exists only in UI but not in output mapping" is listed as a failure condition. Propagation must be real data-level, not cosmetic. |
| **Shared answer pool per matter (not per instance)** | Violates per-instance isolation. Different forms may need different states (one in progress, one completed). Shared pool makes independent form completion impossible. |

### Rationale
`profile_path` is already the canonical identifier for what a field represents. Using it directly as the equivalence key requires zero additional schema and zero admin configuration. If a new form is uploaded and its fields are mapped to existing profile paths, cross-form reuse activates automatically.

### Migration Impact
- **Schema:** None. No new tables.
- **Code:** Answer engine save path adds propagation logic. Single additional query per save: "find other form instances in this matter with fields matching this profile_path."
- **Data:** No migration. Existing form instances without per-instance answers are unaffected (they fall through to prefill resolver).

### Risk
| Risk | Severity | Mitigation |
|------|----------|------------|
| Propagation to completed/locked instances | Medium | Never propagate to instances with status 'approved', 'generated', or 'submitted'. Only propagate to 'pending' or 'in_progress'. |
| Unintended equivalence (two fields share profile_path but mean different things) | Low | profile_path mappings are admin-configured. If two fields shouldn't share answers, they should have different profile_paths. Admin UI can flag shared paths for review. |
| Performance of propagation query | Low | One query per save, filtered by matter_id (small result set). Index on `matter_form_instances(matter_id)` already exists. |

### Dependency Order
ADR-5 depends on ADR-1 (per-instance answers) and ADR-3 (propagation respects precedence). ADR-5 must precede Module F build and ADR-8 (generation must see propagated values).

---

## ADR-6: Cross-Matter Reuse Trigger and Review Architecture

### Problem
A returning client opening a second immigration matter starts nearly from zero. The canonical profile carry-forward functions exist in DB (migration 112) but have no UI trigger, no guided review, no categorized acceptance, and no provenance tracking.

### Chosen Approach
**Canonical-mediated reuse with categorized review gate.**

Cross-matter reuse NEVER reads directly from another matter's form instances. This is a non-negotiable constraint (matter-scoped access is inviolable per Level 1 authorization). Instead:

1. **Detection trigger:** When `matter_form_instances` are created for a new matter, the engine queries `canonical_profile_fields` for the contact. If non-trivial canonical data exists, a reuse summary is generated.

2. **Categorization:** Canonical fields are classified into three reuse categories:

   | Category | Examples | Behavior |
   |----------|----------|----------|
   | **Stable** | Name, DOB, birthplace, citizenship, parents' names, UCI | Auto-accept. Flag only if canonical value has `verification_status != 'verified'`. |
   | **Semi-stable** | Marital status, address, phone, email, passport, employment, education, refusal history | Present for review. Show `effective_from` date. Require confirmation for fields older than configurable threshold (default: 6 months). |
   | **Matter-specific** | Trip dates, employer-specific data, program details, purpose declarations | Never auto-import. These are per-matter by definition. |

   Category assignment is by `canonical_domain` + `field_key`, stored as a static classification in the codebase (not per-tenant configurable — the IRCC data model is standard).

3. **Review gate UI:** Staff sees a "Prior Data Found" panel at first form access in a new matter:
   - Reusable field count and percentage
   - Grouped by category (stable, semi-stable)
   - Per-field: current canonical value, source, last verified date, prior matter(s) that contributed
   - Actions: Accept All Stable, Review Semi-Stable (per-field accept/reject), Skip All
   - Accepted fields written to form instance answers with `source: 'cross_matter_import'`, `source_origin: canonical_profile_id`

4. **Provenance:** Every imported value is logged in `reuse_log` table (new):
   ```sql
   CREATE TABLE reuse_log (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL REFERENCES tenants,
     reuse_type TEXT NOT NULL CHECK (reuse_type IN ('cross_form', 'cross_matter', 'canonical_prefill')),
     target_instance_id UUID NOT NULL REFERENCES matter_form_instances,
     target_profile_path TEXT NOT NULL,
     source_canonical_field_id UUID REFERENCES canonical_profile_fields,
     value JSONB NOT NULL,
     accepted BOOLEAN,
     accepted_by UUID REFERENCES users,
     accepted_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ DEFAULT now()
   );
   ```

### Rejected Alternatives

| Alternative | Why Rejected |
|-------------|-------------|
| **Direct matter-to-matter data copy** | Violates matter-scoped access constraint. Matter A's form instance answers must never be directly readable by Matter B's code path. Canonical layer is the only legal intermediary. |
| **Automatic full import (no review)** | Spec explicitly requires re-verification for time-sensitive data. Blind import is listed as a failure condition. |
| **Client-triggered reuse (portal detects returning client)** | Portal has no visibility into prior matters. Detection must be server-side via canonical layer. Client sees the result (prefilled fields with verification prompts) but doesn't trigger the detection. |
| **Per-tenant category configuration** | IRCC data categories are standardized. Making categories tenant-configurable adds complexity with no benefit. If edge cases arise, they can be handled as overrides. |

### Rationale
Canonical-mediated reuse respects matter isolation while enabling dramatic time savings for returning clients. The categorized review gate prevents stale data contamination while allowing stable data to flow automatically. The reuse_log provides full provenance for every imported value.

### Migration Impact
- **Schema:** New `reuse_log` table. New field_key → category mapping (code-level, not DB).
- **UI:** New "Prior Data Found" panel component. Triggered when a matter's form instances are first loaded and canonical data exists.
- **Data:** No migration. Reuse is forward-only (applies to new matters, not existing ones).

### Risk
| Risk | Severity | Mitigation |
|------|----------|------------|
| Staff ignores review gate and accepts all blindly | Medium | Log acceptance speed. If all accepted in <2 seconds, flag for audit. |
| Semi-stable data stale by months | Medium | Show `effective_from` prominently. Fields older than threshold are marked with warning badge. |
| Reuse_log grows large over time | Low | Append-only, indexed on target_instance_id. Archival policy after matter closure. |

### Dependency Order
ADR-6 depends on ADR-1 (per-instance answers), ADR-2 (canonical integration), ADR-3 (precedence — imported values enter at appropriate level). ADR-6 can be built after core infrastructure (Modules B, D, E) and is independent of ADR-5 (cross-form reuse).

---

## ADR-7: DB-Driven Validation Model

### Problem
Validation rules are hardcoded per form code in `form-validator.ts` (IMM5257E_RULES, IMM5406_RULES, IMM5476E_RULES). Adding a new form requires code changes. `required_condition` JSONB exists on `ircc_form_fields` but is not enforced by the validation engine.

### Chosen Approach
**Derive all validation rules from existing `ircc_form_fields` metadata. No new validation rules table.**

The audit revealed that `ircc_form_fields` already has: `is_required`, `required_condition`, `max_length`, `field_type`, `options`. These are sufficient to express all current hardcoded rules:

| Current Hardcoded Rule | DB Source |
|------------------------|-----------|
| Required field | `ircc_form_fields.is_required = true` |
| Required-if (cross-field) | `ircc_form_fields.required_condition` JSONB (same schema as ADR-4 conditions) |
| Max length | `ircc_form_fields.max_length` |
| Pattern (email, phone, date) | Derive from `field_type`: email → email regex, phone → phone regex, date → ISO date regex |
| Enum validation | `ircc_form_fields.options` (value must be in options list for select fields) |

**New validation capabilities** added to `ircc_form_fields`:
- ADD COLUMN `min_length` INT
- ADD COLUMN `validation_pattern` TEXT (custom regex, overrides field_type default)
- ADD COLUMN `validation_message` TEXT (custom error message)
- ADD COLUMN `is_blocking` BOOLEAN DEFAULT true (whether this field blocks generation)

**Validation engine** reads `ircc_form_fields` for the form, applies rules based on field metadata, returns structured `ValidationResult[]`. No form-code switch/case. No hardcoded rule registry.

**Validation timing:**
- **Client-side (real-time):** Required, pattern, enum, max_length — evaluated on blur/change.
- **Server-side (on save):** Same rules + cross-field required_condition.
- **Server-side (on generation):** All rules + stale_count = 0 + blocker_count = 0.

### Rejected Alternatives

| Alternative | Why Rejected |
|-------------|-------------|
| **New `ircc_validation_rules` table** | Unnecessary. `ircc_form_fields` already has the required columns. Adding a separate table creates a maintenance burden (keeping rules in sync with field definitions) and splits the field definition across two tables. |
| **Keep hardcoded rules, extend per form** | Fails as soon as a new form is uploaded. Every new form would require a code deployment to add rules. Defeats the DB-driven architecture. |
| **JSON Schema validation** | Overkill for field-level validation. JSON Schema is designed for document-level validation; field-level rules are simpler and more performant. |

### Rationale
The metadata already exists on `ircc_form_fields`. The hardcoded rules are just a redundant interpretation of that metadata. Eliminating the hardcoded registry and reading directly from the field definition makes validation automatic for any new form.

### Migration Impact
- **Schema:** ALTER TABLE `ircc_form_fields` ADD COLUMN `min_length` INT, ADD COLUMN `validation_pattern` TEXT, ADD COLUMN `validation_message` TEXT, ADD COLUMN `is_blocking` BOOLEAN DEFAULT true.
- **Data:** Backfill `is_blocking = true` for all currently-required fields. Backfill `validation_pattern` for any fields that need custom regex beyond their field_type default.
- **Code:** New `validation-rules-engine.ts` replaces `form-validator.ts`. Old file is deleted after migration. Existing hardcoded rules are verified against DB metadata during migration (run `verify-ircc-migration.ts` equivalent).
- **Breaking:** `validateFormData(formCode, ...)` signature changes to `validateFormInstance(instanceId, ...)` — reads rules from DB, not from code.

### Risk
| Risk | Severity | Mitigation |
|------|----------|------------|
| Missing validation coverage for unlisted rules | Low | Audit all hardcoded rules against DB fields before cutover. Any rule that can't be expressed via field metadata gets added as `validation_pattern` + `validation_message`. |
| Client-side validation divergence from server | Medium | Single validation function runs isomorphically. Client imports the same module. Field metadata cached client-side via TanStack Query (staleTime: 5min). |

### Dependency Order
ADR-7 depends on ADR-4 (required_condition uses the same condition schema). ADR-7 must precede ADR-8 (generation uses validation engine) and Module K build.

---

## ADR-8: Generation Path Integration with Resolved Answer Model

### Problem
The generation pipeline currently reads from `contacts.immigration_data` (flat JSONB blob). It must switch to reading from the per-instance resolved answer model while preserving all production-grade qualities (atomic versioning, idempotency, checksums, frozen snapshots, immutability).

### Chosen Approach
**Introduce a resolution step between form instances and XFA fill. Keep the rest of the pipeline unchanged.**

**New step: `resolveFormForGeneration(instanceId)`**

1. Load `matter_form_instances.answers` for the target instance.
2. For any empty required fields, run the prefill resolver (ADR-3) to fill from canonical/contact fallback.
3. Validate via ADR-7 rules engine. Hard fail if blocking errors exist.
4. Check `stale_count = 0`. Hard fail if stale answers exist (or require explicit staff acknowledgment flag).
5. Check all source conflicts resolved. Hard fail if unresolved conflicts exist.
6. Produce `resolved_fields: Record<string, unknown>` — the final profile_path → value map.
7. Freeze `resolved_fields` as `input_snapshot` on `form_pack_versions` (replaces `structuredClone(contacts.immigration_data)`).
8. Pass `resolved_fields` to `buildXfaFieldDataFromDB()` (replaces raw profile).
9. Continue existing pipeline: Python fill → checksum → atomic version → storage upload.

**What does NOT change:**
- `form_pack_versions` schema (input_snapshot is already JSONB — content changes but column type doesn't)
- `form_pack_artifacts` schema
- `create_form_pack_version()` RPC
- `approve_form_pack_version()` RPC
- Python worker sidecar interface
- Watermarking logic
- Checksum validation logic
- Idempotency logic

### Rejected Alternatives

| Alternative | Why Rejected |
|-------------|-------------|
| **Rewrite the generation pipeline** | Unnecessary risk. The pipeline is the strongest part of the system. Only the data source needs to change. |
| **Generate from canonical directly** | Canonical may not have matter-specific values. The per-instance answers are the correct source because they include matter-specific overrides, cross-form reuse, and verified values. |
| **Generate from `contacts.immigration_data`** (keep current) | This is the problem. The flat blob has no source tracking, no stale detection, and no per-form isolation. Generating from it perpetuates the weak data model. |

### Rationale
Minimal change to a production-grade pipeline. The resolution step is the only new code. Everything downstream remains identical, preserving all the reliability guarantees.

### Migration Impact
- **Code:** New `generation-resolver.ts` with `resolveFormForGeneration()`. Modify `generateFormPack()` in `generation-service.ts` to call resolver instead of reading `contacts.immigration_data`.
- **Data:** `form_pack_versions.input_snapshot` content changes from raw immigration_data to resolved_fields. Existing versions are unaffected (they're frozen). New versions use the new format.
- **Breaking:** `computePackReadinessFromDB()` changes from reading `contacts.immigration_data` to reading `matter_form_instances.answers`. Readiness hook callers get same response shape.

### Risk
| Risk | Severity | Mitigation |
|------|----------|------------|
| Resolution produces different values than old path | Medium | During transition, run both paths in parallel and compare outputs. Log divergences. |
| Performance of resolution step | Low | Single DB query for instance answers + one for canonical fallback. In-memory merge. |

### Dependency Order
ADR-8 depends on ADR-1, ADR-3, ADR-4 (stale checks), ADR-7 (validation). ADR-8 is a late-phase integration — build after all core engines are working.

---

## ADR-9: Staff Inspection and Debug Architecture

### Problem
Staff currently has no tools to understand why a field has a value, why a question showed or hid, why generation is blocked, or where a reused answer came from. Diagnosis requires raw DB access.

### Chosen Approach
**Five inspection panels embedded in the matter form workspace. No separate debug application.**

| Panel | What It Shows | Data Source |
|-------|--------------|-------------|
| **Answer Provenance Inspector** | For any field: current value, source, source_origin, verification status, history of changes, canonical vs matter comparison | `matter_form_instances.answers[path]` + `form_instance_answer_history` + `canonical_profile_fields` |
| **Condition Evaluation Trace** | For any field: its show_when/required_condition, current evaluation result (true/false), the parent field values that drove the result, what would change the result | `ircc_form_fields.show_when/required_condition` + condition engine trace output |
| **Blocker Panel** | Aggregated list of all generation blockers: missing required, stale answers, unresolved conflicts, invalid values. Each blocker is a jump link to the field. | `matter_form_instances.completion_state` + validation engine output |
| **Mapped Field Preview** | For any form instance: the resolved XFA path → value map that would be sent to generation. Side-by-side with current answer values. | `resolveFormForGeneration()` dry-run output |
| **Reuse Provenance Viewer** | For any reused field: reuse type (cross-form/cross-matter/canonical), source instance/matter/profile, acceptance state, acceptance timestamp | `reuse_log` filtered by target_instance_id |

**Architectural principle:** All panels read from the same data structures that the engines use. No separate "debug data." If the panel shows a value, that's the value the engine sees.

**Access control:** Inspection panels are visible to users with `ircc_forms:inspect` permission. Default: Admin, Lawyer. Not visible to clients on portal.

### Rejected Alternatives

| Alternative | Why Rejected |
|-------------|-------------|
| **Separate debug application / admin tool** | Fragments the UX. Staff needs to see provenance in the same context where they're reviewing answers. Switching to a separate tool breaks flow. |
| **Log-based debugging (check server logs)** | Not self-service. Requires developer access. Unacceptable for operational support. |
| **Tooltips only (hover for source info)** | Insufficient for complex cases (stale chains, multi-level reuse). Panels provide structured, filterable views. |

### Rationale
The CTO spec explicitly requires staff to diagnose "why a field has a value, why a question showed or hid, and why generation blocked" without raw DB access. Embedded panels using the same data structures as the engines guarantee consistency and eliminate a class of "the debug tool says X but the system does Y" bugs.

### Migration Impact
- **UI only.** No schema changes. All data sources already defined in ADR-1 through ADR-8.
- **New components:** 5 panel components + 1 permission entry.
- **Performance consideration:** Condition trace and mapped field preview involve computation. These panels lazy-load (not rendered until opened).

### Risk
| Risk | Severity | Mitigation |
|------|----------|------------|
| Performance of dry-run generation preview | Low | Only runs when panel is opened. Cached for 30 seconds. |
| Information overload for staff | Medium | Panels are collapsed by default. Blocker panel is the only one visible by default (it's operationally critical). Others are opt-in. |

### Dependency Order
ADR-9 depends on all core engines (ADR-1 through ADR-8) being functional. It is the last architectural dependency. Build during Module I.

---

## ADR-10: Testing Strategy for All Critical Flows

### Problem
Zero test coverage across 6,800+ LOC of IRCC form logic. The CTO spec requires tests that prove end-to-end flows, not isolated utility functions.

### Chosen Approach
**Three test layers, organized by module. Vitest (existing framework). No E2E browser tests in initial delivery — integration tests at the engine level are sufficient to prove correctness.**

### Layer 1: Unit Tests (Pure Functions)

| Module | Test File | What It Proves |
|--------|-----------|----------------|
| Condition Engine (ADR-4) | `condition-engine.test.ts` | All 14 operators, AND/OR grouping, nested groups, backward-compatible wrapper, edge cases (null, undefined, empty string) |
| Stale Tracker (ADR-4) | `stale-tracker.test.ts` | Parent change → child stale, mark_stale vs auto_clear, progress recalculation excluding stale, cascade depth limit |
| Prefill Resolver (ADR-3) | `prefill-resolver.test.ts` | Six-level precedence, first-non-null wins, override behavior, conflict detection |
| Validation Engine (ADR-7) | `validation-rules-engine.test.ts` | Required, required_if, pattern, enum, min/max length, cross-field, blocking vs non-blocking, draft vs final mode |
| Answer Engine (ADR-1) | `answer-engine.test.ts` | Save with source tracking, dual-write to canonical, cross-form propagation (ADR-5), no-propagate to locked instances |
| Format Normalization | `format-normalization.test.ts` | Boolean → Yes/No, date splitting, address concatenation, checkbox mapping, country/province values |

### Layer 2: Integration Tests (Multi-Module Flows)

| Scenario | Test File | What It Proves |
|----------|-----------|----------------|
| First-time single applicant | `scenario-1-single-applicant.test.ts` | Prefill from contact → condition-based branching → save → validate → resolve → generation readiness |
| Married applicant with spouse | `scenario-2-married-applicant.test.ts` | Entity grouping → spouse sections appear → shared answer reuse → spouse-specific collection |
| Returning client second matter | `scenario-3-returning-client.test.ts` | Canonical detection → categorized review → import → verify only new fields → generation uses updated values |
| Parent invalidates dependents | `scenario-4-stale-cascade.test.ts` | Marital status change → spouse answers stale → progress recalculates → generation blocked → resolve → unblocked |
| Staff override after conflict | `scenario-5-staff-override.test.ts` | Contact vs questionnaire divergence → conflict detected → staff overrides → canonical updated → generation uses verified |
| Checkbox/repeated group heavy | `scenario-6-repeated-groups.test.ts` | Multi-select → other+text → repeated rows → output mapping correct → no corruption |

### Layer 3: Mapping Correctness Tests

| Test File | What It Proves |
|-----------|----------------|
| `mapping-imm5257e.test.ts` | All mapped fields for IMM5257E: profile_path → XFA path → expected output value |
| `mapping-imm5406.test.ts` | Same for IMM5406, including array maps (children, siblings) |
| `mapping-imm5476e.test.ts` | Same for IMM5476E |
| `mapping-imm5710e.test.ts` | Same for IMM5710E |

These tests use fixture profiles with known values and assert the exact resolved_fields output matches expected XFA path → value maps.

### Test Infrastructure

- **Fixture factory:** `createTestProfile(overrides)` — produces a valid IRCCProfile with sensible defaults.
- **Fixture form:** `createTestFormDefinition(fields)` — produces a valid form definition with sections and fields.
- **Fixture instance:** `createTestFormInstance(answers)` — produces a matter_form_instances row with typed answers.
- **Mock DB layer:** For integration tests, use in-memory representations of DB queries. No live Supabase dependency in tests.

### Rejected Alternatives

| Alternative | Why Rejected |
|-------------|-------------|
| **E2E browser tests (Playwright/Cypress)** | Too slow for the number of scenarios, too brittle for the pace of UI iteration. The critical logic is in the engines, not the UI rendering. Browser tests can be added later but are not the priority. |
| **Live Supabase integration tests** | Requires running Supabase instance, seed data, and teardown. Adds CI complexity. Engine logic is testable with mock data. |
| **Snapshot tests for UI components** | Low value for this subsystem. The risk is in logic (conditions, stale, reuse, validation, generation), not rendering. |
| **Test per utility function only** | Explicitly rejected by CTO spec: "tests prove the logic end-to-end and not just isolated utility functions." Layer 2 integration tests prove multi-module flows. |

### Rationale
Three layers ensure coverage from atomic logic (operators, precedence) through multi-module integration (full scenarios). Mapping tests are the final safety net for output correctness. The fixture factory makes test creation fast. Mock DB keeps tests fast and deterministic.

### Migration Impact
- **No production code changes.** Tests are additive.
- **CI integration:** Add `vitest run --reporter=verbose` to CI pipeline. Fail build on any test failure.
- **Coverage target:** 100% of condition engine operators, 100% of precedence levels, 100% of validation rule types, all 6 scenarios passing.

### Risk
| Risk | Severity | Mitigation |
|------|----------|------------|
| Mock DB diverges from real DB behavior | Medium | Keep mocks minimal (return typed data, not simulate queries). Integration tests that need real DB behavior are flagged for future live-DB test suite. |
| Test maintenance burden | Low | Fixture factory reduces boilerplate. Tests are organized by module, not by file. |

### Dependency Order
Tests are written alongside their module. Unit tests for Module E (condition engine) are written with Module E. Integration tests (scenarios) are written after Modules B through G are functional. Mapping tests are written after Module L (generation integration).

---

## Dependency Graph

```
ADR-1 (Per-Instance Answers)
  ↓
ADR-2 (Canonical Integration)     ADR-4 (Condition Engine)
  ↓                                 ↓
ADR-3 (Source Precedence)         ADR-7 (Validation Engine)
  ↓                                 ↓
ADR-5 (Cross-Form Reuse)           |
  ↓                                 |
ADR-6 (Cross-Matter Reuse)         |
  ↓                                 ↓
ADR-8 (Generation Integration) ←←←←←
  ↓
ADR-9 (Staff Inspection)
  ↓
ADR-10 (Testing) — parallel with all modules
```

**Build order:**
1. ADR-1 → ADR-2 → ADR-3 (data foundation)
2. ADR-4 → ADR-7 (rules foundation) — can parallel with #1 after ADR-1
3. ADR-5 (cross-form reuse) — after #1
4. ADR-6 (cross-matter reuse) — after #1 and #2
5. ADR-8 (generation) — after #1, #2, #3, #4
6. ADR-9 (inspection) — after all engines
7. ADR-10 (testing) — continuous, alongside each module

---

## Non-Negotiable Constraints

1. **Matter-scoped access is inviolable.** Cross-matter reuse goes through canonical layer only. No direct matter-to-matter data reads. (Level 1 authorization, locked condition.)

2. **Python sidecar direction is mandatory.** All PDF/XFA manipulation through Python worker. No JavaScript PDF libraries for XFA filling. (Level 1 authorization, locked condition.)

3. **Portal and staff UI share the same engine.** No duplicated condition evaluation, progress calculation, or validation logic. One module, two rendering modes.

4. **No silent overwrites.** Every value change that affects a higher-precedence source triggers conflict detection. Staff must resolve explicitly.

5. **Stale answers block generation.** A form instance with `stale_count > 0` cannot generate until stale answers are resolved (re-confirmed, re-answered, or auto-cleared per field configuration).

6. **`contacts.immigration_data` is demoted to cache.** Per-instance answers are the source of truth. The JSONB blob is updated as a downstream effect for backward compatibility only.

---

*End of Architecture Decision Record — Gate Document*
