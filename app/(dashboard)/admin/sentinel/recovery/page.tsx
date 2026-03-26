'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Lock,
  Unlock,
  AlertTriangle,
  Loader2,
  KeyRound,
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'

import { useUserRole } from '@/lib/hooks/use-user-role'
import { useUser } from '@/lib/hooks/use-user'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState } from '@/components/shared/empty-state'

// ── Types ────────────────────────────────────────────────────────────────────

interface Lockdown {
  id: string
  user_id: string
  matter_id: string | null
  lockdown_type: string
  trigger_event: string
  trigger_count: number
  is_active: boolean
  locked_at: string
  unlocked_at: string | null
  unlocked_by: string | null
  details: {
    affected_matters?: string[]
    window_minutes?: number
    threshold?: number
    event_type?: string
    unlock_reason?: string
    unlock_method?: string
  }
}

interface LockdownResponse {
  lockdowns: Lockdown[]
  activeLockdownCount: number
}

// ── Page Component ───────────────────────────────────────────────────────────

export default function SentinelRecoveryPage() {
  const { appUser } = useUser()
  const { role } = useUserRole()
  const queryClient = useQueryClient()

  const [selectedLockdown, setSelectedLockdown] = useState<Lockdown | null>(null)
  const [showUnlockDialog, setShowUnlockDialog] = useState(false)
  const [confirmationCode, setConfirmationCode] = useState('')
  const [unlockReason, setUnlockReason] = useState('')

  // ── Access Gate ──────────────────────────────────────────────────────
  const isAdmin = role?.name && ['admin', 'super_admin', 'superadmin'].includes(role.name)

  // ── Data Fetch ──────────────────────────────────────────────────────
  const { data, isLoading, error } = useQuery<LockdownResponse>({
    queryKey: ['sentinel-lockdowns'],
    queryFn: async () => {
      const res = await fetch('/api/sentinel/lockdown')
      if (!res.ok) throw new Error('Failed to fetch lockdowns')
      return res.json()
    },
    enabled: !!isAdmin,
    refetchInterval: 30_000, // Auto-refresh every 30s
    staleTime: 10_000,
  })

  // ── Unlock Mutation ─────────────────────────────────────────────────
  const unlockMutation = useMutation({
    mutationFn: async (input: {
      lockdownId: string
      confirmationCode: string
      reason: string
    }) => {
      const res = await fetch('/api/sentinel/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Unlock failed' }))
        throw new Error(data.error)
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sentinel-lockdowns'] })
      setShowUnlockDialog(false)
      setSelectedLockdown(null)
      setConfirmationCode('')
      setUnlockReason('')
    },
  })

  // ── Access Denied ───────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <ShieldAlert className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Access Restricted</h2>
            <p className="text-sm text-muted-foreground">
              Only Managing Partners with administrative privileges can access
              the SENTINEL Recovery Console.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const lockdowns = data?.lockdowns ?? []
  const activeLockdowns = lockdowns.filter((l) => l.is_active)
  const resolvedLockdowns = lockdowns.filter((l) => !l.is_active)

  function handleUnlockClick(lockdown: Lockdown) {
    setSelectedLockdown(lockdown)
    setConfirmationCode('')
    setUnlockReason('')
    setShowUnlockDialog(true)
  }

  function handleConfirmUnlock() {
    if (!selectedLockdown) return
    unlockMutation.mutate({
      lockdownId: selectedLockdown.id,
      confirmationCode,
      reason: unlockReason,
    })
  }

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-red-600" />
            SENTINEL Recovery Console
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Emergency lockdown management  -  Managing Partner access only
          </p>
        </div>
        <Badge
          variant="outline"
          className={
            activeLockdowns.length > 0
              ? 'bg-red-50 text-red-700 border-red-200'
              : 'bg-green-50 text-green-700 border-green-200'
          }
        >
          {activeLockdowns.length > 0 ? (
            <>
              <AlertTriangle className="h-3 w-3 mr-1" />
              {activeLockdowns.length} Active Lockdown{activeLockdowns.length !== 1 ? 's' : ''}
            </>
          ) : (
            <>
              <CheckCircle2 className="h-3 w-3 mr-1" />
              All Clear
            </>
          )}
        </Badge>
      </div>

      {/* ── Active Lockdowns ────────────────────────────────────────────── */}
      <Card className={activeLockdowns.length > 0 ? 'border-red-200' : ''}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Lock className="h-5 w-5 text-red-500" />
            Active Lockdowns
          </CardTitle>
          <CardDescription>
            Matters and users currently under emergency lockdown. Complete a
            biometric handshake to restore access.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : activeLockdowns.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title="No active lockdowns"
              description="All matters and users are operating normally."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Trigger</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Matter</TableHead>
                  <TableHead>Events</TableHead>
                  <TableHead>Locked</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeLockdowns.map((lockdown) => (
                  <TableRow key={lockdown.id} className="bg-red-50/50">
                    <TableCell>
                      <Badge variant="destructive" className="text-xs">
                        {lockdown.trigger_event}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {lockdown.user_id.slice(0, 8)}...
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {lockdown.matter_id ? `${lockdown.matter_id.slice(0, 8)}...` : ' - '}
                    </TableCell>
                    <TableCell>
                      <span className="font-bold text-red-600">{lockdown.trigger_count}</span>
                      <span className="text-xs text-muted-foreground ml-1">
                        in {lockdown.details?.window_minutes ?? 60}m
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(lockdown.locked_at), { addSuffix: true })}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-amber-700 border-amber-300 hover:bg-amber-50"
                        onClick={() => handleUnlockClick(lockdown)}
                      >
                        <KeyRound className="h-3.5 w-3.5 mr-1.5" />
                        Recover
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Resolution History ──────────────────────────────────────────── */}
      {resolvedLockdowns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Unlock className="h-5 w-5 text-green-500" />
              Resolution History
            </CardTitle>
            <CardDescription>
              Previously resolved lockdowns with full audit trail.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Locked</TableHead>
                  <TableHead>Resolved</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resolvedLockdowns.map((lockdown) => (
                  <TableRow key={lockdown.id}>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {lockdown.trigger_event}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(lockdown.locked_at), 'MMM d, HH:mm')}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {lockdown.unlocked_at
                        ? format(new Date(lockdown.unlocked_at), 'MMM d, HH:mm')
                        : ' - '}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {lockdown.details?.unlock_method === 'totp_verified'
                          ? 'TOTP Verified'
                          : lockdown.details?.unlock_method === 'code_fallback'
                            ? 'Code Fallback'
                            : 'Manual'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate">
                      {lockdown.details?.unlock_reason ?? ' - '}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ── Unlock Dialog (2FA Challenge) ───────────────────────────────── */}
      <Dialog open={showUnlockDialog} onOpenChange={setShowUnlockDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-amber-600" />
              Master Recovery  -  Biometric Handshake
            </DialogTitle>
            <DialogDescription>
              You are about to lift an emergency lockdown. This action requires
              2-factor authentication and will be permanently recorded in the
              SENTINEL audit trail.
            </DialogDescription>
          </DialogHeader>

          {selectedLockdown && (
            <div className="space-y-4 py-2">
              {/* Lockdown summary */}
              <div className="rounded-md border border-red-200 bg-red-50 p-3 space-y-1.5">
                <p className="text-xs font-medium text-red-800">
                  Lockdown: {selectedLockdown.trigger_event}
                </p>
                <p className="text-xs text-red-700">
                  {selectedLockdown.trigger_count} security event{selectedLockdown.trigger_count !== 1 ? 's' : ''}{' '}
                  detected within {selectedLockdown.details?.window_minutes ?? 60} minutes
                </p>
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Locked {formatDistanceToNow(new Date(selectedLockdown.locked_at), { addSuffix: true })}
                </p>
              </div>

              {/* 2FA Code */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">
                  Verification Code
                </Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="Enter 6-digit code"
                  value={confirmationCode}
                  onChange={(e) =>
                    setConfirmationCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  className="text-center text-lg tracking-[0.5em] font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Enter the code from your authenticator app (Norva App / Google Authenticator).
                </p>
              </div>

              {/* Reason */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">
                  Reason for Recovery
                </Label>
                <Textarea
                  placeholder="Explain why this lockdown is being lifted..."
                  value={unlockReason}
                  onChange={(e) => setUnlockReason(e.target.value)}
                  rows={3}
                  className="resize-none"
                />
              </div>

              {/* Identity */}
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <FileText className="h-3 w-3" />
                Authenticated as: {appUser?.email ?? 'Unknown'}  -  This action is
                immutably logged to SENTINEL.
              </p>

              {unlockMutation.isError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-2 flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                  <p className="text-xs text-red-700">{unlockMutation.error?.message}</p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowUnlockDialog(false)}
              disabled={unlockMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmUnlock}
              disabled={
                confirmationCode.length < 6 ||
                unlockReason.trim().length < 10 ||
                unlockMutation.isPending
              }
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {unlockMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  <Unlock className="h-4 w-4 mr-2" />
                  Confirm Recovery
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
