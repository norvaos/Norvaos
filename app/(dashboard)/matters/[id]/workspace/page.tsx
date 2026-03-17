'use client'

import { useParams } from 'next/navigation'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import { useMatter } from '@/lib/queries/matters'
import { useMatterPeople } from '@/lib/queries/matter-profiles'
import { useImmigrationReadiness } from '@/lib/queries/immigration-readiness'
import { useDocumentSlots } from '@/lib/queries/document-slots'
import { useMatterImmigration } from '@/lib/queries/immigration'
import { WorkspaceShell } from '@/components/ircc/workspace/workspace-shell'
import { Skeleton } from '@/components/ui/skeleton'

export default function IRCCWorkspacePage() {
  const params = useParams()
  const matterId = params.id as string
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''
  const { appUser, fullName } = useUser()

  const { data: matter, isLoading: matterLoading } = useMatter(matterId)
  const { data: matterPeople, isLoading: peopleLoading } = useMatterPeople(matterId)
  const { data: readinessData } = useImmigrationReadiness(matterId)
  const { data: documentSlots } = useDocumentSlots(matterId)
  const { data: immigrationData } = useMatterImmigration(matterId)

  if (matterLoading || peopleLoading) {
    return (
      <div className="h-[calc(100vh-3.5rem)] flex flex-col gap-3 p-4 bg-background">
        <Skeleton className="h-14 w-full rounded-xl" />
        <div className="flex flex-1 gap-3 min-h-0">
          <Skeleton className="w-16 rounded-xl shrink-0" />
          <Skeleton className="flex-[2] rounded-xl" />
          <Skeleton className="flex-[2] rounded-xl" />
          <Skeleton className="w-80 rounded-xl shrink-0" />
        </div>
        <Skeleton className="h-9 w-full rounded-lg" />
      </div>
    )
  }

  if (!matter) return null

  const principalApplicant = matterPeople?.find(p => p.person_role === 'principal_applicant') ?? null

  return (
    <WorkspaceShell
      matterId={matterId}
      tenantId={tenantId}
      matter={matter}
      immigrationData={immigrationData ?? null}
      principalApplicant={principalApplicant}
      allPeople={matterPeople ?? []}
      readinessData={readinessData ?? null}
      documentSlots={documentSlots ?? []}
      currentUserId={appUser?.id ?? ''}
      currentUserName={fullName ?? ''}
    />
  )
}
