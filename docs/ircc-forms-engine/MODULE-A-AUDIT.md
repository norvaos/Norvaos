# MODULE A — Existing IRCC Forms System Audit

**Date:** 2026-03-19
**Scope:** Full subsystem audit of IRCC forms infrastructure inside NorvaOS
**Purpose:** Identify what exists, what is strong, what is weak, what must be preserved, replaced, or deleted before building the IRCC Forms Engine.

---

## 1. Schema Tables and Relationships

### Core IRCC Form Tables

| Table | Migration | Purpose | Verdict |
|-------|-----------|---------|---------|
| `ircc_forms` | 057 | Form library — PDF templates with XFA metadata, scan status, checksums, mapping versions | **KEEP** |
| `ircc_form_sections` | 057 | Questionnaire sections per form (section_key, title, sort_order, merge_into) | **KEEP WITH MODIFICATION** — needs condition support, completion state |
| `ircc_form_fields` | 057 | XFA fields with admin mappings (profile_path, field_type, options, show_when, required, client_visible, array configs) | **KEEP WITH MODIFICATION** — needs richer condition model, stale tracking, cross-form equivalence |
| `ircc_form_array_maps` | 057 | Repeater/array field configurations (children, siblings, etc.) | **KEEP** |
| `ircc_stream_forms` | 057 | Case type ↔ form junction table | **ISOLATE TEMPORARILY** — superseded by `ircc_form_assignment_templates` but still referenced |
| `ircc_form_versions` | 073 | Archives old form versions when PDFs are replaced | **KEEP** |
| `ircc_form_assignment_templates` | 074 | Reusable form assignments per matter type/case type with conditions, versioning, person_role_scope | **KEEP** |
| `matter_form_instances` | 074 | Per-matter form instances with status tracking (pending → submitted) | **KEEP WITH MODIFICATION** — needs answer storage, completion state, stale tracking |
| `form_assignment_template_history` | 074 | Append-only audit log for template changes | **KEEP** |

### Form Pack Generation Tables

| Table | Migration | Purpose | Verdict |
|-------|-----------|---------|---------|
| `form_pack_versions` | 052 | Generated form pack versions — frozen snapshots, resolved fields, validation results | **KEEP** |
| `form_pack_artifacts` | 052 | INSERT-only PDF artifacts with checksums | **KEEP** |

### Canonical Profile Tables

| Table | Migration | Purpose | Verdict |
|-------|-----------|---------|---------|
| `canonical_profiles` | 095 | One per contact — shared foundation | **KEEP** |
| `canonical_profile_fields` | 095 | EAV temporal field storage with provenance, source, verification_status | **KEEP** |
| `canonical_profile_snapshots` | 095 | Optional per-matter snapshots | **KEEP WITH MODIFICATION** — needs integration into form engine |
| `canonical_profile_conflicts` | 095 | Conflict detection records | **KEEP** |

### Supporting Tables

| Table | Migration | Purpose | Verdict |
|-------|-----------|---------|---------|
| `ircc_form_templates` | 034 | Legacy form template definitions | **REPLACE** — superseded by `ircc_forms` (057) |
| `ircc_questionnaire_sessions` | 034 | Tracks intake data collection with progress tracking, portal link integration | **KEEP WITH MODIFICATION** — needs per-form-instance progress, not just per-session |
| `contacts.immigration_data` | Various | JSONB column storing IRCCProfile | **KEEP** — but must not be sole answer store; canonical_profile_fields is the truth layer |
| `matter_people` | 023 | Per-matter person records with roles (principal, spouse, dependent, co_sponsor, other) | **KEEP** |
| `matter_people.profile_data` | 112 | Point-in-time IRCCProfile JSONB snapshot per person in a matter | **KEEP** |
| `field_verifications` | 084 | Lawyer sign-off per field per matter | **KEEP** |
| `profile_field_history` | 084 | Append-only audit of immigration_data changes | **KEEP** |
| `matter_profile_sync_log` | 112 | Audit trail of canonical ↔ matter syncs | **KEEP** |

