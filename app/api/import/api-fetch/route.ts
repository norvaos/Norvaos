import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/utils/logger'
import { apiFetchSchema } from '@/lib/schemas/data-import'
import { apiFetchData } from '@/lib/services/import/api-import-engine'
import type { Json } from '@/lib/types/database'
import type { ImportEntityType } from '@/lib/services/import/types'

/**
 * POST /api/import/api-fetch
 *
 * Streams NDJSON progress lines while fetching from the platform API:
 *   {"fetched": 200}
 *   {"fetched": 400}
 *   ...
 *   {"done": true, "batchId": "...", "totalRows": 4123, ...}
 *
 * On error:
 *   {"error": "message"}
 */
export async function POST(request: Request) {
  let auth: Awaited<ReturnType<typeof authenticateRequest>>
  try {
    auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'edit')
  } catch (err) {
    if (err instanceof AuthError) {
      return new Response(JSON.stringify({ error: err.message }), { status: err.status })
    }
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const parsed = apiFetchSchema.safeParse(body)
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'Invalid input.' }), { status: 400 })
  }

  const { platform, entityType } = parsed.data
  const admin = createAdminClient()
  const enc = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(enc.encode(JSON.stringify(obj) + '\n'))

      try {
        const result = await apiFetchData({
          admin,
          tenantId: auth.tenantId,
          userId: auth.userId,
          platform,
          entityType: entityType as ImportEntityType,
          onProgress: async (fetched) => {
            send({ fetched })
          },
        })

        // Audit log (fire-and-forget)
        admin
          .from('audit_logs')
          .insert({
            tenant_id: auth.tenantId,
            user_id: auth.userId,
            action: 'import_api_fetch',
            entity_type: 'import_batch',
            entity_id: result.batchId,
            metadata: { platform, entityType, totalRows: result.totalRows } as unknown as Json,
          })
          .then(() => {})

        send({ done: true, ...result })
      } catch (err) {
        log.error('[import-api-fetch] Error', {
          error_message: err instanceof Error ? err.message : 'Unknown',
        })
        send({ error: err instanceof Error ? err.message : 'An unexpected error occurred.' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  })
}
