/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Document Engine  -  Seed Templates
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Seeds default templates for a new tenant.
 * Called during tenant onboarding or via the seed API endpoint.
 *
 * Phase 1 templates:
 *   1. Retainer Agreement (engagement letter)  -  comprehensive Ontario retainer
 *   2. Non-Engagement Letter
 *   3. Disengagement Letter
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import type { TemplateBody } from '@/lib/types/document-engine'
import { createTemplate, createTemplateVersion, publishVersion } from './template-service'

export interface SeedResult {
  seeded: string[]
  skipped: string[]
  errors: string[]
}

export async function seedDefaultTemplates(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  createdBy: string
): Promise<SeedResult> {
  const result: SeedResult = { seeded: [], skipped: [], errors: [] }

  const templates = [
    { key: 'retainer-agreement', name: 'Retainer Agreement', family: 'engagement', body: retainerBody(), practiceArea: 'general' },
    { key: 'non-engagement-letter', name: 'Non-Engagement Letter', family: 'disengagement', body: nonEngagementBody() },
    { key: 'disengagement-letter', name: 'Disengagement Letter', family: 'disengagement', body: disengagementBody() },
  ]

  // Check which templates already exist
  const { data: existing } = await supabase
    .from('docgen_templates')
    .select('id, template_key')
    .eq('tenant_id', tenantId)
    .in('template_key', templates.map(t => t.key))

  const existingMap = new Map((existing ?? []).map((e: any) => [e.template_key, e.id]))

  for (const tmpl of templates) {
    const conditions = tmpl.family === 'engagement' ? seedEngagementConditions() : tmpl.family === 'disengagement' ? seedDisengagementConditions() : []

    // If template already exists, create a new version on it (update flow)
    if (existingMap.has(tmpl.key)) {
      const existingId = existingMap.get(tmpl.key)!

      // Count existing versions to determine next label
      const { count } = await supabase
        .from('docgen_template_versions' as never)
        .select('id', { count: 'exact', head: true } as never)
        .eq('template_id', existingId)

      const nextVersion = `v${(count ?? 0) + 1}`

      const versionResult = await createTemplateVersion(supabase, {
        tenantId,
        templateId: existingId,
        templateBody: tmpl.body,
        versionLabel: nextVersion,
        changeSummary: 'Seed update  -  LawPRO-safe, IRCC fees, payment schedule',
        mappings: seedMappings(tmpl.family) as never,
        conditions,
        clauseAssignments: [],
        createdBy,
      })

      if (versionResult.success && versionResult.data) {
        await publishVersion(supabase, {
          tenantId,
          templateId: existingId,
          versionId: versionResult.data.id,
          publishedBy: createdBy,
        })
        result.seeded.push(`${tmpl.name} (updated ${nextVersion})`)
      } else {
        result.errors.push(`${tmpl.name} update: ${versionResult.error}`)
      }
      continue
    }

    // New template  -  create from scratch
    const templateResult = await createTemplate(supabase, {
      tenantId,
      templateKey: tmpl.key,
      name: tmpl.name,
      documentFamily: tmpl.family,
      practiceArea: tmpl.practiceArea,
      createdBy,
    })

    if (!templateResult.success || !templateResult.data) {
      result.errors.push(`${tmpl.name}: ${templateResult.error}`)
      continue
    }

    const versionResult = await createTemplateVersion(supabase, {
      tenantId,
      templateId: templateResult.data.id,
      templateBody: tmpl.body,
      versionLabel: 'v1',
      changeSummary: 'Default seed template',
      mappings: seedMappings(tmpl.family) as never,
      conditions,
      clauseAssignments: [],
      createdBy,
    })

    if (versionResult.success && versionResult.data) {
      await publishVersion(supabase, {
        tenantId,
        templateId: templateResult.data.id,
        versionId: versionResult.data.id,
        publishedBy: createdBy,
      })
      result.seeded.push(tmpl.name)
    } else {
      result.errors.push(`${tmpl.name} version: ${versionResult.error}`)
    }
  }

  return result
}

// ─── Retainer Agreement (LawPRO-Safe) ────────────────────────────────────────

