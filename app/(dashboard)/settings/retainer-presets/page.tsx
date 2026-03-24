'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Briefcase,
  Landmark,
  Receipt,
  Plus,
  Pencil,
  Trash2,
  DollarSign,
  RotateCcw,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import {
  useRetainerPresets,
  useCreateRetainerPreset,
  useUpdateRetainerPreset,
  useDeleteRetainerPreset,
  type RetainerPreset,
  type RetainerPresetCategory,
} from '@/lib/queries/retainer-presets'

// ─── DB category → UI category mapping ──────────────────────────────
const DB_CATEGORIES: Record<string, RetainerPresetCategory> = {
  services: 'professional_services',
  govFees: 'government_fees',
  disbursements: 'disbursements',
}

type UICategory = 'services' | 'govFees' | 'disbursements'

// ─── Component ──────────────────────────────────────────────────────

export default function RetainerPresetsPage() {
  const { tenant } = useTenant()
  const { appUser } = useUser()
  const tenantId = tenant?.id ?? ''
  const userId = appUser?.id ?? ''

  // Fetch presets from DB by category
  const { data: services, isLoading: servicesLoading } = useRetainerPresets(tenantId, 'professional_services')
  const { data: govFees, isLoading: govFeesLoading } = useRetainerPresets(tenantId, 'government_fees')
  const { data: disbursements, isLoading: disbursementsLoading } = useRetainerPresets(tenantId, 'disbursements')

  // Mutations
  const createPreset = useCreateRetainerPreset()
  const updatePreset = useUpdateRetainerPreset()
  const deletePreset = useDeleteRetainerPreset()

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogCategory, setDialogCategory] = useState<UICategory>('services')
  const [editingItem, setEditingItem] = useState<RetainerPreset | null>(null)
  const [formName, setFormName] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formAmount, setFormAmount] = useState('')
  const [loadingDefaults, setLoadingDefaults] = useState(false)

  // ── Helpers ─────────────────────────────────────────────
  const getList = (cat: UICategory) => {
    if (cat === 'services') return services ?? []
    if (cat === 'govFees') return govFees ?? []
    return disbursements ?? []
  }

  const openAdd = (category: UICategory) => {
    setDialogCategory(category)
    setEditingItem(null)
    setFormName('')
    setFormDesc('')
    setFormAmount('')
    setDialogOpen(true)
  }

  const openEdit = (category: UICategory, item: RetainerPreset) => {
    setDialogCategory(category)
    setEditingItem(item)
    setFormName(item.name)
    setFormDesc(item.description ?? '')
    // Convert cents to dollars for display
    setFormAmount((item.amount / 100).toFixed(2))
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!formName.trim()) {
      toast.error('Name is required')
      return
    }
    const dollars = parseFloat(formAmount) || 0
    const cents = Math.round(dollars * 100)
    const dbCategory = DB_CATEGORIES[dialogCategory]

    try {
      if (editingItem) {
        await updatePreset.mutateAsync({
          id: editingItem.id,
          tenant_id: tenantId,
          user_id: userId,
          name: formName.trim(),
          description: formDesc.trim() || null,
          amount: cents,
        })
      } else {
        await createPreset.mutateAsync({
          tenant_id: tenantId,
          user_id: userId,
          category: dbCategory,
          name: formName.trim(),
          description: formDesc.trim() || undefined,
          amount: cents,
        })
      }
      setDialogOpen(false)
    } catch {
      // Error handled by mutation hooks
    }
  }

  const handleDelete = async (category: UICategory, preset: RetainerPreset) => {
    try {
      await deletePreset.mutateAsync({
        id: preset.id,
        tenant_id: tenantId,
        user_id: userId,
        name: preset.name,
      })
    } catch {
      // Error handled by mutation hooks
    }
  }

  const handleLoadDefaults = async () => {
    setLoadingDefaults(true)
    try {
      const res = await fetch('/api/settings/retainer-presets/seed-defaults', {
        method: 'POST',
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`Loaded ${data.count_inserted} default preset(s)`)
        // Invalidate queries will be handled by the mutation system
        window.location.reload()
      } else {
        toast.error(data.error || 'Failed to load defaults')
      }
    } catch {
      toast.error('Failed to load defaults')
    } finally {
      setLoadingDefaults(false)
    }
  }

  const categoryLabel = (cat: UICategory) => {
    if (cat === 'services') return 'Service'
    if (cat === 'govFees') return 'Government Fee'
    return 'Disbursement'
  }

  const isLoading = servicesLoading || govFeesLoading || disbursementsLoading
  const hasNoPresets = !isLoading && (services?.length ?? 0) === 0 && (govFees?.length ?? 0) === 0 && (disbursements?.length ?? 0) === 0

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Retainer Presets</h2>
          <p className="mt-1 text-sm text-slate-500">
            Manage the services, government fees, and disbursement presets that appear in the Retainer Builder.
          </p>
        </div>
        {hasNoPresets && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleLoadDefaults}
            disabled={loadingDefaults}
          >
            {loadingDefaults ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            )}
            Load Defaults
          </Button>
        )}
      </div>

      {/* ─── Professional Services ──────────────────────────── */}
      <PresetSection
        title="Professional Services"
        description="Immigration and legal service fee presets"
        icon={Briefcase}
        iconColor="text-blue-600 bg-blue-50"
        items={services ?? []}
        loading={servicesLoading}
        onAdd={() => openAdd('services')}
        onEdit={(item) => openEdit('services', item)}
        onDelete={(item) => handleDelete('services', item)}
      />

      <Separator />

      {/* ─── Government Fees ────────────────────────────────── */}
      <PresetSection
        title="Government Fees"
        description="Filing fees, biometrics, and other government charges"
        icon={Landmark}
        iconColor="text-amber-600 bg-amber-50"
        items={govFees ?? []}
        loading={govFeesLoading}
        onAdd={() => openAdd('govFees')}
        onEdit={(item) => openEdit('govFees', item)}
        onDelete={(item) => handleDelete('govFees', item)}
      />

      <Separator />

      {/* ─── Disbursements ──────────────────────────────────── */}
      <PresetSection
        title="Disbursements"
        description="Courier, translation, and other third-party costs"
        icon={Receipt}
        iconColor="text-purple-600 bg-purple-50"
        items={disbursements ?? []}
        loading={disbursementsLoading}
        onAdd={() => openAdd('disbursements')}
        onEdit={(item) => openEdit('disbursements', item)}
        onDelete={(item) => handleDelete('disbursements', item)}
      />

      {/* ─── Add / Edit Dialog ──────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? 'Edit' : 'Add'} {categoryLabel(dialogCategory)}
            </DialogTitle>
            <DialogDescription>
              {editingItem
                ? 'Update the name, description, and default amount.'
                : `Add a new ${categoryLabel(dialogCategory).toLowerCase()} preset.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Work Permit Application"
                autoFocus
              />
              <p className="text-[11px] text-slate-400">Short label shown in the retainer builder and invoices</p>
            </div>
            <div className="space-y-1.5">
              <Label>Description <span className="text-slate-400 font-normal">(optional)</span></Label>
              <Textarea
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                placeholder="e.g. Includes preparation, submission, and follow-up with IRCC..."
                rows={2}
                className="resize-none"
              />
              <p className="text-[11px] text-slate-400">Detailed explanation shown as secondary text</p>
            </div>
            <div className="space-y-1.5">
              <Label>Default Amount ($)</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  type="number"
                  step="0.01"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  placeholder="0.00"
                  className="pl-9"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={createPreset.isPending || updatePreset.isPending}
            >
              {(createPreset.isPending || updatePreset.isPending) && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              {editingItem ? 'Save Changes' : 'Add Preset'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Preset Section Sub-Component ───────────────────────────────────

function PresetSection({
  title,
  description,
  icon: Icon,
  iconColor,
  items,
  loading,
  onAdd,
  onEdit,
  onDelete,
}: {
  title: string
  description: string
  icon: React.ElementType
  iconColor: string
  items: RetainerPreset[]
  loading?: boolean
  onAdd: () => void
  onEdit: (item: RetainerPreset) => void
  onDelete: (item: RetainerPreset) => void
}) {
  // Format cents to dollars display
  const fmtDollars = (cents: number) =>
    new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(cents / 100)

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-start gap-3">
          <div className={`rounded-lg p-2 ${iconColor}`}>
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{description}</p>
          </div>
        </div>
        <Button size="sm" onClick={onAdd}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
          <p className="text-sm text-slate-500">No presets yet</p>
          <Button size="sm" className="mt-2" variant="outline" onClick={onAdd}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add First Preset
          </Button>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between px-4 py-2.5">
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-sm text-slate-700 truncate">{item.name}</span>
                {item.description && (
                  <span className="text-[11px] text-slate-400 leading-tight truncate">{item.description}</span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-3">
                <Badge variant="secondary" className="text-xs font-medium">
                  {fmtDollars(item.amount)}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-slate-400 hover:text-slate-600"
                  onClick={() => onEdit(item)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-slate-400 hover:text-red-500"
                  onClick={() => onDelete(item)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