---

## 2. Current Form Definitions

Forms are defined in the **`ircc_forms`** table (DB-driven, migration 057). The legacy hardcoded `form-field-registry.ts` is intentionally emptied — the DB is the single source of truth for form structure.

**Current forms seeded:**
- IMM5257E — Application for Temporary Resident Visa
- IMM5406 — Additional Family Information
- IMM5476E — Use of a Representative
- IMM5710E — Work Permit (seeded via `seed-imm5710e.ts`)

**Form upload pipeline:** Upload PDF → Python sidecar XFA scan → auto-classify fields → auto-map to profile paths (confidence ≥ 85) → detect date groups → store in `ircc_forms`, `ircc_form_sections`, `ircc_form_fields`.

**Verdict:** **KEEP** — the DB-driven form definition model is correct. The upload/scan/classify pipeline is strong. Needs extension for richer condition models and cross-form equivalence metadata.

---

## 3. Current Questionnaire Generation Path

### Two parallel engines exist:

**A. Legacy pure-function engine** — `lib/ircc/questionnaire-engine.ts` (421 LOC)
- `buildQuestionnaire(formCodes, existingProfile)` — builds from hardcoded registry
- `evaluateFieldCondition(field, currentValues)` — simple show_when with 4 operators: equals, not_equals, is_truthy, is_falsy
- `calculateSectionProgress()` — counts filled vs required fields
- `validateSection()` / `validateQuestionnaire()` — basic validation (required, email regex, date format, phone, max_length)
- `responsesToProfile()` / `profileToResponses()` — bidirectional flat ↔ structured conversion

**Verdict:** **ISOLATE TEMPORARILY** — utility functions (profilePathGet/Set, progress calculation) are useful. The registry-based questionnaire building is deprecated. The condition evaluator is too weak (no AND/OR, no grouped rules, only 4 operators).

**B. DB-driven engine** — `lib/ircc/questionnaire-engine-db.ts` (1060 LOC)
- `buildQuestionnaireFromDB(formIds, existingProfile, supabase)` — fetches from DB tables
- `buildClientQuestionnaireFromDB(...)` — client-facing with extensive filtering:
  - Junk field removal (buttons, links, signatures, UI controls via regex)
  - YES/NO radio pair consolidation (IMM 5707 / IMM 1344 patterns → single boolean)
  - Person-entity sub-sectioning (splits by Applicant, Spouse, Parent1, etc.)
  - Structural section filtering (removes "Front Page", "Overflow", "Instructions")
- `computePerFormProgress()` — per-form progress in single DB query
- Default option generation (infers countries, languages, relationships from XFA paths)

**Verdict:** **KEEP WITH MODIFICATION** — this is the primary engine and it works. Needs: richer condition evaluation (AND/OR/nested), stale dependency tracking, cross-form deduplication awareness, repeated group management, per-section autosave.

---

## 4. Current Output Generation Path

### Generation Pipeline (generation-service.ts — 1059 LOC)

```
1. Resolve form from DB (ircc_forms) by pack_type
2. Fetch primary contact's immigration_data profile
3. Enforce playbook-level generation guards
4. Compute readiness via computePackReadinessFromDB()
   → Hard fail if can_generate === false
5. Download blank template PDF from Supabase Storage
6. Validate template checksum (SHA-256) — hard fail on mismatch
7. Snapshot profile via structuredClone()
8. Resolve XFA fields from DB mappings (buildXfaFieldDataFromDB)
9. Validate form data (non-blocking for drafts, blocking for finals)
10. Fill XFA via Python worker sidecar (fillXFAFormFromDB)
11. Generate checksum of filled PDF
12. Create version + artifact records via RPC (atomic, idempotent)
13. Upload to Supabase Storage
14. Return GenerationResult
```

**Approval flow:** Frozen snapshot → re-fill XFA (no watermark) → field verification gate → approve via RPC → version becomes immutable.

