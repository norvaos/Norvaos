-- =============================================================================
-- Migration 158  -  Bi-Directional Contact <> Matter People Sync Triggers
-- =============================================================================
--
-- When UCI, Passport #, or Passport Expiry is updated in matter_people,
-- the canonical contact record is updated automatically (and vice versa).
--
-- This ensures the "No UCI typed twice" principle: edit in the matter view,
-- it propagates to the global profile. Edit in the contact view, it propagates
-- to all active matter_people records.
--
-- Uses matter_profile_sync_log to track every sync for audit trail.
-- =============================================================================

-- ── Trigger: matter_people → contacts (forward sync) ────────────────────────

CREATE OR REPLACE FUNCTION sync_matter_person_to_contact()
RETURNS TRIGGER AS $$
DECLARE
  v_contact_id UUID;
  v_old_val   TEXT;
  v_new_val   TEXT;
  v_field     TEXT;
BEGIN
  -- Only sync if there's a linked contact
  v_contact_id := NEW.contact_id;
  IF v_contact_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Sync immigration_data fields: UCI, Passport #, Passport Expiry
  -- These live in contacts.immigration_data JSONB

  -- Check UCI
  IF NEW.uci IS DISTINCT FROM OLD.uci AND NEW.uci IS NOT NULL THEN
    UPDATE contacts
    SET immigration_data = COALESCE(immigration_data, '{}'::jsonb) || jsonb_build_object('uci', NEW.uci),
        updated_at = NOW()
    WHERE id = v_contact_id;

    INSERT INTO matter_profile_sync_log (
      tenant_id, matter_id, contact_id, person_id, field_name,
      old_value, new_value, sync_direction, synced_by
    ) VALUES (
      NEW.tenant_id, NEW.matter_id, v_contact_id, NEW.id, 'uci',
      OLD.uci, NEW.uci, 'matter_to_contact', COALESCE(current_setting('app.current_user_id', true), 'system')
    );
  END IF;

  -- Check Passport Number
  IF NEW.passport_number IS DISTINCT FROM OLD.passport_number AND NEW.passport_number IS NOT NULL THEN
    UPDATE contacts
    SET immigration_data = COALESCE(immigration_data, '{}'::jsonb) || jsonb_build_object('passport_number', NEW.passport_number),
        updated_at = NOW()
    WHERE id = v_contact_id;

    INSERT INTO matter_profile_sync_log (
      tenant_id, matter_id, contact_id, person_id, field_name,
      old_value, new_value, sync_direction, synced_by
    ) VALUES (
      NEW.tenant_id, NEW.matter_id, v_contact_id, NEW.id, 'passport_number',
      OLD.passport_number, NEW.passport_number, 'matter_to_contact', COALESCE(current_setting('app.current_user_id', true), 'system')
    );
  END IF;

  -- Check Passport Expiry
  IF NEW.passport_expiry IS DISTINCT FROM OLD.passport_expiry AND NEW.passport_expiry IS NOT NULL THEN
    UPDATE contacts
    SET immigration_data = COALESCE(immigration_data, '{}'::jsonb) || jsonb_build_object('passport_expiry', NEW.passport_expiry::text),
        updated_at = NOW()
    WHERE id = v_contact_id;

    INSERT INTO matter_profile_sync_log (
      tenant_id, matter_id, contact_id, person_id, field_name,
      old_value, new_value, sync_direction, synced_by
    ) VALUES (
      NEW.tenant_id, NEW.matter_id, v_contact_id, NEW.id, 'passport_expiry',
      OLD.passport_expiry::text, NEW.passport_expiry::text, 'matter_to_contact', COALESCE(current_setting('app.current_user_id', true), 'system')
    );
  END IF;

  -- Core demographic fields
  FOREACH v_field IN ARRAY ARRAY['date_of_birth', 'nationality', 'immigration_status', 'gender', 'marital_status'] LOOP
    EXECUTE format(
      'SELECT ($1).%I::text, ($2).%I::text', v_field, v_field
    ) INTO v_new_val, v_old_val USING NEW, OLD;

    IF v_new_val IS DISTINCT FROM v_old_val AND v_new_val IS NOT NULL THEN
      EXECUTE format(
        'UPDATE contacts SET %I = $1, updated_at = NOW() WHERE id = $2', v_field
      ) USING v_new_val, v_contact_id;

      INSERT INTO matter_profile_sync_log (
        tenant_id, matter_id, contact_id, person_id, field_name,
        old_value, new_value, sync_direction, synced_by
      ) VALUES (
        NEW.tenant_id, NEW.matter_id, v_contact_id, NEW.id, v_field,
        v_old_val, v_new_val, 'matter_to_contact', COALESCE(current_setting('app.current_user_id', true), 'system')
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_matter_person_to_contact ON matter_people;
CREATE TRIGGER trg_sync_matter_person_to_contact
  AFTER UPDATE ON matter_people
  FOR EACH ROW
  WHEN (OLD IS DISTINCT FROM NEW)
  EXECUTE FUNCTION sync_matter_person_to_contact();

-- ── Trigger: contacts → matter_people (reverse sync) ────────────────────────

CREATE OR REPLACE FUNCTION sync_contact_to_matter_people()
RETURNS TRIGGER AS $$
DECLARE
  v_person RECORD;
  v_field  TEXT;
  v_old_val TEXT;
  v_new_val TEXT;
BEGIN
  -- Find all active matter_people linked to this contact
  FOR v_person IN
    SELECT id, matter_id, tenant_id
    FROM matter_people
    WHERE contact_id = NEW.id AND is_active = true
  LOOP
    -- Sync immigration_data JSONB fields to matter_people columns
    IF NEW.immigration_data IS DISTINCT FROM OLD.immigration_data THEN
      -- UCI
      IF (NEW.immigration_data->>'uci') IS DISTINCT FROM (OLD.immigration_data->>'uci') THEN
        UPDATE matter_people SET uci = NEW.immigration_data->>'uci' WHERE id = v_person.id;
        INSERT INTO matter_profile_sync_log (
          tenant_id, matter_id, contact_id, person_id, field_name,
          old_value, new_value, sync_direction, synced_by
        ) VALUES (
          v_person.tenant_id, v_person.matter_id, NEW.id, v_person.id, 'uci',
          OLD.immigration_data->>'uci', NEW.immigration_data->>'uci', 'contact_to_matter',
          COALESCE(current_setting('app.current_user_id', true), 'system')
        );
      END IF;

      -- Passport Number
      IF (NEW.immigration_data->>'passport_number') IS DISTINCT FROM (OLD.immigration_data->>'passport_number') THEN
        UPDATE matter_people SET passport_number = NEW.immigration_data->>'passport_number' WHERE id = v_person.id;
        INSERT INTO matter_profile_sync_log (
          tenant_id, matter_id, contact_id, person_id, field_name,
          old_value, new_value, sync_direction, synced_by
        ) VALUES (
          v_person.tenant_id, v_person.matter_id, NEW.id, v_person.id, 'passport_number',
          OLD.immigration_data->>'passport_number', NEW.immigration_data->>'passport_number', 'contact_to_matter',
          COALESCE(current_setting('app.current_user_id', true), 'system')
        );
      END IF;

      -- Passport Expiry
      IF (NEW.immigration_data->>'passport_expiry') IS DISTINCT FROM (OLD.immigration_data->>'passport_expiry') THEN
        UPDATE matter_people SET passport_expiry = (NEW.immigration_data->>'passport_expiry')::date WHERE id = v_person.id;
        INSERT INTO matter_profile_sync_log (
          tenant_id, matter_id, contact_id, person_id, field_name,
          old_value, new_value, sync_direction, synced_by
        ) VALUES (
          v_person.tenant_id, v_person.matter_id, NEW.id, v_person.id, 'passport_expiry',
          OLD.immigration_data->>'passport_expiry', NEW.immigration_data->>'passport_expiry', 'contact_to_matter',
          COALESCE(current_setting('app.current_user_id', true), 'system')
        );
      END IF;
    END IF;

    -- Core demographic fields
    FOREACH v_field IN ARRAY ARRAY['date_of_birth', 'nationality', 'immigration_status', 'gender', 'marital_status'] LOOP
      EXECUTE format(
        'SELECT ($1).%I::text, ($2).%I::text', v_field, v_field
      ) INTO v_new_val, v_old_val USING NEW, OLD;

      IF v_new_val IS DISTINCT FROM v_old_val AND v_new_val IS NOT NULL THEN
        EXECUTE format(
          'UPDATE matter_people SET %I = $1 WHERE id = $2', v_field
        ) USING v_new_val, v_person.id;

        INSERT INTO matter_profile_sync_log (
          tenant_id, matter_id, contact_id, person_id, field_name,
          old_value, new_value, sync_direction, synced_by
        ) VALUES (
          v_person.tenant_id, v_person.matter_id, NEW.id, v_person.id, v_field,
          v_old_val, v_new_val, 'contact_to_matter',
          COALESCE(current_setting('app.current_user_id', true), 'system')
        );
      END IF;
    END LOOP;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_contact_to_matter_people ON contacts;
CREATE TRIGGER trg_sync_contact_to_matter_people
  AFTER UPDATE ON contacts
  FOR EACH ROW
  WHEN (OLD IS DISTINCT FROM NEW)
  EXECUTE FUNCTION sync_contact_to_matter_people();
