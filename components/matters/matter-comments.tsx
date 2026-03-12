'use client'

import { useState, useRef, useCallback } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { MessageSquare, Send, Reply, Trash2, Lock, Globe } from 'lucide-react'
import { useUser } from '@/lib/hooks/use-user'
import {
  useMatterComments,
  useCreateMatterComment,
  useDeleteMatterComment,
  type MatterComment,
} from '@/lib/queries/matter-comments'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'

// ── Props ───────────────────────────────────────────────────────────────────

interface MatterCommentsProps {
  matterId: string
  tenantId: string
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getInitials(name: string | null): string {
  if (!name) return '?'
  return name
    .split(' ')
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function formatCommentTime(dateStr: string): string {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true })
  } catch {
    return ''
  }
}

// ── Single Comment ──────────────────────────────────────────────────────────

interface CommentItemProps {
  comment: MatterComment
  currentUserId: string | null
  matterId: string
  onReply: (commentId: string, authorName: string | null) => void
  depth: number
}

function CommentItem({ comment, currentUserId, matterId, onReply, depth }: CommentItemProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const deleteComment = useDeleteMatterComment()

  const isOwn = comment.author_type === 'user' && comment.author_user_id === currentUserId

  const handleDelete = useCallback(() => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    deleteComment.mutate({ commentId: comment.id, matterId })
    setConfirmDelete(false)
  }, [confirmDelete, deleteComment, comment.id, matterId])

  return (
    <div className={cn('group', depth > 0 && 'ml-8 border-l-2 border-muted pl-4')}>
      <div
        className={cn(
          'flex gap-3 rounded-lg p-3 transition-colors',
          comment.is_internal && 'bg-amber-50/60 dark:bg-amber-950/20'
        )}
      >
        {/* Avatar */}
        <Avatar size="sm" className="mt-0.5 shrink-0">
          {comment.authorAvatarUrl && <AvatarImage src={comment.authorAvatarUrl} alt={comment.authorName ?? ''} />}
          <AvatarFallback>{getInitials(comment.authorName)}</AvatarFallback>
        </Avatar>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{comment.authorName ?? 'Unknown'}</span>
            {comment.is_internal && (
              <Badge variant="outline" className="gap-1 text-xs text-amber-700 border-amber-300">
                <Lock className="size-3" />
                Internal
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              {formatCommentTime(comment.created_at)}
            </span>
          </div>
          <p className="mt-1 text-sm text-foreground whitespace-pre-wrap break-words">
            {comment.content}
          </p>

          {/* Actions */}
          <div className="mt-1.5 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground"
              onClick={() => onReply(comment.id, comment.authorName)}
            >
              <Reply className="size-3 mr-1" />
              Reply
            </Button>
            {isOwn && (
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'h-6 px-2 text-xs',
                  confirmDelete
                    ? 'text-destructive hover:text-destructive'
                    : 'text-muted-foreground'
                )}
                onClick={handleDelete}
                onBlur={() => setConfirmDelete(false)}
              >
                <Trash2 className="size-3 mr-1" />
                {confirmDelete ? 'Confirm?' : 'Delete'}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Replies */}
      {comment.replies.length > 0 && (
        <div className="mt-1 space-y-1">
          {comment.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              currentUserId={currentUserId}
              matterId={matterId}
              onReply={onReply}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────────────

export function MatterComments({ matterId, tenantId }: MatterCommentsProps) {
  const { appUser } = useUser()
  const { data: comments, isLoading } = useMatterComments(matterId)
  const createComment = useCreateMatterComment()

  const [content, setContent] = useState('')
  const [isInternal, setIsInternal] = useState(true)
  const [parentId, setParentId] = useState<string | null>(null)
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'internal'>('all')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleReply = useCallback((commentId: string, authorName: string | null) => {
    setParentId(commentId)
    setReplyingTo(authorName)
    textareaRef.current?.focus()
  }, [])

  const cancelReply = useCallback(() => {
    setParentId(null)
    setReplyingTo(null)
  }, [])

  const handleSubmit = useCallback(() => {
    if (!content.trim() || !appUser) return

    createComment.mutate(
      {
        tenant_id: tenantId,
        matter_id: matterId,
        parent_id: parentId,
        author_type: 'user',
        author_user_id: appUser.id,
        content: content.trim(),
        is_internal: isInternal,
      },
      {
        onSuccess: () => {
          setContent('')
          setParentId(null)
          setReplyingTo(null)
        },
      }
    )
  }, [content, appUser, createComment, tenantId, matterId, parentId, isInternal])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  // Filter comments
  const filteredComments = filter === 'internal'
    ? filterInternalComments(comments ?? [])
    : comments ?? []

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-3 p-3">
            <div className="size-6 rounded-full bg-muted animate-pulse shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-32 bg-muted animate-pulse rounded" />
              <div className="h-4 w-full bg-muted animate-pulse rounded" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filter Toggle */}
      <div className="flex items-center gap-2">
        <Button
          variant={filter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('all')}
          className="gap-1.5"
        >
          <Globe className="size-3.5" />
          All Comments
        </Button>
        <Button
          variant={filter === 'internal' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('internal')}
          className="gap-1.5"
        >
          <Lock className="size-3.5" />
          Internal Only
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">
          {(comments ?? []).length} comment{(comments ?? []).length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Comments List */}
      {filteredComments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <MessageSquare className="size-10 text-muted-foreground/40 mb-3" />
          <h3 className="text-sm font-medium text-muted-foreground">No comments yet</h3>
          <p className="text-sm text-muted-foreground/70 mt-1 max-w-sm">
            Start a discussion about this matter. Comments can be internal (staff only) or visible to clients.
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {filteredComments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              currentUserId={appUser?.id ?? null}
              matterId={matterId}
              onReply={handleReply}
              depth={0}
            />
          ))}
        </div>
      )}

      {/* Compose Area */}
      <div className="border-t pt-4 space-y-3">
        {/* Reply indicator */}
        {replyingTo && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
            <Reply className="size-3.5" />
            <span>
              Replying to <span className="font-medium text-foreground">{replyingTo}</span>
            </span>
            <Button variant="ghost" size="sm" className="ml-auto h-5 px-1.5 text-xs" onClick={cancelReply}>
              Cancel
            </Button>
          </div>
        )}

        <Textarea
          ref={textareaRef}
          placeholder="Write a comment..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          className="min-h-20 resize-none"
        />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Checkbox
              id="internal-note"
              checked={isInternal}
              onCheckedChange={(checked) => setIsInternal(checked === true)}
            />
            <label
              htmlFor="internal-note"
              className="text-sm text-muted-foreground cursor-pointer select-none flex items-center gap-1.5"
            >
              <Lock className="size-3" />
              Internal note (staff only)
            </label>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'}+Enter to send
            </span>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!content.trim() || createComment.isPending}
              className="gap-1.5"
            >
              <Send className="size-3.5" />
              {createComment.isPending ? 'Sending...' : 'Send'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Helper: recursively filter for internal-only comments ───────────────────

function filterInternalComments(comments: MatterComment[]): MatterComment[] {
  return comments
    .filter((c) => c.is_internal)
    .map((c) => ({
      ...c,
      replies: filterInternalComments(c.replies),
    }))
}
