# Enforcement Waivers

> **Any change to this file requires CODEOWNERS approval.**
> See `CODEOWNERS` for the approval group.

This file records waivers for enforcement-sensitive surface changes
that intentionally do not include test updates.

**Waiver format is machine-parsable JSON.** CI extracts the JSON array
between the `ACTIVE_WAIVERS_BEGIN` and `ACTIVE_WAIVERS_END` markers
and validates every entry programmatically.

### CI validation rules

| Field | Requirement |
|-------|-------------|
| `id` | Non-empty string, unique across all waivers |
| `files` | Non-empty array; every entry must match a file in the PR diff |
| `reason` | Non-empty string explaining why no enforcement impact |
| `reviewer` | Non-empty string (must be a CODEOWNERS member) |
| `created_at` | ISO date (YYYY-MM-DD), must be a valid date |
| `expires_at` | ISO date, not in the past, at most 14 days after `created_at` |

A waiver only covers files explicitly listed in its `files` array.
Every touched sensitive file must be covered by a valid waiver.

---

## Active Waivers

<!-- ACTIVE_WAIVERS_BEGIN -->
```json
[]
```
<!-- ACTIVE_WAIVERS_END -->

---

## Template

Copy this into the JSON array above to add a new waiver:

```json
{
  "id": "WAIVER-2026-03-01-001",
  "files": ["path/to/file.ts", "path/to/file2.tsx"],
  "reason": "Specific justification for why no enforcement impact",
  "reviewer": "@github-handle (must be in CODEOWNERS @lexcrm/enforcement-reviewers)",
  "created_at": "2026-03-01",
  "expires_at": "2026-03-14"
}
```

---

## Expired Waivers

_None._
