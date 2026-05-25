-- =====================================================================
-- Migration 422 — Snapshots immuables des états financiers par exercice
-- =====================================================================
-- Branche : feat/cloture-immutability
--
-- Contexte :
--   - Mig 225 produit les écritures CL/AN d'une clôture d'exercice.
--   - Mig 421 verrouille les mutations sur écritures dans un exercice
--     clôturé (override admin uniquement, audité WORM).
--
-- Problème résiduel — N-1 reste vulnérable :
--   Les comparatifs (bilan N-1, CR N-1) sont recalculés à chaque
--   requête en agrégeant `ecritures_comptables_v2`. Si un admin force
--   une écriture (override audité), les états du passé changent
--   rétroactivement, ce qui détruit la valeur probante.
--
-- Solution — Snapshot immuable :
--   À la clôture (ou à la demande), on FIGE les soldes agrégés dans
--   `exercice_snapshots` (JSONB) avec :
--     - soldes_json   : soldes par compte
--     - totaux_json   : actif/passif/CA/charges/résultat
--     - ratios_json   : BFR/FR/trésorerie/marge
--   Toutes les UI N-1 (bilan compératif, CR comparatif) DOIVENT lire
--   le snapshot quand il existe, plutôt que de recalculer.
--
-- WORM :
--   - INSERT autorisé via RLS pour les users de la société.
--   - UPDATE/DELETE bloqués sauf admin Lexora (auditable).
--   - Versioning logiciel via `is_active` — un nouveau snapshot du
--     même (societe, exercice, type) désactive les précédents.
--
-- Dépend de :
--   - mig 225 : public.cloture_exercice
--   - mig 421 : public._cloture_is_admin_override()  (helper admin)
--   - public.user_has_societe_access(uuid)  (helper RLS standard)
--   - public.ecritures_comptables_v2
--   - public.profiles, public.societes
--
-- Idempotent : CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) Table des snapshots
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.exercice_snapshots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id      UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  exercice        TEXT NOT NULL,           -- 'YYYY-YYYY' (Maurice juil-juin) ou 'YYYY'
  snapshot_type   TEXT NOT NULL CHECK (snapshot_type IN (
                    'bilan', 'compte_resultat', 'grand_livre', 'balance', 'all'
                  )),
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_by    UUID REFERENCES public.profiles(id),

  -- Soldes figés (snapshot complet)
  soldes_json     JSONB NOT NULL,          -- ex: { "1000": {debit, credit, solde, nom}, ... }
  ratios_json     JSONB,                   -- BFR, FR, trésorerie, marge nette, ...
  totaux_json     JSONB,                   -- {actif_total, passif_total, ca_ht, charges_total, resultat_net}

  -- Audit / versioning
  cloture_id      UUID,                    -- lien optionnel vers l'opération de clôture
  is_active       BOOLEAN NOT NULL DEFAULT true,  -- false si régénéré (historique)
  notes           TEXT,

  UNIQUE (societe_id, exercice, snapshot_type, generated_at)
);

COMMENT ON TABLE public.exercice_snapshots IS
  'Snapshots immuables des états financiers (bilan/CR/balance/GL) par exercice. '
  'Source de vérité pour les comparatifs N-1 — protège contre les overrides admin '
  'mig 421 qui pourraient modifier rétroactivement les soldes du passé.';

COMMENT ON COLUMN public.exercice_snapshots.is_active IS
  'Faux si un snapshot plus récent du même (societe, exercice, type) le supersède. '
  'Versioning logiciel — aucune ligne n''est jamais supprimée (WORM).';

CREATE INDEX IF NOT EXISTS idx_exercice_snapshots_lookup
  ON public.exercice_snapshots(societe_id, exercice, snapshot_type)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_exercice_snapshots_societe
  ON public.exercice_snapshots(societe_id, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_exercice_snapshots_cloture
  ON public.exercice_snapshots(cloture_id)
  WHERE cloture_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- 2) RLS — WORM avec exception admin
-- ---------------------------------------------------------------------
ALTER TABLE public.exercice_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS snapshots_select ON public.exercice_snapshots;
CREATE POLICY snapshots_select
  ON public.exercice_snapshots
  FOR SELECT
  TO authenticated
  USING (public.user_has_societe_access(societe_id));

DROP POLICY IF EXISTS snapshots_insert ON public.exercice_snapshots;
CREATE POLICY snapshots_insert
  ON public.exercice_snapshots
  FOR INSERT
  TO authenticated
  WITH CHECK (public.user_has_societe_access(societe_id));

