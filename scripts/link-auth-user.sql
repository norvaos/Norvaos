-- Link real auth user to seeded Oakville Legal Associates tenant
-- Order matters due to FK constraints!

-- Step 1: Delete contacts in WLC Canada FIRST (they reference users.created_by)
DELETE FROM contacts WHERE tenant_id = '17bc1ca2-ff1d-450d-bcda-2f3de60fdf59';

-- Step 2: Delete the signup-created user in WLC Canada (frees auth_user_id)
DELETE FROM users WHERE tenant_id = '17bc1ca2-ff1d-450d-bcda-2f3de60fdf59';

-- Step 3: Update seeded admin user's auth_user_id to the real one
UPDATE users SET auth_user_id = 'e54dcdc7-ae7a-4af0-a275-a1391a17d6cf'
WHERE email = 'zia@oakvillelegal.ca';

-- Step 4: Delete roles in WLC Canada
DELETE FROM roles WHERE tenant_id = '17bc1ca2-ff1d-450d-bcda-2f3de60fdf59';

-- Step 5: Delete the WLC Canada tenant
DELETE FROM tenants WHERE id = '17bc1ca2-ff1d-450d-bcda-2f3de60fdf59';
