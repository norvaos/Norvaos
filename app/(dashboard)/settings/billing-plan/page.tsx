'use client'

import { useState } from 'react'
import { useTenant } from '@/lib/hooks/use-tenant'
import {
  useSubscription,
  useBillingInvoices,
  useCreateCheckout,
  useCreatePortalSession,
} from '@/lib/queries/billing'
import { PLAN_TIERS, type PlanTier } from '@/lib/config/version'
import { formatCents } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { format, differenceInDays, parseISO } from 'date-fns'
import {
  CreditCard,
  Check,
  AlertTriangle,
  ExternalLink,
  Download,
  Crown,
  Sparkles,
  Building2,
  FileText,
} from 'lucide-react'

// ─── Feature display lists per plan ──────────────────────────────

const PLAN_FEATURES_DISPLAY: Record<string, string[]> = {
  starter: [
    '3 users',
    '5GB storage',
    '100 matters',
    '500 contacts',
    'Documents',
    'Leads & Pipeline',
    'Tasks',
    'Notes',
  ],
  professional: [
    '10 users',
    '25GB storage',
    'Unlimited matters & contacts',
    'Documents',
    'Leads & Pipeline',
    'Tasks',
    'Notes',
    'Email Sync',
    'Calendar',
    'Reports',
    'Automations',
    'Custom Fields',
    'Client Portal',
  ],
  enterprise: [
    'Unlimited users & storage',
    'Unlimited matters & contacts',
    'Documents',
    'Leads & Pipeline',
    'Tasks',
    'Notes',
    'Email Sync',
    'Calendar',
    'Reports',
    'Automations',
    'Custom Fields',
    'Client Portal',
    'Phone',
    'Advanced Reporting',
    'API Access',
    'SSO',
    'Norva Vault',
    'White Label',
  ],
}

const PLAN_ICONS: Record<string, React.ReactNode> = {
  starter: <Sparkles className="size-5" />,
  professional: <Crown className="size-5" />,
  enterprise: <Building2 className="size-5" />,
}

// ─── Helpers ────────────────────────────────────────────────────

function getStatusColor(status: string): string {
  switch (status) {
    case 'active':
      return 'bg-emerald-950/40 text-emerald-400 dark:bg-green-900/30 dark:text-green-400'
    case 'trialing':
      return 'bg-yellow-950/40 text-yellow-400 dark:bg-yellow-900/30 dark:text-yellow-400'
    case 'past_due':
      return 'bg-red-950/40 text-red-400 dark:bg-red-900/30 dark:text-red-400'
    case 'cancelled':
    case 'canceled':
      return 'bg-red-950/40 text-red-400 dark:bg-red-900/30 dark:text-red-400'
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'
  }
}

function getInvoiceStatusColor(status: string): string {
  switch (status) {
    case 'paid':
      return 'bg-emerald-950/40 text-emerald-400 dark:bg-green-900/30 dark:text-green-400'
    case 'failed':
      return 'bg-red-950/40 text-red-400 dark:bg-red-900/30 dark:text-red-400'
    case 'open':
      return 'bg-yellow-950/40 text-yellow-400 dark:bg-yellow-900/30 dark:text-yellow-400'
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'
  }
}

// ─── Page Component ─────────────────────────────────────────────

