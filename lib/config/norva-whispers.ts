/**
 * Norva Whispers — branded contextual tooltip content dictionary.
 *
 * Each entry has a `title` (headline in the indigo bar) and a `body` (explanation).
 * Whispers explain INTENT, not just definitions — "Zero-Training UX" mandate.
 * Use Canadian English throughout.
 */
export const NORVA_WHISPERS = {
  // ─── Norva Submission Engine (formerly IRCC Packager / Builder) ───────────
  'engine.submission': {
    title: 'Norva Submission Engine',
    body: 'Generates your IRCC forms from validated client data. Every field is pre-filled from the questionnaire — review, approve, and submit without re-typing.',
  },
  'engine.field_clip': {
    title: 'Field-to-Clip',
    body: 'One-click copy for every IRCC portal field. Split your screen 50/50 with the IRCC portal and paste directly — no context switching.',
  },
  'engine.checklist': {
    title: 'Submission Checklist',
    body: 'Track what has been uploaded to the IRCC portal. Check items as you go — status syncs across all team members viewing this matter.',
  },
  'engine.final_package': {
    title: 'Final Package',
    body: 'All approved forms and documents in one submission-ready queue. Download individually or as a batch before uploading to the IRCC portal.',
  },
  'engine.readiness': {
    title: 'Norva Intelligence — Readiness',
    body: 'This score tracks how complete the client\'s IRCC profile is. Missing fields are flagged with exact locations so you can fix gaps before generating forms.',
  },

  // ─── Norva Document Bridge (formerly Document Uploads / Inbox) ───────────
  'bridge.inbox': {
    title: 'Norva Document Bridge',
    body: 'All incoming documents land here for review. Upload, categorise, and slot them into the matter\'s requirements — nothing gets lost between intake and submission.',
  },
  'bridge.slot': {
    title: 'Document Slot',
    body: 'Each slot represents a specific IRCC requirement (passport copy, photos, etc.). When a file is uploaded and verified, the slot turns green.',
  },
  'bridge.verification': {
    title: 'Field Verification',
    body: 'Lawyer sign-off on sensitive data fields (passport, DOB). Once verified, the field is locked to prevent accidental edits — re-verification is required if the value changes.',
  },

  // ─── Norva Intelligence (formerly AI-Drafting / Readiness) ───────────────
  'intelligence.review': {
    title: 'Norva Intelligence — Review',
    body: 'Scans the entire matter for gate blockers, contradictions, and missing data. Fix issues here before advancing to the next stage.',
  },
  'intelligence.contradictions': {
    title: 'Contradiction Detection',
    body: 'Norva Intelligence cross-references dates, addresses, and names across all forms. If the passport says "1990-03-15" but the questionnaire says "1990-03-16", it flags the conflict.',
  },
  'intelligence.gate': {
    title: 'Stage Gate',
    body: 'This stage requires specific conditions before the matter can advance. Norva Intelligence evaluates all gate rules automatically — green means go.',
  },

  // ─── Norva Vault (formerly Security Logs / PII Shield) ──────────────────
  'vault.audit': {
    title: 'Norva Vault — Audit Trail',
    body: 'Every data change is immutably logged. Stage transitions, field edits, and document uploads are recorded with timestamps and actor IDs for Law Society compliance.',
  },
  'vault.encryption': {
    title: 'Norva Vault — Encryption',
    body: 'Sensitive client data (passport numbers, financial records) is encrypted at rest. The Vault ensures PII is never exposed in logs or API responses.',
  },

  // ─── Norva Ledger (formerly Trust Accounting / Ledger) ──────────────────
  'ledger.trust': {
    title: 'Norva Ledger — Trust Account',
    body: 'Law Society-compliant trust accounting. Every deposit and disbursement is immutably recorded. The trust balance must reach zero before a matter can be closed.',
  },
  'ledger.billing': {
    title: 'Norva Ledger — Billing',
    body: 'Track time entries, generate invoices, and manage retainers. Fee templates auto-calculate based on matter type.',
  },
  'ledger.retainer': {
    title: 'Norva Ledger — Retainer',
    body: 'An advance payment held in trust. Drawn down as invoices are generated. Low-balance alerts fire automatically.',
  },

  // ─── Norva Timeline (formerly Activity Log / Presence) ──────────────────
  'timeline.activity': {
    title: 'Norva Timeline',
    body: 'A unified feed of all matter activity — emails, calls, notes, stage changes, and document uploads. Filter by type to find what you need.',
  },
  'timeline.presence': {
    title: 'Active Now',
    body: 'Shows who else is viewing this matter right now. If another lawyer is editing a field, you\'ll see their name and the field will be temporarily locked to prevent conflicts.',
  },
  'timeline.stage_history': {
    title: 'Stage History',
    body: 'Every pipeline transition is logged with who triggered it, when, and which gate conditions were evaluated. Expand any entry to see the full gate snapshot.',
  },

  // ─── Norva Gatekeeper (formerly Lead Import / Ingestion) ────────────────
  'gatekeeper.intake': {
    title: 'Norva Gatekeeper — Intake',
    body: 'New leads are screened through the Gatekeeper before becoming matters. Conflict checks, retainer status, and practice area eligibility are evaluated automatically.',
  },
  'gatekeeper.import': {
    title: 'Norva Gatekeeper — Import',
    body: 'Bulk-import contacts or leads from CSV. The Gatekeeper validates every row, flags duplicates, and routes clean records to the right practice area.',
  },

  // ─── Global / Cross-Cutting ─────────────────────────────────────────────
  'global.cmd_k': {
    title: 'Command Palette (⌘K)',
    body: 'Search across matters, contacts, leads, and tasks instantly. Results are ranked by relevance with prefix matching — start typing and press Enter to jump.',
  },
  'global.cross_tab': {
    title: 'Cross-Tab Sync',
    body: 'Changes made in one browser tab sync instantly to all other open tabs. No refresh needed — Norva keeps every window in lockstep.',
  },
  'global.sentinel': {
    title: 'Sentinel — Tenant Isolation',
    body: 'Every query, every real-time channel, and every API response is scoped to your firm. Data from other tenants is never accessible, even at the database level.',
  },
} as const

export type NorvaWhisperKey = keyof typeof NORVA_WHISPERS
