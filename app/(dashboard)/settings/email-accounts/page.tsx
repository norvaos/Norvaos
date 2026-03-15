'use client'

import { useState } from 'react'
import {
  Mail,
  Plus,
  Loader2,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  XCircle,
  MoreHorizontal,
  Trash2,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'

import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import { useUserRole } from '@/lib/hooks/use-user-role'
import { useEmailAccounts } from '@/lib/queries/email'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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

// ─── Status helpers ──────────────────────────────────────────────────────────

function getAccountStatus(account: {
  sync_enabled: boolean
  last_error: string | null
  error_count: number
  last_sync_at: string | null
}) {
  if (!account.sync_enabled) return 'disabled'
  if (account.error_count > 0 && account.last_error) return 'error'
  if (account.last_sync_at) return 'syncing'
  return 'pending'
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'syncing':
      return (
        <Badge variant="outline" className="gap-1 border-green-200 bg-green-50 text-green-700">
          <CheckCircle2 className="size-3" />
          Syncing
        </Badge>
      )
    case 'error':
      return (
        <Badge variant="outline" className="gap-1 border-red-200 bg-red-50 text-red-700">
          <XCircle className="size-3" />
          Error
        </Badge>
      )
    case 'disabled':
      return (
        <Badge variant="outline" className="gap-1 border-slate-200 bg-slate-50 text-slate-500">
          <AlertCircle className="size-3" />
          Disabled
        </Badge>
      )
    default:
      return (
        <Badge variant="outline" className="gap-1 border-amber-200 bg-amber-50 text-amber-700">
          <RefreshCw className="size-3" />
          Pending
        </Badge>
      )
  }
}

// ─── Shared Mailbox Dialog ───────────────────────────────────────────────────

function SharedMailboxDialog({
  open,
  onOpenChange,
  account,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  account: { id: string; email_address: string; display_name: string | null } | null
}) {
  if (!account) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">
            Shared Mailbox: {account.display_name || account.email_address}
          </DialogTitle>
          <DialogDescription>
            Manage authorised users and access levels for this shared mailbox.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="rounded-md border border-dashed border-slate-200 p-6 text-center">
            <Users className="mx-auto size-8 text-slate-300" />
            <p className="mt-2 text-sm text-muted-foreground">
              Shared mailbox management will be available once Microsoft Graph integration is configured.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              You will be able to add/remove authorised users and set read-only or full-access levels.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function EmailAccountsSettingsPage() {
  const { tenant } = useTenant()
  const { appUser } = useUser()
  const { role } = useUserRole()

  const { data: accounts, isLoading } = useEmailAccounts()

  const [connectDialogOpen, setConnectDialogOpen] = useState(false)
  const [sharedMailboxDialogOpen, setSharedMailboxDialogOpen] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState<typeof accounts extends (infer T)[] | undefined ? T | null : null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

  // Permission check
  const canView = role?.name === 'Admin' || role?.permissions?.settings?.view === true
  const canEdit = role?.name === 'Admin' || role?.permissions?.settings?.edit === true

  if (!canView) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <AlertCircle className="mx-auto size-10 text-muted-foreground" />
          <h2 className="mt-3 text-lg font-medium">Access Denied</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            You do not have permission to view email account settings.
          </p>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-7 w-48" />
          <Skeleton className="mt-1 h-4 w-72" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    )
  }

  const personalAccounts = accounts?.filter((a) => a.account_type === 'personal') ?? []
  const sharedAccounts = accounts?.filter((a) => a.account_type === 'shared') ?? []

  function handleConnectAccount() {
    // Trigger Microsoft OAuth flow
    window.location.href = '/api/email/oauth/microsoft/connect'
  }

  function handleToggleSync(accountId: string, currentSync: boolean) {
    // TODO: wire to mutation when available
    toast.info(currentSync ? 'Sync disabled' : 'Sync enabled')
  }

  function handleDeleteAccount() {
    if (!deleteTargetId) return
    // TODO: wire to mutation when available
    toast.success('Account disconnected')
    setDeleteDialogOpen(false)
    setDeleteTargetId(null)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Email Accounts</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage personal and shared mailbox connections for email integration.
          </p>
        </div>
        {canEdit && (
          <Button onClick={handleConnectAccount}>
            <Plus className="mr-2 size-4" />
            Connect Account
          </Button>
        )}
      </div>

      {/* Personal Accounts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Personal Accounts</CardTitle>
          <CardDescription>
            Your connected email accounts. Synced emails appear in the Matter Workplace communication panel.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {personalAccounts.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-200 p-8 text-center">
              <Mail className="mx-auto size-8 text-slate-300" />
              <p className="mt-2 text-sm font-medium text-slate-600">No email accounts connected</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Connect your Microsoft 365 account to sync emails with matters.
              </p>
              {canEdit && (
                <Button className="mt-3" size="sm" onClick={handleConnectAccount}>
                  <Plus className="mr-2 size-3.5" />
                  Connect Account
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {personalAccounts.map((account) => {
                const status = getAccountStatus(account)
                return (
                  <div
                    key={account.id}
                    className="flex items-center justify-between rounded-lg border p-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex size-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                        <Mail className="size-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          {account.display_name || account.email_address}
                        </p>
                        <p className="text-xs text-muted-foreground">{account.email_address}</p>
                        {account.last_error && status === 'error' && (
                          <p className="mt-0.5 text-xs text-red-600">{account.last_error}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <StatusBadge status={status} />

                      {canEdit && (
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={account.sync_enabled}
                            onCheckedChange={() => handleToggleSync(account.id, account.sync_enabled)}
                            aria-label="Toggle sync"
                          />
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="size-8">
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={() => {
                                  setDeleteTargetId(account.id)
                                  setDeleteDialogOpen(true)
                                }}
                              >
                                <Trash2 className="mr-2 size-3.5" />
                                Disconnect
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Shared Mailboxes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Shared Mailboxes</CardTitle>
          <CardDescription>
            Shared mailboxes accessible by multiple team members. Manage who can send from and view these accounts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sharedAccounts.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-200 p-8 text-center">
              <Users className="mx-auto size-8 text-slate-300" />
              <p className="mt-2 text-sm font-medium text-slate-600">No shared mailboxes</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Shared mailboxes allow multiple team members to access the same email account.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {sharedAccounts.map((account) => {
                const status = getAccountStatus(account)
                return (
                  <div
                    key={account.id}
                    className="flex items-center justify-between rounded-lg border p-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex size-9 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                        <Users className="size-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          {account.display_name || account.email_address}
                        </p>
                        <p className="text-xs text-muted-foreground">{account.email_address}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <StatusBadge status={status} />

                      {canEdit && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedAccount(account)
                            setSharedMailboxDialogOpen(true)
                          }}
                        >
                          <Users className="mr-1.5 size-3.5" />
                          Manage Users
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Shared Mailbox Dialog */}
      <SharedMailboxDialog
        open={sharedMailboxDialogOpen}
        onOpenChange={setSharedMailboxDialogOpen}
        account={selectedAccount}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Email Account?</AlertDialogTitle>
            <AlertDialogDescription>
              This will stop syncing emails from this account. Existing synced emails will remain in the system.
              You can reconnect this account at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAccount}
              className="bg-red-600 hover:bg-red-700"
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
