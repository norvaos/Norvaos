import { NextResponse } from 'next/server'
import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from 'pdf-lib'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * GET /api/matters/[id]/document-bundle
 *
 * Generates a combined PDF of all uploaded documents for a matter:
 * - Cover page with client name, matter name, number, and date
 * - Table of contents with page numbers
 * - Separator pages between document types (slot names)
 * - For multi-version slots, latest version first followed by older versions
 * - Documents ordered by slot sort_order (the order of slot buttons)
 */
async function handleGet(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: matterId } = await params
    const auth = await authenticateRequest()
    requirePermission(auth, 'documents', 'view')

    // 1. Fetch matter details
    const { data: matter, error: matterErr } = await auth.supabase
      .from('matters')
      .select('id, title, matter_number, tenant_id')
      .eq('id', matterId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (matterErr || !matter) {
      return NextResponse.json({ error: 'Matter not found' }, { status: 404 })
    }

    // Fetch primary contact name via matter_contacts
    let clientName = 'Client'
    const { data: primaryMc } = await auth.supabase
      .from('matter_contacts')
      .select('contact_id')
      .eq('matter_id', matterId)
      .limit(1)
      .maybeSingle()

    if (primaryMc?.contact_id) {
      const { data: contact } = await auth.supabase
        .from('contacts')
        .select('first_name, last_name, organization_name')
        .eq('id', primaryMc.contact_id)
        .single()

      if (contact) {
        clientName =
          [contact.first_name, contact.last_name].filter(Boolean).join(' ') ||
          contact.organization_name ||
          'Client'
      }
    }

    // 2. Fetch document slots with versions (ordered by sort_order)
    const { data: slots } = await auth.supabase
      .from('document_slots')
      .select('id, slot_name, category, sort_order, current_document_id, current_version')
      .eq('matter_id', matterId)
      .eq('is_active', true)
      .order('sort_order')
      .order('slot_name')

    if (!slots || slots.length === 0) {
      return NextResponse.json({ error: 'No document slots found for this matter' }, { status: 404 })
    }

    // 3. Fetch all versions for all slots
    const slotIds = slots.map((s) => s.id)
    const { data: allVersions } = await auth.supabase
      .from('document_versions')
      .select('id, slot_id, version_number, storage_path, file_name, file_type, review_status')
      .in('slot_id', slotIds)
      .order('version_number', { ascending: false })

    // Group versions by slot
    const versionsBySlot = new Map<
      string,
      Array<{
        id: string
        slot_id: string
        version_number: number
        storage_path: string
        file_name: string
        file_type: string | null
        review_status: string
      }>
    >()
    for (const v of allVersions ?? []) {
      const arr = versionsBySlot.get(v.slot_id) ?? []
      arr.push(v)
      versionsBySlot.set(v.slot_id, arr)
    }

    // Filter to slots that have at least one version
    const slotsWithDocs = slots.filter(
      (s) => (versionsBySlot.get(s.id)?.length ?? 0) > 0,
    )

    if (slotsWithDocs.length === 0) {
      return NextResponse.json({ error: 'No documents have been uploaded yet' }, { status: 404 })
    }

    // 4. Build the combined PDF
    const combined = await PDFDocument.create()
    const font = await combined.embedFont(StandardFonts.Helvetica)
    const fontBold = await combined.embedFont(StandardFonts.HelveticaBold)

    const PAGE_W = 595
    const PAGE_H = 842

    // Track TOC entries: { title, pageNumber }
    const tocEntries: Array<{ title: string; pageNumber: number; isVersion?: boolean }> = []

    // Reserve 1 page for cover, we'll add TOC pages at the end and reorder
    // First build all content pages, then prepend cover + TOC

    // -- Cover page placeholder (will be first page)
    const coverPage = combined.addPage([PAGE_W, PAGE_H])
    drawCoverPage(coverPage, fontBold, font, {
      clientName,
      matterTitle: matter.title ?? 'Untitled Matter',
      matterNumber: matter.matter_number ?? '',
      date: new Date().toLocaleDateString('en-CA', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    })

    // We'll track starting page (0-indexed, cover is page 0)
    let currentPage = 1

    // Use admin client for storage downloads (bypasses RLS on storage)
    const adminClient = createAdminClient()

    // 5. Process each slot
    for (const slot of slotsWithDocs) {
      const versions = versionsBySlot.get(slot.id) ?? []

      // -- Separator page for this document type
      const separatorPage = combined.addPage([PAGE_W, PAGE_H])
      currentPage++
      drawSeparatorPage(separatorPage, fontBold, font, slot.slot_name)

      // -- Add each version (latest first)
      for (const version of versions) {
        const label = versions.length > 1
          ? `${slot.slot_name} — v${version.version_number}`
          : slot.slot_name

        tocEntries.push({
          title: label,
          pageNumber: currentPage + 1, // next page after separator
          isVersion: versions.length > 1 && version !== versions[0],
        })

        try {
          const { data: fileBlob, error: dlErr } = await adminClient.storage
            .from('documents')
            .download(version.storage_path)

          if (dlErr || !fileBlob) {
            // Add error placeholder page
            const errPage = combined.addPage([PAGE_W, PAGE_H])
            currentPage++
            errPage.drawText(`Could not load: ${version.file_name}`, {
              x: 50,
              y: PAGE_H / 2,
              size: 14,
              font,
              color: rgb(0.6, 0.2, 0.2),
            })
            continue
          }

          const bytes = new Uint8Array(await fileBlob.arrayBuffer())
          const fileType = version.file_type ?? ''

          if (fileType === 'application/pdf') {
            try {
              const sourcePdf = await PDFDocument.load(bytes, { ignoreEncryption: true })
              const pageIndices = sourcePdf.getPageIndices()
              const copiedPages = await combined.copyPages(sourcePdf, pageIndices)
              for (const cp of copiedPages) {
                combined.addPage(cp)
                currentPage++
              }
            } catch {
              // Corrupted PDF — add placeholder
              const errPage = combined.addPage([PAGE_W, PAGE_H])
              currentPage++
              errPage.drawText(`PDF could not be read: ${version.file_name}`, {
                x: 50,
                y: PAGE_H / 2,
                size: 14,
                font,
                color: rgb(0.6, 0.2, 0.2),
              })
            }
          } else if (fileType.startsWith('image/')) {
            try {
              const image = fileType === 'image/png'
                ? await combined.embedPng(bytes)
                : await combined.embedJpg(bytes)

              const scale = Math.min(
                (PAGE_W - 80) / image.width,
                (PAGE_H - 80) / image.height,
                1,
              )
              const w = image.width * scale
              const h = image.height * scale

              const imgPage = combined.addPage([PAGE_W, PAGE_H])
              currentPage++
              imgPage.drawImage(image, {
                x: (PAGE_W - w) / 2,
                y: (PAGE_H - h) / 2,
                width: w,
                height: h,
              })
            } catch {
              const errPage = combined.addPage([PAGE_W, PAGE_H])
              currentPage++
              errPage.drawText(`Image could not be embedded: ${version.file_name}`, {
                x: 50,
                y: PAGE_H / 2,
                size: 14,
                font,
                color: rgb(0.6, 0.2, 0.2),
              })
            }
          } else {
            // Unsupported file type placeholder
            const skipPage = combined.addPage([PAGE_W, PAGE_H])
            currentPage++
            skipPage.drawText(`File type not supported for preview: ${version.file_name}`, {
              x: 50,
              y: PAGE_H / 2,
              size: 14,
              font,
              color: rgb(0.5, 0.5, 0.5),
            })
          }
        } catch {
          const errPage = combined.addPage([PAGE_W, PAGE_H])
          currentPage++
          errPage.drawText(`Error processing: ${version.file_name}`, {
            x: 50,
            y: PAGE_H / 2,
            size: 14,
            font,
            color: rgb(0.6, 0.2, 0.2),
          })
        }
      }
    }

    // 6. Build TOC page(s) and insert after cover
    const tocPages = buildTocPages(combined, fontBold, font, tocEntries, PAGE_W, PAGE_H)

    // Move TOC pages to position 1 (right after cover)
    // Pages are currently at the end, we need to re-index
    const allPages = combined.getPages()
    const totalPages = allPages.length
    const tocStartIdx = totalPages - tocPages.length

    // Remove TOC pages from end and re-insert at index 1
    for (let i = 0; i < tocPages.length; i++) {
      combined.removePage(tocStartIdx)
    }
    for (let i = tocPages.length - 1; i >= 0; i--) {
      combined.insertPage(1, tocPages[i])
    }

    // 7. Save and return
    const pdfBytes = await combined.save()

    const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
    // Bundle version = sum of all current document versions across slots
    // When any document gets a new revision, this number increments
    const bundleVersion = slotsWithDocs.reduce((sum, s) => sum + (s.current_version ?? 1), 0)
    const fileName = `${matter.matter_number ?? 'matter'}-bundle-${today}-v${bundleVersion}.pdf`

    return new NextResponse(pdfBytes as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': String(pdfBytes.length),
      },
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('Document bundle error:', error)
    return NextResponse.json({ error: 'Failed to generate document bundle' }, { status: 500 })
  }
}