**Verdict:** **KEEP** — the generation pipeline is production-grade. Atomic version allocation, idempotency, checksum validation, frozen snapshots, immutability triggers. Needs: integration with new resolved data model (canonical + matter resolution), richer validation, generation history UI.

---

## 5. Current XFA/PDF Fill Path

### Python Worker Sidecar

- **URL:** `PYTHON_WORKER_URL` (default: `http://localhost:8100`)
- **Endpoints:** POST `/scan-xfa`, POST `/fill-xfa`, POST `/render-preview`
- **Stack:** pikepdf + lxml (XFA manipulation), PyMuPDF/fitz (incremental save), pdf417gen (barcodes)
- **Auth:** X-Worker-Key header
- **Circuit breaker:** 3 failures in 60s → opens for 30s

### DB-driven XFA filling (xfa-filler-db.ts + xfa-filler-db-server.ts)
1. Query `ircc_form_fields` for mapped fields (is_mapped=true)
2. Query `ircc_form_array_maps` for repeater fields
3. Build scalar field data: profile paths → XFA paths with value transformation
4. Handle date splitting (year/month/day), boolean → Yes/No, address concatenation
5. Resolve meta fields (signature, dates, consent) from DB
6. Call Python worker with PDF bytes + field data JSON
7. Return filled PDF + barcode status

### Legacy hardcoded XFA maps (xfa-filler.ts)
- `IMM5257_XFA_MAP` (~40 entries), `IMM5406_XFA_MAP` (~10 entries)
- `IMM5406_ARRAY_MAPS` (children, siblings)
- Direct profile_path → XFA path mappings

**Verdict:** Python sidecar **KEEP**. DB-driven filler **KEEP**. Legacy hardcoded maps **DELETE** — fully superseded by DB-driven approach. The `xfa-filler.ts` file with hardcoded maps should be removed once all forms are DB-mapped.

---

## 6. Seed/Import/Scanner Utilities

| File | Purpose | Verdict |
|------|---------|---------|
| `scripts/seed-ircc-forms.ts` | One-time migration seeding IMM5257E, IMM5406, IMM5476E into DB | **KEEP** — historical migration, do not re-execute |
| `scripts/seed-imm5710e.ts` | Seeds IMM5710E work permit (279 fields) | **KEEP** — same |
| `scripts/verify-ircc-migration.ts` | Validates DB state against expected values | **KEEP** |
| `scripts/xfa-scanner.py` | Standalone CLI XFA field extractor | **KEEP** — useful for debugging |
| `scripts/xfa-filler.py` | Standalone CLI XFA filler | **KEEP** — useful for debugging |
| `worker/services/xfa_scanner.py` | FastAPI XFA scanner in sidecar | **KEEP** |
| `worker/services/xfa_filler.py` | FastAPI XFA filler in sidecar | **KEEP** |
| `lib/ircc/auto-mapper.ts` | Heuristic XFA → profile path matching (3 strategies, 85 threshold) | **KEEP** |
| `lib/ircc/field-auto-classify.ts` | Detects field types, junk fields, section names from XFA | **KEEP** |
| `lib/ircc/date-split-detector.ts` | Groups Year/Month/Day fragments into unified dates | **KEEP** |
| `lib/ircc/xfa-label-utils.ts` | Label derivation and humanization | **KEEP** |
| `lib/ircc/scanner-type-map.ts` | XFA type → field_type conversion | **KEEP** |

---

## 7. Current Matter Linkage

**Path:** Matter → matter_type → ircc_form_assignment_templates → ircc_forms

**Form assignment flow:**
1. `ircc_form_assignment_templates` links form_id to matter_type_id or case_type_id
2. `matter_form_instances` creates per-matter snapshots with status tracking
3. `ircc_stream_forms` is the older junction table (still referenced but superseded)

**Person linkage:** `matter_form_instances.person_id` → `matter_people.id` enables per-person form assignment (principal, spouse, dependent).

**Verdict:** **KEEP** — the template → instance pattern is correct. `ircc_stream_forms` should be fully deprecated in favor of assignment templates. The `person_role_scope` on templates and `person_id` on instances enable entity-grouped forms.

