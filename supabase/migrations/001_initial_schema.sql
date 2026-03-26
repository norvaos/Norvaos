-- ============================================================================
-- NORVAOS DATABASE SCHEMA v2.0
-- Legal Practice CRM & Management Platform
-- PostgreSQL / Supabase Compatible
-- ============================================================================
-- 
-- CHANGES FROM v1.0:
-- + Workflow automation engine (triggers, conditions, actions)
-- + Email/SMS marketing (campaigns, sequences, lists, tracking)
-- + AI conversation & prompt storage
-- + Custom client domains infrastructure
-- + Mobile device tokens / push notifications
-- + Enhanced activity scoring (Attio-inspired)
-- + Relationship intelligence (contact-to-contact links)
-- + Smart views / saved filters (Attio-inspired)
-- + Deal/opportunity value tracking (Pipedrive-inspired)
-- + Engagement scoring on leads and contacts
-- + Webhook system for external integrations
-- + API key management for future public API
-- + File attachments on any entity (polymorphic)
-- + Tags system (global, reusable)
-- + Time tracking (for hourly billing)
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- SECTION 1: TENANT & USER MANAGEMENT
-- ============================================================================

CREATE TABLE tenants (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name              VARCHAR(255) NOT NULL,
    slug              VARCHAR(100) UNIQUE NOT NULL,
    
    -- White-label / Custom domain
    logo_url          TEXT,
    favicon_url       TEXT,
    primary_color     VARCHAR(7) DEFAULT '#1a1a2e',
    secondary_color   VARCHAR(7) DEFAULT '#16213e',
    accent_color      VARCHAR(7) DEFAULT '#6366f1',
    custom_domain     VARCHAR(255),                       -- firm's own domain for the CRM
    custom_domain_verified BOOLEAN DEFAULT FALSE,
    
    -- Client portal domain (separate from CRM domain)
    portal_domain     VARCHAR(255),                       -- e.g., portal.clientfirm.com
    portal_domain_verified BOOLEAN DEFAULT FALSE,
    portal_branding   JSONB DEFAULT '{}',                 -- Separate branding for client portal
    
    -- Locale
    timezone          VARCHAR(50) DEFAULT 'America/Toronto',
    currency          VARCHAR(3) DEFAULT 'CAD',
    date_format       VARCHAR(20) DEFAULT 'YYYY-MM-DD',
    
    -- Subscription
    subscription_tier VARCHAR(20) DEFAULT 'starter'
        CHECK (subscription_tier IN ('starter', 'professional', 'enterprise')),
    subscription_status VARCHAR(20) DEFAULT 'trialing'
        CHECK (subscription_status IN ('trialing', 'active', 'past_due', 'cancelled')),
    trial_ends_at     TIMESTAMPTZ,
    max_users         INTEGER DEFAULT 1,
    max_storage_gb    INTEGER DEFAULT 5,
    
    -- Feature flags (control feature access per tier)
    feature_flags     JSONB DEFAULT '{
        "email_sync": false,
        "sms": false,
        "phone": false,
        "ai_features": false,
        "marketing": false,
        "custom_domain": false,
        "api_access": false,
        "advanced_reporting": false,
        "client_portal": false,
        "workflow_automation": false,
        "digital_signatures": false
    }',
    
    settings          JSONB DEFAULT '{}',
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE roles (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    description     TEXT,
    permissions     JSONB DEFAULT '{}',
    is_system       BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, name)
);

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    auth_user_id    UUID UNIQUE,
    email           VARCHAR(255) NOT NULL,
    first_name      VARCHAR(100),
    last_name       VARCHAR(100),
    phone           VARCHAR(30),
    avatar_url      TEXT,
    role_id         UUID REFERENCES roles(id),
    is_active       BOOLEAN DEFAULT TRUE,
    
    -- Notification preferences
    notification_prefs JSONB DEFAULT '{
        "email_notifications": true,
        "push_notifications": true,
        "sms_notifications": false,
        "task_reminders": true,
        "lead_assignments": true,
        "document_updates": true
    }',
    
    -- Mobile
    device_tokens   JSONB DEFAULT '[]',                   -- Push notification tokens [{platform, token}]
    
    -- Calendar
    calendar_provider VARCHAR(20),                        -- outlook, google
    calendar_sync_enabled BOOLEAN DEFAULT FALSE,
    
    last_login_at   TIMESTAMPTZ,
    settings        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, email)
);

-- API keys for future public API + integrations
CREATE TABLE api_keys (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id),
    name            VARCHAR(100) NOT NULL,
    key_hash        VARCHAR(255) NOT NULL,                -- Store hashed, never raw
    key_prefix      VARCHAR(10) NOT NULL,                 -- First 8 chars for identification
    scopes          TEXT[] DEFAULT '{read}',              -- read, write, admin
    last_used_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Audit log
CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id),
    action          VARCHAR(50) NOT NULL,
    entity_type     VARCHAR(50) NOT NULL,
    entity_id       UUID,
    changes         JSONB,
    ip_address      INET,
    user_agent      TEXT,
    source          VARCHAR(20) DEFAULT 'web',            -- web, mobile, api, automation
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_tenant ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX idx_audit_entity ON audit_logs(tenant_id, entity_type, entity_id);

-- ============================================================================
-- SECTION 2: TAGS (global reusable tag system)
-- ============================================================================

CREATE TABLE tags (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    color           VARCHAR(7) DEFAULT '#6366f1',
    entity_type     VARCHAR(30),                          -- NULL = usable on any entity
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, name)
);

CREATE TABLE entity_tags (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    tag_id          UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    entity_type     VARCHAR(30) NOT NULL,                 -- contact, matter, lead, document
    entity_id       UUID NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tag_id, entity_type, entity_id)
);

CREATE INDEX idx_entity_tags ON entity_tags(entity_type, entity_id);

-- ============================================================================
-- SECTION 3: CONTACTS & RELATIONSHIPS
-- ============================================================================

CREATE TABLE contacts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Type
    contact_type    VARCHAR(20) NOT NULL DEFAULT 'individual'
        CHECK (contact_type IN ('individual', 'organization')),
    
    -- Individual fields
    first_name      VARCHAR(100),
    last_name       VARCHAR(100),
    middle_name     VARCHAR(100),
    preferred_name  VARCHAR(100),
    date_of_birth   DATE,
    
    -- Organization fields
    organization_name VARCHAR(255),
    organization_id UUID REFERENCES contacts(id),         -- Link individual to their org
    job_title       VARCHAR(255),
    
    -- Contact info
    email_primary   VARCHAR(255),
    email_secondary VARCHAR(255),
    phone_primary   VARCHAR(30),
    phone_secondary VARCHAR(30),
    phone_type_primary   VARCHAR(20) DEFAULT 'mobile',
    phone_type_secondary VARCHAR(20),
    website         VARCHAR(255),
    
    -- Address
    address_line1   VARCHAR(255),
    address_line2   VARCHAR(255),
    city            VARCHAR(100),
    province_state  VARCHAR(100),
    postal_code     VARCHAR(20),
    country         VARCHAR(100) DEFAULT 'Canada',
    
    -- Classification
    source          VARCHAR(100),
    source_detail   TEXT,
    referred_by     UUID REFERENCES contacts(id),
    
    -- Engagement scoring (Attio/Lawmatics inspired)
    engagement_score INTEGER DEFAULT 0,                   -- Calculated score based on interactions
    last_contacted_at TIMESTAMPTZ,
    last_interaction_type VARCHAR(30),
    interaction_count INTEGER DEFAULT 0,
    
    -- Marketing
    email_opt_in    BOOLEAN DEFAULT TRUE,                 -- CASL compliance
    sms_opt_in      BOOLEAN DEFAULT FALSE,
    opt_in_date     TIMESTAMPTZ,
    opt_in_source   VARCHAR(100),                         -- Where they opted in
    
    -- Portal access
    has_portal_access BOOLEAN DEFAULT FALSE,
    portal_user_id  UUID,                                 -- Links to Supabase Auth for portal
    portal_last_login TIMESTAMPTZ,
    
    -- Custom fields
    custom_fields   JSONB DEFAULT '{}',
    
    notes           TEXT,
    is_active       BOOLEAN DEFAULT TRUE,
    is_archived     BOOLEAN DEFAULT FALSE,
    
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_contacts_tenant ON contacts(tenant_id);
CREATE INDEX idx_contacts_name ON contacts(tenant_id, last_name, first_name);
CREATE INDEX idx_contacts_email ON contacts(tenant_id, email_primary);
CREATE INDEX idx_contacts_org ON contacts(tenant_id, organization_name);
CREATE INDEX idx_contacts_engagement ON contacts(tenant_id, engagement_score DESC);
CREATE INDEX idx_contacts_custom ON contacts USING GIN(custom_fields);