// ─── PDF Drawing Helpers ───────────────────────────────────────────────────

function drawCoverPage(
  page: PDFPage,
  fontBold: PDFFont,
  font: PDFFont,
  info: { clientName: string; matterTitle: string; matterNumber: string; date: string },
) {
  const { width, height } = page.getSize()
  const cx = width / 2

  // Title
  page.drawText('Document Review Bundle', {
    x: cx - fontBold.widthOfTextAtSize('Document Review Bundle', 24) / 2,
    y: height - 200,
    size: 24,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  })

  // Horizontal rule
  page.drawLine({
    start: { x: 100, y: height - 230 },
    end: { x: width - 100, y: height - 230 },
    thickness: 1,
    color: rgb(0.7, 0.7, 0.7),
  })

  // Client name
  const clientLabel = `Client: ${info.clientName}`
  page.drawText(clientLabel, {
    x: cx - font.widthOfTextAtSize(clientLabel, 16) / 2,
    y: height - 280,
    size: 16,
    font,
    color: rgb(0.2, 0.2, 0.2),
  })

  // Matter title
  const titleTrunc = info.matterTitle.length > 60
    ? info.matterTitle.slice(0, 57) + '...'
    : info.matterTitle
  page.drawText(titleTrunc, {
    x: cx - fontBold.widthOfTextAtSize(titleTrunc, 18) / 2,
    y: height - 320,
    size: 18,
    font: fontBold,
    color: rgb(0.15, 0.15, 0.15),
  })

  // Matter number
  if (info.matterNumber) {
    const numLabel = `Matter #${info.matterNumber}`
    page.drawText(numLabel, {
      x: cx - font.widthOfTextAtSize(numLabel, 14) / 2,
      y: height - 350,
      size: 14,
      font,
      color: rgb(0.4, 0.4, 0.4),
    })
  }

  // Date
  page.drawText(info.date, {
    x: cx - font.widthOfTextAtSize(info.date, 12) / 2,
    y: height - 400,
    size: 12,
    font,
    color: rgb(0.5, 0.5, 0.5),
  })

  // Footer
  const footer = 'Generated by NorvaOS'
  page.drawText(footer, {
    x: cx - font.widthOfTextAtSize(footer, 10) / 2,
    y: 40,
    size: 10,
    font,
    color: rgb(0.6, 0.6, 0.6),
  })
}

