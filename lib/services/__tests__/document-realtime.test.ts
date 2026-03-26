import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSend = vi.fn()
const mockRemoveChannel = vi.fn()
const mockChannel = { send: mockSend }
const mockCreateAdminClient = vi.fn(() => ({
  channel: vi.fn(() => mockChannel),
  removeChannel: mockRemoveChannel,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mockCreateAdminClient,
}))

const mockLogInfo = vi.fn()
const mockLogWarn = vi.fn()

vi.mock('@/lib/utils/logger', () => ({
  log: {
    info: mockLogInfo,
    warn: mockLogWarn,
  },
}))

import { broadcastDocumentStatus } from '../document-realtime'

describe('broadcastDocumentStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSend.mockResolvedValue(undefined)
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

    const adminClient = mockCreateAdminClient.mock.results[0].value
    expect(adminClient.channel).toHaveBeenCalledWith('documents:matter-42')

    expect(mockSend).toHaveBeenCalledWith({
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

    expect(mockRemoveChannel).toHaveBeenCalledWith(mockChannel)
  })

  it('handles errors gracefully', async () => {
    mockSend.mockRejectedValue(new Error('network failure'))

    const event = {
      documentId: 'doc-2',
      matterId: 'matter-99',
      fileName: 'deed.pdf',
      status: 'uploaded',
      category: 'real-estate',
      updatedAt: '2026-03-25T12:00:00Z',
    }

    await expect(broadcastDocumentStatus(event)).resolves.toBeUndefined()

    expect(mockLogWarn).toHaveBeenCalledWith(
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

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          category: null,
        }),
      })
    )
  })
})