-- Contact-to-contact relationships (Attio inspired)
-- e.g., Spouse, Parent, Business Partner, Referral Source
CREATE TABLE contact_relationships (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    contact_id_a    UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    contact_id_b    UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    relationship_type VARCHAR(50) NOT NULL,               -- spouse, parent, child, employer, employee, partner, referral_source, etc.
    reverse_type    VARCHAR(50),                          -- The inverse label (e.g., if A is parent of B, B is child of A)
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(contact_id_a, contact_id_b, relationship_type)
);

CREATE INDEX idx_contact_rel_a ON contact_relationships(contact_id_a);
CREATE INDEX idx_contact_rel_b ON contact_relationships(contact_id_b);

-- ============================================================================
-- SECTION 4: PIPELINES & STAGES
-- ============================================================================

CREATE TABLE pipelines (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    pipeline_type   VARCHAR(30) NOT NULL DEFAULT 'lead'
        CHECK (pipeline_type IN ('lead', 'matter')),
    practice_area   VARCHAR(100),
    is_default      BOOLEAN DEFAULT FALSE,
    is_active       BOOLEAN DEFAULT TRUE,
    
    -- Automation: what happens when an item enters this pipeline
    on_enter_automation_id UUID,                          -- References workflow_automations (added after that table)
    
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, name)
);

CREATE TABLE pipeline_stages (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    pipeline_id     UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    color           VARCHAR(7) DEFAULT '#6366f1',
    description     TEXT,
    
    -- Stage behavior
    is_win_stage    BOOLEAN DEFAULT FALSE,
    is_lost_stage   BOOLEAN DEFAULT FALSE,
    
    -- Probability (Pipedrive inspired)  -  likelihood of conversion at this stage
    win_probability INTEGER DEFAULT 0 CHECK (win_probability >= 0 AND win_probability <= 100),
    
    -- Automation on entering this stage
    on_enter_automation_id UUID,                          -- References workflow_automations
    
    -- Rotting: days before this stage is "stale" (Pipedrive inspired)
    rotting_days    INTEGER,                              -- NULL = no rotting
    
    -- Card display config
    card_display_fields JSONB DEFAULT '["contact_name", "matter_type", "assigned_to", "days_in_stage", "value"]',
    
    -- Required fields before moving to next stage
    required_fields JSONB DEFAULT '[]',                   -- e.g., ["conflict_check_completed", "retainer_signed"]
    
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(pipeline_id, name)
);

CREATE INDEX idx_stages_pipeline ON pipeline_stages(pipeline_id, sort_order);

-- ============================================================================
-- SECTION 5: MATTERS
-- ============================================================================

CREATE TABLE practice_areas (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    color           VARCHAR(7) DEFAULT '#6366f1',
    default_pipeline_id UUID REFERENCES pipelines(id),
    default_folder_structure JSONB DEFAULT '[]',          -- Auto-create these doc folders on new matter
    default_task_template_id UUID,                        -- Auto-create tasks from template on new matter
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, name)
);

CREATE TABLE matters (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Identification
    matter_number   VARCHAR(50),
    title           VARCHAR(255) NOT NULL,
    description     TEXT,
    
    -- Classification
    practice_area_id UUID REFERENCES practice_areas(id),
    matter_type     VARCHAR(100),
    
    -- Pipeline position
    pipeline_id     UUID REFERENCES pipelines(id),
    stage_id        UUID REFERENCES pipeline_stages(id),
    stage_entered_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Assignment
    responsible_lawyer_id UUID REFERENCES users(id),
    originating_lawyer_id UUID REFERENCES users(id),
    
    -- Team (multiple users can be on a matter)
    team_member_ids UUID[] DEFAULT '{}',
    
    -- Dates
    date_opened     DATE DEFAULT CURRENT_DATE,
    date_closed     DATE,
    statute_of_limitations DATE,
    next_deadline   DATE,                                 -- Computed or manually set critical date
    
    -- Financial (Pipedrive deal-value inspired)
    billing_type    VARCHAR(20) DEFAULT 'flat_fee'
        CHECK (billing_type IN ('hourly', 'flat_fee', 'contingency', 'retainer', 'hybrid')),
    estimated_value DECIMAL(12,2),
    weighted_value  DECIMAL(12,2),                        -- estimated_value * stage win_probability
    total_billed    DECIMAL(12,2) DEFAULT 0,
    total_paid      DECIMAL(12,2) DEFAULT 0,
    trust_balance   DECIMAL(12,2) DEFAULT 0,
    hourly_rate     DECIMAL(8,2),
    
    -- Status
    status          VARCHAR(20) DEFAULT 'active'
        CHECK (status IN ('intake', 'active', 'on_hold', 'closed_won', 'closed_lost', 'archived')),
    
    -- Priority
    priority        VARCHAR(10) DEFAULT 'medium'
        CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    
    -- Custom fields
    custom_fields   JSONB DEFAULT '{}',
    
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_matters_tenant ON matters(tenant_id);
CREATE INDEX idx_matters_stage ON matters(tenant_id, pipeline_id, stage_id);
CREATE INDEX idx_matters_status ON matters(tenant_id, status);
CREATE INDEX idx_matters_practice ON matters(tenant_id, practice_area_id);
CREATE INDEX idx_matters_lawyer ON matters(tenant_id, responsible_lawyer_id);
CREATE INDEX idx_matters_number ON matters(tenant_id, matter_number);
CREATE INDEX idx_matters_deadline ON matters(tenant_id, next_deadline) WHERE next_deadline IS NOT NULL;
CREATE INDEX idx_matters_custom ON matters USING GIN(custom_fields);

-- Pivot: many-to-many contacts <> matters with roles
CREATE TABLE matter_contacts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    matter_id       UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
    contact_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    role            VARCHAR(50) NOT NULL DEFAULT 'client'
        CHECK (role IN (
            'client', 'opposing_party', 'opposing_counsel',
            'witness', 'expert', 'guarantor', 'co_applicant',
            'sponsor', 'employer', 'landlord', 'tenant',
            'vendor', 'purchaser', 'beneficiary', 'agent',
            'adjudicator', 'mediator', 'interpreter', 'other'
        )),
    is_primary      BOOLEAN DEFAULT FALSE,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(matter_id, contact_id, role)
);

CREATE INDEX idx_mc_matter ON matter_contacts(matter_id);
CREATE INDEX idx_mc_contact ON matter_contacts(contact_id);

-- ============================================================================
-- SECTION 6: TASKS & TASK TEMPLATES
-- ============================================================================

