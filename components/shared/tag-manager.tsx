'use client'

import { useState } from 'react'
import { useEntityTags, useTags, useCreateTag, useAddTagToEntity, useRemoveTagFromEntity } from '@/lib/queries/tags'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, X, Tag, Loader2 } from 'lucide-react'

const TAG_COLORS = [
  '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6b7280',
]

interface TagManagerProps {
  entityType: string
  entityId: string
  tenantId: string
}

export function TagManager({ entityType, entityId, tenantId }: TagManagerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedColor, setSelectedColor] = useState(TAG_COLORS[0])

  const { data: entityTags, isLoading: tagsLoading } = useEntityTags(entityType, entityId, tenantId)
  const { data: allTags } = useTags({ tenantId, entityType })
  const createTag = useCreateTag()
  const addTag = useAddTagToEntity()
  const removeTag = useRemoveTagFromEntity()

  const entityTagIds = new Set(entityTags?.map((t) => t.id) || [])
  const availableTags = allTags?.filter((t) => !entityTagIds.has(t.id)) || []
  const filteredTags = search
    ? availableTags.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()))
    : availableTags

  const canCreateNew = search && !allTags?.some(
    (t) => t.name.toLowerCase() === search.toLowerCase()
  )

  const handleAddExisting = async (tagId: string) => {
    await addTag.mutateAsync({
      tenant_id: tenantId,
      tag_id: tagId,
      entity_type: entityType,
      entity_id: entityId,
    })
    setSearch('')
  }

  const handleCreateAndAdd = async () => {
    if (!search.trim()) return
    const newTag = await createTag.mutateAsync({
      tenant_id: tenantId,
      name: search.trim(),
      color: selectedColor,
      entity_type: entityType,
    })
    await addTag.mutateAsync({
      tenant_id: tenantId,
      tag_id: newTag.id,
      entity_type: entityType,
      entity_id: entityId,
    })
    setSearch('')
    setSelectedColor(TAG_COLORS[0])
  }

  const handleRemove = async (tagId: string) => {
    await removeTag.mutateAsync({
      entityType,
      entityId,
      tagId,
      tenantId,
    })
  }

  if (tagsLoading) {
    return <Skeleton className="h-8 w-48" />
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {entityTags?.map((tag) => (
        <Badge
          key={tag.id}
          variant="outline"
          className="gap-1 pr-1"
          style={{ borderColor: tag.color, color: tag.color }}
        >
          {tag.name}
          <button
            onClick={() => handleRemove(tag.id)}
            className="ml-0.5 rounded-full p-0.5 hover:bg-slate-100"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-slate-500">
            <Plus className="h-3 w-3" />
            Add Label
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3" align="start">
          <div className="space-y-3">
            <Input
              placeholder="Search or create label..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8"
              autoFocus
            />

            {filteredTags.length > 0 && (
              <div className="max-h-32 overflow-y-auto space-y-1">
                {filteredTags.map((tag) => (
                  <button
                    key={tag.id}
                    onClick={() => handleAddExisting(tag.id)}
                    className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-slate-100 text-left"
                  >
                    <div
                      className="h-3 w-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: tag.color }}
                    />
                    {tag.name}
                  </button>
                ))}
              </div>
            )}

            {canCreateNew && (
              <div className="border-t pt-2">
                <p className="text-xs text-slate-500 mb-2">Create new label</p>
                <div className="flex gap-1 mb-2">
                  {TAG_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setSelectedColor(color)}
                      className={`h-5 w-5 rounded-full transition-all ${
                        selectedColor === color ? 'ring-2 ring-offset-1 ring-slate-400' : ''
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <Button
                  size="sm"
                  className="w-full h-7 text-xs"
                  onClick={handleCreateAndAdd}
                  disabled={createTag.isPending || addTag.isPending}
                >
                  {(createTag.isPending || addTag.isPending) && (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  )}
                  Create &quot;{search}&quot;
                </Button>
              </div>
            )}

            {!filteredTags.length && !canCreateNew && (
              <p className="text-xs text-center text-slate-400 py-2">
                {search ? 'No matching labels' : 'No labels available'}
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
