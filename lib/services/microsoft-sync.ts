import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { graphFetch } from '@/lib/services/microsoft-graph'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SyncResult {
  success: boolean
  created: number
  updated: number
  deleted: number
  errors: Array<{ itemId: string; message: string }>
}

interface MsCalendarEvent {
  id: string
  subject: string
  bodyPreview?: string
  location?: { displayName?: string }
  start: { dateTime: string; timeZone: string }
  end: { dateTime: string; timeZone: string }
  isAllDay?: boolean
  showAs?: string
  lastModifiedDateTime: string
  isCancelled?: boolean
  recurrence?: unknown
  '@removed'?: { reason: string }
}

interface MsCalendarResponse {
  value: MsCalendarEvent[]
  '@odata.deltaLink'?: string
  '@odata.nextLink'?: string
}

interface MsToDoTask {
  id: string
  title: string
  body?: { content?: string; contentType?: string }
  dueDateTime?: { dateTime: string; timeZone: string }
  status: 'notStarted' | 'inProgress' | 'completed' | 'waitingOnOthers' | 'deferred'
  importance: 'low' | 'normal' | 'high'
  completedDateTime?: { dateTime: string; timeZone: string }
  lastModifiedDateTime: string
  createdDateTime: string
  '@removed'?: { reason: string }
}

interface MsToDoResponse {
  value: MsToDoTask[]
  '@odata.deltaLink'?: string
  '@odata.nextLink'?: string
}

interface MsTaskList {
  id: string
  displayName: string
  isOwner: boolean
  wellknownListName?: string
}

// ─── Status Mapping ──────────────────────────────────────────────────────────

const MS_TASK_STATUS_TO_LOCAL: Record<string, string> = {
  notStarted: 'not_started',
  inProgress: 'working_on_it',
  completed: 'done',
  waitingOnOthers: 'not_started',
  deferred: 'not_started',
}

const LOCAL_STATUS_TO_MS: Record<string, string> = {
  not_started: 'notStarted',
  working_on_it: 'inProgress',
  done: 'completed',
  stuck: 'inProgress',
}

const MS_IMPORTANCE_TO_LOCAL: Record<string, string> = {
  low: 'low',
  normal: 'medium',
  high: 'high',
}

