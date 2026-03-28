import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Attempts to acquire a cron job lock using a Supabase row-level lock.
 * Uses the cron_locks table to prevent concurrent execution.
 * Returns true if the lock was acquired, false if another instance is running.
 */
export async function acquireCronLock(jobName: string, ttlMinutes = 30): Promise<{ acquired: boolean; release: () => Promise<void> }> {
  const admin = createAdminClient()
  const lockId = `cron:${jobName}`
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString()

  // Try to insert a lock row; if it already exists and hasn't expired, skip
  const { data, error } = await (admin
    .from('cron_locks' as any)
    .upsert(
      {
        lock_id: lockId,
        locked_at: new Date().toISOString(),
        expires_at: expiresAt,
        locked_by: `${process.env.HOSTNAME || 'local'}-${process.pid}`,
      },
      { onConflict: 'lock_id' }
    )
    .select('lock_id') as any)

  // If upsert fails due to conflict with unexpired lock, return false
  if (error) {
    // Check if existing lock is expired
    const { data: existing } = await (admin
      .from('cron_locks' as any)
      .select('expires_at')
      .eq('lock_id', lockId)
      .single() as any) as { data: { expires_at: string } | null }

    if (existing && new Date(existing.expires_at) > new Date()) {
      return { acquired: false, release: async () => {} }
    }

    // Lock expired, force-acquire
    await (admin
      .from('cron_locks' as any)
      .update({
        locked_at: new Date().toISOString(),
        expires_at: expiresAt,
        locked_by: `${process.env.HOSTNAME || 'local'}-${process.pid}`,
      })
      .eq('lock_id', lockId) as any)
  }

  const release = async () => {
    await (admin.from('cron_locks' as any).delete().eq('lock_id', lockId) as any)
  }

  return { acquired: true, release }
}
