-- ============================================================================
-- Migration 176: Firm Knowledge Wiki & Playbooks
-- ============================================================================
-- Tables: wiki_categories, wiki_playbooks, wiki_playbook_versions, wiki_snippets
-- Full-text search via tsvector for < 100ms VELOCITY search
-- Version-controlled playbooks with author tracking
-- ============================================================================

-- ── 1. Wiki Categories ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wiki_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  description TEXT,
  color       TEXT DEFAULT '#6366f1',
  icon        TEXT DEFAULT 'folder',
  sort_order  INT DEFAULT 0,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  created_by  UUID REFERENCES users(id),
  UNIQUE(tenant_id, slug)
);

ALTER TABLE wiki_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY wiki_categories_tenant_policy ON wiki_categories
  FOR ALL USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_wiki_categories_tenant ON wiki_categories(tenant_id);

-- ── 2. Wiki Playbooks (Notion-style block documents) ────────────────────────

CREATE TABLE IF NOT EXISTS wiki_playbooks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  category_id     UUID REFERENCES wiki_categories(id),
  title           TEXT NOT NULL,
  slug            TEXT NOT NULL,
  description     TEXT,
  content         JSONB DEFAULT '[]'::jsonb,
  tags            TEXT[] DEFAULT '{}',
  status          TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  is_pinned       BOOLEAN DEFAULT false,
  version_number  INT DEFAULT 1,
  practice_area_id UUID REFERENCES practice_areas(id),
  matter_type_id  UUID REFERENCES matter_types(id),
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  created_by      UUID REFERENCES users(id),
  updated_by      UUID REFERENCES users(id),
  -- Full-text search vector (populated by trigger  -  see below)
  search_vector   TSVECTOR,
  UNIQUE(tenant_id, slug)
);

ALTER TABLE wiki_playbooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY wiki_playbooks_tenant_policy ON wiki_playbooks
  FOR ALL USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_wiki_playbooks_tenant ON wiki_playbooks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wiki_playbooks_category ON wiki_playbooks(category_id);
CREATE INDEX IF NOT EXISTS idx_wiki_playbooks_search ON wiki_playbooks USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_wiki_playbooks_tags ON wiki_playbooks USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_wiki_playbooks_status ON wiki_playbooks(tenant_id, status) WHERE is_active = true;

-- ── 3. Wiki Playbook Versions (audit trail) ─────────────────────────────────

CREATE TABLE IF NOT EXISTS wiki_playbook_versions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  playbook_id   UUID NOT NULL REFERENCES wiki_playbooks(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  title         TEXT NOT NULL,
  content       JSONB DEFAULT '[]'::jsonb,
  change_summary TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  created_by    UUID REFERENCES users(id)
);

ALTER TABLE wiki_playbook_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY wiki_playbook_versions_tenant_policy ON wiki_playbook_versions
  FOR ALL USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_wiki_versions_playbook ON wiki_playbook_versions(playbook_id, version_number DESC);

-- ── 4. Wiki Snippets (reusable email/doc clauses) ───────────────────────────

CREATE TABLE IF NOT EXISTS wiki_snippets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  category_id     UUID REFERENCES wiki_categories(id),
  title           TEXT NOT NULL,
  content         TEXT NOT NULL,
  snippet_type    TEXT DEFAULT 'email' CHECK (snippet_type IN ('email', 'clause', 'template', 'note')),
  tags            TEXT[] DEFAULT '{}',
  use_count       INT DEFAULT 0,
  is_favourite    BOOLEAN DEFAULT false,
  practice_area_id UUID REFERENCES practice_areas(id),
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  created_by      UUID REFERENCES users(id),
  updated_by      UUID REFERENCES users(id),
  -- Full-text search vector (populated by trigger  -  see below)
  search_vector   TSVECTOR
);

ALTER TABLE wiki_snippets ENABLE ROW LEVEL SECURITY;

CREATE POLICY wiki_snippets_tenant_policy ON wiki_snippets
  FOR ALL USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_wiki_snippets_tenant ON wiki_snippets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wiki_snippets_search ON wiki_snippets USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_wiki_snippets_type ON wiki_snippets(tenant_id, snippet_type) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_wiki_snippets_tags ON wiki_snippets USING GIN(tags);

-- ── 5. Search RPC (VELOCITY engine  -  < 100ms target) ────────────────────────

-- ── 5a. Trigger functions to populate search_vector on INSERT/UPDATE ────────
-- (Cannot use GENERATED ALWAYS because array_to_string is not immutable)

CREATE OR REPLACE FUNCTION wiki_playbooks_search_vector_trigger()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(array_to_string(NEW.tags, ' '), '')), 'C');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wiki_playbooks_search_vector ON wiki_playbooks;
CREATE TRIGGER trg_wiki_playbooks_search_vector
  BEFORE INSERT OR UPDATE ON wiki_playbooks
  FOR EACH ROW EXECUTE FUNCTION wiki_playbooks_search_vector_trigger();

CREATE OR REPLACE FUNCTION wiki_snippets_search_vector_trigger()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.content, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(array_to_string(NEW.tags, ' '), '')), 'C');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wiki_snippets_search_vector ON wiki_snippets;
CREATE TRIGGER trg_wiki_snippets_search_vector
  BEFORE INSERT OR UPDATE ON wiki_snippets
  FOR EACH ROW EXECUTE FUNCTION wiki_snippets_search_vector_trigger();

-- ── 5b. Search RPC (VELOCITY engine  -  < 100ms target) ─────────────────────

CREATE OR REPLACE FUNCTION wiki_search(
  p_search_term TEXT,
  p_result_limit INT DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  item_type TEXT,
  title TEXT,
  description TEXT,
  category_name TEXT,
  tags TEXT[],
  status TEXT,
  updated_at TIMESTAMPTZ,
  rank REAL
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_query TSQUERY;
BEGIN
  -- Resolve tenant from auth context
  SELECT u.tenant_id INTO v_tenant_id
  FROM users u WHERE u.auth_user_id = auth.uid();

  IF v_tenant_id IS NULL THEN
    RETURN;
  END IF;

  -- Build tsquery with prefix matching for instant-as-you-type
  v_query := websearch_to_tsquery('english', p_search_term);

  RETURN QUERY
  (
    SELECT
      p.id,
      'playbook'::TEXT AS item_type,
      p.title,
      p.description,
      c.name AS category_name,
      p.tags,
      p.status,
      p.updated_at,
      ts_rank(p.search_vector, v_query) AS rank
    FROM wiki_playbooks p
    LEFT JOIN wiki_categories c ON c.id = p.category_id
    WHERE p.tenant_id = v_tenant_id
      AND p.is_active = true
      AND p.search_vector @@ v_query
  )
  UNION ALL
  (
    SELECT
      s.id,
      'snippet'::TEXT AS item_type,
      s.title,
      left(s.content, 200) AS description,
      c.name AS category_name,
      s.tags,
      s.snippet_type AS status,
      s.updated_at,
      ts_rank(s.search_vector, v_query) AS rank
    FROM wiki_snippets s
    LEFT JOIN wiki_categories c ON c.id = s.category_id
    WHERE s.tenant_id = v_tenant_id
      AND s.is_active = true
      AND s.search_vector @@ v_query
  )
  ORDER BY rank DESC
  LIMIT p_result_limit;
END;
$$;