function retainerBody(): TemplateBody {
  return {
    sections: [
      // 1. Title & Preamble
      {
        id: 'sec-title',
        title: 'RETAINER AGREEMENT',
        title_style: 'heading1',
        condition_key: null,
        order: 0,
        elements: [
          {
            id: 'el-preamble-1',
            type: 'paragraph',
            content: 'This Retainer Agreement ("Agreement") is entered into as of {{current_date}}, by and between:',
            style: 'body',
            order: 0,
          },
          {
            id: 'el-preamble-firm',
            type: 'paragraph',
            content: '{{firm_name}}, with offices located at {{firm_address}} (hereinafter referred to as "the Firm");',
            style: 'body',
            indent_level: 1,
            order: 1,
          },
          {
            id: 'el-preamble-and',
            type: 'paragraph',
            content: 'AND',
            style: 'body',
            order: 2,
          },
          {
            id: 'el-preamble-client',
            type: 'paragraph',
            content: '{{client_name}}, residing at {{client_address}} (hereinafter referred to as "the Client").',
            style: 'body',
            indent_level: 1,
            order: 3,
          },
          {
            id: 'el-preamble-recital',
            type: 'paragraph',
            content: 'WHEREAS the Client wishes to retain the Firm to provide legal services in connection with the matter described below, and the Firm has agreed to provide such services subject to the terms and conditions set out in this Agreement.',
            style: 'body',
            order: 4,
          },
        ],
      },

      // 2. Scope of Legal Services (LawPRO-safe: explicit scope, exclusions, no guarantee)
      {
        id: 'sec-scope',
        title: 'SCOPE OF LEGAL SERVICES',
        title_style: 'heading2',
        numbering: { type: 'decimal', level: 0, start: 1 },
        condition_key: null,
        order: 1,
        elements: [
          {
            id: 'el-scope-1',
            type: 'paragraph',
            content: 'The Firm agrees to provide legal services to the Client in connection with the following matter:',
            style: 'body',
            order: 0,
          },
          {
            id: 'el-scope-matter',
            type: 'paragraph',
            content: '{{matter_title}}',
            style: 'bold',
            indent_level: 1,
            order: 1,
          },
          {
            id: 'el-scope-responsible',
            type: 'paragraph',
            content: 'The lawyer primarily responsible for this matter will be {{lawyer_name}} (LSO #{{lawyer_lso_number}}). Other lawyers, licensed paralegals, or staff at the Firm may also assist on this matter from time to time.',
            style: 'body',
            order: 2,
          },
          {
            id: 'el-scope-limit-1',
            type: 'paragraph',
            content: 'The scope of services is strictly limited to the matter described above. The Firm is not retained to provide legal advice on any other matter, including but not limited to tax, real estate, family law, criminal, civil litigation, or any area of law not expressly described in this Agreement. Any additional legal matters will require a separate written retainer agreement.',
            style: 'body',
            numbering: { type: 'decimal', level: 1 },
            order: 3,
          },
          {
            id: 'el-scope-no-guarantee',
            type: 'paragraph',
            content: 'THE FIRM DOES NOT AND CANNOT GUARANTEE ANY PARTICULAR OUTCOME, RESULT, OR TIMELINE FOR THIS MATTER. The practice of law involves inherent uncertainties. Any expressions of opinion regarding the likely outcome, or estimates of costs or time, are the lawyer\'s professional assessment based on information available at the time and are not promises, warranties, or guarantees. Actual results may differ materially from any such expressions of opinion.',
            style: 'bold',
            numbering: { type: 'decimal', level: 1 },
            order: 4,
          },
          {
            id: 'el-scope-rely',
            type: 'paragraph',
            content: 'The Firm\'s advice and work product will be based on the facts, information, and documents provided by the Client. The Client acknowledges that incomplete, inaccurate, or untimely information may adversely affect the Firm\'s ability to provide effective representation and may impact the outcome of the matter.',
            style: 'body',
            numbering: { type: 'decimal', level: 1 },
            order: 5,
          },
        ],
      },

      // 3. Client Responsibilities (LawPRO-safe: client duties)
      {
        id: 'sec-client-duties',
        title: 'CLIENT RESPONSIBILITIES',
        title_style: 'heading2',
        numbering: { type: 'decimal', level: 0 },
        condition_key: null,
        order: 2,
        elements: [
          {
            id: 'el-duties-intro',
            type: 'paragraph',
            content: 'The Client agrees to:',
            style: 'body',
            order: 0,
          },
          {
            id: 'el-duties-1',
            type: 'paragraph',
            content: 'Provide complete, accurate, and timely information, documents, and instructions as reasonably requested by the Firm;',
            style: 'bullet',
            indent_level: 1,
            order: 1,
          },
          {
            id: 'el-duties-2',
            type: 'paragraph',
            content: 'Respond to communications from the Firm in a timely manner;',
            style: 'bullet',
            indent_level: 1,
            order: 2,
          },
          {
            id: 'el-duties-3',
            type: 'paragraph',
            content: 'Inform the Firm promptly of any change in address, telephone number, email address, or other contact information;',
            style: 'bullet',
            indent_level: 1,
            order: 3,
          },
          {
            id: 'el-duties-4',
            type: 'paragraph',
            content: 'Pay all accounts rendered by the Firm in accordance with the payment terms set out in this Agreement;',
            style: 'bullet',
            indent_level: 1,
            order: 4,
          },
          {
            id: 'el-duties-5',
            type: 'paragraph',
            content: 'Advise the Firm immediately of any deadlines, time-sensitive matters, or upcoming dates of which the Client is aware.',
            style: 'bullet',
            indent_level: 1,
            order: 5,
          },
          {
            id: 'el-duties-warning',
            type: 'paragraph',
            content: 'Failure to cooperate with the Firm or to provide timely information and instructions may result in prejudice to the Client\'s matter, including missed deadlines, and may constitute grounds for the Firm to withdraw from representation.',
            style: 'body',
            order: 6,
          },
        ],
      },

      // 4. Conflict of Interest (LawPRO-safe)
      {
        id: 'sec-conflict',
        title: 'CONFLICT OF INTEREST',
        title_style: 'heading2',
        numbering: { type: 'decimal', level: 0 },
        condition_key: null,
        order: 3,
        elements: [
          {
            id: 'el-conflict-1',
            type: 'paragraph',
            content: 'The Firm has conducted a conflict check and is not aware of any conflict of interest that would prevent the Firm from acting on the Client\'s behalf in this matter. If a conflict of interest is identified at any time during the retainer, the Firm will advise the Client and take appropriate steps in accordance with the Rules of Professional Conduct.',
            style: 'body',
            order: 0,
          },
          {
            id: 'el-conflict-2',
            type: 'paragraph',
            content: 'The Client confirms that the Client has disclosed to the Firm all information known to the Client that may be relevant to a conflict of interest determination.',
            style: 'body',
            order: 1,
          },
        ],
      },

      // 5. Fees  -  Flat Fee (conditional)
      {
        id: 'sec-fees-flat',
        title: 'FEES AND DISBURSEMENTS',
        title_style: 'heading2',
        numbering: { type: 'decimal', level: 0 },
        condition_key: 'is_flat_fee',
        order: 4,
        elements: [
          {
            id: 'el-fees-flat-1',
            type: 'paragraph',
            content: 'The Client agrees to pay the Firm a flat fee for the legal services described in this Agreement, as set out in the fee schedule below. The flat fee covers only the professional services described in Section 1. Any work outside the scope of this retainer will be billed separately under a new retainer agreement.',
            style: 'body',
            order: 0,
          },
          {
            id: 'el-fees-flat-2',
            type: 'paragraph',
            content: 'In addition to professional fees, the Client is responsible for all disbursements and out-of-pocket expenses incurred in connection with this matter, including but not limited to Immigration, Refugees and Citizenship Canada ("IRCC") government processing fees, courier and postage charges, translation and notarization costs, medical examination fees, long-distance telephone charges, photocopying, and travel expenses.',
            style: 'body',
            order: 1,
          },
          {
            id: 'el-fees-flat-table',
            type: 'table',
            columns: ['Description', 'Amount'],
            rows: [
              ['Professional Fees (Legal Services)', '{{professional_fees}}'],
              ['IRCC Government Processing Fees', '{{ircc_fees}}'],
              ['Estimated Disbursements', '{{disbursements}}'],
              ['HST (13%) on Professional Fees', '{{hst_amount}}'],
              ['Total Estimated Cost', '{{total_amount}}'],
            ],
            style: 'bordered',
            order: 2,
          },
          {
            id: 'el-fees-flat-ircc-note',
            type: 'paragraph',
            content: 'Note: IRCC government processing fees are set by Immigration, Refugees and Citizenship Canada and are subject to change without notice. IRCC fees are not subject to HST. The amounts above are based on current IRCC fee schedules. If IRCC fees change before payment is submitted, the Client will be notified and the revised amount will apply.',
            style: 'body',
            order: 3,
          },
          {
            id: 'el-fees-flat-earned',
            type: 'paragraph',
            content: 'The flat fee is deemed earned progressively as work is performed. If this Agreement is terminated before completion, the Firm is entitled to payment for all work completed to the date of termination, calculated on a reasonable basis.',
            style: 'body',
            order: 4,
          },
        ],
      },

      // 5 alt. Fees  -  Hourly (conditional)
      {
        id: 'sec-fees-hourly',
        title: 'FEES AND DISBURSEMENTS',
        title_style: 'heading2',
        numbering: { type: 'decimal', level: 0 },
        condition_key: 'is_hourly',
        order: 4,
        elements: [
          {
            id: 'el-fees-hourly-1',
            type: 'paragraph',
            content: 'The Client agrees to pay the Firm for legal services at an hourly rate of {{hourly_rate}} (plus applicable taxes). Time will be recorded in six-minute increments (0.1 of an hour).',
            style: 'body',
            order: 0,
          },
          {
            id: 'el-fees-hourly-2',
            type: 'paragraph',
            content: 'Billable time includes, but is not limited to: meetings, telephone calls, correspondence (including email), legal research, drafting and reviewing documents, court or tribunal appearances, preparation for hearings, travel time, and file review.',
            style: 'body',
            order: 1,
          },
          {
            id: 'el-fees-hourly-3',
            type: 'paragraph',
            content: 'In addition to professional fees, the Client is responsible for all disbursements and out-of-pocket expenses incurred in connection with this matter, including but not limited to Immigration, Refugees and Citizenship Canada ("IRCC") government processing fees, courier and postage charges, translation and notarization costs, and other third-party costs.',
            style: 'body',
            order: 2,
          },
          {
            id: 'el-fees-hourly-ircc-note',
            type: 'paragraph',
            content: 'Note: IRCC government processing fees are set by Immigration, Refugees and Citizenship Canada and are subject to change without notice. IRCC fees are not subject to HST.',
            style: 'body',
            order: 3,
          },
        ],
      },

      // 6. Payment Schedule (conditional  -  shown when payment plan exists)
      {
        id: 'sec-payment-schedule',
        title: 'PAYMENT SCHEDULE',
        title_style: 'heading2',
        numbering: { type: 'decimal', level: 0 },
        condition_key: 'has_payment_schedule',
        order: 5,
        elements: [
          {
            id: 'el-payment-schedule-intro',
            type: 'paragraph',
            content: 'The Client agrees to make payments in accordance with the following schedule. Each payment is due on or before the date or milestone indicated:',
            style: 'body',
            order: 0,
          },
          {
            id: 'el-payment-schedule-table',
            type: 'table',
            columns: ['Installment', 'Amount', 'Due'],
            rows: [
              ['1st Payment', '{{installment_1_amount}}', '{{installment_1_due}}'],
              ['2nd Payment', '{{installment_2_amount}}', '{{installment_2_due}}'],
              ['3rd Payment', '{{installment_3_amount}}', '{{installment_3_due}}'],
              ['4th Payment', '{{installment_4_amount}}', '{{installment_4_due}}'],
            ],
            style: 'bordered',
            order: 1,
          },
          {
            id: 'el-payment-schedule-note',
            type: 'paragraph',
            content: 'If fewer installments apply, unused rows will be omitted from the final agreement. The Firm reserves the right to suspend work if a scheduled payment is not received by its due date. The Client will be notified in writing before any suspension of services.',
            style: 'body',
            order: 2,
          },
        ],
      },

      // 7. Payment Terms
      {
        id: 'sec-payment',
        title: 'PAYMENT TERMS',
        title_style: 'heading2',
        numbering: { type: 'decimal', level: 0 },
        condition_key: null,
        order: 6,
        elements: [
          {
            id: 'el-payment-1',
            type: 'paragraph',
            content: 'Where no payment schedule is set out above, invoices will be rendered monthly or at the conclusion of the matter, whichever occurs first. Payment is due within thirty (30) days of the date of each invoice.',
            style: 'body',
            order: 0,
          },
          {
            id: 'el-payment-2',
            type: 'paragraph',
            content: 'Interest at a rate of 2.0% per month (26.82% per annum) will be charged on all accounts that remain unpaid after thirty (30) days from the date of the invoice.',
            style: 'body',
            order: 1,
          },
          {
            id: 'el-payment-3',
            type: 'paragraph',
            content: 'The Firm reserves the right to cease work on the Client\'s matter if any account remains unpaid for more than sixty (60) days, subject to reasonable notice and the applicable Rules of Professional Conduct of the Law Society of Ontario.',
            style: 'body',
            order: 2,
          },
          {
            id: 'el-payment-4',
            type: 'paragraph',
            content: 'All fees quoted are exclusive of Harmonized Sales Tax ("HST") unless otherwise stated. HST at the applicable rate will be added to professional fees and applicable disbursements. IRCC government processing fees are not subject to HST.',
            style: 'body',
            order: 3,
          },
        ],
      },

      // 8. Trust Retainer (conditional)
      {
        id: 'sec-trust',
        title: 'TRUST RETAINER',
        title_style: 'heading2',
        numbering: { type: 'decimal', level: 0 },
        condition_key: 'has_trust_retainer',
        order: 7,
        elements: [
          {
            id: 'el-trust-1',
            type: 'paragraph',
            content: 'The Client agrees to pay a trust retainer in the amount of {{trust_amount}} upon execution of this Agreement. This retainer will be deposited into the Firm\'s trust account and held in accordance with the Law Society of Ontario\'s By-Laws and Rules of Professional Conduct.',
            style: 'body',
            order: 0,
          },
          {
            id: 'el-trust-2',
            type: 'paragraph',
            content: 'Funds held in trust will be applied against the Firm\'s invoices as they are rendered. The Client will receive a trust statement with each invoice showing the trust balance. No work will commence until the trust retainer has been received.',
            style: 'body',
            order: 1,
          },
          {
            id: 'el-trust-3',
            type: 'paragraph',
            content: 'The Firm may request a replenishment of the trust retainer from time to time as funds are applied to invoices. Any unused trust funds will be returned to the Client at the conclusion of the matter, less any outstanding amounts owed to the Firm.',
            style: 'body',
            order: 2,
          },
        ],
      },

      // 9. Confidentiality & Privilege
      {
        id: 'sec-confidentiality',
        title: 'CONFIDENTIALITY AND SOLICITOR-CLIENT PRIVILEGE',
        title_style: 'heading2',
        numbering: { type: 'decimal', level: 0 },
        condition_key: null,
        order: 8,
        elements: [
          {
            id: 'el-conf-1',
            type: 'paragraph',
            content: 'All communications between the Client and the Firm are protected by solicitor-client privilege and will be treated as strictly confidential, subject to applicable legal obligations.',
            style: 'body',
            order: 0,
          },
          {
            id: 'el-conf-2',
            type: 'paragraph',
            content: 'The Firm will maintain the confidentiality of all information received from the Client in connection with this matter, except where disclosure is required by law, authorized by the Client, or necessary for the proper conduct of the matter.',
            style: 'body',
            order: 1,
          },
        ],
      },

      // 10. Communication
      {
        id: 'sec-communication',
        title: 'COMMUNICATION',
        title_style: 'heading2',
        numbering: { type: 'decimal', level: 0 },
        condition_key: null,
        order: 9,
        elements: [
          {
            id: 'el-comm-1',
            type: 'paragraph',
            content: 'The Client may contact the Firm by telephone at {{firm_phone}} or by email at {{lawyer_email}}. The Firm will endeavour to respond to all client communications within two (2) business days.',
            style: 'body',
            order: 0,
          },
          {
            id: 'el-comm-2',
            type: 'paragraph',
            content: 'The Client acknowledges that email and other electronic communication may not be secure and consents to the Firm communicating with the Client by email at {{client_email}} regarding this matter. The Client accepts the risks inherent in electronic communication, including the risk of interception or unauthorized access.',
            style: 'body',
            order: 1,
          },
          {
            id: 'el-comm-3',
            type: 'paragraph',
            content: 'The Client understands that the Firm may use secure online portals, cloud-based document systems, and electronic filing platforms in connection with this matter.',
            style: 'body',
            order: 2,
          },
        ],
      },

      // 11. Termination & Withdrawal (LawPRO-safe)
      {
        id: 'sec-termination',
        title: 'TERMINATION AND WITHDRAWAL',
        title_style: 'heading2',
        numbering: { type: 'decimal', level: 0 },
        condition_key: null,
        order: 10,
        elements: [
          {
            id: 'el-term-1',
            type: 'paragraph',
            content: 'The Client may terminate this Agreement at any time by providing written notice to the Firm. The Client will be responsible for all fees and disbursements incurred up to the date of termination, including any IRCC government fees already submitted on the Client\'s behalf.',
            style: 'body',
            order: 0,
          },
          {
            id: 'el-term-2',
            type: 'paragraph',
            content: 'The Firm may withdraw from representation in accordance with the Rules of Professional Conduct of the Law Society of Ontario, including but not limited to situations where: the Client fails to provide instructions; the Client fails to pay accounts or comply with the payment schedule; the solicitor-client relationship has broken down; a conflict of interest arises; or the Client has misled or failed to disclose material information to the Firm.',
            style: 'body',
            order: 1,
          },
          {
            id: 'el-term-3',
            type: 'paragraph',
            content: 'Upon termination or withdrawal, the Firm will provide reasonable notice, assist with the orderly transfer of the file to a successor lawyer if requested, and return all documents and property to which the Client is entitled, subject to the Firm\'s right to retain copies and to exercise a solicitor\'s lien for unpaid fees and disbursements.',
            style: 'body',
            order: 2,
          },
          {
            id: 'el-term-4',
            type: 'paragraph',
            content: 'THE CLIENT UNDERSTANDS THAT IF THE CLIENT TERMINATES THIS AGREEMENT OR IF THE FIRM WITHDRAWS FROM REPRESENTATION, THE CLIENT REMAINS RESPONSIBLE FOR ANY PENDING DEADLINES, FILINGS, OR PROCEEDINGS. THE CLIENT SHOULD RETAIN NEW COUNSEL IMMEDIATELY TO PROTECT THE CLIENT\'S INTERESTS.',
            style: 'bold',
            order: 3,
          },
        ],
      },

      // 12. Limitation Periods
      {
        id: 'sec-limitation',
        title: 'IMPORTANT NOTICE REGARDING LIMITATION PERIODS AND DEADLINES',
        title_style: 'heading2',
        numbering: { type: 'decimal', level: 0 },
        condition_key: null,
        order: 11,
        elements: [
          {
            id: 'el-limit-1',
            type: 'paragraph',
            content: 'THE CLIENT IS ADVISED THAT THERE ARE STRICT TIME LIMITS FOR COMMENCING LEGAL PROCEEDINGS AND FOR FILING APPLICATIONS WITH GOVERNMENT AGENCIES, INCLUDING IMMIGRATION, REFUGEES AND CITIZENSHIP CANADA (IRCC). FAILURE TO TAKE REQUIRED STEPS WITHIN THE APPLICABLE LIMITATION PERIOD OR DEADLINE MAY RESULT IN THE PERMANENT LOSS OF LEGAL RIGHTS, INCLUDING THE RIGHT TO APPEAL OR TO FILE AN APPLICATION.',
            style: 'bold',
            order: 0,
          },
          {
            id: 'el-limit-2',
            type: 'paragraph',
            content: 'The Client must consult with the Firm immediately if the Client becomes aware of any deadline or time-sensitive matter. The Client acknowledges that the Firm cannot be responsible for deadlines of which it has not been informed.',
            style: 'body',
            order: 1,
          },
        ],
      },

      // 13. File Retention
      {
        id: 'sec-file-retention',
        title: 'FILE STORAGE AND DESTRUCTION',
        title_style: 'heading2',
        numbering: { type: 'decimal', level: 0 },
        condition_key: null,
        order: 12,
        elements: [
          {
            id: 'el-retention-1',
            type: 'paragraph',
            content: 'Upon completion of this matter, the Firm will maintain the Client\'s file in storage for a period as required by the Law Society of Ontario\'s guidelines. After the retention period, the Firm may destroy the file without further notice to the Client. Original documents will be returned to the Client at the conclusion of the matter unless other arrangements are made.',
            style: 'body',
            order: 0,
          },
        ],
      },

      // 14. General Provisions
      {
        id: 'sec-general',
        title: 'GENERAL PROVISIONS',
        title_style: 'heading2',
        numbering: { type: 'decimal', level: 0 },
        condition_key: null,
        order: 13,
        elements: [
          {
            id: 'el-gen-1',
            type: 'paragraph',
            content: 'This Agreement constitutes the entire agreement between the parties with respect to the subject matter hereof and supersedes all prior negotiations, representations, warranties, commitments, offers, and agreements, whether written or oral.',
            style: 'body',
            numbering: { type: 'decimal', level: 1 },
            order: 0,
          },
          {
            id: 'el-gen-2',
            type: 'paragraph',
            content: 'This Agreement shall be governed by and construed in accordance with the laws of the Province of Ontario and the laws of Canada applicable therein.',
            style: 'body',
            numbering: { type: 'decimal', level: 1 },
            order: 1,
          },
          {
            id: 'el-gen-3',
            type: 'paragraph',
            content: 'If any provision of this Agreement is found to be invalid or unenforceable, the remaining provisions shall continue in full force and effect.',
            style: 'body',
            numbering: { type: 'decimal', level: 1 },
            order: 2,
          },
          {
            id: 'el-gen-4',
            type: 'paragraph',
            content: 'This Agreement may not be amended or modified except by written agreement signed by both parties.',
            style: 'body',
            numbering: { type: 'decimal', level: 1 },
            order: 3,
          },
          {
            id: 'el-gen-5',
            type: 'paragraph',
            content: 'The Firm is required to be insured against professional liability claims through the Lawyers\' Professional Indemnity Company (LawPRO). Information about LawPRO coverage is available at lawpro.ca.',
            style: 'body',
            numbering: { type: 'decimal', level: 1 },
            order: 4,
          },
        ],
      },

      // 15. Acknowledgement (LawPRO-safe: comprehensive)
      {
        id: 'sec-acknowledgement',
        title: 'ACKNOWLEDGEMENT',
        title_style: 'heading2',
        condition_key: null,
        order: 14,
        elements: [
          {
            id: 'el-ack-1',
            type: 'paragraph',
            content: 'By signing below, the Client acknowledges and agrees that:',
            style: 'body',
            order: 0,
          },
          {
            id: 'el-ack-bullet-1',
            type: 'paragraph',
            content: 'The Client has read this Agreement in its entirety and understands its terms and conditions;',
            style: 'bullet',
            indent_level: 1,
            order: 1,
          },
          {
            id: 'el-ack-bullet-2',
            type: 'paragraph',
            content: 'The Client has had an opportunity to ask questions about this Agreement and receive satisfactory answers;',
            style: 'bullet',
            indent_level: 1,
            order: 2,
          },
          {
            id: 'el-ack-bullet-3',
            type: 'paragraph',
            content: 'The Client has been advised of the right to obtain independent legal advice regarding this Agreement;',
            style: 'bullet',
            indent_level: 1,
            order: 3,
          },
          {
            id: 'el-ack-bullet-4',
            type: 'paragraph',
            content: 'The Firm has not guaranteed any particular outcome or result;',
            style: 'bullet',
            indent_level: 1,
            order: 4,
          },
          {
            id: 'el-ack-bullet-5',
            type: 'paragraph',
            content: 'The Client understands the scope of services and the limitations described in this Agreement;',
            style: 'bullet',
            indent_level: 1,
            order: 5,
          },
          {
            id: 'el-ack-bullet-6',
            type: 'paragraph',
            content: 'The Client understands the fee structure, payment obligations, and that IRCC government fees are separate from the Firm\'s professional fees;',
            style: 'bullet',
            indent_level: 1,
            order: 6,
          },
          {
            id: 'el-ack-bullet-7',
            type: 'paragraph',
            content: 'The Client voluntarily enters into this Agreement.',
            style: 'bullet',
            indent_level: 1,
            order: 7,
          },
        ],
      },

      // 16. Signature Block
      {
        id: 'sec-signature',
        title: '',
        condition_key: null,
        order: 99,
        elements: [
          {
            id: 'el-sig-intro',
            type: 'paragraph',
            content: 'IN WITNESS WHEREOF, the parties have executed this Agreement as of the date first written above.',
            style: 'body',
            order: 0,
          },
          {
            id: 'el-sig',
            type: 'signature_block',
            signers: [
              { role: 'client', label: 'Client', include_date_line: true },
              { role: 'lawyer', label: 'Lawyer', include_date_line: true, include_lso_number: true },
            ],
            layout: 'side_by_side',
            order: 1,
          },
        ],
      },
    ],
    header: {
      content: '{{firm_name}}',
      show_logo: true,
      alignment: 'center',
    },
    footer: {
      content: '{{firm_name}} | {{firm_address}} | {{firm_phone}}',
      show_page_numbers: true,
      page_number_format: 'Page {PAGE} of {NUMPAGES}',
    },
    metadata: {
      page_size: 'letter',
      margins: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
      font_family: 'Times New Roman',
      font_size: 24,
      line_spacing: 276,
    },
  }
}

