-- ============================================================================
-- Migration 231 — Purge des doublons CCA (compte courant associé)
-- ============================================================================
--
-- Bug observé en prod (signalé par un client) :
--   1. User crée une avance/remboursement via /client/compte-courant
--      → écritures comptables OD ou BNQ créées (628/455, 455/512, etc.)
--      → mouvement_compte_courant créé
--      → MAIS la transaction bancaire correspondante reste statut=non_identifie
--   2. User va dans /client/rapprochement, voit la transaction non classée,
--      la classifie en compte_courant_associe ou remboursement_associe
--      → 2e jeu d'écritures créées (DOUBLON)
--      → 2e mouvement_compte_courant créé (DOUBLON)
--      → solde du CCA gonflé du double
--
-- Le code applicatif a été corrigé (commit 8773aa2) pour empêcher les futurs
-- doublons. Cette migration nettoie les doublons HISTORIQUES.
--
-- Stratégie :
--   PASSE 1 : Purge des doublons d'ecritures CCA. Critère : même societe_id,
--             date_ecriture, journal, numero_compte, debit_mur, credit_mur,
--             libelle. On garde la plus ancienne (created_at ASC). Préserve
--             le lettrage : si une copie est lettrée et l'autre non, on
--             garde la lettrée.
--             Périmètre : journal IN ('OD', 'BNQ') ET
--             numero_compte IN ('455', '467', '628', '512', '108', '425').
--             (On NE TOUCHE PAS aux écritures 401/411/641/etc. — elles ont
--              leurs propres dédup ailleurs.)
--   PASSE 2 : Purge des doublons mouvements_compte_courant. Critère : même
--             compte_courant_id, type, montant, date_mouvement, description.
--             Garde le plus ancien.
--   PASSE 3 : Recalcul du solde de chaque compte_courant_associe à partir
--             des mouvements restants (après purge).
--
-- IDEMPOTENT.
-- ============================================================================

-- ─── PASSE 1 : Doublons d'écritures CCA ─────────────────────────────────────
WITH dedup AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY societe_id, date_ecriture, journal, numero_compte,
                   COALESCE(debit_mur, 0), COALESCE(credit_mur, 0),
                   COALESCE(libelle, '')
      ORDER BY
        -- Préserver le lettrage : si une copie est lettrée, la garder
        (CASE WHEN lettre IS NOT NULL THEN 0 ELSE 1 END),
        -- Préserver le lien facture : si une copie a un facture_id, la garder
        (CASE WHEN facture_id IS NOT NULL THEN 0 ELSE 1 END),
        created_at ASC,
        id ASC
    ) AS rn
  FROM public.ecritures_comptables_v2
  WHERE journal IN ('OD', 'BNQ')
    AND numero_compte IN ('455', '467', '628', '512', '108', '425')
)
DELETE FROM public.ecritures_comptables_v2
WHERE id IN (SELECT id FROM dedup WHERE rn > 1);

-- ─── PASSE 2a : Doublons EXACTS mouvements_compte_courant ──────────────────
-- (même description) — cas où l'utilisateur a cliqué 2 fois sur "avance".
WITH dedup AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY compte_courant_id, type,
                   ROUND(COALESCE(montant, 0)::numeric, 2),
                   date_mouvement,
                   COALESCE(description, '')
      ORDER BY
        -- Préserver les mouvements liés à une transaction bancaire (source_releve_id non null)
        (CASE WHEN source_releve_id IS NOT NULL THEN 0 ELSE 1 END),
        (CASE WHEN facture_id IS NOT NULL THEN 0 ELSE 1 END),
        (CASE WHEN lettre IS NOT NULL THEN 0 ELSE 1 END),
        created_at ASC,
        id ASC
    ) AS rn
  FROM public.mouvements_compte_courant
)
DELETE FROM public.mouvements_compte_courant
WHERE id IN (SELECT id FROM dedup WHERE rn > 1);

