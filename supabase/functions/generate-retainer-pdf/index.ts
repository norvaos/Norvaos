// ==========================================================
// Edge Function: generate-retainer-pdf
// TITAN Squad  -  Norva Signature Smart Document Assembler v2
// Branded Retainer with Process Map + Success-Metric Footer
// Budget: < 1.5 seconds
// ==========================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── Norva Signature Design Tokens ───────────────────────────
const NORVA = {
  primary: "#4a2d8a",      // Deep indigo (from globals.css hsl(258 58% 36%))
  primaryLight: "#6b4fb0",
  accent: "#d4a843",       // Warm golden amber (hsl(42 76% 58%))
  accentLight: "#f5e6c4",
  dark: "#1a1035",         // Deep navy
  text: "#2d2640",
  textLight: "#6b6380",
  bg: "#faf9fc",
  bgCard: "#ffffff",
  border: "#e8e3f0",
  success: "#22c55e",
  warning: "#f59e0b",
  danger: "#ef4444",
};

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return new Date().toLocaleDateString("en-CA");
  return new Date(dateStr).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ── Norva Logo (inline SVG) ─────────────────────────────────
const NORVA_LOGO_SVG = `
<svg width="180" height="44" viewBox="0 0 180 44" xmlns="http://www.w3.org/2000/svg">
  <!-- Shield icon -->
  <path d="M22 4 L38 10 L38 22 C38 32 30 38 22 42 C14 38 6 32 6 22 L6 10 Z"
        fill="${NORVA.primary}" stroke="${NORVA.accent}" stroke-width="1.5"/>
  <path d="M22 12 L16 22 L22 32 L28 22 Z" fill="${NORVA.accent}" opacity="0.9"/>
  <circle cx="22" cy="22" r="4" fill="white" opacity="0.95"/>
  <!-- Wordmark -->
  <text x="48" y="20" font-family="Georgia, serif" font-size="20" font-weight="bold" fill="${NORVA.primary}" letter-spacing="3">NORVA</text>
  <text x="48" y="36" font-family="Georgia, serif" font-size="11" fill="${NORVA.textLight}" letter-spacing="5">LEGAL OS</text>
</svg>`;

// ── Process Map (Client Journey) ────────────────────────────
function buildProcessMap(riskLevel: string): string {
  const stages = [
    { label: "Intake", icon: "01", desc: "Initial consultation & conflict check" },
    { label: "Retainer", icon: "02", desc: "Agreement signed & fees confirmed" },
    { label: "Preparation", icon: "03", desc: "Document collection & case building" },
    { label: "Submission", icon: "04", desc: "Filed with governing authority" },
    { label: "Resolution", icon: "05", desc: "Decision received & next steps" },
  ];

  // Current stage is always "Retainer" (stage 2) at document generation
  const currentIdx = 1;

  const stageHtml = stages
    .map((s, i) => {
      const isComplete = i < currentIdx;
      const isCurrent = i === currentIdx;
      const bg = isComplete ? NORVA.success : isCurrent ? NORVA.primary : "#e8e3f0";
      const textColor = isComplete || isCurrent ? "white" : NORVA.textLight;
      const border = isCurrent ? `3px solid ${NORVA.accent}` : "none";

      return `
      <div style="flex:1;text-align:center;">
        <div style="width:36px;height:36px;border-radius:50%;background:${bg};color:${textColor};
                    display:inline-flex;align-items:center;justify-content:center;
                    font-size:12px;font-weight:bold;border:${border};margin-bottom:6px;">
          ${isComplete ? "&#10003;" : s.icon}
        </div>
        <div style="font-size:10px;font-weight:${isCurrent ? "bold" : "normal"};color:${isCurrent ? NORVA.primary : NORVA.textLight};margin-bottom:2px;">
          ${s.label}
        </div>
        <div style="font-size:8px;color:${NORVA.textLight};line-height:1.3;">${s.desc}</div>
      </div>`;
    })
    .join(`<div style="flex:0 0 20px;display:flex;align-items:flex-start;padding-top:16px;">
      <div style="width:20px;height:2px;background:${NORVA.border};"></div>
    </div>`);

  return `
  <div style="background:${NORVA.bg};border:1px solid ${NORVA.border};border-radius:8px;padding:20px 16px 16px;margin:20px 0;">
    <div style="text-align:center;margin-bottom:16px;">
      <span style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:${NORVA.primary};font-weight:bold;">Your Matter Journey</span>
      ${riskLevel === "high" ? `<span style="margin-left:12px;padding:2px 8px;border-radius:4px;background:#fed7d7;color:#9b2c2c;font-size:9px;font-weight:bold;">HIGH COMPLEXITY</span>` : ""}
    </div>
    <div style="display:flex;align-items:flex-start;justify-content:center;gap:0;">
      ${stageHtml}
    </div>
  </div>`;
}