function drawSeparatorPage(
  page: PDFPage,
  fontBold: PDFFont,
  font: PDFFont,
  slotName: string,
) {
  const { width, height } = page.getSize()
  const cx = width / 2

  // Background tint (light gray rectangle)
  page.drawRectangle({
    x: 0,
    y: 0,
    width,
    height,
    color: rgb(0.96, 0.96, 0.96),
  })

  // Document type name (centered, large)
  page.drawText(slotName, {
    x: cx - fontBold.widthOfTextAtSize(slotName, 28) / 2,
    y: height / 2 + 10,
    size: 28,
    font: fontBold,
    color: rgb(0.2, 0.2, 0.2),
  })

  // Horizontal rule below
  const textWidth = fontBold.widthOfTextAtSize(slotName, 28)
  const ruleHalf = Math.min(textWidth / 2 + 40, width / 2 - 60)
  page.drawLine({
    start: { x: cx - ruleHalf, y: height / 2 - 10 },
    end: { x: cx + ruleHalf, y: height / 2 - 10 },
    thickness: 1,
    color: rgb(0.7, 0.7, 0.7),
  })

  // Subtitle
  const subtitle = 'Document Section'
  page.drawText(subtitle, {
    x: cx - font.widthOfTextAtSize(subtitle, 12) / 2,
    y: height / 2 - 35,
    size: 12,
    font,
    color: rgb(0.5, 0.5, 0.5),
  })
}

