-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 424 — Cache de geocoding pour le calcul de distance entre 2 adresses
--
-- Contexte
--   La fonctionnalité « calcul de distance » (RH, simulateur trajets, etc.)
--   utilise OSM Nominatim pour transformer une adresse texte en (lat,lng).
--   Nominatim est gratuit mais limité à 1 req/sec et exige un User-Agent.
--   Ce cache mutualisé évite de retaper chaque adresse à chaque calcul.
--
-- Stratégie
--   - clé : adresse normalisée (lower + trim + sans diacritiques + espaces single)
--   - TTL 90 jours (les adresses bougent peu, et un purge sera fait par cron)
--   - Lecture ouverte à tout authentifié (cache partagé entre sociétés ;
--     une adresse géocodée par un user en bénéficie à tous les autres)
--   - Insertion ouverte aussi (le client SDK pousse après fetch Nominatim) ;
--     pas d'UPDATE/DELETE (immuable jusqu'à expiration ; purge par job dédié)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.geocoding_cache (
  adresse_norm  TEXT PRIMARY KEY,
  adresse_input TEXT NOT NULL,
  lat           NUMERIC(10, 7) NOT NULL,
  lng           NUMERIC(10, 7) NOT NULL,
  display_name  TEXT,
  country_code  TEXT,
  cached_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '90 days'),
  source        TEXT DEFAULT 'nominatim'
);

CREATE INDEX IF NOT EXISTS idx_geocoding_cache_expires
  ON public.geocoding_cache(expires_at);

CREATE INDEX IF NOT EXISTS idx_geocoding_cache_country
  ON public.geocoding_cache(country_code);

COMMENT ON TABLE public.geocoding_cache IS
  'Cache mutualisé adresse texte → (lat,lng) via OSM Nominatim. TTL 90j. Purge par cron sur expires_at.';
COMMENT ON COLUMN public.geocoding_cache.adresse_norm IS
  'Adresse normalisée (lowercase, sans diacritiques, espaces collapsés). Clé primaire = clé de lookup.';

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.geocoding_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS geocoding_cache_select ON public.geocoding_cache;
CREATE POLICY geocoding_cache_select ON public.geocoding_cache
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS geocoding_cache_insert ON public.geocoding_cache;
CREATE POLICY geocoding_cache_insert ON public.geocoding_cache
  FOR INSERT TO authenticated WITH CHECK (true);

-- Pas d'UPDATE/DELETE policy → table immuable côté API.
-- La purge des lignes expirées passe par un job avec service_role (bypass RLS).