function buildFeeTableRows(feeSchedule: Array<Record<string, unknown>>): string {
  if (!feeSchedule || feeSchedule.length === 0) {
    return `<tr><td colspan="3" style="text-align:center;padding:12px;color:${NORVA.textLight};">No fee items specified</td></tr>`;
  }
  return feeSchedule
    .map(
      (item, i) => `
    <tr style="background:${i % 2 === 0 ? "white" : NORVA.bg};">
      <td style="padding:10px 12px;border-bottom:1px solid ${NORVA.border};font-size:11px;">${item.description || item.name || "Service"}</td>
      <td style="padding:10px 12px;border-bottom:1px solid ${NORVA.border};text-align:center;font-size:10px;color:${NORVA.textLight};">${item.category || item.fee_type || "Professional"}</td>
      <td style="padding:10px 12px;border-bottom:1px solid ${NORVA.border};text-align:right;font-weight:600;font-size:11px;">${
        typeof item.amount_cents === "number"
          ? formatCurrency(item.amount_cents as number)
          : typeof item.amount === "number"
            ? `$${(item.amount as number).toFixed(2)}`
            : "TBD"
      }</td>
    </tr>`
    )
    .join("");
}

function buildClausesHtml(
  clauses: Array<{ title: string; body: string; sort_order: number }>
): string {
  if (!clauses || clauses.length === 0) return "";
  return clauses
    .map(
      (c) => `
    <div style="margin:16px 0;padding:16px;border-left:4px solid ${NORVA.danger};background:#fef2f2;border-radius:0 6px 6px 0;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="${NORVA.danger}" stroke-width="1.5"/><path d="M8 4v5M8 11v1" stroke="${NORVA.danger}" stroke-width="1.5" stroke-linecap="round"/></svg>
        <span style="color:#991b1b;font-size:12px;font-weight:bold;">${c.title}</span>
      </div>
      <p style="margin:0;font-size:11px;line-height:1.7;color:#4a1515;white-space:pre-line;">${c.body}</p>
    </div>`
    )
    .join("");
}