---

## 8. Current Portal Linkage

### Portal Architecture
- Token-validated access via SHA-256 hashed `portal_links.token_hash`
- All data scoped to `matter_id` + `tenant_id` from token — no user-supplied IDs accepted
- Rate limiting: 30 req/min per IP

### Portal IRCC Components
- `portal-ircc-forms.tsx` — Form list with per-form progress cards
- `portal-form-questionnaire.tsx` — Single-form wrapper → shared `IRCCQuestionnaire` component
- `portal-ircc-questionnaire.tsx` — Legacy single merged questionnaire (backward compat)

### Data Flow
- GET sections → `buildClientQuestionnaireFromDB()` → filtered/cleaned questionnaire
- POST save → deep merge into `contacts.immigration_data` → update session progress
- Auto-completion: when all forms filled → session auto-completed → matter status advanced

### Prefill Safety
- `has_portal_saves` flag prevents stale profile auto-prefill
- Profile only returned if client has made explicit saves in current session

**Verdict:** **KEEP WITH MODIFICATION** — the portal architecture is solid. Needs: answer storage at form-instance level (not just contact.immigration_data), per-field source tracking, reused-answer indicators, verification prompts for time-sensitive data, stale dependency handling.

---

## 9. All Hardcoded Mapping Files/Constants/Functions

### CRITICAL — Must Be Replaced or Formally Isolated

| File | Content | Risk | Verdict |
|------|---------|------|---------|
| `lib/ircc/xfa-filler.ts` | `IMM5257_XFA_MAP` (~40 entries), `IMM5406_XFA_MAP` (~10 entries), `IMM5406_ARRAY_MAPS` | **HIGH** — duplicates DB mappings | **DELETE** — fully superseded by DB-driven filler |
| `lib/ircc/form-validator.ts` | Hardcoded `IMM5257E_RULES`, `IMM5406_RULES`, `IMM5476E_RULES`, `FORM_RULES` registry, XFA path constants | **HIGH** — validation rules not from DB | **REPLACE** — migrate rules to DB or derive from `ircc_form_fields` metadata |
| `lib/ircc/profile-path-catalog.ts` | 150+ hardcoded profile paths with types/labels/sections | **HIGH** — static autocomplete data | **REPLACE** — generate from IRCCProfile type or DB reference |
| `lib/ircc/field-auto-classify.ts` | `SECTION_NAME_MAP` (76 entries), `SECTION_DESCRIPTION_MAP` (26 entries), `MARITAL_STATUS_OPTIONS`, `SEX_OPTIONS`, `YES_NO_OPTIONS`, eye colour options | **MEDIUM** — inference heuristics for upload pipeline | **KEEP WITH MODIFICATION** — acceptable for upload-time classification, but option lists should be DB-driven |
| `lib/schemas/workflow-actions.ts` | `packType: z.enum(['IMM5406', 'IMM5476E', 'IMM5257E'])` | **MEDIUM** — hardcoded form code enum | **REPLACE** — derive from DB form registry |

### MODERATE — Acceptable as Fallbacks

| File | Content | Verdict |
|------|---------|---------|
| `lib/ircc/questionnaire-engine-db.ts` | `IRCC_COUNTRY_OPTIONS` (67 countries), `IRCC_LANGUAGE_OPTIONS`, `IRCC_RELATIONSHIP_OPTIONS`, `IRCC_CANADA_US_OPTIONS`, junk patterns, section name improvements, person entity labels | **KEEP** — fallback logic for when DB has no options. Country list should eventually come from a reference table |
| `lib/ircc/auto-mapper.ts` | `XFA_SECTION_TO_CATALOG` (56 entries), confidence thresholds | **KEEP** — upload-time heuristics, not runtime dependencies |
| `components/ircc/ircc-questionnaire.tsx` | `COUNTRIES` array (195 entries — **DUPLICATED** from questionnaire-engine-db.ts) | **REPLACE** — deduplicate to single source |

---

## 10. All Duplicated Logic Between Frontend/Backend

