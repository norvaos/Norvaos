'use client'

import { useState, useMemo } from 'react'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import { useMatterTypes } from '@/lib/queries/matter-types'
import {
  useRetainerFeeTemplates,
  useCreateRetainerFeeTemplate,
  useUpdateRetainerFeeTemplate,
  type ProfessionalFeeItem,
  type GovernmentFeeItem,
  type DisbursementItem,
} from '@/lib/queries/retainer-fee-templates'
import {
  useRetainerPresets,
  useCreateRetainerPreset,
  type RetainerPresetCategory,
} from '@/lib/queries/retainer-presets'
import { PERSON_SCOPES } from '@/lib/utils/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DollarSign,
  Plus,
  Pencil,
  Trash2,
  Star,
  Loader2,
  Briefcase,
  Landmark,
  Receipt,
  Users,
  StarOff,
  Check,
} from 'lucide-react'
import { toast } from 'sonner'
import type { Database } from '@/lib/types/database'

type RetainerFeeTemplate = Database['public']['Tables']['retainer_fee_templates']['Row']

// ─── Fee Line Item Editor ─────────────────────────────────────────────

interface FeeLineItem {
  name: string
  description: string
  amount: number
  quantity?: number
}

function FeeLineEditor({
  items,
  onChange,
  showQuantity,
  placeholder,
  presetCategory,
  tenantId,
  userId,
}: {
  items: FeeLineItem[]
  onChange: (items: FeeLineItem[]) => void
  showQuantity?: boolean
  placeholder: string
  presetCategory: RetainerPresetCategory
  tenantId: string
  userId: string
}) {
  const { data: presets } = useRetainerPresets(tenantId, presetCategory)
  const createPreset = useCreateRetainerPreset()
  const [showNewPresetForm, setShowNewPresetForm] = useState(false)
  const [newPresetDesc, setNewPresetDesc] = useState('')
  const [newPresetAmount, setNewPresetAmount] = useState('')

  const addItem = () => {
    onChange([...items, { name: '', description: '', amount: 0, ...(showQuantity ? { quantity: 1 } : {}) }])
  }

  const updateItem = (index: number, field: string, value: string | number) => {
    const updated = items.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    onChange(updated)
  }

  const removeItem = (index: number) => {
    onChange(items.filter((_, i) => i !== index))
  }

  const handlePickPreset = (presetId: string) => {
    const preset = presets?.find((p) => p.id === presetId)
    if (!preset) return
    // Add a new line item pre-filled from the preset (amount stored in cents)
    const newItem: FeeLineItem = {
      name: preset.name,
      description: preset.description ?? '',
      amount: preset.amount / 100,
      ...(showQuantity ? { quantity: 1 } : {}),
    }
    onChange([...items, newItem])
  }

  const handleCreateAndAdd = async () => {
    if (!newPresetDesc.trim()) {
      toast.error('Name is required')
      return
    }
    const dollars = parseFloat(newPresetAmount) || 0
    const cents = Math.round(dollars * 100)

    try {
      const created = await createPreset.mutateAsync({
        tenant_id: tenantId,
        user_id: userId,
        category: presetCategory,
        name: newPresetDesc.trim(),
        amount: cents,
      })
      // Add the newly created preset as a line item
      const newItem: FeeLineItem = {
        name: created.name,
        description: created.description ?? '',
        amount: created.amount / 100,
        ...(showQuantity ? { quantity: 1 } : {}),
      }
      onChange([...items, newItem])
      setNewPresetDesc('')
      setNewPresetAmount('')
      setShowNewPresetForm(false)
    } catch {
      // Error handled by mutation hook
    }
  }

  return (
    <div className="space-y-2">
      {/* Preset picker */}
      {presets && presets.length > 0 && (
        <div className="flex items-center gap-2">
          <Select onValueChange={handlePickPreset} value="">
            <SelectTrigger className="h-8 text-xs text-slate-500 flex-1">
              <SelectValue placeholder="Pick from presets..." />
            </SelectTrigger>
            <SelectContent>
              {presets.map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-sm">
                  <span className="flex items-center justify-between gap-3 w-full">
                    <span className="flex flex-col">
                      <span className="font-medium">{p.name}</span>
                      {p.description && (
                        <span className="text-[11px] text-slate-400 leading-tight">{p.description}</span>
                      )}
                    </span>
                    <span className="text-slate-400 text-xs ml-2 shrink-0">
                      ${(p.amount / 100).toFixed(2)}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Inline new preset form */}
      {showNewPresetForm ? (
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-2 space-y-2">
          <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">
            Create new preset
          </p>
          <div className="flex items-center gap-2">
            <Input
              value={newPresetDesc}
              onChange={(e) => setNewPresetDesc(e.target.value)}
              placeholder="Description"
              className="flex-1 h-7 text-xs"
              autoFocus
            />
            <div className="relative w-24">
              <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
              <Input
                type="number"
                step="0.01"
                min={0}
                value={newPresetAmount}
                onChange={(e) => setNewPresetAmount(e.target.value)}
                placeholder="0.00"
                className="pl-6 h-7 text-xs"
              />
            </div>
            <Button
              size="sm"
              className="h-7 text-xs gap-1 px-2"
              onClick={handleCreateAndAdd}
              disabled={createPreset.isPending}
            >
              {createPreset.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Check className="h-3 w-3" />
              )}
              Save & Add
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs px-2"
              onClick={() => { setShowNewPresetForm(false); setNewPresetDesc(''); setNewPresetAmount('') }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowNewPresetForm(true)}
          className="text-[11px] text-blue-600 hover:text-blue-400 hover:underline flex items-center gap-1"
        >
          <Plus className="h-3 w-3" />
          Add new fee to presets
        </button>
      )}

      {/* Existing line items (manual entry) */}
      {items.map((item, i) => (
        <div key={i} className="rounded-md border border-slate-200 bg-white p-2 space-y-1.5">
          <div className="flex items-center gap-2">
            <Input
              value={item.name}
              onChange={(e) => updateItem(i, 'name', e.target.value)}
              placeholder="Fee name (e.g. Study Permit Processing Fee)"
              className="flex-1 h-8 text-sm font-medium"
            />
            {showQuantity && (
              <Input
                type="number"
                min={1}
                value={item.quantity ?? 1}
                onChange={(e) => updateItem(i, 'quantity', parseInt(e.target.value) || 1)}
                className="w-16 h-8 text-sm text-center"
                placeholder="Qty"
              />
            )}
            <div className="relative w-28">
              <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
              <Input
                type="number"
                step="0.01"
                min={0}
                value={item.amount || ''}
                onChange={(e) => updateItem(i, 'amount', parseFloat(e.target.value) || 0)}
                className="pl-6 h-8 text-sm"
                placeholder="0.00"
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-slate-400 hover:text-red-500"
              onClick={() => removeItem(i)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Textarea
            value={item.description}
            onChange={(e) => updateItem(i, 'description', e.target.value)}
            placeholder="Description (optional)  -  detailed explanation of this fee..."
            rows={1}
            className="text-xs text-slate-600 resize-none min-h-[28px]"
          />
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addItem} className="text-xs h-7 gap-1">
        <Plus className="h-3 w-3" />
        Add Line
      </Button>
    </div>
  )
}

// ─── Page Component ───────────────────────────────────────────────────

export default function FeeTemplatesPage() {
  const { tenant } = useTenant()
  const { appUser } = useUser()
  const tenantId = tenant?.id ?? ''
  const userId = appUser?.id ?? ''

  // All matter types for filter
  const { data: matterTypes } = useMatterTypes(tenantId)
  const [filterMatterType, setFilterMatterType] = useState<string>('')
  const [filterScope, setFilterScope] = useState<string>('')

  // Fetch templates (convert "all" filter to undefined)
  const effectiveMtFilter = filterMatterType && filterMatterType !== 'all' ? filterMatterType : undefined
  const effectiveScopeFilter = filterScope && filterScope !== 'all' ? filterScope : undefined
  const { data: templates, isLoading } = useRetainerFeeTemplates(
    tenantId,
    effectiveMtFilter,
    effectiveScopeFilter
  )

  // Unfiltered fetch so we can find all siblings when toggling default
  const { data: allTemplates } = useRetainerFeeTemplates(tenantId)

  // Mutations
  const createTemplate = useCreateRetainerFeeTemplate()
  const updateTemplate = useUpdateRetainerFeeTemplate()

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<RetainerFeeTemplate | null>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formMatterTypeId, setFormMatterTypeId] = useState('')
  const [formPersonScope, setFormPersonScope] = useState<'single' | 'joint'>('single')
  const [formBillingType, setFormBillingType] = useState('flat_fee')
  const [formHstApplicable, setFormHstApplicable] = useState(false)
  const [formIsDefault, setFormIsDefault] = useState(false)
  const [formProfFees, setFormProfFees] = useState<FeeLineItem[]>([])
  const [formGovFees, setFormGovFees] = useState<FeeLineItem[]>([])
  const [formDisbursements, setFormDisbursements] = useState<FeeLineItem[]>([])

  // Totals
  const profTotal = formProfFees.reduce(
    (sum, f) => sum + f.amount * (f.quantity ?? 1),
    0
  )
  const govTotal = formGovFees.reduce((sum, f) => sum + f.amount, 0)
  const disbTotal = formDisbursements.reduce((sum, f) => sum + f.amount, 0)
  const subtotal = profTotal + govTotal + disbTotal
  const hst = formHstApplicable ? profTotal * 0.13 : 0
  const grandTotal = subtotal + hst

  // Format cents to dollars (e.g. 250000 → $2,500.00)
  const fmtDollars = (cents: number) =>
    new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(cents / 100)

  // Reset form
  const resetForm = () => {
    setFormName('')
    setFormDescription('')
    setFormMatterTypeId('')
    setFormPersonScope('single')
    setFormBillingType('flat_fee')
    setFormHstApplicable(false)
    setFormIsDefault(false)
    setFormProfFees([])
    setFormGovFees([])
    setFormDisbursements([])
    setEditingTemplate(null)
  }

  // Open create
  const openCreate = () => {
    resetForm()
    setDialogOpen(true)
  }

  // Open edit
  const openEdit = (template: RetainerFeeTemplate) => {
    setEditingTemplate(template)
    setFormName(template.name)
    setFormDescription(template.description ?? '')
    setFormMatterTypeId(template.matter_type_id)
    setFormPersonScope((template.person_scope as 'single' | 'joint') ?? 'single')
    setFormBillingType(template.billing_type ?? 'flat_fee')
    setFormHstApplicable(template.hst_applicable ?? false)
    setFormIsDefault(template.is_default ?? false)

    // Parse JSONB fee arrays  -  convert cents to dollars for the form inputs
    const pf: ProfessionalFeeItem[] = Array.isArray(template.professional_fees) ? template.professional_fees as unknown as ProfessionalFeeItem[] : []
    setFormProfFees(
      pf.map((f) => ({
        name: f.name ?? f.description,
        description: f.description ?? '',
        amount: (f.amount_cents ?? ((f.unitPrice ?? 0) * (f.quantity ?? 1))) / 100,
        quantity: f.quantity ?? 1,
      }))
    )
    const gf: GovernmentFeeItem[] = Array.isArray(template.government_fees) ? template.government_fees as unknown as GovernmentFeeItem[] : []
    setFormGovFees(gf.map((f) => ({ name: f.name ?? f.description, description: f.description ?? '', amount: (f.amount_cents ?? f.amount ?? 0) / 100 })))
    const db: DisbursementItem[] = Array.isArray(template.disbursements) ? template.disbursements as unknown as DisbursementItem[] : []
    setFormDisbursements(db.map((f) => ({ name: f.name ?? f.description, description: f.description ?? '', amount: (f.amount_cents ?? f.amount ?? 0) / 100 })))

    setDialogOpen(true)
  }

  // Handle soft-delete (set is_active = false)
  const handleDeactivate = async (template: RetainerFeeTemplate) => {
    try {
      await updateTemplate.mutateAsync({
        id: template.id,
        tenantId,
        updates: { is_active: false },
      })
    } catch {
      // Handled by mutation hook
    }
  }

  // Toggle default  -  ensure only one template per matter_type_id + person_scope is default
  const handleToggleDefault = async (template: RetainerFeeTemplate) => {
    const newDefault = !template.is_default

    try {
      if (newDefault && allTemplates) {
        // Find sibling templates with the same matter_type_id + person_scope that are currently default
        const siblingsToUndefault = allTemplates.filter(
          (t) =>
            t.id !== template.id &&
            t.matter_type_id === template.matter_type_id &&
            t.person_scope === template.person_scope &&
            t.is_default
        )

        // Un-default all siblings first
        await Promise.all(
          siblingsToUndefault.map((t) =>
            updateTemplate.mutateAsync({
              id: t.id,
              tenantId,
              updates: { is_default: false },
            })
          )
        )
      }

      // Now set the selected template
      await updateTemplate.mutateAsync({
        id: template.id,
        tenantId,
        updates: { is_default: newDefault },
      })
    } catch {
      // Handled by mutation hook
    }
  }

  // Save template
  const handleSave = async () => {
    if (!formName.trim()) {
      toast.error('Template name is required')
      return
    }
    if (!formMatterTypeId) {
      toast.error('Matter type is required')
      return
    }

    // Build JSONB arrays  -  convert dollars (form input) to cents for storage
    const professionalFees = formProfFees
      .filter((f) => f.name.trim() || f.description.trim())
      .map((f) => ({
        name: f.name?.trim() || f.description?.trim() || '',
        description: f.description?.trim() || '',
        amount_cents: Math.round((f.amount ?? 0) * 100),
      }))

    const governmentFees = formGovFees
      .filter((f) => f.name.trim() || f.description.trim())
      .map((f) => ({
        name: f.name?.trim() || f.description?.trim() || '',
        description: f.description?.trim() || '',
        amount_cents: Math.round((f.amount ?? 0) * 100),
      }))

    const disbursements = formDisbursements
      .filter((f) => f.name.trim() || f.description.trim())
      .map((f) => ({
        name: f.name?.trim() || f.description?.trim() || '',
        description: f.description?.trim() || '',
        amount_cents: Math.round((f.amount ?? 0) * 100),
      }))

    try {
      if (editingTemplate) {
        await updateTemplate.mutateAsync({
          id: editingTemplate.id,
          tenantId,
          updates: {
            name: formName.trim(),
            description: formDescription.trim() || null,
            matter_type_id: formMatterTypeId,
            person_scope: formPersonScope,
            billing_type: formBillingType,
            hst_applicable: formHstApplicable,
            is_default: formIsDefault,
            professional_fees: professionalFees as unknown as Database['public']['Tables']['retainer_fee_templates']['Update']['professional_fees'],
            government_fees: governmentFees as unknown as Database['public']['Tables']['retainer_fee_templates']['Update']['government_fees'],
            disbursements: disbursements as unknown as Database['public']['Tables']['retainer_fee_templates']['Update']['disbursements'],
          },
        })
      } else {
        await createTemplate.mutateAsync({
          tenant_id: tenantId,
          name: formName.trim(),
          description: formDescription.trim() || null,
          matter_type_id: formMatterTypeId,
          person_scope: formPersonScope,
          billing_type: formBillingType,
          hst_applicable: formHstApplicable,
          is_default: formIsDefault,
          professional_fees: professionalFees as unknown as Database['public']['Tables']['retainer_fee_templates']['Insert']['professional_fees'],
          government_fees: governmentFees as unknown as Database['public']['Tables']['retainer_fee_templates']['Insert']['government_fees'],
          disbursements: disbursements as unknown as Database['public']['Tables']['retainer_fee_templates']['Insert']['disbursements'],
        })
      }
      setDialogOpen(false)
      resetForm()
    } catch {
      // Error handled by mutation hooks
    }
  }

  // Group templates by matter type for display
  const groupedTemplates = useMemo(() => {
    if (!templates || !matterTypes) return new Map<string, { name: string; templates: RetainerFeeTemplate[] }>()
    const map = new Map<string, { name: string; templates: RetainerFeeTemplate[] }>()

    for (const t of templates) {
      const mt = matterTypes.find((m) => m.id === t.matter_type_id)
      const key = t.matter_type_id
      if (!map.has(key)) {
        map.set(key, { name: mt?.name ?? 'Unknown', templates: [] })
      }
      map.get(key)!.templates.push(t)
    }

    return map
  }, [templates, matterTypes])

  const templateCount = templates?.length ?? 0

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Fee Templates</h2>
          <p className="mt-1 text-sm text-slate-500">
            Configure default fee structures per matter type and person scope. When a lead is retained,
            the matching default template auto-populates the Retainer Builder.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" />
          New Template
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select value={filterMatterType} onValueChange={setFilterMatterType}>
          <SelectTrigger className="w-[220px] h-9 text-sm">
            <SelectValue placeholder="All Matter Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Matter Types</SelectItem>
            {matterTypes?.map((mt) => (
              <SelectItem key={mt.id} value={mt.id}>
                {mt.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterScope} onValueChange={setFilterScope}>
          <SelectTrigger className="w-[140px] h-9 text-sm">
            <SelectValue placeholder="All Scopes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Scopes</SelectItem>
            {PERSON_SCOPES.map((ps) => (
              <SelectItem key={ps.value} value={ps.value}>
                {ps.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Badge variant="secondary" className="text-xs">
          {templateCount} template{templateCount !== 1 ? 's' : ''}
        </Badge>
      </div>

      <Separator />

      {/* Template list */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : templateCount === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
          <DollarSign className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-600">No fee templates configured</p>
          <p className="text-xs text-slate-400 mt-1">
            Create a fee template to auto-populate retainer fees when a lead is retained.
          </p>
          <Button size="sm" className="mt-4" onClick={openCreate}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Create First Template
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {Array.from(groupedTemplates.entries()).map(([mtId, group]) => (
            <div key={mtId}>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">{group.name}</h3>
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                {group.templates.map((t) => {
                  const pf: ProfessionalFeeItem[] = Array.isArray(t.professional_fees) ? t.professional_fees as unknown as ProfessionalFeeItem[] : []
                  const gf: GovernmentFeeItem[] = Array.isArray(t.government_fees) ? t.government_fees as unknown as GovernmentFeeItem[] : []
                  const db: DisbursementItem[] = Array.isArray(t.disbursements) ? t.disbursements as unknown as DisbursementItem[] : []
                  // Support both amount_cents (seeded) and unitPrice*quantity (legacy)
                  const pfTotal = pf.reduce((s, f) => s + (f.amount_cents ?? ((f.unitPrice ?? 0) * (f.quantity ?? 0))), 0)
                  const gfTotal = gf.reduce((s, f) => s + (f.amount_cents ?? f.amount ?? 0), 0)
                  const dbTotal = db.reduce((s, f) => s + (f.amount_cents ?? f.amount ?? 0), 0)
                  const total = pfTotal + gfTotal + dbTotal
                  const hstAmt = t.hst_applicable ? Math.round(pfTotal * 0.13) : 0

                  return (
                    <div key={t.id} className="px-4 py-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-800 truncate">
                              {t.name}
                            </span>
                            {t.is_default && (
                              <Badge className="bg-amber-950/40 text-amber-400 border-amber-500/20 text-[10px] gap-0.5">
                                <Star className="h-2.5 w-2.5 fill-current" />
                                Default
                              </Badge>
                            )}
                            <Badge variant="outline" className="text-[10px]">
                              <Users className="h-2.5 w-2.5 mr-0.5" />
                              {t.person_scope === 'joint' ? 'Joint' : 'Single'}
                            </Badge>
                          </div>
                          {t.description && (
                            <p className="text-xs text-slate-500 mt-0.5">{t.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-3">
                          <Badge variant="secondary" className="text-xs font-semibold">
                            {fmtDollars(total + hstAmt)}
                          </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-slate-400 hover:text-amber-600"
                          onClick={() => handleToggleDefault(t)}
                          title={t.is_default ? 'Remove default' : 'Set as default'}
                        >
                          {t.is_default ? (
                            <StarOff className="h-3.5 w-3.5" />
                          ) : (
                            <Star className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-slate-400 hover:text-slate-600"
                          onClick={() => openEdit(t)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-slate-400 hover:text-red-500"
                          onClick={() => handleDeactivate(t)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                        </div>
                      </div>

                      {/* Fee line item descriptions */}
                      <div className="grid grid-cols-3 gap-3 text-xs">
                        {pf.length > 0 && (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                              <Briefcase className="h-3 w-3" />
                              Professional Fees
                            </div>
                            {pf.map((f, i) => (
                              <div key={`pf-${i}`} className="flex justify-between text-slate-600">
                                <span className="truncate mr-2">
                                  <span className="font-medium">{f.name || f.description || 'Untitled'}</span>
                                  {f.name && f.description && f.name !== f.description && (
                                    <span className="block text-[10px] text-slate-400 leading-tight truncate">{f.description}</span>
                                  )}
                                </span>
                                <span className="tabular-nums shrink-0 text-slate-800 font-medium">
                                  {fmtDollars(f.amount_cents ?? ((f.unitPrice ?? 0) * (f.quantity ?? 0)))}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        {gf.length > 0 && (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                              <Landmark className="h-3 w-3" />
                              Government Fees
                            </div>
                            {gf.map((f, i) => (
                              <div key={`gf-${i}`} className="flex justify-between text-slate-600">
                                <span className="truncate mr-2">
                                  <span className="font-medium">{f.name || f.description || 'Untitled'}</span>
                                  {f.name && f.description && f.name !== f.description && (
                                    <span className="block text-[10px] text-slate-400 leading-tight truncate">{f.description}</span>
                                  )}
                                </span>
                                <span className="tabular-nums shrink-0 text-slate-800 font-medium">
                                  {fmtDollars(f.amount_cents ?? f.amount ?? 0)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        {db.length > 0 && (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                              <Receipt className="h-3 w-3" />
                              Disbursements
                            </div>
                            {db.map((f, i) => (
                              <div key={`db-${i}`} className="flex justify-between text-slate-600">
                                <span className="truncate mr-2">
                                  <span className="font-medium">{f.name || f.description || 'Untitled'}</span>
                                  {f.name && f.description && f.name !== f.description && (
                                    <span className="block text-[10px] text-slate-400 leading-tight truncate">{f.description}</span>
                                  )}
                                </span>
                                <span className="tabular-nums shrink-0 text-slate-800 font-medium">
                                  {fmtDollars(f.amount_cents ?? f.amount ?? 0)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Totals row */}
                      <div className="flex items-center justify-between text-xs border-t border-slate-100 pt-2">
                        <span className="text-slate-500">
                          Legal: {fmtDollars(pfTotal)} · Govt: {fmtDollars(gfTotal)} · Admin: {fmtDollars(dbTotal)}
                          {t.hst_applicable ? ` · HST: ${fmtDollars(hstAmt)}` : ''}
                        </span>
                        <span className="font-semibold text-slate-800">
                          Total: {fmtDollars(total + hstAmt)}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Create / Edit Dialog ──────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); resetForm() } }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? 'Edit Fee Template' : 'New Fee Template'}
            </DialogTitle>
            <DialogDescription>
              {editingTemplate
                ? 'Update the fee structure for this template.'
                : 'Create a pre-configured fee structure for a matter type.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Basic info */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Template Name *</Label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Standard Spousal Sponsorship"
                  className="h-9 text-sm"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Matter Type *</Label>
                <Select value={formMatterTypeId} onValueChange={setFormMatterTypeId}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select matter type..." />
                  </SelectTrigger>
                  <SelectContent>
                    {matterTypes?.map((mt) => (
                      <SelectItem key={mt.id} value={mt.id}>
                        {mt.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Person Scope *</Label>
                <Select
                  value={formPersonScope}
                  onValueChange={(v) => setFormPersonScope(v as 'single' | 'joint')}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PERSON_SCOPES.map((ps) => (
                      <SelectItem key={ps.value} value={ps.value}>
                        {ps.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Billing Type</Label>
                <Select value={formBillingType} onValueChange={setFormBillingType}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="flat_fee">Flat Fee</SelectItem>
                    <SelectItem value="hourly">Hourly</SelectItem>
                    <SelectItem value="contingency">Contingency</SelectItem>
                    <SelectItem value="retainer">Retainer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-3 pb-0.5">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formHstApplicable}
                    onCheckedChange={setFormHstApplicable}
                    id="hst"
                  />
                  <Label htmlFor="hst" className="text-xs">HST (13%)</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formIsDefault}
                    onCheckedChange={setFormIsDefault}
                    id="default"
                  />
                  <Label htmlFor="default" className="text-xs">Default</Label>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Brief description of this template..."
                rows={2}
                className="text-sm"
              />
            </div>

            <Separator />

            {/* Professional Fees */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="rounded p-1 bg-blue-950/30">
                  <Briefcase className="h-3.5 w-3.5 text-blue-600" />
                </div>
                <h4 className="text-sm font-medium text-slate-700">Professional Fees</h4>
                {profTotal > 0 && (
                  <Badge variant="secondary" className="text-[10px] ml-auto">
                    {fmtDollars(profTotal)}
                  </Badge>
                )}
              </div>
              <FeeLineEditor
                items={formProfFees}
                onChange={setFormProfFees}
                showQuantity
                placeholder="e.g. Legal representation"
                presetCategory="professional_services"
                tenantId={tenantId}
                userId={userId}
              />
            </div>

            {/* Government Fees */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="rounded p-1 bg-amber-950/30">
                  <Landmark className="h-3.5 w-3.5 text-amber-600" />
                </div>
                <h4 className="text-sm font-medium text-slate-700">Government Fees</h4>
                {govTotal > 0 && (
                  <Badge variant="secondary" className="text-[10px] ml-auto">
                    {fmtDollars(govTotal)}
                  </Badge>
                )}
              </div>
              <FeeLineEditor
                items={formGovFees}
                onChange={setFormGovFees}
                placeholder="e.g. Sponsorship application fee"
                presetCategory="government_fees"
                tenantId={tenantId}
                userId={userId}
              />
            </div>

            {/* Disbursements */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="rounded p-1 bg-purple-950/30">
                  <Receipt className="h-3.5 w-3.5 text-purple-600" />
                </div>
                <h4 className="text-sm font-medium text-slate-700">Disbursements</h4>
                {disbTotal > 0 && (
                  <Badge variant="secondary" className="text-[10px] ml-auto">
                    {fmtDollars(disbTotal)}
                  </Badge>
                )}
              </div>
              <FeeLineEditor
                items={formDisbursements}
                onChange={setFormDisbursements}
                placeholder="e.g. Courier / translation"
                presetCategory="disbursements"
                tenantId={tenantId}
                userId={userId}
              />
            </div>

            <Separator />

            {/* Totals */}
            <div className="rounded-lg bg-slate-50 p-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>Professional Fees</span>
                <span>{fmtDollars(profTotal)}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>Government Fees</span>
                <span>{fmtDollars(govTotal)}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>Disbursements</span>
                <span>{fmtDollars(disbTotal)}</span>
              </div>
              {formHstApplicable && (
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>HST (13% on professional fees)</span>
                  <span>{fmtDollars(hst)}</span>
                </div>
              )}
              <Separator />
              <div className="flex items-center justify-between text-sm font-semibold text-slate-900">
                <span>Total</span>
                <span>{fmtDollars(grandTotal)}</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm() }}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={createTemplate.isPending || updateTemplate.isPending}
            >
              {(createTemplate.isPending || updateTemplate.isPending) && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              {editingTemplate ? 'Save Changes' : 'Create Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
