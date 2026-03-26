-- Migration 206: Continuity Engine  -  Shadow Matter
-- Directives 018, 021, 023 of NorvaOS
-- Tables: address_history, personal_history, prospect_triggers
-- RPC: fn_initialize_shadow_matter
-- ============================================================

BEGIN;

-- ============================================================
-- 1. address_history
-- ============================================================
CREATE TABLE IF NOT EXISTS address_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  matter_id UUID REFERENCES matters(id) ON DELETE SET NULL,
  label TEXT,
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  city TEXT NOT NULL,
  province_state TEXT,
  postal_code TEXT,
  country TEXT NOT NULL DEFAULT 'CA',
  start_date DATE NOT NULL,
  end_date DATE,
  is_current BOOLEAN DEFAULT false,
  source TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_address_history_contact_start
  ON address_history (contact_id, start_date);

CREATE INDEX IF NOT EXISTS idx_address_history_matter
  ON address_history (matter_id);

ALTER TABLE address_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY address_history_select ON address_history
  FOR SELECT USING (tenant_id = (SELECT u.tenant_id FROM users u WHERE u.auth_user_id = auth.uid()));

CREATE POLICY address_history_insert ON address_history
  FOR INSERT WITH CHECK (tenant_id = (SELECT u.tenant_id FROM users u WHERE u.auth_user_id = auth.uid()));

CREATE POLICY address_history_update ON address_history
  FOR UPDATE USING (tenant_id = (SELECT u.tenant_id FROM users u WHERE u.auth_user_id = auth.uid()));

-- ============================================================
-- 2. personal_history
-- ============================================================
CREATE TABLE IF NOT EXISTS personal_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  matter_id UUID REFERENCES matters(id) ON DELETE SET NULL,
  history_type TEXT NOT NULL DEFAULT 'employment',
  label TEXT,
  organization TEXT,
  position_title TEXT,
  city TEXT,
  province_state TEXT,
  country TEXT DEFAULT 'CA',
  start_date DATE NOT NULL,
  end_date DATE,
  is_current BOOLEAN DEFAULT false,
  source TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_personal_history_contact_type_start
  ON personal_history (contact_id, history_type, start_date);

CREATE INDEX IF NOT EXISTS idx_personal_history_matter
  ON personal_history (matter_id);

ALTER TABLE personal_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY personal_history_select ON personal_history
  FOR SELECT USING (tenant_id = (SELECT u.tenant_id FROM users u WHERE u.auth_user_id = auth.uid()));

CREATE POLICY personal_history_insert ON personal_history
  FOR INSERT WITH CHECK (tenant_id = (SELECT u.tenant_id FROM users u WHERE u.auth_user_id = auth.uid()));

CREATE POLICY personal_history_update ON personal_history
  FOR UPDATE USING (tenant_id = (SELECT u.tenant_id FROM users u WHERE u.auth_user_id = auth.uid()));