-- ─── PASSE 2b : Doublons FONCTIONNELS mouvements_compte_courant ────────────
-- Cas du bug signalé : description différente mais même opération.
--   • Mouvement A (page /client/compte-courant) : description = "Avance ${nom} — ..."
--   • Mouvement B (rapprochement classer_transaction) : description = "Avance societe a associe (XXX EUR @ taux) — ..."
-- Pour le même (compte_courant_id, type, ROUND(ABS(montant)), date_mouvement)
-- avec deux entrées différentes, on a quasi certainement un doublon.
-- On garde l'entrée avec source_releve_id (issue de la classification
-- bancaire = source de vérité) ; sinon la plus ancienne.
WITH dedup AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY compte_courant_id, type,
                   ROUND(ABS(COALESCE(montant, 0))::numeric, 2),
                   date_mouvement
      ORDER BY
        (CASE WHEN source_releve_id IS NOT NULL THEN 0 ELSE 1 END),
        (CASE WHEN facture_id IS NOT NULL THEN 0 ELSE 1 END),
        (CASE WHEN lettre IS NOT NULL THEN 0 ELSE 1 END),
        created_at ASC,
        id ASC
    ) AS rn
  FROM public.mouvements_compte_courant
)
DELETE FROM public.mouvements_compte_courant
WHERE id IN (SELECT id FROM dedup WHERE rn > 1);

-- ─── PASSE 3 : Recalcul du solde des comptes_courants_associes ──────────────
-- Convention métier (cohérente avec /api/comptable/compte-courant/route.ts
-- POST handler en date du fix 8773aa2) :
--   • avance        : associé paye une dépense de la société → société doit
--                     à l'associé. montant stocké POSITIF, solde += montant.
--   • remboursement : société rembourse l'associé. montant stocké NÉGATIF
--                     (-montantNum), solde -= montantNum équivaut à
--                     solde += montant.
--   • apport        : associé apporte des fonds. montant POSITIF, solde +=.
--   • retrait       : associé retire des fonds. Convention historique
--                     ambiguë (cf mig 203) → on garde le signe stocké.
--
-- Donc dans tous les cas : solde = SUM(montant). C'est cohérent avec la
-- mise à jour incrémentale du POST handler (newSolde = solde + montant
-- pour avance ET remboursement, puisque remboursement.montant est négatif).
--
-- ⚠️ ATTENTION : la migration 203 utilisait une CASE différente pour les
-- types historiques (apport/retrait). Si vos données avaient été mal
-- signées, cette PASSE 3 va les "réparer" selon la convention actuelle.
-- Si vous avez un doute, exécutez d'abord les PASSES 1 et 2 (dedup)
-- puis comparez les soldes avant de lancer la PASSE 3.
UPDATE public.comptes_courants_associes cc
SET solde = COALESCE(agg.new_solde, 0),
    updated_at = NOW()
FROM (
  SELECT
    compte_courant_id,
    SUM(COALESCE(montant, 0)) AS new_solde
  FROM public.mouvements_compte_courant
  GROUP BY compte_courant_id
) agg
WHERE cc.id = agg.compte_courant_id;

-- Pour les CCA sans aucun mouvement restant, mettre solde à 0.
UPDATE public.comptes_courants_associes cc
SET solde = 0,
    updated_at = NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM public.mouvements_compte_courant m
  WHERE m.compte_courant_id = cc.id
)
AND cc.solde IS DISTINCT FROM 0;

-- ─── Rapport ────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_ecr_remaining INTEGER;
  v_mvt_remaining INTEGER;
  v_cca_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_ecr_remaining
  FROM public.ecritures_comptables_v2
  WHERE journal IN ('OD', 'BNQ')
    AND numero_compte IN ('455', '467', '628', '512', '108', '425');

  SELECT COUNT(*) INTO v_mvt_remaining
  FROM public.mouvements_compte_courant;

  SELECT COUNT(*) INTO v_cca_count
  FROM public.comptes_courants_associes;

  RAISE NOTICE '▶ Migration 231 — Purge doublons CCA terminée';
  RAISE NOTICE '  • Écritures CCA restantes (journal OD/BNQ, comptes 455/467/628/512/108/425) : %', v_ecr_remaining;
  RAISE NOTICE '  • Mouvements CCA restants : %', v_mvt_remaining;
  RAISE NOTICE '  • Comptes courants associés : % (soldes recalculés)', v_cca_count;
  RAISE NOTICE '';
  RAISE NOTICE '▶ Le fix applicatif (commit 8773aa2) empêche les futurs doublons :';
  RAISE NOTICE '  — /api/comptable/compte-courant marque la tx bancaire rapprochée';
  RAISE NOTICE '  — /api/comptable/rapprochement classer_transaction refuse si déjà CCA';
END $$;
