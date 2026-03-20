# IRCC Forms Engine — Source of Truth Declaration

## Current State (Transition Period)

### When `matter_form_instances.answers` is authoritative

- **All per-form-instance answer storage**: Each form instance owns its answers in the `answers` JSONB column. This is the canonical source for:
  - Field values entered by clients via portal
  - Field values entered by staff via workspace
  - Stale flags, conflict metadata, source tracking, timestamps
  - Completion state computation
  - Generation resolver input (`resolveForGeneration()` reads from here)
  - Cross-form reuse (`prefillFromSiblings()`)
  - Cross-matter import (`importFromCanonical()`)

- **The generation pipeline** (`generateFormPack()`) now queries `matter_form_instances` first. If an active instance exists with populated answers, `resolveForGeneration()` is used. The version record is tagged `generation_source: 'instance_engine'`.

- **Condition evaluation, stale tracking, trust conflict detection** all operate on the per-instance answer map.

### When `contacts.immigration_data` is fallback/cache only

- **Generation fallback**: If no `matter_form_instances` row exists for the matter+form (legacy matters created before the engine), `fetchImmigrationProfile()` reads from `contacts.immigration_data`. Tagged `generation_source: 'db'`.

- **Portal pre-fill**: Portal section routes (`/api/portal/[token]/ircc-forms/route.ts`, `/api/portal/[token]/ircc-questionnaire/sections/route.ts`) still pre-fill from `contacts.immigration_data`. This is read-only and will be switched to read from instances.

- **Readiness checks**: `immigration-readiness.ts`, `readiness-matrix-engine.ts` read `contacts.immigration_data` for readiness scoring. These are read-only consumers.

- **Status engine**: `immigration-status-engine.ts` reads `contacts.immigration_data` for status evaluation. Read-only.

- **Kiosk identity verification**: `verify-identity/route.ts` reads DOB from `contacts.immigration_data`. Read-only, low risk.

### Sync direction

```
                     PRIMARY WRITE
                         │
                         ▼
              ┌──────────────────────┐
              │ matter_form_instances │  ← All writes land here first
              │       .answers       │    (portal, staff, cross-form,
              └──────────────────────┘     cross-matter import)
                         │
                    dual-write
                    (transitional)
                         │
                         ▼
              ┌──────────────────────┐
              │      contacts        │  ← Transitional cache
              │  .immigration_data   │    (kept in sync via dual-write)
              └──────────────────────┘
                         │
                    read-only
                    consumers
                         │
                         ▼
              readiness, status engine,
              kiosk, portal pre-fill
```

**Direction**: Instance → Contact (via dual-write on every save).
**Never**: Contact → Instance (except during initial carry-forward/import).

### Conflict behaviour

1. **Within an instance**: The answer engine's trust hierarchy applies. `staff_entry` (trust 5) > `verified` (4) > `cross_form_reuse` (3) > `client_portal` (2) > `prefill` (1) > `system` (0). Lower-trust sources cannot overwrite verified higher-trust values.

2. **Instance vs. contact blob**: No conflict possible during transition because all writes go to instances first, then dual-write to the contact blob. The blob is always a lagging mirror.

3. **Cross-form conflicts**: Handled by `checkTrustConflict()` in the answer engine. If two instances have the same `profile_path` with different values from different trust levels, the higher-trust value wins during propagation.

4. **Cross-matter conflicts**: Handled by `REUSE_CATEGORY_MAP`. Stable fields auto-import. Semi-stable fields import but are flagged for review. Matter-specific fields are never imported.

### When the contact blob will be fully demoted

The contact blob can be fully demoted (writes removed) when ALL of these conditions are met:

1. **All active matters** have `matter_form_instances` rows with populated answers (no legacy matters relying on the blob)
2. **Read-only consumers migrated**:
   - `immigration-readiness.ts` → reads from instance answers
   - `readiness-matrix-engine.ts` → reads from instance answers
   - `immigration-status-engine.ts` → reads from instance answers
   - Portal pre-fill routes → reads from instance answers
   - `stale-draft-engine.ts` → reads from instance input_snapshot
   - `verify-identity/route.ts` → reads from canonical_profile_fields or instances
3. **Carry-forward updated**: `useSnapshotContactToMatter()` snapshots from instances instead of contact blob
4. **No legacy sessions**: All `ircc_questionnaire_sessions` reference instances

**Estimated timeline**: The dual-write period should last until all existing matters have been migrated or closed. New matters created after this deployment will have instances from the start. Legacy matters will continue using the blob fallback until they complete or are manually migrated.

### Write path audit (complete)

| Write path | Dual-wired? | Direction |
|---|---|---|
| Portal form save route | ✅ | Portal → instance + contact (cache) |
| Portal questionnaire route | ✅ | Portal → all instances + contact (cache) |
| Staff workspace (useUpdateIRCCProfile) | ✅ | Staff → all instances + contact (cache) |
| Contact page ImmigrationTab | ✅ | Staff → contact + all instances |
| Matter profiles sync-back | ✅ | Matter → contact + all instances |
| Matter profiles carry-forward | N/A | Contact → matter_people (read-only from contact) |
| Matter profiles update | N/A | Matter_people only (not contact) |
| Generation service | N/A | Read-only (instance-first, contact fallback) |
| Generate-pdf route | N/A | Read-only (instance-first, contact fallback) |