const LOCAL_PRIORITY_TO_MS: Record<string, string> = {
  low: 'low',
  medium: 'normal',
  high: 'high',
  urgent: 'high',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getConnection(connectionId: string, admin: SupabaseClient<Database>) {
  return admin
    .from('microsoft_connections')
    .select('*')
    .eq('id', connectionId)
    .eq('is_active', true)
    .single()
}

function toISOString(msDateTime: { dateTime: string; timeZone: string }): string {
  // MS Graph returns dateTime in the specified timezone without offset
  // For UTC timezone, just append Z
  if (msDateTime.timeZone === 'UTC') {
    return msDateTime.dateTime.endsWith('Z')
      ? msDateTime.dateTime
      : msDateTime.dateTime + 'Z'
  }
  // For other timezones, treat as-is (ISO format from Graph)
  return new Date(msDateTime.dateTime).toISOString()
}

async function createSyncLogEntry(
  admin: SupabaseClient<Database>,
  params: {
    tenantId: string
    userId: string
    connectionId: string
    syncType: string
    direction: string
  }
) {
  const { data } = await admin
    .from('sync_log')
    .insert({
      tenant_id: params.tenantId,
      user_id: params.userId,
      connection_id: params.connectionId,
      sync_type: params.syncType,
      direction: params.direction,
      status: 'running',
    })
    .select('id')
    .single()

  return data?.id
}

async function completeSyncLog(
  admin: SupabaseClient<Database>,
  logId: string,
  result: SyncResult
) {
  await admin
    .from('sync_log')
    .update({
      status: result.success ? 'completed' : 'failed',
      items_created: result.created,
      items_updated: result.updated,
      items_deleted: result.deleted,
      error_message: result.errors.length > 0
        ? result.errors.map((e) => e.message).join('; ')
        : null,
      completed_at: new Date().toISOString(),
    })
    .eq('id', logId)
}

// ─── Calendar Sync: Pull from Outlook ────────────────────────────────────────

export async function syncCalendarPull(
  connectionId: string,
  adminClient: SupabaseClient<Database>
): Promise<SyncResult> {
  const result: SyncResult = { success: true, created: 0, updated: 0, deleted: 0, errors: [] }
  const { data: conn } = await getConnection(connectionId, adminClient)
  if (!conn) throw new Error('Connection not found')

  const logId = await createSyncLogEntry(adminClient, {
    tenantId: conn.tenant_id,
    userId: conn.user_id,
    connectionId,
    syncType: 'calendar',
    direction: 'pull',
  })

  try {
    let url: string
    if (conn.calendar_delta_link) {
      url = conn.calendar_delta_link
    } else {
      // Initial sync: fetch events from 90 days ago to 90 days ahead
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - 90)
      const endDate = new Date()
      endDate.setDate(endDate.getDate() + 90)
      url = `me/calendarView?startDateTime=${startDate.toISOString()}&endDateTime=${endDate.toISOString()}&$select=id,subject,bodyPreview,location,start,end,isAllDay,showAs,lastModifiedDateTime,isCancelled,recurrence&$top=100`
    }

    let hasMore = true
    while (hasMore) {
      const response = await graphFetch<MsCalendarResponse>(connectionId, adminClient, url)

      for (const msEvent of response.value) {
        try {
          if (msEvent['@removed']) {
            // Event was deleted in Outlook
            const { data: existing } = await adminClient
              .from('calendar_events')
              .select('id')
              .eq('external_id', msEvent.id)
              .eq('external_provider', 'microsoft')
              .eq('tenant_id', conn.tenant_id)
              .single()

            if (existing) {
              await adminClient
                .from('calendar_events')
                .update({ is_active: false, updated_at: new Date().toISOString() })
                .eq('id', existing.id)
              result.deleted++
            }
            continue
          }

          // Map MS event to local format
          const eventData = {
            title: msEvent.subject || '(No subject)',
            description: msEvent.bodyPreview || null,
            location: msEvent.location?.displayName || null,
            start_at: toISOString(msEvent.start),
            end_at: toISOString(msEvent.end),
            all_day: msEvent.isAllDay || false,
            show_as: msEvent.showAs || 'busy',
            status: msEvent.isCancelled ? 'cancelled' : 'confirmed',
            external_id: msEvent.id,
            external_provider: 'microsoft' as const,
            last_synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }

          // Check if event already exists
          const { data: existing } = await adminClient
            .from('calendar_events')
            .select('id, updated_at')
            .eq('external_id', msEvent.id)
            .eq('external_provider', 'microsoft')
            .eq('tenant_id', conn.tenant_id)
            .single()

          if (existing) {
            // Update existing event
            await adminClient
              .from('calendar_events')
              .update(eventData)
              .eq('id', existing.id)
            result.updated++
          } else {
            // Create new event
            await adminClient
              .from('calendar_events')
              .insert({
                ...eventData,
                tenant_id: conn.tenant_id,
                created_by: conn.user_id,
                event_type: 'meeting',
                is_active: true,
              })
            result.created++
          }
        } catch (err) {
          result.errors.push({
            itemId: msEvent.id,
            message: err instanceof Error ? err.message : 'Unknown error',
          })
        }
      }

      if (response['@odata.nextLink']) {
        url = response['@odata.nextLink']
      } else {
        hasMore = false
        // Save delta link for next incremental sync
        if (response['@odata.deltaLink']) {
          await adminClient
            .from('microsoft_connections')
            .update({
              calendar_delta_link: response['@odata.deltaLink'],
              last_calendar_sync_at: new Date().toISOString(),
              error_count: 0,
              updated_at: new Date().toISOString(),
            })
            .eq('id', connectionId)
        }
      }
    }
  } catch (err) {
    result.success = false
    result.errors.push({
      itemId: 'sync',
      message: err instanceof Error ? err.message : 'Calendar pull failed',
    })
  }

  if (logId) await completeSyncLog(adminClient, logId, result)
  return result
}

// ─── Calendar Sync: Push to Outlook ──────────────────────────────────────────

