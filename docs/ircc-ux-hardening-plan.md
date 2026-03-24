# IRCC Intake UX Hardening Plan — Cold-Start and Staff Clarity

## Context

Batch 2 rollout (20 matters, 41 PDFs) confirmed the engine is stable with zero defects. However, three UX friction points were identified that reduce the operational value of the system, particularly for cold-start matters (50% of Batch 2) and staff reviewing prefilled data.

This is a UX/operations task, not an engine workstream reopening.

---

## Item 1: Field Provenance Visibility

### Current State

`field-input.tsx` already renders `answer.source` as a 10px gray text label in the footer row (line 409). This is functionally correct but **invisible at staff scanning speed**. Staff cannot distinguish prefilled fields from manual entries without reading tiny text on every field.

### Proposed Change

Replace the text-only source indicator with a **colour-coded left-border strip + compact badge** on the field wrapper div.

| Source | Border Colour | Badge Text | Badge Style |
|---|---|---|---|
| `client_portal` | blue-400 | "Client" | blue outline |
| `staff_entry` | green-500 | "Staff" | green outline |
| `cross_matter_import` | purple-500 | "Imported" | purple outline, bold if `needs_review` |
| `cross_form_reuse` | indigo-400 | "Reused" | indigo outline |
| `canonical_prefill` | cyan-400 | "Prefilled" | cyan outline |
| `extraction` | amber-400 | "Extracted" | amber outline |
| `migration` | gray-400 | "Migrated" | gray outline |
| (no answer) | transparent | — | — |

**Visual treatment**: Add a 2px left border on the field container `<div>` using the source colour. The badge replaces the current 10px text. Fields with `needs_review: true` get a yellow background highlight (`bg-yellow-50`) and an eye icon.

### Files Affected

| File | Change |
|---|---|
| `components/ircc/workspace/field-input.tsx` | Replace footer source text with left-border + badge. Add `needs_review` highlight. |
| `components/ircc/workspace/questionnaire-renderer.tsx` | Pass `answer.needs_review` through to FieldInput (already passes `answer`). |

### Acceptance Criteria

- [ ] Staff can identify field source at a glance via border colour
- [ ] Review-required fields have yellow background + eye icon
- [ ] Existing stale and verified indicators unchanged
- [ ] Portal/client mode does NOT show provenance badges (staff-only)
- [ ] All 7 source types render with correct colour

---

## Item 2: Country Input Normalisation

### Current State

Two separate country lists exist:
- `field-input.tsx` line 38: `COUNTRY_OPTIONS` (202 countries as `{label, value}`)
- `ircc-questionnaire.tsx` line 54: `COUNTRIES` (200+ countries as strings)

Both use basic `Select` dropdowns. No autocomplete. No search. Client enters by scrolling 200+ items.

### Proposed Change

1. **Create a shared country constant**: `lib/constants/countries.ts` with a single authoritative list using ISO 3166 country names and optional alpha-2 codes.

2. **Replace both Select dropdowns with a searchable Combobox** using the shadcn `Command` (cmdk) pattern already available in the UI library.

3. **Normalise on save**: When a country value is saved, normalise it against the authoritative list. If a legacy free-text value exists (e.g., "PAK"), map it to the canonical name ("Pakistan").

### Files Affected

| File | Change |
|---|---|
| `lib/constants/countries.ts` | **NEW** — Single source of truth for country list (name + alpha-2 code) |
| `components/ircc/workspace/field-input.tsx` | Replace `Select` for country type with `CountryCombobox` |
| `components/ircc/ircc-questionnaire.tsx` | Replace `COUNTRIES` array with import from shared constant. Replace Select with `CountryCombobox`. |
| `components/ui/country-combobox.tsx` | **NEW** — Searchable country picker using shadcn Command/Popover pattern |

### Acceptance Criteria

- [ ] Single country list used everywhere (no duplication)
- [ ] Country picker is searchable (type "Pak" → shows "Pakistan")
- [ ] Existing country values from DB render correctly
- [ ] Legacy free-text values ("PAK", "pakistan") normalise to canonical form on next save
- [ ] Works in both staff and portal contexts
- [ ] Mobile-friendly (popover, not dialog)

---

## Item 3: Background-Question Efficiency