// ─── Non-Engagement Letter ───────────────────────────────────────────────────

function nonEngagementBody(): TemplateBody {
  return {
    sections: [
      // ── Letter Header ──────────────────────────────────────────────
      {
        id: 'ne-header',
        title: '',
        condition_key: null,
        order: 0,
        elements: [
          { id: 'ne-date', type: 'paragraph', content: '{{current_date}}', style: 'body', order: 0 },
          { id: 'ne-delivery', type: 'paragraph', content: 'SENT VIA EMAIL AND REGULAR MAIL', style: 'bold', order: 1 },
          { id: 'ne-addr', type: 'paragraph', content: '{{client_name}}\n{{client_address}}', style: 'body', order: 2 },
          { id: 'ne-re', type: 'paragraph', content: 'Re: {{matter_title}}  -  Non-Engagement', style: 'bold', order: 3 },
        ],
      },
      // ── Salutation & Decline ───────────────────────────────────────
      {
        id: 'ne-decline',
        title: '',
        condition_key: null,
        order: 1,
        elements: [
          { id: 'ne-dear', type: 'paragraph', content: 'Dear {{client_name}},', style: 'body', order: 0 },
          { id: 'ne-decline-1', type: 'paragraph', content: 'Thank you for consulting with {{firm_name}} regarding the above-noted matter. After careful consideration, we regret to inform you that our firm will not be able to accept a retainer or represent you in this matter.', style: 'body', order: 1 },
        ],
      },
      // ── No Solicitor-Client Relationship ───────────────────────────
      {
        id: 'ne-no-relationship',
        title: 'NO SOLICITOR-CLIENT RELATIONSHIP',
        title_style: 'heading2',
        condition_key: null,
        order: 2,
        elements: [
          { id: 'ne-rel-1', type: 'paragraph', content: 'Please be advised that no solicitor-client relationship has been created between you and {{firm_name}} as a result of the initial consultation. We have not undertaken any legal work on your behalf, and we do not owe you any ongoing duty in connection with this matter.', style: 'body', order: 0 },
          { id: 'ne-rel-2', type: 'paragraph', content: 'Any information you shared during the consultation has been received on a preliminary and confidential basis only. We will not retain your documents or information, nor will we open a file in respect of your matter.', style: 'body', order: 1 },
        ],
      },
      // ── No Legal Opinion ───────────────────────────────────────────
      {
        id: 'ne-no-opinion',
        title: 'NO LEGAL OPINION',
        title_style: 'heading2',
        condition_key: null,
        order: 3,
        elements: [
          { id: 'ne-opin-1', type: 'paragraph', content: 'Nothing stated during our consultation, whether verbally or in writing, should be construed as legal advice or a legal opinion on the merits of your matter. Any comments made were preliminary in nature and were based on the limited information available at the time. You should not rely on anything discussed in the consultation as a substitute for independent legal advice.', style: 'body', order: 0 },
        ],
      },
      // ── Limitation Periods (CRITICAL for LawPRO) ──────────────────
      {
        id: 'ne-limitations',
        title: 'IMPORTANT  -  LIMITATION PERIODS',
        title_style: 'heading2',
        condition_key: null,
        order: 4,
        elements: [
          { id: 'ne-lim-1', type: 'paragraph', content: 'We wish to bring to your attention that your legal rights may be subject to strict time limitations. Under the Limitations Act, 2002 (Ontario), the basic limitation period for most claims is two (2) years from the date on which the claim was discovered or ought to have been discovered. Other limitation periods may apply depending on the nature of your matter, including but not limited to:', style: 'body', order: 0 },
          { id: 'ne-lim-bullet-1', type: 'paragraph', content: 'Immigration matters  -  applications, appeals, and judicial review deadlines set by the Immigration and Refugee Protection Act (IRPA) and IRCC processing timelines;', style: 'bullet', order: 1 },
          { id: 'ne-lim-bullet-2', type: 'paragraph', content: 'Family law matters  -  deadlines for claims under the Family Law Act, Divorce Act, or Children\'s Law Reform Act;', style: 'bullet', order: 2 },
          { id: 'ne-lim-bullet-3', type: 'paragraph', content: 'Claims against government entities  -  shorter notice and limitation periods may apply under the Crown Liability and Proceedings Act, 2019;', style: 'bullet', order: 3 },
          { id: 'ne-lim-bullet-4', type: 'paragraph', content: 'Appeals  -  court-imposed deadlines for filing Notices of Appeal or motions for leave to appeal.', style: 'bullet', order: 4 },
          { id: 'ne-lim-2', type: 'paragraph', content: 'FAILURE TO ACT WITHIN THE APPLICABLE LIMITATION PERIOD MAY RESULT IN THE PERMANENT LOSS OF YOUR LEGAL RIGHTS, regardless of the merits of your claim. We strongly urge you to consult with another lawyer without delay to protect your interests.', style: 'bold', order: 5 },
        ],
      },
      // ── Recommendation to Seek Counsel ─────────────────────────────
      {
        id: 'ne-seek-counsel',
        title: 'RECOMMENDATION',
        title_style: 'heading2',
        condition_key: null,
        order: 5,
        elements: [
          { id: 'ne-seek-1', type: 'paragraph', content: 'We strongly recommend that you immediately seek the advice of another qualified lawyer to discuss your legal options and protect your rights. If you do not know another lawyer, you may wish to contact:', style: 'body', order: 0 },
          { id: 'ne-seek-bullet-1', type: 'paragraph', content: 'The Law Society of Ontario Lawyer Referral Service at 1-855-947-5255 or through lsrs.info;', style: 'bullet', order: 1 },
          { id: 'ne-seek-bullet-2', type: 'paragraph', content: 'Legal Aid Ontario at 1-800-668-8258 if you believe you may qualify for legal aid;', style: 'bullet', order: 2 },
          { id: 'ne-seek-bullet-3', type: 'paragraph', content: 'The Ontario Bar Association or your local county law association.', style: 'bullet', order: 3 },
        ],
      },
      // ── Return of Materials ────────────────────────────────────────
      {
        id: 'ne-materials',
        title: 'RETURN OF MATERIALS',
        title_style: 'heading2',
        condition_key: null,
        order: 6,
        elements: [
          { id: 'ne-mat-1', type: 'paragraph', content: 'If you provided any original documents during the consultation, they will be returned to you under separate cover. If you wish to retrieve them in person, please contact our office to arrange a time.', style: 'body', order: 0 },
          { id: 'ne-mat-2', type: 'paragraph', content: 'Any copies of documents or notes from the consultation will be destroyed in accordance with our privacy policy.', style: 'body', order: 1 },
        ],
      },
      // ── Closing ────────────────────────────────────────────────────
      {
        id: 'ne-closing',
        title: '',
        condition_key: null,
        order: 7,
        elements: [
          { id: 'ne-close-1', type: 'paragraph', content: 'We regret that we are unable to be of further assistance in this matter. We wish you the best in resolving your legal affairs.', style: 'body', order: 0 },
          { id: 'ne-close-2', type: 'paragraph', content: 'Please retain this letter for your records.', style: 'body', order: 1 },
          { id: 'ne-close-3', type: 'paragraph', content: 'Yours truly,', style: 'body', order: 2 },
        ],
      },
      // ── Signature ──────────────────────────────────────────────────
      {
        id: 'ne-sig',
        title: '',
        condition_key: null,
        order: 8,
        elements: [
          {
            id: 'ne-sig-block',
            type: 'signature_block',
            signers: [
              { role: 'lawyer', label: '{{lawyer_name}}\n{{firm_name}}\nLSO #: {{lawyer_lso_number}}', include_date_line: false, include_lso_number: false },
            ],
            layout: 'stacked',
            order: 0,
          },
        ],
      },
      // ── Enclosure / CC ─────────────────────────────────────────────
      {
        id: 'ne-enc',
        title: '',
        condition_key: null,
        order: 9,
        elements: [
          { id: 'ne-enc-1', type: 'paragraph', content: 'Encl. Original documents (if any)\nc.c. File', style: 'body', order: 0 },
        ],
      },
    ],
    header: {
      content: '{{firm_name}}',
      show_logo: true,
      alignment: 'center',
    },
    footer: {
      content: '{{firm_name}} | {{firm_address}} | {{firm_phone}}',
      show_page_numbers: false,
    },
    metadata: {
      page_size: 'letter',
      margins: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
      font_family: 'Times New Roman',
      font_size: 24,
      line_spacing: 276,
    },
  }
}

