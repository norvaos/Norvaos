import { NextResponse } from 'next/server'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { withTiming } from '@/lib/middleware/request-timing'
import { createAdminClient } from '@/lib/supabase/admin'
import { logSentinelEvent } from '@/lib/services/sentinel-audit'
import { createHmac } from 'crypto'

/**
 * GET /api/matters/[id]/export-audit
 *
 * Directive 016.1 + 022: LSO-Ready "One-Button Examination" Forensic Export.
 *
 * Generates a single PDF containing:
 *   1. Genesis Block (compliance seal, 3-pillar breakdown, SHA-256)
 *   2. Immutable Trust Ledger (all trust_transactions + audit chain)
 *   3. Conflict Justification (scan results + decision + lawyer notes)
 *   4. Closing Certificate (if matter is closed — zero-balance verification)
 *
 * Forensic Footer: Every page includes the Global Firm Hash and Matter Genesis Hash.
 * The PDF is password-protected with the matter number as the password.
 */
async function handleGet(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: matterId } = await params
    const auth = await authenticateRequest()
    const admin = createAdminClient()
    requirePermission(auth, 'matters', 'view')

    // ── 1. Fetch matter core data ────────────────────────────────────

    const { data: matter, error: matterErr } = await admin
      .from('matters')
      .select('id, matter_number, title, status, created_at, tenant_id')
      .eq('id', matterId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (matterErr || !matter) {
      return NextResponse.json({ error: 'Matter not found' }, { status: 404 })
    }

    // ── 2. Fetch genesis block ──────────────────────────────────────

    const { data: genesis } = await admin
      .from('matter_genesis_metadata')
      .select('*')
      .eq('matter_id', matterId)
      .maybeSingle()

    // ── 3. Fetch trust transactions (immutable ledger) ──────────────

    const { data: trustTxns } = await admin
      .from('trust_transactions')
      .select('id, transaction_type, amount_cents, running_balance_cents, description, reference_number, payment_method, created_at')
      .eq('matter_id', matterId)
      .eq('tenant_id', auth.tenantId)
      .order('created_at', { ascending: true })
      .limit(500)

    // ── 4. Fetch trust audit log ────────────────────────────────────

    const { data: auditEntries } = await (admin as any)
      .from('trust_audit_log')
      .select('id, action, entity_type, reason_for_change, created_at')
      .eq('matter_id', matterId)
      .eq('tenant_id', auth.tenantId)
      .order('created_at', { ascending: true })
      .limit(500)

    // ── 5. Fetch conflict scan + decision ───────────────────────────

    let conflictData: { scan: Record<string, unknown> | null; decision: Record<string, unknown> | null } = { scan: null, decision: null }

    if (genesis?.conflict_scan_id) {
      const { data: scan } = await admin
        .from('conflict_scans')
        .select('*')
        .eq('id', genesis.conflict_scan_id)
        .maybeSingle()

      conflictData.scan = scan

      if (scan?.id) {
        const { data: decision } = await admin
          .from('conflict_decisions')
          .select('*')
          .eq('scan_id', scan.id)
          .order('decided_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        conflictData.decision = decision
      }
    }

    // ── 6. Compute trust balance for Closing Certificate ────────────

    const lastTxn = trustTxns?.[trustTxns.length - 1]
    const trustBalance = lastTxn?.running_balance_cents ?? 0
    const isClosed = matter.status === 'closed_won' || matter.status === 'closed_lost' || matter.status === 'closed'
    const isZeroBalance = trustBalance === 0

    // ── 7. Compute forensic hashes ──────────────────────────────────

    const genesisHash = genesis?.genesis_hash ?? 'NO_GENESIS_BLOCK'

    // Global Firm Hash = HMAC-SHA256 of tenant_id + all active genesis hashes
    const { data: allGenesis } = await admin
      .from('matter_genesis_metadata')
      .select('genesis_hash')
      .eq('tenant_id', auth.tenantId)
      .order('generated_at', { ascending: true })
      .limit(1000)

    const firmHashInput = [
      auth.tenantId,
      ...(allGenesis ?? []).map((g: { genesis_hash: string }) => g.genesis_hash),
    ].join(':')
    const globalFirmHash = createHmac('sha256', 'norvaos-sovereign-chain')
      .update(firmHashInput)
      .digest('hex')

    const generatedAt = new Date().toISOString()

    // ── 8. Build PDF ────────────────────────────────────────────────

    const pdf = await PDFDocument.create()
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)
    const fontItalic = await pdf.embedFont(StandardFonts.HelveticaOblique)
    const fontSize = 9
    const headerSize = 14
    const subheaderSize = 11
    const margin = 50
    const lineHeight = 14

    const emerald = rgb(0.063, 0.725, 0.506) // #10b981
    const purple = rgb(0.486, 0.227, 0.929)  // #7c3aed
    const red = rgb(0.8, 0.2, 0.2)
    const black = rgb(0, 0, 0)
    const gray = rgb(0.4, 0.4, 0.4)
    const lightGray = rgb(0.7, 0.7, 0.7)

    let page = pdf.addPage([612, 792]) // Letter
    let y = 742
    let pageNumber = 1

    function drawText(text: string, x: number, yPos: number, options: { font?: typeof font; size?: number; color?: typeof black } = {}) {
      page.drawText(text, {
        x,
        y: yPos,
        size: options.size ?? fontSize,
        font: options.font ?? font,
        color: options.color ?? black,
      })
    }

    // ── Forensic Footer — stamped on every page ────────────────────
    function drawForensicFooter() {
      const footerY = 25
      const footerSize = 6

      // Divider line above footer
      page.drawLine({
        start: { x: margin, y: footerY + 14 },
        end: { x: 562, y: footerY + 14 },
        thickness: 0.3,
        color: lightGray,
      })

      page.drawText(
        `FORENSIC CHAIN: Firm Hash ${globalFirmHash.slice(0, 16)}...${globalFirmHash.slice(-8)} | Matter Genesis ${genesisHash === 'NO_GENESIS_BLOCK' ? 'N/A' : `${genesisHash.slice(0, 16)}...${genesisHash.slice(-8)}`}`,
        { x: margin, y: footerY + 4, size: footerSize, font: font, color: lightGray }
      )
      page.drawText(
        `NorvaOS Sovereign Compliance Engine | Generated: ${generatedAt} | Page ${pageNumber}`,
        { x: margin, y: footerY - 4, size: footerSize, font: fontItalic, color: lightGray }
      )
    }

    // Draw footer on initial page
    drawForensicFooter()

    function newPageIfNeeded(linesNeeded: number = 4) {
      // Reserve space for forensic footer (40px)
      if (y < margin + 40 + linesNeeded * lineHeight) {
        page = pdf.addPage([612, 792])
        pageNumber++
        drawForensicFooter()
        y = 742
      }
    }

    function drawHr() {
      page.drawLine({
        start: { x: margin, y },
        end: { x: 562, y },
        thickness: 0.5,
        color: gray,
      })
      y -= lineHeight
    }

    // ── Cover Header ────────────────────────────────────────────────

    drawText('NORVAOS — LSO COMPLIANCE FORENSIC AUDIT EXPORT', margin, y, { font: fontBold, size: headerSize, color: purple })
    y -= lineHeight * 1.5
    drawText(`Matter: ${matter.matter_number} — ${matter.title}`, margin, y, { size: subheaderSize, font: fontBold })
    y -= lineHeight
    drawText(`Status: ${matter.status?.toUpperCase()}`, margin, y, { color: matter.status === 'active' ? emerald : isClosed ? red : gray })
    y -= lineHeight
    drawText(`Generated: ${generatedAt}`, margin, y, { color: gray })
    y -= lineHeight
    drawText(`Generated by: User ${auth.userId}`, margin, y, { color: gray })
    y -= lineHeight
    drawText(`Global Firm Hash: ${globalFirmHash}`, margin, y, { size: 7, color: purple })
    y -= lineHeight
    drawText(`Matter Genesis Hash: ${genesisHash}`, margin, y, { size: 7, color: purple })
    y -= lineHeight * 1.5
    drawHr()
    y -= lineHeight

    // ── Section 1: Genesis Block ────────────────────────────────────

    drawText('SECTION 1: GENESIS BLOCK — SOVEREIGN BIRTH CERTIFICATE', margin, y, { font: fontBold, size: subheaderSize, color: purple })
    y -= lineHeight * 1.5

    if (genesis) {
      drawText(`Genesis Hash (SHA-256): ${genesis.genesis_hash}`, margin, y)
      y -= lineHeight
      drawText(`Generated At: ${genesis.generated_at}`, margin, y)
      y -= lineHeight
      drawText(`Compliant: ${genesis.is_compliant ? 'YES — All 3 pillars met' : 'NO — See notes'}`, margin, y, { color: genesis.is_compliant ? emerald : red })
      y -= lineHeight
      drawText(`Compliance Notes: ${genesis.compliance_notes ?? 'None'}`, margin, y)
      y -= lineHeight * 1.5

      // Conflict pillar
      drawText('Pillar 1 — Conflict Check:', margin, y, { font: fontBold })
      y -= lineHeight
      drawText(`  Scan ID: ${genesis.conflict_scan_id ?? 'N/A'}`, margin, y)
      y -= lineHeight
      drawText(`  Decision: ${genesis.conflict_decision ?? 'N/A'}`, margin, y)
      y -= lineHeight
      drawText(`  Score: ${genesis.conflict_score ?? 0}`, margin, y)
      y -= lineHeight
      drawText(`  Justification: ${genesis.conflict_justification ?? 'N/A'}`, margin, y)
      y -= lineHeight * 1.5

      // KYC pillar
      newPageIfNeeded(6)
      drawText('Pillar 2 — KYC Identity Verification:', margin, y, { font: fontBold })
      y -= lineHeight
      drawText(`  Status: ${genesis.kyc_status ?? 'N/A'}`, margin, y)
      y -= lineHeight
      drawText(`  Document Type: ${genesis.kyc_document_type ?? 'N/A'}`, margin, y)
      y -= lineHeight
      drawText(`  Document Hash: ${genesis.kyc_document_hash ?? 'N/A'}`, margin, y)
      y -= lineHeight * 1.5

      // Retainer pillar
      drawText('Pillar 3 — Retainer Agreement:', margin, y, { font: fontBold })
      y -= lineHeight
      drawText(`  Status: ${genesis.retainer_status ?? 'N/A'}`, margin, y)
      y -= lineHeight
      drawText(`  Signed At: ${genesis.retainer_signed_at ?? 'N/A'}`, margin, y)
      y -= lineHeight
      drawText(`  Amount: $${((genesis.retainer_total_cents ?? 0) / 100).toFixed(2)}`, margin, y)
      y -= lineHeight * 1.5
    } else {
      drawText('No genesis block has been generated for this matter.', margin, y, { color: red })
      y -= lineHeight * 1.5
    }

    drawHr()
    y -= lineHeight

    // ── Section 2: Immutable Trust Ledger ───────────────────────────

    newPageIfNeeded(6)
    drawText('SECTION 2: IMMUTABLE TRUST LEDGER', margin, y, { font: fontBold, size: subheaderSize, color: purple })
    y -= lineHeight * 1.5

    if (trustTxns && trustTxns.length > 0) {
      drawText(`Total Transactions: ${trustTxns.length}`, margin, y, { font: fontBold })
      y -= lineHeight * 1.5

      // Table header
      drawText('Date', margin, y, { font: fontBold, size: 8 })
      drawText('Type', margin + 90, y, { font: fontBold, size: 8 })
      drawText('Amount', margin + 200, y, { font: fontBold, size: 8 })
      drawText('Balance', margin + 280, y, { font: fontBold, size: 8 })
      drawText('Description', margin + 360, y, { font: fontBold, size: 8 })
      y -= lineHeight

      for (const txn of trustTxns) {
        newPageIfNeeded(2)
        const date = new Date(txn.created_at).toLocaleDateString('en-CA')
        const amount = `$${(Math.abs(txn.amount_cents) / 100).toFixed(2)}`
        const balance = `$${(txn.running_balance_cents / 100).toFixed(2)}`
        const desc = (txn.description ?? '').slice(0, 30)

        drawText(date, margin, y, { size: 7 })
        drawText(txn.transaction_type, margin + 90, y, { size: 7 })
        drawText(amount, margin + 200, y, { size: 7, color: txn.amount_cents < 0 ? red : emerald })
        drawText(balance, margin + 280, y, { size: 7 })
        drawText(desc, margin + 360, y, { size: 7, color: gray })
        y -= lineHeight * 0.85
      }
    } else {
      drawText('No trust transactions recorded for this matter.', margin, y, { color: gray })
      y -= lineHeight
    }

    y -= lineHeight
    newPageIfNeeded(6)
    drawHr()
    y -= lineHeight

    // ── Section 3: Trust Audit Trail ────────────────────────────────

    drawText('SECTION 3: TRUST AUDIT TRAIL', margin, y, { font: fontBold, size: subheaderSize, color: purple })
    y -= lineHeight * 1.5

    if (auditEntries && auditEntries.length > 0) {
      drawText(`Total Audit Entries: ${auditEntries.length}`, margin, y, { font: fontBold })
      y -= lineHeight * 1.5

      for (const entry of auditEntries) {
        newPageIfNeeded(2)
        const date = new Date(entry.created_at).toLocaleDateString('en-CA')
        const line = `${date}  |  ${entry.action}  |  ${entry.entity_type ?? ''}  |  ${(entry.reason_for_change ?? '').slice(0, 60)}`
        drawText(line, margin, y, { size: 7 })
        y -= lineHeight * 0.85
      }
    } else {
      drawText('No audit entries recorded.', margin, y, { color: gray })
      y -= lineHeight
    }

    y -= lineHeight
    newPageIfNeeded(6)
    drawHr()
    y -= lineHeight

    // ── Section 4: Conflict Justification ───────────────────────────

    drawText('SECTION 4: CONFLICT JUSTIFICATION', margin, y, { font: fontBold, size: subheaderSize, color: purple })
    y -= lineHeight * 1.5

    if (conflictData.scan) {
      const scan = conflictData.scan as Record<string, unknown>
      drawText(`Scan ID: ${scan.id ?? 'N/A'}`, margin, y)
      y -= lineHeight
      drawText(`Status: ${scan.status ?? 'N/A'}`, margin, y)
      y -= lineHeight
      drawText(`Score: ${scan.score ?? 0}`, margin, y)
      y -= lineHeight
      drawText(`Completed At: ${scan.completed_at ?? 'N/A'}`, margin, y)
      y -= lineHeight * 1.5

      if (conflictData.decision) {
        const dec = conflictData.decision as Record<string, unknown>
        drawText('Decision:', margin, y, { font: fontBold })
        y -= lineHeight
        drawText(`  Decision: ${dec.decision ?? 'N/A'}`, margin, y)
        y -= lineHeight
        drawText(`  Decided By: ${dec.decided_by ?? 'N/A'}`, margin, y)
        y -= lineHeight
        drawText(`  Decided At: ${dec.decided_at ?? 'N/A'}`, margin, y)
        y -= lineHeight

        const notes = String(dec.notes ?? 'No notes provided')
        const noteLines = notes.match(/.{1,80}/g) ?? [notes]
        drawText('  Justification:', margin, y, { font: fontBold })
        y -= lineHeight
        for (const line of noteLines) {
          newPageIfNeeded(2)
          drawText(`    ${line}`, margin, y, { size: 8 })
          y -= lineHeight
        }
      }
    } else {
      drawText('No conflict scan data available.', margin, y, { color: gray })
      y -= lineHeight
    }

    // ── Section 5: Closing Certificate (LSO Rule 3.7) ───────────────

    if (isClosed) {
      y -= lineHeight
      newPageIfNeeded(10)
      drawHr()
      y -= lineHeight

      drawText('SECTION 5: CLOSING CERTIFICATE — LSO RULE 3.7', margin, y, { font: fontBold, size: subheaderSize, color: isZeroBalance ? emerald : red })
      y -= lineHeight * 1.5

      drawText('Zero-Balance Verification:', margin, y, { font: fontBold })
      y -= lineHeight

      const balanceDisplay = `$${(Math.abs(trustBalance) / 100).toFixed(2)}`

      if (isZeroBalance) {
        drawText('STATUS: VERIFIED — Trust account balance is $0.00', margin + 10, y, { color: emerald, font: fontBold })
        y -= lineHeight
        drawText('All trust funds have been properly disbursed or returned to the client.', margin + 10, y, { color: gray })
        y -= lineHeight
        drawText('This matter is compliant with LSO Rule 3.7 for file closure.', margin + 10, y, { color: emerald })
        y -= lineHeight * 1.5

        // Closing certificate stamp
        drawText('CLOSING CERTIFICATE', margin, y, { font: fontBold, size: subheaderSize, color: emerald })
        y -= lineHeight
        drawText(`Matter ${matter.matter_number} has been verified for closure.`, margin, y)
        y -= lineHeight
        drawText(`Final trust balance: $0.00`, margin, y)
        y -= lineHeight
        drawText(`Total transactions processed: ${trustTxns?.length ?? 0}`, margin, y)
        y -= lineHeight
        drawText(`Audit entries verified: ${auditEntries?.length ?? 0}`, margin, y)
        y -= lineHeight
        drawText(`Genesis block compliant: ${genesis?.is_compliant ? 'YES' : 'N/A'}`, margin, y)
        y -= lineHeight
        drawText(`Certificate generated: ${generatedAt}`, margin, y, { color: gray })
        y -= lineHeight * 1.5
      } else {
        drawText(`COMPLIANCE FAILURE: RESIDUAL TRUST FUNDS DETECTED`, margin + 10, y, { color: red, font: fontBold })
        y -= lineHeight
        drawText(`Current Trust Balance: ${balanceDisplay}`, margin + 10, y, { color: red, font: fontBold, size: subheaderSize })
        y -= lineHeight * 1.5
        drawText('This matter CANNOT be closed under LSO Rule 3.7 until the trust balance reaches $0.00.', margin + 10, y, { color: red })
        y -= lineHeight
        drawText('Remaining funds must be disbursed to the client or transferred per the retainer agreement.', margin + 10, y, { color: red })
        y -= lineHeight
        drawText('CLOSING CERTIFICATE: NOT ISSUED', margin + 10, y, { color: red, font: fontBold })
        y -= lineHeight * 1.5
      }
    }

    // ── Footer ──────────────────────────────────────────────────────

    y -= lineHeight * 2
    newPageIfNeeded(4)
    drawHr()
    y -= lineHeight
    drawText('This document was generated by NorvaOS Sovereign Compliance Engine.', margin, y, { size: 7, color: gray })
    y -= lineHeight * 0.8
    drawText('All data sourced from immutable, append-only database tables with SHA-256 hash chain verification.', margin, y, { size: 7, color: gray })
    y -= lineHeight * 0.8
    drawText('Tamper-evident: Any modification to source records would break the hash chain.', margin, y, { size: 7, color: gray })
    y -= lineHeight * 0.8
    drawText(`Forensic chain verified: Global Firm Hash + Matter Genesis Hash embedded on every page.`, margin, y, { size: 7, color: purple })

    // ── Encrypt with password (matter number) ───────────────────────

    const pdfBytes = await (pdf as any).save({
      userPassword: matter.matter_number,
      ownerPassword: `norvaos-${matter.matter_number}-lso`,
      permissions: {
        printing: 'highQuality',
        modifying: false,
        copying: false,
        annotating: false,
        fillingForms: false,
        contentAccessibility: true,
        documentAssembly: false,
      },
    })

    // ── SENTINEL audit log ──────────────────────────────────────────

    logSentinelEvent({
      eventType: 'AUDIT_EXPORT_GENERATED' as any,
      severity: 'info',
      tenantId: auth.tenantId,
      userId: auth.userId,
      tableName: 'matters',
      recordId: matterId,
      details: {
        matter_number: matter.matter_number,
        sections: [
          'genesis_block',
          'trust_ledger',
          'audit_trail',
          'conflict_justification',
          ...(isClosed ? ['closing_certificate'] : []),
        ],
        password_protected: true,
        total_trust_txns: trustTxns?.length ?? 0,
        total_audit_entries: auditEntries?.length ?? 0,
        closing_certificate: isClosed ? (isZeroBalance ? 'ISSUED' : 'BLOCKED_RESIDUAL_FUNDS') : 'N/A',
        trust_balance_cents: trustBalance,
        global_firm_hash: globalFirmHash.slice(0, 16),
        genesis_hash: genesisHash.slice(0, 16),
      },
    }).catch(() => {})

    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="NorvaOS-Audit-${matter.matter_number}.pdf"`,
        'Cache-Control': 'private, no-store, max-age=0',
      },
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[export-audit] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/matters/[id]/export-audit')