// ── Main Template: Norva Signature Design ───────────────────
function generateRetainerHtml(ctx: Record<string, unknown>): string {
  const matter = ctx.matter as Record<string, unknown>;
  const client = ctx.client as Record<string, unknown>;
  const firm = ctx.firm as Record<string, unknown>;
  const lawyer = ctx.lawyer as Record<string, unknown>;
  const retainer = ctx.retainer as Record<string, unknown>;
  const clauses = ctx.clauses as Array<{ title: string; body: string; sort_order: number }>;
  const hasRiskDisclosure = ctx.has_risk_disclosure as boolean;
  const feeSchedule = (retainer?.fee_schedule || []) as Array<Record<string, unknown>>;
  const riskLevel = (matter?.risk_level as string) || "standard";
  const generatedDate = new Date().toISOString().split("T")[0];

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: letter; margin: 0.75in 0.85in; }
    * { box-sizing: border-box; }
    body { font-family: 'Georgia', 'Times New Roman', serif; font-size: 11px; color: ${NORVA.text}; line-height: 1.7; margin: 0; padding: 0; }

    /* ── Norva Signature Header ── */
    .norva-header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 16px; border-bottom: 2px solid ${NORVA.primary}; margin-bottom: 8px; }
    .norva-header .logo-area { flex: 1; }
    .norva-header .doc-meta { text-align: right; }
    .norva-header .doc-meta .doc-type { font-size: 18px; font-weight: bold; color: ${NORVA.primary}; letter-spacing: 2px; margin-bottom: 4px; }
    .norva-header .doc-meta .doc-ref { font-size: 9px; color: ${NORVA.textLight}; line-height: 1.5; }
    .accent-bar { height: 3px; background: linear-gradient(90deg, ${NORVA.primary}, ${NORVA.accent}, ${NORVA.primary}); margin-bottom: 20px; border-radius: 2px; }

    /* ── Sections ── */
    .section { margin: 18px 0; }
    .section-title { font-size: 11px; color: ${NORVA.primary}; text-transform: uppercase; letter-spacing: 2px; font-weight: bold; margin-bottom: 10px; padding-bottom: 4px; border-bottom: 1px solid ${NORVA.border}; }

    /* ── Parties ── */
    .parties { display: flex; gap: 24px; }
    .party-card { flex: 1; background: ${NORVA.bg}; border: 1px solid ${NORVA.border}; border-radius: 6px; padding: 14px; }
    .party-card .role { font-size: 9px; text-transform: uppercase; letter-spacing: 1.5px; color: ${NORVA.primary}; font-weight: bold; margin-bottom: 6px; }
    .party-card .name { font-size: 13px; font-weight: bold; color: ${NORVA.dark}; margin-bottom: 4px; }
    .party-card .detail { font-size: 10px; color: ${NORVA.textLight}; line-height: 1.5; }

    /* ── Fee Table ── */
    table.fees { width: 100%; border-collapse: collapse; border-radius: 6px; overflow: hidden; border: 1px solid ${NORVA.border}; }
    table.fees th { background: ${NORVA.primary}; color: white; padding: 10px 12px; text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: 1px; }
    table.fees th:last-child { text-align: right; }

    /* ── Totals ── */
    .totals-card { background: ${NORVA.bg}; border: 1px solid ${NORVA.border}; border-radius: 6px; padding: 14px 16px; margin-top: 12px; }
    .totals-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 11px; }
    .totals-row.grand { font-weight: bold; font-size: 14px; color: ${NORVA.primary}; border-top: 2px solid ${NORVA.primary}; padding-top: 10px; margin-top: 8px; }

    /* ── Signature Block ── */
    .sig-grid { display: flex; gap: 48px; margin-top: 40px; }
    .sig-box { flex: 1; }
    .sig-box .sig-line { border-bottom: 1px solid ${NORVA.dark}; height: 48px; }
    .sig-box .sig-label { font-size: 9px; color: ${NORVA.textLight}; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px; }
    .sig-box .sig-name { font-size: 10px; color: ${NORVA.text}; margin-top: 2px; }

    /* ── Norva Footer ── */
    .norva-footer { margin-top: 36px; padding-top: 12px; border-top: 2px solid ${NORVA.primary}; }
    .norva-footer .footer-grid { display: flex; justify-content: space-between; align-items: center; }
    .norva-footer .footer-brand { font-size: 8px; color: ${NORVA.textLight}; line-height: 1.6; }
    .norva-footer .footer-brand .norva-mark { font-weight: bold; color: ${NORVA.primary}; font-size: 8px; }
    .norva-footer .footer-seal { text-align: right; }
    .norva-footer .footer-seal .seal-badge { display: inline-block; padding: 4px 12px; border: 1px solid ${NORVA.accent}; border-radius: 4px; font-size: 8px; color: ${NORVA.primary}; font-weight: bold; letter-spacing: 1px; }
    .norva-footer .confidential { text-align: center; font-size: 7px; color: ${NORVA.textLight}; margin-top: 8px; letter-spacing: 0.5px; }

    /* ── Watermark ── */
    .watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-40deg); font-size: 80px; color: rgba(74,45,138,0.03); font-weight: bold; letter-spacing: 12px; z-index: -1; pointer-events: none; font-family: Georgia, serif; }
  </style>
