'use client'

/**
 * ── DEV ONLY: Ghost Review Dry Run ──────────────────────────────────────────
 * Temporary test page for verifying the 50/50 split on a 14-inch laptop screen.
 * DELETE THIS FILE after the dry run is complete.
 */

import { useState } from 'react'
import {
  GhostReviewOverlay,
  useGhostReview,
  type GhostReviewSource,
  type GhostReviewFormPage,
  type GhostReviewField,
} from '@/components/ircc/ghost-review-overlay'
import { Button } from '@/components/ui/button'

// ── Mock Data ────────────────────────────────────────────────────────────────

// Placeholder images (coloured SVG data URIs to simulate real documents)
const MOCK_PASSPORT_SRC = `data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="560" viewBox="0 0 800 560">
  <rect width="800" height="560" rx="12" fill="#1a2744"/>
  <rect x="20" y="20" width="760" height="520" rx="8" fill="#1e3a5f" stroke="#3b6fa0" stroke-width="2"/>
  <text x="400" y="80" text-anchor="middle" fill="#c0d4e8" font-size="28" font-family="sans-serif" font-weight="bold">CANADA</text>
  <text x="400" y="115" text-anchor="middle" fill="#8aa8c8" font-size="16" font-family="sans-serif">PASSPORT · PASSEPORT</text>
  <rect x="50" y="150" width="200" height="260" rx="4" fill="#2a4a6f" stroke="#4a7ab0" stroke-width="1"/>
  <text x="150" y="290" text-anchor="middle" fill="#6090c0" font-size="14" font-family="sans-serif">PHOTO</text>
  <text x="300" y="190" fill="#c0d4e8" font-size="14" font-family="monospace">Surname / Nom</text>
  <text x="300" y="215" fill="#ffffff" font-size="18" font-family="monospace" font-weight="bold">KUMAR</text>
  <text x="300" y="250" fill="#c0d4e8" font-size="14" font-family="monospace">Given Names / Prénoms</text>
  <text x="300" y="275" fill="#ffffff" font-size="18" font-family="monospace" font-weight="bold">ARUN</text>
  <text x="300" y="310" fill="#c0d4e8" font-size="14" font-family="monospace">Date of Birth</text>
  <text x="300" y="335" fill="#ffffff" font-size="16" font-family="monospace">1988-05-12</text>
  <text x="300" y="370" fill="#c0d4e8" font-size="14" font-family="monospace">Passport No.</text>
  <text x="300" y="395" fill="#ffffff" font-size="16" font-family="monospace">GA4829175</text>
  <text x="300" y="430" fill="#c0d4e8" font-size="14" font-family="monospace">Expiry Date</text>
  <text x="300" y="455" fill="#ff8888" font-size="16" font-family="monospace" font-weight="bold">2026-11-30</text>
  <rect x="50" y="480" width="700" height="50" rx="2" fill="#0f1f33"/>
  <text x="60" y="502" fill="#6090c0" font-size="11" font-family="monospace">P&lt;CANKUMAR&lt;&lt;ARUN&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;</text>
  <text x="60" y="522" fill="#6090c0" font-size="11" font-family="monospace">GA48291756CAN8805122M2611307&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;04</text>
</svg>
`)}`

const MOCK_PHOTO_SRC = `data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="420" height="540" viewBox="0 0 420 540">
  <rect width="420" height="540" fill="#e8e8e8"/>
  <rect x="10" y="10" width="400" height="520" fill="#f5f5f5" stroke="#ccc" stroke-width="1"/>
  <circle cx="210" cy="200" r="90" fill="#c8d8e8"/>
  <ellipse cx="210" cy="360" rx="120" ry="80" fill="#c8d8e8"/>
  <text x="210" y="490" text-anchor="middle" fill="#888" font-size="14" font-family="sans-serif">IRCC Photo (35mm × 45mm)</text>
  <text x="210" y="510" text-anchor="middle" fill="#aaa" font-size="11" font-family="sans-serif">420 × 540 px</text>
</svg>
`)}`

