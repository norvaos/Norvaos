-- ============================================================================
-- Fix RLS policies: replace self-referencing subqueries with a SECURITY DEFINER function
-- The original RLS policies on the users table caused infinite recursion because
-- the policy subquery "SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()"
-- itself triggers the same RLS policy check, resulting in a 500 error.
-- ============================================================================

-- Step 1: Create a SECURITY DEFINER function to get the current user's tenant_id.
-- SECURITY DEFINER means this function runs with the privileges of the function
-- creator (bypassing RLS), which breaks the recursion.
CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Step 2: Drop the existing broken policy on the users table
DROP POLICY IF EXISTS tenant_isolation_users ON users;

-- Step 3: Create a fixed policy for the users table
-- Users can see all users in their own tenant
CREATE POLICY tenant_isolation_users ON users
    USING (tenant_id = public.get_user_tenant_id());

-- Step 4: Update ALL other table policies to use the function instead of the subquery.
-- This is more efficient AND avoids any potential recursion issues.

-- tenants
DROP POLICY IF EXISTS tenant_isolation_tenants ON tenants;
CREATE POLICY tenant_isolation_tenants ON tenants
    USING (id = public.get_user_tenant_id());

-- roles
DROP POLICY IF EXISTS tenant_isolation_roles ON roles;
CREATE POLICY tenant_isolation_roles ON roles
    USING (tenant_id = public.get_user_tenant_id());

-- contacts
DROP POLICY IF EXISTS tenant_isolation_contacts ON contacts;
CREATE POLICY tenant_isolation_contacts ON contacts
    USING (tenant_id = public.get_user_tenant_id());

-- matters
DROP POLICY IF EXISTS tenant_isolation_matters ON matters;
CREATE POLICY tenant_isolation_matters ON matters
    USING (tenant_id = public.get_user_tenant_id());

-- matter_contacts
DROP POLICY IF EXISTS tenant_isolation_matter_contacts ON matter_contacts;
CREATE POLICY tenant_isolation_matter_contacts ON matter_contacts
    USING (tenant_id = public.get_user_tenant_id());

-- leads
DROP POLICY IF EXISTS tenant_isolation_leads ON leads;
CREATE POLICY tenant_isolation_leads ON leads
    USING (tenant_id = public.get_user_tenant_id());

-- tasks
DROP POLICY IF EXISTS tenant_isolation_tasks ON tasks;
CREATE POLICY tenant_isolation_tasks ON tasks
    USING (tenant_id = public.get_user_tenant_id());

-- activities
DROP POLICY IF EXISTS tenant_isolation_activities ON activities;
CREATE POLICY tenant_isolation_activities ON activities
    USING (tenant_id = public.get_user_tenant_id());

-- pipelines
DROP POLICY IF EXISTS tenant_isolation_pipelines ON pipelines;
CREATE POLICY tenant_isolation_pipelines ON pipelines
    USING (tenant_id = public.get_user_tenant_id());

-- pipeline_stages
DROP POLICY IF EXISTS tenant_isolation_pipeline_stages ON pipeline_stages;
CREATE POLICY tenant_isolation_pipeline_stages ON pipeline_stages
    USING (tenant_id = public.get_user_tenant_id());

-- practice_areas
DROP POLICY IF EXISTS tenant_isolation_practice_areas ON practice_areas;
CREATE POLICY tenant_isolation_practice_areas ON practice_areas
    USING (tenant_id = public.get_user_tenant_id());

-- custom_field_definitions
DROP POLICY IF EXISTS tenant_isolation_custom_field_definitions ON custom_field_definitions;
CREATE POLICY tenant_isolation_custom_field_definitions ON custom_field_definitions
    USING (tenant_id = public.get_user_tenant_id());

-- tags
DROP POLICY IF EXISTS tenant_isolation_tags ON tags;
CREATE POLICY tenant_isolation_tags ON tags
    USING (tenant_id = public.get_user_tenant_id());

-- entity_tags
DROP POLICY IF EXISTS tenant_isolation_entity_tags ON entity_tags;
CREATE POLICY tenant_isolation_entity_tags ON entity_tags
    USING (tenant_id = public.get_user_tenant_id());

-- appointments
DROP POLICY IF EXISTS tenant_isolation_appointments ON appointments;
CREATE POLICY tenant_isolation_appointments ON appointments
    USING (tenant_id = public.get_user_tenant_id());

-- documents
DROP POLICY IF EXISTS tenant_isolation_documents ON documents;
CREATE POLICY tenant_isolation_documents ON documents
    USING (tenant_id = public.get_user_tenant_id());

-- document_templates
DROP POLICY IF EXISTS tenant_isolation_document_templates ON document_templates;
CREATE POLICY tenant_isolation_document_templates ON document_templates
    USING (tenant_id = public.get_user_tenant_id());

-- task_templates
DROP POLICY IF EXISTS tenant_isolation_task_templates ON task_templates;
CREATE POLICY tenant_isolation_task_templates ON task_templates
    USING (tenant_id = public.get_user_tenant_id());

-- communications
DROP POLICY IF EXISTS tenant_isolation_communications ON communications;
CREATE POLICY tenant_isolation_communications ON communications
    USING (tenant_id = public.get_user_tenant_id());

