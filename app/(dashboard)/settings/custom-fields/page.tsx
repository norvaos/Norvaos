import Link from 'next/link'
import { Settings2, ArrowRight, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function CustomFieldsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Custom Fields</h1>
        <p className="text-muted-foreground">
          Define custom fields for your matter types.
        </p>
      </div>
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-violet-50 mb-4">
          <Sparkles className="h-7 w-7 text-violet-500" />
        </div>
        <h3 className="text-lg font-medium">Custom Fields per Matter Type</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-md">
          Custom fields are configured per matter type. Select a matter type, expand the
          &ldquo;Case Details Sections&rdquo; panel, then add, edit, reorder, or delete
          custom fields for each section.
        </p>
        <Button asChild className="mt-6 gap-2" variant="default">
          <Link href="/settings/matter-types">
            <Settings2 className="h-4 w-4" />
            Go to Matter Types
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  )
}
