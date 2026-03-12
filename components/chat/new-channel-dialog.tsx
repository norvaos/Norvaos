'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Loader2 } from 'lucide-react'
import { useCreateChannel, useFindDirectChannel } from '@/lib/queries/chat'
import { useTeamMembers } from '@/lib/queries/reports'

interface NewChannelDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentUserId: string
  tenantId: string
  onChannelCreated?: (channelId: string) => void
}

export function NewChannelDialog({
  open,
  onOpenChange,
  currentUserId,
  tenantId,
  onChannelCreated,
}: NewChannelDialogProps) {
  const [channelName, setChannelName] = useState('')
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
  const [memberSearch, setMemberSearch] = useState('')

  const { data: teamMembers, isLoading: loadingMembers } = useTeamMembers(tenantId)
  const createChannel = useCreateChannel()
  const findDirect = useFindDirectChannel()

  const availableMembers = (teamMembers ?? []).filter(
    (m) => m.id !== currentUserId
  )

  const filteredMembers = memberSearch.trim()
    ? availableMembers.filter((m) =>
        m.full_name.toLowerCase().includes(memberSearch.toLowerCase())
      )
    : availableMembers

  const toggleMember = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    )
  }

  const handleCreate = () => {
    if (selectedUserIds.length === 0) return

    // 1-on-1: use findDirect (find or create)
    if (selectedUserIds.length === 1 && !channelName.trim()) {
      findDirect.mutate(selectedUserIds[0], {
        onSuccess: ({ channel }) => {
          onChannelCreated?.(channel.id)
          handleClose()
        },
      })
      return
    }

    // Group channel
    createChannel.mutate(
      {
        name: channelName.trim() || undefined,
        channel_type: 'group',
        member_ids: selectedUserIds,
      },
      {
        onSuccess: ({ channel }) => {
          onChannelCreated?.(channel.id)
          handleClose()
        },
      }
    )
  }

  const handleClose = () => {
    setChannelName('')
    setSelectedUserIds([])
    setMemberSearch('')
    onOpenChange(false)
  }

  const isPending = createChannel.isPending || findDirect.isPending

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Conversation</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Channel name (optional for group) */}
          <div className="space-y-1.5">
            <Label htmlFor="channel-name" className="text-xs">
              Channel name (optional)
            </Label>
            <Input
              id="channel-name"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              placeholder="e.g. General, Project Alpha"
              className="h-8 text-sm"
            />
          </div>

          {/* Member selection */}
          <div className="space-y-1.5">
            <Label className="text-xs">
              Members ({selectedUserIds.length} selected)
            </Label>
            <Input
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder="Search team members..."
              className="h-8 text-sm"
            />
            <ScrollArea className="h-[200px] rounded-md border">
              <div className="p-2">
                {loadingMembers ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredMembers.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">
                    No team members found
                  </p>
                ) : (
                  filteredMembers.map((member) => (
                    <label
                      key={member.id}
                      className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={selectedUserIds.includes(member.id)}
                        onCheckedChange={() => toggleMember(member.id)}
                      />
                      <span className="text-sm">{member.full_name}</span>
                    </label>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={selectedUserIds.length === 0 || isPending}
            >
              {isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              {selectedUserIds.length === 1 && !channelName.trim()
                ? 'Start Chat'
                : 'Create Channel'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
