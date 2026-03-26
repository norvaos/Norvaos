import Anthropic from '@anthropic-ai/sdk'

// ── Types ────────────────────────────────────────────────────────────────────

export interface MaterialFact {
  category:
    | 'personal'
    | 'immigration'
    | 'employment'
    | 'education'
    | 'family'
    | 'legal'
    | 'financial'
    | 'travel'
  field: string
  value: string
  confidence: 'high' | 'medium' | 'low'
  sourceQuote: string
}

export interface ExtractionResult {
  facts: MaterialFact[]
  summary: string
  actionItems: string[]
  missingInfo: string[]
}

// ── Field mapping ────────────────────────────────────────────────────────────

const FIELD_MAP: Record<string, Record<string, string>> = {
  personal: {
    given_name: 'personal.given_name',
    family_name: 'personal.family_name',
    date_of_birth: 'personal.date_of_birth',
    passport_number: 'personal.passport_number',
    nationality: 'personal.nationality',
    country_of_birth: 'personal.country_of_birth',
    gender: 'personal.gender',
    marital_status: 'personal.marital_status',
    email: 'personal.email',
    phone: 'personal.phone',
    address: 'personal.address',
  },
  immigration: {
    passport_number: 'immigration.passport_number',
    passport_expiry: 'immigration.passport_expiry',
    current_status: 'immigration.current_status',
    visa_type: 'immigration.visa_type',
    visa_expiry: 'immigration.visa_expiry',
    previous_refusals: 'immigration.previous_refusals',
    entry_date: 'immigration.entry_date',
    uci_number: 'immigration.uci_number',
  },
  employment: {
    current_employer: 'employment.current_employer',
    job_title: 'employment.job_title',
    noc_code: 'employment.noc_code',
    years_experience: 'employment.years_experience',
    salary: 'employment.salary',
    employment_status: 'employment.employment_status',
  },
  education: {
    highest_degree: 'education.highest_degree',
    institution: 'education.institution',
    field_of_study: 'education.field_of_study',
    graduation_year: 'education.graduation_year',
    eca_status: 'education.eca_status',
  },
  family: {
    spouse_name: 'family.spouse_name',
    spouse_nationality: 'family.spouse_nationality',
    number_of_dependents: 'family.number_of_dependents',
    dependent_names: 'family.dependent_names',
  },
  legal: {
    prior_applications: 'legal.prior_applications',
    refusal_history: 'legal.refusal_history',
    removal_order: 'legal.removal_order',
    criminal_record: 'legal.criminal_record',
    inadmissibility: 'legal.inadmissibility',
  },
  financial: {
    settlement_funds: 'financial.settlement_funds',
    annual_income: 'financial.annual_income',
    assets: 'financial.assets',
    proof_of_funds: 'financial.proof_of_funds',
  },
  travel: {
    countries_visited: 'travel.countries_visited',
    travel_history: 'travel.travel_history',
    current_country: 'travel.current_country',
  },
}

// ── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(matterContext?: { caseType?: string; title?: string }): string {
  let prompt = `You are a legal assistant extracting material facts from a consultation transcript. Extract ONLY facts explicitly stated by the client or lawyer. Never infer or assume. For each fact, provide the exact quote from the transcript.

Extract facts in the following categories:
- personal: name, date of birth, passport number, nationality, gender, marital status, contact info, address
- immigration: visas, refusals, current status, entry dates, UCI number, passport details
- employment: current job, NOC code, employer, salary, years of experience
- education: degrees, institutions, field of study, graduation year, ECA status
- family: spouse, dependents, their nationalities
- legal: prior applications, refusals, bans, removal orders, criminal record, inadmissibility
- financial: assets, income, settlement funds, proof of funds
- travel: countries visited, duration of stays, current country of residence

Also extract:
- action_items: things the lawyer promised to do or asked the client to provide
- missing_info: things the lawyer asked about that the client could not answer or said they would provide later

For confidence levels:
- high: explicitly and clearly stated (e.g. "My name is John Smith")
- medium: stated but with some ambiguity (e.g. "I think it was around 2019")
- low: mentioned indirectly or partially (e.g. reference to a document without specifics)`

  if (matterContext?.caseType) {
    prompt += `\n\nThis consultation is for a ${matterContext.caseType} matter.`
  }
  if (matterContext?.title) {
    prompt += ` Matter title: "${matterContext.title}".`
  }

  prompt += `

Respond with valid JSON in this exact format:
{
  "facts": [
    {
      "category": "personal",
      "field": "given_name",
      "value": "John",
      "confidence": "high",
      "sourceQuote": "My name is John Smith"
    }
  ],
  "summary": "Brief summary of the consultation",
  "actionItems": ["Lawyer to file work permit extension by March 30"],
  "missingInfo": ["Client could not recall exact entry date to Canada"]
}`

  return prompt
}

// ── Main extraction function ─────────────────────────────────────────────────

export async function extractFacts(
  transcript: string,
  matterContext?: { caseType?: string; title?: string },
): Promise<ExtractionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('[Norva Ear] ANTHROPIC_API_KEY is not set')
    return {
      facts: [],
      summary: 'Error: Anthropic API key is not configured.',
      actionItems: [],
      missingInfo: [],
    }
  }

  const client = new Anthropic({ apiKey })

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: buildSystemPrompt(matterContext),
      messages: [
        {
          role: 'user',
          content: `Here is the consultation transcript:\n\n${transcript}`,
        },
      ],
    })

    // Extract text content from response
    const textBlock = response.content.find((block) => block.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      console.error('[Norva Ear] No text content in Claude response')
      return {
        facts: [],
        summary: 'Error: No text content returned from AI.',
        actionItems: [],
        missingInfo: [],
      }
    }

    // Parse JSON from response — handle markdown code blocks
    let jsonStr = textBlock.text.trim()
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim()
    }

    const parsed = JSON.parse(jsonStr) as ExtractionResult

    return {
      facts: Array.isArray(parsed.facts) ? parsed.facts : [],
      summary: parsed.summary || '',
      actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
      missingInfo: Array.isArray(parsed.missingInfo) ? parsed.missingInfo : [],
    }
  } catch (error) {
    console.error('[Norva Ear] Fact extraction failed:', error)
    return {
      facts: [],
      summary: `Error during extraction: ${error instanceof Error ? error.message : 'Unknown error'}`,
      actionItems: [],
      missingInfo: [],
    }
  }
}

// ── Field mapper ─────────────────────────────────────────────────────────────

/**
 * Maps extracted facts to known matter/contact field paths.
 * Returns a flat record of field path -> value for auto-population.
 */
export function mapFactsToFields(facts: MaterialFact[]): Record<string, string> {
  const mapped: Record<string, string> = {}

  for (const fact of facts) {
    const categoryMap = FIELD_MAP[fact.category]
    if (!categoryMap) continue

    // Try exact field name match
    const fieldKey = fact.field.toLowerCase().replace(/\s+/g, '_')
    const path = categoryMap[fieldKey]
    if (path) {
      mapped[path] = fact.value
    } else {
      // Fallback: store under category.field_name
      mapped[`${fact.category}.${fieldKey}`] = fact.value
    }
  }

  return mapped
}
