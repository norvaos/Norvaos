'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { Loader2, Plug, Unplug } from 'lucide-react'
import {
  useMicrosoftConnection,
  useDisconnectMicrosoft,
} from '@/lib/queries/microsoft-integration'

interface MicrosoftConnectionCardProps {
  userId: string
}

export function MicrosoftConnectionCard({ userId }: MicrosoftConnectionCardProps) {
  const { data: connection, isLoading } = useMicrosoftConnection(userId)
  const disconnect = useDisconnectMicrosoft()
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false)

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MicrosoftIcon />
            Microsoft 365
          </CardTitle>
          <CardDescription>Loading connection status...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm text-muted-foreground">Checking...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!connection) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MicrosoftIcon />
            Microsoft 365
          </CardTitle>
          <CardDescription>
            Connect your Microsoft account to sync calendar events, tasks, and access OneDrive files.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() => {
              window.location.href = '/api/integrations/microsoft/connect'
            }}
            className="gap-2"
          >
            <Plug className="h-4 w-4" />
            Connect with Microsoft
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MicrosoftIcon />
                Microsoft 365
                <Badge variant="default" className="bg-green-600 text-xs">
                  Connected
                </Badge>
              </CardTitle>
              <CardDescription className="mt-1">
                {connection.microsoft_display_name && (
                  <span className="font-medium">{connection.microsoft_display_name}</span>
                )}
                {connection.microsoft_display_name && '  -  '}
                {connection.microsoft_email}
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-destructive hover:text-destructive"
              onClick={() => setShowDisconnectDialog(true)}
            >
              <Unplug className="h-3.5 w-3.5" />
              Disconnect
            </Button>
          </div>
        </CardHeader>
        {connection.error_count > 0 && connection.last_error && (
          <CardContent className="pt-0">
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              Sync error: {connection.last_error}
              {connection.error_count >= 10 && (
                <span className="block mt-1 font-medium">
                  Sync has been paused due to repeated failures. Please reconnect.
                </span>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      <AlertDialog open={showDisconnectDialog} onOpenChange={setShowDisconnectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Microsoft Account?</AlertDialogTitle>
            <AlertDialogDescription>
              This will stop syncing your calendar events, tasks, and OneDrive access.
              Your existing synced data will remain in NorvaOS.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                disconnect.mutate()
                setShowDisconnectDialog(false)
              }}
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function MicrosoftIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  )
}