export async function syncCalendarPush(
  connectionId: string,
  adminClient: SupabaseClient<Database>
): Promise<SyncResult> {
  const result: SyncResult = { success: true, created: 0, updated: 0, deleted: 0, errors: [] }
  const { data: conn } = await getConnection(connectionId, adminClient)
  if (!conn) throw new Error('Connection not found')

  const logId = await createSyncLogEntry(adminClient, {
    tenantId: conn.tenant_id,
    userId: conn.user_id,
    connectionId,
    syncType: 'calendar',
    direction: 'push',
  })

  try {
    // Find local events that need pushing:
    // 1. Created locally (no external_id) by this user
    // 2. Updated locally since last sync
    const { data: localEvents } = await adminClient
      .from('calendar_events')
      .select('*')
      .eq('tenant_id', conn.tenant_id)
      .eq('created_by', conn.user_id)
      .eq('is_active', true)
      .or(`external_id.is.null,last_synced_at.lt.${conn.last_calendar_sync_at || '1970-01-01T00:00:00Z'}`)

    if (!localEvents) {
      if (logId) await completeSyncLog(adminClient, logId, result)
      return result
    }

    for (const event of localEvents) {
      try {
        const msEventBody = {
          subject: event.title,
          body: event.description ? { contentType: 'text', content: event.description } : undefined,
          location: event.location ? { displayName: event.location } : undefined,
          start: { dateTime: event.start_at, timeZone: 'UTC' },
          end: { dateTime: event.end_at, timeZone: 'UTC' },
          isAllDay: event.all_day,
        }

        if (!event.external_id) {
          // New local event → create in Outlook
          const created = await graphFetch<{ id: string }>(
            connectionId,
            adminClient,
            'me/events',
            { method: 'POST', body: msEventBody }
          )

          await adminClient
            .from('calendar_events')
            .update({
              external_id: created.id,
              external_provider: 'microsoft',
              last_synced_at: new Date().toISOString(),
            })
            .eq('id', event.id)

          result.created++
        } else if (event.external_provider === 'microsoft') {
          // Existing synced event → update in Outlook
          await graphFetch(
            connectionId,
            adminClient,
            `me/events/${event.external_id}`,
            { method: 'PATCH', body: msEventBody }
          )

          await adminClient
            .from('calendar_events')
            .update({ last_synced_at: new Date().toISOString() })
            .eq('id', event.id)

          result.updated++
        }
      } catch (err) {
        result.errors.push({
          itemId: event.id,
          message: err instanceof Error ? err.message : 'Push failed',
        })
      }
    }
  } catch (err) {
    result.success = false
    result.errors.push({
      itemId: 'sync',
      message: err instanceof Error ? err.message : 'Calendar push failed',
    })
  }

  if (logId) await completeSyncLog(adminClient, logId, result)
  return result
}

// ─── Tasks Sync: Pull from Microsoft To Do ───────────────────────────────────

async function getDefaultTaskList(
  connectionId: string,
  adminClient: SupabaseClient<Database>
): Promise<string> {
  const response = await graphFetch<{ value: MsTaskList[] }>(
    connectionId,
    adminClient,
    'me/todo/lists'
  )

  // Prefer the default task list
  const defaultList = response.value.find(
    (l) => l.wellknownListName === 'defaultList'
  )
  return defaultList?.id || response.value[0]?.id || ''
}

export async function syncTasksPull(
  connectionId: string,
  adminClient: SupabaseClient<Database>
): Promise<SyncResult> {
  const result: SyncResult = { success: true, created: 0, updated: 0, deleted: 0, errors: [] }
  const { data: conn } = await getConnection(connectionId, adminClient)
  if (!conn) throw new Error('Connection not found')

  const logId = await createSyncLogEntry(adminClient, {
    tenantId: conn.tenant_id,
    userId: conn.user_id,
    connectionId,
    syncType: 'tasks',
    direction: 'pull',
  })

  try {
    const listId = await getDefaultTaskList(connectionId, adminClient)
    if (!listId) {
      result.errors.push({ itemId: 'sync', message: 'No task list found' })
      if (logId) await completeSyncLog(adminClient, logId, result)
      return result
    }

    let url: string
    if (conn.tasks_delta_link) {
      url = conn.tasks_delta_link
    } else {
      url = `me/todo/lists/${listId}/tasks/delta?$select=id,title,body,dueDateTime,status,importance,completedDateTime,lastModifiedDateTime,createdDateTime&$top=100`
    }

    let hasMore = true
    while (hasMore) {
      const response = await graphFetch<MsToDoResponse>(connectionId, adminClient, url)

      for (const msTask of response.value) {
        try {
          if (msTask['@removed']) {
            const { data: existing } = await adminClient
              .from('tasks')
              .select('id')
              .eq('external_id', msTask.id)
              .eq('external_provider', 'microsoft')
              .eq('tenant_id', conn.tenant_id)
              .single()

            if (existing) {
              await adminClient
                .from('tasks')
                .update({
                  is_deleted: true,
                  deleted_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                })
                .eq('id', existing.id)
              result.deleted++
            }
            continue
          }

          const taskData = {
            title: msTask.title || '(Untitled)',
            description: msTask.body?.content || null,
            due_date: msTask.dueDateTime
              ? msTask.dueDateTime.dateTime.split('T')[0]
              : null,
            status: MS_TASK_STATUS_TO_LOCAL[msTask.status] || 'not_started',
            priority: MS_IMPORTANCE_TO_LOCAL[msTask.importance] || 'medium',
            completed_at: msTask.completedDateTime
              ? toISOString(msTask.completedDateTime)
              : null,
            external_id: msTask.id,
            external_provider: 'microsoft' as const,
            last_synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }

          const { data: existing } = await adminClient
            .from('tasks')
            .select('id, updated_at')
            .eq('external_id', msTask.id)
            .eq('external_provider', 'microsoft')
            .eq('tenant_id', conn.tenant_id)
            .single()

          if (existing) {
            await adminClient
              .from('tasks')
              .update(taskData)
              .eq('id', existing.id)
            result.updated++
          } else {
            await adminClient
              .from('tasks')
              .insert({
                ...taskData,
                tenant_id: conn.tenant_id,
                created_by: conn.user_id,
                assigned_to: conn.user_id,
                created_via: 'microsoft_sync',
              })
            result.created++
          }
        } catch (err) {
          result.errors.push({
            itemId: msTask.id,
            message: err instanceof Error ? err.message : 'Unknown error',
          })
        }
      }

      if (response['@odata.nextLink']) {
        url = response['@odata.nextLink']
      } else {
        hasMore = false
        if (response['@odata.deltaLink']) {
          await adminClient
            .from('microsoft_connections')
            .update({
              tasks_delta_link: response['@odata.deltaLink'],
              last_tasks_sync_at: new Date().toISOString(),
              error_count: 0,
              updated_at: new Date().toISOString(),
            })
            .eq('id', connectionId)
        }
      }
    }
  } catch (err) {
    result.success = false
    result.errors.push({
      itemId: 'sync',
      message: err instanceof Error ? err.message : 'Tasks pull failed',
    })
  }

  if (logId) await completeSyncLog(adminClient, logId, result)
  return result
}

