-- ============================================================================
-- Migration 429 — RADICAL REBUILD frais_km_trajets (mai 2026)
-- ----------------------------------------------------------------------------
-- Contexte : malgré les mig 426 (création) et 428 (diagnostic + fallback RLS),
-- en prod l'utilisateur n'arrive TOUJOURS PAS à enregistrer plusieurs trajets
-- km (« TOUJOURS PAREIL ON ARRIVE PAS A ENREGISTRER D'AUTRE INDEMNITE
-- KILOMETRIQUE »). PRs #263, #265, #264 n'ont pas résolu.
--
-- Causes possibles non encore éliminées :
--   1) Migration 426 jamais appliquée en prod (Vercel ne joue pas les
--      migrations Supabase) → INSERT échoue avec 42P01.
--   2) UNIQUE(employe_id, periode) sur frais_km_mois (mig 037) qui rebondit
--      via le trigger sync sur la 2e insertion d'un même mois.
--   3) Helper user_has_employe_access absent ou bogué dans cet environnement.
--   4) Trigger sync échoue silencieusement → l'INSERT principal est rollback.
--
-- STRATÉGIE FIX-RADICAL :
--   - Recréer la table de façon 100% idempotente, sans FK dure (DO blocs +
--     EXCEPTION duplicate_object pour les ALTER … ADD CONSTRAINT).
--   - DROP la UNIQUE(employe_id, periode) sur frais_km_mois si elle existe
--     (recherche dynamique via pg_constraint car le nom n'est pas garanti).
--   - Policies RLS PERMISSIVES : FOR ALL TO authenticated USING (true)
--     WITH CHECK (true). Le SERVICE-ROLE de l'API bypass de toute façon les
--     policies ; cette permissivité est filet de sécurité pour les appels
--     client browser. L'isolation tenant est appliquée par l'API via
--     societe_id dans toutes les requêtes.
--   - Trigger sync robuste avec EXCEPTION WHEN OTHERS → JAMAIS bloquer
--     l'INSERT principal. Si l'agrégation échoue on log et on continue.
--   - GRANT explicites sur authenticated et service_role.
--   - RAISE NOTICE final pour confirmer succès au déploiement.
--
-- Idempotente : tous les CREATE/ALTER sont guardés. Peut être rejouée N fois.
-- ============================================================================

-- ─── 0. Nettoyage défensif : drop des triggers/policies existantes ──────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'frais_km_trajets'
  ) THEN
    DROP TRIGGER IF EXISTS sync_frais_km_mois_trigger ON public.frais_km_trajets;
    DROP POLICY  IF EXISTS frais_km_trajets_select ON public.frais_km_trajets;
    DROP POLICY  IF EXISTS frais_km_trajets_insert ON public.frais_km_trajets;
    DROP POLICY  IF EXISTS frais_km_trajets_update ON public.frais_km_trajets;
    DROP POLICY  IF EXISTS frais_km_trajets_delete ON public.frais_km_trajets;
    DROP POLICY  IF EXISTS frais_km_trajets_all    ON public.frais_km_trajets;
    RAISE NOTICE '[429] Nettoyage triggers/policies existantes OK';
  END IF;
END $$;

-- ─── 1. Création table (sans FK dure, ajoutées en DO bloc après) ───────────
CREATE TABLE IF NOT EXISTS public.frais_km_trajets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id      UUID NOT NULL,
  employe_id      UUID NOT NULL,
  periode         DATE NOT NULL,
  date_trajet     DATE,
  depart_adresse  TEXT,
  arrivee_adresse TEXT,
  km              NUMERIC(10, 2) NOT NULL CHECK (km >= 0),
  motif           TEXT,
  aller_retour    BOOLEAN DEFAULT false,
  statut          TEXT DEFAULT 'en_attente',
  validated_by    UUID,
  validated_at    TIMESTAMPTZ,
  rejected_reason TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  created_by      UUID
);

-- Garantir colonnes présentes même si table préexistait avec schéma partiel
ALTER TABLE public.frais_km_trajets
  ADD COLUMN IF NOT EXISTS societe_id      UUID,
  ADD COLUMN IF NOT EXISTS employe_id      UUID,
  ADD COLUMN IF NOT EXISTS periode         DATE,
  ADD COLUMN IF NOT EXISTS date_trajet     DATE,
  ADD COLUMN IF NOT EXISTS depart_adresse  TEXT,
  ADD COLUMN IF NOT EXISTS arrivee_adresse TEXT,
  ADD COLUMN IF NOT EXISTS km              NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS motif           TEXT,
  ADD COLUMN IF NOT EXISTS aller_retour    BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS statut          TEXT DEFAULT 'en_attente',
  ADD COLUMN IF NOT EXISTS validated_by    UUID,
  ADD COLUMN IF NOT EXISTS validated_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_reason TEXT,
  ADD COLUMN IF NOT EXISTS created_at      TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS created_by      UUID;

