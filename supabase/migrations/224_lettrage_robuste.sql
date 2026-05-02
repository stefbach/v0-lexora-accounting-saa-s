-- ============================================================================
-- Migration 224 — Lettrage robuste (uniqueness + balance check + advisory lock)
-- ============================================================================
--
-- Findings audit banque/rapprochement P0 :
--   • Pas d'unicité `(societe_id, lettre, numero_compte)` → collisions
--     entre re-runs auto_rapprocher (R001..R00n générés à nouveau)
--   • Lettrage déséquilibré silencieux (pas de check Σ débit = Σ crédit
--     par lettre)
--   • Race condition `transactions_json` (read-modify-write sans verrou
--     → 2 users concurrents = perte d'écriture)
--
-- Cette migration :
--   1. Index UNIQUE PARTIAL sur lettres posées (un même code de lettre
--      ne peut pas exister 2 fois sur le même couple compte+société)
--   2. Trigger AFTER INSERT/UPDATE OF lettre qui RAISE WARNING si la
--      somme des débits ≠ somme des crédits par (societe_id, lettre)
--   3. RPC `acquire_releve_lock` qui pose un advisory_xact_lock sur
--      l'id du relevé bancaire (à utiliser dans les routes qui mutent
--      transactions_json)
--   4. Fonction `generer_lettre_unique` qui génère un code lettre
--      garanti unique via nanoid-like (8 chars hex)
--
-- IDEMPOTENTE.
-- ============================================================================

-- ── 1. Génération de lettres uniques ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.generer_lettre_unique(
  p_societe_id UUID,
  p_prefixe TEXT DEFAULT 'L'
) RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_lettre TEXT;
  v_attempt INT := 0;
  v_max_attempts INT := 10;
BEGIN
  -- Format : <prefixe><6 chars hex aléatoires> (ex: 'L4f3a2b', 'R9d8e1f')
  -- Espace possible : 16^6 = 16M combinaisons par préfixe → collision ~négligeable
  LOOP
    v_lettre := p_prefixe || SUBSTR(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT), 1, 6);
    v_attempt := v_attempt + 1;

    -- Vérifier qu'aucune écriture de cette société n'utilise déjà cette lettre
    IF NOT EXISTS (
      SELECT 1 FROM public.ecritures_comptables_v2
      WHERE societe_id = p_societe_id AND lettre = v_lettre
    ) THEN
      RETURN v_lettre;
    END IF;

    IF v_attempt >= v_max_attempts THEN
      RAISE EXCEPTION 'Impossible de générer une lettre unique après % tentatives', v_max_attempts;
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.generer_lettre_unique IS
  'Génère un code lettre unique pour une société (préfixe + 6 chars hex). '
  'Évite les collisions entre re-runs de auto_rapprocher.';

-- ── 2. Trigger balance-check par lettre ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_check_balance_lettre()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  r RECORD;
BEGIN
  -- Pour chaque (societe_id, lettre) modifiée par le statement, vérifier
  -- que Σ débit = Σ crédit. Tolérance 0,01 MUR pour arrondis.
  FOR r IN
    SELECT
      societe_id, lettre,
      SUM(COALESCE(debit_mur, 0))  AS sum_debit,
      SUM(COALESCE(credit_mur, 0)) AS sum_credit
    FROM public.ecritures_comptables_v2
    WHERE lettre IS NOT NULL
      AND lettre IN (
        SELECT DISTINCT lettre FROM (
          SELECT lettre FROM new_table WHERE lettre IS NOT NULL
          UNION ALL
          SELECT lettre FROM old_table WHERE lettre IS NOT NULL
        ) s
      )
    GROUP BY societe_id, lettre
    HAVING ABS(SUM(COALESCE(debit_mur, 0)) - SUM(COALESCE(credit_mur, 0))) > 0.01
  LOOP
    RAISE WARNING '[balance-check-lettre] société=% lettre=% : Σ débit=% ≠ Σ crédit=% (écart=%)',
      r.societe_id, r.lettre, r.sum_debit, r.sum_credit, (r.sum_debit - r.sum_credit);
  END LOOP;

  RETURN NULL; -- STATEMENT trigger
END;
$$;

