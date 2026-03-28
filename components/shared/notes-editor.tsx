'use client'

import { useState } from 'react'
import { useNotes, useCreateNote, useUpdateNote, useDeleteNote, useTogglePinNote } from '@/lib/queries/notes'
import { useUser } from '@/lib/hooks/use-user'
import { formatRelativeDate } from '@/lib/utils/formatters'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Pin,
  PinOff,
  MoreHorizontal,
  Pencil,
  Trash2,
  Loader2,
  StickyNote,
  Send,
} from 'lucide-react'

interface NotesEditorProps {
  tenantId: string
  matterId?: string
  contactId?: string
  leadId?: string
}

export function NotesEditor({ tenantId, matterId, contactId, leadId }: NotesEditorProps) {
  const { appUser } = useUser()
  const [newNote, setNewNote] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data: notes, isLoading } = useNotes({
    tenantId,
    matterId,
    contactId,
    leadId,
  })
  const createNote = useCreateNote()
  const updateNote = useUpdateNote()
  const deleteNote = useDeleteNote()
  const togglePin = useTogglePinNote()

  const handleCreate = async () => {
    if (!newNote.trim() || !appUser) return
    await createNote.mutateAsync({
      tenant_id: tenantId,
      matter_id: matterId || null,
      contact_id: contactId || null,
      lead_id: leadId || null,
      user_id: appUser.id,
      content: newNote.trim(),
    })
    setNewNote('')
  }

  const handleUpdate = async () => {
    if (!editingId || !editContent.trim()) return
    await updateNote.mutateAsync({ id: editingId, content: editContent.trim() })
    setEditingId(null)
    setEditContent('')
  }

  const handleDelete = async () => {
    if (!deleteId) return
    await deleteNote.mutateAsync(deleteId)
    setDeleteId(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleCreate()
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Add note form */}
      <div className="flex gap-2">
        <Textarea
          placeholder="Add a note... (Ctrl+Enter to send)"
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          className="resize-none"
        />
        <Button
          size="icon"
          onClick={handleCreate}
          disabled={!newNote.trim() || createNote.isPending}
          className="flex-shrink-0 self-end"
        >
          {createNote.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Notes list */}
      {notes && notes.length > 0 ? (
        <div className="space-y-3">
          {notes.map((note) => (
            <div
              key={note.id}
              className={`p-3 rounded-lg border ${
                note.is_pinned ? 'border-amber-500/20 bg-amber-950/30/50' : 'bg-white'
              }`}
            >
              {editingId === note.id ? (
                <div className="space-y-2">
                  <Textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={3}
                    className="resize-none"
                    autoFocus
                  />
                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setEditingId(null); setEditContent('') }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleUpdate}
                      disabled={updateNote.isPending}
                    >
                      {updateNote.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-slate-700 whitespace-pre-wrap flex-1">{note.content}</p>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => togglePin.mutate({ id: note.id, isPinned: note.is_pinned })}
                        >
                          {note.is_pinned ? (
                            <><PinOff className="mr-2 h-4 w-4" /> Unpin</>
                          ) : (
                            <><Pin className="mr-2 h-4 w-4" /> Pin</>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => { setEditingId(note.id); setEditContent(note.content) }}
                        >
                          <Pencil className="mr-2 h-4 w-4" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setDeleteId(note.id)}
                          className="text-red-600"
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="flex items-center gap-2 mt-2 text-xs text-slate-400">
                    {note.is_pinned && (
                      <Pin className="h-3 w-3 text-amber-500" />
                    )}
                    <span>{formatRelativeDate(note.created_at)}</span>
                    {note.updated_at !== note.created_at && (
                      <span>(edited)</span>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-slate-500">
          <StickyNote className="mx-auto h-8 w-8 text-slate-300 mb-2" />
          <p className="text-sm">No notes yet</p>
          <p className="text-xs text-slate-400">Add a note above to get started</p>
        </div>
      )}

      {/* Delete confirmation */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Note</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this note? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteNote.isPending}>
              {deleteNote.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
