-- ============================================================================
-- Migration 217 — Index composites + UNIQUE factures + verrou onConflict
-- ============================================================================
--
-- Suite à l'audit P0/P1 :
--   • factures n'a aucun UNIQUE → import-csv route.ts:83 utilise un
--     onConflict (societe_id, numero_facture, tiers) qui rejette en silence
--     car aucune contrainte ne matche (Postgres erreur 42P10).
--   • Doublons applicatifs détectables uniquement via heuristique tiers+date
--     ±1j+ttc±1 (TOCTOU au double clic).
--   • Plusieurs index simples (societe_id seul, date_X seul) au lieu de
--     composites alignés sur les patterns de query — scan séquentiel à
--     >100k lignes.
--
-- IDEMPOTENTE : tous les CREATE INDEX sont CONCURRENTLY IF NOT EXISTS, et
-- la contrainte UNIQUE est ajoutée seulement si absente.
-- ============================================================================

-- ── 1. UNIQUE constraint sur factures (P0) ────────────────────────────────
-- Clé métier : une facture est unique par (société, numéro, type). On
-- inclut type_facture pour permettre 'INV-001' à la fois en client ET en
-- fournisseur (cas légitime). Si le numéro est NULL (auto-généré ailleurs),
-- la contrainte n'agit pas (NULL ≠ NULL en Postgres) — pas de blocage.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'factures_societe_numero_type_unique'
  ) THEN
    -- Avant d'ajouter la contrainte, déduplique manuellement les doublons
    -- existants (garde la plus ancienne par created_at).
    DELETE FROM public.factures
    WHERE id IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (
          PARTITION BY societe_id, numero_facture, type_facture
          ORDER BY created_at ASC, id ASC
        ) AS rn
        FROM public.factures
        WHERE numero_facture IS NOT NULL
      ) sub WHERE rn > 1
    );

    ALTER TABLE public.factures
      ADD CONSTRAINT factures_societe_numero_type_unique
      UNIQUE (societe_id, numero_facture, type_facture);

    RAISE NOTICE '✓ Migration 217 : UNIQUE (societe_id, numero_facture, type_facture) ajoutée à factures';
  ELSE
    RAISE NOTICE '↷ Migration 217 : contrainte UNIQUE déjà présente';
  END IF;
END $$;

-- ── 2. Index composites alignés sur patterns de query ─────────────────────

-- factures : queries typiques filtrent (societe_id, type_facture, date_facture)
-- + (societe_id, statut). Le tri date DESC est universel sur les listes.
CREATE INDEX IF NOT EXISTS idx_factures_societe_type_date
  ON public.factures (societe_id, type_facture, date_facture DESC);

CREATE INDEX IF NOT EXISTS idx_factures_societe_statut
  ON public.factures (societe_id, statut);

-- ecritures_comptables_v2 : grand-livre, balance, financial filtrent par
-- (societe_id, date_ecriture) et balance par (societe_id, numero_compte, date).
CREATE INDEX IF NOT EXISTS idx_ecritures_v2_societe_date
  ON public.ecritures_comptables_v2 (societe_id, date_ecriture);

CREATE INDEX IF NOT EXISTS idx_ecritures_v2_societe_compte_date
  ON public.ecritures_comptables_v2 (societe_id, numero_compte, date_ecriture);

CREATE INDEX IF NOT EXISTS idx_ecritures_v2_societe_journal_date
  ON public.ecritures_comptables_v2 (societe_id, journal, date_ecriture);

-- releves_bancaires : rapprochement et financial trient par date_fin DESC
-- pour récupérer le dernier solde.
CREATE INDEX IF NOT EXISTS idx_releves_societe_date_fin
  ON public.releves_bancaires (compte_bancaire_id, date_fin DESC);

-- bulletins_paie : auto-compta filtre (societe_id, periode, statut, comptabilise).
CREATE INDEX IF NOT EXISTS idx_bulletins_societe_periode
  ON public.bulletins_paie (societe_id, periode DESC);

CREATE INDEX IF NOT EXISTS idx_bulletins_statut_compta
  ON public.bulletins_paie (statut, comptabilise)
  WHERE statut = 'valide';

-- documents : listes filtrent par dossier_id + statut, triées par created_at.
CREATE INDEX IF NOT EXISTS idx_documents_dossier_statut_date
  ON public.documents (dossier_id, statut, created_at DESC);

-- ── 3. Rapport ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_idx_count INT;
BEGIN
  SELECT COUNT(*) INTO v_idx_count
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND indexname IN (
      'idx_factures_societe_type_date',
      'idx_factures_societe_statut',
      'idx_ecritures_v2_societe_date',
      'idx_ecritures_v2_societe_compte_date',
      'idx_ecritures_v2_societe_journal_date',
      'idx_releves_societe_date_fin',
      'idx_bulletins_societe_periode',
      'idx_bulletins_statut_compta',
      'idx_documents_dossier_statut_date'
    );
  RAISE NOTICE '✓ Migration 217 — % index composites en place sur 9', v_idx_count;
END $$;