| Duplication | Location 1 | Location 2 | Risk |
|-------------|------------|------------|------|
| Country list (195 entries) | `questionnaire-engine-db.ts` (67 countries) | `ircc-questionnaire.tsx` (195 countries) | **Divergent lists** — different counts |
| Deep merge function | `portal/.../ircc-forms/[formId]/save/route.ts` | `portal/.../ircc-questionnaire/route.ts` | Code duplication — extract to shared util |
| Session stale config refresh | Multiple portal API routes | Same logic repeated | Extract to middleware/helper |
| Contact ID lookup pattern | 4+ portal API routes | Same pattern repeated | Extract to helper |
| Condition evaluation | `questionnaire-engine.ts` (4 operators, IRCC) | `condition-evaluator.ts` (6 operators, intake) | **Two separate condition engines** — must unify |
| Progress calculation | `questionnaire-engine.ts` (section-level) | `questionnaire-engine-db.ts` (per-form) | Two code paths for progress — should be single engine |

---

## 11. All Existing Validation Paths

### Server-Side Validation

| Layer | File | What It Validates | Verdict |
|-------|------|-------------------|---------|
| Readiness gate | `xfa-filler-db.ts` → `computePackReadinessFromDB()` | Field presence only (is_required + has value) | **KEEP WITH MODIFICATION** — needs to also enforce required_condition, patterns |
| Form rules | `form-validator.ts` → `validateFormData()` | 6 rule types: required, min/max length, date_range, pattern, cross_field | **REPLACE** — rules are hardcoded per form code; must be DB-driven |
| Playbook guards | `generation-service.ts` → `enforcePlaybookGenerationRules()` | Questionnaire %, documents, contradictions, readiness matrix | **KEEP** |
| Field verification | `generation-service.ts` → `enforceFieldVerificationGate()` | Lawyer sign-off on required fields before final approval | **KEEP** |
| Intake validation | `validation-engine.ts` | Hard stops + red flags (location mismatch, marital conflict, etc.) | **KEEP** — separate concern from form validation |

### Client-Side Validation

| What | Status | Risk |
|------|--------|------|
| Real-time field validation on portal questionnaire | **ABSENT** | **HIGH** — clients can submit invalid data; no pattern/length/conditional checks |
| required_condition enforcement from DB | **NOT IMPLEMENTED** | **HIGH** — DB schema supports it but form-validator ignores it |
| Stale answer detection | **ABSENT** | **HIGH** — no mechanism to flag/invalidate dependent answers |

---

## 12. Canonical Profile Assessment

### What Exists (Strong)

The three-layer canonical model (migration 095 + 112) is architecturally correct:

- **Layer 1 — Contact-level canonical** (`canonical_profiles` + `canonical_profile_fields`): EAV with temporal versioning, source tracking (extraction, client_portal, staff, import), verification_status (pending, verified, client_submitted, conflict), effective_from/to dates. No overwrites — history preserved.

- **Layer 2 — Matter-level snapshot** (`matter_people.profile_data`): Point-in-time JSONB snapshot with version counter and lock flag.

- **Layer 3 — Form rendering** (read-only at query time): XFA filler reads from profile.

- **Carry-forward function:** `snapshot_contact_profile_to_matter()` copies canonical → matter at creation.
- **Sync-back function:** `sync_matter_profile_to_canonical()` pushes matter edits back to canonical.
- **Audit trail:** `matter_profile_sync_log` tracks all syncs.
- **Auto-fill hook:** `useAutoFill(canonicalKey, contactId, matterId)` implements three-layer lookup with confidence levels.

### What Is Missing (Gaps)

1. **No form → canonical feedback loop.** Form submissions store to `contacts.immigration_data` but do NOT populate `canonical_profile_fields`. The canonical layer is manually populated.

2. **No cross-matter data import UI.** The carry-forward function exists but there is no "import from prior matter" workflow in the UI.

3. **No returning-client pre-fill integration.** Kiosk detects returning clients but doesn't trigger form pre-fill.