-- Task templates (auto-generate task sets for new matters)
CREATE TABLE task_templates (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    practice_area_id UUID REFERENCES practice_areas(id),
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE task_template_items (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_id     UUID NOT NULL REFERENCES task_templates(id) ON DELETE CASCADE,
    title           VARCHAR(255) NOT NULL,
    description     TEXT,
    days_offset     INTEGER DEFAULT 0,                    -- Days from matter open to create
    assign_to_role  VARCHAR(50),                          -- Assign to responsible_lawyer, paralegal, etc.
    priority        VARCHAR(10) DEFAULT 'medium',
    sort_order      INTEGER DEFAULT 0,
    depends_on_item_id UUID REFERENCES task_template_items(id), -- Task B starts when Task A completes
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tasks (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Links
    matter_id       UUID REFERENCES matters(id) ON DELETE SET NULL,
    contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,
    
    -- Content
    title           VARCHAR(255) NOT NULL,
    description     TEXT,
    
    -- Assignment
    assigned_to     UUID REFERENCES users(id),
    assigned_by     UUID REFERENCES users(id),
    
    -- Scheduling
    due_date        DATE,
    due_time        TIME,
    start_date      DATE,
    priority        VARCHAR(10) DEFAULT 'medium'
        CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    estimated_minutes INTEGER,
    
    -- Status
    status          VARCHAR(20) DEFAULT 'pending'
        CHECK (status IN ('pending', 'in_progress', 'waiting', 'completed', 'cancelled')),
    completed_at    TIMESTAMPTZ,
    completed_by    UUID REFERENCES users(id),
    
    -- Follow-up chain
    parent_task_id  UUID REFERENCES tasks(id),
    follow_up_days  INTEGER,
    
    -- Dependencies
    depends_on_task_id UUID REFERENCES tasks(id),         -- Can't start until this task completes
    blocks_task_id  UUID REFERENCES tasks(id),            -- This task blocks another
    
    -- Recurrence
    is_recurring    BOOLEAN DEFAULT FALSE,
    recurrence_rule JSONB,
    
    -- Source tracking
    created_via     VARCHAR(30) DEFAULT 'manual',         -- manual, automation, template, ai
    automation_id   UUID,                                 -- Which automation created this
    
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tasks_tenant ON tasks(tenant_id);
CREATE INDEX idx_tasks_assigned ON tasks(tenant_id, assigned_to, status);
CREATE INDEX idx_tasks_matter ON tasks(matter_id);
CREATE INDEX idx_tasks_due ON tasks(tenant_id, due_date, status);
CREATE INDEX idx_tasks_parent ON tasks(parent_task_id);
CREATE INDEX idx_tasks_depends ON tasks(depends_on_task_id);

-- ============================================================================
-- SECTION 7: TIME TRACKING (for hourly billing)
-- ============================================================================

CREATE TABLE time_entries (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    matter_id       UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id),
    task_id         UUID REFERENCES tasks(id),
    
    description     VARCHAR(500) NOT NULL,
    duration_minutes INTEGER NOT NULL,
    hourly_rate     DECIMAL(8,2),
    amount          DECIMAL(12,2) GENERATED ALWAYS AS (
        (duration_minutes::DECIMAL / 60) * COALESCE(hourly_rate, 0)
    ) STORED,
    
    entry_date      DATE NOT NULL DEFAULT CURRENT_DATE,
    is_billable     BOOLEAN DEFAULT TRUE,
    is_invoiced     BOOLEAN DEFAULT FALSE,
    invoice_id      UUID,                                 -- Set when included in an invoice
    
    -- Timer support
    timer_started_at TIMESTAMPTZ,
    timer_stopped_at TIMESTAMPTZ,
    
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_time_entries_matter ON time_entries(matter_id, entry_date);
CREATE INDEX idx_time_entries_user ON time_entries(user_id, entry_date);

-- ============================================================================
-- SECTION 8: DOCUMENTS & TEMPLATES
-- ============================================================================

CREATE TABLE document_folders (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    matter_id       UUID REFERENCES matters(id) ON DELETE CASCADE,
    parent_folder_id UUID REFERENCES document_folders(id),
    name            VARCHAR(255) NOT NULL,
    sort_order      INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE documents (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    matter_id       UUID REFERENCES matters(id) ON DELETE SET NULL,
    contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,
    folder_id       UUID REFERENCES document_folders(id),
    
    file_name       VARCHAR(255) NOT NULL,
    file_type       VARCHAR(50),
    file_size       BIGINT,
    storage_path    TEXT NOT NULL,
    storage_bucket  VARCHAR(100) DEFAULT 'documents',
    
    document_type   VARCHAR(50),
    
    -- Versioning
    version         INTEGER DEFAULT 1,
    parent_document_id UUID REFERENCES documents(id),
    
    -- Review workflow
    review_status   VARCHAR(20) DEFAULT 'none'
        CHECK (review_status IN ('none', 'pending_review', 'approved', 'rejected', 'revision_requested')),
    reviewed_by     UUID REFERENCES users(id),
    reviewed_at     TIMESTAMPTZ,
    review_notes    TEXT,
    
    -- Signature
    requires_signature BOOLEAN DEFAULT FALSE,
    signature_status   VARCHAR(20) DEFAULT 'none'
        CHECK (signature_status IN ('none', 'pending', 'signed', 'declined', 'expired')),
    signature_provider VARCHAR(20),
    signature_request_id VARCHAR(255),
    signed_at       TIMESTAMPTZ,
    
    -- AI processing
    ai_summary      TEXT,                                 -- AI-generated document summary
    ai_extracted_data JSONB,                              -- AI-extracted key fields from document
    ocr_text        TEXT,                                 -- OCR extracted text for scanned docs
    
    uploaded_by     UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_documents_tenant ON documents(tenant_id);
CREATE INDEX idx_documents_matter ON documents(matter_id);
CREATE INDEX idx_documents_contact ON documents(contact_id);
CREATE INDEX idx_documents_type ON documents(tenant_id, document_type);
CREATE INDEX idx_documents_review ON documents(tenant_id, review_status);

CREATE TABLE document_requests (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    matter_id       UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
    contact_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    
    title           VARCHAR(255) NOT NULL,
    description     TEXT,
    
    status          VARCHAR(20) DEFAULT 'requested'
        CHECK (status IN ('requested', 'reminder_sent', 'submitted', 'approved', 'rejected', 'resubmit_requested')),
    
    document_id     UUID REFERENCES documents(id),
    
    due_date        DATE,
    reminder_count  INTEGER DEFAULT 0,
    last_reminder_at TIMESTAMPTZ,
    auto_remind     BOOLEAN DEFAULT TRUE,
    remind_interval_days INTEGER DEFAULT 3,
    max_reminders   INTEGER DEFAULT 5,
    
    requested_by    UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_doc_requests_matter ON document_requests(matter_id);
CREATE INDEX idx_doc_requests_status ON document_requests(tenant_id, status);

CREATE TABLE document_templates (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    category        VARCHAR(50),
    practice_area_id UUID REFERENCES practice_areas(id),
    
    template_type   VARCHAR(20) DEFAULT 'docx'
        CHECK (template_type IN ('docx', 'html', 'pdf')),
    storage_path    TEXT NOT NULL,
    merge_fields    JSONB DEFAULT '[]',
    
    is_active       BOOLEAN DEFAULT TRUE,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SECTION 9: COMMUNICATIONS
-- ============================================================================

CREATE TABLE communications (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    matter_id       UUID REFERENCES matters(id) ON DELETE SET NULL,
    contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,
    
    channel         VARCHAR(20) NOT NULL
        CHECK (channel IN ('email', 'sms', 'phone_call', 'internal_note', 'meeting', 'chat', 'form_submission')),
    direction       VARCHAR(10) NOT NULL DEFAULT 'outbound'
        CHECK (direction IN ('inbound', 'outbound', 'internal')),
    
    -- Content
    subject         VARCHAR(500),
    body            TEXT,
    body_html       TEXT,
    
    -- Email-specific
    from_address    VARCHAR(255),
    to_addresses    TEXT[],
    cc_addresses    TEXT[],
    bcc_addresses   TEXT[],
    external_message_id VARCHAR(255),
    thread_id       VARCHAR(255),
    has_attachments BOOLEAN DEFAULT FALSE,
    
    -- SMS-specific
    sms_from        VARCHAR(30),
    sms_to          VARCHAR(30),
    sms_segments    INTEGER,
    
    -- Phone-specific
    call_duration   INTEGER,
    call_recording_url TEXT,
    call_transcript TEXT,
    call_disposition VARCHAR(50),                         -- answered, voicemail, busy, no_answer
    
    -- Meeting-specific
    meeting_date    TIMESTAMPTZ,
    meeting_duration INTEGER,
    meeting_location TEXT,
    meeting_recording_url TEXT,
    meeting_transcript TEXT,
    
    -- AI-generated (for meetings and calls)
    ai_summary      TEXT,
    ai_action_items JSONB DEFAULT '[]',
    ai_key_points   JSONB DEFAULT '[]',
    ai_follow_up_draft TEXT,                              -- AI-generated follow-up email
    ai_sentiment    VARCHAR(20),                          -- positive, neutral, negative, concerned
    
    -- Status
    status          VARCHAR(20) DEFAULT 'sent'
        CHECK (status IN ('draft', 'queued', 'sent', 'delivered', 'read', 'failed', 'received', 'completed', 'bounced')),
    
    -- Tracking (email)
    opened_at       TIMESTAMPTZ,
    clicked_at      TIMESTAMPTZ,
    open_count      INTEGER DEFAULT 0,
    click_count     INTEGER DEFAULT 0,
    
    -- Source
    created_via     VARCHAR(30) DEFAULT 'manual',         -- manual, automation, marketing, ai
    campaign_id     UUID,                                 -- If sent via marketing campaign
    
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_comms_tenant ON communications(tenant_id, created_at DESC);
CREATE INDEX idx_comms_matter ON communications(matter_id, created_at DESC);
CREATE INDEX idx_comms_contact ON communications(contact_id, created_at DESC);
CREATE INDEX idx_comms_channel ON communications(tenant_id, channel);
CREATE INDEX idx_comms_thread ON communications(thread_id);
CREATE INDEX idx_comms_campaign ON communications(campaign_id);

CREATE TABLE email_templates (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    subject         VARCHAR(500),
    body_html       TEXT,
    body_text       TEXT,
    category        VARCHAR(50),
    merge_fields    JSONB DEFAULT '[]',
    
    -- Usage tracking
    times_used      INTEGER DEFAULT 0,
    last_used_at    TIMESTAMPTZ,
    
    is_active       BOOLEAN DEFAULT TRUE,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SECTION 10: APPOINTMENTS & CALENDAR
-- ============================================================================

CREATE TABLE appointments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    matter_id       UUID REFERENCES matters(id) ON DELETE SET NULL,
    contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,
    
    title           VARCHAR(255) NOT NULL,
    description     TEXT,
    appointment_type VARCHAR(50),
    location        TEXT,
    video_link      TEXT,
    
    start_time      TIMESTAMPTZ NOT NULL,
    end_time        TIMESTAMPTZ NOT NULL,
    all_day         BOOLEAN DEFAULT FALSE,
    
    status          VARCHAR(20) DEFAULT 'scheduled'
        CHECK (status IN ('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show', 'rescheduled')),
    
    -- Booking link
    booking_link_id UUID,                                 -- If created via a booking link
    
    -- External sync
    external_calendar_id VARCHAR(255),
    external_provider    VARCHAR(20),
    
    -- Reminders
    reminder_sent   BOOLEAN DEFAULT FALSE,
    reminder_minutes_before INTEGER DEFAULT 60,
    
    -- Post-meeting
    communication_id UUID REFERENCES communications(id),  -- Link to meeting record
    
    -- Recurrence
    is_recurring    BOOLEAN DEFAULT FALSE,
    recurrence_rule JSONB,
    recurring_parent_id UUID REFERENCES appointments(id),
    
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_appointments_tenant ON appointments(tenant_id, start_time);
CREATE INDEX idx_appointments_matter ON appointments(matter_id);

CREATE TABLE appointment_attendees (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    appointment_id  UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id),
    contact_id      UUID REFERENCES contacts(id),
    response_status VARCHAR(20) DEFAULT 'pending'
        CHECK (response_status IN ('pending', 'accepted', 'declined', 'tentative')),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Booking links (Calendly-style)
CREATE TABLE booking_links (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id),
    
    slug            VARCHAR(100) NOT NULL,                -- URL-safe slug
    title           VARCHAR(255) NOT NULL,
    description     TEXT,
    duration_minutes INTEGER DEFAULT 30,
    location_type   VARCHAR(20) DEFAULT 'video',          -- video, phone, in_person
    
    -- Availability
    available_hours JSONB DEFAULT '{}',                   -- {mon: [{start: "09:00", end: "17:00"}], ...}
    buffer_minutes  INTEGER DEFAULT 15,                   -- Buffer between appointments
    max_advance_days INTEGER DEFAULT 60,                  -- How far ahead clients can book
    
    -- Intake form fields
    intake_fields   JSONB DEFAULT '[
        {"key": "name", "label": "Full Name", "type": "text", "required": true},
        {"key": "email", "label": "Email", "type": "email", "required": true},
        {"key": "phone", "label": "Phone", "type": "phone", "required": false},
        {"key": "notes", "label": "Tell us about your matter", "type": "textarea", "required": false}
    ]',
    
    -- Auto-actions
    auto_create_contact BOOLEAN DEFAULT TRUE,
    auto_create_lead BOOLEAN DEFAULT TRUE,
    default_pipeline_id UUID REFERENCES pipelines(id),
    default_practice_area_id UUID REFERENCES practice_areas(id),
    
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SECTION 11: PAYMENTS & BILLING
-- ============================================================================

CREATE TABLE invoices (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    matter_id       UUID REFERENCES matters(id),
    contact_id      UUID NOT NULL REFERENCES contacts(id),
    
    invoice_number  VARCHAR(50),
    status          VARCHAR(20) DEFAULT 'draft'
        CHECK (status IN ('draft', 'sent', 'viewed', 'partially_paid', 'paid', 'overdue', 'void', 'written_off')),
    
    subtotal        DECIMAL(12,2) NOT NULL DEFAULT 0,
    discount_amount DECIMAL(12,2) DEFAULT 0,
    tax_rate        DECIMAL(5,4) DEFAULT 0.13,
    tax_amount      DECIMAL(12,2) DEFAULT 0,
    total           DECIMAL(12,2) NOT NULL DEFAULT 0,
    amount_paid     DECIMAL(12,2) DEFAULT 0,
    balance_due     DECIMAL(12,2) GENERATED ALWAYS AS (total - amount_paid) STORED,
    
    account_type    VARCHAR(20) DEFAULT 'general'
        CHECK (account_type IN ('general', 'trust')),
    
    issue_date      DATE DEFAULT CURRENT_DATE,
    due_date        DATE,
    paid_date       DATE,
    
    -- Payment link
    payment_link_url TEXT,                                -- Stripe/LawPay payment link
    payment_link_expires TIMESTAMPTZ,
    
    notes           TEXT,
    internal_notes  TEXT,                                  -- Not shown to client
    
    -- Reminders
    reminder_count  INTEGER DEFAULT 0,
    last_reminder_at TIMESTAMPTZ,
    
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_invoices_tenant ON invoices(tenant_id);
CREATE INDEX idx_invoices_matter ON invoices(matter_id);
CREATE INDEX idx_invoices_status ON invoices(tenant_id, status);

CREATE TABLE invoice_line_items (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id      UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    description     VARCHAR(500) NOT NULL,
    quantity        DECIMAL(10,2) DEFAULT 1,
    unit_price      DECIMAL(12,2) NOT NULL,
    amount          DECIMAL(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    time_entry_id   UUID REFERENCES time_entries(id),     -- Link to time entry if hourly
    sort_order      INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE payments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    invoice_id      UUID REFERENCES invoices(id),
    contact_id      UUID NOT NULL REFERENCES contacts(id),
    matter_id       UUID REFERENCES matters(id),
    
    amount          DECIMAL(12,2) NOT NULL,
    payment_method  VARCHAR(30),
    account_type    VARCHAR(20) DEFAULT 'general'
        CHECK (account_type IN ('general', 'trust')),
    
    payment_provider    VARCHAR(20),
    external_payment_id VARCHAR(255),
    
    status          VARCHAR(20) DEFAULT 'completed'
        CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'refunded', 'partially_refunded')),
    
    refund_amount   DECIMAL(12,2) DEFAULT 0,
    refund_reason   TEXT,
    
    notes           TEXT,
    receipt_url     TEXT,
    received_by     UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payments_tenant ON payments(tenant_id, created_at DESC);
CREATE INDEX idx_payments_matter ON payments(matter_id);

-- ============================================================================
-- SECTION 12: INTERNAL CHAT
-- ============================================================================

CREATE TABLE chat_channels (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            VARCHAR(100),
    channel_type    VARCHAR(20) DEFAULT 'direct'
        CHECK (channel_type IN ('direct', 'group', 'matter')),
    matter_id       UUID REFERENCES matters(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE chat_channel_members (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    channel_id      UUID NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_read_at    TIMESTAMPTZ,
    joined_at       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(channel_id, user_id)
);

CREATE TABLE chat_messages (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    channel_id      UUID NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
    sender_id       UUID NOT NULL REFERENCES users(id),
    
    content         TEXT NOT NULL,
    
    -- Rich content
    attachments     JSONB DEFAULT '[]',                   -- [{file_name, storage_path, file_type}]
    mentions        UUID[] DEFAULT '{}',                  -- User IDs mentioned
    
    -- Optional links
    matter_id       UUID REFERENCES matters(id),
    document_id     UUID REFERENCES documents(id),
    task_id         UUID REFERENCES tasks(id),
    
    is_edited       BOOLEAN DEFAULT FALSE,
    edited_at       TIMESTAMPTZ,
    is_deleted      BOOLEAN DEFAULT FALSE,
    
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chat_messages_channel ON chat_messages(channel_id, created_at DESC);

-- ============================================================================
-- SECTION 13: UNIFIED ACTIVITY TIMELINE
-- ============================================================================

CREATE TABLE activities (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    matter_id       UUID REFERENCES matters(id) ON DELETE CASCADE,
    contact_id      UUID REFERENCES contacts(id) ON DELETE CASCADE,
    
    activity_type   VARCHAR(30) NOT NULL,
    title           VARCHAR(255) NOT NULL,
    description     TEXT,
    
    entity_type     VARCHAR(30),
    entity_id       UUID,
    
    user_id         UUID REFERENCES users(id),
    
    -- Engagement scoring
    engagement_points INTEGER DEFAULT 0,                  -- Points awarded for this activity
    
    metadata        JSONB DEFAULT '{}',
    
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_activities_matter ON activities(matter_id, created_at DESC);
CREATE INDEX idx_activities_contact ON activities(contact_id, created_at DESC);
CREATE INDEX idx_activities_tenant ON activities(tenant_id, created_at DESC);

-- ============================================================================
-- SECTION 14: LEADS
-- ============================================================================

CREATE TABLE leads (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    contact_id      UUID NOT NULL REFERENCES contacts(id),
    
    pipeline_id     UUID NOT NULL REFERENCES pipelines(id),
    stage_id        UUID NOT NULL REFERENCES pipeline_stages(id),
    stage_entered_at TIMESTAMPTZ DEFAULT NOW(),
    
    source          VARCHAR(100),
    source_detail   TEXT,
    source_campaign VARCHAR(255),                         -- Marketing campaign that generated this lead
    utm_source      VARCHAR(255),
    utm_medium      VARCHAR(255),
    utm_campaign    VARCHAR(255),
    
    practice_area_id UUID REFERENCES practice_areas(id),
    estimated_value DECIMAL(12,2),
    weighted_value  DECIMAL(12,2),                        -- estimated_value * stage win_probability
    
    assigned_to     UUID REFERENCES users(id),
    
    -- Engagement
    engagement_score INTEGER DEFAULT 0,
    temperature     VARCHAR(10) DEFAULT 'warm'
        CHECK (temperature IN ('cold', 'warm', 'hot')),
    
    -- Status
    status          VARCHAR(20) DEFAULT 'open'
        CHECK (status IN ('open', 'converted', 'lost', 'dormant')),
    
    converted_matter_id UUID REFERENCES matters(id),
    converted_at    TIMESTAMPTZ,
    lost_reason     VARCHAR(255),
    lost_detail     TEXT,
    
    -- Follow-up
    next_follow_up  DATE,
    follow_up_count INTEGER DEFAULT 0,
    
    notes           TEXT,
    custom_fields   JSONB DEFAULT '{}',
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_leads_tenant ON leads(tenant_id, status);
CREATE INDEX idx_leads_pipeline ON leads(pipeline_id, stage_id);
CREATE INDEX idx_leads_assigned ON leads(assigned_to, status);
CREATE INDEX idx_leads_follow_up ON leads(tenant_id, next_follow_up) WHERE status = 'open';
CREATE INDEX idx_leads_score ON leads(tenant_id, engagement_score DESC);

-- ============================================================================
-- SECTION 15: CUSTOM FIELD DEFINITIONS
-- ============================================================================

CREATE TABLE custom_field_definitions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    entity_type     VARCHAR(30) NOT NULL
        CHECK (entity_type IN ('contact', 'matter', 'lead')),
    
    field_key       VARCHAR(100) NOT NULL,
    field_label     VARCHAR(255) NOT NULL,
    field_type      VARCHAR(20) NOT NULL
        CHECK (field_type IN ('text', 'number', 'decimal', 'date', 'datetime', 'boolean', 'select', 'multi_select', 'email', 'phone', 'url', 'textarea', 'currency', 'file')),
    
    options         JSONB,
    is_required     BOOLEAN DEFAULT FALSE,
    default_value   TEXT,
    sort_order      INTEGER DEFAULT 0,
    
    -- Conditional visibility
    practice_area_id UUID REFERENCES practice_areas(id),
    show_on_card    BOOLEAN DEFAULT FALSE,                -- Show on pipeline Kanban card
    show_in_table   BOOLEAN DEFAULT FALSE,                -- Show as column in list view
    
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_custom_fields_tenant ON custom_field_definitions(tenant_id, entity_type);

-- ============================================================================
-- SECTION 16: CONTRACTS & RETAINERS
-- ============================================================================

CREATE TABLE contracts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    matter_id       UUID REFERENCES matters(id),
    contact_id      UUID NOT NULL REFERENCES contacts(id),
    
    contract_type   VARCHAR(50) NOT NULL,
    title           VARCHAR(255) NOT NULL,
    
    document_id     UUID REFERENCES documents(id),
    template_id     UUID REFERENCES document_templates(id),
    
    status          VARCHAR(20) DEFAULT 'draft'
        CHECK (status IN ('draft', 'sent', 'viewed', 'signed', 'countersigned', 'active', 'expired', 'terminated')),
    
    sent_at         TIMESTAMPTZ,
    viewed_at       TIMESTAMPTZ,
    signed_at       TIMESTAMPTZ,
    countersigned_at TIMESTAMPTZ,
    effective_date  DATE,
    expiry_date     DATE,
    
    retainer_amount DECIMAL(12,2),
    
    -- Auto-actions on signing
    on_sign_create_matter BOOLEAN DEFAULT FALSE,
    on_sign_pipeline_id UUID REFERENCES pipelines(id),
    on_sign_practice_area_id UUID REFERENCES practice_areas(id),
    
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_contracts_tenant ON contracts(tenant_id);
CREATE INDEX idx_contracts_matter ON contracts(matter_id);
CREATE INDEX idx_contracts_status ON contracts(tenant_id, status);

-- ============================================================================
-- SECTION 17: WORKFLOW AUTOMATION ENGINE
-- ============================================================================

-- Automation definitions (Lawmatics / Pipedrive automation inspired)
CREATE TABLE workflow_automations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    
    -- Trigger
    trigger_type    VARCHAR(50) NOT NULL,
        -- stage_changed, lead_created, matter_created, task_completed,
        -- document_submitted, form_submitted, appointment_booked,
        -- payment_received, contract_signed, tag_added, field_changed,
        -- time_based (e.g., 3 days after last contact), engagement_score_reached
    trigger_config  JSONB NOT NULL DEFAULT '{}',
        -- e.g., {"entity": "lead", "from_stage": "...", "to_stage": "..."}
        -- or {"entity": "matter", "field": "status", "value": "active"}
        -- or {"delay_days": 3, "condition": "no_response"}
    
    -- Conditions (all must be true)
    conditions      JSONB DEFAULT '[]',
        -- [{"field": "practice_area", "operator": "equals", "value": "Immigration"},
        --  {"field": "estimated_value", "operator": "greater_than", "value": 5000}]
    
    -- Actions (executed in order)
    actions         JSONB NOT NULL DEFAULT '[]',
        -- [{"type": "send_email", "template_id": "...", "to": "contact"},
        --  {"type": "create_task", "title": "Follow up", "assign_to": "responsible_lawyer", "due_days": 2},
        --  {"type": "send_sms", "template": "..."},
        --  {"type": "move_stage", "stage_id": "..."},
        --  {"type": "add_tag", "tag": "high-value"},
        --  {"type": "assign_user", "user_id": "..."},
        --  {"type": "create_document", "template_id": "..."},
        --  {"type": "send_notification", "to": "assigned_user", "message": "..."},
        --  {"type": "update_field", "entity": "lead", "field": "temperature", "value": "hot"},
        --  {"type": "webhook", "url": "...", "method": "POST"},
        --  {"type": "delay", "delay_minutes": 1440}]
    
    is_active       BOOLEAN DEFAULT TRUE,
    
    -- Stats
    times_triggered INTEGER DEFAULT 0,
    last_triggered_at TIMESTAMPTZ,
    
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_automations_tenant ON workflow_automations(tenant_id, is_active);
CREATE INDEX idx_automations_trigger ON workflow_automations(tenant_id, trigger_type);

-- Automation execution log
CREATE TABLE automation_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    automation_id   UUID NOT NULL REFERENCES workflow_automations(id) ON DELETE CASCADE,
    
    trigger_entity_type VARCHAR(30),
    trigger_entity_id UUID,
    
    status          VARCHAR(20) DEFAULT 'completed'
        CHECK (status IN ('running', 'completed', 'failed', 'skipped')),
    
    actions_executed JSONB DEFAULT '[]',                  -- Log of each action's result
    error_message   TEXT,
    
    started_at      TIMESTAMPTZ DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

CREATE INDEX idx_auto_logs_automation ON automation_logs(automation_id, started_at DESC);

-- Scheduled automation queue (for delayed/time-based automations)
CREATE TABLE automation_queue (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    automation_id   UUID NOT NULL REFERENCES workflow_automations(id) ON DELETE CASCADE,
    
    entity_type     VARCHAR(30) NOT NULL,
    entity_id       UUID NOT NULL,
    
    execute_at      TIMESTAMPTZ NOT NULL,
    action_index    INTEGER DEFAULT 0,                    -- Which action in the sequence to execute next
    
    status          VARCHAR(20) DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_auto_queue_execute ON automation_queue(execute_at, status) WHERE status = 'pending';

-- ============================================================================
-- SECTION 18: EMAIL & SMS MARKETING
-- ============================================================================

-- Contact lists for marketing
CREATE TABLE marketing_lists (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    list_type       VARCHAR(20) DEFAULT 'static'
        CHECK (list_type IN ('static', 'dynamic')),
    
    -- Dynamic list: auto-populate based on filter criteria
    filter_criteria JSONB,                                -- Same format as saved views
    
    contact_count   INTEGER DEFAULT 0,
    
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE marketing_list_members (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    list_id         UUID NOT NULL REFERENCES marketing_lists(id) ON DELETE CASCADE,
    contact_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    added_at        TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(list_id, contact_id)
);

-- Marketing campaigns
CREATE TABLE marketing_campaigns (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    name            VARCHAR(255) NOT NULL,
    campaign_type   VARCHAR(20) NOT NULL
        CHECK (campaign_type IN ('email_blast', 'sms_blast', 'email_sequence', 'sms_sequence')),
    
    -- Target
    list_id         UUID REFERENCES marketing_lists(id),
    
    -- Content
    subject         VARCHAR(500),                         -- For email
    body_html       TEXT,
    body_text       TEXT,
    
    -- For sequences (drip campaigns)
    sequence_steps  JSONB DEFAULT '[]',
        -- [{"delay_days": 0, "subject": "...", "body": "...", "channel": "email"},
        --  {"delay_days": 3, "subject": "...", "body": "...", "channel": "sms"}]
    
    -- Scheduling
    status          VARCHAR(20) DEFAULT 'draft'
        CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'paused', 'cancelled')),
    scheduled_at    TIMESTAMPTZ,
    sent_at         TIMESTAMPTZ,
    
    -- Stats (denormalized for quick display)
    total_recipients INTEGER DEFAULT 0,
    total_sent      INTEGER DEFAULT 0,
    total_delivered  INTEGER DEFAULT 0,
    total_opened    INTEGER DEFAULT 0,
    total_clicked   INTEGER DEFAULT 0,
    total_bounced   INTEGER DEFAULT 0,
    total_unsubscribed INTEGER DEFAULT 0,
    
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_campaigns_tenant ON marketing_campaigns(tenant_id, status);

-- Individual campaign message tracking
CREATE TABLE campaign_messages (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id     UUID NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
    contact_id      UUID NOT NULL REFERENCES contacts(id),
    communication_id UUID REFERENCES communications(id),
    
    step_index      INTEGER DEFAULT 0,                    -- Which step in a sequence
    
    status          VARCHAR(20) DEFAULT 'queued'
        CHECK (status IN ('queued', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'unsubscribed', 'failed')),
    
    sent_at         TIMESTAMPTZ,
    opened_at       TIMESTAMPTZ,
    clicked_at      TIMESTAMPTZ,
    
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_campaign_msgs ON campaign_messages(campaign_id, status);

-- Unsubscribe tracking (CASL compliance)
CREATE TABLE unsubscribes (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    contact_id      UUID NOT NULL REFERENCES contacts(id),
    channel         VARCHAR(10) NOT NULL CHECK (channel IN ('email', 'sms')),
    reason          TEXT,
    unsubscribed_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, contact_id, channel)
);

-- ============================================================================
-- SECTION 19: SMART VIEWS / SAVED FILTERS (Attio inspired)
-- ============================================================================

CREATE TABLE saved_views (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id),            -- NULL = shared view
    
    name            VARCHAR(255) NOT NULL,
    entity_type     VARCHAR(30) NOT NULL,                 -- contacts, matters, leads, tasks
    
    -- View configuration
    filters         JSONB DEFAULT '[]',
        -- [{"field": "status", "operator": "equals", "value": "active"},
        --  {"field": "practice_area", "operator": "in", "value": ["Immigration", "Family"]}]
    sort_by         JSONB DEFAULT '{"field": "created_at", "direction": "desc"}',
    columns         JSONB DEFAULT '[]',                   -- Which columns to show in table view
    view_type       VARCHAR(20) DEFAULT 'table'
        CHECK (view_type IN ('table', 'kanban', 'calendar', 'timeline')),
    
    -- Grouping
    group_by        VARCHAR(100),                         -- Field to group by
    
    is_default      BOOLEAN DEFAULT FALSE,
    is_shared       BOOLEAN DEFAULT FALSE,                -- Visible to all users
    
    icon            VARCHAR(50),
    color           VARCHAR(7),
    
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_saved_views_tenant ON saved_views(tenant_id, entity_type);

-- ============================================================================
-- SECTION 20: AI FEATURES
-- ============================================================================

-- AI conversation history (for meeting summaries, document analysis, etc.)
CREATE TABLE ai_interactions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id),
    
    interaction_type VARCHAR(30) NOT NULL,
        -- meeting_summary, document_analysis, email_draft, action_extraction,
        -- contract_review, legal_research, client_communication_draft
    
    -- Context
    entity_type     VARCHAR(30),
    entity_id       UUID,
    
    -- Input/Output
    input_text      TEXT,
    input_metadata  JSONB DEFAULT '{}',
    output_text     TEXT,
    output_structured JSONB DEFAULT '{}',                 -- Structured data (action items, extracted fields)
    
    -- Model info
    model_used      VARCHAR(50),
    tokens_input    INTEGER,
    tokens_output   INTEGER,
    cost_cents      INTEGER,
    
    -- Feedback
    user_rating     INTEGER CHECK (user_rating >= 1 AND user_rating <= 5),
    user_feedback   TEXT,
    
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_tenant ON ai_interactions(tenant_id, interaction_type);

-- AI prompt templates (firm can customize AI behaviour)
CREATE TABLE ai_prompt_templates (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    name            VARCHAR(255) NOT NULL,
    prompt_type     VARCHAR(30) NOT NULL,                 -- Same types as ai_interactions
    
    system_prompt   TEXT NOT NULL,
    user_prompt_template TEXT NOT NULL,                   -- With {{variables}}
    
    is_active       BOOLEAN DEFAULT TRUE,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SECTION 21: FORMS (lead capture, intake)
-- ============================================================================

CREATE TABLE forms (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    name            VARCHAR(255) NOT NULL,
    slug            VARCHAR(100) NOT NULL,
    description     TEXT,
    form_type       VARCHAR(30) DEFAULT 'lead_capture'
        CHECK (form_type IN ('lead_capture', 'intake', 'document_collection', 'feedback', 'custom')),
    
    -- Fields
    fields          JSONB NOT NULL DEFAULT '[]',
        -- [{"key": "name", "label": "Full Name", "type": "text", "required": true, "options": []},
        --  {"key": "practice_area", "label": "Area of Law", "type": "select", "options": [...]}]
    
    -- Settings
    redirect_url    TEXT,
    confirmation_message TEXT DEFAULT 'Thank you for contacting us.',
    
    -- Auto-actions
    auto_create_contact BOOLEAN DEFAULT TRUE,
    auto_create_lead BOOLEAN DEFAULT TRUE,
    default_pipeline_id UUID REFERENCES pipelines(id),
    default_practice_area_id UUID REFERENCES practice_areas(id),
    auto_assign_to  UUID REFERENCES users(id),
    notification_emails TEXT[],                           -- Notify these emails on submission
    
    -- Branding
    branding        JSONB DEFAULT '{}',                   -- Custom colours, logo for embedded form
    
    -- Embedding
    embed_allowed_domains TEXT[] DEFAULT '{}',            -- Domains where form can be embedded
    
    -- Stats
    total_submissions INTEGER DEFAULT 0,
    
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE form_submissions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    form_id         UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
    
    data            JSONB NOT NULL DEFAULT '{}',          -- Submitted field values
    
    -- Auto-created records
    contact_id      UUID REFERENCES contacts(id),
    lead_id         UUID REFERENCES leads(id),
    
    -- Source
    ip_address      INET,
    user_agent      TEXT,
    referrer_url    TEXT,
    utm_source      VARCHAR(255),
    utm_medium      VARCHAR(255),
    utm_campaign    VARCHAR(255),
    
    status          VARCHAR(20) DEFAULT 'new'
        CHECK (status IN ('new', 'processed', 'spam', 'archived')),
    
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_form_subs ON form_submissions(form_id, created_at DESC);

-- ============================================================================
-- SECTION 22: NOTIFICATIONS & WEBHOOKS
-- ============================================================================

CREATE TABLE notifications (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id),
    
    title           VARCHAR(255) NOT NULL,
    message         TEXT,
    notification_type VARCHAR(30),
    
    entity_type     VARCHAR(30),
    entity_id       UUID,
    
    -- Delivery
    channels        TEXT[] DEFAULT '{in_app}',
    
    -- Status
    is_read         BOOLEAN DEFAULT FALSE,
    read_at         TIMESTAMPTZ,
    is_pushed       BOOLEAN DEFAULT FALSE,                -- Sent to mobile
    pushed_at       TIMESTAMPTZ,
    
    -- Priority
    priority        VARCHAR(10) DEFAULT 'normal'
        CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, is_read, created_at DESC);

-- Webhooks (for external integrations / public API)
CREATE TABLE webhooks (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    url             TEXT NOT NULL,
    events          TEXT[] NOT NULL,                      -- contact.created, matter.updated, lead.converted, etc.
    secret          VARCHAR(255),                         -- For signature verification
    
    is_active       BOOLEAN DEFAULT TRUE,
    
    -- Stats
    total_sent      INTEGER DEFAULT 0,
    total_failed    INTEGER DEFAULT 0,
    last_sent_at    TIMESTAMPTZ,
    last_status     INTEGER,                              -- HTTP status code
    
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SECTION 23: INTEGRATIONS
-- ============================================================================

CREATE TABLE integrations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id),
    
    provider        VARCHAR(50) NOT NULL,
    integration_type VARCHAR(30) NOT NULL,
    
    access_token    TEXT,                                  -- Encrypted at rest via Supabase
    refresh_token   TEXT,
    token_expires_at TIMESTAMPTZ,
    
    config          JSONB DEFAULT '{}',
    
    status          VARCHAR(20) DEFAULT 'connected'
        CHECK (status IN ('connected', 'disconnected', 'error', 'expired')),
    last_sync_at    TIMESTAMPTZ,
    last_error      TEXT,
    
    -- Sync settings
    sync_direction  VARCHAR(20) DEFAULT 'both'
        CHECK (sync_direction IN ('import', 'export', 'both')),
    sync_frequency  VARCHAR(20) DEFAULT 'realtime'
        CHECK (sync_frequency IN ('realtime', 'hourly', 'daily', 'manual')),
    
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_integrations_tenant ON integrations(tenant_id, provider);

-- ============================================================================
-- SECTION 24: REPORTING (Materialized Views)
-- ============================================================================

CREATE MATERIALIZED VIEW mv_lead_metrics AS
SELECT 
    l.tenant_id,
    l.pipeline_id,
    ps.name AS stage_name,
    l.source,
    l.practice_area_id,
    l.assigned_to,
    l.status,
    l.temperature,
    COUNT(*) AS lead_count,
    AVG(EXTRACT(EPOCH FROM (COALESCE(l.converted_at, NOW()) - l.created_at)) / 86400)::NUMERIC(10,1) AS avg_days_in_pipeline,
    SUM(CASE WHEN l.status = 'converted' THEN 1 ELSE 0 END) AS converted_count,
    SUM(l.estimated_value) AS total_estimated_value,
    SUM(l.weighted_value) AS total_weighted_value,
    DATE_TRUNC('month', l.created_at) AS month
FROM leads l
JOIN pipeline_stages ps ON l.stage_id = ps.id
GROUP BY l.tenant_id, l.pipeline_id, ps.name, l.source, l.practice_area_id, 
         l.assigned_to, l.status, l.temperature, DATE_TRUNC('month', l.created_at);

CREATE MATERIALIZED VIEW mv_revenue_summary AS
SELECT
    p.tenant_id,
    m.practice_area_id,
    m.responsible_lawyer_id,
    DATE_TRUNC('month', p.created_at) AS month,
    p.account_type,
    p.payment_method,
    SUM(p.amount) AS total_revenue,
    COUNT(*) AS payment_count,
    AVG(p.amount) AS avg_payment
FROM payments p
LEFT JOIN matters m ON p.matter_id = m.id
GROUP BY p.tenant_id, m.practice_area_id, m.responsible_lawyer_id, 
         DATE_TRUNC('month', p.created_at), p.account_type, p.payment_method;

CREATE MATERIALIZED VIEW mv_matter_metrics AS
SELECT
    m.tenant_id,
    m.practice_area_id,
    m.responsible_lawyer_id,
    m.status,
    m.billing_type,
    COUNT(*) AS matter_count,
    SUM(m.estimated_value) AS total_estimated,
    SUM(m.total_billed) AS total_billed,
    SUM(m.total_paid) AS total_paid,
    AVG(EXTRACT(EPOCH FROM (COALESCE(m.date_closed::TIMESTAMPTZ, NOW()) - m.date_opened::TIMESTAMPTZ)) / 86400)::NUMERIC(10,1) AS avg_days_open,
    DATE_TRUNC('month', m.created_at) AS month
FROM matters m
GROUP BY m.tenant_id, m.practice_area_id, m.responsible_lawyer_id,
         m.status, m.billing_type, DATE_TRUNC('month', m.created_at);

-- ============================================================================
-- SECTION 25: ROW-LEVEL SECURITY
-- ============================================================================

-- Enable RLS on all tenant-scoped tables
DO $$
DECLARE
    t TEXT;
BEGIN
    -- Tables that have a direct tenant_id column
    FOREACH t IN ARRAY ARRAY[
        'roles', 'users', 'api_keys', 'audit_logs',
        'tags', 'entity_tags',
        'contacts',
        'pipelines', 'pipeline_stages', 'practice_areas',
        'matters', 'matter_contacts',
        'task_templates', 'tasks', 'time_entries',
        'document_folders', 'documents', 'document_requests', 'document_templates',
        'communications', 'email_templates',
        'appointments', 'booking_links',
        'invoices', 'payments',
        'chat_channels', 'chat_messages',
        'activities', 'leads',
        'custom_field_definitions', 'contracts',
        'workflow_automations', 'automation_logs', 'automation_queue',
        'marketing_lists', 'marketing_campaigns', 'unsubscribes',
        'saved_views', 'ai_interactions', 'ai_prompt_templates',
        'forms', 'form_submissions',
        'notifications', 'webhooks', 'integrations'
    ]
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format(
            'CREATE POLICY tenant_isolation_%I ON %I USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()))',
            t, t
        );
    END LOOP;
END;
$$;

-- Tenants table: RLS uses 'id' (not tenant_id) since tenants.id IS the tenant identifier
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_tenants ON tenants
    USING (id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- Child/junction tables without direct tenant_id  -  isolate via parent FK
ALTER TABLE contact_relationships ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_contact_relationships ON contact_relationships
    USING (contact_id_a IN (SELECT id FROM contacts WHERE tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())));

ALTER TABLE task_template_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_task_template_items ON task_template_items
    USING (template_id IN (SELECT id FROM task_templates WHERE tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())));

ALTER TABLE appointment_attendees ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_appointment_attendees ON appointment_attendees
    USING (appointment_id IN (SELECT id FROM appointments WHERE tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())));

ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_invoice_line_items ON invoice_line_items
    USING (invoice_id IN (SELECT id FROM invoices WHERE tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())));

ALTER TABLE chat_channel_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_chat_channel_members ON chat_channel_members
    USING (channel_id IN (SELECT id FROM chat_channels WHERE tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())));

ALTER TABLE marketing_list_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_marketing_list_members ON marketing_list_members
    USING (list_id IN (SELECT id FROM marketing_lists WHERE tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())));

ALTER TABLE campaign_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_campaign_messages ON campaign_messages
    USING (campaign_id IN (SELECT id FROM marketing_campaigns WHERE tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())));

-- ============================================================================
-- SECTION 26: HELPER FUNCTIONS & TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION get_current_tenant_id()
RETURNS UUID AS $$
    SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all tables with updated_at column
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'tenants', 'users', 'contacts', 'matters', 'tasks', 'documents',
        'document_requests', 'communications', 'appointments', 'invoices',
        'leads', 'contracts', 'email_templates', 'document_templates',
        'pipelines', 'time_entries', 'workflow_automations', 'marketing_campaigns',
        'marketing_lists', 'saved_views', 'integrations', 'forms',
        'ai_prompt_templates', 'booking_links'
    ]
    LOOP
        EXECUTE format(
            'CREATE TRIGGER trigger_updated_at BEFORE UPDATE ON %I 
             FOR EACH ROW EXECUTE FUNCTION update_updated_at()',
            t
        );
    END LOOP;
END;
$$;

-- Auto-log stage changes on matters
CREATE OR REPLACE FUNCTION log_matter_stage_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
        INSERT INTO activities (tenant_id, matter_id, activity_type, title, metadata)
        VALUES (
            NEW.tenant_id, NEW.id, 'stage_change', 'Stage changed',
            jsonb_build_object('from_stage_id', OLD.stage_id, 'to_stage_id', NEW.stage_id)
        );
        NEW.stage_entered_at = NOW();
        
        -- Update weighted value based on new stage probability
        NEW.weighted_value = NEW.estimated_value * (
            SELECT COALESCE(win_probability, 0)::DECIMAL / 100 
            FROM pipeline_stages WHERE id = NEW.stage_id
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_matter_stage_change
    BEFORE UPDATE ON matters
    FOR EACH ROW EXECUTE FUNCTION log_matter_stage_change();

-- Auto-log lead stage changes
CREATE OR REPLACE FUNCTION log_lead_stage_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
        INSERT INTO activities (tenant_id, contact_id, activity_type, title, metadata)
        VALUES (
            NEW.tenant_id, NEW.contact_id, 'lead_stage_change', 'Lead stage changed',
            jsonb_build_object('from_stage_id', OLD.stage_id, 'to_stage_id', NEW.stage_id, 'lead_id', NEW.id)
        );
        NEW.stage_entered_at = NOW();
        
        NEW.weighted_value = NEW.estimated_value * (
            SELECT COALESCE(win_probability, 0)::DECIMAL / 100 
            FROM pipeline_stages WHERE id = NEW.stage_id
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_lead_stage_change
    BEFORE UPDATE ON leads
    FOR EACH ROW EXECUTE FUNCTION log_lead_stage_change();

-- Update contact engagement score on new activity
CREATE OR REPLACE FUNCTION update_contact_engagement()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.contact_id IS NOT NULL AND NEW.engagement_points > 0 THEN
        UPDATE contacts SET
            engagement_score = engagement_score + NEW.engagement_points,
            last_contacted_at = CASE 
                WHEN NEW.activity_type IN ('email_sent', 'sms_sent', 'call_made', 'meeting_completed') 
                THEN NOW() 
                ELSE last_contacted_at 
            END,
            last_interaction_type = NEW.activity_type,
            interaction_count = interaction_count + 1,
            updated_at = NOW()
        WHERE id = NEW.contact_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_engagement_update
    AFTER INSERT ON activities
    FOR EACH ROW EXECUTE FUNCTION update_contact_engagement();

-- Auto-generate matter number
CREATE OR REPLACE FUNCTION generate_matter_number()
RETURNS TRIGGER AS $$
DECLARE
    next_num INTEGER;
    year_str TEXT;
BEGIN
    IF NEW.matter_number IS NULL OR NEW.matter_number = '' THEN
        year_str := EXTRACT(YEAR FROM CURRENT_DATE)::TEXT;
        SELECT COALESCE(MAX(
            NULLIF(REGEXP_REPLACE(matter_number, '^' || year_str || '-', ''), '')::INTEGER
        ), 0) + 1
        INTO next_num
        FROM matters
        WHERE tenant_id = NEW.tenant_id
        AND matter_number LIKE year_str || '-%';
        
        NEW.matter_number := year_str || '-' || LPAD(next_num::TEXT, 4, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_matter_number
    BEFORE INSERT ON matters
    FOR EACH ROW EXECUTE FUNCTION generate_matter_number();
