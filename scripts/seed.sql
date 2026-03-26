-- ============================================================================
-- NorvaOS Seed Data
-- Canadian law firm demo data for My Law Office
-- ============================================================================

-- Use a DO block so we can reference generated IDs
DO $$
DECLARE
    v_tenant_id UUID;
    v_admin_role_id UUID;
    v_lawyer_role_id UUID;
    v_paralegal_role_id UUID;
    v_clerk_role_id UUID;
    v_user_admin UUID;
    v_user_lawyer1 UUID;
    v_user_lawyer2 UUID;
    v_user_paralegal UUID;
    v_user_clerk UUID;
    v_pa_immigration UUID;
    v_pa_family UUID;
    v_pa_real_estate UUID;
    v_pa_corporate UUID;
    v_pa_litigation UUID;
    v_pipeline_lead UUID;
    v_pipeline_matter_imm UUID;
    v_pipeline_matter_fam UUID;
    v_stage_new UUID;
    v_stage_contacted UUID;
    v_stage_qualified UUID;
    v_stage_proposal UUID;
    v_stage_retained UUID;
    v_stage_lost UUID;
    v_contact1 UUID;
    v_contact2 UUID;
    v_contact3 UUID;
    v_contact4 UUID;
    v_contact5 UUID;
    v_contact6 UUID;
    v_contact7 UUID;
    v_contact8 UUID;
    v_contact9 UUID;
    v_contact10 UUID;
    v_contact_org1 UUID;
    v_contact_org2 UUID;
    v_matter1 UUID;
    v_matter2 UUID;
    v_matter3 UUID;
    v_matter4 UUID;
    v_matter5 UUID;
    v_matter6 UUID;
BEGIN

-- ============================================================================
-- 1. TENANT
-- ============================================================================
INSERT INTO tenants (name, slug, timezone, currency, date_format, subscription_tier, subscription_status, feature_flags, settings)
VALUES (
    'My Law Office',
    'my-law-office',
    'America/Toronto',
    'CAD',
    'YYYY-MM-DD',
    'professional',
    'active',
    '{"contacts": true, "matters": true, "leads": true, "tasks": true, "calendar": false, "documents": false, "communications": false, "billing": false, "marketing": false, "chat": false, "reports": false, "ai": false}'::jsonb,
    '{"business_hours": {"start": "09:00", "end": "17:00"}, "default_billing_rate": 350}'::jsonb
)
RETURNING id INTO v_tenant_id;

-- ============================================================================
-- 2. ROLES
-- ============================================================================
INSERT INTO roles (tenant_id, name, description, permissions, is_system)
VALUES (v_tenant_id, 'Admin', 'Full access to all features and settings', '{"all": true}'::jsonb, true)
RETURNING id INTO v_admin_role_id;

INSERT INTO roles (tenant_id, name, description, permissions, is_system)
VALUES (v_tenant_id, 'Lawyer', 'Can manage contacts, matters, leads, and tasks', '{"contacts": {"view": true, "create": true, "edit": true, "delete": false}, "matters": {"view": true, "create": true, "edit": true, "delete": false}, "leads": {"view": true, "create": true, "edit": true, "delete": false}, "tasks": {"view": true, "create": true, "edit": true, "delete": true}, "settings": {"view": false}}'::jsonb, true)
RETURNING id INTO v_lawyer_role_id;

INSERT INTO roles (tenant_id, name, description, permissions, is_system)
VALUES (v_tenant_id, 'Paralegal', 'Can view and edit contacts, matters, and tasks', '{"contacts": {"view": true, "create": true, "edit": true, "delete": false}, "matters": {"view": true, "create": false, "edit": true, "delete": false}, "leads": {"view": true, "create": false, "edit": false, "delete": false}, "tasks": {"view": true, "create": true, "edit": true, "delete": false}, "settings": {"view": false}}'::jsonb, true)
RETURNING id INTO v_paralegal_role_id;

INSERT INTO roles (tenant_id, name, description, permissions, is_system)
VALUES (v_tenant_id, 'Clerk', 'View-only access with limited editing', '{"contacts": {"view": true, "create": true, "edit": false, "delete": false}, "matters": {"view": true, "create": false, "edit": false, "delete": false}, "leads": {"view": true, "create": false, "edit": false, "delete": false}, "tasks": {"view": true, "create": true, "edit": false, "delete": false}, "settings": {"view": false}}'::jsonb, true)
RETURNING id INTO v_clerk_role_id;

