-- Add responsible_lawyer_id to contacts table
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS responsible_lawyer_id UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_contacts_lawyer ON contacts(tenant_id, responsible_lawyer_id);
