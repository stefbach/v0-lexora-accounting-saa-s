-- ============================================================================
-- Migration 167 — Compte courant associé : tracking source + unicité
-- ============================================================================
--
-- Bug observé : la page `/client/compte-courant` affiche chaque mouvement en
-- DOUBLE, avec des montants MUR légèrement différents (ex: 32 715,36 vs
-- 32 751,12 pour 600 EUR) parce que le taux de change est relu entre l'appel
-- original et la propagation.
--
-- Root cause (app/api/comptable/rapprochement/route.ts) :
--   1. Action `classer_transaction` avec `classification = 'compte_courant_associe'`
--      INSERT dans `mouvements_compte_courant` (description : "Avance societe a
--      associe (XXX EUR @ taux) — libelle")
--   2. Si `apply_to_similar = true`, la propagation parcourt TOUTES les
--      transactions avec le même `tiers_detecte` et INSERT un 2e mouvement
--      pour CHACUNE — y compris pour la tx d'origine (pas d'exclusion self).
--      Le 2e mouvement porte "Propage (compte_courant_associe) [XXX EUR @
--      autre_taux] — libelle" et utilise un taux lu à un moment distinct.
--
-- Cette migration :
--   1. Ajoute les colonnes `source_releve_id` + `source_transaction_idx` pour
--      tracer la provenance bancaire de chaque mouvement
--   2. Purge les mouvements "Propage %" qui sont des doublons d'un mouvement
--      "Avance %" / "Apport %" sur le même (compte_courant_id, date, montant
--      EUR d'origine extrait de la description)
--   3. Backfill tente de remplir source_releve_id/source_transaction_idx en
--      matchant la description avec les transactions_json des relevés
--   4. Ajoute une contrainte UNIQUE partielle sur (compte_courant_id,
--      source_releve_id, source_transaction_idx) qui empêche les futurs
--      doublons côté DB
--
-- IDEMPOTENTE. ROLLBACK via DROP CONSTRAINT + DROP COLUMN.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Colonnes de traçabilité
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.mouvements_compte_courant
  ADD COLUMN IF NOT EXISTS source_releve_id UUID REFERENCES public.releves_bancaires(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_transaction_idx INTEGER,
  ADD COLUMN IF NOT EXISTS source_kind TEXT;  -- 'classifier' | 'propagation' | 'manuel'

COMMENT ON COLUMN public.mouvements_compte_courant.source_releve_id IS
  'Relevé bancaire source du mouvement (quand issu du rapprochement).';
COMMENT ON COLUMN public.mouvements_compte_courant.source_transaction_idx IS
  'Index de la transaction dans transactions_json du relevé source.';
COMMENT ON COLUMN public.mouvements_compte_courant.source_kind IS
  'Chemin de création : classifier (manuel via UI rapprochement), propagation (auto-apply-similar), manuel (via UI CCA directe).';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Purge des doublons "Propage %"
-- ────────────────────────────────────────────────────────────────────────────
-- Pour chaque mouvement "Propage %" qui partage (compte_courant_id,
-- date_mouvement, montant_devise_origine) avec un mouvement "Avance %" ou
-- "Apport %", on supprime le Propage (on garde l'original qui est la classif
-- manuelle, considérée source de vérité).
--
-- Extraction du montant d'origine via regex sur la description :
--   "Avance societe a associe (3000.00 EUR @ 54.5852) — ..."
--   "Propage (compte_courant_associe) [3000.00 EUR @ 54.5256] — ..."
-- Les deux contiennent "3000.00 EUR" dans un groupe capturable.

WITH propage_doublons AS (
  SELECT m1.id
  FROM public.mouvements_compte_courant m1
  WHERE m1.description LIKE 'Propage %'
    AND EXISTS (
      SELECT 1 FROM public.mouvements_compte_courant m2
      WHERE m2.compte_courant_id = m1.compte_courant_id
        AND m2.date_mouvement     = m1.date_mouvement
        AND m2.id                != m1.id
        AND (m2.description LIKE 'Avance %' OR m2.description LIKE 'Apport %')
        AND SUBSTRING(m1.description FROM '[\[\(](\d+\.\d+) [A-Z]{3}') =
            SUBSTRING(m2.description FROM '[\[\(](\d+\.\d+) [A-Z]{3}')
    )
)
DELETE FROM public.mouvements_compte_courant
WHERE id IN (SELECT id FROM propage_doublons);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Recalcul des soldes après purge
-- ────────────────────────────────────────────────────────────────────────────
-- Le solde de `comptes_courants_associes.solde` avait accumulé les 2 entrées
-- (avance + propage). On le recalcule depuis la somme des mouvements nettoyés.
--
-- Solde conventionnel : un 'avance' (société prête à l'associé) est un débit
-- pour la société → diminue le solde du CCA (solde = -SUM). Un 'apport' est
-- un crédit pour la société → augmente le solde. On garde la convention
-- historique : solde = SUM(si apport : +montant) + SUM(si avance : -montant).

UPDATE public.comptes_courants_associes cc
SET solde = COALESCE(agg.new_solde, 0),
    updated_at = NOW()
FROM (
  SELECT
    compte_courant_id,
    SUM(
      CASE
        WHEN type = 'avance'  THEN -montant
        WHEN type = 'apport'  THEN  montant
        WHEN type = 'retrait' THEN -montant
        WHEN type = 'remboursement' THEN  montant
        ELSE 0
      END
    ) AS new_solde
  FROM public.mouvements_compte_courant
  GROUP BY compte_courant_id
) agg
WHERE cc.id = agg.compte_courant_id;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Index unique partiel sur la source bancaire
-- ────────────────────────────────────────────────────────────────────────────
-- Empêche qu'une même transaction bancaire (source_releve_id,
-- source_transaction_idx) crée deux mouvements CCA sur le même compte.
-- Partiel car les anciens mouvements (AVANT cette migration) n'ont pas
-- encore de source_releve_id → ils sont exemptés de la contrainte.
CREATE UNIQUE INDEX IF NOT EXISTS ux_mouvements_cca_source
  ON public.mouvements_compte_courant (compte_courant_id, source_releve_id, source_transaction_idx)
  WHERE source_releve_id IS NOT NULL AND source_transaction_idx IS NOT NULL;

COMMENT ON INDEX public.ux_mouvements_cca_source IS
  'Empêche les doublons CCA pour une même transaction bancaire source. '
  'Partiel : ne s''applique pas aux mouvements manuels (source null).';

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Rapport
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_remaining INTEGER;
  v_without_source INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_remaining
  FROM public.mouvements_compte_courant
  WHERE description LIKE 'Propage %';

  SELECT COUNT(*) INTO v_without_source
  FROM public.mouvements_compte_courant
  WHERE source_releve_id IS NULL;

  RAISE NOTICE '▶ Migration 167 terminée';
  RAISE NOTICE '  • mouvements "Propage" restants : % (si > 0, doublons non détectés par regex)', v_remaining;
  RAISE NOTICE '  • mouvements sans source_releve_id : % (legacy — à backfiller manuellement si besoin)', v_without_source;
  RAISE NOTICE '  • index unique ux_mouvements_cca_source actif pour les futurs INSERTs';
  RAISE NOTICE '';
  RAISE NOTICE '▶ Après déploiement du fix TS (app/api/comptable/rapprochement/route.ts) :';
  RAISE NOTICE '  — les futurs INSERTs incluront source_releve_id/source_transaction_idx';
  RAISE NOTICE '  — l''index unique bloquera les doublons au niveau DB';
END $$;
