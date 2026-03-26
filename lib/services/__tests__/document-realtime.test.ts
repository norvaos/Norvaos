import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock factories are hoisted  -  use inline functions (no top-level variable refs)
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    channel: vi.fn(() => ({ send: vi.fn().mockResolvedValue(undefined) })),
    removeChannel: vi.fn(),
  })),
}))

vi.mock('@/lib/utils/logger', () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
  },
}))

import { broadcastDocumentStatus } from '../document-realtime'
import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/utils/logger'

describe('broadcastDocumentStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends broadcast on correct channel', async () => {
    const event = {
      documentId: 'doc-1',
      matterId: 'matter-42',
      fileName: 'visa-app.pdf',
      status: 'classified',
      category: 'immigration',
      updatedAt: '2026-03-25T00:00:00Z',
    }

    await broadcastDocumentStatus(event)

    const adminClient = vi.mocked(createAdminClient).mock.results[0]?.value
    expect(adminClient.channel).toHaveBeenCalledWith('documents:matter-42')

    const mockChannel = adminClient.channel.mock.results[0]?.value
    expect(mockChannel.send).toHaveBeenCalledWith({
      type: 'broadcast',
      event: 'document_status_changed',
      payload: {
        document_id: 'doc-1',
        matter_id: 'matter-42',
        file_name: 'visa-app.pdf',
        status: 'classified',
        category: 'immigration',
        updated_at: '2026-03-25T00:00:00Z',
      },
    })

    expect(adminClient.removeChannel).toHaveBeenCalledWith(mockChannel)
  })

  it('handles errors gracefully', async () => {
    // Override send to reject for this test
    vi.mocked(createAdminClient).mockReturnValueOnce({
      channel: vi.fn(() => ({
        send: vi.fn().mockRejectedValue(new Error('network failure')),
      })),
      removeChannel: vi.fn(),
    } as any)

    const event = {
      documentId: 'doc-2',
      matterId: 'matter-99',
      fileName: 'deed.pdf',
      status: 'uploaded',
      category: 'real-estate',
      updatedAt: '2026-03-25T12:00:00Z',
    }

    await expect(broadcastDocumentStatus(event)).resolves.toBeUndefined()

    expect(log.warn).toHaveBeenCalledWith(
      '[document-realtime] Broadcast failed',
      expect.objectContaining({
        matterId: 'matter-99',
        documentId: 'doc-2',
        error: 'network failure',
      })
    )
  })

  it('includes null category when not provided', async () => {
    const event = {
      documentId: 'doc-3',
      matterId: 'matter-7',
      fileName: 'notes.txt',
      status: 'uploaded',
      updatedAt: '2026-03-25T08:00:00Z',
    }

    await broadcastDocumentStatus(event)

    const adminClient = vi.mocked(createAdminClient).mock.results[0]?.value
    const mockChannel = adminClient.channel.mock.results[0]?.value

    expect(mockChannel.send).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          category: null,
        }),
      })
    )
  })
})
