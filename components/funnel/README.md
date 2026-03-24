# IRCC Forms Funnel — Architecture & Form Library

## Overview

The Split-Pane Funnel renders IRCC immigration forms in a two-column workspace:
- **Left pane**: `IntakePanel` — accordion-based questionnaire with section progress
- **Right pane**: `LivePdfPreview` — real-time PDF preview synced to intake data

Data flows from the IntakePanel through `useStreamForms` into the LivePdfPreview. When the user edits a field, the React form state is flattened into a JSON payload and sent to the Python XFA sidecar (`worker/services/xfa_filler.py`) for PDF generation.

## Form Library (8 forms, 376 fields)

| # | Form Code | Form Name | Fields | Sections | Array Maps | Domain |
|---|-----------|-----------|--------|----------|------------|--------|
| 1 | IMM5257E | Application for Temporary Resident Visa | 130 | 13 | 0 | personal, passport, marital, contact, visit, background, education, employment |
| 2 | IMM5406 | Additional Family Information | 26 | 7 | 2 | personal, family (mother, father, children, siblings) |
| 3 | IMM5476E | Use of a Representative | 13 | 2 | 0 | personal, contact (applicant section only) |
| 4 | IMM5257B | Schedule 1 (Background/Declaration) | 18 | 7 | 5 | personal, background (military, ill treatment, organizations, government, travel) |
| 5 | IMM5562E | Supplementary Travel Document | 9 | 5 | 3 | personal, travel_doc (sections A, B, C) |
| 6 | IMM1294E | Application for Study Permit | 68 | 11 | 2 | personal, passport, marital, contact, language, **study_program**, education, employment, background |
| 7 | IMM5645E | Family Information | 36 | 7 | 2 | personal, marital, family (mother, father, dependent/non-accompanying children) |
| 8 | IMM5710E | Change Conditions / Extend Stay / Work Permit | 76 | 12 | 1 | personal, passport, marital, contact, language, **sponsor/employer**, **work_permit**, education, employment, background |

## Profile Domains (13 total)

| Domain | Description | Forms Using It |
|--------|-------------|----------------|
| `personal.*` | Name, DOB, sex, citizenship, residence, aliases | All 8 |
| `passport.*` | Passport number, country, issue/expiry dates | IMM5257E, IMM1294E, IMM5710E |
| `marital.*` | Marital status, spouse details, previous marriages | IMM5257E, IMM5406, IMM1294E, IMM5645E, IMM5710E |
| `contact_info.*` | Mailing/residential address, phone, email | IMM5257E, IMM1294E, IMM5710E |
| `language.*` | Native language, English/French ability | IMM5257E, IMM1294E, IMM5710E |
| `background.*` | Medical, criminal, military, political declarations | IMM5257E, IMM5257B, IMM1294E, IMM5710E |
| `family.*` | Mother, father, children, siblings | IMM5406, IMM5645E |
| `education.*` | Highest level, post-secondary history | IMM5257E, IMM1294E, IMM5710E |
| `employment.*` | Current occupation, employment history | IMM5257E, IMM1294E, IMM5645E, IMM5710E |
| `study_program.*` | Institution, DLI, program, tuition, financial support | IMM1294E only |
| `travel_doc.*` | Travel history sections A, B, C | IMM5562E only |
| `sponsor.*` | Employer/sponsor name, address, job, LMIA, income | IMM5710E only |
| `work_permit.*` | Entry details, purpose, document numbers | IMM5710E only |

**Fill-Once Rule**: 9 of 13 domains are shared across 2+ forms. When a client fills IMM5257E, every subsequent form auto-populates shared fields via cross-form reuse.

## Flattening Logic (React State -> Python Sidecar)

The pipeline converts React form state to XFA-filled PDFs in 4 stages:

### Stage 1: Answer Storage (React -> DB)

