'use client'

/**
 * IronCanvasGuard — Directive 25.0: Long-String Overflow Prevention
 *
 * Wraps any text element with truncation + hover tooltip.
 * Prevents layout drift from long legal terms in translated UI.
 *
 * Usage:
 *   <IronCanvasGuard maxWidth={200}>
 *     {t('legal_term.humanitarian_compassionate')}
 *   </IronCanvasGuard>
 */

import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

interface IronCanvasGuardProps {
  children: ReactNode
  /** Max width in px (default: none — uses parent constraint) */
  maxWidth?: number
  /** Override the tooltip text (defaults to children if string) */
  title?: string
  /** Additional class names */
  className?: string
  /** HTML tag (default: span) */
  as?: 'span' | 'div' | 'p' | 'h1' | 'h2' | 'h3' | 'h4'
}

export function IronCanvasGuard({
  children,
  maxWidth,
  title,
  className,
  as: Tag = 'span',
}: IronCanvasGuardProps) {
  const tooltipText = title ?? (typeof children === 'string' ? children : undefined)

  return (
    <Tag
      className={cn('iron-canvas-guard', className)}
      style={maxWidth ? { maxWidth: `${maxWidth}px` } : undefined}
      title={tooltipText}
    >
      {children}
    </Tag>
  )
}