### Current State

IMM5257E has 8 boolean background questions (tuberculosis, overstay, refusal, criminal, deportation, military, government, organisation). Each is rendered as an individual `Switch` toggle. Staff must click 8 times for a clean applicant.

### Proposed Change

Add a **"Set All to No" button** at the top of the background section. The button:
1. Only appears in staff mode
2. Only appears when at least 2 background fields are unanswered
3. Requires a confirmation step: "This will set all unanswered background questions to 'No'. Confirm?"
4. Only sets fields that are currently empty — does NOT overwrite existing "Yes" answers
5. Marks all set fields with `source: 'staff_entry'`

Additionally, render background boolean fields as a **compact yes/no matrix** instead of individual switch rows:

```
┌──────────────────────────────────────────────┬─────┬─────┐
│ Question                                     │ Yes │ No  │
├──────────────────────────────────────────────┼─────┼─────┤
│ Tuberculosis contact in past 2 years?        │  ○  │  ●  │
│ Ever overstayed a visa?                      │  ○  │  ●  │
│ Ever refused a visa or denied entry?         │  ○  │  ●  │
│ Criminal offence?                            │  ○  │  ●  │
│ Ever deported or removed?                    │  ○  │  ●  │
│ Government official?                         │  ○  │  ●  │
│ Military/militia/civil defence?              │  ○  │  ●  │
│ Political party using violence?              │  ○  │  ●  │
└──────────────────────────────────────────────┴─────┴─────┘
               [ Set All Unanswered to "No" ]
```

When any answer is "Yes", the detail field expands below that row (using existing `show_when` logic).

### Files Affected

| File | Change |
|---|---|
| `components/ircc/workspace/questionnaire-renderer.tsx` | Detect background section (section_key = 'background'). Render as compact matrix instead of individual FieldInputs. Add "Set All to No" button. |
| `components/ircc/workspace/background-matrix.tsx` | **NEW** — Compact yes/no matrix for boolean-heavy sections |
| `components/ircc/ircc-questionnaire.tsx` | Add same matrix rendering for portal background step (optional — can defer to staff-only first) |

### Acceptance Criteria

- [ ] "Set All to No" button visible in staff mode when ≥2 background fields are unanswered
- [ ] Confirmation dialog before batch-set
- [ ] Does NOT overwrite existing "Yes" answers
- [ ] Detail fields expand when answer is "Yes"
- [ ] Matrix renders correctly in staff questionnaire renderer
- [ ] Conditional fields (show_when) still work correctly after batch-set
- [ ] Each field is saved with `source: 'staff_entry'`

---

## Expected Impact on Cold-Start Completion Burden

| Metric | Before | After (Estimated) |
|---|---|---|
| **Country fields** | Scroll 200+ items × 3-5 fields | Type 2-3 chars + select |
| **Background questions** | 8 individual clicks | 1 click + confirm (for clean files) |
| **Staff review time** | Read every field to find imports | Glance at border colours |
| **Cold-start IMM5257E time** | ~45 min (143 manual fields) | ~35 min (country picker + background batch saves ~10 min) |
| **Returning-client review** | ~15 min (checking 11 review fields) | ~5 min (yellow highlights, scan borders) |

---

## Components/Routes Summary

### New Files (3)

| File | Purpose |
|---|---|
| `lib/constants/countries.ts` | Authoritative country list |
| `components/ui/country-combobox.tsx` | Searchable country picker |
| `components/ircc/workspace/background-matrix.tsx` | Compact yes/no matrix |

### Modified Files (3)

| File | Change Scope |
|---|---|
| `components/ircc/workspace/field-input.tsx` | Source badge colours + border strip + review highlight + country combobox |
| `components/ircc/workspace/questionnaire-renderer.tsx` | Background section detection + matrix delegation |
| `components/ircc/ircc-questionnaire.tsx` | Country import + optional matrix |

### Not Modified

- Engine code (`lib/ircc/`) — no changes
- API routes — no changes
- Database schema — no changes
- Types — no changes

---

## Implementation Order

1. **Country normalisation** (lowest risk, highest client impact)
2. **Field provenance visibility** (staff clarity, no logic changes)
3. **Background matrix** (highest UX improvement, requires new component)