-- UPDATE bloqué sauf admin Lexora (réutilise helper mig 421)
DROP POLICY IF EXISTS snapshots_update_admin ON public.exercice_snapshots;
CREATE POLICY snapshots_update_admin
  ON public.exercice_snapshots
  FOR UPDATE
  TO authenticated
  USING (public._cloture_is_admin_override())
  WITH CHECK (public._cloture_is_admin_override());

DROP POLICY IF EXISTS snapshots_delete_admin ON public.exercice_snapshots;
CREATE POLICY snapshots_delete_admin
  ON public.exercice_snapshots
  FOR DELETE
  TO authenticated
  USING (public._cloture_is_admin_override());

-- ---------------------------------------------------------------------
-- 3) Helper : parse exercice 'YYYY-YYYY' ou 'YYYY' → dates
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._parse_exercice_dates(p_exercice TEXT)
RETURNS TABLE (date_debut DATE, date_fin DATE)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_match TEXT[];
  v_year  INT;
BEGIN
  v_match := REGEXP_MATCHES(p_exercice, '^(\d{4})-(\d{4})$');
  IF v_match IS NOT NULL THEN
    date_debut := (v_match[1] || '-07-01')::DATE;
    date_fin   := (v_match[2] || '-06-30')::DATE;
    RETURN NEXT;
    RETURN;
  END IF;

  v_match := REGEXP_MATCHES(p_exercice, '^(\d{4})$');
  IF v_match IS NULL THEN
    RAISE EXCEPTION 'Format exercice invalide : %. Attendu YYYY-YYYY ou YYYY', p_exercice;
  END IF;
  v_year := v_match[1]::INT;
  date_debut := (v_year || '-01-01')::DATE;
  date_fin   := (v_year || '-12-31')::DATE;
  RETURN NEXT;
END;
$$;