-- ============================================================
-- 3. prospect_triggers
-- ============================================================
CREATE TABLE IF NOT EXISTS prospect_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  expiry_date DATE NOT NULL,
  trigger_at_days INTEGER[] DEFAULT '{180,90,30}',
  last_triggered_at TIMESTAMPTZ,
  last_trigger_days INTEGER,
  shadow_matter_id UUID REFERENCES matters(id),
  status TEXT DEFAULT 'active',
  source_matter_id UUID REFERENCES matters(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prospect_triggers_contact_status
  ON prospect_triggers (contact_id, status);

CREATE INDEX IF NOT EXISTS idx_prospect_triggers_expiry_active
  ON prospect_triggers (expiry_date) WHERE status = 'active';

ALTER TABLE prospect_triggers ENABLE ROW LEVEL SECURITY;

CREATE POLICY prospect_triggers_select ON prospect_triggers
  FOR SELECT USING (tenant_id = (SELECT u.tenant_id FROM users u WHERE u.auth_user_id = auth.uid()));

CREATE POLICY prospect_triggers_insert ON prospect_triggers
  FOR INSERT WITH CHECK (tenant_id = (SELECT u.tenant_id FROM users u WHERE u.auth_user_id = auth.uid()));

CREATE POLICY prospect_triggers_update ON prospect_triggers
  FOR UPDATE USING (tenant_id = (SELECT u.tenant_id FROM users u WHERE u.auth_user_id = auth.uid()));

-- ============================================================
-- 4. updated_at triggers
-- ============================================================
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_address_history_updated_at
  BEFORE UPDATE ON address_history
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_personal_history_updated_at
  BEFORE UPDATE ON personal_history
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_prospect_triggers_updated_at
  BEFORE UPDATE ON prospect_triggers
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ============================================================
-- 5. fn_initialize_shadow_matter RPC
-- ============================================================
CREATE OR REPLACE FUNCTION fn_initialize_shadow_matter(
  p_contact_id UUID,
  p_tenant_id UUID,
  p_user_id UUID,
  p_matter_type_id UUID,
  p_source_matter_id UUID DEFAULT NULL,
  p_trigger_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  _contact RECORD;
  _new_matter_id UUID;
  _cloned_addresses INT := 0;
  _cloned_personal INT := 0;
  _matter_number TEXT;
BEGIN
  -- 1. Fetch contact
  SELECT * INTO _contact FROM contacts WHERE id = p_contact_id AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contact not found');
  END IF;

  -- 2. Generate matter number (SHADOW-YYYY-NNNN)
  SELECT 'SHADOW-' || to_char(now(), 'YYYY') || '-' || lpad(
    (COALESCE((SELECT COUNT(*) FROM matters WHERE tenant_id = p_tenant_id AND matter_number LIKE 'SHADOW-%'), 0) + 1)::TEXT,
    4, '0'
  ) INTO _matter_number;

  -- 3. Create the shadow matter
  INSERT INTO matters (
    id, tenant_id, title, matter_number, status, matter_type_id,
    created_by, assigned_to, source, is_active
  ) VALUES (
    gen_random_uuid(), p_tenant_id,
    'Renewal  -  ' || COALESCE(_contact.first_name, '') || ' ' || COALESCE(_contact.last_name, ''),
    _matter_number, 'shadow', p_matter_type_id,
    p_user_id, p_user_id, 'shadow_clone', true
  ) RETURNING id INTO _new_matter_id;

  -- 4. Link contact to new matter
  INSERT INTO matter_contacts (matter_id, contact_id, tenant_id, role, is_primary)
  VALUES (_new_matter_id, p_contact_id, p_tenant_id, 'client', true);

  -- 5. Clone address history
  INSERT INTO address_history (tenant_id, contact_id, matter_id, label, address_line1, address_line2, city, province_state, postal_code, country, start_date, end_date, is_current, source)
  SELECT p_tenant_id, contact_id, _new_matter_id, label, address_line1, address_line2, city, province_state, postal_code, country, start_date, end_date, is_current, 'shadow_clone'
  FROM address_history
  WHERE contact_id = p_contact_id AND tenant_id = p_tenant_id;
  GET DIAGNOSTICS _cloned_addresses = ROW_COUNT;

  -- 6. Clone personal history
  INSERT INTO personal_history (tenant_id, contact_id, matter_id, label, history_type, organization, position_title, city, province_state, country, start_date, end_date, is_current, source)
  SELECT p_tenant_id, contact_id, _new_matter_id, label, history_type, organization, position_title, city, province_state, country, start_date, end_date, is_current, 'shadow_clone'
  FROM personal_history
  WHERE contact_id = p_contact_id AND tenant_id = p_tenant_id;
  GET DIAGNOSTICS _cloned_personal = ROW_COUNT;

  -- 7. Update prospect trigger if provided
  IF p_trigger_id IS NOT NULL THEN
    UPDATE prospect_triggers SET status = 'shadow_created', shadow_matter_id = _new_matter_id, updated_at = now()
    WHERE id = p_trigger_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'matter_id', _new_matter_id,
    'matter_number', _matter_number,
    'cloned_addresses', _cloned_addresses,
    'cloned_personal', _cloned_personal
  );
END;
$$;

COMMIT;