-- ============================================================================
-- 3. USERS (linked to fake auth UUIDs for demo — these won't have real auth)
-- ============================================================================
INSERT INTO users (tenant_id, auth_user_id, email, first_name, last_name, role_id, settings)
VALUES (v_tenant_id, gen_random_uuid(), 'zia@zia.ca', 'Zia', 'Waseer', v_admin_role_id, '{}'::jsonb)
RETURNING id INTO v_user_admin;

INSERT INTO users (tenant_id, auth_user_id, email, first_name, last_name, role_id, settings)
VALUES (v_tenant_id, gen_random_uuid(), 'sarah.chen@mylawoffice.ca', 'Sarah', 'Chen', v_lawyer_role_id, '{}'::jsonb)
RETURNING id INTO v_user_lawyer1;

INSERT INTO users (tenant_id, auth_user_id, email, first_name, last_name, role_id, settings)
VALUES (v_tenant_id, gen_random_uuid(), 'marcus.thompson@mylawoffice.ca', 'Marcus', 'Thompson', v_lawyer_role_id, '{}'::jsonb)
RETURNING id INTO v_user_lawyer2;

INSERT INTO users (tenant_id, auth_user_id, email, first_name, last_name, role_id, settings)
VALUES (v_tenant_id, gen_random_uuid(), 'priya.patel@mylawoffice.ca', 'Priya', 'Patel', v_paralegal_role_id, '{}'::jsonb)
RETURNING id INTO v_user_paralegal;

INSERT INTO users (tenant_id, auth_user_id, email, first_name, last_name, role_id, settings)
VALUES (v_tenant_id, gen_random_uuid(), 'emily.ross@mylawoffice.ca', 'Emily', 'Ross', v_clerk_role_id, '{}'::jsonb)
RETURNING id INTO v_user_clerk;

-- ============================================================================
-- 4. PRACTICE AREAS
-- ============================================================================
INSERT INTO practice_areas (tenant_id, name, color) VALUES (v_tenant_id, 'Immigration', '#3b82f6') RETURNING id INTO v_pa_immigration;
INSERT INTO practice_areas (tenant_id, name, color) VALUES (v_tenant_id, 'Family Law', '#ec4899') RETURNING id INTO v_pa_family;
INSERT INTO practice_areas (tenant_id, name, color) VALUES (v_tenant_id, 'Real Estate', '#22c55e') RETURNING id INTO v_pa_real_estate;
INSERT INTO practice_areas (tenant_id, name, color) VALUES (v_tenant_id, 'Corporate', '#8b5cf6') RETURNING id INTO v_pa_corporate;
INSERT INTO practice_areas (tenant_id, name, color) VALUES (v_tenant_id, 'Civil Litigation', '#f59e0b') RETURNING id INTO v_pa_litigation;

-- ============================================================================
-- 5. PIPELINES & STAGES
-- ============================================================================

-- Lead Pipeline
INSERT INTO pipelines (tenant_id, name, pipeline_type, is_default)
VALUES (v_tenant_id, 'Default Lead Pipeline', 'lead', true)
RETURNING id INTO v_pipeline_lead;

INSERT INTO pipeline_stages (pipeline_id, tenant_id, name, color, sort_order, win_probability, rotting_days)
VALUES (v_pipeline_lead, v_tenant_id, 'New Inquiry', '#94a3b8', 0, 10, 3) RETURNING id INTO v_stage_new;
INSERT INTO pipeline_stages (pipeline_id, tenant_id, name, color, sort_order, win_probability, rotting_days)
VALUES (v_pipeline_lead, v_tenant_id, 'Contacted', '#3b82f6', 1, 25, 5) RETURNING id INTO v_stage_contacted;
INSERT INTO pipeline_stages (pipeline_id, tenant_id, name, color, sort_order, win_probability, rotting_days)
VALUES (v_pipeline_lead, v_tenant_id, 'Consultation Booked', '#8b5cf6', 2, 50, 7) RETURNING id INTO v_stage_qualified;
INSERT INTO pipeline_stages (pipeline_id, tenant_id, name, color, sort_order, win_probability, rotting_days)
VALUES (v_pipeline_lead, v_tenant_id, 'Proposal Sent', '#f59e0b', 3, 75, 10) RETURNING id INTO v_stage_proposal;
INSERT INTO pipeline_stages (pipeline_id, tenant_id, name, color, sort_order, win_probability, rotting_days, is_win_stage)
VALUES (v_pipeline_lead, v_tenant_id, 'Retained', '#22c55e', 4, 100, NULL, true) RETURNING id INTO v_stage_retained;
INSERT INTO pipeline_stages (pipeline_id, tenant_id, name, color, sort_order, win_probability, is_lost_stage)
VALUES (v_pipeline_lead, v_tenant_id, 'Lost', '#ef4444', 5, 0, true) RETURNING id INTO v_stage_lost;

-- Immigration Matter Pipeline
INSERT INTO pipelines (tenant_id, name, pipeline_type, practice_area, is_default)
VALUES (v_tenant_id, 'Immigration Process', 'matter', 'Immigration', false)
RETURNING id INTO v_pipeline_matter_imm;

INSERT INTO pipeline_stages (pipeline_id, tenant_id, name, color, sort_order) VALUES (v_pipeline_matter_imm, v_tenant_id, 'Intake & Assessment', '#94a3b8', 0);
INSERT INTO pipeline_stages (pipeline_id, tenant_id, name, color, sort_order) VALUES (v_pipeline_matter_imm, v_tenant_id, 'Document Collection', '#3b82f6', 1);
INSERT INTO pipeline_stages (pipeline_id, tenant_id, name, color, sort_order) VALUES (v_pipeline_matter_imm, v_tenant_id, 'Application Prep', '#8b5cf6', 2);
INSERT INTO pipeline_stages (pipeline_id, tenant_id, name, color, sort_order) VALUES (v_pipeline_matter_imm, v_tenant_id, 'Submitted', '#f59e0b', 3);
INSERT INTO pipeline_stages (pipeline_id, tenant_id, name, color, sort_order) VALUES (v_pipeline_matter_imm, v_tenant_id, 'Under Review', '#ec4899', 4);
INSERT INTO pipeline_stages (pipeline_id, tenant_id, name, color, sort_order, is_win_stage) VALUES (v_pipeline_matter_imm, v_tenant_id, 'Approved', '#22c55e', 5, true);

-- Family Law Matter Pipeline
INSERT INTO pipelines (tenant_id, name, pipeline_type, practice_area, is_default)
VALUES (v_tenant_id, 'Family Law Process', 'matter', 'Family Law', false)
RETURNING id INTO v_pipeline_matter_fam;

INSERT INTO pipeline_stages (pipeline_id, tenant_id, name, color, sort_order) VALUES (v_pipeline_matter_fam, v_tenant_id, 'Initial Consultation', '#94a3b8', 0);
INSERT INTO pipeline_stages (pipeline_id, tenant_id, name, color, sort_order) VALUES (v_pipeline_matter_fam, v_tenant_id, 'Disclosure', '#3b82f6', 1);
INSERT INTO pipeline_stages (pipeline_id, tenant_id, name, color, sort_order) VALUES (v_pipeline_matter_fam, v_tenant_id, 'Negotiation', '#8b5cf6', 2);
INSERT INTO pipeline_stages (pipeline_id, tenant_id, name, color, sort_order) VALUES (v_pipeline_matter_fam, v_tenant_id, 'Mediation', '#f59e0b', 3);
INSERT INTO pipeline_stages (pipeline_id, tenant_id, name, color, sort_order) VALUES (v_pipeline_matter_fam, v_tenant_id, 'Court Filing', '#ec4899', 4);
INSERT INTO pipeline_stages (pipeline_id, tenant_id, name, color, sort_order, is_win_stage) VALUES (v_pipeline_matter_fam, v_tenant_id, 'Resolved', '#22c55e', 5, true);

-- ============================================================================
-- 6. CONTACTS
-- ============================================================================

-- Individual contacts
INSERT INTO contacts (tenant_id, contact_type, first_name, last_name, email_primary, phone_primary, phone_type_primary, city, province_state, postal_code, country, source, created_by)
VALUES (v_tenant_id, 'individual', 'Amit', 'Sharma', 'amit.sharma@gmail.com', '+1 (905) 555-0101', 'mobile', 'Toronto', 'Ontario', 'M5V 3A7', 'Canada', 'Referral', v_user_admin)
RETURNING id INTO v_contact1;

INSERT INTO contacts (tenant_id, contact_type, first_name, last_name, email_primary, phone_primary, phone_type_primary, city, province_state, postal_code, country, source, created_by)
VALUES (v_tenant_id, 'individual', 'Maria', 'Rodriguez', 'maria.r@outlook.com', '+1 (416) 555-0202', 'mobile', 'Toronto', 'Ontario', 'M5V 2T6', 'Canada', 'Website', v_user_lawyer1)
RETURNING id INTO v_contact2;

INSERT INTO contacts (tenant_id, contact_type, first_name, last_name, email_primary, phone_primary, phone_type_primary, city, province_state, postal_code, country, source, job_title, created_by)
VALUES (v_tenant_id, 'individual', 'James', 'Wilson', 'jwilson@wilsontech.com', '+1 (905) 555-0303', 'work', 'Burlington', 'Ontario', 'L7R 1B5', 'Canada', 'Referral', 'CEO', v_user_admin)
RETURNING id INTO v_contact3;

INSERT INTO contacts (tenant_id, contact_type, first_name, last_name, email_primary, phone_primary, phone_type_primary, city, province_state, postal_code, country, source, created_by)
VALUES (v_tenant_id, 'individual', 'Fatima', 'Al-Hassan', 'fatima.alhassan@yahoo.com', '+1 (647) 555-0404', 'mobile', 'Mississauga', 'Ontario', 'L5B 1M2', 'Canada', 'Google', v_user_lawyer2)
RETURNING id INTO v_contact4;

INSERT INTO contacts (tenant_id, contact_type, first_name, last_name, email_primary, phone_primary, phone_type_primary, city, province_state, postal_code, country, source, created_by)
VALUES (v_tenant_id, 'individual', 'David', 'Kim', 'david.kim@proton.me', '+1 (905) 555-0505', 'mobile', 'Burlington', 'Ontario', 'L7R 5A5', 'Canada', 'Walk-in', v_user_admin)
RETURNING id INTO v_contact5;

INSERT INTO contacts (tenant_id, contact_type, first_name, last_name, email_primary, phone_primary, phone_type_primary, city, province_state, postal_code, country, source, created_by)
VALUES (v_tenant_id, 'individual', 'Sophie', 'Tremblay', 'sophie.t@gmail.com', '+1 (514) 555-0606', 'mobile', 'Montreal', 'Quebec', 'H2X 1Y4', 'Canada', 'Legal Directory', v_user_lawyer1)
RETURNING id INTO v_contact6;

INSERT INTO contacts (tenant_id, contact_type, first_name, last_name, email_primary, phone_primary, phone_type_primary, city, province_state, postal_code, country, source, created_by)
VALUES (v_tenant_id, 'individual', 'Robert', 'O''Brien', 'rob.obrien@bell.net', '+1 (905) 555-0707', 'home', 'Milton', 'Ontario', 'L9T 2X5', 'Canada', 'Referral', v_user_admin)
RETURNING id INTO v_contact7;

INSERT INTO contacts (tenant_id, contact_type, first_name, last_name, email_primary, phone_primary, phone_type_primary, city, province_state, postal_code, country, source, created_by)
VALUES (v_tenant_id, 'individual', 'Priya', 'Gupta', 'priya.gupta@hotmail.com', '+1 (416) 555-0808', 'mobile', 'Toronto', 'Ontario', 'M4K 1A2', 'Canada', 'Social Media', v_user_lawyer2)
RETURNING id INTO v_contact8;

INSERT INTO contacts (tenant_id, contact_type, first_name, last_name, email_primary, phone_primary, phone_type_primary, city, province_state, postal_code, country, source, created_by)
VALUES (v_tenant_id, 'individual', 'Michael', 'Chang', 'mchang@rogers.com', '+1 (905) 555-0909', 'mobile', 'Mississauga', 'Ontario', 'L5B 6R3', 'Canada', 'Phone Inquiry', v_user_admin)
RETURNING id INTO v_contact9;

INSERT INTO contacts (tenant_id, contact_type, first_name, last_name, email_primary, phone_primary, phone_type_primary, city, province_state, postal_code, country, source, created_by)
VALUES (v_tenant_id, 'individual', 'Elena', 'Petrov', 'elena.petrov@gmail.com', '+1 (647) 555-1010', 'mobile', 'Mississauga', 'Ontario', 'L5M 4Z5', 'Canada', 'Website', v_user_lawyer1)
RETURNING id INTO v_contact10;

-- Organisation contacts
INSERT INTO contacts (tenant_id, contact_type, organization_name, email_primary, phone_primary, phone_type_primary, city, province_state, postal_code, country, source, website, created_by)
VALUES (v_tenant_id, 'organization', 'Wilson Technologies Inc.', 'info@wilsontech.com', '+1 (905) 555-1100', 'work', 'Burlington', 'Ontario', 'L7R 1B5', 'Canada', 'Referral', 'https://wilsontech.com', v_user_admin)
RETURNING id INTO v_contact_org1;

INSERT INTO contacts (tenant_id, contact_type, organization_name, email_primary, phone_primary, phone_type_primary, city, province_state, postal_code, country, source, website, created_by)
VALUES (v_tenant_id, 'organization', 'Maple Leaf Properties Ltd.', 'contact@mapleleafprops.ca', '+1 (416) 555-1200', 'work', 'Toronto', 'Ontario', 'M5H 2N2', 'Canada', 'Event', 'https://mapleleafprops.ca', v_user_admin)
RETURNING id INTO v_contact_org2;

-- Link James Wilson to his company
UPDATE contacts SET organization_id = v_contact_org1 WHERE id = v_contact3;

-- ============================================================================
-- 7. MATTERS
-- ============================================================================

INSERT INTO matters (tenant_id, title, practice_area_id, responsible_lawyer_id, originating_lawyer_id, billing_type, hourly_rate, estimated_value, priority, status, date_opened, next_deadline, created_by)
VALUES (v_tenant_id, 'Sharma Family PR Application', v_pa_immigration, v_user_lawyer1, v_user_admin, 'flat_fee', NULL, 8500.00, 'high', 'active', CURRENT_DATE - INTERVAL '45 days', CURRENT_DATE + INTERVAL '30 days', v_user_admin)
RETURNING id INTO v_matter1;

INSERT INTO matters (tenant_id, title, practice_area_id, responsible_lawyer_id, billing_type, hourly_rate, estimated_value, priority, status, date_opened, next_deadline, created_by)
VALUES (v_tenant_id, 'Rodriguez v. Rodriguez — Divorce', v_pa_family, v_user_lawyer2, 'hourly', 350.00, 15000.00, 'medium', 'active', CURRENT_DATE - INTERVAL '30 days', CURRENT_DATE + INTERVAL '14 days', v_user_lawyer2)
RETURNING id INTO v_matter2;

INSERT INTO matters (tenant_id, title, practice_area_id, responsible_lawyer_id, billing_type, estimated_value, priority, status, date_opened, created_by)
VALUES (v_tenant_id, 'Wilson Technologies — Share Purchase', v_pa_corporate, v_user_admin, 'flat_fee', 25000.00, 'high', 'active', CURRENT_DATE - INTERVAL '20 days', v_user_admin)
RETURNING id INTO v_matter3;

INSERT INTO matters (tenant_id, title, practice_area_id, responsible_lawyer_id, billing_type, hourly_rate, estimated_value, priority, status, date_opened, next_deadline, created_by)
VALUES (v_tenant_id, 'Kim Property Purchase — 45 Lakeshore Rd', v_pa_real_estate, v_user_lawyer1, 'flat_fee', NULL, 3500.00, 'medium', 'active', CURRENT_DATE - INTERVAL '10 days', CURRENT_DATE + INTERVAL '45 days', v_user_lawyer1)
RETURNING id INTO v_matter4;

INSERT INTO matters (tenant_id, title, practice_area_id, responsible_lawyer_id, billing_type, hourly_rate, estimated_value, priority, status, date_opened, statute_of_limitations, created_by)
VALUES (v_tenant_id, 'O''Brien v. GreenCorp — Personal Injury', v_pa_litigation, v_user_lawyer2, 'contingency', NULL, 75000.00, 'urgent', 'active', CURRENT_DATE - INTERVAL '60 days', (CURRENT_DATE + INTERVAL '18 months')::DATE, v_user_lawyer2)
RETURNING id INTO v_matter5;

INSERT INTO matters (tenant_id, title, practice_area_id, responsible_lawyer_id, billing_type, estimated_value, priority, status, date_opened, date_closed, created_by)
VALUES (v_tenant_id, 'Tremblay Work Permit Extension', v_pa_immigration, v_user_lawyer1, 'flat_fee', 4000.00, 'low', 'closed_won', CURRENT_DATE - INTERVAL '90 days', CURRENT_DATE - INTERVAL '10 days', v_user_lawyer1)
RETURNING id INTO v_matter6;

-- ============================================================================
-- 8. MATTER CONTACTS (link contacts to matters with roles)
-- ============================================================================
INSERT INTO matter_contacts (tenant_id, matter_id, contact_id, role, is_primary) VALUES (v_tenant_id, v_matter1, v_contact1, 'client', true);
INSERT INTO matter_contacts (tenant_id, matter_id, contact_id, role, is_primary) VALUES (v_tenant_id, v_matter2, v_contact2, 'client', true);
INSERT INTO matter_contacts (tenant_id, matter_id, contact_id, role, is_primary) VALUES (v_tenant_id, v_matter3, v_contact3, 'client', true);
INSERT INTO matter_contacts (tenant_id, matter_id, contact_id, role, is_primary) VALUES (v_tenant_id, v_matter3, v_contact_org1, 'client', false);
INSERT INTO matter_contacts (tenant_id, matter_id, contact_id, role, is_primary) VALUES (v_tenant_id, v_matter4, v_contact5, 'client', true);
INSERT INTO matter_contacts (tenant_id, matter_id, contact_id, role, is_primary) VALUES (v_tenant_id, v_matter5, v_contact7, 'client', true);
INSERT INTO matter_contacts (tenant_id, matter_id, contact_id, role, is_primary) VALUES (v_tenant_id, v_matter6, v_contact6, 'client', true);

-- ============================================================================
-- 9. LEADS
-- ============================================================================
INSERT INTO leads (tenant_id, contact_id, pipeline_id, stage_id, source, estimated_value, assigned_to, temperature, notes, created_by)
VALUES (v_tenant_id, v_contact4, v_pipeline_lead, v_stage_new, 'Google', 5000.00, v_user_lawyer2, 'warm', 'Interested in spousal sponsorship', v_user_admin);

INSERT INTO leads (tenant_id, contact_id, pipeline_id, stage_id, source, estimated_value, assigned_to, temperature, notes, next_follow_up, created_by)
VALUES (v_tenant_id, v_contact8, v_pipeline_lead, v_stage_contacted, 'Social Media', 8000.00, v_user_lawyer1, 'hot', 'Needs help with Express Entry profile', CURRENT_DATE + INTERVAL '2 days', v_user_lawyer1);

INSERT INTO leads (tenant_id, contact_id, pipeline_id, stage_id, source, estimated_value, assigned_to, temperature, notes, next_follow_up, created_by)
VALUES (v_tenant_id, v_contact9, v_pipeline_lead, v_stage_qualified, 'Phone Inquiry', 12000.00, v_user_admin, 'hot', 'Business incorporation and commercial lease review', CURRENT_DATE + INTERVAL '1 day', v_user_admin);

INSERT INTO leads (tenant_id, contact_id, pipeline_id, stage_id, source, estimated_value, assigned_to, temperature, notes, created_by)
VALUES (v_tenant_id, v_contact10, v_pipeline_lead, v_stage_proposal, 'Website', 3500.00, v_user_lawyer1, 'warm', 'Property purchase in Mississauga — awaiting signed retainer', v_user_lawyer1);

INSERT INTO leads (tenant_id, contact_id, pipeline_id, stage_id, source, estimated_value, assigned_to, temperature, notes, created_by)
VALUES (v_tenant_id, v_contact_org2, v_pipeline_lead, v_stage_contacted, 'Event', 20000.00, v_user_admin, 'cold', 'Met at Ontario Bar networking event — commercial lease portfolio', v_user_admin);

-- ============================================================================
-- 10. TASKS
-- ============================================================================

-- Tasks for Sharma Immigration Matter
INSERT INTO tasks (tenant_id, title, matter_id, assigned_to, status, priority, due_date, created_by)
VALUES (v_tenant_id, 'Collect passport copies from Sharma family', v_matter1, v_user_paralegal, 'completed', 'high', CURRENT_DATE - INTERVAL '20 days', v_user_lawyer1);

INSERT INTO tasks (tenant_id, title, matter_id, assigned_to, status, priority, due_date, created_by)
VALUES (v_tenant_id, 'Submit PR application to IRCC', v_matter1, v_user_lawyer1, 'in_progress', 'urgent', CURRENT_DATE + INTERVAL '5 days', v_user_lawyer1);

INSERT INTO tasks (tenant_id, title, matter_id, assigned_to, status, priority, due_date, created_by)
VALUES (v_tenant_id, 'Prepare supporting letter for Sharma PR', v_matter1, v_user_paralegal, 'pending', 'high', CURRENT_DATE + INTERVAL '3 days', v_user_lawyer1);

-- Tasks for Rodriguez Divorce
INSERT INTO tasks (tenant_id, title, matter_id, assigned_to, status, priority, due_date, created_by)
VALUES (v_tenant_id, 'File financial disclosure request', v_matter2, v_user_lawyer2, 'in_progress', 'medium', CURRENT_DATE + INTERVAL '7 days', v_user_lawyer2);

INSERT INTO tasks (tenant_id, title, matter_id, assigned_to, status, priority, due_date, created_by)
VALUES (v_tenant_id, 'Schedule mediation session', v_matter2, v_user_paralegal, 'pending', 'medium', CURRENT_DATE + INTERVAL '14 days', v_user_lawyer2);

-- Tasks for Wilson Share Purchase
INSERT INTO tasks (tenant_id, title, matter_id, assigned_to, status, priority, due_date, created_by)
VALUES (v_tenant_id, 'Review draft share purchase agreement', v_matter3, v_user_admin, 'in_progress', 'high', CURRENT_DATE + INTERVAL '2 days', v_user_admin);

INSERT INTO tasks (tenant_id, title, matter_id, assigned_to, status, priority, due_date, created_by)
VALUES (v_tenant_id, 'Complete due diligence checklist', v_matter3, v_user_paralegal, 'pending', 'high', CURRENT_DATE + INTERVAL '10 days', v_user_admin);

-- Tasks for Kim Property Purchase
INSERT INTO tasks (tenant_id, title, matter_id, assigned_to, status, priority, due_date, created_by)
VALUES (v_tenant_id, 'Order title search — 45 Lakeshore Rd', v_matter4, v_user_clerk, 'completed', 'medium', CURRENT_DATE - INTERVAL '3 days', v_user_lawyer1);

INSERT INTO tasks (tenant_id, title, matter_id, assigned_to, status, priority, due_date, created_by)
VALUES (v_tenant_id, 'Review title insurance options', v_matter4, v_user_lawyer1, 'pending', 'medium', CURRENT_DATE + INTERVAL '7 days', v_user_lawyer1);

-- Tasks for O'Brien Litigation
INSERT INTO tasks (tenant_id, title, matter_id, assigned_to, status, priority, due_date, created_by)
VALUES (v_tenant_id, 'File Statement of Claim', v_matter5, v_user_lawyer2, 'pending', 'urgent', CURRENT_DATE + INTERVAL '3 days', v_user_lawyer2);

INSERT INTO tasks (tenant_id, title, matter_id, assigned_to, status, priority, due_date, created_by)
VALUES (v_tenant_id, 'Request medical records from O''Brien', v_matter5, v_user_paralegal, 'in_progress', 'high', CURRENT_DATE + INTERVAL '5 days', v_user_lawyer2);

-- Standalone tasks (not tied to a matter)
INSERT INTO tasks (tenant_id, title, assigned_to, status, priority, due_date, created_by)
VALUES (v_tenant_id, 'Complete annual CLE requirements', v_user_admin, 'pending', 'low', CURRENT_DATE + INTERVAL '60 days', v_user_admin);

INSERT INTO tasks (tenant_id, title, assigned_to, status, priority, due_date, created_by)
VALUES (v_tenant_id, 'Review firm insurance renewal', v_user_admin, 'pending', 'medium', CURRENT_DATE + INTERVAL '30 days', v_user_admin);

-- Overdue tasks
INSERT INTO tasks (tenant_id, title, matter_id, assigned_to, status, priority, due_date, created_by)
VALUES (v_tenant_id, 'Follow up with IRCC on biometrics request', v_matter1, v_user_lawyer1, 'pending', 'high', CURRENT_DATE - INTERVAL '2 days', v_user_lawyer1);

INSERT INTO tasks (tenant_id, title, assigned_to, status, priority, due_date, created_by)
VALUES (v_tenant_id, 'Send retainer agreement to Petrov', v_user_lawyer1, 'pending', 'medium', CURRENT_DATE - INTERVAL '1 day', v_user_lawyer1);

-- ============================================================================
-- 11. ACTIVITIES
-- ============================================================================
INSERT INTO activities (tenant_id, activity_type, entity_type, entity_id, user_id, title, description)
VALUES (v_tenant_id, 'note_added', 'matter', v_matter1, v_user_lawyer1, 'Case assessment completed', 'Reviewed eligibility criteria. Client qualifies under CEC stream.');

INSERT INTO activities (tenant_id, activity_type, entity_type, entity_id, user_id, title, description)
VALUES (v_tenant_id, 'status_changed', 'matter', v_matter6, v_user_lawyer1, 'Matter closed — won', 'Work permit approved. Client notified.');

INSERT INTO activities (tenant_id, activity_type, entity_type, entity_id, user_id, title, description)
VALUES (v_tenant_id, 'email_sent', 'contact', v_contact2, v_user_lawyer2, 'Sent intake questionnaire', 'Emailed family law intake form to Maria Rodriguez.');

INSERT INTO activities (tenant_id, activity_type, entity_type, entity_id, user_id, title, description)
VALUES (v_tenant_id, 'call_logged', 'contact', v_contact3, v_user_admin, 'Discussed share purchase timeline', 'James confirmed closing target of March 31. Board approval pending.');

INSERT INTO activities (tenant_id, activity_type, entity_type, entity_id, user_id, title, description)
VALUES (v_tenant_id, 'meeting_scheduled', 'matter', v_matter5, v_user_lawyer2, 'Initial consultation with O''Brien', 'Scheduled for next Tuesday at 10:00 AM. Will review accident reports.');

INSERT INTO activities (tenant_id, activity_type, entity_type, entity_id, user_id, title, description)
VALUES (v_tenant_id, 'document_uploaded', 'matter', v_matter4, v_user_clerk, 'Title search uploaded', 'Uploaded title search results for 45 Lakeshore Rd.');

INSERT INTO activities (tenant_id, activity_type, entity_type, entity_id, user_id, title, description)
VALUES (v_tenant_id, 'task_completed', 'matter', v_matter1, v_user_paralegal, 'Passport copies collected', 'All family member passports scanned and filed.');

INSERT INTO activities (tenant_id, activity_type, entity_type, entity_id, user_id, title, description)
VALUES (v_tenant_id, 'note_added', 'contact', v_contact4, v_user_lawyer2, 'Follow-up call', 'Fatima confirmed interest in spousal sponsorship. Needs document checklist.');

-- ============================================================================
-- 12. CUSTOM FIELD DEFINITIONS
-- ============================================================================
INSERT INTO custom_field_definitions (tenant_id, entity_type, field_key, field_label, field_type, sort_order, show_in_table)
VALUES (v_tenant_id, 'contact', 'preferred_language', 'Preferred Language', 'select', 0, true);

INSERT INTO custom_field_definitions (tenant_id, entity_type, field_key, field_label, field_type, sort_order)
VALUES (v_tenant_id, 'contact', 'sin_last_four', 'SIN (Last 4 Digits)', 'text', 1);

INSERT INTO custom_field_definitions (tenant_id, entity_type, field_key, field_label, field_type, sort_order, show_in_table)
VALUES (v_tenant_id, 'matter', 'court_file_number', 'Court File Number', 'text', 0, true);

INSERT INTO custom_field_definitions (tenant_id, entity_type, field_key, field_label, field_type, sort_order)
VALUES (v_tenant_id, 'matter', 'uci_number', 'UCI Number', 'text', 1);

INSERT INTO custom_field_definitions (tenant_id, entity_type, field_key, field_label, field_type, is_required, sort_order, show_in_table)
VALUES (v_tenant_id, 'lead', 'referral_name', 'Referral Contact Name', 'text', false, 0, true);

-- ============================================================================
-- 13. TAGS
-- ============================================================================
INSERT INTO tags (tenant_id, name, color, entity_type) VALUES (v_tenant_id, 'VIP', '#ef4444', 'contact');
INSERT INTO tags (tenant_id, name, color, entity_type) VALUES (v_tenant_id, 'Returning Client', '#22c55e', 'contact');
INSERT INTO tags (tenant_id, name, color, entity_type) VALUES (v_tenant_id, 'Corporate', '#8b5cf6', 'contact');
INSERT INTO tags (tenant_id, name, color, entity_type) VALUES (v_tenant_id, 'Urgent', '#ef4444', 'matter');
INSERT INTO tags (tenant_id, name, color, entity_type) VALUES (v_tenant_id, 'Pro Bono', '#3b82f6', 'matter');
INSERT INTO tags (tenant_id, name, color, entity_type) VALUES (v_tenant_id, 'High Value', '#f59e0b', 'lead');

RAISE NOTICE 'Seed data created successfully for tenant: %', v_tenant_id;

END;
$$;