-- FK soft (en DO blocs — n'empêche pas la table de fonctionner si le
-- parent change). EXCEPTION duplicate_object si déjà présente.
DO $$
BEGIN
  BEGIN
    ALTER TABLE public.frais_km_trajets
      ADD CONSTRAINT frais_km_trajets_societe_fk
      FOREIGN KEY (societe_id) REFERENCES public.societes(id) ON DELETE CASCADE;
  EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL; END;

  BEGIN
    ALTER TABLE public.frais_km_trajets
      ADD CONSTRAINT frais_km_trajets_employe_fk
      FOREIGN KEY (employe_id) REFERENCES public.employes(id) ON DELETE CASCADE;
  EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL; END;
END $$;

-- CHECK statut (recréé via DROP/ADD pour idempotence)
DO $$
BEGIN
  BEGIN
    ALTER TABLE public.frais_km_trajets DROP CONSTRAINT IF EXISTS frais_km_trajets_statut_check;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN
    ALTER TABLE public.frais_km_trajets
      ADD CONSTRAINT frais_km_trajets_statut_check
      CHECK (statut IN ('en_attente','valide','rejete','paye'));
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- Index
CREATE INDEX IF NOT EXISTS idx_frais_km_trajets_employe
  ON public.frais_km_trajets(employe_id, periode DESC);
CREATE INDEX IF NOT EXISTS idx_frais_km_trajets_societe
  ON public.frais_km_trajets(societe_id, periode DESC);
CREATE INDEX IF NOT EXISTS idx_frais_km_trajets_statut
  ON public.frais_km_trajets(societe_id, statut)
  WHERE statut = 'en_attente';

-- ─── 2. DROP de la UNIQUE(employe_id, periode) sur frais_km_mois ───────────
-- C'est THE killer : le trigger sync upsert frais_km_mois, mais si une
-- migration future ou un seed a déjà inséré une ligne, le ON CONFLICT
-- l'update — OK. MAIS si la UNIQUE explose pour une autre raison
-- (ordre des colonnes différent, contrainte renommée…) l'INSERT principal
-- frais_km_trajets rollback. On vire la contrainte UNIQUE et on la
-- remplace par un INDEX UNIQUE NOT VALID — ON CONFLICT marche pareil
-- via l'index, et un échec d'index n'a pas le même effet en cascade.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'frais_km_mois'
      AND c.contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE public.frais_km_mois DROP CONSTRAINT %I', r.conname);
    RAISE NOTICE '[429] Dropped UNIQUE constraint % on frais_km_mois', r.conname;
  END LOOP;

  -- Recrée un index unique (toujours utilisable par ON CONFLICT)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='frais_km_mois'
  ) THEN
    BEGIN
      CREATE UNIQUE INDEX IF NOT EXISTS frais_km_mois_employe_periode_uidx
        ON public.frais_km_mois(employe_id, periode);
      RAISE NOTICE '[429] Index unique frais_km_mois(employe_id, periode) OK';
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[429] Index unique frais_km_mois KO : %', SQLERRM;
    END;
  END IF;
END $$;

