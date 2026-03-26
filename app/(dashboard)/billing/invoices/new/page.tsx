'use client'

import { useState, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useMatters } from '@/lib/queries/matters'
import { useCreateInvoice } from '@/lib/queries/invoicing'
import { useTaxProfiles } from '@/lib/queries/tax-profiles'
import { useTenant } from '@/lib/hooks/use-tenant'
import { getPlaceOfSupplyTax, type ProvinceTaxConfig } from '@/lib/config/tax-rates'
import { RequirePermission } from '@/components/require-permission'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { ArrowLeft, Plus, Trash2, Loader2 } from 'lucide-react'

// ── Schema ────────────────────────────────────────────────────────────────────

const lineItemSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  quantity: z.number().positive('Must be positive'),
  unitPrice: z.number().nonnegative('Must be non-negative'),
  lineCategory: z.enum(['professional_fees', 'disbursements', 'soft_costs', 'hard_costs']),
  isTaxable: z.boolean(),
})

const invoiceFormSchema = z.object({
  matterId: z.string().uuid('Select a matter'),
  issueDate: z.string().min(1, 'Issue date is required'),
  dueDate: z.string().min(1, 'Due date is required'),
  notes: z.string().optional(),
  lineItems: z.array(lineItemSchema).min(1, 'At least one line item is required'),
})

type InvoiceFormValues = z.infer<typeof invoiceFormSchema>

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCents(cents: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 2,
  }).format(cents / 100)
}

/**
 * Resolve the primary contact's province for a given matter.
 * Used for Place of Supply tax determination.
 */
function useClientProvince(matterId: string | null, tenantId: string) {
  return useQuery({
    queryKey: ['client-province', matterId],
    queryFn: async (): Promise<string | null> => {
      if (!matterId) return null
      const supabase = createClient()

      // Get primary contact for this matter
      const { data: mc } = await supabase
        .from('matter_contacts')
        .select('contact_id')
        .eq('matter_id', matterId)
        .eq('tenant_id', tenantId)
        .eq('is_primary', true)
        .limit(1)
        .maybeSingle()

      if (!mc?.contact_id) return null

      // Get the contact's province
      const { data: contact } = await supabase
        .from('contacts')
        .select('province_state')
        .eq('id', mc.contact_id)
        .single()

      return contact?.province_state ?? null
    },
    enabled: !!matterId && !!tenantId,
    staleTime: 1000 * 60 * 5,
  })
}

// ── Page ──────────────────────────────────────────────────────────────────────

function NewInvoiceContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const defaultMatterId = searchParams.get('matterId') ?? ''
  const { tenant } = useTenant()

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: {
      matterId: defaultMatterId,
      issueDate: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      lineItems: [
        { description: '', quantity: 1, unitPrice: 0, lineCategory: 'professional_fees', isTaxable: false },
      ],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'lineItems' })
  const lineItems = watch('lineItems')

  const { data: mattersData } = useMatters({ tenantId: tenant?.id ?? '', status: 'open', pageSize: 100 })
  const matters = mattersData?.matters ?? []
  const createInvoice = useCreateInvoice()

  // ── Place of Supply Tax Engine ──────────────────────────────────────────
  const selectedMatterId = watch('matterId') || null
  const { data: clientProvince } = useClientProvince(selectedMatterId, tenant?.id ?? '')

  const taxConfig = useMemo(
    () => getPlaceOfSupplyTax(clientProvince, tenant?.jurisdiction_code),
    [clientProvince, tenant?.jurisdiction_code],
  )

  // Calculate totals live
  const subtotalCents = lineItems.reduce((sum, li) => {
    const qty = Number(li.quantity) || 0
    const price = Math.round((Number(li.unitPrice) || 0) * 100)
    return sum + Math.round(qty * price)
  }, 0)

  // Live tax estimate based on client's province (Place of Supply)
  const taxableCents = lineItems.reduce((sum, li, idx) => {
    if (!li.isTaxable) return sum
    const qty = Number(li.quantity) || 0
    const price = Math.round((Number(li.unitPrice) || 0) * 100)
    return sum + Math.round(qty * price)
  }, 0)
  const estimatedTaxCents = Math.round(taxableCents * taxConfig.rate)
  const estimatedTotalCents = subtotalCents + estimatedTaxCents

  const onSubmit = async (values: InvoiceFormValues) => {
    await createInvoice.mutateAsync({
      tenantId: tenant!.id,
      matterId: values.matterId,
      invoiceNumber: '', // generated on finalize
      issueDate: values.issueDate,
      dueDate: values.dueDate,
      notes: values.notes,
      lineItems: values.lineItems.map((li) => ({
        description: li.description,
        quantity: li.quantity,
        unitPrice: Math.round(li.unitPrice * 100),
      })),
    })
    router.push('/billing')
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push('/billing')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <h1 className="text-2xl font-bold">New Invoice</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Invoice Basics */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Invoice Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="matterId">Matter <span className="text-destructive">*</span></Label>
              <Select
                value={watch('matterId')}
                onValueChange={(v) => setValue('matterId', v)}
              >
                <SelectTrigger id="matterId">
                  <SelectValue placeholder="Select a matter…" />
                </SelectTrigger>
                <SelectContent>
                  {matters.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.matter_number ? `${m.matter_number}  -  ` : ''}{m.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.matterId && (
                <p className="text-xs text-destructive">{errors.matterId.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="issueDate">Issue Date <span className="text-destructive">*</span></Label>
              <Input id="issueDate" type="date" {...register('issueDate')} />
              {errors.issueDate && (
                <p className="text-xs text-destructive">{errors.issueDate.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dueDate">Due Date <span className="text-destructive">*</span></Label>
              <Input id="dueDate" type="date" {...register('dueDate')} />
              {errors.dueDate && (
                <p className="text-xs text-destructive">{errors.dueDate.message}</p>
              )}
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea id="notes" {...register('notes')} rows={2} placeholder="Payment terms, instructions…" />
            </div>
          </CardContent>
        </Card>

        {/* Line Items */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Line Items</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {fields.map((field, idx) => (
              <div key={field.id} className="grid grid-cols-12 gap-2 items-start">
                <div className="col-span-12 sm:col-span-4 space-y-1">
                  {idx === 0 && <Label className="text-xs">Description</Label>}
                  <Input
                    {...register(`lineItems.${idx}.description`)}
                    placeholder="Service description…"
                  />
                  {errors.lineItems?.[idx]?.description && (
                    <p className="text-xs text-destructive">{errors.lineItems[idx]?.description?.message}</p>
                  )}
                </div>
                <div className="col-span-5 sm:col-span-3 space-y-1">
                  {idx === 0 && <Label className="text-xs">Category</Label>}
                  <Select
                    value={watch(`lineItems.${idx}.lineCategory`)}
                    onValueChange={(v) =>
                      setValue(`lineItems.${idx}.lineCategory`, v as 'professional_fees' | 'disbursements' | 'soft_costs' | 'hard_costs')
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="professional_fees">Prof. Fees</SelectItem>
                      <SelectItem value="disbursements">Disbursements</SelectItem>
                      <SelectItem value="soft_costs">Soft Costs</SelectItem>
                      <SelectItem value="hard_costs">Hard Costs</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-3 sm:col-span-2 space-y-1">
                  {idx === 0 && <Label className="text-xs">Qty</Label>}
                  <Input
                    type="number"
                    step="0.25"
                    min="0"
                    {...register(`lineItems.${idx}.quantity`, { valueAsNumber: true })}
                  />
                </div>
                <div className="col-span-4 sm:col-span-2 space-y-1">
                  {idx === 0 && <Label className="text-xs">Unit Price ($)</Label>}
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    {...register(`lineItems.${idx}.unitPrice`, { valueAsNumber: true })}
                    placeholder="0.00"
                  />
                </div>
                <div className={`col-span-12 sm:col-span-1 flex gap-2 ${idx === 0 ? 'items-end pb-0' : 'items-center'} pt-1`}>
                  {idx === 0 && <div className="h-5" />}
                  <label className="flex items-center gap-1 cursor-pointer" title="Taxable">
                    <Checkbox
                      checked={watch(`lineItems.${idx}.isTaxable`)}
                      onCheckedChange={(checked) =>
                        setValue(`lineItems.${idx}.isTaxable`, checked === true)
                      }
                    />
                    <span className="text-[10px] text-muted-foreground">Tax</span>
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-muted-foreground hover:text-destructive"
                    onClick={() => fields.length > 1 && remove(idx)}
                    disabled={fields.length === 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                append({ description: '', quantity: 1, unitPrice: 0, lineCategory: 'professional_fees', isTaxable: false })
              }
            >
              <Plus className="h-4 w-4 mr-1" /> Add Line Item
            </Button>

            {errors.lineItems?.root && (
              <p className="text-xs text-destructive">{errors.lineItems.root.message}</p>
            )}

            <Separator />
            <div className="flex justify-end">
              <div className="text-sm space-y-1.5 min-w-[240px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium">{fmtCents(subtotalCents)}</span>
                </div>
                {/* ── Place of Supply Tax Preview ─────────────────── */}
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">
                    {taxConfig.label} ({(taxConfig.rate * 100).toFixed(taxConfig.rate % 1 === 0 ? 0 : 3)}%)
                  </span>
                  <span className="font-medium">{fmtCents(estimatedTaxCents)}</span>
                </div>
                {taxConfig.isOutOfProvince && (
                  <p className="text-[10px] text-amber-600 font-medium">
                    Dynamic Tax Adjustment: {(taxConfig.rate * 100).toFixed(0)}% {taxConfig.label} Applied (Out-of-Province Client  -  {taxConfig.provinceCode})
                  </p>
                )}
                {!selectedMatterId && (
                  <p className="text-[10px] text-muted-foreground">
                    Select a matter to resolve client tax jurisdiction.
                  </p>
                )}
                <Separator />
                <div className="flex justify-between font-semibold">
                  <span>Estimated Total</span>
                  <span>{fmtCents(estimatedTotalCents)}</span>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Final tax calculated on finalisation via tax profiles.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex gap-3 justify-end">
          <Button type="button" variant="outline" onClick={() => router.push('/billing')}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting || createInvoice.isPending}>
            {(isSubmitting || createInvoice.isPending) && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            Save as Draft
          </Button>
        </div>
      </form>
    </div>
  )
}

export default function NewInvoicePage() {
  return (
    <RequirePermission entity="billing" action="view">
      <NewInvoiceContent />
    </RequirePermission>
  )
}
