import { Skeleton } from '@/components/ui/skeleton'

export default function SettingsLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-28" />
        <Skeleton className="mt-1 h-4 w-64" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-white p-6 space-y-3">
            <Skeleton className="h-5 w-[30%]" />
            <Skeleton className="h-4 w-[60%]" />
          </div>
        ))}
      </div>
    </div>
  )
}
