'use client'

import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { User, Building2, Mail, Phone, MapPin, Globe, Check, AlertTriangle, ShieldCheck, ShieldAlert, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import { useCreateContact } from '@/lib/queries/contacts'
import { cn } from '@/lib/utils'
import { SovereignCreator, type SovereignCreatorStep } from '@/components/ui/sovereign-creator'
import { NorvaGuardianTooltip } from '@/components/ui/norva-guardian-tooltip'

// ---------------------------------------------------------------------------
// Guardian help text for contacts
// ---------------------------------------------------------------------------

const CONTACT_HELP = {
  contactType: 'Is this a person or a company? Pick "Individual" for a single client, or "Organisation" for a business, government office, or group.',
  firstName: 'The client\'s legal first name  -  exactly as it appears on their ID or passport.',
  lastName: 'The client\'s legal last name (surname). Double-check the spelling  -  this is used on all legal documents.',
  email: 'Their main email address. This is how Norva sends portal invitations, receipts, and case updates.',
  phone: 'The best number to reach them on. We\'ll use this for appointment reminders.',
  orgName: 'The registered name of the business or organisation. Use the official legal name.',
  address: 'Their mailing address. This goes on retainer agreements and correspondence.',
  company: 'If this person works for a company, type the company name here. Leave blank if not applicable.',
  verify: 'Take a moment to double-check everything  -  once saved, this contact will appear across your NorvaOS.',
} as const

// ---------------------------------------------------------------------------
// Input styling (consistent with SovereignInitiationModal)
// ---------------------------------------------------------------------------

const inputCls = 'w-full rounded-xl border border-gray-200 dark:border-white/[0.1] bg-gray-50 dark:bg-white/[0.04] px-4 py-3 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/25 outline-none transition-shadow focus:border-emerald-500/40 focus:shadow-[0_0_16px_rgba(16,185,129,0.1)] focus:ring-0'
const labelCls = 'mb-2 flex items-center text-xs font-medium uppercase tracking-widest text-gray-500 dark:text-white/50'

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface SovereignContactCreatorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: (contactId: string) => void
}

