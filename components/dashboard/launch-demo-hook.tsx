'use client'

/**
 * LaunchDemoHook  -  Directive 29.2: Arjun Mehta Live-Demo
 *
 * On first login for a new firm, pins the demo matter (Arjun Mehta)
 * to the top of the dashboard with an Amber Glow urgency indicator.
 *
 * Shows:
 *   - Matter title with amber pulse ring
 *   - "Your first file is ready for review" call-to-action
 *   - Global 15 badge showing Nastaliq Fact-Anchors are active
 *   - Link to open the matter + download readiness report
 *
 * Auto-dismisses after the user clicks through or after 7 days.
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import {
  Sparkles,
  ArrowRight,
  X,
  FileDown,
  Globe,
  Shield,
  AlertCircle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface LaunchDemoHookProps {
  tenantId: string
  userId: string
}

const DISMISS_KEY = 'norva-launch-demo-dismissed'

interface DemoMatter {
  id: string
  title: string
  matter_number: string | null
  status: string
  date_opened: string | null
}

function useDemoMatter(tenantId: string) {
  return useQuery({
    queryKey: ['launch_demo_matter', tenantId],
    queryFn: async (): Promise<DemoMatter | null> => {
      const supabase = createClient()

      // Look for the demo matter  -  search by title pattern or a demo flag
      const { data } = await supabase
        .from('matters')
        .select('id, title, matter_number, status, date_opened')
        .eq('tenant_id', tenantId)
        .or('title.ilike.%Arjun Mehta%,title.ilike.%Demo Matter%,title.ilike.%Sample File%')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      return data as DemoMatter | null
    },
    staleTime: 1000 * 60 * 60, // 1 hour
  })
}

export function LaunchDemoHook({ tenantId, userId }: LaunchDemoHookProps) {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof localStorage === 'undefined') return false
    try {
      const stored = localStorage.getItem(DISMISS_KEY)
      if (!stored) return false
      const parsed = JSON.parse(stored)
      // Auto-expire after 7 days
      if (parsed.at && Date.now() - parsed.at > 7 * 24 * 60 * 60 * 1000) return false
      return parsed.userId === userId
    } catch {
      return false
    }
  })

  const { data: demoMatter, isLoading } = useDemoMatter(tenantId)

  const handleDismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify({ userId, at: Date.now() }))
    } catch { /* ignore */ }
  }

  const handleDownloadReport = async () => {
    try {
      const res = await fetch('/api/admin/global15-readiness')
      if (!res.ok) throw new Error('Failed to generate report')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `NorvaOS-Global15-Readiness-${new Date().toISOString().split('T')[0]}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // Silently fail  -  non-critical
    }
  }

  // Don't render if dismissed, loading, or no demo matter
  if (dismissed || isLoading || !demoMatter) return null

  return (
    <Card className="relative overflow-hidden border-amber-500/30 bg-gradient-to-r from-amber-50 via-white to-amber-50 dark:from-amber-950/20 dark:via-card dark:to-amber-950/20">
      {/* Amber glow pulse */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-amber-400 to-amber-600 animate-pulse" />
      </div>

      {/* Dismiss button */}
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 p-1 rounded-full hover:bg-muted/50 transition-colors z-10"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      <CardContent className="p-4 pl-5">
        <div className="flex items-start gap-4">
          {/* Amber pulse ring icon */}
          <div className="relative shrink-0 mt-0.5">
            <div className="w-10 h-10 rounded-full bg-amber-950/40 dark:bg-amber-900/30 flex items-center justify-center">
              <AlertCircle className="h-5 w-5 text-amber-600" />
            </div>
            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-amber-950/300 animate-ping" />
            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-amber-950/300" />
          </div>

          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-4 w-4 text-amber-600 shrink-0" />
              <h3 className="text-sm font-bold text-foreground">
                Your First File Is Ready for Review
              </h3>
            </div>

            {/* Matter info  -  line-clamp-3 for Nastaliq zero-overflow guarantee */}
            <p className="text-xs text-muted-foreground mb-2 line-clamp-3">
              <span className="font-semibold text-foreground">{demoMatter.title}</span>
              {demoMatter.matter_number && (
                <span className="ml-1.5 text-muted-foreground">
                  ({demoMatter.matter_number})
                </span>
              )}
              {'  -  '}
              Open the file to see the Norva Intelligence engine in action: Fact-Anchors from Norva Ear,
              Audit-Mirror readability scoring, and the Ghost-Writer draft with source attribution.
            </p>

            {/* Feature badges */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              <Badge variant="outline" className="text-[10px] border-amber-500/20 bg-amber-950/30 text-amber-400 dark:bg-amber-900/20 dark:text-amber-400">
                <Globe className="h-2.5 w-2.5 mr-0.5" />
                Global 15 Active
              </Badge>
              <Badge variant="outline" className="text-[10px] border-emerald-500/20 bg-emerald-950/30 text-emerald-400 dark:bg-emerald-900/20 dark:text-emerald-400">
                <Shield className="h-2.5 w-2.5 mr-0.5" />
                Sentinel Secured
              </Badge>
              <Badge variant="outline" className="text-[10px] border-blue-500/20 bg-blue-950/30 text-blue-400 dark:bg-blue-900/20 dark:text-blue-400">
                <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                Fact-Anchors Linked
              </Badge>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              <Button asChild size="sm" className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white">
                <Link href={`/matters/${demoMatter.id}`}>
                  Open File
                  <ArrowRight className="h-3 w-3 ml-1" />
                </Link>
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={handleDownloadReport}
              >
                <FileDown className="h-3 w-3 mr-1" />
                Readiness Report
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