-- ---------------------------------------------------------------------
-- 4) RPC : generate_exercice_snapshot
-- ---------------------------------------------------------------------
-- Génère un snapshot complet d'un exercice et le persiste.
-- Stratégie :
--   1. Parse exercice → date_debut/fin
--   2. Agrège ecritures_comptables_v2 par compte
--   3. Calcule totaux/ratios standards
--   4. Désactive les snapshots actifs précédents du même (societe, exercice, type)
--   5. INSERT le nouveau snapshot, retourne son id
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_exercice_snapshot(
  p_societe_id UUID,
  p_exercice   TEXT,
  p_type       TEXT DEFAULT 'all',
  p_cloture_id UUID DEFAULT NULL,
  p_notes      TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_date_debut    DATE;
  v_date_fin      DATE;
  v_snapshot_id   UUID;
  v_soldes        JSONB := '{}'::JSONB;
  v_totaux        JSONB;
  v_ratios        JSONB;
  v_user_id       UUID := auth.uid();

  v_actif_total       NUMERIC := 0;
  v_passif_total      NUMERIC := 0;
  v_ca_ht             NUMERIC := 0;
  v_charges_total     NUMERIC := 0;
  v_resultat_net      NUMERIC := 0;
  v_actif_circulant   NUMERIC := 0;
  v_passif_circulant  NUMERIC := 0;
  v_tresorerie_actif  NUMERIC := 0;
  v_tresorerie_passif NUMERIC := 0;
  v_capitaux_propres  NUMERIC := 0;
  v_immo_brutes       NUMERIC := 0;
BEGIN
  -- Validations
  IF p_societe_id IS NULL THEN
    RAISE EXCEPTION 'p_societe_id requis';
  END IF;
  IF p_type NOT IN ('bilan', 'compte_resultat', 'grand_livre', 'balance', 'all') THEN
    RAISE EXCEPTION 'p_type invalide : %', p_type;
  END IF;

  -- 1) Parse dates exercice
  SELECT pe.date_debut, pe.date_fin
    INTO v_date_debut, v_date_fin
    FROM public._parse_exercice_dates(p_exercice) pe;

  -- 2) Agrège par compte (cumulé jusqu'à date_fin pour bilan, période pour CR/GL/balance)
  --    On retient le solde sur la PERIODE pour balance/CR/GL et le solde
  --    CUMULE jusqu'à date_fin pour le bilan. Pour le snapshot 'all', on
  --    stocke les deux vues sous des clés distinctes.
  WITH periode AS (
    SELECT numero_compte,
           COALESCE(MAX(nom_compte), 'Compte ' || numero_compte) AS nom_compte,
           SUM(COALESCE(debit_mur, 0))  AS debit,
           SUM(COALESCE(credit_mur, 0)) AS credit
      FROM public.ecritures_comptables_v2
     WHERE societe_id = p_societe_id
       AND date_ecriture BETWEEN v_date_debut AND v_date_fin
     GROUP BY numero_compte
  ),
  cumule AS (
    SELECT numero_compte,
           COALESCE(MAX(nom_compte), 'Compte ' || numero_compte) AS nom_compte,
           SUM(COALESCE(debit_mur, 0))  AS debit,
           SUM(COALESCE(credit_mur, 0)) AS credit
      FROM public.ecritures_comptables_v2
     WHERE societe_id = p_societe_id
       AND date_ecriture <= v_date_fin
     GROUP BY numero_compte
  )
  SELECT jsonb_build_object(
    'periode', COALESCE((
      SELECT jsonb_object_agg(numero_compte, jsonb_build_object(
        'nom',     nom_compte,
        'debit',   debit,
        'credit',  credit,
        'solde',   debit - credit
      ))
      FROM periode
    ), '{}'::JSONB),
    'cumule', COALESCE((
      SELECT jsonb_object_agg(numero_compte, jsonb_build_object(
        'nom',     nom_compte,
        'debit',   debit,
        'credit',  credit,
        'solde',   debit - credit
      ))
      FROM cumule
    ), '{}'::JSONB)
  )
  INTO v_soldes;

  -- 3) Calcul totaux à partir du cumulé
  --    Convention plan comptable Maurice :
  --      classe 1 = capitaux/passifs (sens créditeur)
  --      classe 2 = immo (sens débiteur, actif)
  --      classe 3 = stocks (actif)
  --      classe 4 = tiers (débit=actif, crédit=passif)
  --      classe 5 = trésorerie (débit=actif, crédit=passif)
  --      classe 6 = charges, classe 7 = produits
  SELECT
    -- Actif = comptes classes 2, 3 (solde D) + 4/5 où solde D
    COALESCE(SUM(
      CASE
        WHEN numero_compte ~ '^[23]' AND (debit - credit) > 0 THEN debit - credit
        WHEN numero_compte ~ '^[45]' AND (debit - credit) > 0 THEN debit - credit
        ELSE 0
      END
    ), 0),
    -- Passif = comptes classe 1 (solde C) + 4/5 où solde C
    COALESCE(SUM(
      CASE
        WHEN numero_compte ~ '^1'   AND (credit - debit) > 0 THEN credit - debit
        WHEN numero_compte ~ '^[45]' AND (credit - debit) > 0 THEN credit - debit
        ELSE 0
      END
    ), 0),
    -- Immo brutes (classe 2)
    COALESCE(SUM(CASE WHEN numero_compte ~ '^2' THEN debit - credit ELSE 0 END), 0),
    -- Trésorerie actif (classe 5, solde D)
    COALESCE(SUM(
      CASE WHEN numero_compte ~ '^5' AND (debit - credit) > 0 THEN debit - credit ELSE 0 END
    ), 0),
    -- Trésorerie passif (classe 5, solde C → découverts)
    COALESCE(SUM(
      CASE WHEN numero_compte ~ '^5' AND (credit - debit) > 0 THEN credit - debit ELSE 0 END
    ), 0),
    -- Actif circulant (classes 3, 4 solde D, 5 solde D)
    COALESCE(SUM(
      CASE
        WHEN numero_compte ~ '^3' THEN debit - credit
        WHEN numero_compte ~ '^[45]' AND (debit - credit) > 0 THEN debit - credit
        ELSE 0
      END
    ), 0),
    -- Passif circulant (classes 4, 5 solde C)
    COALESCE(SUM(
      CASE WHEN numero_compte ~ '^[45]' AND (credit - debit) > 0 THEN credit - debit ELSE 0 END
    ), 0),
    -- Capitaux propres (classe 1)
    COALESCE(SUM(CASE WHEN numero_compte ~ '^1' THEN credit - debit ELSE 0 END), 0)
  INTO v_actif_total, v_passif_total, v_immo_brutes, v_tresorerie_actif,
       v_tresorerie_passif, v_actif_circulant, v_passif_circulant, v_capitaux_propres
  FROM (
    SELECT numero_compte,
           SUM(COALESCE(debit_mur, 0))  AS debit,
           SUM(COALESCE(credit_mur, 0)) AS credit
      FROM public.ecritures_comptables_v2
     WHERE societe_id = p_societe_id
       AND date_ecriture <= v_date_fin
     GROUP BY numero_compte
  ) c;

  -- CA / charges / résultat sur la PERIODE
  SELECT
    COALESCE(SUM(CASE WHEN numero_compte ~ '^7' THEN credit - debit ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN numero_compte ~ '^6' THEN debit - credit ELSE 0 END), 0)
  INTO v_ca_ht, v_charges_total
  FROM (
    SELECT numero_compte,
           SUM(COALESCE(debit_mur, 0))  AS debit,
           SUM(COALESCE(credit_mur, 0)) AS credit
      FROM public.ecritures_comptables_v2
     WHERE societe_id = p_societe_id
       AND date_ecriture BETWEEN v_date_debut AND v_date_fin
       AND numero_compte ~ '^[67]'
     GROUP BY numero_compte
  ) p;

  v_resultat_net := v_ca_ht - v_charges_total;

  v_totaux := jsonb_build_object(
    'actif_total',       v_actif_total,
    'passif_total',      v_passif_total,
    'capitaux_propres',  v_capitaux_propres,
    'immobilisations',   v_immo_brutes,
    'ca_ht',             v_ca_ht,
    'charges_total',     v_charges_total,
    'resultat_net',      v_resultat_net,
    'tresorerie_actif',  v_tresorerie_actif,
    'tresorerie_passif', v_tresorerie_passif
  );

  -- 4) Ratios standards (gérer division par zéro)
  v_ratios := jsonb_build_object(
    'fond_roulement',     v_capitaux_propres - v_immo_brutes,
    'bfr',                v_actif_circulant - v_passif_circulant,
    'tresorerie_nette',   v_tresorerie_actif - v_tresorerie_passif,
    'marge_nette_pct',    CASE WHEN v_ca_ht > 0 THEN ROUND((v_resultat_net / v_ca_ht * 100)::NUMERIC, 2) ELSE NULL END,
    'ratio_endettement',  CASE WHEN v_actif_total > 0 THEN ROUND(((v_actif_total - v_capitaux_propres) / v_actif_total * 100)::NUMERIC, 2) ELSE NULL END,
    'equilibre_bilan',    ABS(v_actif_total - v_passif_total) < 1
  );

  -- 5) Désactive snapshots précédents du même (societe, exercice, type)
  UPDATE public.exercice_snapshots
     SET is_active = false
   WHERE societe_id    = p_societe_id
     AND exercice      = p_exercice
     AND snapshot_type = p_type
     AND is_active     = true;

  -- 6) INSERT nouveau snapshot
  INSERT INTO public.exercice_snapshots (
    societe_id, exercice, snapshot_type, generated_by,
    soldes_json, ratios_json, totaux_json,
    cloture_id, is_active, notes
  ) VALUES (
    p_societe_id, p_exercice, p_type, v_user_id,
    v_soldes, v_ratios, v_totaux,
    p_cloture_id, true, p_notes
  )
  RETURNING id INTO v_snapshot_id;

  RETURN v_snapshot_id;
