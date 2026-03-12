'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Cloud, File, Folder, ChevronRight, ArrowLeft, Link2, Loader2 } from 'lucide-react'
import {
  useMicrosoftConnection,
  useUpdateMicrosoftSettings,
  useOneDriveBrowse,
  useLinkOneDriveFile,
} from '@/lib/queries/microsoft-integration'

interface OneDriveBrowserProps {
  userId: string
}

export function OneDriveBrowser({ userId }: OneDriveBrowserProps) {
  const { data: connection } = useMicrosoftConnection(userId)
  const updateSettings = useUpdateMicrosoftSettings()

  if (!connection) return null

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Cloud className="h-5 w-5" />
              OneDrive
            </CardTitle>
            <CardDescription>
              Browse and link files from your OneDrive to matters and contacts.
            </CardDescription>
          </div>
          <Switch
            checked={connection.onedrive_enabled}
            onCheckedChange={(checked) =>
              updateSettings.mutate({ onedrive_enabled: checked })
            }
            disabled={updateSettings.isPending}
          />
        </div>
      </CardHeader>
      {connection.onedrive_enabled && (
        <CardContent>
          <OneDriveDialog userId={userId} />
        </CardContent>
      )}
    </Card>
  )
}

function OneDriveDialog({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false)
  const [currentPath, setCurrentPath] = useState<string | undefined>(undefined)
  const [pathHistory, setPathHistory] = useState<string[]>([])

  const { data: items, isLoading } = useOneDriveBrowse(userId, currentPath, open)
  const linkFile = useLinkOneDriveFile()

  function navigateToFolder(folderName: string) {
    const newPath = currentPath ? `${currentPath}/${folderName}` : folderName
    setPathHistory((prev) => [...prev, currentPath || ''])
    setCurrentPath(newPath)
  }

  function navigateBack() {
    const prev = pathHistory[pathHistory.length - 1]
    setPathHistory((h) => h.slice(0, -1))
    setCurrentPath(prev || undefined)
  }

  function handleLink(itemId: string) {
    linkFile.mutate(
      { oneDriveItemId: itemId },
      { onSuccess: () => setOpen(false) }
    )
  }

  function formatSize(bytes: number | null) {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Folder className="h-4 w-4" />
          Browse OneDrive
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>OneDrive Files</DialogTitle>
          <DialogDescription>
            Select a file to link it to NorvaOS.
          </DialogDescription>
        </DialogHeader>

        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-sm text-muted-foreground border-b pb-2">
          {(currentPath || pathHistory.length > 0) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1"
              onClick={navigateBack}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </Button>
          )}
          <button
            className="hover:text-foreground transition-colors"
            onClick={() => {
              setCurrentPath(undefined)
              setPathHistory([])
            }}
          >
            OneDrive
          </button>
          {currentPath?.split('/').map((segment, i, arr) => (
            <span key={i} className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3" />
              <button
                className="hover:text-foreground transition-colors"
                onClick={() => {
                  const newPath = arr.slice(0, i + 1).join('/')
                  setCurrentPath(newPath)
                  setPathHistory((prev) => prev.slice(0, i + 1))
                }}
              >
                {segment}
              </button>
            </span>
          ))}
        </div>

        {/* File List */}
        <ScrollArea className="h-[400px]">
          {isLoading ? (
            <div className="space-y-2 p-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !items || items.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
              This folder is empty
            </div>
          ) : (
            <div className="divide-y">
              {/* Folders first, then files */}
              {items
                .sort((a, b) => {
                  if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1
                  return a.name.localeCompare(b.name)
                })
                .map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between px-3 py-2.5 hover:bg-muted/50 rounded-sm transition-colors"
                  >
                    <div
                      className={`flex items-center gap-3 flex-1 min-w-0 ${item.isFolder ? 'cursor-pointer' : ''}`}
                      onClick={() => item.isFolder && navigateToFolder(item.name)}
                    >
                      {item.isFolder ? (
                        <Folder className="h-4 w-4 text-blue-500 shrink-0" />
                      ) : (
                        <File className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.isFolder ? 'Folder' : formatSize(item.size)}
                        </p>
                      </div>
                    </div>
                    {!item.isFolder && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 shrink-0"
                        disabled={linkFile.isPending}
                        onClick={() => handleLink(item.id)}
                      >
                        {linkFile.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Link2 className="h-3.5 w-3.5" />
                        )}
                        Link
                      </Button>
                    )}
                  </div>
                ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