// ─── Disengagement Letter ────────────────────────────────────────────────────

function disengagementBody(): TemplateBody {
  return {
    sections: [
      // ── Letter Header ──────────────────────────────────────────────
      {
        id: 'de-header',
        title: '',
        condition_key: null,
        order: 0,
        elements: [
          { id: 'de-date', type: 'paragraph', content: '{{current_date}}', style: 'body', order: 0 },
          { id: 'de-delivery', type: 'paragraph', content: 'SENT VIA EMAIL AND REGULAR MAIL', style: 'bold', order: 1 },
          { id: 'de-addr', type: 'paragraph', content: '{{client_name}}\n{{client_address}}', style: 'body', order: 2 },
          { id: 'de-re', type: 'paragraph', content: 'Re: {{matter_title}}  -  Termination of Retainer and Closing of File', style: 'bold', order: 3 },
        ],
      },
      // ── Confirmation of Termination ────────────────────────────────
      {
        id: 'de-termination',
        title: '',
        condition_key: null,
        order: 1,
        elements: [
          { id: 'de-dear', type: 'paragraph', content: 'Dear {{client_name}},', style: 'body', order: 0 },
          { id: 'de-term-1', type: 'paragraph', content: 'This letter confirms that {{firm_name}} is concluding its representation of you in the above-noted matter, effective as of the date of this letter. As of this date, our firm no longer acts as your solicitors of record and we owe no further duty to you in connection with this matter.', style: 'body', order: 1 },
          { id: 'de-term-2', type: 'paragraph', content: 'If there are any court proceedings, tribunal hearings, government filings, or regulatory deadlines pending in your matter, you must immediately retain another lawyer or take the necessary steps yourself to protect your legal rights. Our firm will not be monitoring any deadlines or taking any further steps on your behalf after the date of this letter.', style: 'body', order: 2 },
        ],
      },
      // ── Outstanding Accounts ───────────────────────────────────────
      {
        id: 'de-accounts',
        title: 'OUTSTANDING ACCOUNTS',
        title_style: 'heading2',
        condition_key: null,
        order: 2,
        elements: [
          { id: 'de-acc-1', type: 'paragraph', content: 'Please note that all outstanding invoices and disbursements remain due and payable notwithstanding the termination of our retainer. Our firm reserves the right to exercise a solicitor\'s lien over your file materials until all accounts are paid in full, in accordance with the Solicitors Act (Ontario).', style: 'body', order: 0 },
          { id: 'de-acc-2', type: 'paragraph', content: 'If you have any questions about outstanding accounts, please contact our office at {{firm_phone}}.', style: 'body', order: 1 },
        ],
      },
      // ── Trust Account (conditional) ────────────────────────────────
      {
        id: 'de-trust',
        title: 'TRUST ACCOUNT',
        title_style: 'heading2',
        condition_key: 'has_trust_balance',
        order: 3,
        elements: [
          { id: 'de-trust-1', type: 'paragraph', content: 'As of the date of this letter, there is a remaining balance of {{trust_balance}} held in our trust account on your behalf. A final trust statement will be provided to you under separate cover, and any funds owing to you will be returned by cheque or electronic transfer, net of any outstanding fees and disbursements, in accordance with Law Society of Ontario By-Law 9 (Financial Transactions and Records).', style: 'body', order: 0 },
        ],
      },
      // ── Limitation Periods ─────────────────────────────────────────
      {
        id: 'de-limitations',
        title: 'IMPORTANT  -  LIMITATION PERIODS',
        title_style: 'heading2',
        condition_key: null,
        order: 4,
        elements: [
          { id: 'de-lim-1', type: 'paragraph', content: 'We wish to remind you that your legal rights may be subject to strict time limitations. Under the Limitations Act, 2002 (Ontario), the basic limitation period for most civil claims is two (2) years. Other limitation periods may apply depending on the nature of your matter, including:', style: 'body', order: 0 },
          { id: 'de-lim-b1', type: 'paragraph', content: 'Immigration matters  -  strict deadlines for appeals, judicial review applications, and status restoration under IRPA;', style: 'bullet', order: 1 },
          { id: 'de-lim-b2', type: 'paragraph', content: 'Family law matters  -  time-limited claims for equalization, support variations, and custody orders;', style: 'bullet', order: 2 },
          { id: 'de-lim-b3', type: 'paragraph', content: 'Court-imposed deadlines  -  filing deadlines, hearing dates, and appeal periods that may be currently running.', style: 'bullet', order: 3 },
          { id: 'de-lim-2', type: 'paragraph', content: 'FAILURE TO ACT WITHIN THE APPLICABLE LIMITATION PERIOD MAY RESULT IN THE PERMANENT LOSS OF YOUR LEGAL RIGHTS. It is your responsibility to ensure that all deadlines are identified and met by you or your new legal counsel.', style: 'bold', order: 4 },
        ],
      },
      // ── File Retention & Return of Documents ───────────────────────
      {
        id: 'de-file-retention',
        title: 'FILE RETENTION AND RETURN OF DOCUMENTS',
        title_style: 'heading2',
        condition_key: null,
        order: 5,
        elements: [
          { id: 'de-file-1', type: 'paragraph', content: 'Your file materials will be retained by our office for a minimum period required under the Law Society of Ontario rules and our firm\'s document retention policy. After that period, the file may be destroyed without further notice to you.', style: 'body', order: 0 },
          { id: 'de-file-2', type: 'paragraph', content: 'You may request a copy of your file at any time, subject to payment of reasonable photocopying and administrative charges and satisfaction of any outstanding accounts. Original documents in our possession that belong to you will be returned upon written request.', style: 'body', order: 1 },
          { id: 'de-file-3', type: 'paragraph', content: 'If you are retaining a new lawyer, you may provide a signed authorization directing us to transfer your file to your new counsel. We will comply with such a request subject to our lien rights, if any.', style: 'body', order: 2 },
        ],
      },
      // ── Recommendation to Seek Counsel ─────────────────────────────
      {
        id: 'de-seek-counsel',
        title: 'RECOMMENDATION',
        title_style: 'heading2',
        condition_key: null,
        order: 6,
        elements: [
          { id: 'de-seek-1', type: 'paragraph', content: 'We strongly recommend that you retain new legal counsel without delay if your matter remains unresolved or if there are ongoing proceedings. If you do not know another lawyer, you may contact:', style: 'body', order: 0 },
          { id: 'de-seek-b1', type: 'paragraph', content: 'The Law Society of Ontario Lawyer Referral Service at 1-855-947-5255 or through lsrs.info;', style: 'bullet', order: 1 },
          { id: 'de-seek-b2', type: 'paragraph', content: 'Legal Aid Ontario at 1-800-668-8258 if you believe you may qualify for legal aid;', style: 'bullet', order: 2 },
          { id: 'de-seek-b3', type: 'paragraph', content: 'The Ontario Bar Association or your local county law association.', style: 'bullet', order: 3 },
        ],
      },
      // ── Closing ────────────────────────────────────────────────────
      {
        id: 'de-closing',
        title: '',
        condition_key: null,
        order: 7,
        elements: [
          { id: 'de-close-1', type: 'paragraph', content: 'We thank you for the opportunity to have represented you in this matter. We wish you well in resolving your legal affairs.', style: 'body', order: 0 },
          { id: 'de-close-2', type: 'paragraph', content: 'Please retain this letter for your records. If you have any questions regarding the contents of this letter, please do not hesitate to contact our office.', style: 'body', order: 1 },
          { id: 'de-close-3', type: 'paragraph', content: 'Yours truly,', style: 'body', order: 2 },
        ],
      },
      // ── Signature ──────────────────────────────────────────────────
      {
        id: 'de-sig',
        title: '',
        condition_key: null,
        order: 8,
        elements: [
          {
            id: 'de-sig-block',
            type: 'signature_block',
            signers: [
              { role: 'lawyer', label: '{{lawyer_name}}\n{{firm_name}}\nLSO #: {{lawyer_lso_number}}', include_date_line: false, include_lso_number: false },
            ],
            layout: 'stacked',
            order: 0,
          },
        ],
      },
      // ── Enclosure / CC ─────────────────────────────────────────────
      {
        id: 'de-enc',
        title: '',
        condition_key: null,
        order: 9,
        elements: [
          { id: 'de-enc-1', type: 'paragraph', content: 'Encl. Final Trust Statement (if applicable)\nc.c. File', style: 'body', order: 0 },
        ],
      },
    ],
    header: {
      content: '{{firm_name}}',
      show_logo: true,
      alignment: 'center',
    },
    footer: {
      content: '{{firm_name}} | {{firm_address}} | {{firm_phone}}',
      show_page_numbers: false,
    },
    metadata: {
      page_size: 'letter',
      margins: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
      font_family: 'Times New Roman',
      font_size: 24,
      line_spacing: 276,
    },
  }
}