4. **No field equivalence table.** No mapping of "these 5 form fields across 3 forms are the same canonical field."

5. **No conflict resolution UI.** Conflict records exist in `canonical_profile_conflicts` but no staff UI for bulk resolution.

6. **No cross-matter visibility.** No view showing "which matters share this contact's data."

7. **Automatic sync-back is not automatic.** Requires manual invocation.

---

## 13. Dead Abstractions

| Abstraction | File | Status | Verdict |
|-------------|------|--------|---------|
| `FORM_REGISTRY` | `lib/ircc/form-field-registry.ts` | Empty object, deprecated comment | **DELETE** — dead code |
| `CASE_TYPE_FORM_MAP` | `lib/ircc/form-field-registry.ts` | Empty object | **DELETE** — dead code |
| `MAPPING_VERSIONS` | `lib/ircc/pack-constants.ts` | Empty object, throws on access | **DELETE** — dead code |
| `EXPECTED_TEMPLATE_CHECKSUMS` | `lib/ircc/pack-constants.ts` | Empty object, throws on access | **DELETE** — dead code |
| `PACK_DEFINITIONS` | `lib/ircc/pack-constants.ts` | Empty object, throws on access | **DELETE** — dead code |
| `SUPPORTED_PACK_TYPES` | `lib/ircc/pack-constants.ts` | Empty array, throws on access | **DELETE** — dead code |
| `ircc_form_templates` | Migration 034 | Superseded by `ircc_forms` (057) | **DELETE** — legacy table |
| `ircc_stream_forms` | Migration 057 | Superseded by `ircc_form_assignment_templates` (074) | **ISOLATE** — still referenced, migrate consumers then delete |

---

## 14. Scale Risks

| Risk | Severity | Detail |
|------|----------|--------|
| Flat JSONB answer storage | **HIGH** | All answers stored in `contacts.immigration_data` as a single JSONB blob. No per-field indexing, no per-form isolation, no per-matter isolation of answers. Cross-matter contamination possible. |
| No per-form-instance answer storage | **HIGH** | `matter_form_instances` has status tracking but no answer storage. Answers live in a single contact-level JSONB column. |
| Single condition evaluation (no AND/OR) | **HIGH** | `show_when` supports only single-condition checks. Complex branching impossible. |
| No stale dependency tracking | **HIGH** | When a parent answer changes, dependent answers remain silently active. No invalidation, no flagging, no recalculation. |
| Country list divergence | **MEDIUM** | Two hardcoded country lists with different counts (67 vs 195). |
| No client-side validation | **MEDIUM** | Portal users can submit any data; validation only runs at generation time. |
| Python worker single point of failure | **LOW** | Circuit breaker exists (3 failures → 30s open). Acceptable for current scale. |
| PDF preview has no caching | **LOW** | Server-side PNG generation per request. Not a concern at current usage levels. |

---

## 15. UI Limitations

| Limitation | Component | Impact |
|------------|-----------|--------|
| No entity grouping in form workspace | `ircc-forms-tab.tsx` | Forms displayed as flat list, not grouped by principal/spouse/dependent |
| No blocker visibility | `ircc-forms-tab.tsx` | Staff cannot see why a form is blocked at a glance (must drill into readiness) |
| No stale-data visibility | N/A | No concept of stale answers exists in UI |
| No source comparison | N/A | Staff cannot compare canonical vs matter vs form answer values |
| No prior-matter import action | N/A | No way to import answers from a previous matter |
| No reused-answer indicators | Portal | Client cannot see which answers were pre-filled vs need fresh input |
| No cross-form reuse visibility | N/A | Staff cannot see that changing one answer affects multiple forms |
| No condition evaluation trace | N/A | Cannot debug why a question showed or hid |
| No mapped field preview in workspace | Partial | Only available in generation validation result, not as a standalone inspection tool |
| No answer provenance inspector | N/A | Cannot trace where a field value came from |
| No bulk field mapping operations | Settings | Admin must map fields one by one |

---

## 16. Reuse Limitations

