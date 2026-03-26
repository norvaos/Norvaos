/**
 * Context-Infector: Gathers matter facts + wiki playbook into a structured
 * context payload for AI drafting.
 *
 * All fields are tagged with a `source` for Source Attribution highlighting.
 * Missing fields produce [MISSING DATA] placeholders — never hallucinated.
 *
 * Budget: All queries use explicit column fragments (< 20 cols each).
 */

import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { LocaleCode } from '@/lib/i18n/config'
import { buildCodeSwitchPrompt } from '@/lib/i18n/polyglot-code-switch'

// ── Types ────────────────────────────────────────────────────────────────────

export interface SourceTag {
  field: string
  value: string | null
  source: 'matter' | 'contact' | 'person' | 'custom_data' | 'wiki' | 'system'
  table: string
  column: string
}

export interface FactAnchor {
  /** Fact from a Norva Ear session */
  fact: string
  /** Direct quote from the client transcript */
  sourceQuote: string
  /** Category (personal, immigration, employment, etc.) */
  category: string
  /** Confidence level */
  confidence: 'high' | 'medium' | 'low'
  /** Session title for attribution */
  sessionTitle: string
}

export interface SnippetSource {
  /** wiki_snippets.id */
  snippetId: string
  /** Snippet title for audit display */
  title: string
  /** SHA-256 hash of snippet content at time of use */
  contentHash: string
  /** Snippet type (clause, template, boilerplate, etc.) */
  snippetType: string
}

export interface DraftContext {
  /** Matter core facts */
  matter: {
    id: string
    title: string
    matterNumber: string
    status: string
    practiceArea: string | null
    matterType: string | null
    caseType: string | null
    dateOpened: string | null
    lawyerName: string | null
  }

  /** Primary applicant / client */
  client: {
    fullName: string
    firstName: string | null
    lastName: string | null
    email: string | null
    phone: string | null
    dateOfBirth: string | null
    nationality: string | null
    gender: string | null
    address: string | null
    city: string | null
    province: string | null
    country: string | null
    postalCode: string | null
  }

  /** Immigration-specific person data (if applicable) */
  immigrationProfile: {
    passportNumber: string | null
    passportExpiry: string | null
    immigrationStatus: string | null
    currentVisaType: string | null
    nocCode: string | null
    employerName: string | null
    maritalStatus: string | null
    currentlyInCanada: boolean | null
    personRole: string | null
    travelHistory: string | null
  } | null

  /** Custom fields from matter_custom_data */
  customFields: Record<string, unknown>

  /** Wiki playbook content (the firm's "Secret Sauce") */
  playbook: {
    id: string
    title: string
    content: string
    tags: string[]
  } | null

  /** Fact-Anchors from Norva Ear sessions (Voice Calibration) */
  factAnchors: FactAnchor[]

  /** Snippet chain-of-custody — SHA-256 hashes of wiki snippets used in this draft */
  snippetSources: SnippetSource[]

  /** All source tags for attribution highlighting */
  sources: SourceTag[]

  /** Fields that are missing — used for [MISSING DATA] placeholders */
  missingFields: string[]
}

// ── Column Fragments ─────────────────────────────────────────────────────────

const MATTER_COLS = 'id, title, matter_number, status, practice_area_id, matter_type_id, case_type_id, date_opened, responsible_lawyer_id, currently_in_canada' as const // 10
const CONTACT_COLS = 'id, first_name, last_name, email_primary, phone_primary, date_of_birth, nationality, gender, address_line1, city, province_state, country, postal_code' as const // 13
const PERSON_COLS = 'id, first_name, last_name, person_role, passport_number, passport_expiry, immigration_status, current_visa_type, noc_code, employer_name, marital_status, contact_id, profile_data' as const // 13
const PLAYBOOK_COLS = 'id, title, content, tags, status' as const // 5

// ── Builder ──────────────────────────────────────────────────────────────────