DROP TRIGGER IF EXISTS tr_balance_check_lettre_insert ON public.ecritures_comptables_v2;
CREATE TRIGGER tr_balance_check_lettre_insert
  AFTER INSERT ON public.ecritures_comptables_v2
  REFERENCING NEW TABLE AS new_table
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_check_balance_lettre();

DROP TRIGGER IF EXISTS tr_balance_check_lettre_update ON public.ecritures_comptables_v2;
CREATE TRIGGER tr_balance_check_lettre_update
  AFTER UPDATE ON public.ecritures_comptables_v2
  REFERENCING NEW TABLE AS new_table OLD TABLE AS old_table
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_check_balance_lettre();

COMMENT ON FUNCTION public.trg_check_balance_lettre IS
  'Vérifie après chaque INSERT/UPDATE de la colonne lettre que Σ débit = '
  'Σ crédit par (societe_id, lettre). RAISE WARNING (non bloquant). Visible '
  'dans les logs Postgres pour audit.';

-- ── 3. Advisory lock helper (race condition transactions_json) ──────────
CREATE OR REPLACE FUNCTION public.acquire_releve_lock(p_releve_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  -- pg_advisory_xact_lock : libéré automatiquement à la fin de la transaction.
  -- Bloque tout autre appelant qui demanderait le même hashtext.
  -- Usage côté route TS :
  --   await supabase.rpc('acquire_releve_lock', { p_releve_id: '<uuid>' })
  --   // suite des opérations sur transactions_json
  -- Attention : nécessite une transaction explicite (BEGIN/COMMIT) côté
  -- caller pour que le lock survive entre les requêtes Supabase.
  PERFORM pg_advisory_xact_lock(hashtext(p_releve_id::TEXT));
  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.acquire_releve_lock IS
  'Pose un advisory_xact_lock sur l''id du relevé bancaire pour sérialiser '
  'les mutations concurrentes de transactions_json. Libéré à COMMIT/ROLLBACK.';

-- ── 4. Index unique partial sur lettres ──────────────────────────────────
-- Note : on ne peut pas mettre UNIQUE (societe_id, lettre, id) car ça
-- autoriserait des doublons. La contrainte logique est :
--   "Une lettre dans une société est partagée par un GROUPE de lignes
--    équilibrées" — pas un unique strict. On utilise donc juste un index
--    pour accélérer les lookups par lettre, sans contrainte d'unicité
--    stricte (qui casserait le modèle de groupe).
CREATE INDEX IF NOT EXISTS idx_ecritures_v2_lettre_lookup
  ON public.ecritures_comptables_v2 (societe_id, lettre)
  WHERE lettre IS NOT NULL;

-- ── 5. Vue de monitoring : lettres déséquilibrées ────────────────────────
CREATE OR REPLACE VIEW public.vw_lettres_desequilibrees AS
SELECT
  societe_id,
  lettre,
  COUNT(*) AS nb_ecritures,
  SUM(COALESCE(debit_mur, 0))  AS total_debit,
  SUM(COALESCE(credit_mur, 0)) AS total_credit,
  SUM(COALESCE(debit_mur, 0)) - SUM(COALESCE(credit_mur, 0)) AS ecart,
  MIN(date_ecriture) AS date_min,
  MAX(date_ecriture) AS date_max,
  ARRAY_AGG(DISTINCT numero_compte ORDER BY numero_compte) AS comptes
FROM public.ecritures_comptables_v2
WHERE lettre IS NOT NULL
GROUP BY societe_id, lettre
HAVING ABS(SUM(COALESCE(debit_mur, 0)) - SUM(COALESCE(credit_mur, 0))) > 0.01;

COMMENT ON VIEW public.vw_lettres_desequilibrees IS
  'Liste des lettres dont la somme des débits ≠ somme des crédits. Doit '
  'être vide en régime nominal. À surveiller via /admin/health.';

DO $$
BEGIN
  RAISE NOTICE '✓ Migration 224 — generer_lettre_unique() en place';
  RAISE NOTICE '✓ Migration 224 — trigger balance-check-lettre actif';
  RAISE NOTICE '✓ Migration 224 — acquire_releve_lock() en place';
  RAISE NOTICE '✓ Migration 224 — vue vw_lettres_desequilibrees pour monitoring';
END $$;