function buildTocPages(
  doc: PDFDocument,
  fontBold: PDFFont,
  font: PDFFont,
  entries: Array<{ title: string; pageNumber: number; isVersion?: boolean }>,
  pageW: number,
  pageH: number,
): PDFPage[] {
  const pages: PDFPage[] = []
  const lineHeight = 22
  const margin = 60
  const headerHeight = 80
  const maxLinesPerPage = Math.floor((pageH - margin - headerHeight) / lineHeight)

  // Adjust page numbers to account for TOC pages being inserted
  const tocPageCount = Math.max(1, Math.ceil(entries.length / maxLinesPerPage))

  let lineIdx = 0
  let pageIdx = 0

  while (lineIdx < entries.length) {
    const page = doc.addPage([pageW, pageH])
    pages.push(page)

    // Title (first TOC page only)
    if (pageIdx === 0) {
      page.drawText('Table of Contents', {
        x: margin,
        y: pageH - margin,
        size: 20,
        font: fontBold,
        color: rgb(0.1, 0.1, 0.1),
      })
    }

    let y = pageH - margin - (pageIdx === 0 ? 50 : 20)

    const linesThisPage = Math.min(maxLinesPerPage, entries.length - lineIdx)
    for (let i = 0; i < linesThisPage; i++) {
      const entry = entries[lineIdx + i]
      const adjustedPage = entry.pageNumber + tocPageCount
      const titleText = entry.isVersion ? `    ${entry.title}` : entry.title
      const pageText = `${adjustedPage}`

      const titleFont = entry.isVersion ? font : fontBold
      const titleSize = entry.isVersion ? 10 : 11

      page.drawText(titleText, {
        x: margin,
        y,
        size: titleSize,
        font: titleFont,
        color: rgb(0.2, 0.2, 0.2),
      })

      // Page number (right-aligned)
      page.drawText(pageText, {
        x: pageW - margin - font.widthOfTextAtSize(pageText, 10),
        y,
        size: 10,
        font,
        color: rgb(0.5, 0.5, 0.5),
      })

      // Dotted leader
      const dotsX1 = margin + titleFont.widthOfTextAtSize(titleText, titleSize) + 8
      const dotsX2 = pageW - margin - font.widthOfTextAtSize(pageText, 10) - 8
      if (dotsX2 > dotsX1) {
        const dotCount = Math.floor((dotsX2 - dotsX1) / 4)
        const dots = '.'.repeat(dotCount)
        page.drawText(dots, {
          x: dotsX1,
          y,
          size: 8,
          font,
          color: rgb(0.75, 0.75, 0.75),
        })
      }

      y -= lineHeight
    }

    lineIdx += linesThisPage
    pageIdx++
  }

  return pages
}

export const GET = withTiming(handleGet, 'GET /api/matters/[id]/document-bundle')
