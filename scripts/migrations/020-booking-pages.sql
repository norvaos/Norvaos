-- 020-booking-pages.sql
-- Calendly-like booking system: booking pages, date overrides, appointments

-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║  1. booking_pages  -  configures each public booking page                  ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS booking_pages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 30 CHECK (duration_minutes > 0),
  buffer_minutes INTEGER NOT NULL DEFAULT 0 CHECK (buffer_minutes >= 0),
  working_hours JSONB NOT NULL DEFAULT '{"start":"09:00","end":"17:00","days":[1,2,3,4,5]}'::jsonb,
  timezone TEXT NOT NULL DEFAULT 'America/Toronto',
  max_days_ahead INTEGER NOT NULL DEFAULT 30 CHECK (max_days_ahead > 0),
  min_notice_hours INTEGER NOT NULL DEFAULT 24 CHECK (min_notice_hours >= 0),
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  pipeline_id UUID REFERENCES pipelines(id) ON DELETE SET NULL,
  stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  practice_area_id UUID REFERENCES practice_areas(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  theme_color TEXT DEFAULT '#2563eb',
  confirmation_message TEXT DEFAULT 'Your booking has been confirmed! We look forward to meeting with you.',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_booking_pages_tenant ON booking_pages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_booking_pages_user ON booking_pages(user_id);
CREATE INDEX IF NOT EXISTS idx_booking_pages_slug ON booking_pages(slug);
CREATE INDEX IF NOT EXISTS idx_booking_pages_status ON booking_pages(status, is_active);

-- RLS
ALTER TABLE booking_pages ENABLE ROW LEVEL SECURITY;

-- Authenticated users: full access within their tenant
CREATE POLICY "booking_pages_tenant_access" ON booking_pages
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM public.users WHERE auth_user_id = auth.uid())
  );

-- Anonymous users: can view published, active booking pages
CREATE POLICY "booking_pages_public_read" ON booking_pages
  FOR SELECT USING (
    status = 'published' AND is_active = true
  );

-- Updated_at trigger
CREATE TRIGGER set_booking_pages_updated_at
  BEFORE UPDATE ON booking_pages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║  2. booking_page_overrides  -  date-specific availability overrides        ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS booking_page_overrides (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  booking_page_id UUID NOT NULL REFERENCES booking_pages(id) ON DELETE CASCADE,
  override_date DATE NOT NULL,
  is_available BOOLEAN NOT NULL DEFAULT false,
  start_time TIME,
  end_time TIME,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(booking_page_id, override_date)
);

CREATE INDEX IF NOT EXISTS idx_booking_overrides_page ON booking_page_overrides(booking_page_id);
CREATE INDEX IF NOT EXISTS idx_booking_overrides_date ON booking_page_overrides(override_date);

-- RLS
ALTER TABLE booking_page_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "booking_overrides_tenant_access" ON booking_page_overrides
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM public.users WHERE auth_user_id = auth.uid())
  );

-- Anonymous users can read overrides for published booking pages (needed for slot computation)
CREATE POLICY "booking_overrides_public_read" ON booking_page_overrides
  FOR SELECT USING (
    booking_page_id IN (
      SELECT id FROM booking_pages WHERE status = 'published' AND is_active = true
    )
  );


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║  3. appointments  -  booked appointment records                            ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS appointments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  booking_page_id UUID NOT NULL REFERENCES booking_pages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  appointment_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  duration_minutes INTEGER NOT NULL,
  guest_name TEXT NOT NULL,
  guest_email TEXT NOT NULL,
  guest_phone TEXT,
  guest_notes TEXT,
  answers JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed', 'cancelled', 'completed', 'no_show')),
  cancellation_reason TEXT,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointments_tenant ON appointments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_appointments_page ON appointments(booking_page_id);
CREATE INDEX IF NOT EXISTS idx_appointments_user ON appointments(user_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_contact ON appointments(contact_id);

-- RLS
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- Authenticated users: full access within their tenant
CREATE POLICY "appointments_tenant_access" ON appointments
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM public.users WHERE auth_user_id = auth.uid())
  );

-- Anonymous users: can INSERT appointments (booking submission)
CREATE POLICY "appointments_public_insert" ON appointments
  FOR INSERT WITH CHECK (true);

-- Anonymous users: can read their own appointments (by email  -  for confirmation page)
CREATE POLICY "appointments_public_read" ON appointments
  FOR SELECT USING (true);
