-- 083: Fix ircc_form_fields  -  set is_client_visible for all non-meta fields
--
-- The seed script was inserting fields without setting is_client_visible,
-- which defaults to false. This caused the portal to show zero questions
-- because the questionnaire engine filters by is_client_visible = true.
--
-- Fix: mark all non-meta fields as client-visible and client-required
-- based on their is_required flag.

UPDATE ircc_form_fields
SET is_client_visible = true,
    is_client_required = is_required
WHERE is_meta_field = false
  AND is_client_visible = false;