END;
$$;

COMMENT ON FUNCTION public.generate_exercice_snapshot(UUID, TEXT, TEXT, UUID, TEXT) IS
  'Fige les soldes (par compte), totaux (actif/passif/CA/résultat) et ratios '
  '(BFR, FR, trésorerie nette, marge, endettement) d''un exercice dans '
  'exercice_snapshots. Désactive les snapshots actifs précédents du même '
  '(societe, exercice, type). Retourne l''id du nouveau snapshot. SECURITY DEFINER.';

-- Autoriser l'exécution par les users authentifiés
GRANT EXECUTE ON FUNCTION public.generate_exercice_snapshot(UUID, TEXT, TEXT, UUID, TEXT)
  TO authenticated;

-- ---------------------------------------------------------------------
-- 7) Vérification post-migration
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_table_exists  BOOLEAN;
  v_rpc_exists    BOOLEAN;
  v_nb_policies   INT;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'exercice_snapshots'
  ) INTO v_table_exists;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'generate_exercice_snapshot'
  ) INTO v_rpc_exists;

  SELECT COUNT(*) INTO v_nb_policies
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'exercice_snapshots';

  RAISE NOTICE '[mig 422] exercice_snapshots table : %', v_table_exists;
  RAISE NOTICE '[mig 422] generate_exercice_snapshot RPC : %', v_rpc_exists;
  RAISE NOTICE '[mig 422] policies RLS attachées : %', v_nb_policies;
  RAISE NOTICE '[mig 422] Snapshots immuables prêts — source de vérité pour comparatifs N-1.';
END;
$$;

COMMIT;
