'use client'

import { useState } from 'react'
import { formatDate, formatFullName } from '@/lib/utils/formatters'
import type { EmailLogWithJoins } from '@/lib/queries/email-logs'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
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
import {
  ArrowUpRight,
  ArrowDownLeft,
  Trash2,
  Mail,
} from 'lucide-react'

// ── Props ───────────────────────────────────────────────────────────────────

interface EmailLogTableProps {
  emails: EmailLogWithJoins[]
  isLoading: boolean
  onDelete: (id: string) => void
}

// ── Component ───────────────────────────────────────────────────────────────

export function EmailLogTable({ emails, isLoading, onDelete }: EmailLogTableProps) {
  const [selectedEmail, setSelectedEmail] = useState<EmailLogWithJoins | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  if (isLoading) {
    return <EmailLogTableSkeleton />
  }

  if (emails.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <Mail className="h-7 w-7 text-muted-foreground" />
        </div>
        <h3 className="text-base font-semibold text-foreground">No emails logged yet</h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Start logging your email correspondence to keep track of client communications.
        </p>
      </div>
    )
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40px]" />
            <TableHead>Subject</TableHead>
            <TableHead>From / To</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Matter</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="w-[60px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {emails.map((email) => {
            const contactName = email.contacts
              ? formatFullName(email.contacts.first_name, email.contacts.last_name) || 'Unnamed'
              : null
            const isOutbound = email.direction === 'outbound'

            return (
              <TableRow
                key={email.id}
                className="cursor-pointer hover:bg-slate-50"
                onClick={() => setSelectedEmail(email)}
              >
                {/* Direction icon */}
                <TableCell>
                  {isOutbound ? (
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-950/30">
                      <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600" />
                    </div>
                  ) : (
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-950/30">
                      <ArrowDownLeft className="h-3.5 w-3.5 text-blue-600" />
                    </div>
                  )}
                </TableCell>

                {/* Subject */}
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium text-slate-900 truncate max-w-[250px]">
                      {email.subject}
                    </span>
                    <Badge
                      variant="outline"
                      className={`mt-0.5 w-fit text-[10px] ${
                        isOutbound
                          ? 'border-emerald-500/20 text-emerald-400'
                          : 'border-blue-500/20 text-blue-400'
                      }`}
                    >
                      {isOutbound ? 'Sent' : 'Received'}
                    </Badge>
                  </div>
                </TableCell>

                {/* From / To */}
                <TableCell>
                  <div className="text-sm text-slate-600 truncate max-w-[200px]">
                    {isOutbound
                      ? email.to_addresses?.[0] ?? '-'
                      : email.from_address}
                  </div>
                  {isOutbound && email.to_addresses && email.to_addresses.length > 1 && (
                    <span className="text-xs text-muted-foreground">
                      +{email.to_addresses.length - 1} more
                    </span>
                  )}
                </TableCell>

                {/* Contact */}
                <TableCell>
                  {contactName ? (
                    <span className="text-sm text-slate-600">{contactName}</span>
                  ) : (
                    <span className="text-sm text-muted-foreground">-</span>
                  )}
                </TableCell>

                {/* Matter */}
                <TableCell>
                  {email.matters ? (
                    <span className="text-sm text-slate-600 truncate max-w-[150px] block">
                      {email.matters.title}
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">-</span>
                  )}
                </TableCell>

                {/* Date */}
                <TableCell className="text-sm text-slate-600">
                  {formatDate(email.sent_at)}
                </TableCell>

                {/* Actions */}
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteId(email.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      {/* Detail Sheet */}
      <Sheet open={!!selectedEmail} onOpenChange={() => setSelectedEmail(null)}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {selectedEmail && (
            <>
              <SheetHeader>
                <SheetTitle className="text-lg">{selectedEmail.subject}</SheetTitle>
                <SheetDescription>
                  {selectedEmail.direction === 'outbound' ? 'Sent' : 'Received'} on{' '}
                  {formatDate(selectedEmail.sent_at, 'dd-MMM-yyyy h:mm a')}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-4">
                {/* Direction */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Direction
                  </p>
                  <Badge
                    variant="outline"
                    className={`mt-1 ${
                      selectedEmail.direction === 'outbound'
                        ? 'border-emerald-500/20 text-emerald-400'
                        : 'border-blue-500/20 text-blue-400'
                    }`}
                  >
                    {selectedEmail.direction === 'outbound' ? 'Sent' : 'Received'}
                  </Badge>
                </div>

                {/* From */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    From
                  </p>
                  <p className="mt-0.5 text-sm">{selectedEmail.from_address}</p>
                </div>

                {/* To */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    To
                  </p>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {selectedEmail.to_addresses?.map((addr) => (
                      <Badge key={addr} variant="secondary" className="text-xs">
                        {addr}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* CC */}
                {selectedEmail.cc_addresses && selectedEmail.cc_addresses.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      CC
                    </p>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {selectedEmail.cc_addresses.map((addr) => (
                        <Badge key={addr} variant="secondary" className="text-xs">
                          {addr}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* BCC */}
                {selectedEmail.bcc_addresses && selectedEmail.bcc_addresses.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      BCC
                    </p>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {selectedEmail.bcc_addresses.map((addr) => (
                        <Badge key={addr} variant="secondary" className="text-xs">
                          {addr}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Contact */}
                {selectedEmail.contacts && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Linked Contact
                    </p>
                    <p className="mt-0.5 text-sm">
                      {formatFullName(
                        selectedEmail.contacts.first_name,
                        selectedEmail.contacts.last_name
                      ) || 'Unnamed'}
                    </p>
                  </div>
                )}

                {/* Matter */}
                {selectedEmail.matters && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Linked Matter
                    </p>
                    <p className="mt-0.5 text-sm">{selectedEmail.matters.title}</p>
                  </div>
                )}

                {/* Logged by */}
                {selectedEmail.users && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Logged By
                    </p>
                    <p className="mt-0.5 text-sm">
                      {formatFullName(
                        selectedEmail.users.first_name,
                        selectedEmail.users.last_name
                      ) || 'Unknown'}
                    </p>
                  </div>
                )}

                {/* Body */}
                {selectedEmail.body && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Body
                    </p>
                    <div className="mt-1 rounded-md border bg-slate-50 p-3 text-sm whitespace-pre-wrap">
                      {selectedEmail.body}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove email log?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the email log from view. This action can be undone by an administrator.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteId) {
                  onDelete(deleteId)
                  setDeleteId(null)
                }
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// ── Skeleton ────────────────────────────────────────────────────────────────

function EmailLogTableSkeleton() {
  return (
    <div className="space-y-0">
      {/* Header skeleton */}
      <div className="flex items-center gap-4 border-b px-4 py-3">
        <Skeleton className="h-4 w-8" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-8" />
      </div>
      {/* Row skeletons */}
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b px-4 py-3">
          <Skeleton className="h-7 w-7 rounded-full" />
          <div className="space-y-1">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-14" />
          </div>
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-8 w-8 rounded" />
        </div>
      ))}
    </div>
  )
}