export async function buildDraftContext(
  supabase: SupabaseClient,
  matterId: string,
  playbookId?: string,
  snippetIds?: string[],
): Promise<DraftContext> {
  const sources: SourceTag[] = []
  const missingFields: string[] = []

  // Helper: tag a field and track missing
  function tag(field: string, value: string | null | undefined, source: SourceTag['source'], table: string, column: string): string | null {
    const val = value ?? null
    sources.push({ field, value: val, source, table, column })
    if (!val) missingFields.push(field)
    return val
  }

  // ── 1. Fetch matter + related data in parallel ─────────────────────────

  const [matterRes, peopleRes, customDataRes, playbookRes, earSessionsRes] = await Promise.all([
    // Matter core
    supabase
      .from('matters')
      .select(MATTER_COLS)
      .eq('id', matterId)
      .single(),

    // Matter people (immigration profiles)
    supabase
      .from('matter_people')
      .select(PERSON_COLS)
      .eq('matter_id', matterId)
      .limit(10),

    // Custom data
    supabase
      .from('matter_custom_data')
      .select('data, schema_version')
      .eq('matter_id', matterId)
      .maybeSingle(),

    // Wiki playbook (if specified)
    playbookId
      ? supabase
          .from('wiki_playbooks')
          .select(PLAYBOOK_COLS)
          .eq('id', playbookId)
          .eq('is_active', true)
          .single()
      : Promise.resolve({ data: null, error: null }),

    // Norva Ear sessions — Voice Calibration fact anchors
    supabase
      .from('norva_ear_sessions')
      .select('id, title, extracted_facts, status')
      .eq('matter_id', matterId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const matter = matterRes.data
  if (!matter) {
    throw new Error(`Matter ${matterId} not found`)
  }

  // ── 2. Resolve linked entities ─────────────────────────────────────────

  // Practice area name
  let practiceAreaName: string | null = null
  if (matter.practice_area_id) {
    const { data: pa } = await supabase
      .from('practice_areas')
      .select('name')
      .eq('id', matter.practice_area_id)
      .single()
    practiceAreaName = pa?.name ?? null
  }

  // Matter type name
  let matterTypeName: string | null = null
  if (matter.matter_type_id) {
    const { data: mt } = await supabase
      .from('matter_types')
      .select('name')
      .eq('id', matter.matter_type_id)
      .single()
    matterTypeName = mt?.name ?? null
  }

  // Case type name
  let caseTypeName: string | null = null
  if (matter.case_type_id) {
    const { data: ct } = await supabase
      .from('case_types')
      .select('name')
      .eq('id', matter.case_type_id)
      .single()
    caseTypeName = ct?.name ?? null
  }

  // Responsible lawyer name
  let lawyerName: string | null = null
  if (matter.responsible_lawyer_id) {
    const { data: user } = await supabase
      .from('users')
      .select('first_name, last_name')
      .eq('id', matter.responsible_lawyer_id)
      .single()
    if (user) lawyerName = [user.first_name, user.last_name].filter(Boolean).join(' ')
  }

  // ── 3. Find primary contact ────────────────────────────────────────────

  const { data: matterContact } = await supabase
    .from('matter_contacts')
    .select('contact_id')
    .eq('matter_id', matterId)
    .eq('is_primary', true)
    .limit(1)
    .maybeSingle()

  let contact: Record<string, string | null> | null = null
  if (matterContact?.contact_id) {
    const { data: c } = await supabase
      .from('contacts')
      .select(CONTACT_COLS)
      .eq('id', matterContact.contact_id)
      .single()
    contact = c as Record<string, string | null> | null
  }

  // ── 4. Find principal applicant from matter_people ─────────────────────

  const people = (peopleRes.data ?? []) as Array<Record<string, unknown>>
  const principalApplicant = people.find(
    (p) => p.person_role === 'principal_applicant' || p.person_role === 'pa'
  ) ?? people[0] ?? null

  // ── 5. Build playbook text content ─────────────────────────────────────

  let playbook: DraftContext['playbook'] = null
  if (playbookRes.data) {
    const pb = playbookRes.data as { id: string; title: string; content: unknown; tags: string[]; status: string }
    // Convert JSONB block content to plain text
    let contentText = ''
    if (Array.isArray(pb.content)) {
      contentText = (pb.content as Array<{ type: string; content: string }>)
        .map((block) => {
          if (block.type === 'heading') return `## ${block.content}`
          if (block.type === 'checklist') return `- [${(block as { checked?: boolean }).checked ? 'x' : ' '}] ${block.content}`
          if (block.type === 'callout') return `> ${block.content}`
          if (block.type === 'quote') return `"${block.content}"`
          if (block.type === 'divider') return '---'
          return block.content
        })
        .filter(Boolean)
        .join('\n')
    } else if (typeof pb.content === 'string') {
      contentText = pb.content
    }

    playbook = {
      id: pb.id,
      title: pb.title,
      content: contentText,
      tags: pb.tags ?? [],
    }
    sources.push({ field: 'playbook', value: pb.title, source: 'wiki', table: 'wiki_playbooks', column: 'content' })
  }

  // ── 5b. Snippet Chain-of-Custody (Vault SHA-256) ──────────────────────

  const snippetSources: SnippetSource[] = []
  if (snippetIds && snippetIds.length > 0) {
    const { data: snippets } = await supabase
      .from('wiki_snippets')
      .select('id, title, content, snippet_type')
      .in('id', snippetIds)
      .eq('is_active', true)

    for (const s of (snippets ?? []) as Array<{ id: string; title: string; content: string; snippet_type: string }>) {
      const contentHash = createHash('sha256').update(s.content ?? '').digest('hex')
      snippetSources.push({
        snippetId: s.id,
        title: s.title,
        contentHash,
        snippetType: s.snippet_type ?? 'clause',
      })
      sources.push({
        field: `snippet.${s.title}`,
        value: s.content?.slice(0, 200) ?? null,
        source: 'wiki',
        table: 'wiki_snippets',
        column: 'content',
      })
    }

    // Increment use_count on referenced snippets (fire-and-forget)
    for (const sid of snippetIds) {
      supabase.rpc('increment_snippet_use_count', { snippet_id: sid }).then(() => {})
    }
  }

  // ── 6. Build Fact-Anchors from Norva Ear sessions (Voice Calibration) ──

  const factAnchors: FactAnchor[] = []
  const earSessions = (earSessionsRes.data ?? []) as Array<{
    id: string
    title: string | null
    extracted_facts: unknown
    status: string
  }>

  for (const session of earSessions) {
    if (!Array.isArray(session.extracted_facts)) continue
    for (const fact of session.extracted_facts as Array<{
      category?: string
      field?: string
      value?: string
      confidence?: string
      sourceQuote?: string
    }>) {
      if (fact.value && fact.sourceQuote) {
        factAnchors.push({
          fact: `${fact.field ?? fact.category}: ${fact.value}`,
          sourceQuote: fact.sourceQuote,
          category: fact.category ?? 'general',
          confidence: (fact.confidence as FactAnchor['confidence']) ?? 'medium',
          sessionTitle: session.title ?? 'Untitled Session',
        })
        sources.push({
          field: `ear.${fact.field ?? fact.category}`,
          value: fact.value,
          source: 'system',
          table: 'norva_ear_sessions',
          column: 'extracted_facts',
        })
      }
    }
  }

  // ── 7. Assemble context with source tags ───────────────────────────────

  const ctx: DraftContext = {
    matter: {
      id: matter.id,
      title: tag('matter.title', matter.title, 'matter', 'matters', 'title') ?? '',
      matterNumber: tag('matter.matterNumber', matter.matter_number, 'matter', 'matters', 'matter_number') ?? '',
      status: matter.status ?? 'open',
      practiceArea: tag('matter.practiceArea', practiceAreaName, 'matter', 'practice_areas', 'name'),
      matterType: tag('matter.matterType', matterTypeName, 'matter', 'matter_types', 'name'),
      caseType: tag('matter.caseType', caseTypeName, 'matter', 'case_types', 'name'),
      dateOpened: tag('matter.dateOpened', matter.date_opened as string | null, 'matter', 'matters', 'date_opened'),
      lawyerName: tag('matter.lawyerName', lawyerName, 'matter', 'users', 'first_name'),
    },

    client: {
      fullName: contact
        ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') || '[MISSING DATA]'
        : principalApplicant
          ? [principalApplicant.first_name as string, principalApplicant.last_name as string].filter(Boolean).join(' ') || '[MISSING DATA]'
          : '[MISSING DATA]',
      firstName: tag('client.firstName', (contact?.first_name ?? principalApplicant?.first_name as string) ?? null, 'contact', 'contacts', 'first_name'),
      lastName: tag('client.lastName', (contact?.last_name ?? principalApplicant?.last_name as string) ?? null, 'contact', 'contacts', 'last_name'),
      email: tag('client.email', (contact?.email_primary ?? principalApplicant?.email as string) ?? null, 'contact', 'contacts', 'email_primary'),
      phone: tag('client.phone', (contact?.phone_primary ?? principalApplicant?.phone as string) ?? null, 'contact', 'contacts', 'phone_primary'),
      dateOfBirth: tag('client.dateOfBirth', contact?.date_of_birth ?? null, 'contact', 'contacts', 'date_of_birth'),
      nationality: tag('client.nationality', contact?.nationality ?? null, 'contact', 'contacts', 'nationality'),
      gender: tag('client.gender', contact?.gender ?? null, 'contact', 'contacts', 'gender'),
      address: tag('client.address', contact?.address_line1 ?? null, 'contact', 'contacts', 'address_line1'),
      city: tag('client.city', contact?.city ?? null, 'contact', 'contacts', 'city'),
      province: tag('client.province', contact?.province_state ?? null, 'contact', 'contacts', 'province_state'),
      country: tag('client.country', contact?.country ?? null, 'contact', 'contacts', 'country'),
      postalCode: tag('client.postalCode', contact?.postal_code ?? null, 'contact', 'contacts', 'postal_code'),
    },

    immigrationProfile: principalApplicant ? {
      passportNumber: tag('immigration.passportNumber', principalApplicant.passport_number as string | null, 'person', 'matter_people', 'passport_number'),
      passportExpiry: tag('immigration.passportExpiry', principalApplicant.passport_expiry as string | null, 'person', 'matter_people', 'passport_expiry'),
      immigrationStatus: tag('immigration.immigrationStatus', principalApplicant.immigration_status as string | null, 'person', 'matter_people', 'immigration_status'),
      currentVisaType: tag('immigration.currentVisaType', principalApplicant.current_visa_type as string | null, 'person', 'matter_people', 'current_visa_type'),
      nocCode: tag('immigration.nocCode', principalApplicant.noc_code as string | null, 'person', 'matter_people', 'noc_code'),
      employerName: tag('immigration.employerName', principalApplicant.employer_name as string | null, 'person', 'matter_people', 'employer_name'),
      maritalStatus: tag('immigration.maritalStatus', principalApplicant.marital_status as string | null, 'person', 'matter_people', 'marital_status'),
      currentlyInCanada: matter.currently_in_canada as boolean | null,
      personRole: principalApplicant.person_role as string | null,
      travelHistory: null,
    } : null,

    customFields: (customDataRes.data?.data as Record<string, unknown>) ?? {},

    playbook,
    snippetSources,
    factAnchors,
    sources,
    missingFields,
  }

  return ctx
}

// ── System Prompt Builder ────────────────────────────────────────────────────

export function buildSystemPrompt(ctx: DraftContext): string {
  const playbookSection = ctx.playbook
    ? `\n\n## FIRM PLAYBOOK: "${ctx.playbook.title}"\nFollow this playbook as the style guide and strategy framework:\n\n${ctx.playbook.content}`
    : ''

  // Voice Calibration: inject Norva Ear fact anchors
  const factAnchorSection = ctx.factAnchors.length > 0
    ? `\n\n## CLIENT'S OWN WORDS (Norva Ear — Voice Calibration)
These are direct quotes from the client during consultation. Weave these personal details naturally into the letter to ground the narrative in the client's authentic voice. Attribute each to the consultation session.

${ctx.factAnchors
      .filter(a => a.confidence !== 'low')
      .map(a => `- **${a.fact}** — Client said: "${a.sourceQuote}" (Session: ${a.sessionTitle})`)
      .join('\n')}`
    : ''

  // Polyglot Code-Switch: detect mixed-language Norva Ear sessions (Directive 15.0)
  const earLanguages = new Set<LocaleCode>()
  for (const anchor of ctx.factAnchors) {
    // Check for language tags in source quotes [LANG:xx]
    const langMatches = anchor.sourceQuote.matchAll(/\[LANG:(\w{2})\]/g)
    for (const m of langMatches) earLanguages.add(m[1] as LocaleCode)
  }
  const codeSwitchSection = earLanguages.size > 1
    ? `\n\n${buildCodeSwitchPrompt([...earLanguages])}`
    : ''

  const missingWarning = ctx.missingFields.length > 0
    ? `\n\nMISSING DATA FIELDS (use [MISSING DATA] placeholder for these):\n${ctx.missingFields.map(f => `- ${f}`).join('\n')}`
    : ''

  return `You are a senior immigration lawyer's AI drafting assistant at a Canadian law firm.

## RULES (INVIOLABLE)
1. NEVER hallucinate or invent data. If a field is missing, write [MISSING DATA] as a placeholder.
2. Every factual claim must come from the provided context. Do not add information not in the context.
3. Use Canadian English spelling (colour, organisation, defence, licence).
4. Follow the firm's playbook style guide if provided.
5. Be professional, persuasive, and precise.
6. Output the letter in Markdown format.
7. After the letter, output a JSON block with source attributions for every data point used.

## CONTEXT

### Matter
- Title: ${ctx.matter.title}
- File Number: ${ctx.matter.matterNumber || '[MISSING DATA]'}
- Practice Area: ${ctx.matter.practiceArea || '[MISSING DATA]'}
- Matter Type: ${ctx.matter.matterType || '[MISSING DATA]'}
- Case Type: ${ctx.matter.caseType || '[MISSING DATA]'}
- Date Opened: ${ctx.matter.dateOpened || '[MISSING DATA]'}
- Responsible Lawyer: ${ctx.matter.lawyerName || '[MISSING DATA]'}

### Client / Applicant
- Full Name: ${ctx.client.fullName}
- Date of Birth: ${ctx.client.dateOfBirth || '[MISSING DATA]'}
- Nationality: ${ctx.client.nationality || '[MISSING DATA]'}
- Gender: ${ctx.client.gender || '[MISSING DATA]'}
- Email: ${ctx.client.email || '[MISSING DATA]'}
- Phone: ${ctx.client.phone || '[MISSING DATA]'}
- Address: ${[ctx.client.address, ctx.client.city, ctx.client.province, ctx.client.country, ctx.client.postalCode].filter(Boolean).join(', ') || '[MISSING DATA]'}

${ctx.immigrationProfile ? `### Immigration Profile
- Passport Number: ${ctx.immigrationProfile.passportNumber || '[MISSING DATA]'}
- Passport Expiry: ${ctx.immigrationProfile.passportExpiry || '[MISSING DATA]'}
- Immigration Status: ${ctx.immigrationProfile.immigrationStatus || '[MISSING DATA]'}
- Current Visa Type: ${ctx.immigrationProfile.currentVisaType || '[MISSING DATA]'}
- NOC Code: ${ctx.immigrationProfile.nocCode || '[MISSING DATA]'}
- Employer: ${ctx.immigrationProfile.employerName || '[MISSING DATA]'}
- Marital Status: ${ctx.immigrationProfile.maritalStatus || '[MISSING DATA]'}
- Currently in Canada: ${ctx.immigrationProfile.currentlyInCanada === true ? 'Yes' : ctx.immigrationProfile.currentlyInCanada === false ? 'No' : '[MISSING DATA]'}
- Role: ${ctx.immigrationProfile.personRole || 'Principal Applicant'}` : ''}

${Object.keys(ctx.customFields).length > 0 ? `### Custom Fields\n${Object.entries(ctx.customFields).map(([k, v]) => `- ${k}: ${v ?? '[MISSING DATA]'}`).join('\n')}` : ''}
${playbookSection}${factAnchorSection}${codeSwitchSection}${missingWarning}

## OUTPUT FORMAT

First, output the submission letter in Markdown.

Then output a source attribution block as a JSON code fence:

\`\`\`json:sources
[
  { "sentence": "The applicant, John Doe, ...", "field": "client.fullName", "source": "contacts.first_name + contacts.last_name" },
  ...
]
\`\`\`

Every sentence containing a data point MUST have an attribution entry.`
}
