'use client'

import { useState, useMemo } from 'react'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useMatterTypes } from '@/lib/queries/matter-types'
import {
  useRetainerFeeTemplates,
  useCreateRetainerFeeTemplate,
  useUpdateRetainerFeeTemplate,
  type ProfessionalFeeItem,
  type GovernmentFeeItem,
  type DisbursementItem,
} from '@/lib/queries/retainer-fee-templates'
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
} from 'lucide-react'
import { toast } from 'sonner'
import type { Database } from '@/lib/types/database'

type RetainerFeeTemplate = Database['public']['Tables']['retainer_fee_templates']['Row']

// ─── Fee Line Item Editor ─────────────────────────────────────────────

interface FeeLineItem {
  description: string
  amount: number
  quantity?: number
}

function FeeLineEditor({
  items,
  onChange,
  showQuantity,
  placeholder,
}: {
  items: FeeLineItem[]
  onChange: (items: FeeLineItem[]) => void
  showQuantity?: boolean
  placeholder: string
}) {
  const addItem = () => {
    onChange([...items, { description: '', amount: 0, ...(showQuantity ? { quantity: 1 } : {}) }])
  }

  const updateItem = (index: number, field: string, value: string | number) => {
    const updated = items.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    onChange(updated)
  }

  const removeItem = (index: number) => {
    onChange(items.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={item.description}
            onChange={(e) => updateItem(i, 'description', e.target.value)}
            placeholder={placeholder}
            className="flex-1 h-8 text-sm"
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
  const tenantId = tenant?.id ?? ''

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

  const fmtDollars = (n: number) =>
    new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(n)

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

    // Parse JSONB fee arrays
    const pf: ProfessionalFeeItem[] = Array.isArray(template.professional_fees) ? template.professional_fees as unknown as ProfessionalFeeItem[] : []
    setFormProfFees(
      pf.map((f) => ({
        description: f.description,
        amount: f.unitPrice,
        quantity: f.quantity,
      }))
    )
    const gf: GovernmentFeeItem[] = Array.isArray(template.government_fees) ? template.government_fees as unknown as GovernmentFeeItem[] : []
    setFormGovFees(gf.map((f) => ({ description: f.description, amount: f.amount })))
    const db: DisbursementItem[] = Array.isArray(template.disbursements) ? template.disbursements as unknown as DisbursementItem[] : []
    setFormDisbursements(db.map((f) => ({ description: f.description, amount: f.amount })))

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

  // Toggle default
  const handleToggleDefault = async (template: RetainerFeeTemplate) => {
    try {
      await updateTemplate.mutateAsync({
        id: template.id,
        tenantId,
        updates: { is_default: !template.is_default },
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

    // Build JSONB arrays
    const professionalFees = formProfFees
      .filter((f) => f.description.trim())
      .map((f) => ({
        description: f.description.trim(),
        quantity: f.quantity ?? 1,
        unitPrice: f.amount,
      }))

    const governmentFees = formGovFees
      .filter((f) => f.description.trim())
      .map((f) => ({
        description: f.description.trim(),
        amount: f.amount,
      }))

    const disbursements = formDisbursements
      .filter((f) => f.description.trim())
      .map((f) => ({
        description: f.description.trim(),
        amount: f.amount,
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
                  const total =
                    pf.reduce((s, f) => s + (f.unitPrice ?? 0) * (f.quantity ?? 0), 0) +
                    gf.reduce((s, f) => s + (f.amount ?? 0), 0) +
                    db.reduce((s, f) => s + (f.amount ?? 0), 0)
                  const hstAmt = t.hst_applicable ? pf.reduce((s, f) => s + (f.unitPrice ?? 0) * (f.quantity ?? 0), 0) * 0.13 : 0

                  return (
                    <div key={t.id} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-800 truncate">
                              {t.name}
                            </span>
                            {t.is_default && (
                              <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px] gap-0.5">
                                <Star className="h-2.5 w-2.5 fill-current" />
                                Default
                              </Badge>
                            )}
                            <Badge variant="outline" className="text-[10px]">
                              <Users className="h-2.5 w-2.5 mr-0.5" />
                              {t.person_scope === 'joint' ? 'Joint' : 'Single'}
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {pf.length} service{pf.length !== 1 ? 's' : ''}
                            {gf.length > 0 ? ` · ${gf.length} gov fee${gf.length !== 1 ? 's' : ''}` : ''}
                            {db.length > 0 ? ` · ${db.length} disbursement${db.length !== 1 ? 's' : ''}` : ''}
                            {t.hst_applicable ? ' · +HST' : ''}
                          </p>
                        </div>
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
                <div className="rounded p-1 bg-blue-50">
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
              />
            </div>

            {/* Government Fees */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="rounded p-1 bg-amber-50">
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
              />
            </div>

            {/* Disbursements */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="rounded p-1 bg-purple-50">
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
