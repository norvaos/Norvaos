'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  Pencil,
  Power,
  PowerOff,
  Landmark,
  Building2,
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'

import { useTenant } from '@/lib/hooks/use-tenant'
import {
  useTrustAccounts,
  useCreateTrustAccount,
  trustKeys,
} from '@/lib/queries/trust-accounting'
import { RequirePermission } from '@/components/require-permission'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type {
  TrustBankAccountRow,
  OperatingBankAccountRow,
} from '@/lib/types/database'

// ─── Form schemas ────────────────────────────────────────────────────────────

const trustAccountSchema = z.object({
  accountName: z.string().min(1, 'Account name is required').max(200),
  accountType: z.enum(['general', 'specific']),
  bankName: z.string().min(1, 'Bank name is required').max(200),
  accountNumberEncrypted: z.string().min(1, 'Account number is required').max(100),
  transitNumber: z.string().max(20).optional().or(z.literal('')),
  institutionNumber: z.string().max(10).optional().or(z.literal('')),
  currency: z.enum(['CAD', 'USD']),
  jurisdictionCode: z.string().min(1),
  defaultHoldDaysCheque: z.number().int().min(0).max(365),
  defaultHoldDaysEft: z.number().int().min(0).max(365),
})

type TrustAccountFormValues = z.infer<typeof trustAccountSchema>

const operatingAccountSchema = z.object({
  accountName: z.string().min(1, 'Account name is required').max(200),
  bankName: z.string().min(1, 'Bank name is required').max(200),
  accountNumberEncrypted: z.string().min(1, 'Account number is required').max(100),
  isDefault: z.boolean(),
})

type OperatingAccountFormValues = z.infer<typeof operatingAccountSchema>

// ─── Helper: fetch via API route ─────────────────────────────────────────────

async function fetchApi<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const data = await res.json()
  if (!data.success) {
    throw new Error(data.error ?? 'An error occurred')
  }
  return data
}

// ─── Jurisdiction options ────────────────────────────────────────────────────

const JURISDICTIONS = [
  { value: 'CA-ON', label: 'Ontario' },
  { value: 'CA-BC', label: 'British Columbia' },
  { value: 'CA-AB', label: 'Alberta' },
  { value: 'CA-QC', label: 'Quebec' },
  { value: 'CA-MB', label: 'Manitoba' },
  { value: 'CA-SK', label: 'Saskatchewan' },
  { value: 'CA-NS', label: 'Nova Scotia' },
  { value: 'CA-NB', label: 'New Brunswick' },
  { value: 'CA-NL', label: 'Newfoundland and Labrador' },
  { value: 'CA-PE', label: 'Prince Edward Island' },
  { value: 'CA-NT', label: 'Northwest Territories' },
  { value: 'CA-YT', label: 'Yukon' },
  { value: 'CA-NU', label: 'Nunavut' },
]

// ─── Main page ──────────────────────────────────────────────────────────────

export default function TrustAccountsSettingsPage() {
  return (
    <RequirePermission entity="trust_accounting" action="view">
      <TrustAccountsContent />
    </RequirePermission>
  )
}

