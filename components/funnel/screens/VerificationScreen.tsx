'use client'

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * VerificationScreen  -  Step 1: Eligibility & Setup (Master Control)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Three sections:
 *   A. Case Identification   -  UCI, passport, citizenship, residence
 *   B. Legal Stream          -  processing stream, target date, province
 *   C. Eligibility Gatekeep  -  boolean questions that drive form/doc lists
 *
 * "Confirm Eligibility" locks the data and advances to Workspace.
 * Once confirmed, fields are read-only unless the lawyer resets eligibility.
 */

import { useState, useMemo, useCallback, useEffect } from 'react'
import {
  CheckCircle2,
  ChevronsUpDown,
  Check,
  Lock,
  AlertTriangle,
  Shield,
  FileText,
  Users,
  MapPin,
  Plane,
  Scale,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { DatePicker } from '@/components/ui/date-picker'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'
import { FULL_COUNTRY_LIST, PROGRAM_CATEGORIES } from '@/lib/utils/constants'
import {
  useMatterImmigration,
  useUpdateMatterImmigration,
  useCreateMatterImmigration,
  usePopulateChecklist,
  useCreateChecklistItem,
} from '@/lib/queries/immigration'
import {
  useImmigrationReadiness,
  useVerifyEligibility,
} from '@/lib/queries/immigration-readiness'
import { useMatterIntake } from '@/lib/queries/matter-intake'
import { useUser } from '@/lib/hooks/use-user'
import { useFunnelContext } from '../FunnelContext'
import { toast } from 'sonner'

// ── Canadian Provinces/Territories ──────────────────────────────────────────

const PROVINCES = [
  { value: 'AB', label: 'Alberta' },
  { value: 'BC', label: 'British Columbia' },
  { value: 'MB', label: 'Manitoba' },
  { value: 'NB', label: 'New Brunswick' },
  { value: 'NL', label: 'Newfoundland and Labrador' },
  { value: 'NS', label: 'Nova Scotia' },
  { value: 'NT', label: 'Northwest Territories' },
  { value: 'NU', label: 'Nunavut' },
  { value: 'ON', label: 'Ontario' },
  { value: 'PE', label: 'Prince Edward Island' },
  { value: 'QC', label: 'Quebec' },
  { value: 'SK', label: 'Saskatchewan' },
  { value: 'YT', label: 'Yukon' },
] as const

// ── Types ───────────────────────────────────────────────────────────────────

interface EligibilityForm {
  // Section A: Case Identification
  uci_number: string
  passport_number: string
  country_of_citizenship: string
  country_of_residence: string
  // Section B: Legal Stream
  program_category: string
  target_entry_date: string
  intended_destination: string
  // Section C: Eligibility Booleans
  has_representative: boolean
  spouse_included: boolean
  current_valid_status: boolean // derived: in Canada + valid status
}

// ── Searchable Country Combobox ─────────────────────────────────────────────

function CountryCombobox({
  value,
  onChange,
  placeholder = 'Select country...',
  disabled = false,
}: {
  value: string
  onChange: (val: string) => void
  placeholder?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const label = FULL_COUNTRY_LIST.find((c) => c.value === value)?.label

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal h-9 text-sm"
        >
          {label ?? (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search country..." />
          <CommandList>
            <CommandEmpty>No country found.</CommandEmpty>
            <CommandGroup>
              {FULL_COUNTRY_LIST.map((c) => (
                <CommandItem
                  key={c.value}
                  value={`${c.label} ${c.value}`}
                  onSelect={() => {
                    onChange(c.value)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-3.5 w-3.5',
                      value === c.value ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  {c.label}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {c.value}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// ── Section Header ──────────────────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Shield
  title: string
  description: string
}) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="h-4.5 w-4.5 text-primary" />
      </div>
      <div>
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

// ── Boolean Gate Row ────────────────────────────────────────────────────────

function GateRow({
  label,
  description,
  consequence,
  checked,
  onChange,
  disabled,
}: {
  label: string
  description: string
  consequence: string
  checked: boolean
  onChange: (val: boolean) => void
  disabled: boolean
}) {
  return (
    <div className="flex items-start gap-4 rounded-lg border bg-card px-4 py-3">
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        className="mt-0.5"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        {checked && (
          <p className="text-xs text-primary mt-1 flex items-center gap-1">
            <FileText className="h-3 w-3" /> {consequence}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function VerificationScreen() {
  const { matterId, tenantId, advance, forceAdvanceTo } = useFunnelContext()
  const { appUser } = useUser()
  const { data: readinessData, isLoading: readinessLoading } =
    useImmigrationReadiness(matterId)
  const { data: immData, isLoading: immLoading } =
    useMatterImmigration(matterId)
  const { data: intakeData } = useMatterIntake(matterId)
  const verifyEligibility = useVerifyEligibility()
  const updateImmigration = useUpdateMatterImmigration()
  const createImmigration = useCreateMatterImmigration()
  const populateChecklist = usePopulateChecklist()
  const createChecklistItem = useCreateChecklistItem()

  const userId = appUser?.id ?? ''
  const eligibility = readinessData?.eligibility
  const isLocked = eligibility?.outcome === 'pass'

  // ── Local form state (initialised from DB) ─────────────────────────────

  const [form, setForm] = useState<EligibilityForm>({
    uci_number: '',
    passport_number: '',
    country_of_citizenship: '',
    country_of_residence: '',
    program_category: '',
    target_entry_date: '',
    intended_destination: '',
    has_representative: false,
    spouse_included: false,
    current_valid_status: false,
  })

  const [hasHydrated, setHasHydrated] = useState(false)

  // Hydrate from DB once loaded
  useEffect(() => {
    if (hasHydrated || immLoading) return
    if (immData) {
      setForm({
        uci_number: immData.uci_number ?? '',
        passport_number: immData.passport_number ?? '',
        country_of_citizenship: immData.country_of_citizenship ?? '',
        country_of_residence: immData.country_of_residence ?? '',
        program_category: immData.program_category ?? '',
        target_entry_date: immData.target_entry_date ?? '',
        intended_destination: immData.intended_destination ?? '',
        has_representative: immData.has_representative ?? false,
        spouse_included: immData.spouse_included ?? false,
        current_valid_status:
          (immData.country_of_residence === 'CA' ||
            immData.country_of_residence === 'canada') &&
          !!immData.current_visa_status &&
          immData.current_visa_status !== 'none',
      })
      setHasHydrated(true)
    } else if (!immLoading) {
      // No immigration record yet  -  use intake program_category if available
      setForm((prev) => ({
        ...prev,
        program_category: intakeData?.program_category ?? '',
      }))
      setHasHydrated(true)
    }
  }, [immData, immLoading, intakeData, hasHydrated])

  // ── Derived logic ──────────────────────────────────────────────────────

  const isInland = useMemo(() => {
    return (
      form.country_of_citizenship !== 'CA' &&
      form.country_of_residence === 'CA'
    )
  }, [form.country_of_citizenship, form.country_of_residence])

  const isQuebec = form.intended_destination === 'QC'
  const isSpousal = form.program_category === 'spousal'

  const streamLabel = PROGRAM_CATEGORIES.find(
    (c) => c.value === form.program_category,
  )?.label

  // Validation  -  passport is mandatory, program_category is mandatory
  const validationErrors = useMemo(() => {
    const errors: string[] = []
    if (!form.passport_number.trim()) errors.push('Passport number is required')
    if (!form.program_category) errors.push('Processing stream is required')
    return errors
  }, [form.passport_number, form.program_category])

  const canConfirm = validationErrors.length === 0

  // ── Field update helper ────────────────────────────────────────────────

  const setField = useCallback(
    <K extends keyof EligibilityForm>(key: K, value: EligibilityForm[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }))
    },
    [],
  )

  // ── Save & Confirm ─────────────────────────────────────────────────────

  const [confirming, setConfirming] = useState(false)

  const handleConfirmEligibility = useCallback(async () => {
    if (!canConfirm) return
    setConfirming(true)

    try {
      const payload = {
        uci_number: form.uci_number || null,
        passport_number: form.passport_number,
        country_of_citizenship: form.country_of_citizenship || null,
        country_of_residence: form.country_of_residence || null,
        program_category: form.program_category || null,
        target_entry_date: form.target_entry_date || null,
        intended_destination: form.intended_destination || null,
        has_representative: form.has_representative,
        spouse_included: form.spouse_included,
      }

      // 1. Upsert matter_immigration
      if (immData) {
        await updateImmigration.mutateAsync({
          matterId,
          ...payload,
        })
      } else {
        await createImmigration.mutateAsync({
          matter_id: matterId,
          tenant_id: tenantId,
          ...payload,
        })
      }

      // 2. Auto-populate document checklist from requirement_templates
      if (form.program_category) {
        const inserted = await populateChecklist.mutateAsync({
          matterId,
          tenantId,
          programCategory: form.program_category,
        })

        // 3. Quebec CAQ  -  manually inject if destination is Quebec
        if (form.intended_destination === 'QC') {
          try {
            await createChecklistItem.mutateAsync({
              matter_id: matterId,
              tenant_id: tenantId,
              document_name: 'CAQ (Certificat d\'acceptation du Québec)',
              description:
                'A Quebec Acceptance Certificate is required for study or work in Quebec. Apply through the Ministère de l\'Immigration, de la Francisation et de l\'Intégration (MIFI).',
              category: 'provincial',
              is_required: true,
              sort_order: 0,
              status: 'missing',
            })
          } catch {
            // Ignore duplicate  -  may already exist from a previous confirmation
          }
        }

        // 4. IMM 5476 (Use of Representative) if has_representative
        if (form.has_representative) {
          try {
            await createChecklistItem.mutateAsync({
              matter_id: matterId,
              tenant_id: tenantId,
              document_name: 'IMM 5476  -  Use of a Representative',
              description:
                'This form authorises a representative (consultant or lawyer) to act on the client\'s behalf with IRCC.',
              category: 'forms',
              is_required: true,
              sort_order: 99,
              status: 'missing',
            })
          } catch {
            // Ignore duplicate
          }
        }

        // 5. IMM 5645 (Family Information) if spouse/co-signer
        if (form.spouse_included) {
          try {
            await createChecklistItem.mutateAsync({
              matter_id: matterId,
              tenant_id: tenantId,
              document_name: 'IMM 5645  -  Family Information',
              description:
                'Required when a spouse, common-law partner, or co-signer accompanies the application. Captures family member details.',
              category: 'forms',
              is_required: true,
              sort_order: 98,
              status: 'missing',
            })
          } catch {
            // Ignore duplicate
          }
        }

        if (inserted > 0) {
          toast.info(`${inserted} document requirement(s) added to checklist`)
        }
      }

      // 6. Mark eligibility as pass → unlock workspace
      verifyEligibility.mutate(
        { matterId, outcome: 'pass', userId },
        {
          onSuccess: () => {
            toast.success('Eligibility confirmed  -  workspace unlocked')
            forceAdvanceTo('workspace')
          },
        },
      )
    } catch {
      toast.error('Failed to save eligibility data')
    } finally {
      setConfirming(false)
    }
  }, [
    canConfirm,
    form,
    immData,
    matterId,
    tenantId,
    userId,
    updateImmigration,
    createImmigration,
    populateChecklist,
    createChecklistItem,
    verifyEligibility,
    forceAdvanceTo,
  ])

  // ── Reset eligibility (unlock fields) ──────────────────────────────────

  const handleReset = useCallback(() => {
    verifyEligibility.mutate(
      { matterId, outcome: 'fail', userId },
      {
        onSuccess: () => {
          toast.info('Eligibility reset  -  you may edit the fields again')
        },
      },
    )
  }, [matterId, userId, verifyEligibility])

  // ── Loading state ──────────────────────────────────────────────────────

  if (readinessLoading || immLoading) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Skeleton className="mb-2 h-9 w-72" />
        <Skeleton className="mb-8 h-5 w-96" />
        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  // ── Already confirmed: show summary + option to reset ──────────────────

  if (isLocked) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Eligibility & Setup
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Case configuration is locked. The workspace is ready.
            </p>
          </div>
          <Badge
            variant="outline"
            className="border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300 gap-1.5"
          >
            <Lock className="h-3 w-3" />
            Confirmed
          </Badge>
        </div>

        {/* Summary cards */}
        <div className="grid gap-4 sm:grid-cols-2">
          <SummaryCard label="Passport" value={form.passport_number || ' - '} />
          <SummaryCard label="UCI Number" value={form.uci_number || 'Not provided'} />
          <SummaryCard
            label="Citizenship"
            value={
              FULL_COUNTRY_LIST.find(
                (c) => c.value === form.country_of_citizenship,
              )?.label ?? ' - '
            }
          />
          <SummaryCard
            label="Residence"
            value={
              FULL_COUNTRY_LIST.find(
                (c) => c.value === form.country_of_residence,
              )?.label ?? ' - '
            }
          />
          <SummaryCard label="Stream" value={streamLabel ?? ' - '} />
          <SummaryCard
            label="Destination"
            value={
              PROVINCES.find((p) => p.value === form.intended_destination)
                ?.label ?? ' - '
            }
          />
          {form.target_entry_date && (
            <SummaryCard label="Target Entry" value={form.target_entry_date} />
          )}
          <SummaryCard
            label="Workflow"
            value={isInland ? 'In-Land' : 'Out-of-Land'}
          />
        </div>

        {/* Eligibility flags */}
        <div className="mt-4 flex flex-wrap gap-2">
          {form.has_representative && (
            <Badge variant="secondary">Has Representative (IMM 5476)</Badge>
          )}
          {form.spouse_included && (
            <Badge variant="secondary">
              Spouse/Co-signer (IMM 5645)
            </Badge>
          )}
          {isQuebec && (
            <Badge variant="secondary" className="border-amber-300 bg-amber-50 text-amber-700">
              Quebec  -  CAQ Required
            </Badge>
          )}
        </div>

        <div className="mt-8 flex gap-3">
          <Button
            onClick={() => advance()}
            className="bg-green-600 text-white hover:bg-green-700"
          >
            Continue to Workspace &rarr;
          </Button>
          <Button
            variant="ghost"
            className="text-muted-foreground"
            onClick={handleReset}
            disabled={verifyEligibility.isPending}
          >
            Reset Eligibility
          </Button>
        </div>
      </div>
    )
  }

  // ── Main form: not yet confirmed ───────────────────────────────────────

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-bold tracking-tight">
        Eligibility & Setup
      </h1>
      <p className="text-sm text-muted-foreground mt-1 mb-8">
        Define the case parameters below. Once confirmed, the system will
        configure the document checklist and IRCC forms for the workspace.
      </p>

      {/* ═══ SECTION A: Case Identification ═══════════════════════════════ */}
      <section className="mb-10">
        <SectionHeader
          icon={Shield}
          title="A. Case Identification"
          description="Client anchors for IRCC processing."
        />

        <div className="grid gap-4 sm:grid-cols-2">
          {/* UCI Number */}
          <div className="space-y-1.5">
            <Label htmlFor="uci">UCI Number</Label>
            <Input
              id="uci"
              placeholder="e.g. 1234-5678"
              value={form.uci_number}
              onChange={(e) => setField('uci_number', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Optional  -  only if the client has applied before.
            </p>
          </div>

          {/* Passport Number */}
          <div className="space-y-1.5">
            <Label htmlFor="passport">
              Passport Number <span className="text-red-500">*</span>
            </Label>
            <Input
              id="passport"
              placeholder="e.g. AB1234567"
              value={form.passport_number}
              onChange={(e) => setField('passport_number', e.target.value)}
              className={
                !form.passport_number.trim()
                  ? 'border-amber-300 focus-visible:ring-amber-400'
                  : ''
              }
            />
          </div>

          {/* Country of Citizenship */}
          <div className="space-y-1.5">
            <Label>Country of Citizenship</Label>
            <CountryCombobox
              value={form.country_of_citizenship}
              onChange={(val) => setField('country_of_citizenship', val)}
              placeholder="Select citizenship..."
            />
          </div>

          {/* Country of Residence */}
          <div className="space-y-1.5">
            <Label>Current Country of Residence</Label>
            <CountryCombobox
              value={form.country_of_residence}
              onChange={(val) => setField('country_of_residence', val)}
              placeholder="Select residence..."
            />
          </div>
        </div>

        {/* In-Land / Out-of-Land badge */}
        {form.country_of_citizenship && form.country_of_residence && (
          <div className="mt-3">
            {isInland ? (
              <Badge
                variant="outline"
                className="border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300 gap-1"
              >
                <MapPin className="h-3 w-3" />
                In-Land Application (currently in Canada)
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-300 gap-1"
              >
                <Plane className="h-3 w-3" />
                Out-of-Land Application
              </Badge>
            )}
          </div>
        )}
      </section>

      {/* ═══ SECTION B: Legal Stream Selection ════════════════════════════ */}
      <section className="mb-10">
        <SectionHeader
          icon={Scale}
          title="B. Legal Stream Selection"
          description="This dropdown dictates the entire workflow  -  forms, documents, and questionnaire sections."
        />

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Processing Stream */}
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="stream">
              Processing Stream <span className="text-red-500">*</span>
            </Label>
            <Select
              value={form.program_category}
              onValueChange={(val) => setField('program_category', val)}
            >
              <SelectTrigger
                id="stream"
                className={cn(
                  'h-9',
                  !form.program_category &&
                    'border-amber-300 focus:ring-amber-400',
                )}
              >
                <SelectValue placeholder="Select a processing stream..." />
              </SelectTrigger>
              <SelectContent>
                {PROGRAM_CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Target Entry Date */}
          <div className="space-y-1.5">
            <Label>Target Entry Date</Label>
            <DatePicker
              value={form.target_entry_date}
              onChange={(val) => setField('target_entry_date', val)}
              placeholder="Select target date..."
              minDate={new Date()}
            />
            <p className="text-xs text-muted-foreground">
              Used to calculate urgency and portal expiry.
            </p>
          </div>

          {/* Intended Destination */}
          <div className="space-y-1.5">
            <Label>Intended Destination (Province/Territory)</Label>
            <Select
              value={form.intended_destination}
              onValueChange={(val) => setField('intended_destination', val)}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select province..." />
              </SelectTrigger>
              <SelectContent>
                {PROVINCES.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Quebec CAQ Warning */}
        {isQuebec && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/40">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-sm text-amber-800 dark:text-amber-300">
              Quebec destination selected  -  a{' '}
              <strong>Certificat d'acceptation du Québec (CAQ)</strong> will be
              added to the document requirements.
            </p>
          </div>
        )}

        {/* Spousal Sponsorship hint */}
        {isSpousal && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-4 py-3 dark:border-blue-800 dark:bg-blue-950/40">
            <Users className="h-4 w-4 shrink-0 text-blue-600" />
            <p className="text-sm text-blue-800 dark:text-blue-300">
              Spousal Sponsorship selected  -  the{' '}
              <strong>Sponsor Details</strong> section will be shown in the
              workspace questionnaire.
            </p>
          </div>
        )}
      </section>

      {/* ═══ SECTION C: Eligibility Assessment ════════════════════════════ */}
      <section className="mb-10">
        <SectionHeader
          icon={CheckCircle2}
          title="C. Eligibility Assessment"
          description="These answers determine which IRCC forms and document slots are added to the workspace."
        />

        <div className="space-y-3">
          <GateRow
            label="Does the client have a representative?"
            description="A representative (consultant or lawyer other than you) who acts on the client's behalf."
            consequence="Adds IMM 5476 (Use of a Representative) to the forms list."
            checked={form.has_representative}
            onChange={(val) => setField('has_representative', val)}
            disabled={false}
          />

          <GateRow
            label="Is there a co-signer or spouse accompanying?"
            description="A spouse, common-law partner, or co-signer is included in the application."
            consequence="Adds IMM 5645 (Family Information) and spouse data domains to the questionnaire."
            checked={form.spouse_included}
            onChange={(val) => setField('spouse_included', val)}
            disabled={false}
          />

          <GateRow
            label="Is the client currently in Canada with valid status?"
            description="The client holds a valid visa, permit, or status document that has not expired."
            consequence="Extension workflow applied  -  extension-specific forms will be used instead of initial application forms."
            checked={form.current_valid_status}
            onChange={(val) => setField('current_valid_status', val)}
            disabled={false}
          />
        </div>
      </section>

      {/* ═══ Validation Errors ════════════════════════════════════════════ */}
      {validationErrors.length > 0 && (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/40">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-1">
            Complete these before confirming:
          </p>
          <ul className="list-disc list-inside text-sm text-amber-700 dark:text-amber-400 space-y-0.5">
            {validationErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ═══ Action Buttons ═══════════════════════════════════════════════ */}
      <div className="flex items-center gap-4 border-t pt-6">
        <Button
          size="lg"
          className="bg-green-600 text-white hover:bg-green-700 gap-2"
          disabled={!canConfirm || confirming || verifyEligibility.isPending}
          onClick={handleConfirmEligibility}
        >
          {confirming || verifyEligibility.isPending ? (
            'Confirming\u2026'
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Confirm Eligibility & Proceed
            </>
          )}
        </Button>
        <p className="text-xs text-muted-foreground max-w-xs">
          Once confirmed, Step 1 fields lock and the document checklist + IRCC
          forms are configured automatically.
        </p>
      </div>
    </div>
  )
}

// ── Summary Card (for locked state) ─────────────────────────────────────────

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold mt-0.5">{value}</p>
    </div>
  )
}
