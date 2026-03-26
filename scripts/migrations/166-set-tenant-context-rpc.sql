-- =============================================================================
-- Migration 166  -  set_tenant_context() RPC
-- =============================================================================
--
-- Exposes a thin wrapper around PostgreSQL's set_config() so the application
-- layer can prime the session variable `app.current_tenant_id` via Supabase
-- .rpc('set_tenant_context', { p_tenant_id: '...' }).
--
-- This lets get_current_tenant_id() return immediately from the GUC cache
-- instead of falling through to a `SELECT tenant_id FROM users` query on
-- every RLS check and SENTINEL trigger invocation.
--
-- The variable is set with is_local = true so it is scoped to the current
-- transaction and cannot leak across pooled connections.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.set_tenant_context(p_tenant_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT set_config('app.current_tenant_id', p_tenant_id::text, true);
$$;

COMMENT ON FUNCTION public.set_tenant_context(UUID) IS
  'Primes app.current_tenant_id session variable (transaction-local) so that '
  'get_current_tenant_id() can return from GUC cache without a users-table lookup. '
  'Called by authenticateRequest() in the API layer.';

-- Allow authenticated users to call this function
GRANT EXECUTE ON FUNCTION public.set_tenant_context(UUID) TO authenticated;

COMMIT;