// ─── Seed Mappings ───────────────────────────────────────────────────────────

function seedMappings(family: string) {
  const common = [
    { field_key: 'current_date', display_name: 'Current Date', source_entity: 'custom', source_path: 'current_date', field_type: 'date', is_required: false, default_value: null, format_rule: 'date_long', fallback_rule: null, max_length: null, sort_order: 0 },
    { field_key: 'client_name', display_name: 'Client Name', source_entity: 'contact', source_path: 'full_name', field_type: 'text', is_required: true, default_value: null, format_rule: null, fallback_rule: null, max_length: null, sort_order: 1 },
    { field_key: 'client_address', display_name: 'Client Address', source_entity: 'contact', source_path: 'address', field_type: 'address', is_required: false, default_value: null, format_rule: null, fallback_rule: null, max_length: null, sort_order: 2 },
    { field_key: 'client_email', display_name: 'Client Email', source_entity: 'contact', source_path: 'email', field_type: 'text', is_required: false, default_value: null, format_rule: null, fallback_rule: null, max_length: null, sort_order: 3 },
    { field_key: 'firm_name', display_name: 'Firm Name', source_entity: 'tenant', source_path: 'name', field_type: 'text', is_required: true, default_value: null, format_rule: null, fallback_rule: null, max_length: null, sort_order: 4 },
    { field_key: 'firm_address', display_name: 'Firm Address', source_entity: 'tenant', source_path: 'firm_address', field_type: 'text', is_required: false, default_value: null, format_rule: null, fallback_rule: null, max_length: null, sort_order: 5 },
    { field_key: 'firm_phone', display_name: 'Firm Phone', source_entity: 'tenant', source_path: 'firm_phone', field_type: 'text', is_required: false, default_value: null, format_rule: null, fallback_rule: null, max_length: null, sort_order: 6 },
    { field_key: 'matter_title', display_name: 'Matter Title', source_entity: 'matter', source_path: 'title', field_type: 'text', is_required: true, default_value: null, format_rule: null, fallback_rule: null, max_length: null, sort_order: 7 },
    { field_key: 'practice_area', display_name: 'Practice Area', source_entity: 'matter', source_path: 'practice_area', field_type: 'text', is_required: false, default_value: null, format_rule: 'titlecase', fallback_rule: null, max_length: null, sort_order: 8 },
    { field_key: 'lawyer_name', display_name: 'Lawyer Name', source_entity: 'user', source_path: 'full_name', field_type: 'text', is_required: false, default_value: null, format_rule: null, fallback_rule: null, max_length: null, sort_order: 9 },
    { field_key: 'lawyer_email', display_name: 'Lawyer Email', source_entity: 'user', source_path: 'email', field_type: 'text', is_required: false, default_value: null, format_rule: null, fallback_rule: null, max_length: null, sort_order: 10 },
  ]

  if (family === 'engagement') {
    return [
      ...common,
      { field_key: 'lawyer_lso_number', display_name: 'LSO Number', source_entity: 'user', source_path: 'lso_number', field_type: 'text', is_required: false, default_value: null, format_rule: null, fallback_rule: null, max_length: null, sort_order: 11 },
      { field_key: 'billing_type', display_name: 'Billing Type', source_entity: 'billing', source_path: 'billing_type', field_type: 'text', is_required: false, default_value: null, format_rule: null, fallback_rule: null, max_length: null, sort_order: 12 },
      { field_key: 'hourly_rate', display_name: 'Hourly Rate', source_entity: 'billing', source_path: 'hourly_rate', field_type: 'currency', is_required: false, default_value: null, format_rule: 'currency', fallback_rule: null, max_length: null, sort_order: 13 },
      { field_key: 'professional_fees', display_name: 'Professional Fees', source_entity: 'billing', source_path: 'professional_fees', field_type: 'currency', is_required: false, default_value: null, format_rule: 'currency', fallback_rule: null, max_length: null, sort_order: 14 },
      { field_key: 'ircc_fees', display_name: 'IRCC Government Processing Fees', source_entity: 'billing', source_path: 'government_fees', field_type: 'currency', is_required: false, default_value: null, format_rule: 'currency', fallback_rule: null, max_length: null, sort_order: 15 },
      { field_key: 'disbursements', display_name: 'Estimated Disbursements', source_entity: 'billing', source_path: 'disbursements', field_type: 'currency', is_required: false, default_value: null, format_rule: 'currency', fallback_rule: null, max_length: null, sort_order: 16 },
      { field_key: 'hst_amount', display_name: 'HST Amount', source_entity: 'billing', source_path: 'hst_amount', field_type: 'currency', is_required: false, default_value: null, format_rule: 'currency', fallback_rule: null, max_length: null, sort_order: 17 },
      { field_key: 'total_amount', display_name: 'Total Amount', source_entity: 'billing', source_path: 'total_amount', field_type: 'currency', is_required: false, default_value: null, format_rule: 'currency', fallback_rule: null, max_length: null, sort_order: 18 },
      { field_key: 'trust_amount', display_name: 'Trust Retainer', source_entity: 'billing', source_path: 'trust_balance', field_type: 'currency', is_required: false, default_value: null, format_rule: 'currency', fallback_rule: null, max_length: null, sort_order: 19 },
      // Payment schedule installment fields (up to 4 installments)
      { field_key: 'installment_1_amount', display_name: 'Installment 1 Amount', source_entity: 'billing', source_path: 'installment_1_amount', field_type: 'currency', is_required: false, default_value: null, format_rule: 'currency', fallback_rule: null, max_length: null, sort_order: 20 },
      { field_key: 'installment_1_due', display_name: 'Installment 1 Due', source_entity: 'billing', source_path: 'installment_1_due', field_type: 'text', is_required: false, default_value: null, format_rule: null, fallback_rule: null, max_length: null, sort_order: 21 },
      { field_key: 'installment_2_amount', display_name: 'Installment 2 Amount', source_entity: 'billing', source_path: 'installment_2_amount', field_type: 'currency', is_required: false, default_value: null, format_rule: 'currency', fallback_rule: null, max_length: null, sort_order: 22 },
      { field_key: 'installment_2_due', display_name: 'Installment 2 Due', source_entity: 'billing', source_path: 'installment_2_due', field_type: 'text', is_required: false, default_value: null, format_rule: null, fallback_rule: null, max_length: null, sort_order: 23 },
      { field_key: 'installment_3_amount', display_name: 'Installment 3 Amount', source_entity: 'billing', source_path: 'installment_3_amount', field_type: 'currency', is_required: false, default_value: null, format_rule: 'currency', fallback_rule: null, max_length: null, sort_order: 24 },
      { field_key: 'installment_3_due', display_name: 'Installment 3 Due', source_entity: 'billing', source_path: 'installment_3_due', field_type: 'text', is_required: false, default_value: null, format_rule: null, fallback_rule: null, max_length: null, sort_order: 25 },
      { field_key: 'installment_4_amount', display_name: 'Installment 4 Amount', source_entity: 'billing', source_path: 'installment_4_amount', field_type: 'currency', is_required: false, default_value: null, format_rule: 'currency', fallback_rule: null, max_length: null, sort_order: 26 },
      { field_key: 'installment_4_due', display_name: 'Installment 4 Due', source_entity: 'billing', source_path: 'installment_4_due', field_type: 'text', is_required: false, default_value: null, format_rule: null, fallback_rule: null, max_length: null, sort_order: 27 },
    ]
  }

  if (family === 'disengagement') {
    return [
      ...common,
      { field_key: 'lawyer_lso_number', display_name: 'LSO Number', source_entity: 'user', source_path: 'lso_number', field_type: 'text', is_required: false, default_value: null, format_rule: null, fallback_rule: null, max_length: null, sort_order: 11 },
      { field_key: 'trust_balance', display_name: 'Trust Balance', source_entity: 'billing', source_path: 'trust_balance', field_type: 'currency', is_required: false, default_value: null, format_rule: 'currency', fallback_rule: null, max_length: null, sort_order: 12 },
    ]
  }

  return common
}