-- email_templates
DROP POLICY IF EXISTS tenant_isolation_email_templates ON email_templates;
CREATE POLICY tenant_isolation_email_templates ON email_templates
    USING (tenant_id = public.get_user_tenant_id());

-- invoices
DROP POLICY IF EXISTS tenant_isolation_invoices ON invoices;
CREATE POLICY tenant_isolation_invoices ON invoices
    USING (tenant_id = public.get_user_tenant_id());

-- payments
DROP POLICY IF EXISTS tenant_isolation_payments ON payments;
CREATE POLICY tenant_isolation_payments ON payments
    USING (tenant_id = public.get_user_tenant_id());

-- time_entries
DROP POLICY IF EXISTS tenant_isolation_time_entries ON time_entries;
CREATE POLICY tenant_isolation_time_entries ON time_entries
    USING (tenant_id = public.get_user_tenant_id());

-- marketing_campaigns
DROP POLICY IF EXISTS tenant_isolation_marketing_campaigns ON marketing_campaigns;
CREATE POLICY tenant_isolation_marketing_campaigns ON marketing_campaigns
    USING (tenant_id = public.get_user_tenant_id());

-- marketing_lists
DROP POLICY IF EXISTS tenant_isolation_marketing_lists ON marketing_lists;
CREATE POLICY tenant_isolation_marketing_lists ON marketing_lists
    USING (tenant_id = public.get_user_tenant_id());

-- form_submissions
DROP POLICY IF EXISTS tenant_isolation_form_submissions ON form_submissions;
CREATE POLICY tenant_isolation_form_submissions ON form_submissions
    USING (tenant_id = public.get_user_tenant_id());

-- chat_channels
DROP POLICY IF EXISTS tenant_isolation_chat_channels ON chat_channels;
CREATE POLICY tenant_isolation_chat_channels ON chat_channels
    USING (tenant_id = public.get_user_tenant_id());

-- chat_messages
DROP POLICY IF EXISTS tenant_isolation_chat_messages ON chat_messages;
CREATE POLICY tenant_isolation_chat_messages ON chat_messages
    USING (tenant_id = public.get_user_tenant_id());

-- notifications
DROP POLICY IF EXISTS tenant_isolation_notifications ON notifications;
CREATE POLICY tenant_isolation_notifications ON notifications
    USING (tenant_id = public.get_user_tenant_id());

-- automation_logs
DROP POLICY IF EXISTS tenant_isolation_automation_logs ON automation_logs;
CREATE POLICY tenant_isolation_automation_logs ON automation_logs
    USING (tenant_id = public.get_user_tenant_id());

-- integrations
DROP POLICY IF EXISTS tenant_isolation_integrations ON integrations;
CREATE POLICY tenant_isolation_integrations ON integrations
    USING (tenant_id = public.get_user_tenant_id());

-- audit_logs
DROP POLICY IF EXISTS tenant_isolation_audit_logs ON audit_logs;
CREATE POLICY tenant_isolation_audit_logs ON audit_logs
    USING (tenant_id = public.get_user_tenant_id());

-- Also fix junction/child table policies that used the old subquery pattern:

-- contact_relationships
DROP POLICY IF EXISTS tenant_isolation_contact_relationships ON contact_relationships;
CREATE POLICY tenant_isolation_contact_relationships ON contact_relationships
    USING (contact_id_a IN (SELECT id FROM contacts WHERE tenant_id = public.get_user_tenant_id()));

-- task_template_items
DROP POLICY IF EXISTS tenant_isolation_task_template_items ON task_template_items;
CREATE POLICY tenant_isolation_task_template_items ON task_template_items
    USING (template_id IN (SELECT id FROM task_templates WHERE tenant_id = public.get_user_tenant_id()));

-- appointment_attendees
DROP POLICY IF EXISTS tenant_isolation_appointment_attendees ON appointment_attendees;
CREATE POLICY tenant_isolation_appointment_attendees ON appointment_attendees
    USING (appointment_id IN (SELECT id FROM appointments WHERE tenant_id = public.get_user_tenant_id()));

-- invoice_line_items
DROP POLICY IF EXISTS tenant_isolation_invoice_line_items ON invoice_line_items;
CREATE POLICY tenant_isolation_invoice_line_items ON invoice_line_items
    USING (invoice_id IN (SELECT id FROM invoices WHERE tenant_id = public.get_user_tenant_id()));

-- chat_channel_members
DROP POLICY IF EXISTS tenant_isolation_chat_channel_members ON chat_channel_members;
CREATE POLICY tenant_isolation_chat_channel_members ON chat_channel_members
    USING (channel_id IN (SELECT id FROM chat_channels WHERE tenant_id = public.get_user_tenant_id()));

-- marketing_list_members
DROP POLICY IF EXISTS tenant_isolation_marketing_list_members ON marketing_list_members;
CREATE POLICY tenant_isolation_marketing_list_members ON marketing_list_members
    USING (list_id IN (SELECT id FROM marketing_lists WHERE tenant_id = public.get_user_tenant_id()));

-- campaign_messages
DROP POLICY IF EXISTS tenant_isolation_campaign_messages ON campaign_messages;
CREATE POLICY tenant_isolation_campaign_messages ON campaign_messages
    USING (campaign_id IN (SELECT id FROM marketing_campaigns WHERE tenant_id = public.get_user_tenant_id()));

-- Done: All RLS policies updated to use get_user_tenant_id() function
