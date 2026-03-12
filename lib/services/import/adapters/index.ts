/**
 * Platform adapter registry.
 *
 * Provides lookup by platform key for use in the import engine and API routes.
 */

import type { PlatformAdapter, SourcePlatform } from '../types'
import { ghlAdapter } from './ghl'
import { clioAdapter } from './clio'
import { officioAdapter } from './officio'

const adapters: Record<SourcePlatform, PlatformAdapter> = {
  ghl: ghlAdapter,
  clio: clioAdapter,
  officio: officioAdapter,
}

export function getAdapter(platform: SourcePlatform): PlatformAdapter {
  const adapter = adapters[platform]
  if (!adapter) {
    throw new Error(`Unknown platform: ${platform}`)
  }
  return adapter
}

export function getAllAdapters(): PlatformAdapter[] {
  return Object.values(adapters)
}

export { ghlAdapter, clioAdapter, officioAdapter }