export function SovereignContactCreator({ open, onOpenChange, onSuccess }: SovereignContactCreatorProps) {
  const { tenant } = useTenant()
  const { appUser } = useUser()
  const createContact = useCreateContact()

  // ── Form state ──
  const [contactType, setContactType] = useState<'individual' | 'organization'>('individual')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [middleName, setMiddleName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [orgName, setOrgName] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [address1, setAddress1] = useState('')
  const [address2, setAddress2] = useState('')
  const [city, setCity] = useState('')
  const [province, setProvince] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [country, setCountry] = useState('Canada')

  // ── Conflict check state ──
  const [conflictStatus, setConflictStatus] = useState<'idle' | 'scanning' | 'clear' | 'conflict'>('idle')
  const [conflictMatches, setConflictMatches] = useState<{ id: string; first_name: string | null; last_name: string | null; email_primary: string | null }[]>([])
  const [conflictAcknowledged, setConflictAcknowledged] = useState(false)

  // Reset all state when modal opens
  const resetForm = useCallback(() => {
    setContactType('individual')
    setFirstName('')
    setLastName('')
    setMiddleName('')
    setEmail('')
    setPhone('')
    setOrgName('')
    setJobTitle('')
    setAddress1('')
    setAddress2('')
    setCity('')
    setProvince('')
    setPostalCode('')
    setCountry('Canada')
    setConflictStatus('idle')
    setConflictMatches([])
    setConflictAcknowledged(false)
  }, [])

  // ── Validation ──
  const isStep1Valid = contactType === 'individual'
    ? firstName.trim().length > 0 && lastName.trim().length > 0
    : orgName.trim().length > 0

  const isStep2Valid = true // Address is optional

  // Conflict scan runs when stepping into Verify  -  blocks save until resolved
  const runConflictScan = useCallback(async () => {
    if (!tenant?.id) return
    const searchName = contactType === 'individual' ? `${firstName.trim()} ${lastName.trim()}` : orgName.trim()
    if (!searchName.trim()) return

    setConflictStatus('scanning')
    setConflictMatches([])
    setConflictAcknowledged(false)

    try {
      const supabase = createClient()
      // Sanitise names for PostgREST .or() filter - escape special chars
      const safeFirst = firstName.trim().replace(/[%_(),.]/g, '')
      const safeLast = lastName.trim().replace(/[%_(),.]/g, '')
      const safeOrg = orgName.trim().replace(/[%_(),.]/g, '')

      const query = contactType === 'individual'
        ? supabase
            .from('contacts')
            .select('id, first_name, last_name, email_primary')
            .eq('tenant_id', tenant.id)
            .or(`first_name.ilike.%${safeFirst}%,last_name.ilike.%${safeLast}%`)
            .limit(10)
        : supabase
            .from('contacts')
            .select('id, first_name, last_name, email_primary')
            .eq('tenant_id', tenant.id)
            .ilike('organization_name', `%${safeOrg}%`)
            .limit(10)

      const { data, error } = await query
      if (error) throw error

      if (!data || data.length === 0) {
        setConflictStatus('clear')
      } else {
        setConflictStatus('conflict')
        setConflictMatches(data)
      }
    } catch {
      // If scan fails, let them proceed but warn
      setConflictStatus('clear')
    }
  }, [tenant?.id, contactType, firstName, lastName, orgName])

  const isStep3Valid = isStep1Valid && (conflictStatus === 'clear' || conflictAcknowledged)

  // ── Submit ──
  const handleSubmit = useCallback(async () => {
    if (!tenant || !appUser) return

    try {
      const result = await createContact.mutateAsync({
        tenant_id: tenant.id,
        contact_type: contactType,
        first_name: contactType === 'individual' ? firstName.trim() : undefined,
        last_name: contactType === 'individual' ? lastName.trim() : undefined,
        middle_name: middleName.trim() || undefined,
        email_primary: email.trim() || undefined,
        phone_primary: phone.trim() || undefined,
        organization_name: contactType === 'organization' ? orgName.trim() : (jobTitle ? orgName.trim() || undefined : undefined),
        job_title: jobTitle.trim() || undefined,
        address_line1: address1.trim() || undefined,
        address_line2: address2.trim() || undefined,
        city: city.trim() || undefined,
        province_state: province.trim() || undefined,
        postal_code: postalCode.trim() || undefined,
        country: country.trim() || undefined,
        client_status: 'client',
      })

      toast.success('Contact created successfully')
      resetForm()
      onOpenChange(false)
      onSuccess?.(result.id)
    } catch {
      toast.error('Failed to create contact')
    }
  }, [tenant, appUser, contactType, firstName, lastName, middleName, email, phone, orgName, jobTitle, address1, address2, city, province, postalCode, country, createContact, resetForm, onOpenChange, onSuccess])

  // ── Step definitions ──
  const steps: SovereignCreatorStep[] = [
    {
      label: 'Identity',
      isValid: isStep1Valid,
      content: (
        <div className="flex flex-col gap-5 pt-2">
          {/* Contact type selector */}
          <div>
            <label className={labelCls}>
              Contact Type
              <NorvaGuardianTooltip fieldKey="contact" text={CONTACT_HELP.contactType} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: 'individual' as const, label: 'Individual', icon: User },
                { value: 'organization' as const, label: 'Organisation', icon: Building2 },
              ]).map(({ value, label, icon: Icon }) => (
                <motion.button
                  key={value}
                  type="button"
                  whileHover={{ scale: 1.03, y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                  onClick={() => setContactType(value)}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border px-4 py-3.5 transition-all',
                    contactType === value
                      ? 'border-emerald-500/50 bg-emerald-500/10 shadow-[0_0_16px_rgba(16,185,129,0.2)]'
                      : 'border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] hover:border-gray-300 dark:hover:border-white/[0.12]',
                  )}
                >
                  <Icon className={cn('h-4 w-4', contactType === value ? 'text-emerald-500' : 'text-gray-400 dark:text-white/40')} />
                  <span className={cn('text-sm font-medium', contactType === value ? 'text-emerald-600 dark:text-emerald-300' : 'text-gray-600 dark:text-white/60')}>
                    {label}
                  </span>
                  {contactType === value && <Check className="ml-auto h-4 w-4 text-emerald-500" />}
                </motion.button>
              ))}
            </div>
          </div>

          {contactType === 'individual' ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>
                    First Name
                    <NorvaGuardianTooltip fieldKey="contact" text={CONTACT_HELP.firstName} />
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Enter their legal first name"
                    className={inputCls}
                    autoFocus
                  />
                </div>
                <div>
                  <label className={labelCls}>
                    Last Name
                    <NorvaGuardianTooltip fieldKey="contact" text={CONTACT_HELP.lastName} />
                  </label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Enter their legal last name"
                    className={inputCls}
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>Middle Name (optional)</label>
                <input
                  type="text"
                  value={middleName}
                  onChange={(e) => setMiddleName(e.target.value)}
                  placeholder="If applicable"
                  className={inputCls}
                />
              </div>
            </>
          ) : (
            <div>
              <label className={labelCls}>
                Organisation Name
                <NorvaGuardianTooltip fieldKey="contact" text={CONTACT_HELP.orgName} />
              </label>
              <input
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="Enter the official registered name"
                className={inputCls}
                autoFocus
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>
                <Mail className="mr-1.5 h-3 w-3 text-emerald-500/60" />
                Email
                <NorvaGuardianTooltip fieldKey="contact" text={CONTACT_HELP.email} />
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>
                <Phone className="mr-1.5 h-3 w-3 text-emerald-500/60" />
                Phone
                <NorvaGuardianTooltip fieldKey="contact" text={CONTACT_HELP.phone} />
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (416) 555-0100"
                className={inputCls}
              />
            </div>
          </div>
        </div>
      ),
    },
    {
      label: 'Details',
      isValid: isStep2Valid,
      content: (
        <div className="flex flex-col gap-5 pt-2">
          {contactType === 'individual' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>
                  Company
                  <NorvaGuardianTooltip fieldKey="contact" text={CONTACT_HELP.company} />
                </label>
                <input
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="If they work for a company"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Job Title</label>
                <input
                  type="text"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="e.g. Office Manager"
                  className={inputCls}
                />
              </div>
            </div>
          )}

          <div>
            <label className={labelCls}>
              <MapPin className="mr-1.5 h-3 w-3 text-emerald-500/60" />
              Address
              <NorvaGuardianTooltip fieldKey="contact" text={CONTACT_HELP.address} />
            </label>
            <input
              type="text"
              value={address1}
              onChange={(e) => setAddress1(e.target.value)}
              placeholder="Street address"
              className={cn(inputCls, 'mb-2')}
            />
            <input
              type="text"
              value={address2}
              onChange={(e) => setAddress2(e.target.value)}
              placeholder="Apartment, suite, unit (optional)"
              className={inputCls}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>City</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Toronto"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Province</label>
              <input
                type="text"
                value={province}
                onChange={(e) => setProvince(e.target.value)}
                placeholder="Ontario"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Postal Code</label>
              <input
                type="text"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                placeholder="M5V 1A1"
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>
              <Globe className="mr-1.5 h-3 w-3 text-emerald-500/60" />
              Country
            </label>
            <input
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>
      ),
    },
    {
      label: 'Verify',
      isValid: isStep3Valid,
      content: (
        <VerifyStepContent
          conflictStatus={conflictStatus}
          conflictMatches={conflictMatches}
          conflictAcknowledged={conflictAcknowledged}
          setConflictAcknowledged={setConflictAcknowledged}
          contactType={contactType}
          firstName={firstName}
          middleName={middleName}
          lastName={lastName}
          orgName={orgName}
          email={email}
          phone={phone}
          address1={address1}
          address2={address2}
          city={city}
          province={province}
          postalCode={postalCode}
          verifyText={CONTACT_HELP.verify}
          runConflictScan={runConflictScan}
        />
      ),
    },
  ]

  return (
    <SovereignCreator
      open={open}
      onOpenChange={(v) => {
        if (!v) resetForm()
        onOpenChange(v)
      }}
      title="Norva Contact Creator"
      subtitle="Add a new person or organisation to your NorvaOS"
      steps={steps}
      onSubmit={handleSubmit}
      isSubmitting={createContact.isPending}
      submitLabel="Save Contact"
      submittingLabel="Saving..."
    />
  )
}