</head>
<body>
  <div class="watermark">NORVA</div>

  <!-- ═══ NORVA SIGNATURE HEADER ═══ -->
  <div class="norva-header">
    <div class="logo-area">${NORVA_LOGO_SVG}</div>
    <div class="doc-meta">
      <div class="doc-type">RETAINER AGREEMENT</div>
      <div class="doc-ref">
        Matter ${matter?.matter_number || "N/A"}<br>
        ${formatDate(matter?.date_opened as string)}<br>
        ${(firm?.name as string) || "Law Office"}
      </div>
    </div>
  </div>
  <div class="accent-bar"></div>

  <!-- ═══ PROCESS MAP: CLIENT JOURNEY ═══ -->
  ${buildProcessMap(riskLevel)}

  <!-- ═══ PARTIES ═══ -->
  <div class="section">
    <div class="section-title">Parties to This Agreement</div>
    <div class="parties">
      <div class="party-card">
        <div class="role">Client</div>
        <div class="name">${client?.name || "N/A"}</div>
        <div class="detail">
          ${client?.email ? `${client.email}<br>` : ""}
          ${client?.phone ? `${client.phone}<br>` : ""}
          ${client?.address || ""}
        </div>
      </div>
      <div class="party-card">
        <div class="role">Counsel</div>
        <div class="name">${lawyer?.name || "Assigned Counsel"}</div>
        <div class="detail">
          ${lawyer?.email ? `${lawyer.email}<br>` : ""}
          ${(firm?.name as string) || ""}
        </div>
      </div>
    </div>
  </div>

  <!-- ═══ SCOPE OF SERVICES ═══ -->
  <div class="section">
    <div class="section-title">Scope of Services</div>
    <p style="font-size:11px;">
      ${retainer?.scope_of_services || `Legal representation in the matter of &ldquo;${matter?.title || "N/A"}&rdquo; including all necessary preparation, filing, correspondence, and representation related to this matter before the relevant authorities.`}
    </p>
  </div>

  <!-- ═══ FEE SCHEDULE ═══ -->
  <div class="section">
    <div class="section-title">Fee Schedule</div>
    <table class="fees">
      <thead>
        <tr>
          <th>Description</th>
          <th style="text-align:center;">Category</th>
          <th style="text-align:right;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${buildFeeTableRows(feeSchedule)}
      </tbody>
    </table>

    <div class="totals-card">
      <div class="totals-row">
        <span>Subtotal</span>
        <span>${formatCurrency((retainer?.subtotal_cents as number) || 0)}</span>
      </div>
      ${retainer?.hst_applicable ? `
      <div class="totals-row">
        <span>HST (${((retainer?.hst_rate as number) || 0.13) * 100}%)</span>
        <span>${formatCurrency((retainer?.tax_amount_cents as number) || 0)}</span>
      </div>` : ""}
      <div class="totals-row grand">
        <span>Total</span>
        <span>${formatCurrency((retainer?.total_amount_cents as number) || 0)}</span>
      </div>
    </div>
  </div>

  ${hasRiskDisclosure ? `
  <!-- ═══ RISK DISCLOSURES (Dynamic Clauses) ═══ -->
  <div class="section">
    <div class="section-title">Risk Disclosures</div>
    ${buildClausesHtml(clauses)}
  </div>` : ""}

  <!-- ═══ TERMS & CONDITIONS ═══ -->
  <div class="section">
    <div class="section-title">Terms &amp; Conditions</div>
    <ol style="font-size:10px;padding-left:20px;line-height:1.8;">
      <li>The Client retains the Firm to provide legal services as described above.</li>
      <li>Fees are due upon execution of this Agreement unless otherwise arranged in writing.</li>
      <li>The Client may terminate this Agreement at any time with written notice. Fees for services rendered prior to termination remain payable.</li>
      <li>The Firm will maintain client confidentiality in accordance with the Law Society of Ontario rules of professional conduct.</li>
      <li>This Agreement constitutes the entire understanding between the parties regarding the subject matter herein.</li>
      <li>All documents submitted become part of the matter file and are managed through the Norva Document Bridge with full version control.</li>
    </ol>
  </div>

  <!-- ═══ SIGNATURE BLOCK ═══ -->
  <div class="sig-grid">
    <div class="sig-box">
      <div class="sig-line"></div>
      <div class="sig-label">Client Signature</div>
      <div class="sig-name">${client?.name || "Client"}</div>
      <div style="font-size:9px;color:${NORVA.textLight};margin-top:4px;">Date: _______________</div>
    </div>
    <div class="sig-box">
      <div class="sig-line"></div>
      <div class="sig-label">Counsel Signature</div>
      <div class="sig-name">${lawyer?.name || "Counsel"}</div>
      <div style="font-size:9px;color:${NORVA.textLight};margin-top:4px;">Date: _______________</div>
    </div>
  </div>

  <!-- ═══ NORVA SUCCESS-METRIC FOOTER ═══ -->
  <div class="norva-footer">
    <div class="footer-grid">
      <div class="footer-brand">
        Prepared by <span class="norva-mark">Norva OS</span> &mdash; Audit-Optimised for IRCC Integrity<br>
        Document ID: ${matter?.matter_number || ""}-RET &nbsp;&bull;&nbsp; Generated: ${generatedDate}
      </div>
      <div class="footer-seal">
        <div class="seal-badge">NORVA VERIFIED</div>
      </div>
    </div>
    <div class="confidential">
      This document is privileged and confidential. It is intended solely for the named parties.
      Unauthorised distribution is prohibited. &copy; ${new Date().getFullYear()} ${(firm?.name as string) || "Law Office"} &mdash; Powered by NorvaOS
    </div>
  </div>