| Gap | Severity | Detail |
|-----|----------|--------|
| No cross-form answer sharing mechanism | **CRITICAL** | Same question asked in IMM5257E and IMM5406 requires separate answers. No shared logical field resolution. |
| No cross-matter data import workflow | **CRITICAL** | Second matter for same client starts nearly from zero. Carry-forward function exists in DB but no UI or automatic trigger. |
| No field equivalence mapping | **HIGH** | No table defining "these form fields across forms map to the same canonical concept." |
| No returning-client acceleration | **HIGH** | Kiosk detects returning clients but doesn't pre-fill forms. |
| Form answers don't feed canonical profile | **HIGH** | One-way only: canonical → form. Form submissions don't update canonical_profile_fields. |
| No reuse provenance tracking | **MEDIUM** | If an answer is reused, no record of where it came from. |

---

## 17. What Must Be Preserved

1. **DB-driven form definition model** (ircc_forms, ircc_form_sections, ircc_form_fields, ircc_form_array_maps) — correct architecture
2. **Form upload/scan/classify pipeline** (Python sidecar XFA scanner + auto-classifier + auto-mapper) — working well
3. **Generation pipeline** (generation-service.ts) — production-grade with atomic versioning, idempotency, checksums, frozen snapshots, immutability
4. **Python worker sidecar** (pikepdf + lxml XFA filling) — correct approach
5. **Three-layer canonical model** (canonical_profiles + matter snapshots + form rendering) — architecturally sound
6. **Form assignment template → instance pattern** (migration 074) — correct for entity-scoped form assignment
7. **Field verification system** (field_verifications table + enforceFieldVerificationGate) — needed for lawyer sign-off
8. **Audit infrastructure** (profile_field_history, matter_profile_sync_log, form_assignment_template_history) — comprehensive
9. **Portal token authentication and matter-scoping** — security is correct
10. **RLS policies** — all tables properly tenant-isolated

---

## 18. What Must Be Replaced

1. **Hardcoded form validation rules** (`form-validator.ts` FORM_RULES registry) → must be DB-driven from `ircc_form_fields` metadata or a new validation rules table
2. **Hardcoded XFA maps** (`xfa-filler.ts` IMM5257_XFA_MAP, IMM5406_XFA_MAP) → delete, fully superseded by DB
3. **Single-condition show_when model** → replace with grouped AND/OR condition model supporting all required operators
4. **Flat JSONB answer storage** (`contacts.immigration_data` as sole answer store) → add per-form-instance answer storage with source tracking
5. **Hardcoded packType enum** (`workflow-actions.ts`) → derive from DB
6. **Legacy form registry** (`form-field-registry.ts`, `pack-constants.ts`) → delete dead code
7. **Duplicated condition evaluators** (questionnaire-engine.ts vs condition-evaluator.ts) → unify into single rules engine
8. **Progress calculation** (two separate implementations) → single engine shared by portal and staff UI

---

## 19. What Must Be Deleted

| File/Table | Reason |
|------------|--------|
| `lib/ircc/form-field-registry.ts` | Dead code — empty registry |
| `lib/ircc/pack-constants.ts` | Dead code — empty objects that throw on access |
| `lib/ircc/xfa-filler.ts` (hardcoded maps only) | Superseded by DB-driven filler — keep utility functions if any, delete the map constants |
| `ircc_form_templates` table (migration 034) | Superseded by `ircc_forms` (057) |

---

## 20. Test Coverage Assessment

### Current State: ZERO dedicated IRCC form tests

- No unit tests for generation-service.ts (1,059 LOC)
- No unit tests for questionnaire-engine-db.ts (1,060 LOC)
- No unit tests for form-validator.ts (407 LOC)
- No unit tests for xfa-filler.ts/xfa-filler-db.ts
- No integration tests for the full generation pipeline
- No component tests for IRCC UI
- No E2E tests for form workflows
- No test fixtures or mock data for IRCC forms

