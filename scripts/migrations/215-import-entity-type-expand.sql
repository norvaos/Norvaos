-- ============================================================================
-- Migration 215: Expand import_batches entity_type constraint
--
-- The original constraint only allowed 8 entity types.
-- This expands it to cover all entity types supported by adapters.
-- ============================================================================

BEGIN;

ALTER TABLE import_batches
  DROP CONSTRAINT IF EXISTS import_batches_entity_type_check;

ALTER TABLE import_batches
  ADD CONSTRAINT import_batches_entity_type_check
  CHECK (entity_type IN (
    'contacts',
    'leads',
    'matters',
    'tasks',
    'notes',
    'documents',
    'time_entries',
    'pipeline_stages',
    'calendar_events',
    'conversations',
    'tags',
    'custom_fields',
    'invoices',
    'companies',
    'forms',
    'payments',
    'surveys',
    'users',
    'trust_ledger'
  ));

COMMIT;
