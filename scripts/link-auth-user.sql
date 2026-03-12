-- Link real auth user to seeded My Law Office tenant
-- Run this in Supabase SQL Editor after signing up with a new auth account.
--
-- HOW TO USE:
-- 1. Sign up / sign in at the app (creates an auth.users entry)
-- 2. Find your auth_user_id:  SELECT id FROM auth.users WHERE email = 'zia@zia.ca';
-- 3. Replace the placeholder UUID below with your actual auth_user_id
-- 4. Run this script in the Supabase SQL Editor

DO $$
DECLARE
  v_auth_user_id  UUID := 'REPLACE-WITH-YOUR-AUTH-USER-ID';  -- ← put your auth.users id here
  v_seeded_tenant_id UUID;
  v_signup_tenant_id UUID;
  v_target_user_id   UUID;
BEGIN
  -- Find the seeded tenant (My Law Office or Oakville Legal Associates)
  SELECT id INTO v_seeded_tenant_id
  FROM tenants WHERE name = 'Oakville Legal Associates' LIMIT 1;

  -- If already renamed, find the tenant with most users (= the seeded one)
  IF v_seeded_tenant_id IS NULL THEN
    SELECT t.id INTO v_seeded_tenant_id
    FROM tenants t
    JOIN users u ON u.tenant_id = t.id
    GROUP BY t.id
    ORDER BY count(*) DESC
    LIMIT 1;
  END IF;

  IF v_seeded_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Seeded tenant not found';
  END IF;

  -- Neutralize any OTHER tenant that holds the slug we want
  SELECT id INTO v_signup_tenant_id
  FROM tenants WHERE slug = 'my-law-office' AND id != v_seeded_tenant_id;

  IF v_signup_tenant_id IS NOT NULL THEN
    UPDATE tenants SET slug = 'signup-temp-' || substr(v_signup_tenant_id::text, 1, 8)
    WHERE id = v_signup_tenant_id;
  END IF;

  -- Disconnect auth_user_id from whoever currently has it
  UPDATE users SET auth_user_id = gen_random_uuid()
  WHERE auth_user_id = v_auth_user_id;

  -- Find the seeded admin user (Zia Waseer) in the seeded tenant
  SELECT id INTO v_target_user_id
  FROM users
  WHERE tenant_id = v_seeded_tenant_id
    AND first_name = 'Zia' AND last_name = 'Waseer'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_target_user_id IS NULL THEN
    RAISE EXCEPTION 'Target user Zia Waseer not found in seeded tenant';
  END IF;

  -- Link auth account and update email
  UPDATE users SET
    auth_user_id = v_auth_user_id,
    email = 'zia@zia.ca'
  WHERE id = v_target_user_id;

  -- Rename the seeded tenant to My Law Office
  UPDATE tenants SET
    name = 'My Law Office',
    slug = 'my-law-office'
  WHERE id = v_seeded_tenant_id;

  RAISE NOTICE 'Success! User % linked to auth % in tenant %',
    v_target_user_id, v_auth_user_id, v_seeded_tenant_id;
END $$;