### Related tests that exist (but not IRCC-specific):
- `immigration-status-engine.test.ts` — intake status state machine
- `readiness-matrix-engine.test.ts` — readiness scoring
- Document engine tests (field-resolver, condition-evaluator, render-engine)

**Test infrastructure:** Vitest framework is set up and working for other subsystems. The IRCC subsystem has simply never been tested.

---

## 21. Summary Verdict Table

| Component | Lines | Verdict | Priority |
|-----------|-------|---------|----------|
| `ircc_forms` + sections + fields + array_maps (DB schema) | N/A | **KEEP WITH MODIFICATION** | Core |
| `questionnaire-engine-db.ts` | 1,060 | **KEEP WITH MODIFICATION** | Core |
| `generation-service.ts` | 1,059 | **KEEP** | Core |
| `xfa-filler-db.ts` + `xfa-filler-db-server.ts` | ~300 | **KEEP** | Core |
| Python worker sidecar | ~500 | **KEEP** | Core |
| Canonical profile system (095 + 112) | N/A | **KEEP** | Core |
| Form assignment templates (074) | N/A | **KEEP** | Core |
| `ircc-questionnaire.tsx` | 1,199 | **KEEP WITH MODIFICATION** | UI |
| `portal-ircc-forms.tsx` | ~400 | **KEEP WITH MODIFICATION** | UI |
| `ircc-forms-tab.tsx` | 714 | **REPLACE** — needs entity grouping, blockers, stale visibility | UI |
| `ircc-intake-tab.tsx` | 494 | **KEEP WITH MODIFICATION** | UI |
| `form-validator.ts` | 407 | **REPLACE** — hardcoded rules | Core |
| `questionnaire-engine.ts` | 421 | **ISOLATE** — utility functions useful, engine deprecated | Support |
| `xfa-filler.ts` (hardcoded maps) | 540 | **DELETE** | Cleanup |
| `form-field-registry.ts` | 20 | **DELETE** | Cleanup |
| `pack-constants.ts` | ~50 | **DELETE** | Cleanup |
| `profile-path-catalog.ts` | ~200 | **REPLACE** — generate from type/DB | Support |
| `field-auto-classify.ts` | 511 | **KEEP** | Support |
| `auto-mapper.ts` | ~200 | **KEEP** | Support |
| `date-split-detector.ts` | ~150 | **KEEP** | Support |
| `scanner-type-map.ts` | ~30 | **KEEP** | Support |

---

## 22. Critical Findings Summary

### What Is Strong
1. DB-driven form definition model is correct and working
2. XFA scan/classify/map pipeline is production-quality
3. Generation pipeline with atomic versioning and immutability is excellent
4. Three-layer canonical profile model is architecturally sound
5. Portal security (token auth, matter scoping, RLS) is correct
6. Python sidecar approach for PDF manipulation is correct

### What Is Weak
1. **Answer storage is flat and unstructured** — single JSONB blob per contact, no per-form-instance answers, no per-field source tracking at the form level
2. **Condition/rules engine is primitive** — 4 operators, no AND/OR, no grouped rules, no stale dependency handling
3. **Validation is hardcoded** — per-form rules in TypeScript constants, not from DB
4. **No cross-form reuse mechanism** — same question asked multiple times across forms
5. **No cross-matter reuse workflow** — DB functions exist but no UI or trigger
6. **Zero test coverage** — 6,800+ LOC of critical business logic completely untested
7. **Staff UI lacks inspection tools** — no blocker visibility, no source comparison, no provenance tracing, no condition debugging

### What Must Change for the Engine to Be Real
1. Per-form-instance answer storage with source tracking
2. DB-driven condition/rules engine with full operator set and AND/OR groups
3. Stale dependency invalidation when parent answers change
4. Cross-form question deduplication via field equivalence
5. Cross-matter reuse UI with verification prompts
6. Form answers → canonical profile feedback loop
7. Entity-grouped form workspace with blocker/stale/source visibility
8. Unified condition evaluator shared by portal and staff UI
9. Client-side validation matching server-side rules
10. Comprehensive test coverage

---

*End of Module A Audit*