function TrustAccountsContent() {
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''
  const queryClient = useQueryClient()

  // ── Trust accounts data ─────────────────────────────────────────────────
  const { data: trustData, isLoading: trustLoading } = useTrustAccounts(true)
  const trustAccounts = (trustData?.accounts ?? []) as TrustBankAccountRow[]

  // ── Operating accounts data ─────────────────────────────────────────────
  const {
    data: operatingData,
    isLoading: operatingLoading,
  } = useOperatingAccounts()

  const operatingAccounts = (operatingData?.accounts ?? []) as OperatingBankAccountRow[]

  // ── Trust account state ─────────────────────────────────────────────────
  const [trustDialogOpen, setTrustDialogOpen] = useState(false)
  const [trustEditTarget, setTrustEditTarget] = useState<TrustBankAccountRow | null>(null)
  const [trustDeactivateTarget, setTrustDeactivateTarget] = useState<TrustBankAccountRow | null>(null)

  // ── Operating account state ─────────────────────────────────────────────
  const [operatingDialogOpen, setOperatingDialogOpen] = useState(false)
  const [operatingEditTarget, setOperatingEditTarget] = useState<OperatingBankAccountRow | null>(null)
  const [operatingDeactivateTarget, setOperatingDeactivateTarget] = useState<OperatingBankAccountRow | null>(null)

  // ── Trust mutations ─────────────────────────────────────────────────────
  const createTrustMutation = useCreateTrustAccount()

  const updateTrustMutation = useUpdateTrustAccount()

  const toggleTrustMutation = useToggleTrustAccount()

  // ── Operating mutations ─────────────────────────────────────────────────
  const createOperatingMutation = useCreateOperatingAccount()
  const updateOperatingMutation = useUpdateOperatingAccount()
  const toggleOperatingMutation = useToggleOperatingAccount()

  return (
    <div className="space-y-10 max-w-4xl">
      {/* ─── Trust Accounts Section ──────────────────────────────────────── */}
      <section className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Trust Accounts</h2>
            <p className="mt-1 text-sm text-slate-500">
              Manage your firm&rsquo;s trust bank accounts. These accounts hold client
              funds in trust and must comply with your law society&rsquo;s requirements.
            </p>
          </div>
          <RequirePermission entity="trust_accounting" action="create" variant="inline">
            <Button onClick={() => setTrustDialogOpen(true)} className="shrink-0">
              <Plus className="mr-2 h-4 w-4" />
              Add Trust Account
            </Button>
          </RequirePermission>
        </div>

        {/* Trust accounts list */}
        {trustLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : trustAccounts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
            <Landmark className="mx-auto mb-3 h-10 w-10 text-slate-400" />
            <h3 className="text-base font-medium text-slate-900">No trust accounts yet</h3>
            <p className="mt-1 text-sm text-slate-500">
              Add your first trust bank account to begin tracking client funds.
            </p>
            <RequirePermission entity="trust_accounting" action="create" variant="inline">
              <Button className="mt-4" onClick={() => setTrustDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Trust Account
              </Button>
            </RequirePermission>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Account Name</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Type</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Bank</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Currency</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Opened</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {trustAccounts.map((account) => (
                  <TrustAccountRow
                    key={account.id}
                    account={account}
                    onEdit={() => setTrustEditTarget(account)}
                    onToggle={() => setTrustDeactivateTarget(account)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Trust Create Dialog */}
        <TrustAccountDialog
          open={trustDialogOpen}
          onOpenChange={setTrustDialogOpen}
          title="Add Trust Account"
          description="Create a new trust bank account. The account number will be encrypted at rest."
          onSubmit={(values) => createTrustMutation.mutate(values)}
          isLoading={createTrustMutation.isPending}
        />

        {/* Trust Edit Dialog */}
        {trustEditTarget && (
          <TrustAccountDialog
            open={!!trustEditTarget}
            onOpenChange={(open) => {
              if (!open) setTrustEditTarget(null)
            }}
            title="Edit Trust Account"
            description="Update the trust account details."
            initialValues={{
              accountName: trustEditTarget.account_name,
              accountType: trustEditTarget.account_type as 'general' | 'specific',
              bankName: trustEditTarget.bank_name,
              accountNumberEncrypted: trustEditTarget.account_number_encrypted,
              transitNumber: trustEditTarget.transit_number ?? '',
              institutionNumber: trustEditTarget.institution_number ?? '',
              currency: trustEditTarget.currency as 'CAD' | 'USD',
              jurisdictionCode: trustEditTarget.jurisdiction_code,
              defaultHoldDaysCheque: trustEditTarget.default_hold_days_cheque,
              defaultHoldDaysEft: trustEditTarget.default_hold_days_eft,
            }}
            onSubmit={(values) =>
              updateTrustMutation.mutate({ id: trustEditTarget.id, ...values })
            }
            isLoading={updateTrustMutation.isPending}
          />
        )}

        {/* Trust Deactivate Confirmation */}
        <AlertDialog
          open={!!trustDeactivateTarget}
          onOpenChange={(open) => {
            if (!open) setTrustDeactivateTarget(null)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {trustDeactivateTarget?.is_active ? 'Deactivate' : 'Reactivate'}{' '}
                &ldquo;{trustDeactivateTarget?.account_name}&rdquo;?
              </AlertDialogTitle>
              <AlertDialogDescription>
                {trustDeactivateTarget?.is_active
                  ? 'Deactivating this trust account will prevent new transactions from being recorded against it. Existing balances and history are preserved.'
                  : 'Reactivating this trust account will allow new transactions to be recorded against it.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className={cn(
                  trustDeactivateTarget?.is_active
                    ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                    : ''
                )}
                onClick={() => {
                  if (trustDeactivateTarget) {
                    toggleTrustMutation.mutate({
                      id: trustDeactivateTarget.id,
                      isActive: !trustDeactivateTarget.is_active,
                    })
                    setTrustDeactivateTarget(null)
                  }
                }}
                disabled={toggleTrustMutation.isPending}
              >
                {trustDeactivateTarget?.is_active ? 'Deactivate' : 'Reactivate'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>

      {/* ─── Operating Accounts Section ──────────────────────────────────── */}
      <section className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Operating Accounts</h2>
            <p className="mt-1 text-sm text-slate-500">
              Manage your firm&rsquo;s operating bank accounts. These are used for firm
              expenses, disbursements from trust, and general business transactions.
            </p>
          </div>
          <RequirePermission entity="trust_accounting" action="create" variant="inline">
            <Button onClick={() => setOperatingDialogOpen(true)} className="shrink-0">
              <Plus className="mr-2 h-4 w-4" />
              Add Operating Account
            </Button>
          </RequirePermission>
        </div>

        {/* Operating accounts list */}
        {operatingLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : operatingAccounts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
            <Building2 className="mx-auto mb-3 h-10 w-10 text-slate-400" />
            <h3 className="text-base font-medium text-slate-900">No operating accounts yet</h3>
            <p className="mt-1 text-sm text-slate-500">
              Add your firm&rsquo;s operating bank account to track disbursements and expenses.
            </p>
            <RequirePermission entity="trust_accounting" action="create" variant="inline">
              <Button className="mt-4" onClick={() => setOperatingDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Operating Account
              </Button>
            </RequirePermission>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Account Name</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Bank</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Default</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {operatingAccounts.map((account) => (
                  <OperatingAccountRow
                    key={account.id}
                    account={account}
                    onEdit={() => setOperatingEditTarget(account)}
                    onToggle={() => setOperatingDeactivateTarget(account)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Operating Create Dialog */}
        <OperatingAccountDialog
          open={operatingDialogOpen}
          onOpenChange={setOperatingDialogOpen}
          title="Add Operating Account"
          description="Create a new operating bank account for your firm."
          onSubmit={(values) => createOperatingMutation.mutate(values)}
          isLoading={createOperatingMutation.isPending}
        />

        {/* Operating Edit Dialog */}
        {operatingEditTarget && (
          <OperatingAccountDialog
            open={!!operatingEditTarget}
            onOpenChange={(open) => {
              if (!open) setOperatingEditTarget(null)
            }}
            title="Edit Operating Account"
            description="Update the operating account details."
            initialValues={{
              accountName: operatingEditTarget.account_name,
              bankName: operatingEditTarget.bank_name,
              accountNumberEncrypted: operatingEditTarget.account_number_encrypted,
              isDefault: operatingEditTarget.is_default,
            }}
            onSubmit={(values) =>
              updateOperatingMutation.mutate({ id: operatingEditTarget.id, ...values })
            }
            isLoading={updateOperatingMutation.isPending}
          />
        )}

        {/* Operating Deactivate Confirmation */}
        <AlertDialog
          open={!!operatingDeactivateTarget}
          onOpenChange={(open) => {
            if (!open) setOperatingDeactivateTarget(null)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {operatingDeactivateTarget?.is_active ? 'Deactivate' : 'Reactivate'}{' '}
                &ldquo;{operatingDeactivateTarget?.account_name}&rdquo;?
              </AlertDialogTitle>
              <AlertDialogDescription>
                {operatingDeactivateTarget?.is_active
                  ? 'Deactivating this operating account will prevent it from being selected for new transactions.'
                  : 'Reactivating this operating account will make it available for new transactions.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className={cn(
                  operatingDeactivateTarget?.is_active
                    ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                    : ''
                )}
                onClick={() => {
                  if (operatingDeactivateTarget) {
                    toggleOperatingMutation.mutate({
                      id: operatingDeactivateTarget.id,
                      isActive: !operatingDeactivateTarget.is_active,
                    })
                    setOperatingDeactivateTarget(null)
                  }
                }}
                disabled={toggleOperatingMutation.isPending}
              >
                {operatingDeactivateTarget?.is_active ? 'Deactivate' : 'Reactivate'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>
    </div>
  )
}

// ─── Trust Account Row ──────────────────────────────────────────────────────

interface TrustAccountRowProps {
  account: TrustBankAccountRow
  onEdit: () => void
  onToggle: () => void
}

function TrustAccountRow({ account, onEdit, onToggle }: TrustAccountRowProps) {
  return (
    <tr className={cn('transition-colors hover:bg-slate-50', !account.is_active && 'opacity-60')}>
      <td className="px-4 py-3 font-medium text-slate-900">{account.account_name}</td>
      <td className="px-4 py-3">
        <Badge variant={account.account_type === 'general' ? 'default' : 'secondary'}>
          {account.account_type === 'general' ? 'General' : 'Specific'}
        </Badge>
      </td>
      <td className="px-4 py-3 text-slate-600">{account.bank_name}</td>
      <td className="px-4 py-3 text-slate-600">{account.currency}</td>
      <td className="px-4 py-3">
        <Badge variant={account.is_active ? 'default' : 'secondary'} className={cn(
          account.is_active
            ? 'bg-emerald-950/40 text-emerald-400 hover:bg-emerald-950/40'
            : 'bg-slate-100 text-slate-600'
        )}>
          {account.is_active ? 'Active' : 'Inactive'}
        </Badge>
      </td>
      <td className="px-4 py-3 text-slate-600">
        {account.opened_date
          ? new Date(account.opened_date).toLocaleDateString('en-CA')
          : '\u2014'}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onEdit}
            aria-label={`Edit ${account.account_name}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-8 w-8',
              account.is_active
                ? 'text-destructive hover:text-destructive'
                : 'text-emerald-600 hover:text-emerald-400'
            )}
            onClick={onToggle}
            aria-label={`${account.is_active ? 'Deactivate' : 'Reactivate'} ${account.account_name}`}
          >
            {account.is_active ? (
              <PowerOff className="h-3.5 w-3.5" />
            ) : (
              <Power className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </td>
    </tr>
  )
}

// ─── Operating Account Row ──────────────────────────────────────────────────

interface OperatingAccountRowProps {
  account: OperatingBankAccountRow
  onEdit: () => void
  onToggle: () => void
}

function OperatingAccountRow({ account, onEdit, onToggle }: OperatingAccountRowProps) {
  return (
    <tr className={cn('transition-colors hover:bg-slate-50', !account.is_active && 'opacity-60')}>
      <td className="px-4 py-3 font-medium text-slate-900">{account.account_name}</td>
      <td className="px-4 py-3 text-slate-600">{account.bank_name}</td>
      <td className="px-4 py-3">
        {account.is_default && (
          <Badge variant="default" className="bg-blue-100 text-blue-800 hover:bg-blue-100">
            Default
          </Badge>
        )}
      </td>
      <td className="px-4 py-3">
        <Badge variant={account.is_active ? 'default' : 'secondary'} className={cn(
          account.is_active
            ? 'bg-emerald-950/40 text-emerald-400 hover:bg-emerald-950/40'
            : 'bg-slate-100 text-slate-600'
        )}>
          {account.is_active ? 'Active' : 'Inactive'}
        </Badge>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onEdit}
            aria-label={`Edit ${account.account_name}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-8 w-8',
              account.is_active
                ? 'text-destructive hover:text-destructive'
                : 'text-emerald-600 hover:text-emerald-400'
            )}
            onClick={onToggle}
            aria-label={`${account.is_active ? 'Deactivate' : 'Reactivate'} ${account.account_name}`}
          >
            {account.is_active ? (
              <PowerOff className="h-3.5 w-3.5" />
            ) : (
              <Power className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </td>
    </tr>
  )
}

// ─── Trust Account Dialog ───────────────────────────────────────────────────

interface TrustAccountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  initialValues?: TrustAccountFormValues
  onSubmit: (values: TrustAccountFormValues) => void
  isLoading: boolean
}

const trustAccountDefaults: TrustAccountFormValues = {
  accountName: '',
  accountType: 'general',
  bankName: '',
  accountNumberEncrypted: '',
  transitNumber: '',
  institutionNumber: '',
  currency: 'CAD',
  jurisdictionCode: 'CA-ON',
  defaultHoldDaysCheque: 5,
  defaultHoldDaysEft: 0,
}

function TrustAccountDialog({
  open,
  onOpenChange,
  title,
  description,
  initialValues,
  onSubmit,
  isLoading,
}: TrustAccountDialogProps) {
  const form = useForm<TrustAccountFormValues>({
    resolver: zodResolver(trustAccountSchema) as never,
    defaultValues: initialValues ?? trustAccountDefaults,
  })

  function handleOpenChange(open: boolean) {
    if (!open) form.reset(initialValues ?? trustAccountDefaults)
    onOpenChange(open)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="accountName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Account Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Main Trust Account" autoFocus {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="accountType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Account Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="general">General Trust</SelectItem>
                      <SelectItem value="specific">Specific (Single Client)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    General accounts hold funds for multiple clients. Specific accounts are
                    dedicated to a single matter.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="bankName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bank Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Royal Bank of Canada" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="accountNumberEncrypted"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Account Number</FormLabel>
                  <FormControl>
                    <Input placeholder="Account number" type="password" {...field} />
                  </FormControl>
                  <FormDescription>
                    This value is encrypted at rest and never displayed in full.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="transitNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Transit Number</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. 12345" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="institutionNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Institution Number</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. 003" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Currency</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select currency" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="CAD">CAD</SelectItem>
                        <SelectItem value="USD">USD</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="jurisdictionCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Jurisdiction</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select jurisdiction" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {JURISDICTIONS.map((j) => (
                          <SelectItem key={j.value} value={j.value}>
                            {j.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="defaultHoldDaysCheque"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Default Cheque Hold Days</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        max={365}
                        {...field}
                        onChange={(e) => field.onChange(e.target.valueAsNumber)}
                      />
                    </FormControl>
                    <FormDescription>Business days to hold cheque deposits.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="defaultHoldDaysEft"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Default EFT Hold Days</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        max={365}
                        {...field}
                        onChange={(e) => field.onChange(e.target.valueAsNumber)}
                      />
                    </FormControl>
                    <FormDescription>Business days to hold EFT deposits.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Saving\u2026' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Operating Account Dialog ───────────────────────────────────────────────

interface OperatingAccountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  initialValues?: OperatingAccountFormValues
  onSubmit: (values: OperatingAccountFormValues) => void
  isLoading: boolean
}

const operatingAccountDefaults: OperatingAccountFormValues = {
  accountName: '',
  bankName: '',
  accountNumberEncrypted: '',
  isDefault: false,
}

function OperatingAccountDialog({
  open,
  onOpenChange,
  title,
  description,
  initialValues,
  onSubmit,
  isLoading,
}: OperatingAccountDialogProps) {
  const form = useForm<OperatingAccountFormValues>({
    resolver: zodResolver(operatingAccountSchema),
    defaultValues: initialValues ?? operatingAccountDefaults,
  })

  function handleOpenChange(open: boolean) {
    if (!open) form.reset(initialValues ?? operatingAccountDefaults)
    onOpenChange(open)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="accountName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Account Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Firm Operating Account" autoFocus {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="bankName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bank Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Royal Bank of Canada" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="accountNumberEncrypted"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Account Number</FormLabel>
                  <FormControl>
                    <Input placeholder="Account number" type="password" {...field} />
                  </FormControl>
                  <FormDescription>
                    This value is encrypted at rest and never displayed in full.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isDefault"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel className="text-sm font-medium">Default Account</FormLabel>
                    <FormDescription className="text-xs">
                      Set this as the default operating account for disbursements.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      className="data-[state=checked]:bg-emerald-600"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Saving\u2026' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Additional query hooks (inline, following practice-areas pattern) ───────

function useOperatingAccounts() {
  return useQuery({
    queryKey: ['operating_accounts'],
    queryFn: () =>
      fetchApi<{ success: true; accounts: unknown[] }>(
        '/api/trust-accounting/operating-accounts'
      ),
    staleTime: 1000 * 60 * 5,
  })
}

function useUpdateTrustAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: TrustAccountFormValues & { id: string }) => {
      const { id, ...body } = input
      return fetchApi(`/api/trust-accounting/accounts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: trustKeys.accounts() })
      toast.success('Trust account updated.')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

function useToggleTrustAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string; isActive: boolean }) =>
      fetchApi(`/api/trust-accounting/accounts/${input.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: input.isActive }),
      }),
    onSuccess: (_, { isActive }) => {
      qc.invalidateQueries({ queryKey: trustKeys.accounts() })
      toast.success(isActive ? 'Trust account reactivated.' : 'Trust account deactivated.')
    },
    onError: () => toast.error('Failed to update trust account status.'),
  })
}

function useCreateOperatingAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: OperatingAccountFormValues) =>
      fetchApi('/api/trust-accounting/operating-accounts', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['operating_accounts'] })
      toast.success('Operating account created.')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

function useUpdateOperatingAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: OperatingAccountFormValues & { id: string }) => {
      const { id, ...body } = input
      return fetchApi(`/api/trust-accounting/operating-accounts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['operating_accounts'] })
      toast.success('Operating account updated.')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

function useToggleOperatingAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string; isActive: boolean }) =>
      fetchApi(`/api/trust-accounting/operating-accounts/${input.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: input.isActive }),
      }),
    onSuccess: (_, { isActive }) => {
      qc.invalidateQueries({ queryKey: ['operating_accounts'] })
      toast.success(isActive ? 'Operating account reactivated.' : 'Operating account deactivated.')
    },
    onError: () => toast.error('Failed to update operating account status.'),
  })
}
