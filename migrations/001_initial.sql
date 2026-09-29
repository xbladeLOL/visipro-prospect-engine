CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE business_status AS ENUM ('DISCOVERED','QUEUED','ANALYZING','ANALYZED','REVIEW','APPROVED','REJECTED','DO_NOT_CONTACT','ERROR');
CREATE TYPE job_status AS ENUM ('PENDING','RUNNING','COMPLETED','FAILED','CANCELLED');
CREATE TYPE job_type AS ENUM ('DISCOVER','ANALYZE_SITE','AI_ANALYZE','REANALYZE');

CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE search_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  country_code char(2) NOT NULL DEFAULT 'FR',
  latitude double precision,
  longitude double precision,
  radius_km integer NOT NULL DEFAULT 30 CHECK (radius_km BETWEEN 1 AND 200),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, country_code)
);

CREATE TABLE search_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  label text NOT NULL,
  query_terms text[] NOT NULL,
  lead_value_score smallint NOT NULL DEFAULT 5 CHECK (lead_value_score BETWEEN 0 AND 10),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE discovered_businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_id text,
  name text NOT NULL,
  normalized_name text NOT NULL,
  category text,
  address text,
  postal_code text,
  city text,
  country_code char(2) NOT NULL DEFAULT 'FR',
  latitude double precision,
  longitude double precision,
  phone text,
  normalized_phone text,
  website_url text,
  website_domain text,
  email text,
  rating numeric(3,2),
  review_count integer,
  source_url text,
  siren text,
  siret text,
  status business_status NOT NULL DEFAULT 'DISCOVERED',
  rejection_reason text,
  raw_source jsonb NOT NULL DEFAULT '{}',
  discovered_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_analyzed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX discovered_provider_unique ON discovered_businesses(provider, provider_id) WHERE provider_id IS NOT NULL;
CREATE INDEX discovered_domain_idx ON discovered_businesses(website_domain);
CREATE INDEX discovered_phone_idx ON discovered_businesses(normalized_phone);
CREATE INDEX discovered_status_idx ON discovered_businesses(status, discovered_at DESC);
CREATE INDEX discovered_city_idx ON discovered_businesses(city);

CREATE TABLE website_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES discovered_businesses(id) ON DELETE CASCADE,
  final_url text,
  http_status integer,
  reachable boolean NOT NULL DEFAULT false,
  response_ms integer,
  tls boolean NOT NULL DEFAULT false,
  title text,
  meta_description text,
  lang text,
  h1_count integer NOT NULL DEFAULT 0,
  has_viewport boolean NOT NULL DEFAULT false,
  has_canonical boolean NOT NULL DEFAULT false,
  has_schema_org boolean NOT NULL DEFAULT false,
  has_phone_link boolean NOT NULL DEFAULT false,
  has_email_link boolean NOT NULL DEFAULT false,
  has_contact_form boolean NOT NULL DEFAULT false,
  has_quote_cta boolean NOT NULL DEFAULT false,
  has_social_links boolean NOT NULL DEFAULT false,
  has_robots boolean NOT NULL DEFAULT false,
  has_sitemap boolean NOT NULL DEFAULT false,
  copyright_year integer,
  word_count integer NOT NULL DEFAULT 0,
  internal_pages_checked integer NOT NULL DEFAULT 1,
  broken_links integer NOT NULL DEFAULT 0,
  technologies text[] NOT NULL DEFAULT '{}',
  issues jsonb NOT NULL DEFAULT '[]',
  facts jsonb NOT NULL DEFAULT '{}',
  analyzed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX website_analysis_business_idx ON website_analyses(business_id, analyzed_at DESC);

CREATE TABLE prospect_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES discovered_businesses(id) ON DELETE CASCADE,
  total smallint NOT NULL CHECK (total BETWEEN 0 AND 100),
  business_score smallint NOT NULL,
  web_opportunity_score smallint NOT NULL,
  local_score smallint NOT NULL,
  fit_score smallint NOT NULL,
  tier text NOT NULL,
  recommended_offers text[] NOT NULL DEFAULT '{}',
  reasons jsonb NOT NULL DEFAULT '[]',
  scoring_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX prospect_score_business_idx ON prospect_scores(business_id, created_at DESC);
CREATE INDEX prospect_score_total_idx ON prospect_scores(total DESC);

CREATE TABLE suppression_list (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('DOMAIN','EMAIL','PHONE','SIREN','PROVIDER_ID')),
  value text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(kind, value)
);

CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type job_type NOT NULL,
  status job_status NOT NULL DEFAULT 'PENDING',
  priority smallint NOT NULL DEFAULT 0,
  payload jsonb NOT NULL DEFAULT '{}',
  attempts smallint NOT NULL DEFAULT 0,
  max_attempts smallint NOT NULL DEFAULT 3,
  run_after timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);
CREATE INDEX jobs_claim_idx ON jobs(status, run_after, priority DESC, created_at) WHERE status = 'PENDING';

CREATE TABLE discovery_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  zone_id uuid REFERENCES search_zones(id) ON DELETE SET NULL,
  category_id uuid REFERENCES search_categories(id) ON DELETE SET NULL,
  query text NOT NULL,
  status job_status NOT NULL DEFAULT 'RUNNING',
  found_count integer NOT NULL DEFAULT 0,
  new_count integer NOT NULL DEFAULT 0,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