</body>
</html>`;
}

// ── Main Handler ────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = performance.now();

  try {
    const { matter_id } = await req.json();

    if (!matter_id) {
      return new Response(
        JSON.stringify({ ok: false, message: "matter_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // 1. Assemble context via RPC (< 50ms)
    const { data: ctx, error: ctxError } = await supabase.rpc(
      "rpc_assemble_retainer_context",
      { p_matter_id: matter_id }
    );

    if (ctxError || !ctx?.ok) {
      return new Response(
        JSON.stringify({
          ok: false,
          message: ctxError?.message || ctx?.message || "Failed to assemble context",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Generate Norva Signature HTML (< 5ms)
    const html = generateRetainerHtml(ctx);

    // 3. Store in private matter-documents bucket
    const matterNumber = ctx.matter?.matter_number || "UNKNOWN";
    const storagePath = `${ctx.matter?.id}/retainer/${matterNumber}-Retainer-Agreement.html`;

    const htmlBlob = new Blob([html], { type: "text/html" });

    const { error: uploadError } = await supabase.storage
      .from("matter-documents")
      .upload(storagePath, htmlBlob, {
        contentType: "text/html",
        upsert: true,
      });

    if (uploadError) {
      return new Response(
        JSON.stringify({ ok: false, message: `Upload failed: ${uploadError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Finalize  -  link document to slot via RPC
    const { data: finalResult, error: finalError } = await supabase.rpc(
      "rpc_finalize_retainer_document",
      {
        p_matter_id: matter_id,
        p_storage_path: storagePath,
        p_file_size: htmlBlob.size,
      }
    );

    if (finalError) {
      return new Response(
        JSON.stringify({ ok: false, message: `Finalize failed: ${finalError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const elapsed = Math.round(performance.now() - startTime);

    return new Response(
      JSON.stringify({
        ok: true,
        elapsed_ms: elapsed,
        budget_met: elapsed < 1500,
        document: finalResult,
        context_summary: {
          matter_number: matterNumber,
          client: ctx.client?.name,
          risk_level: ctx.matter?.risk_level,
          clauses_injected: ctx.clauses?.length || 0,
          has_risk_disclosure: ctx.has_risk_disclosure,
          total_amount: formatCurrency(ctx.retainer?.total_amount_cents || 0),
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, message: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