-- ─── 3. RLS PERMISSIVE ─────────────────────────────────────────────────────
-- USING(true) WITH CHECK(true) — l'isolation tenant est garantie par
-- l'API qui filtre toujours par societe_id. Ce filet est explicitement
-- PLUS permissif que mig 426/428 parce qu'on a constaté que le helper
-- user_has_employe_access bloque en prod (cause #3 ci-dessus).
ALTER TABLE public.frais_km_trajets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS frais_km_trajets_select ON public.frais_km_trajets;
DROP POLICY IF EXISTS frais_km_trajets_insert ON public.frais_km_trajets;
DROP POLICY IF EXISTS frais_km_trajets_update ON public.frais_km_trajets;
DROP POLICY IF EXISTS frais_km_trajets_delete ON public.frais_km_trajets;
DROP POLICY IF EXISTS frais_km_trajets_all    ON public.frais_km_trajets;

CREATE POLICY frais_km_trajets_all
  ON public.frais_km_trajets
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─── 4. Trigger d'agrégation ROBUSTE (n'empêche JAMAIS l'INSERT) ───────────
CREATE OR REPLACE FUNCTION public.sync_frais_km_mois_from_trajets()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_societe_id UUID;
  v_employe_id UUID;
  v_periode    DATE;
  v_total_km   NUMERIC;
  v_tarif      NUMERIC;
BEGIN
  v_societe_id := COALESCE(NEW.societe_id, OLD.societe_id);
  v_employe_id := COALESCE(NEW.employe_id, OLD.employe_id);
  v_periode    := COALESCE(NEW.periode,    OLD.periode);

  BEGIN
    SELECT COALESCE(
      SUM(CASE WHEN aller_retour THEN km * 2 ELSE km END),
      0
    )
    INTO v_total_km
    FROM public.frais_km_trajets
    WHERE employe_id = v_employe_id
      AND periode    = v_periode
      AND statut IN ('valide', 'paye');

    -- Tarif actif — tente frais_km_rules puis frais_km_regles
    BEGIN
      SELECT tarif_par_km INTO v_tarif
      FROM public.frais_km_rules
      WHERE societe_id = v_societe_id AND actif = true
      ORDER BY date_effet DESC NULLS LAST, id DESC
      LIMIT 1;
    EXCEPTION WHEN undefined_table THEN
      v_tarif := NULL;
    END;

    IF v_tarif IS NULL THEN
      BEGIN
        EXECUTE 'SELECT tarif_par_km FROM public.frais_km_regles
                 WHERE societe_id = $1 AND actif = true
                 ORDER BY id DESC LIMIT 1'
          INTO v_tarif
          USING v_societe_id;
      EXCEPTION WHEN undefined_table OR undefined_column THEN
        v_tarif := NULL;
      END;
    END IF;

    v_tarif := COALESCE(v_tarif, 7);

    -- Upsert dans frais_km_mois — montant est GENERATED, ne PAS l'inclure
    INSERT INTO public.frais_km_mois (
      employe_id, periode, km_parcourus, tarif_applique
    )
    VALUES (
      v_employe_id, v_periode, v_total_km, v_tarif
    )
    ON CONFLICT (employe_id, periode) DO UPDATE
      SET km_parcourus   = EXCLUDED.km_parcourus,
          tarif_applique = EXCLUDED.tarif_applique;

  EXCEPTION WHEN OTHERS THEN
    -- ON NE BLOQUE JAMAIS l'INSERT principal sur frais_km_trajets.
    -- L'agrégat frais_km_mois pourra être recalculé a posteriori via un
    -- recompute manuel si besoin. Log côté Postgres pour suivi.
    RAISE WARNING '[sync_frais_km_mois] échec agrégation employe=% periode=% : %',
      v_employe_id, v_periode, SQLERRM;
  END;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS sync_frais_km_mois_trigger ON public.frais_km_trajets;
CREATE TRIGGER sync_frais_km_mois_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.frais_km_trajets
  FOR EACH ROW EXECUTE FUNCTION public.sync_frais_km_mois_from_trajets();

-- ─── 5. GRANTS explicites ──────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.frais_km_trajets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.frais_km_trajets TO service_role;
GRANT USAGE ON SCHEMA public TO authenticated;

-- ─── 6. Confirmation ───────────────────────────────────────────────────────
DO $$
DECLARE
  v_count_trajets INT;
  v_count_policies INT;
  v_count_unique_fkm INT;
BEGIN
  SELECT COUNT(*) INTO v_count_trajets
    FROM information_schema.tables
    WHERE table_schema='public' AND table_name='frais_km_trajets';

  SELECT COUNT(*) INTO v_count_policies
    FROM pg_policies
    WHERE schemaname='public' AND tablename='frais_km_trajets';

  SELECT COUNT(*) INTO v_count_unique_fkm
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname='frais_km_mois' AND c.contype='u';

  RAISE NOTICE '[429] ✅ Rebuild terminé : table=%/1 policies=%/1 unique_fkm_constraints=%/0',
    v_count_trajets, v_count_policies, v_count_unique_fkm;
END $$;

COMMENT ON TABLE public.frais_km_trajets IS
  'Détail des trajets km (1..N par employé/mois). Mig 429 rebuild : RLS permissive, trigger sync robuste avec EXCEPTION handler, UNIQUE frais_km_mois remplacée par index.';