const MOCK_FORM_PAGE_SRC = (page: number) => `data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="612" height="792" viewBox="0 0 612 792">
  <rect width="612" height="792" fill="#ffffff"/>
  <rect x="30" y="30" width="552" height="732" fill="#fafafa" stroke="#ddd" stroke-width="1"/>
  <rect x="30" y="30" width="552" height="60" fill="#1a3a5f"/>
  <text x="56" y="68" fill="#ffffff" font-size="18" font-family="sans-serif" font-weight="bold">APPLICATION FOR TEMPORARY RESIDENT VISA (IMM 5257)</text>
  <text x="540" y="68" text-anchor="end" fill="#ffffff99" font-size="12" font-family="sans-serif">Page ${page}</text>

  <text x="56" y="130" fill="#333" font-size="12" font-family="sans-serif" font-weight="bold">1. Full Name</text>
  <rect x="56" y="138" width="400" height="24" rx="2" fill="#e8f5e9" stroke="#4caf50" stroke-width="1"/>
  <text x="64" y="155" fill="#1b5e20" font-size="13" font-family="monospace">KUMAR, Arun</text>

  <text x="56" y="195" fill="#333" font-size="12" font-family="sans-serif" font-weight="bold">2. Date of Birth</text>
  <rect x="56" y="203" width="200" height="24" rx="2" fill="#e8f5e9" stroke="#4caf50" stroke-width="1"/>
  <text x="64" y="220" fill="#1b5e20" font-size="13" font-family="monospace">1988-05-12</text>

  <text x="56" y="260" fill="#333" font-size="12" font-family="sans-serif" font-weight="bold">3. Country of Citizenship</text>
  <rect x="56" y="268" width="300" height="24" rx="2" fill="#e3f2fd" stroke="#2196f3" stroke-width="1"/>
  <text x="64" y="285" fill="#0d47a1" font-size="13" font-family="monospace">India</text>

  <text x="56" y="325" fill="#333" font-size="12" font-family="sans-serif" font-weight="bold">4. Passport Number</text>
  <rect x="56" y="333" width="250" height="24" rx="2" fill="#e3f2fd" stroke="#2196f3" stroke-width="1"/>
  <text x="64" y="350" fill="#0d47a1" font-size="13" font-family="monospace">GA4829175</text>

  <text x="56" y="390" fill="#333" font-size="12" font-family="sans-serif" font-weight="bold">5. Purpose of Visit</text>
  <rect x="56" y="398" width="400" height="24" rx="2" fill="#e8f5e9" stroke="#4caf50" stroke-width="1"/>
  <text x="64" y="415" fill="#1b5e20" font-size="13" font-family="monospace">Tourism / Tourisme</text>

  <text x="56" y="455" fill="#333" font-size="12" font-family="sans-serif" font-weight="bold">6. Intended Length of Stay</text>
  <rect x="56" y="463" width="200" height="24" rx="2" fill="#e8f5e9" stroke="#4caf50" stroke-width="1"/>
  <text x="64" y="480" fill="#1b5e20" font-size="13" font-family="monospace">14 days</text>

  <text x="56" y="520" fill="#333" font-size="12" font-family="sans-serif" font-weight="bold">7. Funds Available (CAD)</text>
  <rect x="56" y="528" width="200" height="24" rx="2" fill="#e8f5e9" stroke="#4caf50" stroke-width="1"/>
  <text x="64" y="545" fill="#1b5e20" font-size="13" font-family="monospace">$8,500.00</text>

  <rect x="56" y="600" width="10" height="10" rx="2" fill="#4caf50"/>
  <text x="74" y="610" fill="#666" font-size="10" font-family="sans-serif">Heritage Data (Verified)</text>
  <rect x="200" y="600" width="10" height="10" rx="2" fill="#2196f3"/>
  <text x="218" y="610" fill="#666" font-size="10" font-family="sans-serif">OCR Scanned</text>

  <text x="306" y="770" text-anchor="middle" fill="#999" font-size="9" font-family="sans-serif">Protected B when completed · IMM 5257 (03-2024) E</text>
</svg>
`)}`

const MOCK_SOURCES: GhostReviewSource[] = [
  {
    label: 'Passport Scan (Bio Page)',
    type: 'image',
    src: MOCK_PASSPORT_SRC,
    category: 'identity',
  },
  {
    label: 'Client Photo (IRCC Spec)',
    type: 'image',
    src: MOCK_PHOTO_SRC,
    category: 'photo',
  },
]

const MOCK_FORM_PAGES: GhostReviewFormPage[] = [
  { page: 1, src: MOCK_FORM_PAGE_SRC(1), formCode: 'IMM5257' },
  { page: 2, src: MOCK_FORM_PAGE_SRC(2), formCode: 'IMM5257' },
  { page: 3, src: MOCK_FORM_PAGE_SRC(3), formCode: 'IMM5257' },
  { page: 4, src: MOCK_FORM_PAGE_SRC(4), formCode: 'IMM5257' },
]

const MOCK_KEY_FIELDS: GhostReviewField[] = [
  { label: 'Full Name', value: 'KUMAR, Arun', fromHeritage: true, profilePath: 'personal.full_name' },
  { label: 'Date of Birth', value: '1988-05-12', fromHeritage: true, profilePath: 'personal.date_of_birth' },
  { label: 'Passport Number', value: 'GA4829175', fromScan: true, profilePath: 'identity.passport_number' },
  { label: 'Passport Expiry', value: '2026-11-30', fromScan: true, profilePath: 'identity.passport_expiry' },
  { label: 'Country of Citizenship', value: 'India', fromHeritage: true, profilePath: 'personal.citizenship' },
  { label: 'Purpose of Visit', value: 'Tourism', profilePath: 'travel.purpose' },
  { label: 'Length of Stay', value: '14 days', profilePath: 'travel.duration' },
  { label: 'Funds Available', value: '$8,500.00 CAD', profilePath: 'financial.funds' },
]

// ── Page Component ───────────────────────────────────────────────────────────

export default function DevGhostReviewPage() {
  const [reviewSeconds, setReviewSeconds] = useState(10)

  const ghostReview = useGhostReview(() => {
    alert('✅ APPROVED — In production this triggers generateFinalPack()')
  })

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Ghost Review — Dry Run</h1>
        <p className="text-sm text-muted-foreground">
          Temporary test page. Verify the 50/50 split on your 14-inch display.
          <br />
          <strong>Delete this file</strong> after testing:{' '}
          <code className="text-xs bg-muted px-1 rounded">app/(dashboard)/dev-ghost-review/page.tsx</code>
        </p>
      </div>

      <div className="rounded-xl border p-4 space-y-4">
        <h2 className="text-sm font-semibold">Test Configuration</h2>

        <div className="flex items-center gap-3">
          <label className="text-sm text-muted-foreground">minReviewSeconds:</label>
          <input
            type="number"
            min={0}
            max={60}
            value={reviewSeconds}
            onChange={(e) => setReviewSeconds(Number(e.target.value))}
            className="w-20 rounded-md border px-2 py-1 text-sm"
          />
          <span className="text-xs text-muted-foreground">
            (Staff training default: 10s)
          </span>
        </div>

        <div className="text-xs text-muted-foreground space-y-1">
          <p>Mock data: <strong>Arun Kumar</strong> — Visitor Visa (TRV) — IMM 5257</p>
          <p>Sources: 2 (passport scan + IRCC photo)</p>
          <p>Form pages: 4 (IMM 5257 pages 1-4)</p>
          <p>Key fields: 8 (5 Heritage, 2 OCR, 1 Manual)</p>
        </div>

        <Button
          size="lg"
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={() => ghostReview.open(MOCK_SOURCES, MOCK_FORM_PAGES, MOCK_KEY_FIELDS)}
        >
          Launch Ghost Review (Dry Run)
        </Button>
      </div>

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-amber-700 dark:text-amber-300 space-y-2">
        <p className="font-semibold">Testing Checklist:</p>
        <ul className="space-y-1 list-disc list-inside">
          <li>50/50 split renders evenly on 14-inch screen</li>
          <li>Left panel: passport scan visible, zoomable, navigable to photo</li>
          <li>Right panel: form pages visible, zoomable, page nav works</li>
          <li>"Key Fields" toggle shows Heritage (emerald) / OCR (blue) provenance</li>
          <li>Approve button locked for {reviewSeconds}s, timer counts down</li>
          <li>Keyboard: ←/→ for form pages, Shift+←/→ for sources, Esc to close</li>
          <li>Reject returns to this page, Approve triggers alert</li>
        </ul>
      </div>

      {/* Ghost Review Overlay */}
      <GhostReviewOverlay
        open={ghostReview.isOpen}
        onClose={ghostReview.close}
        onApprove={ghostReview.approve}
        sources={ghostReview.sources}
        formPages={ghostReview.formPages}
        keyFields={ghostReview.keyFields}
        applicantName="Arun Kumar"
        formCode="IMM5257"
        approving={ghostReview.approving}
        minReviewSeconds={reviewSeconds}
      />
    </div>
  )
}
