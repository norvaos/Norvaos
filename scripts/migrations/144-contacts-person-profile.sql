-- Migration 144: Add person profile fields to contacts
-- Purpose: Allow lawyers to capture personal demographics at the lead/command-centre
-- stage so the data flows automatically into matter_people on conversion.
-- These fields represent the CURRENT state of the person and are snapshotted
-- into matter_people when a matter is created.

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS nationality          text,
  ADD COLUMN IF NOT EXISTS gender               text,
  ADD COLUMN IF NOT EXISTS marital_status       text,
  ADD COLUMN IF NOT EXISTS immigration_status   text,
  ADD COLUMN IF NOT EXISTS immigration_status_expiry date,
  ADD COLUMN IF NOT EXISTS country_of_residence text,
  ADD COLUMN IF NOT EXISTS country_of_birth     text,
  ADD COLUMN IF NOT EXISTS currently_in_canada  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS criminal_charges     boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS inadmissibility_flag boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS travel_history_flag  boolean DEFAULT false;

-- Indexes for filtering (conflict engine, CRS calculator)
CREATE INDEX IF NOT EXISTS contacts_nationality_idx        ON contacts(nationality) WHERE nationality IS NOT NULL;
CREATE INDEX IF NOT EXISTS contacts_immigration_status_idx ON contacts(immigration_status) WHERE immigration_status IS NOT NULL;
