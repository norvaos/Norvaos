-- Migration 015: Canadian Visit Visa Invitation Form v2 (Multi-Step with Conditional Fields)
-- Replaces the flat form with a 6-section wizard form

DO $$
DECLARE
  v_tenant_id UUID;
  v_user_id UUID;
  v_pa_id UUID;
  v_pipeline_id UUID;
  v_stage_id UUID;
  v_form_id UUID;
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

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'No user found for tenant  -  skipping seed';
    RETURN;
  END IF;

  -- Check if form already exists
  SELECT id INTO v_form_id FROM intake_forms
    WHERE tenant_id = v_tenant_id AND slug = 'visa-invitation-letter';

  IF v_form_id IS NOT NULL THEN
    -- Update existing form with new fields and settings
    UPDATE intake_forms SET
      name = 'Canadian Visit Visa  -  Invitation Letter Request',
      description = 'Complete this multi-step form to request an invitation letter for a Canadian visitor visa. Please provide all required information and upload supporting documents.',
      fields = '[
        {
          "id": "visitor_first_name",
          "field_type": "text",
          "label": "Visitor''s First Name",
          "placeholder": "e.g. Maria",
          "is_required": true,
          "sort_order": 0,
          "mapping": "first_name",
          "section_id": "sec_visitor"
        },
        {
          "id": "visitor_last_name",
          "field_type": "text",
          "label": "Visitor''s Last Name",
          "placeholder": "e.g. Garcia",
          "is_required": true,
          "sort_order": 1,
          "mapping": "last_name",
          "section_id": "sec_visitor"
        },
        {
          "id": "visitor_dob",
          "field_type": "date",
          "label": "Visitor''s Date of Birth",
          "is_required": true,
          "sort_order": 2,
          "section_id": "sec_visitor"
        },
        {
          "id": "visitor_nationality",
          "field_type": "select",
          "label": "Visitor''s Nationality",
          "is_required": true,
          "sort_order": 3,
          "allow_other": true,
          "section_id": "sec_visitor",
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
          "sort_order": 4,
          "section_id": "sec_visitor"
        },
        {
          "id": "visitor_address",
          "field_type": "textarea",
          "label": "Visitor''s Current Address",
          "placeholder": "Full address in home country",
          "is_required": true,
          "sort_order": 5,
          "section_id": "sec_visitor"
        },
        {
          "id": "visitor_email",
          "field_type": "email",
          "label": "Visitor''s Email Address",
          "is_required": true,
          "sort_order": 6,
          "mapping": "email_primary",
          "section_id": "sec_visitor"
        },
        {
          "id": "visitor_phone",
          "field_type": "phone",
          "label": "Visitor''s Phone Number",
          "sort_order": 7,
          "mapping": "phone_primary",
          "section_id": "sec_visitor"
        },

        {
          "id": "purpose_of_visit",
          "field_type": "select",
          "label": "Purpose of Visit",
          "is_required": true,
          "sort_order": 8,
          "allow_other": true,
          "section_id": "sec_visit",
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
          "id": "relationship",
          "field_type": "select",
          "label": "Relationship to Host",
          "is_required": true,
          "sort_order": 9,
          "allow_other": true,
          "section_id": "sec_visit",
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
          "id": "duration_of_stay",
          "field_type": "text",
          "label": "Intended Duration of Stay",
          "placeholder": "e.g. 2 weeks, 30 days",
          "is_required": true,
          "sort_order": 10,
          "section_id": "sec_visit"
        },
        {
          "id": "planned_arrival",
          "field_type": "date",
          "label": "Planned Arrival Date",
          "sort_order": 11,
          "section_id": "sec_visit"
        },
        {
          "id": "planned_departure",
          "field_type": "date",
          "label": "Planned Departure Date",
          "sort_order": 12,
          "section_id": "sec_visit"
        },
        {
          "id": "business_company",
          "field_type": "text",
          "label": "Business Company Name",
          "placeholder": "Name of the company you are visiting",
          "sort_order": 13,
          "section_id": "sec_visit",
          "condition": {"field_id": "purpose_of_visit", "operator": "equals", "value": "business"}
        },
        {
          "id": "business_contact",
          "field_type": "text",
          "label": "Business Reference / Contact Person",
          "placeholder": "Name and title of your business contact in Canada",
          "sort_order": 14,
          "section_id": "sec_visit",
          "condition": {"field_id": "purpose_of_visit", "operator": "equals", "value": "business"}
        },
        {
          "id": "medical_facility",
          "field_type": "text",
          "label": "Medical Facility Name",
          "placeholder": "Hospital or clinic name in Canada",
          "sort_order": 15,
          "section_id": "sec_visit",
          "condition": {"field_id": "purpose_of_visit", "operator": "equals", "value": "medical"}
        },
        {
          "id": "educational_institution",
          "field_type": "text",
          "label": "Educational Institution",
          "placeholder": "School, college, or university name",
          "sort_order": 16,
          "section_id": "sec_visit",
          "condition": {"field_id": "purpose_of_visit", "operator": "equals", "value": "education"}
        },
        {
          "id": "event_date",
          "field_type": "date",
          "label": "Wedding / Event Date",
          "sort_order": 17,
          "section_id": "sec_visit",
          "condition": {"field_id": "purpose_of_visit", "operator": "equals", "value": "wedding_ceremony"}
        },

        {
          "id": "host_name",
          "field_type": "text",
          "label": "Host''s Full Name in Canada",
          "placeholder": "e.g. John Smith",
          "is_required": true,
          "sort_order": 18,
          "section_id": "sec_host"
        },
        {
          "id": "host_address",
          "field_type": "textarea",
          "label": "Host''s Address in Canada",
          "placeholder": "Full Canadian address where visitor will stay",
          "is_required": true,
          "sort_order": 19,
          "section_id": "sec_host"
        },
        {
          "id": "host_phone",
          "field_type": "phone",
          "label": "Host''s Phone Number",
          "sort_order": 20,
          "section_id": "sec_host"
        },
        {
          "id": "host_email",
          "field_type": "email",
          "label": "Host''s Email Address",
          "sort_order": 21,
          "section_id": "sec_host"
        },
        {
          "id": "host_immigration_status",
          "field_type": "select",
          "label": "Host''s Immigration Status in Canada",
          "is_required": true,
          "sort_order": 22,
          "allow_other": true,
          "section_id": "sec_host",
          "options": [
            {"label": "Canadian Citizen", "value": "citizen"},
            {"label": "Permanent Resident", "value": "permanent_resident"},
            {"label": "Work Permit Holder", "value": "work_permit"},
            {"label": "Study Permit Holder", "value": "study_permit"}
          ]
        },

        {
          "id": "financing",
          "field_type": "select",
          "label": "Who is Financing the Trip?",
          "is_required": true,
          "sort_order": 23,
          "section_id": "sec_financial",
          "options": [
            {"label": "Host (in Canada)", "value": "host"},
            {"label": "Visitor (self-funded)", "value": "visitor"},
            {"label": "Shared", "value": "shared"},
            {"label": "Third-party Sponsor", "value": "sponsor"}
          ]
        },
        {
          "id": "sponsor_name",
          "field_type": "text",
          "label": "Sponsor''s Full Name",
          "placeholder": "Name of the person or organization sponsoring the trip",
          "sort_order": 24,
          "section_id": "sec_financial",
          "condition": {"field_id": "financing", "operator": "equals", "value": "sponsor"}
        },
        {
          "id": "sponsor_relationship",
          "field_type": "text",
          "label": "Sponsor''s Relationship to Visitor",
          "placeholder": "e.g. Employer, Uncle, Family Friend",
          "sort_order": 25,
          "section_id": "sec_financial",
          "condition": {"field_id": "financing", "operator": "equals", "value": "sponsor"}
        },
        {
          "id": "accommodation",
          "field_type": "select",
          "label": "Accommodation Arrangement",
          "is_required": true,
          "sort_order": 26,
          "allow_other": true,
          "section_id": "sec_financial",
          "options": [
            {"label": "Host''s Home", "value": "host_home"},
            {"label": "Hotel", "value": "hotel"},
            {"label": "Airbnb / Rental", "value": "airbnb"},
            {"label": "Other", "value": "other"}
          ]
        },
        {
          "id": "accommodation_name",
          "field_type": "text",
          "label": "Hotel / Accommodation Name & Address",
          "placeholder": "Name and address of where you will be staying",
          "sort_order": 27,
          "section_id": "sec_financial",
          "condition": {"field_id": "accommodation", "operator": "in", "value": ["hotel", "airbnb"]}
        },

        {
          "id": "passport_copy",
          "field_type": "file",
          "label": "Passport Copy",
          "description": "Upload a clear copy of the visitor''s passport bio page",
          "is_required": true,
          "sort_order": 28,
          "accept": ".pdf,.jpg,.jpeg,.png",
          "section_id": "sec_documents"
        },
        {
          "id": "travel_itinerary",
          "field_type": "file",
          "label": "Travel Itinerary (if available)",
          "description": "Flight bookings or travel plans",
          "sort_order": 29,
          "accept": ".pdf",
          "section_id": "sec_documents"
        },
        {
          "id": "financial_proof",
          "field_type": "file",
          "label": "Proof of Financial Support",
          "description": "Bank statements, employment letter, or sponsor letter",
          "sort_order": 30,
          "accept": ".pdf,.jpg,.jpeg,.png",
          "section_id": "sec_documents"
        },
        {
          "id": "supporting_docs",
          "field_type": "file",
          "label": "Additional Supporting Documents",
          "description": "Any other documents to support the invitation",
          "sort_order": 31,
          "accept": ".pdf,.jpg,.jpeg,.png",
          "section_id": "sec_documents"
        },

        {
          "id": "previous_refusals",
          "field_type": "boolean",
          "label": "Have you been refused a Canadian visa before?",
          "sort_order": 32,
          "section_id": "sec_declaration"
        },
        {
          "id": "refusal_details",
          "field_type": "textarea",
          "label": "Refusal Details",
          "placeholder": "Please provide details about previous refusals (date, reason if known)",
          "sort_order": 33,
          "section_id": "sec_declaration",
          "condition": {"field_id": "previous_refusals", "operator": "is_truthy"}
        },
        {
          "id": "previous_visits",
          "field_type": "boolean",
          "label": "Have you previously visited Canada?",
          "sort_order": 34,
          "section_id": "sec_declaration"
        },
        {
          "id": "visit_details",
          "field_type": "textarea",
          "label": "Previous Visit Details",
          "placeholder": "Dates and purpose of previous visits to Canada",
          "sort_order": 35,
          "section_id": "sec_declaration",
          "condition": {"field_id": "previous_visits", "operator": "is_truthy"}
        },
        {
          "id": "additional_notes",
          "field_type": "textarea",
          "label": "Additional Notes",
          "placeholder": "Any other information relevant to the visa application...",
          "sort_order": 36,
          "mapping": "notes",
          "section_id": "sec_declaration"
        },
        {
          "id": "declaration_consent",
          "field_type": "boolean",
          "label": "I declare that all information provided is true and accurate to the best of my knowledge",
          "is_required": true,
          "sort_order": 37,
          "section_id": "sec_declaration"
        }
      ]'::jsonb,
      settings = jsonb_build_object(
        'success_message', 'Thank you! Your invitation letter request has been received. Our immigration team will review your documents and get in touch within 2-3 business days.',
        'sections', jsonb_build_array(
          jsonb_build_object('id', 'sec_visitor', 'title', 'Visitor Information', 'description', 'Please provide the visitor''s personal details and contact information.', 'sort_order', 0),
          jsonb_build_object('id', 'sec_visit', 'title', 'Visit Details', 'description', 'Tell us about the planned visit  -  purpose, duration, and relationship to the host.', 'sort_order', 1),
          jsonb_build_object('id', 'sec_host', 'title', 'Host Information', 'description', 'Information about the person hosting the visitor in Canada.', 'sort_order', 2),
          jsonb_build_object('id', 'sec_financial', 'title', 'Financial Support & Accommodation', 'description', 'How will the trip be funded and where will the visitor stay?', 'sort_order', 3),
          jsonb_build_object('id', 'sec_documents', 'title', 'Documents Upload', 'description', 'Upload required and supporting documents for the visa application.', 'sort_order', 4),
          jsonb_build_object('id', 'sec_declaration', 'title', 'Declaration & Additional Notes', 'description', 'Final declarations and any additional information.', 'sort_order', 5)
        )
      ),
      practice_area_id = v_pa_id,
      pipeline_id = v_pipeline_id,
      stage_id = v_stage_id,
      status = 'published',
      is_active = true
    WHERE id = v_form_id;

    RAISE NOTICE 'Visa invitation form updated to v2 with sections and conditional fields';
  ELSE
    -- Insert fresh form
    INSERT INTO intake_forms (
      tenant_id, name, slug, description, fields, settings,
      practice_area_id, pipeline_id, stage_id,
      status, is_active, created_by
    ) VALUES (
      v_tenant_id,
      'Canadian Visit Visa  -  Invitation Letter Request',
      'visa-invitation-letter',
      'Complete this multi-step form to request an invitation letter for a Canadian visitor visa. Please provide all required information and upload supporting documents.',
      '[
        {
          "id": "visitor_first_name",
          "field_type": "text",
          "label": "Visitor''s First Name",
          "placeholder": "e.g. Maria",
          "is_required": true,
          "sort_order": 0,
          "mapping": "first_name",
          "section_id": "sec_visitor"
        },
        {
          "id": "visitor_last_name",
          "field_type": "text",
          "label": "Visitor''s Last Name",
          "placeholder": "e.g. Garcia",
          "is_required": true,
          "sort_order": 1,
          "mapping": "last_name",
          "section_id": "sec_visitor"
        },
        {
          "id": "visitor_dob",
          "field_type": "date",
          "label": "Visitor''s Date of Birth",
          "is_required": true,
          "sort_order": 2,
          "section_id": "sec_visitor"
        },
        {
          "id": "visitor_nationality",
          "field_type": "select",
          "label": "Visitor''s Nationality",
          "is_required": true,
          "sort_order": 3,
          "allow_other": true,
          "section_id": "sec_visitor",
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
          "sort_order": 4,
          "section_id": "sec_visitor"
        },
        {
          "id": "visitor_address",
          "field_type": "textarea",
          "label": "Visitor''s Current Address",
          "placeholder": "Full address in home country",
          "is_required": true,
          "sort_order": 5,
          "section_id": "sec_visitor"
        },
        {
          "id": "visitor_email",
          "field_type": "email",
          "label": "Visitor''s Email Address",
          "is_required": true,
          "sort_order": 6,
          "mapping": "email_primary",
          "section_id": "sec_visitor"
        },
        {
          "id": "visitor_phone",
          "field_type": "phone",
          "label": "Visitor''s Phone Number",
          "sort_order": 7,
          "mapping": "phone_primary",
          "section_id": "sec_visitor"
        },

        {
          "id": "purpose_of_visit",
          "field_type": "select",
          "label": "Purpose of Visit",
          "is_required": true,
          "sort_order": 8,
          "allow_other": true,
          "section_id": "sec_visit",
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
          "id": "relationship",
          "field_type": "select",
          "label": "Relationship to Host",
          "is_required": true,
          "sort_order": 9,
          "allow_other": true,
          "section_id": "sec_visit",
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
          "id": "duration_of_stay",
          "field_type": "text",
          "label": "Intended Duration of Stay",
          "placeholder": "e.g. 2 weeks, 30 days",
          "is_required": true,
          "sort_order": 10,
          "section_id": "sec_visit"
        },
        {
          "id": "planned_arrival",
          "field_type": "date",
          "label": "Planned Arrival Date",
          "sort_order": 11,
          "section_id": "sec_visit"
        },
        {
          "id": "planned_departure",
          "field_type": "date",
          "label": "Planned Departure Date",
          "sort_order": 12,
          "section_id": "sec_visit"
        },
        {
          "id": "business_company",
          "field_type": "text",
          "label": "Business Company Name",
          "placeholder": "Name of the company you are visiting",
          "sort_order": 13,
          "section_id": "sec_visit",
          "condition": {"field_id": "purpose_of_visit", "operator": "equals", "value": "business"}
        },
        {
          "id": "business_contact",
          "field_type": "text",
          "label": "Business Reference / Contact Person",
          "placeholder": "Name and title of your business contact in Canada",
          "sort_order": 14,
          "section_id": "sec_visit",
          "condition": {"field_id": "purpose_of_visit", "operator": "equals", "value": "business"}
        },
        {
          "id": "medical_facility",
          "field_type": "text",
          "label": "Medical Facility Name",
          "placeholder": "Hospital or clinic name in Canada",
          "sort_order": 15,
          "section_id": "sec_visit",
          "condition": {"field_id": "purpose_of_visit", "operator": "equals", "value": "medical"}
        },
        {
          "id": "educational_institution",
          "field_type": "text",
          "label": "Educational Institution",
          "placeholder": "School, college, or university name",
          "sort_order": 16,
          "section_id": "sec_visit",
          "condition": {"field_id": "purpose_of_visit", "operator": "equals", "value": "education"}
        },
        {
          "id": "event_date",
          "field_type": "date",
          "label": "Wedding / Event Date",
          "sort_order": 17,
          "section_id": "sec_visit",
          "condition": {"field_id": "purpose_of_visit", "operator": "equals", "value": "wedding_ceremony"}
        },

        {
          "id": "host_name",
          "field_type": "text",
          "label": "Host''s Full Name in Canada",
          "placeholder": "e.g. John Smith",
          "is_required": true,
          "sort_order": 18,
          "section_id": "sec_host"
        },
        {
          "id": "host_address",
          "field_type": "textarea",
          "label": "Host''s Address in Canada",
          "placeholder": "Full Canadian address where visitor will stay",
          "is_required": true,
          "sort_order": 19,
          "section_id": "sec_host"
        },
        {
          "id": "host_phone",
          "field_type": "phone",
          "label": "Host''s Phone Number",
          "sort_order": 20,
          "section_id": "sec_host"
        },
        {
          "id": "host_email",
          "field_type": "email",
          "label": "Host''s Email Address",
          "sort_order": 21,
          "section_id": "sec_host"
        },
        {
          "id": "host_immigration_status",
          "field_type": "select",
          "label": "Host''s Immigration Status in Canada",
          "is_required": true,
          "sort_order": 22,
          "allow_other": true,
          "section_id": "sec_host",
          "options": [
            {"label": "Canadian Citizen", "value": "citizen"},
            {"label": "Permanent Resident", "value": "permanent_resident"},
            {"label": "Work Permit Holder", "value": "work_permit"},
            {"label": "Study Permit Holder", "value": "study_permit"}
          ]
        },

        {
          "id": "financing",
          "field_type": "select",
          "label": "Who is Financing the Trip?",
          "is_required": true,
          "sort_order": 23,
          "section_id": "sec_financial",
          "options": [
            {"label": "Host (in Canada)", "value": "host"},
            {"label": "Visitor (self-funded)", "value": "visitor"},
            {"label": "Shared", "value": "shared"},
            {"label": "Third-party Sponsor", "value": "sponsor"}
          ]
        },
        {
          "id": "sponsor_name",
          "field_type": "text",
          "label": "Sponsor''s Full Name",
          "placeholder": "Name of the person or organization sponsoring the trip",
          "sort_order": 24,
          "section_id": "sec_financial",
          "condition": {"field_id": "financing", "operator": "equals", "value": "sponsor"}
        },
        {
          "id": "sponsor_relationship",
          "field_type": "text",
          "label": "Sponsor''s Relationship to Visitor",
          "placeholder": "e.g. Employer, Uncle, Family Friend",
          "sort_order": 25,
          "section_id": "sec_financial",
          "condition": {"field_id": "financing", "operator": "equals", "value": "sponsor"}
        },
        {
          "id": "accommodation",
          "field_type": "select",
          "label": "Accommodation Arrangement",
          "is_required": true,
          "sort_order": 26,
          "allow_other": true,
          "section_id": "sec_financial",
          "options": [
            {"label": "Host''s Home", "value": "host_home"},
            {"label": "Hotel", "value": "hotel"},
            {"label": "Airbnb / Rental", "value": "airbnb"},
            {"label": "Other", "value": "other"}
          ]
        },
        {
          "id": "accommodation_name",
          "field_type": "text",
          "label": "Hotel / Accommodation Name & Address",
          "placeholder": "Name and address of where you will be staying",
          "sort_order": 27,
          "section_id": "sec_financial",
          "condition": {"field_id": "accommodation", "operator": "in", "value": ["hotel", "airbnb"]}
        },

        {
          "id": "passport_copy",
          "field_type": "file",
          "label": "Passport Copy",
          "description": "Upload a clear copy of the visitor''s passport bio page",
          "is_required": true,
          "sort_order": 28,
          "accept": ".pdf,.jpg,.jpeg,.png",
          "section_id": "sec_documents"
        },
        {
          "id": "travel_itinerary",
          "field_type": "file",
          "label": "Travel Itinerary (if available)",
          "description": "Flight bookings or travel plans",
          "sort_order": 29,
          "accept": ".pdf",
          "section_id": "sec_documents"
        },
        {
          "id": "financial_proof",
          "field_type": "file",
          "label": "Proof of Financial Support",
          "description": "Bank statements, employment letter, or sponsor letter",
          "sort_order": 30,
          "accept": ".pdf,.jpg,.jpeg,.png",
          "section_id": "sec_documents"
        },
        {
          "id": "supporting_docs",
          "field_type": "file",
          "label": "Additional Supporting Documents",
          "description": "Any other documents to support the invitation",
          "sort_order": 31,
          "accept": ".pdf,.jpg,.jpeg,.png",
          "section_id": "sec_documents"
        },

        {
          "id": "previous_refusals",
          "field_type": "boolean",
          "label": "Have you been refused a Canadian visa before?",
          "sort_order": 32,
          "section_id": "sec_declaration"
        },
        {
          "id": "refusal_details",
          "field_type": "textarea",
          "label": "Refusal Details",
          "placeholder": "Please provide details about previous refusals (date, reason if known)",
          "sort_order": 33,
          "section_id": "sec_declaration",
          "condition": {"field_id": "previous_refusals", "operator": "is_truthy"}
        },
        {
          "id": "previous_visits",
          "field_type": "boolean",
          "label": "Have you previously visited Canada?",
          "sort_order": 34,
          "section_id": "sec_declaration"
        },
        {
          "id": "visit_details",
          "field_type": "textarea",
          "label": "Previous Visit Details",
          "placeholder": "Dates and purpose of previous visits to Canada",
          "sort_order": 35,
          "section_id": "sec_declaration",
          "condition": {"field_id": "previous_visits", "operator": "is_truthy"}
        },
        {
          "id": "additional_notes",
          "field_type": "textarea",
          "label": "Additional Notes",
          "placeholder": "Any other information relevant to the visa application...",
          "sort_order": 36,
          "mapping": "notes",
          "section_id": "sec_declaration"
        },
        {
          "id": "declaration_consent",
          "field_type": "boolean",
          "label": "I declare that all information provided is true and accurate to the best of my knowledge",
          "is_required": true,
          "sort_order": 37,
          "section_id": "sec_declaration"
        }
      ]'::jsonb,
      jsonb_build_object(
        'success_message', 'Thank you! Your invitation letter request has been received. Our immigration team will review your documents and get in touch within 2-3 business days.',
        'sections', jsonb_build_array(
          jsonb_build_object('id', 'sec_visitor', 'title', 'Visitor Information', 'description', 'Please provide the visitor''s personal details and contact information.', 'sort_order', 0),
          jsonb_build_object('id', 'sec_visit', 'title', 'Visit Details', 'description', 'Tell us about the planned visit  -  purpose, duration, and relationship to the host.', 'sort_order', 1),
          jsonb_build_object('id', 'sec_host', 'title', 'Host Information', 'description', 'Information about the person hosting the visitor in Canada.', 'sort_order', 2),
          jsonb_build_object('id', 'sec_financial', 'title', 'Financial Support & Accommodation', 'description', 'How will the trip be funded and where will the visitor stay?', 'sort_order', 3),
          jsonb_build_object('id', 'sec_documents', 'title', 'Documents Upload', 'description', 'Upload required and supporting documents for the visa application.', 'sort_order', 4),
          jsonb_build_object('id', 'sec_declaration', 'title', 'Declaration & Additional Notes', 'description', 'Final declarations and any additional information.', 'sort_order', 5)
        )
      ),
      v_pa_id,
      v_pipeline_id,
      v_stage_id,
      'published',
      true,
      v_user_id
    );

    RAISE NOTICE 'Visa invitation form v2 created with sections and conditional fields';
  END IF;
END $$;