export default function BillingPlanPage() {
  const { tenant, isLoading: tenantLoading } = useTenant()
  const [interval, setInterval] = useState<'monthly' | 'yearly'>('monthly')

  const tenantId = tenant?.id ?? ''
  const { data: subscription, isLoading: subLoading } = useSubscription(tenantId)
  const { data: invoices, isLoading: invoicesLoading } = useBillingInvoices(tenantId)
  const createCheckout = useCreateCheckout()
  const createPortal = useCreatePortalSession()

  const isLoading = tenantLoading || subLoading

  const currentTier = (tenant?.subscription_tier ?? 'trial') as PlanTier
  const currentPlan = PLAN_TIERS[currentTier] ?? PLAN_TIERS.trial
  const subscriptionStatus = tenant?.subscription_status ?? 'trialing'

  // ─── Loading state ──────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-64" />
          <Skeleton className="mt-2 h-4 w-96" />
        </div>
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  // ─── Handlers ───────────────────────────────────────────────

  function handleManageSubscription() {
    createPortal.mutate(undefined, {
      onError: (error) => {
        toast.error(error.message || 'Failed to open billing portal')
      },
    })
  }

  function handleSelectPlan(planTier: string) {
    createCheckout.mutate(
      { planTier, interval },
      {
        onError: (error) => {
          toast.error(error.message || 'Failed to create checkout session')
        },
      }
    )
  }

  // ─── Trial info ─────────────────────────────────────────────

  const trialEndsAt = tenant?.trial_ends_at ? parseISO(tenant.trial_ends_at) : null
  const daysLeft = trialEndsAt ? differenceInDays(trialEndsAt, new Date()) : 0

  // ─── Render ─────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Subscription & Billing</h1>
        <p className="text-muted-foreground mt-1">
          Manage your subscription plan, payment methods, and billing history.
        </p>
      </div>

      <Tabs defaultValue="plan" className="space-y-6">
        <TabsList>
          <TabsTrigger value="plan">
            <CreditCard className="mr-1.5 size-4" />
            Plan
          </TabsTrigger>
          <TabsTrigger value="billing">
            <FileText className="mr-1.5 size-4" />
            Billing History
          </TabsTrigger>
        </TabsList>

        {/* ═══ Plan Tab ═══ */}
        <TabsContent value="plan" className="space-y-8">
          {/* ── Current Plan Card ── */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-lg">Current Plan</CardTitle>
                  <CardDescription>
                    You are currently on the{' '}
                    <span className="font-semibold text-foreground">{currentPlan.name}</span> plan.
                  </CardDescription>
                </div>
                <Badge className={getStatusColor(subscriptionStatus)}>
                  {subscriptionStatus === 'past_due'
                    ? 'Past Due'
                    : subscriptionStatus.charAt(0).toUpperCase() + subscriptionStatus.slice(1)}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Trial info */}
              {subscriptionStatus === 'trialing' && trialEndsAt && (
                <div className="flex items-center gap-2 rounded-lg border border-yellow-500/20 bg-yellow-950/30 p-3 text-sm dark:border-yellow-900/50 dark:bg-yellow-900/20">
                  <AlertTriangle className="size-4 text-yellow-600 dark:text-yellow-400" />
                  <span>
                    Trial ends on{' '}
                    <span className="font-medium">
                      {format(trialEndsAt, 'dd-MM-yyyy')}
                    </span>{' '}
                    ({daysLeft > 0 ? `${daysLeft} days left` : 'Expired'})
                  </span>
                </div>
              )}

              {/* Current period */}
              {subscription?.current_period_start && subscription?.current_period_end && (
                <div className="text-sm text-muted-foreground">
                  Current period:{' '}
                  <span className="font-medium text-foreground">
                    {format(parseISO(subscription.current_period_start), 'dd-MM-yyyy')}
                  </span>{' '}
                  to{' '}
                  <span className="font-medium text-foreground">
                    {format(parseISO(subscription.current_period_end), 'dd-MM-yyyy')}
                  </span>
                </div>
              )}

              {/* Cancel at period end warning */}
              {subscription?.cancel_at_period_end && (
                <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-950/30 p-3 text-sm dark:border-red-900/50 dark:bg-red-900/20">
                  <AlertTriangle className="size-4 text-red-600 dark:text-red-400" />
                  <span className="text-red-400 dark:text-red-300">
                    Your plan will be cancelled at the end of the billing period.
                  </span>
                </div>
              )}
            </CardContent>

            {(subscriptionStatus === 'active' || subscriptionStatus === 'past_due') && (
              <CardFooter>
                <Button
                  variant="outline"
                  onClick={handleManageSubscription}
                  disabled={createPortal.isPending}
                >
                  {createPortal.isPending ? 'Opening...' : 'Manage Subscription'}
                  <ExternalLink className="ml-1.5 size-3.5" />
                </Button>
              </CardFooter>
            )}
          </Card>

          <Separator />

          {/* ── Plan Comparison / Pricing Table ── */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Choose a Plan</h2>
                <p className="text-sm text-muted-foreground">
                  Select the plan that best fits your needs.
                </p>
              </div>

              {/* Interval toggle */}
              <div className="flex items-center gap-2 rounded-lg border p-1">
                <button
                  onClick={() => setInterval('monthly')}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    interval === 'monthly'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setInterval('yearly')}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    interval === 'yearly'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Yearly
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    Save ~20%
                  </Badge>
                </button>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              {(['starter', 'professional', 'enterprise'] as const).map((tier) => {
                const plan = PLAN_TIERS[tier]
                const isCurrentPlan = currentTier === tier && subscriptionStatus !== 'trialing'
                const price = interval === 'monthly' ? plan.priceMonthly : plan.priceYearly
                const features = PLAN_FEATURES_DISPLAY[tier]
                const hasStripePrice = !!price

                return (
                  <Card
                    key={tier}
                    className={`relative flex flex-col ${
                      tier === 'professional' ? 'border-primary shadow-md' : ''
                    }`}
                  >
                    {tier === 'professional' && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <Badge className="bg-primary text-primary-foreground">
                          Most Popular
                        </Badge>
                      </div>
                    )}

                    <CardHeader>
                      <div className="flex items-center gap-2">
                        {PLAN_ICONS[tier]}
                        <CardTitle className="text-lg">{plan.name}</CardTitle>
                      </div>
                      <div className="mt-2">
                        {price ? (
                          <div className="flex items-baseline gap-1">
                            <span className="text-3xl font-bold">
                              {formatCents(price)}
                            </span>
                            <span className="text-muted-foreground text-sm">
                              /{interval === 'monthly' ? 'mo' : 'yr'}
                            </span>
                          </div>
                        ) : (
                          <div className="text-3xl font-bold">Custom</div>
                        )}
                      </div>
                    </CardHeader>

                    <CardContent className="flex-1">
                      <ul className="space-y-2.5">
                        {features.map((feature) => (
                          <li key={feature} className="flex items-start gap-2 text-sm">
                            <Check className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>

                    <CardFooter>
                      {isCurrentPlan ? (
                        <Badge
                          variant="secondary"
                          className="w-full justify-center py-2 text-sm"
                        >
                          Current Plan
                        </Badge>
                      ) : !hasStripePrice ? (
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => {
                            window.location.href = 'mailto:sales@norvaos.com?subject=Enterprise Plan Inquiry'
                          }}
                        >
                          Contact Sales
                        </Button>
                      ) : (
                        <Button
                          className="w-full"
                          variant={tier === 'professional' ? 'default' : 'outline'}
                          onClick={() => handleSelectPlan(tier)}
                          disabled={createCheckout.isPending}
                        >
                          {createCheckout.isPending
                            ? 'Redirecting...'
                            : currentTier === 'trial' || subscriptionStatus === 'trialing'
                              ? 'Choose Plan'
                              : PLAN_TIERS[currentTier]?.priceMonthly &&
                                  price > (PLAN_TIERS[currentTier] as { priceMonthly: number }).priceMonthly
                                ? 'Upgrade'
                                : 'Choose Plan'}
                        </Button>
                      )}
                    </CardFooter>
                  </Card>
                )
              })}
            </div>
          </div>
        </TabsContent>

        {/* ═══ Billing History Tab ═══ */}
        <TabsContent value="billing" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Billing History</CardTitle>
              <CardDescription>
                View your past invoices and download receipts.
              </CardDescription>
            </CardHeader>

            <CardContent>
              {invoicesLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-6 w-14" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                  ))}
                </div>
              ) : !invoices || invoices.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <FileText className="size-10 text-muted-foreground/40" />
                  <p className="mt-3 text-sm font-medium text-muted-foreground">
                    No invoices yet
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground/70">
                    Your billing history will appear here after your first payment.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-3 pr-4 font-medium">Date</th>
                        <th className="pb-3 pr-4 font-medium">Amount</th>
                        <th className="pb-3 pr-4 font-medium">Status</th>
                        <th className="pb-3 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {invoices.map((invoice) => (
                        <tr key={invoice.id} className="group">
                          <td className="py-3 pr-4">
                            {format(parseISO(invoice.created_at), 'dd-MM-yyyy')}
                          </td>
                          <td className="py-3 pr-4 font-medium">
                            {formatCents(invoice.amount)}
                          </td>
                          <td className="py-3 pr-4">
                            <Badge
                              className={getInvoiceStatusColor(invoice.status)}
                            >
                              {invoice.status.charAt(0).toUpperCase() +
                                invoice.status.slice(1)}
                            </Badge>
                          </td>
                          <td className="py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {invoice.invoice_url && (
                                <Button
                                  variant="ghost"
                                  size="xs"
                                  asChild
                                >
                                  <a
                                    href={invoice.invoice_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <ExternalLink className="size-3" />
                                    View Invoice
                                  </a>
                                </Button>
                              )}
                              {invoice.invoice_pdf && (
                                <Button
                                  variant="ghost"
                                  size="xs"
                                  asChild
                                >
                                  <a
                                    href={invoice.invoice_pdf}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <Download className="size-3" />
                                    Download PDF
                                  </a>
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
