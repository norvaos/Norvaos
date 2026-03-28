-- Performance indexes from Forensic Audit (P-MED-01, P-MED-02, P-MED-03)

CREATE INDEX IF NOT EXISTS idx_matter_contacts_lookup
ON matter_contacts(matter_id, role, is_primary)
WHERE is_primary = true;

CREATE INDEX IF NOT EXISTS idx_communications_matter_created
ON communications(tenant_id, matter_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_documents_matter
ON documents(tenant_id, matter_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_documents_contact
ON documents(tenant_id, contact_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_documents_task
ON documents(tenant_id, task_id, created_at DESC);

-- Email sync performance indexes
CREATE INDEX IF NOT EXISTS idx_email_threads_tenant_updated
ON email_threads(tenant_id, updated_at DESC)
WHERE matter_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_email_messages_thread
ON email_messages(thread_id, received_at DESC);