// ─── Tasks Sync: Push to Microsoft To Do ─────────────────────────────────────

export async function syncTasksPush(
  connectionId: string,
  adminClient: SupabaseClient<Database>
): Promise<SyncResult> {
  const result: SyncResult = { success: true, created: 0, updated: 0, deleted: 0, errors: [] }
  const { data: conn } = await getConnection(connectionId, adminClient)
  if (!conn) throw new Error('Connection not found')

  const logId = await createSyncLogEntry(adminClient, {
    tenantId: conn.tenant_id,
    userId: conn.user_id,
    connectionId,
    syncType: 'tasks',
    direction: 'push',
  })

  try {
    const listId = await getDefaultTaskList(connectionId, adminClient)
    if (!listId) {
      result.errors.push({ itemId: 'sync', message: 'No task list found' })
      if (logId) await completeSyncLog(adminClient, logId, result)
      return result
    }

    // Find tasks to push: created by this user, no external_id or updated since last sync
    const { data: localTasks } = await adminClient
      .from('tasks')
      .select('*')
      .eq('tenant_id', conn.tenant_id)
      .eq('is_deleted', false)
      .or(`created_by.eq.${conn.user_id},assigned_to.eq.${conn.user_id}`)
      .or(`external_id.is.null,last_synced_at.lt.${conn.last_tasks_sync_at || '1970-01-01T00:00:00Z'}`)

    if (!localTasks) {
      if (logId) await completeSyncLog(adminClient, logId, result)
      return result
    }

    for (const task of localTasks) {
      try {
        const msTaskBody: Record<string, unknown> = {
          title: task.title,
          body: task.description ? { contentType: 'text', content: task.description } : undefined,
          status: LOCAL_STATUS_TO_MS[task.status] || 'notStarted',
          importance: LOCAL_PRIORITY_TO_MS[task.priority] || 'normal',
        }

        if (task.due_date) {
          msTaskBody.dueDateTime = {
            dateTime: `${task.due_date}T00:00:00.0000000`,
            timeZone: 'UTC',
          }
        }

        if (!task.external_id) {
          // New → create in To Do
          const created = await graphFetch<{ id: string }>(
            connectionId,
            adminClient,
            `me/todo/lists/${listId}/tasks`,
            { method: 'POST', body: msTaskBody }
          )

          await adminClient
            .from('tasks')
            .update({
              external_id: created.id,
              external_provider: 'microsoft',
              last_synced_at: new Date().toISOString(),
            })
            .eq('id', task.id)

          result.created++
        } else if (task.external_provider === 'microsoft') {
          // Update in To Do
          await graphFetch(
            connectionId,
            adminClient,
            `me/todo/lists/${listId}/tasks/${task.external_id}`,
            { method: 'PATCH', body: msTaskBody }
          )

          await adminClient
            .from('tasks')
            .update({ last_synced_at: new Date().toISOString() })
            .eq('id', task.id)

          result.updated++
        }
      } catch (err) {
        result.errors.push({
          itemId: task.id,
          message: err instanceof Error ? err.message : 'Push failed',
        })
      }
    }
  } catch (err) {
    result.success = false
    result.errors.push({
      itemId: 'sync',
      message: err instanceof Error ? err.message : 'Tasks push failed',
    })
  }

  if (logId) await completeSyncLog(adminClient, logId, result)
  return result
}
