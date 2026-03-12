'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'
import { ChevronDown, History } from 'lucide-react'
import { useSyncHistory } from '@/lib/queries/microsoft-integration'
import { format } from 'date-fns'
import { useState } from 'react'

interface SyncHistoryTableProps {
  userId: string
}

export function SyncHistoryTable({ userId }: SyncHistoryTableProps) {
  const { data: history, isLoading } = useSyncHistory(userId)
  const [open, setOpen] = useState(false)

  if (isLoading || !history || history.length === 0) return null

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <History className="h-4 w-4" />
                  Sync History
                </CardTitle>
                <CardDescription>Recent synchronization activity</CardDescription>
              </div>
              <Button variant="ghost" size="sm">
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
                />
              </Button>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Changes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-xs">
                      {format(new Date(entry.started_at), 'MMM d, HH:mm')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs capitalize">
                        {entry.sync_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs capitalize">{entry.direction}</TableCell>
                    <TableCell>
                      <Badge
                        variant={entry.status === 'completed' ? 'default' : 'destructive'}
                        className={`text-xs ${entry.status === 'completed' ? 'bg-green-600' : ''}`}
                      >
                        {entry.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {entry.items_created > 0 && (
                        <span className="text-green-600">+{entry.items_created}</span>
                      )}
                      {entry.items_updated > 0 && (
                        <span className="text-blue-600 ml-1">~{entry.items_updated}</span>
                      )}
                      {entry.items_deleted > 0 && (
                        <span className="text-red-600 ml-1">-{entry.items_deleted}</span>
                      )}
                      {entry.items_created === 0 && entry.items_updated === 0 && entry.items_deleted === 0 && (
                        <span className="text-muted-foreground">No changes</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}
