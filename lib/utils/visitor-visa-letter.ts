import { format, differenceInDays, parseISO } from 'date-fns'
import type { VisitorVisaFormValues } from '@/lib/schemas/visitor-visa-invitation'
import {
  getProvinceName,
  getCountryName,
  getOptionLabel,
  IMMIGRATION_STATUSES,
  RELATIONSHIPS,
  VISIT_PURPOSES,
  ACCOMMODATION_TYPES,
  EXPENSE_RESPONSIBILITY,
  GENDERS,
} from './visitor-visa-constants'

function fmtDate(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'MMMM d, yyyy')
  } catch {
    return dateStr
  }
}

function getDuration(arrival: string, departure: string): number {
  try {
    return differenceInDays(parseISO(departure), parseISO(arrival))
  } catch {
    return 0
  }
}

export function generateInvitationLetter(data: VisitorVisaFormValues): string {
  const { inviter, visitor, visit, accommodation, additional_visitors } = data

  const today = format(new Date(), 'MMMM d, yyyy')
  const duration = getDuration(visit.arrival_date, visit.departure_date)
  const provinceName = getProvinceName(inviter.province)
  const citizenshipCountry = getCountryName(visitor.country_of_citizenship)
  const residenceCountry = getCountryName(visitor.country_of_residence)
  const relationshipLabel =
    visitor.relationship === 'other' && visitor.relationship_other
      ? visitor.relationship_other
      : getOptionLabel(RELATIONSHIPS, visitor.relationship)
  const purposeLabel = getOptionLabel(VISIT_PURPOSES, visit.purpose)
  const statusLabel = getOptionLabel(IMMIGRATION_STATUSES, inviter.immigration_status)
  const genderLabel = visitor.gender ? getOptionLabel(GENDERS, visitor.gender) : ''

  // Pronoun helper
  const pronoun = visitor.gender === 'female' ? 'her' : visitor.gender === 'male' ? 'his' : 'their'
  const pronounSubject = visitor.gender === 'female' ? 'she' : visitor.gender === 'male' ? 'he' : 'they'
  const pronounCap = pronounSubject.charAt(0).toUpperCase() + pronounSubject.slice(1)

  const lines: string[] = []

  // Header
  lines.push(today)
  lines.push('')
  lines.push('Visa Officer')
  lines.push('Immigration, Refugees and Citizenship Canada (IRCC)')
  lines.push('Government of Canada')
  lines.push('')
  lines.push(`Dear Visa Officer,`)
  lines.push('')

  // Opening
  lines.push(
    `I, ${inviter.full_name}, am writing this letter to invite ${visitor.full_name}, ` +
    `my ${relationshipLabel.toLowerCase()}, to visit me in Canada. ` +
    `I am a ${statusLabel} residing at the following address:`
  )
  lines.push('')
  lines.push(`${inviter.street_address}`)
  lines.push(`${inviter.city}, ${provinceName} ${inviter.postal_code.toUpperCase()}`)
  lines.push(`Canada`)
  lines.push('')

  // Inviter details
  lines.push(`My personal details are as follows:`)
  lines.push(`- Full Name: ${inviter.full_name}`)
  lines.push(`- Date of Birth: ${fmtDate(inviter.date_of_birth)}`)
  lines.push(`- Immigration Status: ${statusLabel}`)
  if (
    ['work_permit', 'study_permit', 'other'].includes(inviter.immigration_status) &&
    inviter.permit_expiry_date
  ) {
    lines.push(`- Permit Expiry Date: ${fmtDate(inviter.permit_expiry_date)}`)
  }
  lines.push(`- Occupation: ${inviter.occupation}`)
  if (inviter.employer_company) {
    lines.push(`- Employer / Company: ${inviter.employer_company}`)
  }
  if (inviter.employer_school_name) {
    lines.push(`- Employer / School: ${inviter.employer_school_name}`)
  }
  lines.push(`- Phone: ${inviter.phone}`)
  lines.push(`- Email: ${inviter.email}`)
  if (inviter.annual_income) {
    lines.push(`- Annual Income: CAD $${Number(inviter.annual_income).toLocaleString()}`)
  }
  lines.push('')

  // Visitor details
  lines.push(`The person I am inviting has the following details:`)
  lines.push(`- Full Name: ${visitor.full_name}`)
  lines.push(`- Date of Birth: ${fmtDate(visitor.date_of_birth)}`)
  if (genderLabel) {
    lines.push(`- Gender: ${genderLabel}`)
  }
  lines.push(`- Passport Number: ${visitor.passport_number}`)
  lines.push(`- Passport Expiry Date: ${fmtDate(visitor.passport_expiry_date)}`)
  lines.push(`- Country of Citizenship: ${citizenshipCountry}`)
  lines.push(`- Country of Residence: ${residenceCountry}`)
  lines.push(`- Address: ${visitor.address}`)
  if (visitor.phone) {
    lines.push(`- Phone: ${visitor.phone}`)
  }
  if (visitor.email) {
    lines.push(`- Email: ${visitor.email}`)
  }
  lines.push(`- Relationship to Me: ${relationshipLabel}`)
  lines.push('')

  // Visit details
  lines.push(
    `I am inviting ${visitor.full_name} to visit Canada for the purpose of ${purposeLabel.toLowerCase()}. ` +
    `${pronounCap} ${pronounSubject === 'they' ? 'plan' : 'plans'} to arrive on ${fmtDate(visit.arrival_date)} ` +
    `and depart on ${fmtDate(visit.departure_date)}, for a total stay of approximately ${duration} days.`
  )
  lines.push('')

  // Purpose-specific details
  if (visit.purpose === 'business' && visit.business_purpose) {
    lines.push(`The purpose of the business visit is: ${visit.business_purpose}`)
    if (visit.business_company) {
      lines.push(`The business is related to: ${visit.business_company}`)
    }
    lines.push('')
  }

  if (visit.purpose === 'event') {
    if (visit.event_name) {
      lines.push(`${pronounCap} will be attending the event: ${visit.event_name}`)
    }
    if (visit.event_dates) {
      lines.push(`Event dates: ${visit.event_dates}`)
    }
    if (visit.event_location) {
      lines.push(`Event location: ${visit.event_location}`)
    }
    lines.push('')
  }

  if (visit.purpose === 'medical') {
    if (visit.medical_facility) {
      lines.push(`${pronounCap} will be receiving treatment at: ${visit.medical_facility}`)
    }
    if (visit.medical_treatment) {
      lines.push(`Type of treatment: ${visit.medical_treatment}`)
    }
    lines.push('')
  }

  if (visit.purpose === 'wedding') {
    if (visit.wedding_whose) {
      lines.push(`${pronounCap} will be attending the wedding of: ${visit.wedding_whose}`)
    }
    if (visit.wedding_date) {
      lines.push(`Wedding date: ${fmtDate(visit.wedding_date)}`)
    }
    if (visit.wedding_venue) {
      lines.push(`Wedding venue: ${visit.wedding_venue}`)
    }
    lines.push('')
  }

  if (visit.purpose === 'other' && visit.other_description) {
    lines.push(`Details about the visit: ${visit.other_description}`)
    lines.push('')
  }

  if (visit.places_to_visit) {
    lines.push(`During ${pronoun} stay, ${pronounSubject} ${pronounSubject === 'they' ? 'plan' : 'plans'} to visit: ${visit.places_to_visit}`)
    lines.push('')
  }

  // Accommodation
  const accommodationLabel = getOptionLabel(ACCOMMODATION_TYPES, accommodation.staying_with)
  if (accommodation.staying_with === 'with_inviter') {
    lines.push(
      `${visitor.full_name} will be staying with me at my residence during ${pronoun} stay in Canada.`
    )
  } else if (accommodation.staying_with === 'hotel' || accommodation.staying_with === 'airbnb') {
    lines.push(
      `${visitor.full_name} will be staying at a ${accommodationLabel.toLowerCase()}` +
      (accommodation.accommodation_name ? `: ${accommodation.accommodation_name}` : '.') +
      (accommodation.accommodation_address ? `, located at ${accommodation.accommodation_address}` : '') +
      '.'
    )
  } else if (accommodation.staying_with === 'other' && accommodation.accommodation_other_details) {
    lines.push(
      `Accommodation arrangements: ${accommodation.accommodation_other_details}`
    )
  }
  lines.push('')

  // Financial support
  const expenseLabel = getOptionLabel(EXPENSE_RESPONSIBILITY, accommodation.expense_responsibility)
  lines.push(`Regarding financial support: ${expenseLabel.toLowerCase()}.`)

  if (
    accommodation.expense_responsibility === 'inviter' ||
    accommodation.expense_responsibility === 'shared'
  ) {
    const provisions: string[] = []
    if (accommodation.will_provide_accommodation) provisions.push('accommodation')
    if (accommodation.will_provide_food) provisions.push('food')
    if (accommodation.will_provide_transportation) provisions.push('transportation')
    if (accommodation.will_provide_spending_money) provisions.push('spending money')

    if (provisions.length > 0) {
      lines.push(
        `I will be providing the following during ${pronoun} stay: ${provisions.join(', ')}.`
      )
    }

    if (accommodation.inviter_annual_income) {
      lines.push(
        `My annual income is approximately CAD $${Number(accommodation.inviter_annual_income).toLocaleString()}.`
      )
    }
    if (accommodation.employment_status) {
      const empLabel = accommodation.employment_status
      lines.push(`I am currently ${empLabel.replace(/_/g, ' ')}.`)
    }
    if (accommodation.number_of_dependents) {
      lines.push(`I have ${accommodation.number_of_dependents} dependent(s).`)
    }
  }
  lines.push('')

  // Additional visitors
  if (additional_visitors.has_additional && additional_visitors.visitors.length > 0) {
    lines.push(`I am also inviting the following additional visitor(s):`)
    for (const v of additional_visitors.visitors) {
      const parts = [`- ${v.name}`]
      if (v.relationship) parts.push(`(${v.relationship})`)
      if (v.country) parts.push(`from ${getCountryName(v.country)}`)
      if (v.passport_number) parts.push(`— Passport: ${v.passport_number}`)
      lines.push(parts.join(' '))
    }
    lines.push('')
  }

  // Closing
  lines.push(
    `I sincerely request that you give favourable consideration to this visa application. ` +
    `I assure you that ${visitor.full_name} will comply with the terms of ${pronoun} visa and ` +
    `will return to ${residenceCountry} before the expiration of ${pronoun} authorized stay.`
  )
  lines.push('')
  lines.push(`Please do not hesitate to contact me should you require any further information or documentation.`)
  lines.push('')
  lines.push(`Sincerely,`)
  lines.push('')
  lines.push('')
  lines.push(`____________________________`)
  lines.push(`${inviter.full_name}`)
  lines.push(`${inviter.street_address}`)
  lines.push(`${inviter.city}, ${provinceName} ${inviter.postal_code.toUpperCase()}`)
  lines.push(`Phone: ${inviter.phone}`)
  lines.push(`Email: ${inviter.email}`)

  return lines.join('\n')
}
