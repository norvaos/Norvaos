-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 148: Seed Canadian IRCC Default Communication Templates
-- Phase 6  -  Jurisdictional defaults for all existing tenants
-- ══════════════════════════════════════════════════════════════════════════════
-- Inserts 6 immigration templates per tenant with is_system_default = true.
-- ON CONFLICT DO NOTHING ensures idempotent re-runs.

DO $$
DECLARE
  tenant_row RECORD;
BEGIN
  FOR tenant_row IN SELECT id FROM tenants LOOP

    -- 1. Portal Welcome
    INSERT INTO communication_templates (tenant_id, slug, name, subject, body, jurisdiction, category, is_system_default)
    VALUES (
      tenant_row.id,
      'portal-welcome',
      'Portal Welcome',
      'Welcome to Your Immigration Portal',
      E'<p>Dear {{client_name}},</p>\n<p>Welcome to your secure immigration portal. You can access it any time using the link below:</p>\n<p><a href="{{portal_link}}">{{portal_link}}</a></p>\n<p>Please use this portal to upload your documents and complete your questionnaire at your convenience.</p>\n<p>If you have any questions, don''t hesitate to reach out.</p>\n<p>Kind regards,<br/>{{lawyer_name}}<br/>{{firm_name}}</p>',
      'CA', 'immigration', true
    ) ON CONFLICT (tenant_id, slug, jurisdiction) DO NOTHING;

    -- 2. Document Request
    INSERT INTO communication_templates (tenant_id, slug, name, subject, body, jurisdiction, category, is_system_default)
    VALUES (
      tenant_row.id,
      'document-request',
      'Document Request',
      'Action Required: Documents Needed for Your File',
      E'<p>Dear {{client_name}},</p>\n<p>We require additional documents to proceed with your immigration application. Please log in to your portal to view and upload the outstanding items:</p>\n<p><a href="{{portal_link}}">{{portal_link}}</a></p>\n<p>Timely submission helps us keep your file on track. Please upload at your earliest convenience.</p>\n<p>Kind regards,<br/>{{lawyer_name}}<br/>{{firm_name}}</p>',
      'CA', 'immigration', true
    ) ON CONFLICT (tenant_id, slug, jurisdiction) DO NOTHING;

    -- 3. Filing Confirmation
    INSERT INTO communication_templates (tenant_id, slug, name, subject, body, jurisdiction, category, is_system_default)
    VALUES (
      tenant_row.id,
      'filing-confirmation',
      'Filing Confirmation',
      'Your Application Has Been Filed with IRCC',
      E'<p>Dear {{client_name}},</p>\n<p>We are pleased to confirm that your immigration application has been submitted to Immigration, Refugees and Citizenship Canada (IRCC).</p>\n<p>We will notify you as soon as we receive any updates. In the meantime, you can review the status of your file in your portal:</p>\n<p><a href="{{portal_link}}">{{portal_link}}</a></p>\n<p>Kind regards,<br/>{{lawyer_name}}<br/>{{firm_name}}</p>',
      'CA', 'immigration', true
    ) ON CONFLICT (tenant_id, slug, jurisdiction) DO NOTHING;

    -- 4. Portal Nudge
    INSERT INTO communication_templates (tenant_id, slug, name, subject, body, jurisdiction, category, is_system_default)
    VALUES (
      tenant_row.id,
      'portal-nudge',
      'Portal Nudge',
      'Reminder: Items Outstanding in Your Immigration File',
      E'<p>Dear {{client_name}},</p>\n<p>This is a friendly reminder that there are outstanding items in your immigration file. Please log in to your portal to complete them:</p>\n<p><a href="{{portal_link}}">{{portal_link}}</a></p>\n<p>Completing these items promptly will help us move your application forward without delay.</p>\n<p>Kind regards,<br/>{{lawyer_name}}<br/>{{firm_name}}</p>',
      'CA', 'immigration', true
    ) ON CONFLICT (tenant_id, slug, jurisdiction) DO NOTHING;

    -- 5. Intake Complete
    INSERT INTO communication_templates (tenant_id, slug, name, subject, body, jurisdiction, category, is_system_default)
    VALUES (
      tenant_row.id,
      'intake-complete',
      'Intake Complete',
      'Your Intake Information Has Been Received',
      E'<p>Dear {{client_name}},</p>\n<p>Thank you for completing your intake questionnaire. We have received your information and our team is now reviewing your file.</p>\n<p>You can continue to monitor progress and upload any additional documents through your portal:</p>\n<p><a href="{{portal_link}}">{{portal_link}}</a></p>\n<p>We will be in touch with next steps shortly.</p>\n<p>Kind regards,<br/>{{lawyer_name}}<br/>{{firm_name}}</p>',
      'CA', 'immigration', true
    ) ON CONFLICT (tenant_id, slug, jurisdiction) DO NOTHING;

    -- 6. Eligibility Verified
    INSERT INTO communication_templates (tenant_id, slug, name, subject, body, jurisdiction, category, is_system_default)
    VALUES (
      tenant_row.id,
      'eligibility-verified',
      'Eligibility Verified',
      'Good News: Your Eligibility Has Been Confirmed',
      E'<p>Dear {{client_name}},</p>\n<p>We are pleased to inform you that your eligibility for the immigration programme has been verified.</p>\n<p>The next step is to complete the remaining documents and questionnaire items in your portal:</p>\n<p><a href="{{portal_link}}">{{portal_link}}</a></p>\n<p>We look forward to progressing your application.</p>\n<p>Kind regards,<br/>{{lawyer_name}}<br/>{{firm_name}}</p>',
      'CA', 'immigration', true
    ) ON CONFLICT (tenant_id, slug, jurisdiction) DO NOTHING;

  END LOOP;
END $$;