// ─── Seed Conditions ─────────────────────────────────────────────────────────

function seedEngagementConditions() {
  return [
    {
      condition_key: 'is_flat_fee',
      label: 'Show flat fee section',
      rules: { rules: [{ field_key: 'billing_type', operator: 'equals' as const, value: 'flat_fee' }] },
      logic_operator: 'AND',
      evaluation_order: 0,
    },
    {
      condition_key: 'is_hourly',
      label: 'Show hourly rate section',
      rules: { rules: [{ field_key: 'billing_type', operator: 'equals' as const, value: 'hourly' }] },
      logic_operator: 'AND',
      evaluation_order: 1,
    },
    {
      condition_key: 'has_trust_retainer',
      label: 'Show trust retainer section',
      rules: { rules: [{ field_key: 'trust_amount', operator: 'is_not_empty' as const }] },
      logic_operator: 'AND',
      evaluation_order: 2,
    },
    {
      condition_key: 'has_payment_schedule',
      label: 'Show payment schedule section',
      rules: { rules: [{ field_key: 'installment_1_amount', operator: 'is_not_empty' as const }] },
      logic_operator: 'AND',
      evaluation_order: 3,
    },
  ]
}

function seedDisengagementConditions() {
  return [
    {
      condition_key: 'has_trust_balance',
      label: 'Show trust balance section',
      rules: { rules: [{ field_key: 'trust_balance', operator: 'is_not_empty' as const }] },
      logic_operator: 'AND',
      evaluation_order: 0,
    },
  ]
}
