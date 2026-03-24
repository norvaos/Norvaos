-- ============================================================================
-- Migration 155: Add 'lead' to matter_contacts role CHECK constraint
-- ============================================================================
-- Adds "lead" as a valid role option for contacts linked to matters.
-- ============================================================================

-- Drop the existing CHECK constraint on the role column
ALTER TABLE matter_contacts
  DROP CONSTRAINT IF EXISTS matter_contacts_role_check;

-- Recreate with 'lead' included
ALTER TABLE matter_contacts
  ADD CONSTRAINT matter_contacts_role_check
    CHECK (role IN (
      'client', 'lead', 'opposing_party', 'opposing_counsel',
      'witness', 'expert', 'guarantor', 'co_applicant',
      'sponsor', 'employer', 'landlord', 'tenant',
      'vendor', 'purchaser', 'beneficiary', 'agent',
      'adjudicator', 'mediator', 'interpreter', 'other'
    ));