// ---------------------------------------------------------------------------
// Verify step  -  extracted so it can trigger conflict scan on mount
// ---------------------------------------------------------------------------

function VerifyStepContent({
  conflictStatus,
  conflictMatches,
  conflictAcknowledged,
  setConflictAcknowledged,
  contactType,
  firstName,
  middleName,
  lastName,
  orgName,
  email,
  phone,
  address1,
  address2,
  city,
  province,
  postalCode,
  verifyText,
  runConflictScan,
}: {
  conflictStatus: 'idle' | 'scanning' | 'clear' | 'conflict'
  conflictMatches: { id: string; first_name: string | null; last_name: string | null; email_primary: string | null }[]
  conflictAcknowledged: boolean
  setConflictAcknowledged: (v: boolean) => void
  contactType: string
  firstName: string
  middleName: string
  lastName: string
  orgName: string
  email: string
  phone: string
  address1: string
  address2: string
  city: string
  province: string
  postalCode: string
  verifyText: string
  runConflictScan: () => void
}) {
  // Auto-trigger conflict scan when this step renders
  useEffect(() => {
    if (conflictStatus === 'idle') {
      runConflictScan()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex flex-col gap-5 pt-2">
      {/* Conflict check banner */}
      {conflictStatus === 'scanning' && (
        <div className="flex items-center gap-3 rounded-2xl border border-blue-500/30 bg-blue-500/5 p-4">
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-blue-500" />
          <div>
            <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Checking for conflicts...</p>
            <p className="mt-1 text-xs text-blue-600/80 dark:text-blue-400/70">
              Scanning existing contacts to make sure this isn&apos;t a duplicate.
            </p>
          </div>
        </div>
      )}

      {conflictStatus === 'clear' && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-500" />
          <div>
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">No conflicts found</p>
            <p className="mt-1 text-xs text-emerald-600/80 dark:text-emerald-400/70">
              {verifyText}
            </p>
          </div>
        </div>
      )}

      {conflictStatus === 'conflict' && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div>
              <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                Possible duplicate{conflictMatches.length > 1 ? 's' : ''} found
              </p>
              <p className="mt-1 text-xs text-amber-600/80 dark:text-amber-400/70">
                We found {conflictMatches.length} existing contact{conflictMatches.length > 1 ? 's' : ''} with a similar name. Please review before saving.
              </p>
            </div>
          </div>

          <div className="ml-8 space-y-1.5">
            {conflictMatches.map((m) => (
              <div key={m.id} className="flex items-center gap-2 rounded-lg bg-amber-100/50 dark:bg-amber-500/10 px-3 py-2 text-xs">
                <span className="font-medium text-amber-800 dark:text-amber-200">
                  {m.first_name} {m.last_name}
                </span>
                {m.email_primary && (
                  <span className="text-amber-600/70 dark:text-amber-400/60">({m.email_primary})</span>
                )}
              </div>
            ))}
          </div>

          <label className="ml-8 flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={conflictAcknowledged}
              onChange={(e) => setConflictAcknowledged(e.target.checked)}
              className="h-4 w-4 rounded border-amber-400 text-emerald-500 focus:ring-emerald-500"
            />
            <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
              I confirm this is a different person  -  not a duplicate
            </span>
          </label>
        </div>
      )}

      {conflictStatus === 'idle' && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <p className="text-sm font-medium text-amber-700 dark:text-amber-300">Please verify before saving</p>
            <p className="mt-1 text-xs text-amber-600/80 dark:text-amber-400/70">
              {verifyText}
            </p>
          </div>
        </div>
      )}

      {/* Contact Summary */}
      <div className="rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02] p-5">
        <h4 className="mb-3 text-[10px] font-medium uppercase tracking-widest text-gray-400 dark:text-white/40">
          Contact Summary
        </h4>
        <div className="grid grid-cols-2 gap-y-2.5 gap-x-6 text-xs">
          <div className="text-gray-400 dark:text-white/40">Type</div>
          <div className="font-medium text-gray-700 dark:text-white/80 capitalize">{contactType}</div>

          {contactType === 'individual' ? (
            <>
              <div className="text-gray-400 dark:text-white/40">Name</div>
              <div className="font-medium text-gray-700 dark:text-white/80">
                {[firstName, middleName, lastName].filter(Boolean).join(' ') || 'Not entered'}
              </div>
            </>
          ) : (
            <>
              <div className="text-gray-400 dark:text-white/40">Organisation</div>
              <div className="font-medium text-gray-700 dark:text-white/80">{orgName || 'Not entered'}</div>
            </>
          )}

          <div className="text-gray-400 dark:text-white/40">Email</div>
          <div className="font-medium text-gray-700 dark:text-white/80">{email || 'Not provided'}</div>

          <div className="text-gray-400 dark:text-white/40">Phone</div>
          <div className="font-medium text-gray-700 dark:text-white/80">{phone || 'Not provided'}</div>

          {address1 && (
            <>
              <div className="text-gray-400 dark:text-white/40">Address</div>
              <div className="font-medium text-gray-700 dark:text-white/80">
                {[address1, address2].filter(Boolean).join(', ')}
                {city && `, ${city}`}
                {province && `, ${province}`}
                {postalCode && ` ${postalCode}`}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
