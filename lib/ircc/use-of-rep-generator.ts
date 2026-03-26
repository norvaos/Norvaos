/**
 * Use of Representative (IMM5476E) Generator
 *
 * Generates a pre-filled Use of Representative form by pulling data from:
 * - users table: responsible lawyer's rep profile (display name, title, membership #, phone, email)
 * - tenants table: firm office address
 * - matters table: matter reference and primary contact info
 *
 * The generated PDF is stored in Supabase Storage and a download URL returned.
 * This form is included in:
 *   1. The retainer agreement package (sent at time of retainer)
 *   2. The final form pack (appended as last document)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface UseOfRepData {
  /** Representative (lawyer/RCIC) info */
  rep: {
    familyName: string
    givenName: string
    displayName: string
    title: string           // e.g., "RCIC", "Lawyer", "Paralegal"
    membershipNumber: string
    phone: string
    email: string
    firmName: string
  }
  /** Firm office address */
  address: {
    line1: string
    line2: string
    city: string
    province: string
    postalCode: string
    country: string
    fax: string
  }
  /** Client / applicant info */
  client: {
    familyName: string
    givenName: string
    dateOfBirth: string | null
    uci: string | null       // IRCC unique client identifier
  }
  /** Matter reference */
  matter: {
    matterNumber: string | null
    title: string
  }
}

export interface UseOfRepResult {
  storagePath: string
  publicUrl: string | null
  fileName: string
  repData: UseOfRepData
}

// ── Main Entry Point ──────────────────────────────────────────────────────────

/**
 * Fetch all data needed for the Use of Rep form.
 * Does NOT generate the PDF  -  that requires the Python filler which runs server-side.
 */
export async function buildUseOfRepData(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  matterId: string,
): Promise<UseOfRepData> {
  // Fetch matter + responsible lawyer
  const { data: matter, error: matterErr } = await supabase
    .from('matters')
    .select(`
      id, title, matter_number, responsible_lawyer_id,
      responsible_lawyer:users!matters_responsible_lawyer_id_fkey(
        id, first_name, last_name, email, settings
      )
    `)
    .eq('id', matterId)
    .eq('tenant_id', tenantId)
    .single()

  if (matterErr || !matter) throw new Error('Matter not found')

  // Fetch tenant (firm) info
  const { data: tenantRaw, error: tenantErr } = await (supabase as any)
    .from('tenants')
    .select('name, address_line1, address_line2, city, province, postal_code, country, office_phone, office_fax')
    .eq('id', tenantId)
    .single()

  if (tenantErr || !tenantRaw) throw new Error('Tenant not found')
  const tenant = tenantRaw as Record<string, string | null>

  // Fetch primary contact (applicant)
  const { data: matterContact } = await supabase
    .from('matter_contacts')
    .select('contact:contacts(first_name, last_name, date_of_birth)')
    .eq('matter_id', matterId)
    .eq('tenant_id', tenantId)
    .eq('is_primary', true)
    .limit(1)
    .maybeSingle()

  // Extract lawyer rep profile from settings JSONB
  type UserRef = {
    id: string
    first_name: string | null
    last_name: string | null
    email: string | null
    settings: Record<string, unknown> | null
  } | null

  const lawyer = matter.responsible_lawyer as unknown as UserRef
  const creds = (lawyer?.settings?.professional_credentials ?? {}) as Record<string, string>
  const contact = (matterContact?.contact as { first_name?: string | null; last_name?: string | null; date_of_birth?: string | null } | null)

  // Parse name from display_name (e.g., "John Smith") or fallback to first/last
  const repDisplayName = creds.rep_display_name || creds.display_name || [lawyer?.first_name, lawyer?.last_name].filter(Boolean).join(' ')
  const nameParts = repDisplayName.split(/\s+/)
  const repGiven = nameParts.slice(0, -1).join(' ') || lawyer?.first_name || ''
  const repFamily = nameParts.slice(-1)[0] || lawyer?.last_name || ''

  return {
    rep: {
      familyName: repFamily,
      givenName: repGiven,
      displayName: repDisplayName,
      title: creds.rep_title || creds.title || '',
      membershipNumber: creds.rep_membership_number || creds.rcic_number || creds.lso_number || '',
      phone: creds.rep_phone || '',
      email: creds.rep_email || lawyer?.email || '',
      firmName: tenant.name || '',
    },
    address: {
      line1: tenant.address_line1 ?? '',
      line2: tenant.address_line2 ?? '',
      city: tenant.city ?? '',
      province: tenant.province ?? '',
      postalCode: tenant.postal_code ?? '',
      country: tenant.country ?? 'Canada',
      fax: tenant.office_fax ?? '',
    },
    client: {
      familyName: contact?.last_name ?? '',
      givenName: contact?.first_name ?? '',
      dateOfBirth: contact?.date_of_birth ?? null,
      uci: null,
    },
    matter: {
      matterNumber: matter.matter_number ?? null,
      title: matter.title ?? '',
    },
  }
}

/**
 * Convert UseOfRepData to a flat XFA field mapping for IMM5476E.
 * Field names correspond to the XFA structure of the IMM5476E PDF.
 * These are approximations  -  exact field names depend on the specific PDF version.
 */
export function buildIMM5476EFieldMap(data: UseOfRepData): Record<string, string> {
  return {
    // Section A  -  Representative
    'rep_family_name': data.rep.familyName,
    'rep_given_name': data.rep.givenName,
    'rep_title': data.rep.title,
    'rep_membership_id': data.rep.membershipNumber,
    'rep_telephone': data.rep.phone,
    'rep_email': data.rep.email,
    'rep_firm_name': data.rep.firmName,

    // Section A  -  Rep address
    'rep_address_street': [data.address.line1, data.address.line2].filter(Boolean).join(', '),
    'rep_address_city': data.address.city,
    'rep_address_province': data.address.province,
    'rep_address_postal': data.address.postalCode,
    'rep_address_country': data.address.country,
    'rep_fax': data.address.fax,

    // Section B  -  Client/Applicant
    'applicant_family_name': data.client.familyName,
    'applicant_given_name': data.client.givenName,
    'applicant_dob': data.client.dateOfBirth ?? '',
    'applicant_uci': data.client.uci ?? '',
  }
}
