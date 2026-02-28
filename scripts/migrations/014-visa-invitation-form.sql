-- Migration 014: Canadian Visit Visa Invitation Form
-- Seeds a pre-built intake form for collecting visa invitation letter requests

DO $$
DECLARE
  v_tenant_id UUID;
  v_user_id UUID;
  v_pa_id UUID;
  v_pipeline_id UUID;
  v_stage_id UUID;
BEGIN
  -- Use the known tenant
  v_tenant_id := 'db2d622e-8e75-4c17-91eb-184075e5ae57';

  -- Get a user for created_by
  SELECT id INTO v_user_id FROM users WHERE tenant_id = v_tenant_id LIMIT 1;

  -- Get Immigration practice area
  SELECT id INTO v_pa_id FROM practice_areas
    WHERE tenant_id = v_tenant_id AND name ILIKE '%immigration%' AND is_active = true
    LIMIT 1;

  -- Get Immigration pipeline (lead type)
  SELECT p.id, ps.id INTO v_pipeline_id, v_stage_id
    FROM pipelines p
    JOIN pipeline_stages ps ON ps.pipeline_id = p.id
    WHERE p.tenant_id = v_tenant_id
      AND p.pipeline_type = 'lead'
      AND p.is_active = true
      AND (p.practice_area ILIKE '%immigration%' OR p.is_default = true)
    ORDER BY
      CASE WHEN p.practice_area ILIKE '%immigration%' THEN 0 ELSE 1 END,
      p.is_default DESC,
      ps.sort_order ASC
    LIMIT 1;

  -- Skip if no tenant or user
  IF v_user_id IS NULL THEN
    RAISE NOTICE 'No user found for tenant — skipping seed';
    RETURN;
  END IF;

  -- Insert the visa invitation form (skip if slug already exists)
  INSERT INTO intake_forms (
    tenant_id, name, slug, description, fields, settings,
    practice_area_id, pipeline_id, stage_id,
    status, is_active, created_by
  )
  SELECT
    v_tenant_id,
    'Canadian Visit Visa — Invitation Letter Request',
    'visa-invitation-letter',
    'Complete this form to request an invitation letter for a Canadian visitor visa. Please provide all required information and upload supporting documents.',
    '[
      {
        "id": "visitor_first_name",
        "field_type": "text",
        "label": "Visitor''s First Name",
        "placeholder": "e.g. Maria",
        "is_required": true,
        "sort_order": 0,
        "mapping": "first_name"
      },
      {
        "id": "visitor_last_name",
        "field_type": "text",
        "label": "Visitor''s Last Name",
        "placeholder": "e.g. Garcia",
        "is_required": true,
        "sort_order": 1,
        "mapping": "last_name"
      },
      {
        "id": "visitor_dob",
        "field_type": "date",
        "label": "Visitor''s Date of Birth",
        "is_required": true,
        "sort_order": 2
      },
      {
        "id": "visitor_nationality",
        "field_type": "select",
        "label": "Visitor''s Nationality",
        "is_required": true,
        "sort_order": 3,
        "allow_other": true,
        "options": [
          {"label": "Indian", "value": "indian"},
          {"label": "Chinese", "value": "chinese"},
          {"label": "Pakistani", "value": "pakistani"},
          {"label": "Filipino", "value": "filipino"},
          {"label": "Nigerian", "value": "nigerian"},
          {"label": "Mexican", "value": "mexican"},
          {"label": "Brazilian", "value": "brazilian"},
          {"label": "Turkish", "value": "turkish"},
          {"label": "Iranian", "value": "iranian"},
          {"label": "Bangladeshi", "value": "bangladeshi"}
        ]
      },
      {
        "id": "visitor_passport",
        "field_type": "text",
        "label": "Visitor''s Passport Number",
        "placeholder": "e.g. A12345678",
        "is_required": true,
        "sort_order": 4
      },
      {
        "id": "visitor_address",
        "field_type": "textarea",
        "label": "Visitor''s Current Address",
        "placeholder": "Full address in home country",
        "is_required": true,
        "sort_order": 5
      },
      {
        "id": "visitor_email",
        "field_type": "email",
        "label": "Visitor''s Email Address",
        "is_required": true,
        "sort_order": 6,
        "mapping": "email_primary"
      },
      {
        "id": "visitor_phone",
        "field_type": "phone",
        "label": "Visitor''s Phone Number",
        "sort_order": 7,
        "mapping": "phone_primary"
      },
      {
        "id": "relationship",
        "field_type": "select",
        "label": "Relationship to Host",
        "is_required": true,
        "sort_order": 8,
        "allow_other": true,
        "options": [
          {"label": "Parent", "value": "parent"},
          {"label": "Sibling", "value": "sibling"},
          {"label": "Spouse", "value": "spouse"},
          {"label": "Child", "value": "child"},
          {"label": "Friend", "value": "friend"},
          {"label": "Business Associate", "value": "business_associate"}
        ]
      },
      {
        "id": "purpose_of_visit",
        "field_type": "select",
        "label": "Purpose of Visit",
        "is_required": true,
        "sort_order": 9,
        "allow_other": true,
        "options": [
          {"label": "Tourism", "value": "tourism"},
          {"label": "Family Visit", "value": "family_visit"},
          {"label": "Business", "value": "business"},
          {"label": "Medical", "value": "medical"},
          {"label": "Education", "value": "education"},
          {"label": "Wedding/Ceremony", "value": "wedding_ceremony"}
        ]
      },
      {
        "id": "duration_of_stay",
        "field_type": "text",
        "label": "Intended Duration of Stay",
        "placeholder": "e.g. 2 weeks, 30 days",
        "is_required": true,
        "sort_order": 10
      },
      {
        "id": "planned_arrival",
        "field_type": "date",
        "label": "Planned Arrival Date",
        "sort_order": 11
      },
      {
        "id": "host_name",
        "field_type": "text",
        "label": "Host''s Full Name in Canada",
        "placeholder": "e.g. John Smith",
        "is_required": true,
        "sort_order": 12
      },
      {
        "id": "host_address",
        "field_type": "textarea",
        "label": "Host''s Address in Canada",
        "placeholder": "Full Canadian address where visitor will stay",
        "is_required": true,
        "sort_order": 13
      },
      {
        "id": "host_phone",
        "field_type": "phone",
        "label": "Host''s Phone Number",
        "sort_order": 14
      },
      {
        "id": "host_immigration_status",
        "field_type": "select",
        "label": "Host''s Immigration Status in Canada",
        "is_required": true,
        "sort_order": 15,
        "allow_other": true,
        "options": [
          {"label": "Canadian Citizen", "value": "citizen"},
          {"label": "Permanent Resident", "value": "permanent_resident"},
          {"label": "Work Permit Holder", "value": "work_permit"},
          {"label": "Study Permit Holder", "value": "study_permit"}
        ]
      },
      {
        "id": "passport_copy",
        "field_type": "file",
        "label": "Passport Copy",
        "description": "Upload a clear copy of the visitor''s passport bio page",
        "is_required": true,
        "sort_order": 16,
        "accept": ".pdf,.jpg,.jpeg,.png"
      },
      {
        "id": "travel_itinerary",
        "field_type": "file",
        "label": "Travel Itinerary (if available)",
        "description": "Flight bookings or travel plans",
        "sort_order": 17,
        "accept": ".pdf"
      },
      {
        "id": "supporting_docs",
        "field_type": "file",
        "label": "Additional Supporting Documents",
        "description": "Any other documents to support the invitation (e.g. employment letter, bank statements)",
        "sort_order": 18,
        "accept": ".pdf,.jpg,.jpeg,.png"
      },
      {
        "id": "additional_notes",
        "field_type": "textarea",
        "label": "Additional Notes",
        "placeholder": "Any other information relevant to the visa application...",
        "sort_order": 19,
        "mapping": "notes"
      }
    ]'::jsonb,
    '{"success_message": "Thank you! Your invitation letter request has been received. Our immigration team will review your documents and get in touch within 2-3 business days."}'::jsonb,
    v_pa_id,
    v_pipeline_id,
    v_stage_id,
    'published',
    true,
    v_user_id
  WHERE NOT EXISTS (
    SELECT 1 FROM intake_forms WHERE tenant_id = v_tenant_id AND slug = 'visa-invitation-letter'
  );

  RAISE NOTICE 'Visa invitation form seeded successfully';
END $$;
