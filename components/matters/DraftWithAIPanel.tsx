'use client'

/**
 * DraftWithAIPanel — Smart Component (Directive 21.0)
 *
 * Context-aware Intelligence Panel that detects its mount location:
 *   - "overview"     → Compact summary card (Audit Score, Fact count, Drift status)
 *   - "intelligence"  → Full three-column deep-work HUD
 *   - "modal" (default) → Floating button → full-screen modal
 *
 * Usage:
 *   <DraftWithAIPanel matterId={id} matterTitle={title} />
 *   <DraftWithAIPanel matterId={id} matterTitle={title} mountContext="overview" />
 *   <DraftWithAIPanel matterId={id} matterTitle={title} mountContext="intelligence" />
 */

import { AiDraftPanel } from '@/components/matters/ai-draft-panel'

interface DraftWithAIPanelProps {
  matterId: string
  matterTitle: string | null
  /** Mount context — auto-detected from parent or explicitly set */
  mountContext?: 'overview' | 'intelligence' | 'modal'
}

export function DraftWithAIPanel({
  matterId,
  matterTitle,
  mountContext = 'modal',
}: DraftWithAIPanelProps) {
  return (
    <AiDraftPanel
      matterId={matterId}
      matterTitle={matterTitle}
      mountContext={mountContext}
    />
  )
}