```
User edits field in IntakePanel
  -> onChange fires on FieldInput component
  -> onBlur triggers saveAnswers() via useSaveAnswers hook
  -> Writes to matter_form_instances.answers JSONB as:
     {
       "[field_id]": {
         "value": "Khansa",
         "source": "client_portal",  // or staff_entry, cross_matter_import, etc.
         "verified": false,
         "stale": false,
         "updated_at": "2026-03-23T..."
       }
     }
```

### Stage 2: Resolution (DB -> XFA Field Map)

```
resolveForGeneration(instanceId, formId, supabase)
  1. Load instance answers from matter_form_instances.answers
  2. Load form fields from ircc_form_fields (profile_path, xfa_path, field_type, date_split, value_format)
  3. For each mapped field:
     a. Look up answer by profile_path
     b. Apply transformations:
        - Boolean: value_format.boolean_true/false (e.g., true -> "1", false -> "2")
        - Date split: extract year/month/day from YYYY-MM-DD
        - Max length: truncate to field.max_length
     c. Map to xfa_path
  4. Resolve array fields via ircc_form_array_maps:
     - profile_path -> xfa_base_path + entry_name[index] + sub_field
  5. Return: { resolvedFields: Record<xfa_path, string>, readinessCheck, ... }
```

### Stage 3: XFA Fill (JSON -> PDF)

```
fill_pdf(template_bytes, field_data)  # Python sidecar
  field_data = {
    "rootElement": "form1",        // XFA root (form1, IMM_5406, IMM_5476, Schedule1, etc.)
    "scalarFields": {              // xfa_path -> string value
      "Page1.PersonalDetails.FamilyName": "Ayyaz",
      "Page1.PersonalDetails.DOBYear": "1992",
      ...
    },
    "arrayData": [                 // repeater sections
      {
        "basePath": "SectionB.SectionBinfo",
        "entryName": "Child",
        "entries": [
          { "PaddedEntry.PersonalData[0].Row.FamilyName": "Khan", ... }
        ]
      }
    ]
  }

  Process:
    1. pikepdf reads XFA datasets XML stream from template PDF
    2. lxml navigates to rootElement in the XML tree
    3. For each scalar field: set_xfa_value(root, path_segments, value)
    4. For each array entry: create/navigate to entry[index], set sub-fields
    5. Serialize modified XML back into PDF
    6. Return filled PDF bytes
```

### Stage 4: Output

```
Filled PDF bytes -> stored as artifact in Supabase storage
  -> Available for download, print, or bundled "Generate All" package
```

## Key Files

| File | Purpose |
|------|---------|
| `components/funnel/screens/WorkspaceScreen.tsx` | Split-pane layout orchestrator |
| `components/funnel/panels/IntakePanel.tsx` | Left pane: questionnaire + document slots |
| `components/funnel/panels/LivePdfPreview.tsx` | Right pane: real-time PDF preview |
| `components/ircc/workspace/questionnaire-renderer.tsx` | DB-driven form field renderer |
| `components/ircc/workspace/field-input.tsx` | Individual field input with provenance badges |
| `lib/ircc/answer-engine.ts` | Core save/propagation/stale logic |
| `lib/ircc/generation-resolver.ts` | Answer -> XFA field map resolution |
| `lib/ircc/cross-form-reuse.ts` | Fill-Once cross-form propagation |
| `lib/ircc/cross-matter-reuse.ts` | Returning-client data import |
| `worker/services/xfa_filler.py` | Python XFA PDF filler (pikepdf + lxml) |
| `scripts/seed-ircc-forms.ts` | Form definitions seeder (all 8 forms) |

## Database Tables

| Table | Purpose |
|-------|---------|
| `ircc_forms` | Form definitions (code, name, template path, checksum) |
| `ircc_form_sections` | Section definitions per form |
| `ircc_form_fields` | Field definitions (profile_path, xfa_path, type, conditions) |
| `ircc_form_array_maps` | Repeater array mappings (children, siblings, travel history, etc.) |
| `matter_form_instances` | Per-matter form instances with answers JSONB |
| `form_instance_answer_history` | Append-only answer audit trail |
| `reuse_log` | Cross-form and cross-matter reuse event tracking |
